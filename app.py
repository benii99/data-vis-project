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
shdi = pd.read_csv(shdi_processed_path)

# Define function for choosing shdi data from shdi indexes
def get_shdi_data(_shdi, gdlcode):
    region_data = _shdi[shdi["gdlcode"] == gdlcode]

    if region_data.__len__() == 0:
        return -1

    if 2022 in region_data["year"].values:
        return region_data[region_data["year"] == 2022]["shdi"].iloc[0] # color according to shdi in 2022
    
    return -1


# Create map
if gdf is not None:
    # Convert to GeoJSON format for Plotly
    geojson_data = gdf.__geo_interface__
    
    # Create choropleth map
    fig = go.Figure(go.Choroplethmapbox(
        geojson=geojson_data,
        locations=gdf.index,
        z = [get_shdi_data(shdi, gdf.loc[index, "gdlcode"]) for index in gdf.index], 
        #z=[get_shdi_data(shdi, indexes) for indexes in gdf["regionData"]], 
        #z=[1] * len(gdf),  # Uniform color for now
        #colorscale=[[np.min(shdi["shdi"]), "#afcdf1"], [np.max(shdi["shdi"]), "#0077ff"]],
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

