import streamlit as st
import geopandas as gpd
import pandas as pd
import plotly.graph_objects as go
from pathlib import Path
import numpy as np

st.set_page_config(page_title="Subnational HDI Explorer", layout="wide")

# File paths
geojson_original_path = Path(__file__).parent / "data" / "geojson" / "geoBoundariesCGAZ_ADM1.geojson"
#geojson_simplified_path = Path(__file__).parent / "data" / "geojson" / "geoBoundariesCGAZ_ADM1_simplified_5km.geojson"
#geojson_shdi_association_path = Path(__file__).parent / "data" / "processed" / "geojson_shdi.geojson"

geojson = Path(__file__).parent / "data" / "geojson"  / "gdl_regons_simplified_5km.geojson"
shdi_processed_path = Path(__file__).parent / "data" / "processed" / "subnational_hdi_processed.csv"

# Use simplified GeoJSON if available, otherwise use original
#geojson_path = geojson_simplified_path if geojson_simplified_path.exists() else geojson_original_path

# Use associated geojson data
geojson_path = geojson

# Load and cache GeoJSON
@st.cache_data
def load_geojson():
    """Load GeoJSON boundaries once."""
    gdf = gpd.read_file(geojson_path)
    
    # Simplify if using original file
    if geojson_path == geojson_original_path:
        gdf['geometry'] = gdf['geometry'].simplify(tolerance=0.05, preserve_topology=True)
    
    return gdf

gdf = load_geojson() if geojson_path.exists() else None


# Load shdi data
@st.cache_data
def load_shdi_data():
    """Load SHDI data once."""
    return pd.read_csv(shdi_processed_path)

shdi = load_shdi_data()

# Get available years from data
available_years = sorted(shdi["year"].unique())
min_year = int(available_years[0])
max_year = int(available_years[-1])

# Sidebar mode selection
st.sidebar.header("View Mode")
view_mode = st.sidebar.radio(
    "Select Mode",
    ["HDI Overview", "Bottleneck Overview"],
    index=0
)

# HDI Overview options
if view_mode == "HDI Overview":
    st.sidebar.subheader("HDI Overview Options")
    scale_mode = st.sidebar.radio(
        "Color Scale",
        ["Absolute", "Range"],
        index=0,
        help="Absolute: 0 to 1 scale. Range: min to max of actual data values."
    )
elif view_mode == "Bottleneck Overview":
    st.sidebar.info("Bottleneck overview will be available in a future update.")

@st.cache_data
def get_geojson_data(_gdf):
    """Convert GeoDataFrame to GeoJSON format."""
    return _gdf.__geo_interface__

@st.cache_data
def get_year_data(gdlcodes_tuple, year, _data_hash):
    """Get HDI values for all regions for a specific year using vectorized operations."""
    _shdi_df = load_shdi_data()
    
    # Filter data for the selected year
    year_data = _shdi_df[_shdi_df['year'] == year].set_index('gdlcode')
    
    # Create lookup Series for fast access
    shdi_series = year_data['shdi']
    
    # Map gdlcodes to HDI values
    return [shdi_series.get(gdlcode, -1) for gdlcode in gdlcodes_tuple]

@st.cache_data
def get_region_timeseries(gdlcode, _data_hash):
    """Get time series data for a specific region."""
    _shdi_df = load_shdi_data()
    
    # Filter data for the region
    region_data = _shdi_df[_shdi_df['gdlcode'] == gdlcode].copy()
    
    # Sort by year
    region_data = region_data.sort_values('year')
    
    return region_data

def create_component_evolution_chart(region_data):
    """Create a line chart showing HDI component evolution with bottleneck background shading."""
    if region_data.empty:
        return None
    
    # Extract data
    years = region_data['year'].values
    health = region_data['healthindex'].values
    education = region_data['edindex'].values
    income = region_data['incindex'].values
    hdi = region_data['shdi'].values
    
    # Determine bottleneck for each year (component with lowest value)
    bottlenecks = []
    for _, row in region_data.iterrows():
        components = {
            'health': row.get('healthindex', np.nan),
            'education': row.get('edindex', np.nan),
            'income': row.get('incindex', np.nan)
        }
        # Remove NaN values
        valid_components = {k: v for k, v in components.items() if pd.notna(v)}
        if valid_components:
            bottleneck = min(valid_components, key=valid_components.get)
        else:
            bottleneck = None
        bottlenecks.append(bottleneck)
    
    # Create figure
    fig = go.Figure()
    
    # Add background shading for each time period based on bottleneck
    # Color mapping: health=red, education=blue, income=green
    color_map = {
        'health': 'rgba(220, 20, 60, 0.15)',      # Light red
        'education': 'rgba(30, 144, 255, 0.15)',  # Light blue
        'income': 'rgba(34, 139, 34, 0.15)'      # Light green
    }
    
    # Create shaded rectangles for each year period
    # Use midpoints between years for smoother transitions
    for i in range(len(years)):
        if bottlenecks[i] and bottlenecks[i] in color_map:
            # Determine x boundaries for this year
            if i == 0:
                x0 = years[i] - 0.5
                x1 = (years[i] + years[i+1]) / 2 if len(years) > 1 else years[i] + 0.5
            elif i == len(years) - 1:
                x0 = (years[i-1] + years[i]) / 2
                x1 = years[i] + 0.5
            else:
                x0 = (years[i-1] + years[i]) / 2
                x1 = (years[i] + years[i+1]) / 2
            
            fig.add_shape(
                type="rect",
                x0=x0,
                y0=0,
                x1=x1,
                y1=1,
                fillcolor=color_map[bottlenecks[i]],
                layer="below",
                line_width=0,
            )
    
    # Add lines for each component
    fig.add_trace(go.Scatter(
        x=years,
        y=health,
        mode='lines+markers',
        name='Health',
        line=dict(color='rgb(220, 20, 60)', width=2),
        marker=dict(size=4)
    ))
    
    fig.add_trace(go.Scatter(
        x=years,
        y=education,
        mode='lines+markers',
        name='Education',
        line=dict(color='rgb(30, 144, 255)', width=2),
        marker=dict(size=4)
    ))
    
    fig.add_trace(go.Scatter(
        x=years,
        y=income,
        mode='lines+markers',
        name='Income',
        line=dict(color='rgb(34, 139, 34)', width=2),
        marker=dict(size=4)
    ))
    
    fig.add_trace(go.Scatter(
        x=years,
        y=hdi,
        mode='lines+markers',
        name='HDI',
        line=dict(color='rgb(128, 128, 128)', width=2, dash='dash'),
        marker=dict(size=4)
    ))
    
    # Update layout
    fig.update_layout(
        xaxis_title='Year',
        yaxis_title='Index Value',
        yaxis=dict(range=[0, 1]),
        hovermode='x unified',
        height=400,
        margin=dict(l=40, r=20, t=20, b=40),
        legend=dict(
            orientation="h",
            yanchor="bottom",
            y=1.02,
            xanchor="right",
            x=1
        )
    )
    
    return fig


# Display header
st.header("Subnational HDI Explorer")

# Initialize selected_year (will be updated by slider below map)
if "selected_year" not in st.session_state:
    st.session_state.selected_year = max_year

# Initialize selected region
if "selected_region_index" not in st.session_state:
    st.session_state.selected_region_index = None

# Create map
if gdf is not None:
    if view_mode == "HDI Overview":
        geojson_data = get_geojson_data(gdf)
        
        # Get gdlcodes once
        gdlcodes = gdf["gdlcode"].values
        
        # Get HDI values for selected year (cached per year)
        # Use dataframe length as hash to track data changes
        data_hash = len(shdi)
        hdi_values = get_year_data(tuple(gdlcodes), st.session_state.selected_year, data_hash)
        
        # Determine color scale range
        if scale_mode == "Range":
            # Filter out -1 values and get min/max
            valid_values = [v for v in hdi_values if v != -1]
            if valid_values:
                zmin = min(valid_values)
                zmax = max(valid_values)
            else:
                zmin = 0
                zmax = 1
        else:  # Absolute
            zmin = 0
            zmax = 1
        
        # Replace -1 with a value below zmin for white coloring
        # Calculate missing_value so it normalizes to ~0.0 (white) and zmin normalizes to ~0.02 (red start)
        if zmax > zmin:
            # To get zmin -> 0.02 after normalization: k/(1+k) = 0.02, so k ≈ 0.0204
            k = 0.0204
            missing_value = zmin - k * (zmax - zmin)
        else:
            missing_value = -0.1
        
        hdi_values_display = [missing_value if v == -1 else v for v in hdi_values]
        
        # Adjust zmin to include missing value for proper normalization
        display_zmin = missing_value
        display_zmax = zmax
        
        # Define red-to-green colorscale with white for missing data
        # Normalization: missing_value -> 0.0 (white), zmin -> ~0.02 (red), zmax -> 1.0 (green)
        colorscale = [
            [0.0, 'rgb(255, 255, 255)'],    # White (missing data)
            [0.01, 'rgb(255, 255, 255)'],   # White (smooth transition)
            [0.02, 'rgb(220, 20, 60)'],     # Red (low HDI starts)
            [0.5, 'rgb(255, 200, 0)'],      # Yellow (medium HDI)
            [1.0, 'rgb(34, 139, 34)']       # Green (high HDI)
        ]
        
        # Create choropleth map with customdata for region identification
        # Convert index to list for customdata
        region_indices = gdf.index.tolist()
        
        fig = go.Figure(go.Choroplethmapbox(
            geojson=geojson_data,
            locations=gdf.index,
            z=hdi_values_display,
            zmin=display_zmin,
            zmax=display_zmax,
            colorscale=colorscale,
            showscale=True,
            marker=dict(line=dict(color='white', width=0.5)),
            text=gdf["gdlcode"],
            customdata=[[idx] for idx in region_indices]  # Store index as list for click events
        ))
        
        # Set opacity: selected regions have lower opacity, unselected stay at full opacity
        fig.update_traces(
            selected=dict(marker=dict(opacity=1.0)),  # Selected: lower opacity
            unselected=dict(marker=dict(opacity=0.7))  # Unselected: full opacity
        )
        
        # Update layout
        fig.update_layout(
            mapbox=dict(
                style='carto-positron',
                center=dict(lat=20, lon=0),
                zoom=1.5
            ),
            margin=dict(l=0, r=0, t=0, b=0),
            height=700,
            dragmode='pan',
            clickmode='event+select'  # Enable click events
        )
        
        # Create two-column layout
        col1, col2 = st.columns([2, 1])
        
        with col1:
            # Display with plotly (config enables scroll zoom and other interactions)
            event = st.plotly_chart(
                fig, 
                use_container_width=True,
                config={
                    'scrollZoom': True,
                    'displayModeBar': True,
                    'displaylogo': False
                },
                on_select="rerun",
                key="map_chart"
            )
            
            # Handle click/selection event
            if event and 'selection' in event:
                selection = event['selection']
                if 'points' in selection and len(selection['points']) > 0:
                    point = selection['points'][0]
                    # Try different ways to get the point index
                    region_idx = None
                    if 'customdata' in point and point['customdata']:
                        # customdata is a list, get first element
                        if isinstance(point['customdata'], list) and len(point['customdata']) > 0:
                            region_idx = point['customdata'][0]
                        else:
                            region_idx = point['customdata']
                    elif 'pointIndex' in point:
                        region_idx = point['pointIndex']
                    elif 'pointNumber' in point:
                        region_idx = point['pointNumber']
                    elif 'location' in point:
                        # For choropleth, location might be the index
                        region_idx = point['location']
                    
                    if region_idx is not None:
                        st.session_state.selected_region_index = region_idx
            
            # Year slider below the map
            st.session_state.selected_year = st.slider(
                "Select Year",
                min_value=min_year,
                max_value=max_year,
                value=st.session_state.selected_year,
                step=1,
                key="year_slider"
            )
        
        with col2:
            st.subheader("Region Details")
            
            # Display selected region information
            if st.session_state.selected_region_index is not None:
                try:
                    region_idx = st.session_state.selected_region_index
                    
                    # Try to get region by index position
                    if isinstance(region_idx, (int, np.integer)) and 0 <= region_idx < len(gdf):
                        region_row = gdf.iloc[region_idx]
                    # Try to get region by index value
                    elif region_idx in gdf.index:
                        region_row = gdf.loc[region_idx]
                    else:
                        st.info("Invalid region selection. Click on a region in the map to view details.")
                        region_row = None
                    
                    if region_row is not None:
                        # Try different possible column names for region name
                        region_name = None
                        for col in ['region', 'name', 'NAME', 'Region', 'NAME_1', 'NAME_0']:
                            if col in region_row:
                                region_name = region_row[col]
                                break
                        
                        gdlcode = region_row.get('gdlcode', 'Unknown')
                        
                        if region_name:
                            st.write(f"**Region:** {region_name}")
                        st.write(f"**GDL Code:** {gdlcode}")
                        
                        # Get time series data and create component evolution chart
                        if gdlcode != 'Unknown':
                            data_hash = len(shdi)
                            region_data = get_region_timeseries(gdlcode, data_hash)
                            
                            if not region_data.empty:
                                st.subheader("HDI Component Evolution")
                                evolution_fig = create_component_evolution_chart(region_data)
                                if evolution_fig:
                                    st.plotly_chart(
                                        evolution_fig,
                                        use_container_width=True,
                                        config={'displayModeBar': False}
                                    )
                            else:
                                st.info("No time series data available for this region.")
                except Exception as e:
                    st.info("No region selected. Click on a region in the map to view details.")
            else:
                st.info("No region selected. Click on a region in the map to view details.")
        
    elif view_mode == "Bottleneck Overview":
        st.info("Bottleneck overview visualization will be implemented in a future update.")
        # Year slider below the placeholder
        st.session_state.selected_year = st.slider(
            "Select Year",
            min_value=min_year,
            max_value=max_year,
            value=st.session_state.selected_year,
            step=1,
            key="year_slider_bottleneck"
        )
else:
    st.error("GeoJSON file not found")

