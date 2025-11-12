import streamlit as st
import geopandas as gpd
import pandas as pd
import plotly.graph_objects as go
import plotly.express as px
from pathlib import Path
from src.data_processing import process_hdi_data

st.set_page_config(page_title="Subnational HDI Explorer", layout="wide")

# File paths
geojson_path = Path(__file__).parent / "data" / "geojson" / "gdl_regions_simplified.geojson"
data_path = Path(__file__).parent / "data" / "processed" / "subnational_hdi_processed.csv"
raw_data_path = Path(__file__).parent / "data" / "raw" / "Subnational HDI Data v8.3.csv"

# Load and cache GeoJSON
@st.cache_data
def load_geojson():
    """Load GDL GeoJSON boundaries once."""
    if not geojson_path.exists():
        return None
    gdf = gpd.read_file(geojson_path)
    return gdf

# Load and cache HDI data
@st.cache_data
def load_hdi_data():
    """Load processed HDI data once."""
    if not data_path.exists():
        return None
    df = pd.read_csv(data_path)
    return df

# Check if processed data exists, if not process it
df = None
if not data_path.exists():
    if raw_data_path.exists():
        with st.spinner("Processed data not found. Processing raw data... This may take a minute."):
            try:
                process_hdi_data(raw_data_path, data_path, verbose=False)
                st.success("Data processing complete!")
                # Load the newly processed data directly
                df = pd.read_csv(data_path)
            except Exception as e:
                st.error(f"Error processing data: {e}")
                st.exception(e)
                st.stop()
    else:
        st.error(f"Raw data file not found: {raw_data_path}")
        st.info("Please ensure 'Subnational HDI Data v8.3.csv' exists in data/raw/")
        st.stop()

# Load data (use cached function if not already loaded)
if df is None:
    with st.spinner("Loading data..."):
        gdf = load_geojson()
        df = load_hdi_data()
else:
    with st.spinner("Loading GeoJSON..."):
        gdf = load_geojson()

# Check if data loaded successfully
if gdf is None:
    st.error("GeoJSON file not found. Please ensure gdl_regions_simplified.geojson exists in data/geojson/")
    st.stop()

if df is None:
    st.error("HDI data file not found. Please ensure subnational_hdi_processed.csv exists in data/processed/")
    st.stop()

# Title and description
st.title("Subnational HDI Explorer")
st.markdown("Explore Human Development Index patterns at the subnational level.")

# Sidebar controls
st.sidebar.header("Controls")

# Year selection
min_year = int(df['year'].min())
max_year = int(df['year'].max())
selected_year = st.sidebar.slider(
    "Select Year",
    min_value=min_year,
    max_value=max_year,
    value=max_year,
    step=1
)

# Component selection
component_option = st.sidebar.selectbox(
    "Component to Display",
    ["Overall HDI", "Health", "Education", "Income"],
    help="Select which HDI component to visualize"
)

# Filter data by year
year_data = df[df['year'] == selected_year].copy()

# Determine which column to use for coloring
component_map = {
    "Overall HDI": "shdi",
    "Health": "healthindex",
    "Education": "edindex",
    "Income": "incindex"
}
value_column = component_map.get(component_option, "shdi")

# Merge GeoJSON with HDI data
gdf_merged = gdf.merge(
    year_data[['gdlcode', value_column, 'region', 'country']],
    on='gdlcode',
    how='left'
)

# Check if we have data to display
if gdf_merged[value_column].notna().sum() == 0:
    st.warning(f"No data available for {component_option} in year {selected_year}")
    st.info("Try selecting a different year or component.")
    st.stop()

# Convert to GeoJSON format for Plotly
geojson_data = gdf_merged.__geo_interface__

# Create choropleth map
fig = px.choropleth(
    gdf_merged,
    geojson=geojson_data,
    locations='gdlcode',
    color=value_column,
    color_continuous_scale='RdYlGn' if component_option == "Overall HDI" else 'Blues',
    range_color=[0, 1],
    hover_data={
        'region': True,
        'country': True,
        value_column: ':.3f'
    },
    labels={value_column: component_option},
    featureidkey='properties.gdlcode'
)

# Update layout
fig.update_geos(
    projection_type="natural earth",
    showcoastlines=True,
    showcountries=True,
    showframe=False
)

fig.update_layout(
    margin=dict(l=0, r=0, t=30, b=0),
    height=700,
    coloraxis_colorbar=dict(
        title=component_option,
        len=0.6,
        y=0.5
    )
)

# Display map
st.subheader(f"{component_option} - {selected_year}")
st.plotly_chart(
    fig, 
    use_container_width=True,
    config={
        'scrollZoom': True,
        'displayModeBar': True,
        'displaylogo': False
    }
)

# Display data summary
st.sidebar.markdown("---")
st.sidebar.subheader("Data Summary")
st.sidebar.write(f"Regions with data: {gdf_merged[value_column].notna().sum()}")
st.sidebar.write(f"Total regions: {len(gdf_merged)}")
if gdf_merged[value_column].notna().any():
    st.sidebar.write(f"Average {component_option}: {gdf_merged[value_column].mean():.3f}")
    st.sidebar.write(f"Min: {gdf_merged[value_column].min():.3f}")
    st.sidebar.write(f"Max: {gdf_merged[value_column].max():.3f}")
