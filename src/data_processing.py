"""
Data loading and processing functions for the Subnational HDI Explorer.
"""

import pandas as pd
import numpy as np
from pathlib import Path
from typing import Optional, Tuple


def load_raw_data(filepath: str) -> pd.DataFrame:
    """
    Load the raw subnational HDI dataset.
    
    Args:
        filepath: Path to the raw CSV file
        
    Returns:
        DataFrame with raw data
    """
    if not Path(filepath).exists():
        raise FileNotFoundError(f"Data file not found: {filepath}")
    
    df = pd.read_csv(filepath)
    return df


def validate_data(df: pd.DataFrame) -> Tuple[bool, list]:
    """
    Validate that the dataset has required columns and proper structure.
    
    Args:
        df: DataFrame to validate
        
    Returns:
        Tuple of (is_valid, list_of_issues)
    """
    required_columns = [
        'isocode3', 'country', 'gdlcode', 'level', 'region', 'year',
        'shdi', 'healthindex', 'edindex', 'incindex'
    ]
    
    issues = []
    
    # Check for required columns
    missing_columns = [col for col in required_columns if col not in df.columns]
    if missing_columns:
        issues.append(f"Missing required columns: {missing_columns}")
    
    # Check for empty dataframe
    if len(df) == 0:
        issues.append("DataFrame is empty")
    
    # Check data types
    if 'year' in df.columns and not pd.api.types.is_numeric_dtype(df['year']):
        issues.append("Year column is not numeric")
    
    is_valid = len(issues) == 0
    return is_valid, issues


def filter_subnational_data(df: pd.DataFrame) -> pd.DataFrame:
    """
    Filter dataset to include only subnational regions.
    
    Args:
        df: DataFrame with raw data
        
    Returns:
        DataFrame filtered to subnational level only
    """
    if 'level' not in df.columns:
        raise ValueError("Dataset does not contain 'level' column")
    
    subnational_df = df[df['level'] == 'Subnat'].copy()
    return subnational_df


def clean_data(df: pd.DataFrame) -> pd.DataFrame:
    """
    Clean and prepare the data for analysis.
    
    Args:
        df: DataFrame to clean
        
    Returns:
        Cleaned DataFrame
    """
    df = df.copy()
    
    # Convert numeric columns
    numeric_columns = ['year', 'shdi', 'healthindex', 'edindex', 'incindex',
                      'lifexp', 'esch', 'msch', 'lgnic']
    
    for col in numeric_columns:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce')
    
    # Remove duplicates based on region-year combination
    df = df.drop_duplicates(subset=['gdlcode', 'year'], keep='first')
    
    # Sort by region and year
    df = df.sort_values(['gdlcode', 'year']).reset_index(drop=True)
    
    return df


def add_continent_mapping(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add continent information based on ISO country codes.
    
    This is a simplified mapping based on common country groupings.
    
    Args:
        df: DataFrame with country codes
        
    Returns:
        DataFrame with continent column added
    """
    df = df.copy()
    
    # Simplified continent mapping based on ISO3 codes
    continent_mapping = {
        # Africa
        'DZA': 'Africa', 'AGO': 'Africa', 'BEN': 'Africa', 'BWA': 'Africa',
        'BFA': 'Africa', 'BDI': 'Africa', 'CMR': 'Africa', 'CPV': 'Africa',
        'CAF': 'Africa', 'TCD': 'Africa', 'COM': 'Africa', 'COG': 'Africa',
        'COD': 'Africa', 'CIV': 'Africa', 'DJI': 'Africa', 'EGY': 'Africa',
        'GNQ': 'Africa', 'ERI': 'Africa', 'ETH': 'Africa', 'GAB': 'Africa',
        'GMB': 'Africa', 'GHA': 'Africa', 'GIN': 'Africa', 'GNB': 'Africa',
        'KEN': 'Africa', 'LSO': 'Africa', 'LBR': 'Africa', 'LBY': 'Africa',
        'MDG': 'Africa', 'MWI': 'Africa', 'MLI': 'Africa', 'MRT': 'Africa',
        'MUS': 'Africa', 'MAR': 'Africa', 'MOZ': 'Africa', 'NAM': 'Africa',
        'NER': 'Africa', 'NGA': 'Africa', 'RWA': 'Africa', 'STP': 'Africa',
        'SEN': 'Africa', 'SYC': 'Africa', 'SLE': 'Africa', 'SOM': 'Africa',
        'ZAF': 'Africa', 'SSD': 'Africa', 'SDN': 'Africa', 'SWZ': 'Africa',
        'TZA': 'Africa', 'TGO': 'Africa', 'TUN': 'Africa', 'UGA': 'Africa',
        'ZMB': 'Africa', 'ZWE': 'Africa',
        
        # Asia
        'AFG': 'Asia', 'ARM': 'Asia', 'AZE': 'Asia', 'BHR': 'Asia',
        'BGD': 'Asia', 'BTN': 'Asia', 'BRN': 'Asia', 'KHM': 'Asia',
        'CHN': 'Asia', 'GEO': 'Asia', 'IND': 'Asia', 'IDN': 'Asia',
        'IRN': 'Asia', 'IRQ': 'Asia', 'ISR': 'Asia', 'JPN': 'Asia',
        'JOR': 'Asia', 'KAZ': 'Asia', 'KWT': 'Asia', 'KGZ': 'Asia',
        'LAO': 'Asia', 'LBN': 'Asia', 'MYS': 'Asia', 'MDV': 'Asia',
        'MNG': 'Asia', 'MMR': 'Asia', 'NPL': 'Asia', 'PRK': 'Asia',
        'OMN': 'Asia', 'PAK': 'Asia', 'PSE': 'Asia', 'PHL': 'Asia',
        'QAT': 'Asia', 'SAU': 'Asia', 'SGP': 'Asia', 'KOR': 'Asia',
        'LKA': 'Asia', 'SYR': 'Asia', 'TWN': 'Asia', 'TJK': 'Asia',
        'THA': 'Asia', 'TLS': 'Asia', 'TUR': 'Asia', 'TKM': 'Asia',
        'ARE': 'Asia', 'UZB': 'Asia', 'VNM': 'Asia', 'YEM': 'Asia',
        
        # Europe
        'ALB': 'Europe', 'AND': 'Europe', 'AUT': 'Europe', 'BLR': 'Europe',
        'BEL': 'Europe', 'BIH': 'Europe', 'BGR': 'Europe', 'HRV': 'Europe',
        'CYP': 'Europe', 'CZE': 'Europe', 'DNK': 'Europe', 'EST': 'Europe',
        'FIN': 'Europe', 'FRA': 'Europe', 'DEU': 'Europe', 'GRC': 'Europe',
        'HUN': 'Europe', 'ISL': 'Europe', 'IRL': 'Europe', 'ITA': 'Europe',
        'XKX': 'Europe', 'LVA': 'Europe', 'LIE': 'Europe', 'LTU': 'Europe',
        'LUX': 'Europe', 'MKD': 'Europe', 'MLT': 'Europe', 'MDA': 'Europe',
        'MCO': 'Europe', 'MNE': 'Europe', 'NLD': 'Europe', 'NOR': 'Europe',
        'POL': 'Europe', 'PRT': 'Europe', 'ROU': 'Europe', 'RUS': 'Europe',
        'SMR': 'Europe', 'SRB': 'Europe', 'SVK': 'Europe', 'SVN': 'Europe',
        'ESP': 'Europe', 'SWE': 'Europe', 'CHE': 'Europe', 'UKR': 'Europe',
        'GBR': 'Europe', 'VAT': 'Europe',
        
        # North America
        'ATG': 'North America', 'BHS': 'North America', 'BRB': 'North America',
        'BLZ': 'North America', 'CAN': 'North America', 'CRI': 'North America',
        'CUB': 'North America', 'DMA': 'North America', 'DOM': 'North America',
        'SLV': 'North America', 'GRD': 'North America', 'GTM': 'North America',
        'HTI': 'North America', 'HND': 'North America', 'JAM': 'North America',
        'MEX': 'North America', 'NIC': 'North America', 'PAN': 'North America',
        'KNA': 'North America', 'LCA': 'North America', 'VCT': 'North America',
        'TTO': 'North America', 'USA': 'North America',
        
        # South America
        'ARG': 'South America', 'BOL': 'South America', 'BRA': 'South America',
        'CHL': 'South America', 'COL': 'South America', 'ECU': 'South America',
        'GUY': 'South America', 'PRY': 'South America', 'PER': 'South America',
        'SUR': 'South America', 'URY': 'South America', 'VEN': 'South America',
        
        # Oceania
        'AUS': 'Oceania', 'FJI': 'Oceania', 'KIR': 'Oceania', 'MHL': 'Oceania',
        'FSM': 'Oceania', 'NRU': 'Oceania', 'NZL': 'Oceania', 'PLW': 'Oceania',
        'PNG': 'Oceania', 'WSM': 'Oceania', 'SLB': 'Oceania', 'TON': 'Oceania',
        'TUV': 'Oceania', 'VUT': 'Oceania',
    }
    
    df['continent'] = df['isocode3'].map(continent_mapping).fillna('Other')
    
    return df


def prepare_timeseries_data(df: pd.DataFrame) -> pd.DataFrame:
    """
    Prepare time series data for visualization.
    
    Args:
        df: DataFrame with processed data
        
    Returns:
        DataFrame with essential columns for time series
    """
    columns_to_keep = ['gdlcode', 'region', 'country', 'isocode3', 'continent', 'year', 
                       'shdi', 'healthindex', 'edindex', 'incindex',
                       'lifexp', 'esch', 'msch', 'lgnic']
    
    # Only keep columns that exist in the dataframe
    available_columns = [col for col in columns_to_keep if col in df.columns]
    timeseries_df = df[available_columns].copy()
    
    return timeseries_df


def process_all_data(raw_filepath: str = "data/raw/Subnational HDI Data v8.3.csv",
                     output_dir: str = "data/processed/") -> pd.DataFrame:
    """
    Complete data processing pipeline.
    Loads, filters, cleans and saves the subnational HDI data.
    
    Args:
        raw_filepath: Path to raw data file
        output_dir: Directory to save processed files
        
    Returns:
        Processed DataFrame
    """
    print("Loading raw data...")
    df = load_raw_data(raw_filepath)
    print(f"Loaded {len(df)} total observations")
    
    print("Validating data...")
    is_valid, issues = validate_data(df)
    if not is_valid:
        raise ValueError(f"Data validation failed: {issues}")
    
    print("Filtering subnational data...")
    df = filter_subnational_data(df)
    print(f"Filtered to {len(df)} subnational observations")
    
    print("Cleaning data...")
    df = clean_data(df)
    
    print("Adding continent mapping...")
    df = add_continent_mapping(df)
    
    # Save processed data
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    processed_filepath = output_path / "subnational_data.csv"
    
    print(f"Saving processed data to {processed_filepath}...")
    df.to_csv(processed_filepath, index=False)
    
    print("Data processing complete!")
    print(f"Regions have 'gdlcode' for unique identification and 'isocode3' for map visualization")
    
    return df


def load_processed_data(filepath: str = "data/processed/subnational_data.csv") -> pd.DataFrame:
    """
    Load pre-processed subnational HDI data.
    
    Args:
        filepath: Path to processed data file
        
    Returns:
        DataFrame with processed data
    """
    if not Path(filepath).exists():
        raise FileNotFoundError(
            f"Processed data file not found: {filepath}. "
            "Run process_all_data() first to generate processed files."
        )
    
    df = pd.read_csv(filepath)
    return df

