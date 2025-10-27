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
)
from src.visualizations import (
    create_choropleth_map,
    create_component_breakdown_chart,
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
        font-size: 2.5rem;
        font-weight: bold;
        color: #2c3e50;
        text-align: center;
        padding: 0.5rem 0;
        margin-bottom: 0;
    }
    .sub-header {
        font-size: 1rem;
        color: #7f8c8d;
        text-align: center;
        padding-bottom: 1rem;
        margin-top: 0;
    }
    .country-panel {
        background-color: #f8f9fa;
        padding: 1.5rem;
        border-radius: 10px;
        border-left: 5px solid #3498db;
        height: 100%;
    }
    .metric-box {
        background-color: white;
        padding: 1rem;
        border-radius: 8px;
        margin: 0.5rem 0;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .component-label {
        font-size: 0.9rem;
        color: #7f8c8d;
        margin-bottom: 0.25rem;
    }
    .component-value {
        font-size: 1.8rem;
        font-weight: bold;
        color: #2c3e50;
    }
    </style>
""", unsafe_allow_html=True)


@st.cache_data
def load_data():
    """Load all processed data with caching."""
    return load_processed_data()


def calculate_year_range_averages(timeseries_df, year_range, metric_name):
    """
    Calculate average values for each country over a year range.
    
    Parameters:
    -----------
    timeseries_df : pd.DataFrame
        Time series data
    year_range : tuple
        (start_year, end_year)
    metric_name : str
        Name of the metric being calculated
    
    Returns:
    --------
    pd.DataFrame
        DataFrame with ISO3, Country, and Mean_Value columns
    """
    if timeseries_df is None or timeseries_df.empty:
        return pd.DataFrame(columns=['ISO3', 'Country', 'Mean_Value'])
    
    # Get columns for the selected year range
    selected_year_cols = get_year_columns(
        timeseries_df, 
        start_year=year_range[0], 
        end_year=year_range[1]
    )
    
    if not selected_year_cols:
        return pd.DataFrame(columns=['ISO3', 'Country', 'Mean_Value'])
    
    # Calculate mean across selected years
    result = timeseries_df[['ISO3', 'Country']].copy()
    result['Mean_Value'] = timeseries_df[selected_year_cols].mean(axis=1)
    
    return result


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
            st.code("python3 src/data_processing.py")
            return
            
    except Exception as e:
        st.error(f"❌ Error loading data: {str(e)}")
        return
    
    # Initialize session state for selected country
    if 'selected_country' not in st.session_state:
        st.session_state.selected_country = None
    
    # ============================================================================
    # LEFT SIDEBAR - Map Controls
    # ============================================================================
    st.sidebar.header("📊 Map Visualization")
    
    # What to visualize on the map
    viz_metric = st.sidebar.radio(
        "Display Metric",
        ['HDI', 'Health Index', 'Education Index', 'Income Index'],
        help="Choose which metric to visualize on the map"
    )
    
    # Map metric to column name and time series key
    metric_config = {
        'HDI': {'ts_key': 'hdi', 'label': 'HDI'},
        'Health Index': {'ts_key': 'life_expectancy', 'label': 'Health Index'},
        'Education Index': {'ts_key': 'mean_schooling', 'label': 'Education Index'},
        'Income Index': {'ts_key': 'gni', 'label': 'Income Index'}
    }
    
    current_config = metric_config[viz_metric]
    ts_key = current_config['ts_key']
    
    st.sidebar.markdown("---")
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
    
    # Apply filters to components_df
    filtered_df = components_df.copy()
    
    if selected_category != 'All':
        filtered_df = filtered_df[filtered_df['HDI_Category'] == selected_category]
    
    if selected_region != 'All':
        filtered_df = filtered_df[filtered_df['Region'] == selected_region]
    
    if selected_bottleneck != 'All':
        filtered_df = filtered_df[filtered_df['Bottleneck_Component'] == selected_bottleneck]
    
    st.sidebar.markdown("---")
    st.sidebar.markdown(f"**Showing {len(filtered_df)} of {len(components_df)} countries**")
    
    # ============================================================================
    # MAIN CONTENT AREA - Map and Year Slider
    # ============================================================================
    
    # Create two columns: map area (70%) and right panel (30%)
    col_map, col_right = st.columns([7, 3])
    
    with col_map:
        st.header(f"🗺️ {viz_metric} by Country")
        
        # Get available years for the slider
        if ts_key in timeseries_data and not timeseries_data[ts_key].empty:
            year_cols = get_year_columns(timeseries_data[ts_key])
            available_years = sorted([int(col.split('(')[1].split(')')[0]) for col in year_cols])
            
            if len(available_years) >= 2:
                # Calculate averages for the selected year range (using full range initially)
                year_range = (min(available_years), max(available_years))
                
                if viz_metric == 'HDI':
                    # Direct HDI values
                    avg_df = calculate_year_range_averages(
                        timeseries_data['hdi'], 
                        year_range, 
                        'HDI'
                    )
                    display_column = 'Mean_Value'
                    
                elif viz_metric == 'Health Index':
                    # Calculate from life expectancy
                    life_exp_avg = calculate_year_range_averages(
                        timeseries_data['life_expectancy'], 
                        year_range, 
                        'Life Expectancy'
                    )
                    # Normalize to index
                    life_exp_avg['Mean_Value'] = (life_exp_avg['Mean_Value'] - 20) / (85 - 20)
                    life_exp_avg['Mean_Value'] = life_exp_avg['Mean_Value'].clip(0, 1)
                    avg_df = life_exp_avg
                    display_column = 'Mean_Value'
                    
                elif viz_metric == 'Education Index':
                    # Average of mean and expected schooling
                    mean_school_avg = calculate_year_range_averages(
                        timeseries_data['mean_schooling'], 
                        year_range, 
                        'Mean Schooling'
                    )
                    expected_school_avg = calculate_year_range_averages(
                        timeseries_data['expected_schooling'], 
                        year_range, 
                        'Expected Schooling'
                    )
                    # Calculate education index
                    avg_df = mean_school_avg.copy()
                    avg_df['Mean_Value'] = (
                        (mean_school_avg['Mean_Value'] / 18 + 
                         expected_school_avg['Mean_Value'] / 18) / 2
                    ).clip(0, 1)
                    display_column = 'Mean_Value'
                    
                elif viz_metric == 'Income Index':
                    # Calculate from GNI
                    gni_avg = calculate_year_range_averages(
                        timeseries_data['gni'], 
                        year_range, 
                        'GNI'
                    )
                    # Normalize to index using log
                    gni_avg['Mean_Value'] = (
                        (np.log(gni_avg['Mean_Value']) - np.log(100)) / 
                        (np.log(75000) - np.log(100))
                    ).clip(0, 1)
                    avg_df = gni_avg
                    display_column = 'Mean_Value'
                
                # Merge with filtered data
                map_df = filtered_df.merge(
                    avg_df[['ISO3', 'Mean_Value']], 
                    on='ISO3', 
                    how='left'
                )
                
                # Create the map with proper color scaling
                if not map_df.empty and 'Mean_Value' in map_df.columns:
                    # Calculate min/max for better color distribution
                    valid_values = map_df['Mean_Value'].dropna()
                    if len(valid_values) > 0:
                        data_min = valid_values.min()
                        data_max = valid_values.max()
                        
                        # Add some padding to make colors more distinguishable
                        value_range = data_max - data_min
                        color_min = max(0, data_min - value_range * 0.1)
                        color_max = min(1, data_max + value_range * 0.1)
                        
                        color_scales = {
                            'HDI': 'RdYlGn',
                            'Health Index': 'Reds',
                            'Education Index': 'Blues',
                            'Income Index': 'Greens',
                        }
                        
                        # Get ISO3 of selected country
                        selected_iso3 = None
                        if st.session_state.selected_country:
                            selected_data = map_df[map_df['Country'] == st.session_state.selected_country]
                            if not selected_data.empty:
                                selected_iso3 = selected_data.iloc[0]['ISO3']
                        
                        fig_map = create_choropleth_map(
                            map_df,
                            value_column=display_column,
                            title=f"{viz_metric} Average ({year_range[0]}-{year_range[1]})",
                            color_scale=color_scales.get(viz_metric, 'RdYlGn'),
                            range_color=(color_min, color_max),
                            selected_country=selected_iso3
                        )
                        
                        # Update the map to be larger
                        fig_map.update_layout(
                            height=650,
                            clickmode='event+select'
                        )
                        
                        # Display map with selection enabled
                        selected_points = st.plotly_chart(
                            fig_map, 
                            use_container_width=True, 
                            key='main_map',
                            on_select="rerun",
                            selection_mode="points"
                        )
                        
                        # Capture click events
                        if selected_points and hasattr(selected_points, 'selection') and selected_points.selection:
                            if 'points' in selected_points.selection and len(selected_points.selection['points']) > 0:
                                # Get the clicked point
                                clicked_point = selected_points.selection['points'][0]
                                if 'location' in clicked_point:
                                    clicked_iso3 = clicked_point['location']
                                    # Find country name from ISO3
                                    clicked_country_data = map_df[map_df['ISO3'] == clicked_iso3]
                                    if not clicked_country_data.empty:
                                        st.session_state.selected_country = clicked_country_data.iloc[0]['Country']
                                        st.rerun()
                        
                        # Year Range Slider BELOW THE MAP (moved from above)
                        year_range = st.slider(
                            "📅 Select Year Range",
                            min_value=min(available_years),
                            max_value=max(available_years),
                            value=(min(available_years), max(available_years)),
                            help="Drag to select year range. Map shows average values for this period."
                        )
                        
                        # Instructions for clicking
                        st.info("🖱️ **Click any country on the map** to view its detailed statistics in the right panel →")
                        
                    else:
                        st.warning("⚠️ No valid data to display for the selected filters.")
                else:
                    st.warning("⚠️ No countries match the selected filters.")
                    
            else:
                st.error("Not enough time series data available.")
        else:
            st.error(f"Time series data not available for {viz_metric}")
    
    # ============================================================================
    # RIGHT PANEL - Country Details
    # ============================================================================
    with col_right:
        st.markdown("### 📍 Country Details")
        
        # Determine which country to display (prioritize session state from map click)
        display_country = None
        
        # Check if we have a country selected from map click
        if st.session_state.selected_country and st.session_state.selected_country in filtered_df['Country'].values:
            display_country = st.session_state.selected_country
            default_index = sorted(filtered_df['Country'].unique().tolist()).index(st.session_state.selected_country) + 1
        else:
            default_index = 0
        
        # Country selector (manual selection option)
        country_list = ['Select a country...'] + sorted(filtered_df['Country'].unique().tolist())
        dropdown_selection = st.selectbox(
            "Or select manually:",
            country_list,
            index=default_index,
            key='country_selector',
            help="Select a country manually or click on the map"
        )
        
        # Update display_country if manually selected from dropdown
        if dropdown_selection != 'Select a country...':
            display_country = dropdown_selection
            st.session_state.selected_country = dropdown_selection
        
        # Display country details if we have a selection
        if display_country:
            # Get country info
            country_data = get_country_info(map_df, display_country)
            
            if country_data is not None:
                st.markdown(f"""
                <div class="country-panel">
                    <h2 style="margin-top: 0; color: #2c3e50;">{country_data['Country']}</h2>
                    <p style="color: #7f8c8d; margin-bottom: 1.5rem;">
                        <strong>Category:</strong> {country_data.get('HDI_Category', 'N/A')}<br>
                        <strong>Period:</strong> {year_range[0]}-{year_range[1]}
                    </p>
                </div>
                """, unsafe_allow_html=True)
                
                st.markdown("#### 📊 HDI Components")
                
                # Display the three components
                components_to_show = [
                    ('Health Index', 'Health_Index', '#e74c3c', '❤️'),
                    ('Education Index', 'Education_Index', '#3498db', '📚'),
                    ('Income Index', 'Income_Index', '#2ecc71', '💰')
                ]
                
                for label, col_name, color, icon in components_to_show:
                    if col_name in country_data:
                        value = country_data[col_name]
                        st.markdown(f"""
                        <div class="metric-box">
                            <div class="component-label">{icon} {label}</div>
                            <div class="component-value" style="color: {color};">{value:.3f}</div>
                            <div style="background: linear-gradient(to right, {color} {value*100}%, #ecf0f1 {value*100}%); 
                                 height: 8px; border-radius: 4px; margin-top: 0.5rem;"></div>
                        </div>
                        """, unsafe_allow_html=True)
                
                # HDI Value
                st.markdown("#### 🌟 Overall HDI")
                if 'HDI' in country_data:
                    hdi_value = country_data['HDI']
                    st.markdown(f"""
                    <div class="metric-box">
                        <div class="component-value" style="color: #9b59b6;">{hdi_value:.3f}</div>
                        <div style="font-size: 0.85rem; color: #7f8c8d; margin-top: 0.5rem;">
                            Based on {year_range[1]} data
                        </div>
                    </div>
                    """, unsafe_allow_html=True)
                
                # Bottleneck Analysis
                st.markdown("#### 🔍 Bottleneck Analysis")
                if 'Bottleneck_Component' in country_data:
                    bottleneck = country_data['Bottleneck_Component']
                    bottleneck_value = country_data.get('Bottleneck_Value', 'N/A')
                    
                    bottleneck_icons = {
                        'Health': '❤️',
                        'Education': '📚',
                        'Income': '💰'
                    }
                    
                    st.markdown(f"""
                    <div class="metric-box" style="border-left: 5px solid #e74c3c;">
                        <div style="font-size: 1rem; color: #e74c3c; font-weight: bold;">
                            {bottleneck_icons.get(bottleneck, '⚠️')} {bottleneck}
                        </div>
                        <div style="font-size: 0.85rem; color: #7f8c8d; margin-top: 0.5rem;">
                            Lowest component: {bottleneck_value:.3f}
                        </div>
                        <div style="font-size: 0.85rem; color: #7f8c8d; margin-top: 0.25rem;">
                            💡 Improving this component would have the highest impact
                        </div>
                    </div>
                    """, unsafe_allow_html=True)
                
                # Component comparison chart
                st.markdown("#### 📈 Component Comparison")
                if all(col in country_data for col in ['Health_Index', 'Education_Index', 'Income_Index']):
                    fig_components = create_component_breakdown_chart(
                        country_data['Health_Index'],
                        country_data['Education_Index'],
                        country_data['Income_Index'],
                        country_data['Country']
                    )
                    fig_components.update_layout(height=300)
                    st.plotly_chart(fig_components, use_container_width=True)
                
            else:
                st.warning("Country data not found.")
        else:
            st.markdown("""
            <div class="country-panel">
                <p style="text-align: center; color: #7f8c8d; padding: 2rem; font-size: 1.1rem;">
                    🖱️ <strong>Click any country on the map</strong><br><br>
                    to view detailed HDI statistics and component breakdown
                </p>
            </div>
            """, unsafe_allow_html=True)
    
    # Footer
    st.markdown("---")
    st.markdown("""
        <div style='text-align: center; color: #7f8c8d; font-size: 0.85rem;'>
            <p>Data Source: United Nations Development Programme (UNDP) | HDI Explorer v1.0</p>
        </div>
    """, unsafe_allow_html=True)


if __name__ == "__main__":
    main()