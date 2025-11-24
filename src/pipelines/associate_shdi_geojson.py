"""
Module for associating shdi data with geojson 
"""

import pandas as pd
import geopandas as gpd
import numpy as np
from pathlib import Path
from tqdm import tqdm


def associate_shdi_with_geojson(gdf_path, shdi_path, output_path):
    gdf = gpd.read_file(gdf_path)
    shdi = pd.read_csv(shdi_path)

    # create new column for region data, region data will be indexes that can be used to index into SHDI data
    gdf["regionData"] = pd.Series(dtype='object')

    for index in tqdm(gdf.index):
        region_name_geojson = gdf.loc[index, "shapeName"]
        country_code = gdf.loc[index, "shapeGroup"]
        country_data = shdi[shdi["isocode3"] == country_code]

        indexes = []
        for j in country_data.index:
            region_name_shdi = country_data.loc[j, "region"]

            # Determine whether a region corresponds to another by whether their countries match and one of their names is within the other name...
            # (might need a better geojson file, or a hierarchical one since some regions dont match like in montenegro - shdi data is on an overall level "North/South/Centre" while geojson is on an actual province level)
            if region_name_shdi.lower() in region_name_geojson.lower() or region_name_geojson.lower() in region_name_shdi.lower():
                indexes.append(j)

        gdf.at[index, "regionData"] = ",".join([str(x) for x in indexes])
        
    gdf.to_file(output_path, driver='GeoJSON')

    return gdf


if __name__ == "__main__":
    # Define paths
    project_root = Path(__file__).resolve().parents[2]
    shdi_path = project_root / "data" / "processed" / "subnational_hdi_processed.csv"
    gdf_path = project_root / "data" / "geojson" / "geoBoundariesCGAZ_ADM1_simplified_5km.geojson"
    output_path = project_root / "data" / "processed" / "geojson_shdi.geojson"

    # Associate data
    associate_shdi_with_geojson(gdf_path, shdi_path, output_path)

