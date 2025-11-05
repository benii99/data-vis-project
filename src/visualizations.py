"""
Visualization functions for the Subnational HDI Explorer.
"""

import plotly.express as px
import plotly.graph_objects as go
import pandas as pd
import numpy as np
from typing import Optional, Dict, Any


def create_hdi_map(df: pd.DataFrame, 
                   year: int, 
                   component: str = 'overall',
                   config: Dict[str, Any] = None) -> go.Figure:
    """
    Create a choropleth map showing HDI or component values.
    
    Args:
        df: DataFrame with HDI data
        year: Year to display
        component: 'overall', 'health', 'education', or 'income'
        config: Visualization configuration dictionary
        
    Returns:
        Plotly figure object
    """
    if config is None:
        config = {
            'colors': {
                'hdi_scale': 'RdYlGn',
                'health_scale': 'Reds',
                'education_scale': 'Blues',
                'income_scale': 'YlOrBr'
            },
            'map': {
                'projection': 'natural earth',
                'height': 600
            }
        }
    
    # Filter data for the specified year
    year_data = df[df['year'] == year].copy()
    
    # Select column and color scale based on component
    if component == 'overall':
        value_col = 'shdi'
        color_scale = config['colors']['hdi_scale']
        title = f'Subnational Human Development Index - {year}'
        label = 'HDI'
    elif component == 'health':
        value_col = 'healthindex'
        color_scale = config['colors']['health_scale']
        title = f'Health Index - {year}'
        label = 'Health Index'
    elif component == 'education':
        value_col = 'edindex'
        color_scale = config['colors']['education_scale']
        title = f'Education Index - {year}'
        label = 'Education Index'
    elif component == 'income':
        value_col = 'incindex'
        color_scale = config['colors']['income_scale']
        title = f'Income Index - {year}'
        label = 'Income Index'
    else:
        raise ValueError(f"Invalid component: {component}")
    
    # Create hover text
    year_data['hover_text'] = (
        '<b>' + year_data['region'] + '</b><br>' +
        year_data['country'] + '<br>' +
        label + ': ' + year_data[value_col].apply(lambda x: f'{x:.3f}' if pd.notna(x) else 'N/A')
    )
    
    # Create map
    fig = px.choropleth(
        year_data,
        locations='isocode3',
        locationmode='ISO-3',
        color=value_col,
        hover_name='region',
        hover_data={
            'country': True,
            value_col: ':.3f',
            'isocode3': False
        },
        color_continuous_scale=color_scale,
        range_color=[0, 1],
        labels={value_col: label}
    )
    
    fig.update_layout(
        title=title,
        geo=dict(
            projection_type=config['map']['projection'],
            showframe=False,
            showcoastlines=True,
            showcountries=True
        ),
        height=config['map']['height'],
        margin=dict(l=0, r=0, t=50, b=0)
    )
    
    return fig


def create_bottleneck_map(df: pd.DataFrame, 
                          year: int,
                          config: Dict[str, Any] = None) -> go.Figure:
    """
    Create a choropleth map showing bottleneck components.
    
    Args:
        df: DataFrame with bottleneck analysis
        year: Year to display
        config: Visualization configuration dictionary
        
    Returns:
        Plotly figure object
    """
    if config is None:
        config = {
            'colors': {
                'bottleneck_colors': {
                    'health': '#e74c3c',
                    'education': '#3498db',
                    'income': '#f39c12'
                }
            },
            'map': {
                'projection': 'natural earth',
                'height': 600
            }
        }
    
    # Filter data for the specified year
    year_data = df[df['year'] == year].copy()
    
    # Create color mapping
    color_map = config['colors']['bottleneck_colors']
    year_data['bottleneck_color'] = year_data['bottleneck_component'].map(color_map)
    
    # Create hover text
    year_data['hover_text'] = (
        '<b>' + year_data['region'] + '</b><br>' +
        year_data['country'] + '<br>' +
        'Bottleneck: ' + year_data['bottleneck_component'].str.title() + '<br>' +
        'Value: ' + year_data['bottleneck_value'].apply(lambda x: f'{x:.3f}' if pd.notna(x) else 'N/A')
    )
    
    # Create discrete color mapping for bottleneck types
    fig = px.choropleth(
        year_data,
        locations='isocode3',
        locationmode='ISO-3',
        color='bottleneck_component',
        hover_name='region',
        hover_data={
            'country': True,
            'bottleneck_component': True,
            'bottleneck_value': ':.3f',
            'isocode3': False
        },
        color_discrete_map=color_map,
        category_orders={'bottleneck_component': ['health', 'education', 'income']},
        labels={'bottleneck_component': 'Bottleneck Component'}
    )
    
    fig.update_layout(
        title=f'HDI Bottleneck Components - {year}',
        geo=dict(
            projection_type=config['map']['projection'],
            showframe=False,
            showcoastlines=True,
            showcountries=True
        ),
        height=config['map']['height'],
        margin=dict(l=0, r=0, t=50, b=0),
        legend=dict(
            title='Limiting Factor',
            orientation='h',
            yanchor='bottom',
            y=-0.1,
            xanchor='center',
            x=0.5
        )
    )
    
    return fig


def create_evolution_chart(df: pd.DataFrame, 
                          region_code: str,
                          config: Dict[str, Any] = None) -> go.Figure:
    """
    Create a line chart showing component evolution over time for a region.
    
    Args:
        df: DataFrame with time series data
        region_code: Region identifier (gdlcode)
        config: Visualization configuration dictionary
        
    Returns:
        Plotly figure object
    """
    if config is None:
        config = {
            'colors': {
                'line_colors': {
                    'health': '#e74c3c',
                    'education': '#3498db',
                    'income': '#f39c12'
                }
            },
            'chart': {
                'height': 400
            }
        }
    
    # Filter data for the specified region
    region_data = df[df['gdlcode'] == region_code].sort_values('year')
    
    if len(region_data) == 0:
        # Return empty figure if no data
        fig = go.Figure()
        fig.add_annotation(
            text="No data available for this region",
            xref="paper",
            yref="paper",
            x=0.5,
            y=0.5,
            showarrow=False,
            font=dict(size=14)
        )
        return fig
    
    # Get region name
    region_name = region_data['region'].iloc[0] if 'region' in region_data.columns else region_code
    country_name = region_data['country'].iloc[0] if 'country' in region_data.columns else ''
    
    # Create figure
    fig = go.Figure()
    
    colors = config['colors']['line_colors']
    
    # Add lines for each component
    fig.add_trace(go.Scatter(
        x=region_data['year'],
        y=region_data['healthindex'],
        mode='lines+markers',
        name='Health',
        line=dict(color=colors['health'], width=2),
        marker=dict(size=6)
    ))
    
    fig.add_trace(go.Scatter(
        x=region_data['year'],
        y=region_data['edindex'],
        mode='lines+markers',
        name='Education',
        line=dict(color=colors['education'], width=2),
        marker=dict(size=6)
    ))
    
    fig.add_trace(go.Scatter(
        x=region_data['year'],
        y=region_data['incindex'],
        mode='lines+markers',
        name='Income',
        line=dict(color=colors['income'], width=2),
        marker=dict(size=6)
    ))
    
    # Add background shading for bottleneck periods
    if 'bottleneck_component' in region_data.columns:
        for i in range(len(region_data) - 1):
            bottleneck = region_data.iloc[i]['bottleneck_component']
            year_start = region_data.iloc[i]['year']
            year_end = region_data.iloc[i + 1]['year']
            
            if bottleneck in colors:
                fig.add_vrect(
                    x0=year_start,
                    x1=year_end,
                    fillcolor=colors[bottleneck],
                    opacity=0.1,
                    layer="below",
                    line_width=0
                )
    
    # Update layout
    title_text = f'Component Evolution: {region_name}'
    if country_name:
        title_text += f' ({country_name})'
    
    fig.update_layout(
        title=title_text,
        xaxis_title='Year',
        yaxis_title='Index Value',
        yaxis=dict(range=[0, 1]),
        height=config['chart']['height'],
        hovermode='x unified',
        legend=dict(
            orientation='h',
            yanchor='bottom',
            y=1.02,
            xanchor='right',
            x=1
        )
    )
    
    return fig


def create_bottleneck_distribution_chart(df: pd.DataFrame, 
                                         year: int,
                                         config: Dict[str, Any] = None) -> go.Figure:
    """
    Create a bar chart showing distribution of bottleneck types.
    
    Args:
        df: DataFrame with bottleneck analysis
        year: Year to display
        config: Visualization configuration dictionary
        
    Returns:
        Plotly figure object
    """
    if config is None:
        config = {
            'colors': {
                'bottleneck_colors': {
                    'health': '#e74c3c',
                    'education': '#3498db',
                    'income': '#f39c12'
                }
            }
        }
    
    # Filter data for the specified year
    year_data = df[df['year'] == year]
    
    # Count bottlenecks
    bottleneck_counts = year_data['bottleneck_component'].value_counts()
    
    # Create bar chart
    fig = go.Figure(data=[
        go.Bar(
            x=bottleneck_counts.index.str.title(),
            y=bottleneck_counts.values,
            marker_color=[config['colors']['bottleneck_colors'].get(comp, '#999999') 
                         for comp in bottleneck_counts.index]
        )
    ])
    
    fig.update_layout(
        title=f'Bottleneck Distribution - {year}',
        xaxis_title='Limiting Component',
        yaxis_title='Number of Regions',
        height=300
    )
    
    return fig


def create_component_comparison_chart(df: pd.DataFrame,
                                      region_code: str,
                                      year: int,
                                      config: Dict[str, Any] = None) -> go.Figure:
    """
    Create a bar chart comparing components for a specific region and year.
    
    Args:
        df: DataFrame with HDI data
        region_code: Region identifier
        year: Year to display
        config: Visualization configuration dictionary
        
    Returns:
        Plotly figure object
    """
    if config is None:
        config = {
            'colors': {
                'line_colors': {
                    'health': '#e74c3c',
                    'education': '#3498db',
                    'income': '#f39c12'
                }
            }
        }
    
    # Filter data
    region_year_data = df[(df['gdlcode'] == region_code) & (df['year'] == year)]
    
    if len(region_year_data) == 0:
        fig = go.Figure()
        fig.add_annotation(
            text="No data available",
            xref="paper",
            yref="paper",
            x=0.5,
            y=0.5,
            showarrow=False
        )
        return fig
    
    row = region_year_data.iloc[0]
    
    components = ['Health', 'Education', 'Income']
    values = [row['healthindex'], row['edindex'], row['incindex']]
    colors_list = [config['colors']['line_colors']['health'],
                   config['colors']['line_colors']['education'],
                   config['colors']['line_colors']['income']]
    
    fig = go.Figure(data=[
        go.Bar(x=components, y=values, marker_color=colors_list)
    ])
    
    region_name = row.get('region', region_code)
    
    fig.update_layout(
        title=f'Component Comparison: {region_name} ({year})',
        yaxis_title='Index Value',
        yaxis=dict(range=[0, 1]),
        height=300
    )
    
    return fig

