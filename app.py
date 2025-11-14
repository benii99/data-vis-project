import streamlit as st
import geopandas as gpd
import pandas as pd
import plotly.graph_objects as go
from pathlib import Path
import numpy as np

st.set_page_config(page_title="Subnational HDI Explorer", layout="wide")

# File paths
geojson_original_path = Path(__file__).parent / "data" / "geojson" / "geoBoundariesCGAZ_ADM1.geojson"
geojson_simplified_path = Path(__file__).parent / "data" / "geojson" / "geoBoundariesCGAZ_ADM1_simplified_5km.geojson"
geojson_shdi_association_path = Path(__file__).parent / "data" / "processed" / "geojson_shdi.geojson"
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

# Add year slider in sidebar
st.sidebar.header("Filters")
selected_year = st.sidebar.slider(
    "Select Year",
    min_value=min_year,
    max_value=max_year,
    value=max_year,
    step=1
)

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


# Display selected year
st.header(f"Subnational HDI Explorer - {selected_year}")

# Create map
if gdf is not None:
    geojson_data = get_geojson_data(gdf)
    
    # Get gdlcodes once
    gdlcodes = gdf["gdlcode"].values
    
    # Get HDI values for selected year (cached per year)
    # Use dataframe length as hash to track data changes
    data_hash = len(shdi)
    hdi_values = get_year_data(tuple(gdlcodes), selected_year, data_hash)
    
    # Create choropleth map
    fig = go.Figure(go.Choroplethmapbox(
        geojson=geojson_data,
        locations=gdf.index,
        z=hdi_values,
        showscale=True,
        marker=dict(line=dict(color='white', width=0.5)),
        text=gdf["gdlcode"]
    ))
    
    # Update layout
    fig.update_layout(
        mapbox=dict(
            style='carto-positron',
            center=dict(lat=20, lon=0),
            zoom=1.5
        ),
        margin=dict(l=0, r=0, t=0, b=0),
        height=700,
        dragmode='pan'
    )
    
    # Display with plotly (config enables scroll zoom and other interactions)
    st.plotly_chart(
        fig, 
        use_container_width=True,
        config={
            'scrollZoom': True,
            'displayModeBar': True,
            'displaylogo': False
        }
    )
else:
    st.error("GeoJSON file not found")

