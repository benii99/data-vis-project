# Changelog

All notable changes to the Subnational HDI Explorer project will be documented in this file.

## [1.1.0] - 2025-11-05

### Changed
- Simplified data preprocessing to focus only on loading, filtering, and cleaning
- Removed bottleneck analysis and clustering from preprocessing pipeline
- Analysis (bottleneck detection, etc.) now performed on-demand in visualization code
- More flexible approach allowing different analyses without reprocessing data
- Removed separate timeseries file - single processed file contains all data

### Technical
- `process_all_data()` now returns single DataFrame instead of tuple
- Bottleneck analysis computed with caching when visualization mode requires it
- Each region has `gdlcode` for unique identification and `isocode3` for map visualization
- Cleaner separation between data processing and analysis layers

## [1.0.0] - 2025-11-05

### Added
- Initial project structure and setup
- Core data processing pipeline for subnational HDI data
  - Raw data loading and validation
  - Subnational filtering (51,492 observations)
  - Data cleaning and type conversions
  - Continent mapping for geographic filtering
- Bottleneck analysis functionality
  - Automatic identification of limiting HDI components
  - Component gap calculations
  - Bottleneck persistence tracking
  - Regional statistics aggregation
- Interactive Streamlit web application
  - Wide layout optimized for data visualization
  - Responsive design for different screen sizes
  - Real-time filtering and interaction
- Two visualization modes
  - HDI Components mode: View overall HDI or individual components (Health, Education, Income)
  - Bottleneck Analysis mode: Identify which component limits development
- Geographic visualizations
  - Interactive choropleth maps using Plotly
  - Country-level aggregation with subnational detail
  - Intuitive color scales (RdYlGn for HDI, component-specific colors)
  - Hover tooltips with detailed information
- Time series analysis
  - Component evolution charts for selected regions
  - 33 years of historical data (1990-2022)
  - Background shading indicating bottleneck periods
  - Multi-line comparison of all three components
- Regional comparison tools
  - Side-by-side component comparison charts
  - Current year snapshot with bar charts
  - Bottleneck identification and explanation
- Filter controls
  - Year slider for temporal exploration
  - Continent filter for geographic focus
  - Region selector for detailed analysis
- Configuration system
  - YAML-based configuration files
  - Separate app and visualization settings
  - Easy customization of colors and layout
- Data caching
  - Streamlit cache decorators for performance
  - Efficient loading of large datasets
  - Automatic data processing on first run
- Comprehensive documentation
  - Detailed README with project overview
  - Installation and setup instructions
  - Usage guide and feature descriptions
  - HDI methodology explanation
  - Data source attribution

### Technical Details
- Python 3.8+ compatibility
- Key dependencies: Streamlit 1.28.1, Pandas 2.1.3, Plotly 5.18.0
- Modular code structure with separate concerns
- PEP 8 compliant code style
- Type hints for better code clarity
- Comprehensive docstrings
- Unit test structure prepared

### Data Processing
- 61,180 total observations loaded from raw data
- 51,492 subnational observations after filtering
- Coverage: 1,600+ regions across 160+ countries
- Time span: 1990-2022 (33 years)
- Bottleneck analysis for all region-year combinations
- Component gap calculations
- Continent mapping for 160+ countries

### Visualizations Implemented
- HDI choropleth map with multiple component views
- Bottleneck choropleth map with categorical coloring
- Component evolution line chart with bottleneck shading
- Component comparison bar chart
- Real-time statistics dashboard

### Configuration Files
- app_config.yaml: Application settings and data paths
- viz_config.yaml: Visualization themes and color schemes

### Known Limitations
- Gender-disaggregated data only available from 2000 onwards
- Some regions have incomplete time series
- Map projection optimized for global view
- Large dataset may require 4GB+ RAM

