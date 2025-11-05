"""
Utility functions for the Subnational HDI Explorer.
"""

import yaml
from pathlib import Path
from typing import Dict, Any


def load_config(config_file: str) -> Dict[str, Any]:
    """
    Load a YAML configuration file.
    
    Args:
        config_file: Path to the YAML configuration file
        
    Returns:
        Dictionary containing configuration values
    """
    config_path = Path(config_file)
    if not config_path.exists():
        raise FileNotFoundError(f"Configuration file not found: {config_file}")
    
    with open(config_path, 'r') as f:
        config = yaml.safe_load(f)
    
    return config


def format_number(value: float, decimals: int = 3) -> str:
    """
    Format a number with specified decimal places.
    
    Args:
        value: Number to format
        decimals: Number of decimal places
        
    Returns:
        Formatted string
    """
    if value is None or (isinstance(value, float) and value != value):  # Check for None or NaN
        return "N/A"
    return f"{value:.{decimals}f}"


def get_component_name(component_key: str) -> str:
    """
    Convert component key to display name.
    
    Args:
        component_key: Component identifier ('health', 'education', 'income')
        
    Returns:
        Human-readable component name
    """
    component_names = {
        'health': 'Health',
        'education': 'Education',
        'income': 'Income'
    }
    return component_names.get(component_key, component_key.title())


def validate_year_range(start_year: int, end_year: int, min_year: int = 1990, max_year: int = 2022) -> bool:
    """
    Validate that year range is within acceptable bounds.
    
    Args:
        start_year: Starting year
        end_year: Ending year
        min_year: Minimum allowable year
        max_year: Maximum allowable year
        
    Returns:
        True if valid, False otherwise
    """
    return (min_year <= start_year <= max_year and 
            min_year <= end_year <= max_year and 
            start_year <= end_year)

