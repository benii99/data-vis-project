"""
Tests for data processing functions.
"""

import pytest
import pandas as pd
import numpy as np
from src.data_processing import (
    validate_data,
    filter_subnational_data,
    clean_data,
    add_continent_mapping
)


def test_validate_data_with_valid_dataframe():
    """Test validation with a properly structured dataframe."""
    df = pd.DataFrame({
        'isocode3': ['USA', 'CAN'],
        'country': ['United States', 'Canada'],
        'gdlcode': ['USAr101', 'CANr101'],
        'level': ['Subnat', 'Subnat'],
        'region': ['California', 'Ontario'],
        'year': [2020, 2020],
        'shdi': [0.8, 0.85],
        'healthindex': [0.9, 0.88],
        'edindex': [0.75, 0.82],
        'incindex': [0.8, 0.85]
    })
    
    is_valid, issues = validate_data(df)
    assert is_valid
    assert len(issues) == 0


def test_validate_data_with_missing_columns():
    """Test validation with missing required columns."""
    df = pd.DataFrame({
        'isocode3': ['USA'],
        'country': ['United States']
    })
    
    is_valid, issues = validate_data(df)
    assert not is_valid
    assert len(issues) > 0


def test_filter_subnational_data():
    """Test filtering to keep only subnational data."""
    df = pd.DataFrame({
        'level': ['National', 'Subnat', 'Subnat', 'National'],
        'gdlcode': ['USA', 'USAr101', 'CANr101', 'CAN'],
        'region': ['United States', 'California', 'Ontario', 'Canada']
    })
    
    result = filter_subnational_data(df)
    assert len(result) == 2
    assert all(result['level'] == 'Subnat')


def test_clean_data_removes_duplicates():
    """Test that clean_data removes duplicate region-year combinations."""
    df = pd.DataFrame({
        'gdlcode': ['USAr101', 'USAr101', 'CANr101'],
        'year': [2020, 2020, 2020],
        'shdi': [0.8, 0.81, 0.85]
    })
    
    result = clean_data(df)
    assert len(result) == 2


def test_add_continent_mapping():
    """Test continent mapping for known country codes."""
    df = pd.DataFrame({
        'isocode3': ['USA', 'GBR', 'CHN', 'ZAF', 'BRA']
    })
    
    result = add_continent_mapping(df)
    assert 'continent' in result.columns
    assert result[result['isocode3'] == 'USA']['continent'].iloc[0] == 'North America'
    assert result[result['isocode3'] == 'GBR']['continent'].iloc[0] == 'Europe'
    assert result[result['isocode3'] == 'CHN']['continent'].iloc[0] == 'Asia'
    assert result[result['isocode3'] == 'ZAF']['continent'].iloc[0] == 'Africa'
    assert result[result['isocode3'] == 'BRA']['continent'].iloc[0] == 'South America'

