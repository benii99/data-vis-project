"""
Analysis functions for HDI component bottleneck detection.
"""

import pandas as pd
import numpy as np
from typing import Dict, Tuple


def identify_bottleneck(row: pd.Series) -> Tuple[str, float]:
    """
    Identify the bottleneck component for a region-year observation.
    
    The bottleneck is the component with the lowest index value,
    indicating which dimension limits overall human development.
    
    Args:
        row: DataFrame row containing healthindex, edindex, and incindex
        
    Returns:
        Tuple of (component_name, component_value)
    """
    components = {
        'health': row.get('healthindex', np.nan),
        'education': row.get('edindex', np.nan),
        'income': row.get('incindex', np.nan)
    }
    
    # Filter out NaN values
    valid_components = {k: v for k, v in components.items() if pd.notna(v)}
    
    if not valid_components:
        return ('unknown', np.nan)
    
    # Find minimum component
    bottleneck_component = min(valid_components, key=valid_components.get)
    bottleneck_value = valid_components[bottleneck_component]
    
    return (bottleneck_component, bottleneck_value)


def add_bottleneck_analysis(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add bottleneck analysis columns to the dataframe.
    
    Args:
        df: DataFrame with HDI component indices
        
    Returns:
        DataFrame with added bottleneck_component and bottleneck_value columns
    """
    df = df.copy()
    
    # Apply bottleneck identification
    bottleneck_results = df.apply(identify_bottleneck, axis=1)
    df['bottleneck_component'] = bottleneck_results.apply(lambda x: x[0])
    df['bottleneck_value'] = bottleneck_results.apply(lambda x: x[1])
    
    return df


def calculate_bottleneck_persistence(df: pd.DataFrame, region_col: str = 'gdlcode') -> pd.DataFrame:
    """
    Calculate how long each bottleneck persists for each region.
    
    Args:
        df: DataFrame with bottleneck analysis
        region_col: Column name for region identifier
        
    Returns:
        DataFrame with bottleneck persistence statistics
    """
    results = []
    
    for region in df[region_col].unique():
        region_data = df[df[region_col] == region].sort_values('year')
        
        if len(region_data) == 0:
            continue
        
        # Count bottleneck types
        bottleneck_counts = region_data['bottleneck_component'].value_counts()
        total_years = len(region_data)
        
        results.append({
            region_col: region,
            'total_years': total_years,
            'health_years': bottleneck_counts.get('health', 0),
            'education_years': bottleneck_counts.get('education', 0),
            'income_years': bottleneck_counts.get('income', 0),
            'health_pct': bottleneck_counts.get('health', 0) / total_years * 100,
            'education_pct': bottleneck_counts.get('education', 0) / total_years * 100,
            'income_pct': bottleneck_counts.get('income', 0) / total_years * 100,
        })
    
    return pd.DataFrame(results)


def get_bottleneck_transitions(df: pd.DataFrame, region_code: str) -> pd.DataFrame:
    """
    Get bottleneck transitions over time for a specific region.
    
    Args:
        df: DataFrame with bottleneck analysis
        region_code: Region identifier
        
    Returns:
        DataFrame with year-by-year bottleneck information
    """
    region_data = df[df['gdlcode'] == region_code].sort_values('year')
    
    if len(region_data) == 0:
        return pd.DataFrame()
    
    transitions = region_data[['year', 'bottleneck_component', 'bottleneck_value']].copy()
    
    # Identify when bottleneck changes
    transitions['changed'] = transitions['bottleneck_component'] != transitions['bottleneck_component'].shift(1)
    
    return transitions


def calculate_component_gaps(df: pd.DataFrame) -> pd.DataFrame:
    """
    Calculate the gap between bottleneck and other components.
    
    Args:
        df: DataFrame with HDI component indices
        
    Returns:
        DataFrame with gap analysis columns
    """
    df = df.copy()
    
    # Calculate maximum and average of components
    df['max_component'] = df[['healthindex', 'edindex', 'incindex']].max(axis=1)
    df['avg_component'] = df[['healthindex', 'edindex', 'incindex']].mean(axis=1)
    
    # Gap between minimum and maximum
    df['component_gap'] = df['max_component'] - df['bottleneck_value']
    
    # Relative gap as percentage
    df['relative_gap'] = (df['component_gap'] / df['max_component'] * 100).fillna(0)
    
    return df


def get_regional_statistics(df: pd.DataFrame, year: int = None) -> Dict:
    """
    Calculate aggregate statistics for bottleneck distribution.
    
    Args:
        df: DataFrame with bottleneck analysis
        year: Optional year to filter by (if None, uses all years)
        
    Returns:
        Dictionary with regional statistics
    """
    if year is not None:
        df = df[df['year'] == year]
    
    total_regions = len(df)
    
    if total_regions == 0:
        return {
            'total_regions': 0,
            'health_count': 0,
            'education_count': 0,
            'income_count': 0,
            'health_pct': 0,
            'education_pct': 0,
            'income_pct': 0
        }
    
    bottleneck_counts = df['bottleneck_component'].value_counts()
    
    return {
        'total_regions': total_regions,
        'health_count': bottleneck_counts.get('health', 0),
        'education_count': bottleneck_counts.get('education', 0),
        'income_count': bottleneck_counts.get('income', 0),
        'health_pct': bottleneck_counts.get('health', 0) / total_regions * 100,
        'education_pct': bottleneck_counts.get('education', 0) / total_regions * 100,
        'income_pct': bottleneck_counts.get('income', 0) / total_regions * 100
    }

