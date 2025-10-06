"""
Utility Functions Module
Helper functions for data manipulation and display
"""

import pandas as pd
import numpy as np
from pathlib import Path


# Data paths
PROCESSED_DATA_PATH = Path(__file__).parent.parent / "data" / "processed"


def load_processed_data():
    """
    Load all processed data files.
    
    Returns:
    --------
    dict
        Dictionary containing all processed DataFrames
    """
    data = {}
    
    # Load main components data
    components_file = PROCESSED_DATA_PATH / "hdi_components.csv"
    if components_file.exists():
        data['components'] = pd.read_csv(components_file)
    
    # Load clustering data
    clustering_file = PROCESSED_DATA_PATH / "clustering_data.csv"
    if clustering_file.exists():
        data['clustering'] = pd.read_csv(clustering_file)
    
    # Load time series data
    timeseries_files = {
        'hdi': 'timeseries_hdi.csv',
        'life_expectancy': 'timeseries_life_expectancy.csv',
        'expected_schooling': 'timeseries_expected_schooling.csv',
        'mean_schooling': 'timeseries_mean_schooling.csv',
        'gni': 'timeseries_gni.csv'
    }
    
    data['timeseries'] = {}
    for key, filename in timeseries_files.items():
        filepath = PROCESSED_DATA_PATH / filename
        if filepath.exists():
            data['timeseries'][key] = pd.read_csv(filepath)
    
    return data


def get_country_info(df, country_identifier):
    """
    Get detailed information for a specific country.
    
    Parameters:
    -----------
    df : pd.DataFrame
        Components DataFrame
    country_identifier : str
        Country name or ISO3 code
    
    Returns:
    --------
    pd.Series or None
        Row with country data, or None if not found
    """
    # Try to find by country name first
    country_data = df[df['Country'] == country_identifier]
    
    # If not found, try ISO3 code
    if country_data.empty:
        country_data = df[df['ISO3'] == country_identifier]
    
    if country_data.empty:
        return None
    
    return country_data.iloc[0]


def calculate_statistics(df, columns=None):
    """
    Calculate summary statistics for specified columns.
    
    Parameters:
    -----------
    df : pd.DataFrame
        Data to analyze
    columns : list, optional
        List of column names. If None, uses numeric columns.
    
    Returns:
    --------
    pd.DataFrame
        Summary statistics
    """
    if columns is None:
        columns = df.select_dtypes(include=[np.number]).columns.tolist()
    
    stats = df[columns].describe()
    
    return stats


def format_display_data(series, decimal_places=3):
    """
    Format data for display in the UI.
    
    Parameters:
    -----------
    series : pd.Series
        Data to format
    decimal_places : int
        Number of decimal places
    
    Returns:
    --------
    dict
        Formatted data for display
    """
    formatted = {}
    
    for key, value in series.items():
        if isinstance(value, (int, float)) and not pd.isna(value):
            formatted[key] = f"{value:.{decimal_places}f}"
        else:
            formatted[key] = str(value) if not pd.isna(value) else 'N/A'
    
    return formatted


def get_year_columns(df, start_year=None, end_year=None):
    """
    Get column names for a specific year range from time series data.
    
    Parameters:
    -----------
    df : pd.DataFrame
        Time series DataFrame
    start_year : int, optional
        Starting year
    end_year : int, optional
        Ending year
    
    Returns:
    --------
    list
        List of column names within the year range
    """
    # Extract all year columns
    year_cols = [col for col in df.columns if '(' in col and ')' in col]
    
    if start_year is None and end_year is None:
        return year_cols
    
    # Filter by year range
    filtered_cols = []
    for col in year_cols:
        try:
            year = int(col.split('(')[1].split(')')[0])
            if start_year is not None and year < start_year:
                continue
            if end_year is not None and year > end_year:
                continue
            filtered_cols.append(col)
        except (ValueError, IndexError):
            continue
    
    return filtered_cols


def calculate_mean_for_years(df, year_columns):
    """
    Calculate mean values across specified year columns for each country.
    
    Parameters:
    -----------
    df : pd.DataFrame
        Time series DataFrame
    year_columns : list
        List of year column names
    
    Returns:
    --------
    pd.DataFrame
        DataFrame with mean values
    """
    result = df[['ISO3', 'Country']].copy()
    result['Mean_Value'] = df[year_columns].mean(axis=1)
    
    return result


def get_countries_by_category(df, category_column='HDI_Category'):
    """
    Get list of countries grouped by category.
    
    Parameters:
    -----------
    df : pd.DataFrame
        Components DataFrame
    category_column : str
        Column name for categories
    
    Returns:
    --------
    dict
        Dictionary mapping categories to country lists
    """
    if category_column not in df.columns:
        return {}
    
    categories = {}
    for category in df[category_column].dropna().unique():
        countries = df[df[category_column] == category]['Country'].tolist()
        categories[category] = sorted(countries)
    
    return categories


def get_countries_by_bottleneck(df):
    """
    Get list of countries grouped by their bottleneck component.
    
    Parameters:
    -----------
    df : pd.DataFrame
        Components DataFrame with bottleneck information
    
    Returns:
    --------
    dict
        Dictionary mapping bottleneck components to country lists
    """
    if 'Bottleneck_Component' not in df.columns:
        return {}
    
    bottlenecks = {}
    for component in df['Bottleneck_Component'].dropna().unique():
        countries = df[df['Bottleneck_Component'] == component]['Country'].tolist()
        bottlenecks[component] = sorted(countries)
    
    return bottlenecks


def filter_data(df, filters):
    """
    Apply multiple filters to a DataFrame.
    
    Parameters:
    -----------
    df : pd.DataFrame
        Data to filter
    filters : dict
        Dictionary of column:value pairs for filtering
    
    Returns:
    --------
    pd.DataFrame
        Filtered DataFrame
    """
    filtered_df = df.copy()
    
    for column, value in filters.items():
        if column in filtered_df.columns:
            if isinstance(value, (list, tuple)):
                filtered_df = filtered_df[filtered_df[column].isin(value)]
            else:
                filtered_df = filtered_df[filtered_df[column] == value]
    
    return filtered_df


def get_regional_statistics(df, region_column='Region'):
    """
    Calculate statistics by region.
    
    Parameters:
    -----------
    df : pd.DataFrame
        Components DataFrame
    region_column : str
        Column name for regions
    
    Returns:
    --------
    pd.DataFrame
        Regional statistics
    """
    if region_column not in df.columns:
        return pd.DataFrame()
    
    numeric_cols = ['HDI', 'Health_Index', 'Education_Index', 'Income_Index']
    available_cols = [col for col in numeric_cols if col in df.columns]
    
    regional_stats = df.groupby(region_column)[available_cols].agg(['mean', 'median', 'std']).round(3)
    
    return regional_stats
