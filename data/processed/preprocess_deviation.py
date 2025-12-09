#!/usr/bin/env python3
"""
Preprocess HDI data to add country averages and regional deviations.

For each region and year, calculates:
- country_avg_shdi: The average SHDI across all regions in the same country for that year
- hdi_deviation: The difference between the region's SHDI and its country average
"""

import pandas as pd
import os

# Input and output paths
script_dir = os.path.dirname(os.path.abspath(__file__))
input_file = os.path.join(script_dir, 'subnational_hdi_processed.csv')
output_file = os.path.join(script_dir, 'subnational_hdi_with_deviation.csv')

print(f"Reading data from: {input_file}")
df = pd.read_csv(input_file)

print(f"Original data shape: {df.shape}")
print(f"Columns: {list(df.columns)}")

# Calculate country average SHDI for each country and year
# Group by country and year, then calculate mean SHDI
country_year_avg = df.groupby(['country', 'year'])['shdi'].mean().reset_index()
country_year_avg.columns = ['country', 'year', 'country_avg_shdi']

print(f"\nCalculated country averages for {len(country_year_avg)} country-year combinations")

# Merge the country average back to the original dataframe
df = df.merge(country_year_avg, on=['country', 'year'], how='left')

# Calculate the deviation (region SHDI - country average)
df['hdi_deviation'] = df['shdi'] - df['country_avg_shdi']

# Round the new columns to 6 decimal places for cleaner output
df['country_avg_shdi'] = df['country_avg_shdi'].round(6)
df['hdi_deviation'] = df['hdi_deviation'].round(6)

# Show some statistics
print(f"\nDeviation statistics:")
print(f"  Min deviation: {df['hdi_deviation'].min():.4f}")
print(f"  Max deviation: {df['hdi_deviation'].max():.4f}")
print(f"  Mean deviation: {df['hdi_deviation'].mean():.6f} (should be ~0)")
print(f"  Std deviation: {df['hdi_deviation'].std():.4f}")

# Show sample data
print(f"\nSample data (first 5 rows with new columns):")
sample_cols = ['gdlcode', 'country', 'year', 'shdi', 'country_avg_shdi', 'hdi_deviation']
print(df[sample_cols].head().to_string(index=False))

# Save to new CSV
df.to_csv(output_file, index=False)
print(f"\nSaved preprocessed data to: {output_file}")
print(f"New data shape: {df.shape}")

