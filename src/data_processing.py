"""
Data Processing Module
Handles loading, cleaning, and preprocessing of HDI data
"""

import pandas as pd
import numpy as np
from pathlib import Path


# Constants
RAW_DATA_PATH = Path(__file__).parent.parent / "data" / "raw" / "data-raw.csv"
PROCESSED_DATA_PATH = Path(__file__).parent.parent / "data" / "processed"

# HDI Component Bounds (for normalization)
# Source: UNDP Technical Notes
LIFE_EXPECTANCY_MIN = 20
LIFE_EXPECTANCY_MAX = 85

SCHOOLING_MAX = 18  # Max years of schooling

GNI_MIN = 100
GNI_MAX = 75000


def load_hdi_data(file_path=None):
    """
    Load the raw HDI dataset from CSV file.
    
    Parameters:
    -----------
    file_path : str or Path, optional
        Path to the CSV file. If None, uses default RAW_DATA_PATH.
    
    Returns:
    --------
    pd.DataFrame
        Raw HDI data
    """
    if file_path is None:
        file_path = RAW_DATA_PATH
    
    print(f"Loading HDI data from {file_path}...")
    df = pd.read_csv(file_path)
    print(f"Loaded {len(df)} countries with {len(df.columns)} columns")
    
    return df


def clean_data(df):
    """
    Clean the HDI dataset:
    - Handle missing values
    - Convert data types
    - Filter out aggregate/regional entries
    - Standardize country names
    
    Parameters:
    -----------
    df : pd.DataFrame
        Raw HDI data
    
    Returns:
    --------
    pd.DataFrame
        Cleaned HDI data
    """
    print("Cleaning data...")
    
    # Create a copy to avoid modifying original
    df_clean = df.copy()
    
    # Convert numeric columns (some might be strings due to '..' notation for missing)
    # Identify all numeric columns (HDI, Life Expectancy, etc.)
    numeric_cols = [col for col in df_clean.columns if any(str(year) in str(col) for year in range(1990, 2023))]
    
    for col in numeric_cols:
        df_clean[col] = pd.to_numeric(df_clean[col], errors='coerce')
    
    # Remove rows where Country is null or contains aggregate regions
    # (Some datasets include world regions as entries)
    if 'Country' in df_clean.columns:
        df_clean = df_clean[df_clean['Country'].notna()]
    
    # Fill missing ISO3 codes if needed
    df_clean['ISO3'] = df_clean['ISO3'].fillna('UNK')
    
    print(f"Cleaned data: {len(df_clean)} countries remaining")
    
    return df_clean


def calculate_hdi_components(df, year=2021):
    """
    Calculate the contribution of each HDI component (Health, Education, Income)
    for a specific year.
    
    The HDI is calculated as the geometric mean of three dimension indices:
    - Health Index: Based on Life Expectancy
    - Education Index: Based on Mean Years of Schooling and Expected Years of Schooling
    - Income Index: Based on GNI per capita (PPP)
    
    Parameters:
    -----------
    df : pd.DataFrame
        Cleaned HDI data
    year : int
        Year for which to calculate components (default: 2021)
    
    Returns:
    --------
    pd.DataFrame
        DataFrame with component indices and contributions
    """
    print(f"Calculating HDI components for year {year}...")
    
    # Create result dataframe with basic info
    result = pd.DataFrame()
    result['ISO3'] = df['ISO3']
    result['Country'] = df['Country']
    
    # Add categorical groupings
    if 'Human Development Groups' in df.columns:
        result['HDI_Category'] = df['Human Development Groups']
    if 'UNDP Developing Regions' in df.columns:
        result['Region'] = df['UNDP Developing Regions']
    if 'HDI Rank (2021)' in df.columns:
        result['HDI_Rank'] = df['HDI Rank (2021)']
    
    # Extract main HDI value
    hdi_col = f'Human Development Index ({year})'
    if hdi_col in df.columns:
        result['HDI'] = df[hdi_col]
    
    # === HEALTH INDEX (Life Expectancy) ===
    life_exp_col = f'Life Expectancy at Birth ({year})'
    if life_exp_col in df.columns:
        result['Life_Expectancy'] = df[life_exp_col]
        result['Health_Index'] = (result['Life_Expectancy'] - LIFE_EXPECTANCY_MIN) / (LIFE_EXPECTANCY_MAX - LIFE_EXPECTANCY_MIN)
        # Clip to [0, 1]
        result['Health_Index'] = result['Health_Index'].clip(0, 1)
    
    # === EDUCATION INDEX ===
    mean_schooling_col = f'Mean Years of Schooling ({year})'
    expected_schooling_col = f'Expected Years of Schooling ({year})'
    
    if mean_schooling_col in df.columns:
        result['Mean_Years_Schooling'] = df[mean_schooling_col]
        result['Mean_Schooling_Index'] = result['Mean_Years_Schooling'] / SCHOOLING_MAX
        result['Mean_Schooling_Index'] = result['Mean_Schooling_Index'].clip(0, 1)
    
    if expected_schooling_col in df.columns:
        result['Expected_Years_Schooling'] = df[expected_schooling_col]
        result['Expected_Schooling_Index'] = result['Expected_Years_Schooling'] / SCHOOLING_MAX
        result['Expected_Schooling_Index'] = result['Expected_Schooling_Index'].clip(0, 1)
    
    # Education Index is the average of the two schooling indices
    if 'Mean_Schooling_Index' in result.columns and 'Expected_Schooling_Index' in result.columns:
        result['Education_Index'] = (result['Mean_Schooling_Index'] + result['Expected_Schooling_Index']) / 2
    
    # === INCOME INDEX (GNI per capita) ===
    gni_col = f'Gross National Income Per Capita ({year})'
    if gni_col in df.columns:
        result['GNI_Per_Capita'] = df[gni_col]
        # GNI uses logarithmic transformation
        result['Income_Index'] = (np.log(result['GNI_Per_Capita']) - np.log(GNI_MIN)) / (np.log(GNI_MAX) - np.log(GNI_MIN))
        result['Income_Index'] = result['Income_Index'].clip(0, 1)
    
    # === CALCULATE COMPONENT CONTRIBUTIONS ===
    # Each component contributes to the geometric mean
    # We calculate the relative "weight" or contribution of each
    
    if all(col in result.columns for col in ['Health_Index', 'Education_Index', 'Income_Index']):
        # Calculate geometric mean (this should approximately equal HDI)
        result['HDI_Calculated'] = (result['Health_Index'] * result['Education_Index'] * result['Income_Index']) ** (1/3)
        
        # Calculate normalized contributions (which component is relatively stronger/weaker)
        # These show the relative performance in each dimension
        result['Health_Contribution'] = result['Health_Index'] / result['HDI_Calculated']
        result['Education_Contribution'] = result['Education_Index'] / result['HDI_Calculated']
        result['Income_Contribution'] = result['Income_Index'] / result['HDI_Calculated']
        
        # Identify the bottleneck (weakest component)
        indices = result[['Health_Index', 'Education_Index', 'Income_Index']]
        result['Bottleneck_Component'] = indices.idxmin(axis=1).str.replace('_Index', '')
        result['Bottleneck_Value'] = indices.min(axis=1)
        
        # Calculate the gap from the strongest component
        result['Strongest_Component'] = indices.idxmax(axis=1).str.replace('_Index', '')
        result['Strongest_Value'] = indices.max(axis=1)
        result['Component_Gap'] = result['Strongest_Value'] - result['Bottleneck_Value']
    
    # Remove rows with missing critical data
    critical_cols = ['HDI', 'Health_Index', 'Education_Index', 'Income_Index']
    result = result.dropna(subset=critical_cols)
    
    print(f"Calculated components for {len(result)} countries")
    
    return result


def extract_time_series(df, countries=None):
    """
    Extract time series data for HDI and its components for selected countries.
    
    Parameters:
    -----------
    df : pd.DataFrame
        Cleaned HDI data
    countries : list, optional
        List of country names or ISO3 codes. If None, includes all countries.
    
    Returns:
    --------
    dict
        Dictionary with time series DataFrames for each indicator
    """
    print("Extracting time series data...")
    
    if countries is not None:
        # Filter to selected countries
        df = df[df['Country'].isin(countries) | df['ISO3'].isin(countries)]
    
    years = range(1990, 2022)
    
    time_series = {}
    
    # HDI time series
    hdi_cols = [f'Human Development Index ({year})' for year in years]
    hdi_cols = [col for col in hdi_cols if col in df.columns]
    time_series['HDI'] = df[['ISO3', 'Country'] + hdi_cols].copy()
    
    # Life Expectancy time series
    life_cols = [f'Life Expectancy at Birth ({year})' for year in years]
    life_cols = [col for col in life_cols if col in df.columns]
    time_series['Life_Expectancy'] = df[['ISO3', 'Country'] + life_cols].copy()
    
    # Expected Years of Schooling
    exp_school_cols = [f'Expected Years of Schooling ({year})' for year in years]
    exp_school_cols = [col for col in exp_school_cols if col in df.columns]
    time_series['Expected_Schooling'] = df[['ISO3', 'Country'] + exp_school_cols].copy()
    
    # Mean Years of Schooling
    mean_school_cols = [f'Mean Years of Schooling ({year})' for year in years]
    mean_school_cols = [col for col in mean_school_cols if col in df.columns]
    time_series['Mean_Schooling'] = df[['ISO3', 'Country'] + mean_school_cols].copy()
    
    # GNI per capita
    gni_cols = [f'Gross National Income Per Capita ({year})' for year in years]
    gni_cols = [col for col in gni_cols if col in df.columns]
    time_series['GNI'] = df[['ISO3', 'Country'] + gni_cols].copy()
    
    print(f"Extracted time series for {len(df)} countries")
    
    return time_series


def prepare_clustering_data(components_df):
    """
    Prepare data specifically for clustering analysis.
    Returns a clean dataframe with only the three component indices.
    
    Parameters:
    -----------
    components_df : pd.DataFrame
        DataFrame with calculated components
    
    Returns:
    --------
    pd.DataFrame
        DataFrame ready for clustering (only numeric indices)
    """
    print("Preparing data for clustering...")
    
    # Select only the three component indices
    clustering_cols = ['ISO3', 'Country', 'Health_Index', 'Education_Index', 'Income_Index']
    clustering_df = components_df[clustering_cols].copy()
    
    # Remove any remaining NaN values
    clustering_df = clustering_df.dropna()
    
    print(f"Prepared {len(clustering_df)} countries for clustering")
    
    return clustering_df


def save_processed_data(components_df, time_series_dict, clustering_df):
    """
    Save all processed data to files.
    
    Parameters:
    -----------
    components_df : pd.DataFrame
        DataFrame with calculated components
    time_series_dict : dict
        Dictionary of time series DataFrames
    clustering_df : pd.DataFrame
        DataFrame prepared for clustering
    """
    print("Saving processed data...")
    
    # Ensure output directory exists
    PROCESSED_DATA_PATH.mkdir(parents=True, exist_ok=True)
    
    # Save main components data
    components_file = PROCESSED_DATA_PATH / "hdi_components.csv"
    components_df.to_csv(components_file, index=False)
    print(f"Saved components data to {components_file}")
    
    # Save clustering data
    clustering_file = PROCESSED_DATA_PATH / "clustering_data.csv"
    clustering_df.to_csv(clustering_file, index=False)
    print(f"Saved clustering data to {clustering_file}")
    
    # Save time series data
    for key, df in time_series_dict.items():
        ts_file = PROCESSED_DATA_PATH / f"timeseries_{key.lower()}.csv"
        df.to_csv(ts_file, index=False)
        print(f"Saved {key} time series to {ts_file}")
    
    print("All processed data saved successfully!")


def process_all_data(raw_file_path=None, year=2021):
    """
    Main pipeline: Load, clean, process, and save all data.
    
    Parameters:
    -----------
    raw_file_path : str or Path, optional
        Path to raw data file
    year : int
        Year for component calculations
    
    Returns:
    --------
    tuple
        (components_df, time_series_dict, clustering_df)
    """
    print("=" * 60)
    print("HDI DATA PROCESSING PIPELINE")
    print("=" * 60)
    
    # Step 1: Load data
    df_raw = load_hdi_data(raw_file_path)
    
    # Step 2: Clean data
    df_clean = clean_data(df_raw)
    
    # Step 3: Calculate HDI components
    components_df = calculate_hdi_components(df_clean, year=year)
    
    # Step 4: Extract time series
    time_series_dict = extract_time_series(df_clean)
    
    # Step 5: Prepare clustering data
    clustering_df = prepare_clustering_data(components_df)
    
    # Step 6: Save all processed data
    save_processed_data(components_df, time_series_dict, clustering_df)
    
    print("=" * 60)
    print("PROCESSING COMPLETE!")
    print("=" * 60)
    
    # Print summary statistics
    print("\nSummary Statistics:")
    print(f"Total countries processed: {len(components_df)}")
    print(f"\nHDI Categories:")
    if 'HDI_Category' in components_df.columns:
        print(components_df['HDI_Category'].value_counts())
    print(f"\nBottleneck Components:")
    print(components_df['Bottleneck_Component'].value_counts())
    
    return components_df, time_series_dict, clustering_df


# If run directly, execute the full pipeline
if __name__ == "__main__":
    components, time_series, clustering = process_all_data()
    
    # Display a sample of the results
    print("\n" + "=" * 60)
    print("SAMPLE RESULTS (Top 10 countries by HDI):")
    print("=" * 60)
    print(components.nlargest(10, 'HDI')[['Country', 'HDI', 'Health_Index', 'Education_Index', 'Income_Index', 'Bottleneck_Component']])
