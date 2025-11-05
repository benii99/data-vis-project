"""
Tests for visualization functions.
"""

import pytest
import pandas as pd
import numpy as np
from src.visualizations import (
    create_hdi_map,
    create_bottleneck_map,
    create_evolution_chart
)


@pytest.fixture
def sample_data():
    """Create sample data for testing."""
    return pd.DataFrame({
        'isocode3': ['USA', 'CAN', 'MEX'] * 3,
        'country': ['United States', 'Canada', 'Mexico'] * 3,
        'region': ['California', 'Ontario', 'Jalisco'] * 3,
        'gdlcode': ['USAr101', 'CANr101', 'MEXr101'] * 3,
        'year': [2020, 2020, 2020, 2021, 2021, 2021, 2022, 2022, 2022],
        'shdi': [0.8, 0.85, 0.75, 0.81, 0.86, 0.76, 0.82, 0.87, 0.77],
        'healthindex': [0.9, 0.88, 0.8, 0.91, 0.89, 0.81, 0.92, 0.9, 0.82],
        'edindex': [0.75, 0.82, 0.7, 0.76, 0.83, 0.71, 0.77, 0.84, 0.72],
        'incindex': [0.8, 0.85, 0.75, 0.81, 0.86, 0.76, 0.82, 0.87, 0.77],
        'bottleneck_component': ['education', 'health', 'education'] * 3,
        'bottleneck_value': [0.75, 0.88, 0.7, 0.76, 0.89, 0.71, 0.77, 0.9, 0.72]
    })


def test_create_hdi_map_overall(sample_data):
    """Test creating overall HDI map."""
    fig = create_hdi_map(sample_data, year=2020, component='overall')
    
    assert fig is not None
    assert 'data' in fig
    assert len(fig.data) > 0


def test_create_hdi_map_health(sample_data):
    """Test creating health component map."""
    fig = create_hdi_map(sample_data, year=2020, component='health')
    
    assert fig is not None
    assert 'data' in fig


def test_create_hdi_map_education(sample_data):
    """Test creating education component map."""
    fig = create_hdi_map(sample_data, year=2020, component='education')
    
    assert fig is not None
    assert 'data' in fig


def test_create_hdi_map_income(sample_data):
    """Test creating income component map."""
    fig = create_hdi_map(sample_data, year=2020, component='income')
    
    assert fig is not None
    assert 'data' in fig


def test_create_hdi_map_invalid_component(sample_data):
    """Test that invalid component raises error."""
    with pytest.raises(ValueError):
        create_hdi_map(sample_data, year=2020, component='invalid')


def test_create_bottleneck_map(sample_data):
    """Test creating bottleneck map."""
    fig = create_bottleneck_map(sample_data, year=2020)
    
    assert fig is not None
    assert 'data' in fig
    assert len(fig.data) > 0


def test_create_evolution_chart(sample_data):
    """Test creating evolution chart for a region."""
    fig = create_evolution_chart(sample_data, region_code='USAr101')
    
    assert fig is not None
    assert 'data' in fig
    assert len(fig.data) == 3  # Three lines: health, education, income


def test_create_evolution_chart_no_data(sample_data):
    """Test evolution chart with non-existent region."""
    fig = create_evolution_chart(sample_data, region_code='INVALID')
    
    assert fig is not None
    # Should return a figure with an error message annotation

