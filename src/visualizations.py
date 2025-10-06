"""
Visualizations Module
Creates all chart and map visualizations for the application
"""

import plotly.express as px
import plotly.graph_objects as go
import pandas as pd
import numpy as np


def create_choropleth_map(df, value_column='HDI', title='Human Development Index', 
                         color_scale='RdYlGn', range_color=None, selected_country=None):
    """
    Create an interactive choropleth map showing HDI or component values by country.
    
    Parameters:
    -----------
    df : pd.DataFrame
        DataFrame with country data including ISO3 codes
    value_column : str
        Column name to visualize (default: 'HDI')
    title : str
        Map title
    color_scale : str
        Plotly color scale (default: 'RdYlGn' - Red-Yellow-Green)
    range_color : tuple or None
        (min, max) for color scale. If None, uses data range.
    selected_country : str or None
        ISO3 code of selected country to highlight
    
    Returns:
    --------
    plotly.graph_objects.Figure
        Interactive choropleth map
    """
    
    # Ensure we have the necessary columns
    if 'ISO3' not in df.columns or value_column not in df.columns:
        raise ValueError(f"DataFrame must contain 'ISO3' and '{value_column}' columns")
    
    # Handle missing values
    df_plot = df.dropna(subset=[value_column]).copy()
    
    # Create hover text with more information
    hover_template = '<b>%{customdata[0]}</b><br>'
    hover_template += f'{title}: %{{z:.3f}}<br>'
    hover_template += '🖱️ Click to view details<br>'
    hover_template += '<extra></extra>'
    
    # Determine line width - highlight selected country
    line_widths = []
    line_colors = []
    for iso3 in df_plot['ISO3']:
        if selected_country and iso3 == selected_country:
            line_widths.append(3)
            line_colors.append('#2c3e50')
        else:
            line_widths.append(0.5)
            line_colors.append('darkgray')
    
    # Create the choropleth map
    fig = go.Figure(data=go.Choropleth(
        locations=df_plot['ISO3'],
        z=df_plot[value_column],
        text=df_plot['Country'],
        customdata=df_plot[['Country']],
        colorscale=color_scale,
        autocolorscale=False,
        reversescale=False,
        marker_line_color='darkgray',
        marker_line_width=0.5,
        colorbar_title=title,
        hovertemplate=hover_template,
        zmin=range_color[0] if range_color else None,
        zmax=range_color[1] if range_color else None,
    ))
    
    # Update layout
    fig.update_layout(
        title={
            'text': title,
            'y': 0.95,
            'x': 0.5,
            'xanchor': 'center',
            'yanchor': 'top',
            'font': {'size': 20, 'color': '#2c3e50'}
        },
        geo=dict(
            showframe=False,
            showcoastlines=True,
            projection_type='natural earth',
            bgcolor='rgba(0,0,0,0)',
        ),
        height=600,
        margin=dict(l=0, r=0, t=50, b=0),
        paper_bgcolor='rgba(0,0,0,0)',
        plot_bgcolor='rgba(0,0,0,0)',
    )
    
    return fig


def create_component_breakdown_chart(health_idx, education_idx, income_idx, country_name):
    """
    Create a bar chart showing the three HDI component indices for a country.
    
    Parameters:
    -----------
    health_idx : float
        Health index value (0-1)
    education_idx : float
        Education index value (0-1)
    income_idx : float
        Income index value (0-1)
    country_name : str
        Name of the country
    
    Returns:
    --------
    plotly.graph_objects.Figure
        Bar chart of component indices
    """
    
    components = ['Health', 'Education', 'Income']
    values = [health_idx, education_idx, income_idx]
    colors = ['#e74c3c', '#3498db', '#2ecc71']
    
    fig = go.Figure(data=[
        go.Bar(
            x=components,
            y=values,
            marker_color=colors,
            text=[f'{v:.3f}' for v in values],
            textposition='auto',
            hovertemplate='<b>%{x}</b><br>Index: %{y:.3f}<extra></extra>'
        )
    ])
    
    fig.update_layout(
        title=f'HDI Component Breakdown - {country_name}',
        yaxis_title='Index Value (0-1)',
        yaxis_range=[0, 1],
        showlegend=False,
        height=400,
        margin=dict(l=50, r=50, t=80, b=50),
    )
    
    # Add reference line at geometric mean
    hdi_calc = (health_idx * education_idx * income_idx) ** (1/3)
    fig.add_hline(y=hdi_calc, line_dash="dash", line_color="gray",
                  annotation_text=f"HDI: {hdi_calc:.3f}", 
                  annotation_position="right")
    
    return fig


def create_radar_chart(df_country, df_comparison=None, country_name='Country'):
    """
    Create a radar chart comparing a country's components to average/other countries.
    
    Parameters:
    -----------
    df_country : pd.Series or dict
        Country data with component indices
    df_comparison : pd.Series or dict, optional
        Comparison data (e.g., world average)
    country_name : str
        Name of the country
    
    Returns:
    --------
    plotly.graph_objects.Figure
        Radar chart
    """
    
    categories = ['Health', 'Education', 'Income']
    
    fig = go.Figure()
    
    # Add country data
    country_values = [
        df_country.get('Health_Index', 0),
        df_country.get('Education_Index', 0),
        df_country.get('Income_Index', 0)
    ]
    
    fig.add_trace(go.Scatterpolar(
        r=country_values,
        theta=categories,
        fill='toself',
        name=country_name,
        line_color='#3498db'
    ))
    
    # Add comparison if provided
    if df_comparison is not None:
        comparison_values = [
            df_comparison.get('Health_Index', 0),
            df_comparison.get('Education_Index', 0),
            df_comparison.get('Income_Index', 0)
        ]
        
        fig.add_trace(go.Scatterpolar(
            r=comparison_values,
            theta=categories,
            fill='toself',
            name='World Average',
            line_color='#95a5a6',
            opacity=0.5
        ))
    
    fig.update_layout(
        polar=dict(
            radialaxis=dict(
                visible=True,
                range=[0, 1]
            )
        ),
        showlegend=True,
        title=f'Component Comparison - {country_name}',
        height=400,
    )
    
    return fig


def create_time_series_chart(df_timeseries, country_iso3, indicator_name='HDI'):
    """
    Create a time series line chart for a specific indicator.
    
    Parameters:
    -----------
    df_timeseries : pd.DataFrame
        Time series data with year columns
    country_iso3 : str
        ISO3 code of the country
    indicator_name : str
        Name of the indicator being plotted
    
    Returns:
    --------
    plotly.graph_objects.Figure
        Time series line chart
    """
    
    # Filter to the specific country
    country_data = df_timeseries[df_timeseries['ISO3'] == country_iso3]
    
    if country_data.empty:
        return None
    
    country_name = country_data['Country'].iloc[0]
    
    # Extract year columns and values
    year_cols = [col for col in df_timeseries.columns if '(' in col and ')' in col]
    years = [int(col.split('(')[1].split(')')[0]) for col in year_cols]
    values = country_data[year_cols].iloc[0].values
    
    # Create DataFrame for plotting
    plot_df = pd.DataFrame({
        'Year': years,
        'Value': values
    }).dropna()
    
    fig = go.Figure()
    
    fig.add_trace(go.Scatter(
        x=plot_df['Year'],
        y=plot_df['Value'],
        mode='lines+markers',
        name=country_name,
        line=dict(color='#3498db', width=3),
        marker=dict(size=6),
        hovertemplate='<b>%{x}</b><br>' + indicator_name + ': %{y:.3f}<extra></extra>'
    ))
    
    fig.update_layout(
        title=f'{indicator_name} Trend - {country_name}',
        xaxis_title='Year',
        yaxis_title=indicator_name,
        hovermode='x unified',
        height=400,
        showlegend=False,
    )
    
    return fig


def create_cluster_scatter_3d(df, cluster_col='Cluster', title='HDI Component Clustering'):
    """
    Create a 3D scatter plot showing clustering results in component space.
    
    Parameters:
    -----------
    df : pd.DataFrame
        DataFrame with component indices and cluster labels
    cluster_col : str
        Column name containing cluster labels
    title : str
        Chart title
    
    Returns:
    --------
    plotly.graph_objects.Figure
        3D scatter plot
    """
    
    fig = px.scatter_3d(
        df,
        x='Health_Index',
        y='Education_Index',
        z='Income_Index',
        color=cluster_col,
        hover_name='Country',
        hover_data={
            'Health_Index': ':.3f',
            'Education_Index': ':.3f',
            'Income_Index': ':.3f',
            cluster_col: True
        },
        title=title,
        labels={
            'Health_Index': 'Health Index',
            'Education_Index': 'Education Index',
            'Income_Index': 'Income Index'
        },
        height=700
    )
    
    fig.update_traces(marker=dict(size=8, line=dict(width=0.5, color='white')))
    
    fig.update_layout(
        scene=dict(
            xaxis_title='Health Index',
            yaxis_title='Education Index',
            zaxis_title='Income Index',
            xaxis=dict(range=[0, 1]),
            yaxis=dict(range=[0, 1]),
            zaxis=dict(range=[0, 1]),
        )
    )
    
    return fig


def create_bottleneck_chart(df, top_n=20):
    """
    Create a chart showing countries grouped by their bottleneck component.
    
    Parameters:
    -----------
    df : pd.DataFrame
        DataFrame with bottleneck information
    top_n : int
        Number of countries to show per bottleneck
    
    Returns:
    --------
    plotly.graph_objects.Figure
        Bar chart grouped by bottleneck
    """
    
    bottleneck_counts = df['Bottleneck_Component'].value_counts()
    
    fig = go.Figure(data=[
        go.Bar(
            x=bottleneck_counts.index,
            y=bottleneck_counts.values,
            marker_color=['#e74c3c', '#3498db', '#2ecc71'],
            text=bottleneck_counts.values,
            textposition='auto',
        )
    ])
    
    fig.update_layout(
        title='Number of Countries by Bottleneck Component',
        xaxis_title='Bottleneck Component',
        yaxis_title='Number of Countries',
        showlegend=False,
        height=400,
    )
    
    return fig
