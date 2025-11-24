"""
Script to simplify GeoJSON geometries for faster rendering.
Reduces file size and improves map performance.
"""

import geopandas as gpd
import pyogrio
from pathlib import Path
import json


def simplify_geojson(input_path, output_path, tolerance_km=5):
    """
    Simplify GeoJSON geometries to reduce file size and improve rendering.
    
    Args:
        input_path: Path to input GeoJSON file
        output_path: Path to save simplified GeoJSON
        tolerance_km: Simplification tolerance in kilometers (default 5km)
    """
    print(f"Loading GeoJSON from {input_path}...")
    gdf = gpd.read_file(input_path)
    
    original_size = input_path.stat().st_size / (1024 * 1024)  # MB
    print(f"Original file size: {original_size:.2f} MB")
    print(f"Original features: {len(gdf)}")
    
    # Convert km to degrees (approximate, 1 degree ≈ 111 km at equator)
    tolerance_degrees = tolerance_km / 111.0
    print(f"Simplifying geometries with {tolerance_km}km tolerance ({tolerance_degrees:.5f} degrees)...")
    
    # Simplify geometries
    gdf['geometry'] = gdf['geometry'].simplify(
        tolerance=tolerance_degrees,
        preserve_topology=True
    )
    
    # Keep only essential columns
    print("Removing unnecessary columns...")
    essential_cols = ['geometry']
    
    # Keep identifier columns if they exist
    for col in ['gdlcode', 'continent', 'iso_code']:
        if col in gdf.columns:
            essential_cols.append(col)
    
    gdf = gdf[essential_cols]
    
    # Save simplified GeoJSON
    print(f"Saving simplified GeoJSON to {output_path}...")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    gdf.to_file(output_path, driver='GeoJSON')
    
    new_size = output_path.stat().st_size / (1024 * 1024)  # MB
    reduction = ((original_size - new_size) / original_size) * 100
    
    print(f"\n✓ Simplification complete!")
    print(f"  New file size: {new_size:.2f} MB")
    print(f"  Size reduction: {reduction:.1f}%")
    print(f"  Features: {len(gdf)}")
    print(f"  Columns: {list(gdf.columns)}")


def simplify_multiple_tolerances(input_path, output_dir):
    """
    Create multiple simplified versions with different tolerance levels.
    """
    tolerances = {
        'high_detail': 1,    # 1km
        'medium_detail': 5,  # 5km
        'low_detail': 10,    # 10km
        'very_low_detail': 20  # 20km
    }
    
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    for name, tolerance in tolerances.items():
        output_file = output_dir / f"simplified_{name}.geojson"
        print(f"\n{'='*60}")
        print(f"Creating {name} version (tolerance: {tolerance}km)")
        print('='*60)
        simplify_geojson(input_path, output_file, tolerance_km=tolerance)


if __name__ == "__main__":
    # Define paths
    project_root = Path(__file__).resolve().parents[2]
    #input_geojson = project_root / "data" / "geojson" / "geoBoundariesCGAZ_ADM1.geojson"
    #output_geojson = project_root / "data" / "geojson" / "geoBoundariesCGAZ_ADM1_simplified_5km.geojson"

    input_geojson = project_root / "data" / "geojson" / "gdl_regions.geojson"
    output_geojson = project_root / "data" / "geojson" / "gdl_regons_simplified_5km.geojson"
    
    if not input_geojson.exists():
        print(f"Error: Input file not found: {input_geojson}")
        exit(1)
    
    # Create simplified version with 5km tolerance
    pyogrio.set_gdal_config_options({"OGR_GEOJSON_MAX_OBJ_SIZE": 0})
    simplify_geojson(input_geojson, output_geojson, tolerance_km=5)
    
    # Optionally create multiple versions
    print("\n" + "="*60)
    create_multiple = input("\nCreate multiple detail levels? (y/n): ").lower().strip()
    if create_multiple == 'y':
        output_dir = project_root / "data" / "geojson" / "simplified"
        simplify_multiple_tolerances(input_geojson, output_dir)

