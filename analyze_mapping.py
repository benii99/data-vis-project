"""
Analyze the mapping between GeoJSON and HDI data to create a proper lookup.
"""

import json
import pandas as pd
from pathlib import Path

# Load GeoJSON
print("Loading GeoJSON...")
with open('data/geojson/geoBoundariesCGAZ_ADM1.geojson') as f:
    geo_data = json.load(f)

# Load HDI data for latest year
print("Loading HDI data...")
hdi_df = pd.read_csv('data/processed/subnational_hdi_processed.csv')
latest_year = hdi_df['year'].max()
hdi_latest = hdi_df[hdi_df['year'] == latest_year]

print(f"\nGeoJSON features: {len(geo_data['features'])}")
print(f"HDI regions (year {latest_year}): {len(hdi_latest)}")

# Compare a few countries
test_countries = ['AFG', 'USA', 'BRA', 'IND', 'DEU', 'FRA', 'CHN']

for iso in test_countries:
    geo_regions = [f['properties']['shapeName'] for f in geo_data['features'] 
                   if f['properties']['shapeGroup'] == iso]
    hdi_regions = hdi_latest[hdi_latest['isocode3'] == iso]['region'].tolist()
    
    if geo_regions and hdi_regions:
        print(f"\n{'='*60}")
        print(f"{iso}:")
        print(f"  GeoJSON: {len(geo_regions)} regions")
        print(f"  HDI: {len(hdi_regions)} regions")
        print(f"\n  GeoJSON sample: {sorted(geo_regions)[:3]}")
        print(f"  HDI sample: {sorted(hdi_regions)[:3]}")
        
        # Try to find matches
        matches = 0
        for hdi_region in hdi_regions:
            for geo_region in geo_regions:
                if hdi_region.lower() == geo_region.lower():
                    matches += 1
                    break
        print(f"  Exact matches: {matches}")

print("\n" + "="*60)
print("\nGeoJSON properties available:")
print(list(geo_data['features'][0]['properties'].keys()))

print("\nHDI columns available:")
print(list(hdi_latest.columns))

