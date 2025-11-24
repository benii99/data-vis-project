"""
Data processing module for Subnational HDI dataset.
Loads raw data, processes it, and saves to processed/ directory.
"""

import pandas as pd
import numpy as np
from pathlib import Path


def identify_bottleneck(row):
    """
    Identify which component is the bottleneck for a given row.
    Returns the component name with the lowest value.
    """
    components = {
        'health': row['healthindex'],
        'education': row['edindex'],
        'income': row['incindex']
    }
    
    # Remove NaN values
    valid_components = {k: v for k, v in components.items() if pd.notna(v)}
    
    if not valid_components:
        return None, None
    
    bottleneck_component = min(valid_components, key=valid_components.get)
    bottleneck_value = valid_components[bottleneck_component]
    
    return bottleneck_component, bottleneck_value


def process_hdi_data(raw_path, output_path, verbose=True):
    """
    Process raw HDI data and save to processed directory.
    
    Args:
        raw_path: Path to raw CSV file
        output_path: Path to save processed CSV
        verbose: Whether to print progress messages (default True)
        
    Returns:
        DataFrame with processed data
    """
    if verbose:
        print("Loading raw HDI data...")
    df = pd.read_csv(raw_path)
    
    if verbose:
        print(f"Total rows: {len(df)}")
    
    # Filter to subnational level only
    if verbose:
        print("Filtering to subnational level...")
    df = df[df['level'] == 'Subnat'].copy()
    if verbose:
        print(f"Subnational rows: {len(df)}")
    
    # Add bottleneck identification
    if verbose:
        print("Identifying bottlenecks...")
    bottleneck_results = df.apply(identify_bottleneck, axis=1)
    df['bottleneck_component'] = bottleneck_results.apply(lambda x: x[0])
    df['bottleneck_value'] = bottleneck_results.apply(lambda x: x[1])
    
    # Select relevant columns
    columns_to_keep = [
        'isocode3', 'country', 'continent', 'year', 'gdlcode', 'region',
        'shdi', 'healthindex', 'edindex', 'incindex',
        'lifexp', 'esch', 'msch', 'lgnic',
        'bottleneck_component', 'bottleneck_value'
    ]
    
    # Keep only columns that exist
    columns_to_keep = [col for col in columns_to_keep if col in df.columns]
    df = df[columns_to_keep]
    
    # Save processed data
    if verbose:
        print(f"Saving processed data to {output_path}...")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(output_path, index=False)
    
    if verbose:
        print(f"✓ Processed data saved: {len(df)} rows, {len(df.columns)} columns")
        
        # Print some statistics
        print("\nData summary:")
        print(f"  Countries: {df['country'].nunique()}")
        print(f"  Regions: {df['gdlcode'].nunique()}")
        print(f"  Years: {df['year'].min()} - {df['year'].max()}")
        print(f"  Average HDI: {df['shdi'].mean():.3f}")
        
        # Bottleneck distribution
        print("\nBottleneck distribution:")
        bottleneck_counts = df['bottleneck_component'].value_counts()
        for component, count in bottleneck_counts.items():
            percentage = (count / len(df)) * 100
            print(f"  {component}: {count} ({percentage:.1f}%)")
    
    return df


if __name__ == "__main__":
    # Define paths
    project_root = Path(__file__).resolve().parents[2]
    raw_path = project_root / "data" / "raw" / "Subnational HDI Data v8.3.csv"
    output_path = project_root / "data" / "processed" / "subnational_hdi_processed.csv"
    
    # Process data
    process_hdi_data(raw_path, output_path)

