"""
Subnational HDI Explorer
Main Streamlit application for visualizing HDI bottlenecking factors.
"""

import streamlit as st
import pandas as pd
from pathlib import Path

from src.utils import load_config, format_number, get_component_name
from src.data_processing import load_processed_data, process_all_data
from src.analysis import add_bottleneck_analysis
from src.visualizations import (
    create_hdi_map, 
    create_bottleneck_map, 
    create_evolution_chart,
    create_component_comparison_chart
)


@st.cache_data
def load_data():
    """Load processed data with caching."""
    processed_file = "data/processed/subnational_data.csv"
    
    if not Path(processed_file).exists():
        st.warning("Processed data not found. Processing raw data...")
        try:
            df = process_all_data()
            st.success("Data processing complete!")
        except Exception as e:
            st.error(f"Error processing data: {e}")
            st.stop()
    else:
        df = load_processed_data(processed_file)
    
    return df


@st.cache_data
def get_data_with_analysis(_df):
    """Add bottleneck analysis to data with caching."""
    return add_bottleneck_analysis(_df)


@st.cache_data
def load_configs():
    """Load configuration files with caching."""
    app_config = load_config("config/app_config.yaml")
    viz_config = load_config("config/viz_config.yaml")
    return app_config, viz_config


def main():
    """Main application function."""
    
    # Page configuration
    st.set_page_config(
        page_title="Subnational HDI Explorer",
        page_icon="X",
        layout="wide",
        initial_sidebar_state="expanded"
    )
    
    # Load configurations
    try:
        app_config, viz_config = load_configs()
    except Exception as e:
        st.error(f"Error loading configuration: {e}")
        st.stop()
    
    # Load data
    try:
        df = load_data()
    except Exception as e:
        st.error(f"Error loading data: {e}")
        st.stop()
    
    # Title and description
    st.title(" Subnational HDI Explorer")
    st.markdown("""
    Explore Human Development Index patterns at the subnational level and identify 
    which components (Health, Education, or Income) are limiting development across regions.
    """)
    
    # Sidebar controls
    st.sidebar.header("Controls")
    
    # Visualization mode selection
    viz_mode = st.sidebar.radio(
        "Visualization Mode",
        ["HDI Components", "Bottleneck Analysis"],
        help="Choose between viewing HDI components or identifying bottlenecks"
    )
    
    # Add bottleneck analysis if in bottleneck mode
    if viz_mode == "Bottleneck Analysis":
        df = get_data_with_analysis(df)
    
    # Year selection
    min_year = int(df['year'].min())
    max_year = int(df['year'].max())
    selected_year = st.sidebar.slider(
        "Select Year",
        min_value=min_year,
        max_value=max_year,
        value=app_config['filters']['default_year'],
        step=1
    )
    
    # Component selection (for HDI mode)
    if viz_mode == "HDI Components":
        component_option = st.sidebar.selectbox(
            "Component to Display",
            ["Overall HDI", "Health", "Education", "Income"],
            help="Select which HDI component to visualize"
        )
        component_map = {
            "Overall HDI": "overall",
            "Health": "health",
            "Education": "education",
            "Income": "income"
        }
        selected_component = component_map[component_option]
    
    # Continent filter
    continents = ["All"] + sorted(df['continent'].unique().tolist())
    selected_continent = st.sidebar.selectbox(
        "Filter by Continent",
        continents,
        index=0
    )
    
    # Filter data
    filtered_df = df.copy()
    if selected_continent != "All":
        filtered_df = filtered_df[filtered_df['continent'] == selected_continent]
    
    # Main content area
    col1, col2 = st.columns([2, 1])
    
    with col1:
        st.subheader(f"Global View - {selected_year}")
        
        # Create and display map based on mode
        try:
            if viz_mode == "HDI Components":
                fig_map = create_hdi_map(
                    filtered_df, 
                    selected_year, 
                    selected_component,
                    viz_config
                )
            else:  # Bottleneck Analysis
                fig_map = create_bottleneck_map(
                    filtered_df,
                    selected_year,
                    viz_config
                )
            
            st.plotly_chart(fig_map, use_container_width=True)
        except Exception as e:
            st.error(f"Error creating map: {e}")
    
    with col2:
        st.subheader("Regional Analysis")
        
        # Region selector
        regions = sorted(filtered_df[['gdlcode', 'region', 'country']].drop_duplicates()
                        .apply(lambda x: f"{x['region']} ({x['country']}) - {x['gdlcode']}", axis=1)
                        .tolist())
        
        if regions:
            selected_region_str = st.selectbox(
                "Select region",
                regions,
                key="region_selector"
            )
            
            # Extract gdlcode from selection
            selected_gdlcode = selected_region_str.split(" - ")[-1]
            
            # Component Evolution Over Time
            try:
                fig_evolution = create_evolution_chart(
                    filtered_df,
                    selected_gdlcode,
                    viz_config
                )
                st.plotly_chart(fig_evolution, use_container_width=True)
            except Exception as e:
                st.error(f"Error creating evolution chart: {e}")
            
            # Current Component Values
            try:
                fig_comparison = create_component_comparison_chart(
                    filtered_df,
                    selected_gdlcode,
                    selected_year,
                    viz_config
                )
                st.plotly_chart(fig_comparison, use_container_width=True)
            except Exception as e:
                st.error(f"Error creating comparison chart: {e}")
            
            # Display bottleneck information if in bottleneck mode
            if viz_mode == "Bottleneck Analysis":
                region_year_data = filtered_df[
                    (filtered_df['gdlcode'] == selected_gdlcode) & 
                    (filtered_df['year'] == selected_year)
                ]
                
                if len(region_year_data) > 0 and 'bottleneck_component' in region_year_data.columns:
                    row = region_year_data.iloc[0]
                    bottleneck = row['bottleneck_component']
                    bottleneck_value = row['bottleneck_value']
                    
                    st.info(
                        f"**Limiting Factor:** {bottleneck.title()}\n\n"
                        f"**Value:** {format_number(bottleneck_value)}\n\n"
                        f"This component has the lowest index value."
                    )
        else:
            st.info("No regions available for the selected filters.")
    
    # Footer
    st.markdown("---")
    st.markdown("""
    **Data Source:** Global Data Lab - Subnational HDI Database v8.3  
    **Coverage:** 1,600+ subnational regions across 160+ countries (1990-2022)
    """)


if __name__ == "__main__":
    main()

