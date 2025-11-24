
import geopandas as gpd

shapefile_path = r'D:\Projects\uni\data visualization\data-vis-project\data\gdl\GDL Shapefiles V6.5 large.shp'
gdf = gpd.read_file(shapefile_path)

geojson_path = r'D:\Projects\uni\data visualization\data-vis-project\data\geojson\gdl_regions.geojson'
gdf.to_file(geojson_path, driver='GeoJSON')