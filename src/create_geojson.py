"""
Convert GDL shapefile to GeoJSON format.
"""

import geopandas as gpd
from pathlib import Path


def convert_gdl_shapefile_to_geojson(
    shapefile_path: str = "data/shapefiles/GDL Shapefiles V6.5 large.shp",
    output_path: str = "data/geojson/gdl_regions.geojson",
    simplify: bool = True,
    tolerance: float = 0.05
):
    """
    Convert GDL shapefile to GeoJSON format.
    
    Args:
        shapefile_path: Path to input shapefile
        output_path: Path to save output GeoJSON
        simplify: Whether to simplify geometries for smaller file size
        tolerance: Simplification tolerance (higher = more simplified)
    """
    shapefile_path = Path(shapefile_path)
    output_path = Path(output_path)
    
    if not shapefile_path.exists():
        raise FileNotFoundError(f"Shapefile not found: {shapefile_path}")
    
    print(f"Loading shapefile from {shapefile_path}...")
    gdf = gpd.read_file(shapefile_path)
    
    print(f"Loaded {len(gdf)} regions")
    print(f"Columns: {list(gdf.columns)}")
    print(f"CRS: {gdf.crs}")
    
    # Check for GDL code column
    gdl_col = None
    for col in ['GDLCODE', 'gdlcode', 'GdlCode', 'GDLcode', 'Gdlcode']:
        if col in gdf.columns:
            gdl_col = col
            print(f"Found GDL code column: {gdl_col}")
            break
    
    if gdl_col is None:
        print("Warning: No GDL code column found. Available columns:")
        print(list(gdf.columns))
        # Use index as identifier
        gdf['gdlcode'] = gdf.index.astype(str)
    else:
        # Standardize to lowercase 'gdlcode'
        if gdl_col != 'gdlcode':
            gdf['gdlcode'] = gdf[gdl_col]
    
    # Ensure CRS is WGS84 for GeoJSON
    if gdf.crs is None:
        print("Warning: No CRS found. Assuming WGS84 (EPSG:4326)")
        gdf.set_crs(epsg=4326, inplace=True)
    elif gdf.crs.to_string() != 'EPSG:4326':
        print(f"Reprojecting from {gdf.crs} to WGS84 (EPSG:4326)...")
        gdf = gdf.to_crs(epsg=4326)
    
    # Simplify geometries if requested
    if simplify:
        print(f"Simplifying geometries (tolerance={tolerance})...")
        gdf['geometry'] = gdf['geometry'].simplify(tolerance=tolerance, preserve_topology=True)
    
    # Create output directory if it doesn't exist
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Save as GeoJSON
    print(f"Saving GeoJSON to {output_path}...")
    gdf.to_file(output_path, driver='GeoJSON')
    
    file_size = output_path.stat().st_size / (1024 * 1024)  # Size in MB
    print(f"   GeoJSON created successfully!")
    print(f"   File size: {file_size:.2f} MB")
    print(f"   Regions: {len(gdf)}")
    print(f"   GDL codes: {gdf['gdlcode'].nunique()}")
    
    return gdf


if __name__ == "__main__":
    import sys
    
    # Default paths
    shapefile_path = "/home/vlv/Documents/master/datavis/project/shapefiles/GDL Shapefiles V6.5 large.shp"
    output_path = "data/geojson/gdl_regions_simplified.geojson"
    
    # Allow command line arguments
    if len(sys.argv) > 1:
        shapefile_path = sys.argv[1]
    if len(sys.argv) > 2:
        output_path = sys.argv[2]
    
    convert_gdl_shapefile_to_geojson(
        shapefile_path=shapefile_path,
        output_path=output_path,
        simplify=True,
        tolerance=0.1
    )

