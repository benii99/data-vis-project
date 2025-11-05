"""
Tests for analysis functions.
"""

import pytest
import pandas as pd
import numpy as np
from src.analysis import (
    identify_bottleneck,
    add_bottleneck_analysis,
    get_regional_statistics
)


def test_identify_bottleneck_health():
    """Test bottleneck identification when health is lowest."""
    row = pd.Series({
        'healthindex': 0.5,
        'edindex': 0.7,
        'incindex': 0.8
    })
    
    component, value = identify_bottleneck(row)
    assert component == 'health'
    assert value == 0.5


def test_identify_bottleneck_education():
    """Test bottleneck identification when education is lowest."""
    row = pd.Series({
        'healthindex': 0.8,
        'edindex': 0.5,
        'incindex': 0.7
    })
    
    component, value = identify_bottleneck(row)
    assert component == 'education'
    assert value == 0.5


def test_identify_bottleneck_income():
    """Test bottleneck identification when income is lowest."""
    row = pd.Series({
        'healthindex': 0.7,
        'edindex': 0.8,
        'incindex': 0.4
    })
    
    component, value = identify_bottleneck(row)
    assert component == 'income'
    assert value == 0.4


def test_identify_bottleneck_with_nan():
    """Test bottleneck identification with missing values."""
    row = pd.Series({
        'healthindex': np.nan,
        'edindex': 0.7,
        'incindex': 0.8
    })
    
    component, value = identify_bottleneck(row)
    assert component == 'education'
    assert value == 0.7


def test_add_bottleneck_analysis():
    """Test adding bottleneck analysis to dataframe."""
    df = pd.DataFrame({
        'healthindex': [0.5, 0.8, 0.7],
        'edindex': [0.7, 0.6, 0.8],
        'incindex': [0.8, 0.9, 0.6]
    })
    
    result = add_bottleneck_analysis(df)
    
    assert 'bottleneck_component' in result.columns
    assert 'bottleneck_value' in result.columns
    assert result['bottleneck_component'].iloc[0] == 'health'
    assert result['bottleneck_component'].iloc[1] == 'education'
    assert result['bottleneck_component'].iloc[2] == 'income'


def test_get_regional_statistics():
    """Test regional statistics calculation."""
    df = pd.DataFrame({
        'year': [2020, 2020, 2020, 2020, 2020],
        'bottleneck_component': ['health', 'health', 'education', 'income', 'income']
    })
    
    stats = get_regional_statistics(df, year=2020)
    
    assert stats['total_regions'] == 5
    assert stats['health_count'] == 2
    assert stats['education_count'] == 1
    assert stats['income_count'] == 2
    assert stats['health_pct'] == 40.0
    assert stats['education_pct'] == 20.0
    assert stats['income_pct'] == 40.0


def test_get_regional_statistics_empty():
    """Test statistics with empty dataframe."""
    df = pd.DataFrame({
        'year': [],
        'bottleneck_component': []
    })
    
    stats = get_regional_statistics(df)
    
    assert stats['total_regions'] == 0
    assert stats['health_count'] == 0
    assert stats['education_count'] == 0
    assert stats['income_count'] == 0

