"""
HDI Explorer - Main Streamlit Application
Human Development Index Interactive Visualization Tool
"""

import streamlit as st
import pandas as pd
import numpy as np
from pathlib import Path

# Import custom modules
from src.utils import (
    load_processed_data, 
    get_country_info, 
    get_year_columns,
    calculate_mean_for_years,
    get_countries_by_category,
    get_countries_by_bottleneck,
    filter_data
)
from src.visualizations import (
    create_choropleth_map,
    create_component_breakdown_chart,
    create_radar_chart,
    create_time_series_chart,
    create_bottleneck_chart
)


# Page configuration
st.set_page_config(
    page_title="HDI Explorer",
    page_icon="🌍",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom CSS
st.markdown("""
    <style>
    .main-header {
        font-size: 3rem;
        font-weight: bold;
        color: #2c3e50;
        text-align: center;
        padding: 1rem 0;
    }
    .sub-header {
        font-size: 1.2rem;
        color: #7f8c8d;
        text-align: center;
        padding-bottom: 2rem;
    }
    .metric-card {
        background-color: #f8f9fa;
        padding: 1rem;
        border-radius: 10px;
        border-left: 5px solid #3498db;
    }
    </style>
""", unsafe_allow_html=True)


@st.cache_data
def load_data():
    """Load all processed data with caching."""
    return load_processed_data()


def main():
    """Main application function."""
    
    # Header
    st.markdown('<h1 class="main-header">🌍 HDI Explorer</h1>', unsafe_allow_html=True)
    st.markdown('<p class="sub-header">Interactive Human Development Index Visualization</p>', unsafe_allow_html=True)
    
    # Load data
    try:
        data = load_data()
        components_df = data.get('components')
        timeseries_data = data.get('timeseries', {})
        
        if components_df is None or components_df.empty:
            st.error("❌ No processed data found. Please run the data processing script first.")
            st.code("python src/data_processing.py")
            return
            
    except Exception as e:
        st.error(f"❌ Error loading data: {str(e)}")
        return
    
    # Sidebar - Filters
    st.sidebar.header("🎯 Filters")
    
    # Filter by HDI Category
    categories = ['All'] + sorted(components_df['HDI_Category'].dropna().unique().tolist())
    selected_category = st.sidebar.selectbox(
        "HDI Category",
        categories,
        help="Filter countries by Human Development category"
    )
    
    # Filter by Region
    if 'Region' in components_df.columns:
        regions = ['All'] + sorted(components_df['Region'].dropna().unique().tolist())
        selected_region = st.sidebar.selectbox(
            "Region",
            regions,
            help="Filter countries by UN region"
        )
    else:
        selected_region = 'All'
    
    # Filter by Bottleneck Component
    bottlenecks = ['All', 'Health', 'Education', 'Income']
    selected_bottleneck = st.sidebar.selectbox(
        "Bottleneck Component",
        bottlenecks,
        help="Show countries where this component is the limiting factor"
    )
    
    # What to visualize
    st.sidebar.header("📊 Visualization Options")
    viz_metric = st.sidebar.radio(
        "Display on Map",
        ['HDI', 'Health Index', 'Education Index', 'Income Index', 'Component Gap'],
        help="Choose which metric to visualize on the map"
    )
    
    # Map metric to column name
    metric_column_map = {
        'HDI': 'HDI',
        'Health Index': 'Health_Index',
        'Education Index': 'Education_Index',
        'Income Index': 'Income_Index',
        'Component Gap': 'Component_Gap'
    }
    display_column = metric_column_map[viz_metric]
    
    # Apply filters
    filtered_df = components_df.copy()
    
    if selected_category != 'All':
        filtered_df = filtered_df[filtered_df['HDI_Category'] == selected_category]
    
    if selected_region != 'All':
        filtered_df = filtered_df[filtered_df['Region'] == selected_region]
    
    if selected_bottleneck != 'All':
        filtered_df = filtered_df[filtered_df['Bottleneck_Component'] == selected_bottleneck]
    
    # Year Range Slider (at the bottom of filters)
    st.sidebar.header("📅 Time Range")
    
    # Get available years from time series data
    if 'hdi' in timeseries_data and not timeseries_data['hdi'].empty:
        year_cols = get_year_columns(timeseries_data['hdi'])
        available_years = sorted([int(col.split('(')[1].split(')')[0]) for col in year_cols])
        
        if len(available_years) >= 2:
            year_range = st.sidebar.slider(
                "Select Year Range",
                min_value=min(available_years),
                max_value=max(available_years),
                value=(min(available_years), max(available_years)),
                help="Select year range to calculate average HDI"
            )
            
            # Calculate mean HDI for selected year range
            selected_year_cols = get_year_columns(
                timeseries_data['hdi'], 
                start_year=year_range[0], 
                end_year=year_range[1]
            )
            
            if selected_year_cols:
                mean_hdi_df = calculate_mean_for_years(timeseries_data['hdi'], selected_year_cols)
                
                # Merge with filtered data
                filtered_df = filtered_df.merge(
                    mean_hdi_df[['ISO3', 'Mean_Value']], 
                    on='ISO3', 
                    how='left'
                )
                
                # Display statistics for selected range
                global_mean = mean_hdi_df['Mean_Value'].mean()
                filtered_mean = filtered_df['Mean_Value'].mean()
                
                st.sidebar.metric(
                    label=f"Global Mean HDI ({year_range[0]}-{year_range[1]})",
                    value=f"{global_mean:.3f}"
                )
                
                if len(filtered_df) < len(components_df):
                    st.sidebar.metric(
                        label=f"Filtered Mean HDI ({year_range[0]}-{year_range[1]})",
                        value=f"{filtered_mean:.3f}",
                        delta=f"{filtered_mean - global_mean:.3f}"
                    )
        else:
            year_range = None
    else:
        year_range = None
    
    # Main content area
    st.sidebar.markdown("---")
    st.sidebar.markdown(f"**Showing {len(filtered_df)} of {len(components_df)} countries**")
    
    # Display the map
    st.header(f"🗺️ World Map: {viz_metric}")
    
    if not filtered_df.empty:
        try:
            # Create the choropleth map
            color_scales = {
                'HDI': 'RdYlGn',
                'Health Index': 'Reds',
                'Education Index': 'Blues',
                'Income Index': 'Greens',
                'Component Gap': 'YlOrRd'
            }
            
            fig_map = create_choropleth_map(
                filtered_df,
                value_column=display_column,
                title=f"{viz_metric} by Country",
                color_scale=color_scales.get(viz_metric, 'RdYlGn'),
                range_color=(0, 1) if viz_metric != 'Component Gap' else None
            )
            
            st.plotly_chart(fig_map, use_container_width=True)
            
        except Exception as e:
            st.error(f"Error creating map: {str(e)}")
    else:
        st.warning("⚠️ No countries match the selected filters.")
    
    # Summary Statistics
    st.header("📈 Summary Statistics")
    
    col1, col2, col3, col4 = st.columns(4)
    
    with col1:
        avg_hdi = filtered_df['HDI'].mean()
        st.metric("Average HDI", f"{avg_hdi:.3f}")
    
    with col2:
        avg_health = filtered_df['Health_Index'].mean()
        st.metric("Avg Health Index", f"{avg_health:.3f}")
    
    with col3:
        avg_education = filtered_df['Education_Index'].mean()
        st.metric("Avg Education Index", f"{avg_education:.3f}")
    
    with col4:
        avg_income = filtered_df['Income_Index'].mean()
        st.metric("Avg Income Index", f"{avg_income:.3f}")
    
    # Bottleneck Analysis
    st.header("🔍 Bottleneck Analysis")
    
    col_left, col_right = st.columns([1, 1])
    
    with col_left:
        if not filtered_df.empty and 'Bottleneck_Component' in filtered_df.columns:
            bottleneck_fig = create_bottleneck_chart(filtered_df)
            st.plotly_chart(bottleneck_fig, use_container_width=True)
    
    with col_right:
        if not filtered_df.empty:
            st.subheader("Bottleneck Distribution")
            bottleneck_counts = filtered_df['Bottleneck_Component'].value_counts()
            
            for component, count in bottleneck_counts.items():
                percentage = (count / len(filtered_df)) * 100
                st.write(f"**{component}**: {count} countries ({percentage:.1f}%)")
    
    # Data Table
    with st.expander("📋 View Detailed Data Table"):
        display_columns = ['Country', 'HDI', 'HDI_Category', 'Health_Index', 
                          'Education_Index', 'Income_Index', 'Bottleneck_Component']
        
        # Add Mean_Value if it exists
        if 'Mean_Value' in filtered_df.columns:
            display_columns.insert(2, 'Mean_Value')
        
        available_columns = [col for col in display_columns if col in filtered_df.columns]
        
        st.dataframe(
            filtered_df[available_columns].sort_values('HDI', ascending=False),
            use_container_width=True,
            height=400
        )
    
    # Footer
    st.markdown("---")
    st.markdown("""
        <div style='text-align: center; color: #7f8c8d;'>
            <p>Data Source: United Nations Development Programme (UNDP)</p>
            <p>HDI Explorer | Interactive Human Development Index Visualization Tool</p>
        </div>
    """, unsafe_allow_html=True)


if __name__ == "__main__":
    main()
