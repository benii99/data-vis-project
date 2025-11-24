from pathlib import Path
import numpy as np
import streamlit as st

from src.analysis.bottlenecks import get_bottleneck_components
from src.analysis.disparity import (
    METRIC_DESCRIPTIONS,
    METRIC_LABELS,
    get_disparity_values,
)
from src.analysis.regions import available_year_bounds, get_region_timeseries, get_year_hdi_values
from src.data.loaders import load_geojson, load_shdi_dataframe
from src.data.paths import GEOJSON_ACTIVE_PATH, GEOJSON_ORIGINAL_PATH, SHDI_PROCESSED_PATH
from src.visualizations.charts import create_component_evolution_chart
from src.visualizations.maps import build_component_bottleneck_map, build_disparity_map, build_hdi_map

st.set_page_config(page_title="Subnational HDI Explorer", layout="wide")



geojson_path = GEOJSON_ACTIVE_PATH if GEOJSON_ACTIVE_PATH.exists() else GEOJSON_ORIGINAL_PATH


@st.cache_data
def load_geojson_cached(path_str: str, original_path_str: str):
    """Load GeoJSON boundaries once."""
    path = Path(path_str)
    original_path = Path(original_path_str)
    simplify = path == original_path
    return load_geojson(path, simplify=simplify)


@st.cache_data
def load_shdi_cached(path_str: str):
    """Load SHDI data once."""
    path = Path(path_str)
    return load_shdi_dataframe(path)


@st.cache_data
def get_geojson_data(_gdf):
    """Convert GeoDataFrame to GeoJSON format."""
    return _gdf.__geo_interface__


@st.cache_data
def get_year_data(gdlcodes_tuple, year, _data_hash):
    """Get HDI values for all regions for a specific year."""
    shdi_df = load_shdi_cached(str(SHDI_PROCESSED_PATH))
    return get_year_hdi_values(shdi_df, year, gdlcodes_tuple)


@st.cache_data
def get_region_timeseries_cached(gdlcode, _data_hash):
    """Get time series data for a specific region."""
    shdi_df = load_shdi_cached(str(SHDI_PROCESSED_PATH))
    return get_region_timeseries(shdi_df, gdlcode)


@st.cache_data
def get_disparity_metric_data(metric_key, gdlcodes_tuple, year, _data_hash):
    """Compute disparity metrics for all regions for map display."""
    shdi_df = load_shdi_cached(str(SHDI_PROCESSED_PATH))
    return get_disparity_values(shdi_df, year, gdlcodes_tuple, metric_key)


@st.cache_data
def get_component_bottleneck_data(gdlcodes_tuple, year, _data_hash):
    """Compute bottleneck component per region for categorical map."""
    shdi_df = load_shdi_cached(str(SHDI_PROCESSED_PATH))
    return get_bottleneck_components(shdi_df, year, gdlcodes_tuple)


gdf = load_geojson_cached(str(geojson_path), str(GEOJSON_ORIGINAL_PATH)) if geojson_path.exists() else None
shdi = load_shdi_cached(str(SHDI_PROCESSED_PATH))
min_year, max_year = available_year_bounds(shdi)

# Sidebar mode selection
st.sidebar.header("View Mode")
view_mode = st.sidebar.radio(
    "Select Mode",
    ["HDI Overview", "Bottleneck Overview", "3 Component Bottleneck"],
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
    st.sidebar.subheader("Bottleneck Overview Options")
    disparity_metric = st.sidebar.selectbox(
        "Disparity Metric",
        options=list(METRIC_LABELS.keys()),
        index=0,
        format_func=lambda key: METRIC_LABELS[key],
    )
    st.sidebar.caption(METRIC_DESCRIPTIONS[disparity_metric])
    bottleneck_scale_mode = st.sidebar.radio(
        "Color Scale",
        ["Absolute", "Range"],
        index=0,
        help="Absolute uses preset ranges per metric; Range adapts to current year.",
    )
elif view_mode == "3 Component Bottleneck":
    st.sidebar.subheader("3 Component Bottleneck")
    st.sidebar.caption("Each region is colored by the component (Health, Education, Income) with the lowest index in the selected year.")

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
        gdlcodes = gdf["gdlcode"].values
        data_hash = len(shdi)
        hdi_values = get_year_data(tuple(gdlcodes), st.session_state.selected_year, data_hash)
        fig, region_indices, _, _ = build_hdi_map(gdf, geojson_data, hdi_values, scale_mode)
        
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
                            region_data = get_region_timeseries_cached(gdlcode, data_hash)
                            
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
        geojson_data = get_geojson_data(gdf)
        gdlcodes = gdf["gdlcode"].values
        data_hash = len(shdi)
        disparity_values = get_disparity_metric_data(
            disparity_metric, tuple(gdlcodes), st.session_state.selected_year, data_hash
        )
        fig, region_indices, _, _ = build_disparity_map(
            gdf,
            geojson_data,
            disparity_values,
            metric_key=disparity_metric,
            metric_label=METRIC_LABELS[disparity_metric],
            scale_mode=bottleneck_scale_mode,
        )
        disparity_lookup = {idx: val for idx, val in zip(region_indices, disparity_values)}

        col1, col2 = st.columns([2, 1])

        with col1:
            event = st.plotly_chart(
                fig,
                use_container_width=True,
                config={
                    'scrollZoom': True,
                    'displayModeBar': True,
                    'displaylogo': False
                },
                on_select="rerun",
                key="bottleneck_map_chart"
            )

            if event and 'selection' in event:
                selection = event['selection']
                if 'points' in selection and len(selection['points']) > 0:
                    point = selection['points'][0]
                    region_idx = None
                    if 'customdata' in point and point['customdata']:
                        if isinstance(point['customdata'], list) and len(point['customdata']) > 0:
                            region_idx = point['customdata'][0]
                        else:
                            region_idx = point['customdata']
                    elif 'pointIndex' in point:
                        region_idx = point['pointIndex']
                    elif 'pointNumber' in point:
                        region_idx = point['pointNumber']
                    elif 'location' in point:
                        region_idx = point['location']

                    if region_idx is not None:
                        st.session_state.selected_region_index = region_idx

            st.session_state.selected_year = st.slider(
                "Select Year",
                min_value=min_year,
                max_value=max_year,
                value=st.session_state.selected_year,
                step=1,
                key="year_slider_bottleneck"
            )

        with col2:
            st.subheader("Region Details")
            if st.session_state.selected_region_index is not None:
                try:
                    region_idx = st.session_state.selected_region_index

                    if isinstance(region_idx, (int, np.integer)) and 0 <= region_idx < len(gdf):
                        region_row = gdf.iloc[region_idx]
                    elif region_idx in gdf.index:
                        region_row = gdf.loc[region_idx]
                    else:
                        st.info("Invalid region selection. Click on a region in the map to view details.")
                        region_row = None

                    if region_row is not None:
                        region_name = None
                        for col in ['region', 'name', 'NAME', 'Region', 'NAME_1', 'NAME_0']:
                            if col in region_row:
                                region_name = region_row[col]
                                break

                        gdlcode = region_row.get('gdlcode', 'Unknown')

                        if region_name:
                            st.write(f"**Region:** {region_name}")
                        st.write(f"**GDL Code:** {gdlcode}")

                        if gdlcode != 'Unknown':
                            # Show disparity value
                            region_metric = None
                            if isinstance(region_idx, (int, np.integer)) and 0 <= region_idx < len(disparity_values):
                                region_metric = disparity_values[region_idx]
                            else:
                                region_metric = disparity_lookup.get(region_idx)

                            if region_metric is not None and region_metric != -1:
                                st.metric(
                                    label=METRIC_LABELS[disparity_metric],
                                    value=f"{region_metric:.3f}"
                                )

                            data_hash = len(shdi)
                            region_data = get_region_timeseries_cached(gdlcode, data_hash)

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
                except Exception:
                    st.info("No region selected. Click on a region in the map to view details.")
            else:
                st.info("No region selected. Click on a region in the map to view details.")
    elif view_mode == "3 Component Bottleneck":
        geojson_data = get_geojson_data(gdf)
        gdlcodes = gdf["gdlcode"].values
        data_hash = len(shdi)
        bottleneck_components = get_component_bottleneck_data(
            tuple(gdlcodes), st.session_state.selected_year, data_hash
        )
        fig, region_indices = build_component_bottleneck_map(
            gdf,
            geojson_data,
            bottleneck_components,
        )
        component_lookup = {idx: comp for idx, comp in zip(region_indices, bottleneck_components)}

        col1, col2 = st.columns([2, 1])

        with col1:
            event = st.plotly_chart(
                fig,
                use_container_width=True,
                config={
                    'scrollZoom': True,
                    'displayModeBar': True,
                    'displaylogo': False
                },
                on_select="rerun",
                key="component_bottleneck_map_chart"
            )

            if event and 'selection' in event:
                selection = event['selection']
                if 'points' in selection and len(selection['points']) > 0:
                    point = selection['points'][0]
                    region_idx = None
                    if 'customdata' in point and point['customdata']:
                        if isinstance(point['customdata'], list) and len(point['customdata']) > 0:
                            region_idx = point['customdata'][0]
                        else:
                            region_idx = point['customdata']
                    elif 'pointIndex' in point:
                        region_idx = point['pointIndex']
                    elif 'pointNumber' in point:
                        region_idx = point['pointNumber']
                    elif 'location' in point:
                        region_idx = point['location']

                    if region_idx is not None:
                        st.session_state.selected_region_index = region_idx

            st.session_state.selected_year = st.slider(
                "Select Year",
                min_value=min_year,
                max_value=max_year,
                value=st.session_state.selected_year,
                step=1,
                key="year_slider_component_bottleneck"
            )

        with col2:
            st.subheader("Region Details")
            if st.session_state.selected_region_index is not None:
                try:
                    region_idx = st.session_state.selected_region_index

                    if isinstance(region_idx, (int, np.integer)) and 0 <= region_idx < len(gdf):
                        region_row = gdf.iloc[region_idx]
                    elif region_idx in gdf.index:
                        region_row = gdf.loc[region_idx]
                    else:
                        st.info("Invalid region selection. Click on a region in the map to view details.")
                        region_row = None

                    if region_row is not None:
                        region_name = None
                        for col in ['region', 'name', 'NAME', 'Region', 'NAME_1', 'NAME_0']:
                            if col in region_row:
                                region_name = region_row[col]
                                break

                        gdlcode = region_row.get('gdlcode', 'Unknown')

                        if region_name:
                            st.write(f"**Region:** {region_name}")
                        st.write(f"**GDL Code:** {gdlcode}")

                        if gdlcode != 'Unknown':
                            component_label = component_lookup.get(region_idx)
                            if component_label and component_label != "missing":
                                st.metric(
                                    label="Bottleneck Component",
                                    value=component_label.capitalize()
                                )

                            data_hash = len(shdi)
                            region_data = get_region_timeseries_cached(gdlcode, data_hash)

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
                except Exception:
                    st.info("No region selected. Click on a region in the map to view details.")
            else:
                st.info("No region selected. Click on a region in the map to view details.")
else:
    st.error("GeoJSON file not found")

