# Subnational HDI Explorer

Interactive visualization tool for exploring Human Development Index at the subnational level, with focus on identifying bottlenecking factors across regions and over time.

## Project Overview

This Streamlit application visualizes the Global Data Lab Subnational Human Development Index dataset, focusing on identifying which of the three HDI components (Health, Education, or Income) acts as the bottleneck in each country and region for any given year.

### Core Objectives

- Visualize subnational HDI bottlenecks on an interactive world map
- Display variance in HDI components to identify development constraints
- Enable hierarchical exploration from global to country to regional level
- Show temporal evolution of bottlenecks through synchronized time series visualization

## Dataset

### Source
**Global Data Lab - Subnational HDI Database v8.3**
- Coverage: 1,600+ subnational regions across 160+ countries
- Time span: 1990-2022 (33 years)
- Total observations: 61,180 region-year combinations
- Disaggregation: Gender-specific indices available

### Key Variables

**Identifiers**
- `isocode3`: ISO 3-letter country code
- `country`: Country name
- `gdlcode`: Unique subnational region identifier
- `level`: National or Subnat
- `region`: Subnational region name
- `year`: Year of observation

**HDI Components**
- `shdi`: Subnational Human Development Index (0-1)
- `healthindex`: Health component based on life expectancy (0-1)
- `edindex`: Education component (0-1)
- `incindex`: Income component based on GNI per capita (0-1)

**Raw Indicators**
- `lifexp`: Life expectancy at birth (years)
- `esch`: Expected years of schooling (years)
- `msch`: Mean years of schooling (years)
- `lgnic`: Log Gross National Income per capita (2017 PPP USD)

**Gender Disaggregation**
- Variables with `f` suffix: Female-specific values
- Variables with `m` suffix: Male-specific values
- `sgdi`: Subnational Gender Development Index

### HDI Methodology

The HDI is calculated as the geometric mean of three normalized indices:

```
HDI = (Health_Index × Education_Index × Income_Index)^(1/3)
```

**Health Index**: Based on life expectancy at birth, normalized to [0,1]

**Education Index**: Arithmetic mean of two sub-indices
- Mean years of schooling (adults 25+)
- Expected years of schooling (children)

**Income Index**: Based on logarithm of GNI per capita, reflecting diminishing returns

### Bottleneck Identification

The bottleneck is the component with the lowest index value for each region. This identifies which dimension is limiting overall human development:

```
Bottleneck = min(Health_Index, Education_Index, Income_Index)
```

This approach recognizes that the geometric mean ensures balanced development across all dimensions.

## Project Structure

```
new-data-vis-project/
│
├── README.md                      # Project documentation
├── CHANGELOG.md                   # Version history and changes
├── requirements.txt               # Python dependencies
├── .gitignore                     # Git ignore patterns
├── .cursorrules                   # Development guidelines
│
├── app.py                         # Main Streamlit application
│
├── data/
│   ├── raw/                       # Original datasets (never modified)
│   │   ├── Subnational HDI Data v8.3.csv
│   │   └── SHDI-SGDI-8.3-Vardescription.csv
│   ├── processed/                 # Cleaned and processed data
│   │   ├── subnational_data.csv      # Complete dataset with bottleneck analysis
│   │   └── region_timeseries.csv     # Time series for dashboard
│   └── README.md                  # Data documentation and sources
│
├── src/                           # Source code modules
│   ├── __init__.py
│   ├── data_processing.py         # Data loading and processing
│   ├── analysis.py                # Bottleneck detection and statistics
│   ├── visualizations.py          # Visualization components
│   └── utils.py                   # Helper functions
│
├── config/                        # Configuration files
│   ├── app_config.yaml            # Application settings
│   └── viz_config.yaml            # Visualization themes and colors
│
├── assets/                        # Static assets
│   └── styles/                    # Custom CSS
│       └── main.css
│
└── tests/                         # Unit tests
    ├── __init__.py
    ├── test_data_processing.py
    ├── test_analysis.py
    └── test_visualizations.py
```

## Data Processing Pipeline

### Stage 1: Data Loading and Validation
**Module**: `src/data_processing.py`

1. Load raw CSV file (61,180 rows)
2. Validate data types and structure
3. Check for required columns
4. Document data quality issues

### Stage 2: Data Filtering and Cleaning
**Module**: `src/data_processing.py`

1. **Filter subnational data**: Extract only rows where `level == "Subnat"` (51,492 rows)
2. **Handle missing values**:
   - Early years (1990-1999) lack gender-disaggregated data
   - Some regions have incomplete time series
   - Document missing data patterns
3. **Type conversions**: Ensure numeric columns are proper float/int types
4. **Remove duplicates**: Validate unique region-year combinations

### Stage 3: Component Analysis
**Module**: `src/analysis.py`

1. **Bottleneck identification** (for each region-year):
   ```python
   # Identify which component is minimum
   components = {'health': healthindex, 'education': edindex, 'income': incindex}
   bottleneck = min(components, key=components.get)
   bottleneck_value = components[bottleneck]
   ```

2. **Bottleneck mapping** (for visualization):
   - Assign categorical label: 'health', 'education', or 'income'
   - Store bottleneck value for color intensity
   - Create time series of bottleneck transitions

3. **Per-region analysis**:
   - Track which component is bottleneck for each year
   - Identify periods when bottleneck shifts
   - Calculate persistence of bottlenecks over time

### Stage 4: Time Series Preparation
**Module**: `src/data_processing.py`

1. **Dashboard time series format**:
   - Extract essential columns for component evolution chart
   - Pivot to long format optimized for Plotly line charts
   - Include bottleneck identification for each year
   - Columns: gdlcode, region, year, healthindex, edindex, incindex, bottleneck_component

### Stage 5: Geographic Preparation
**Module**: `src/data_processing.py`

1. **Region-country mapping**: Link subnational regions to parent countries
2. **Coordinate enrichment**: Prepare for geographic visualization
3. **ISO code validation**: Ensure proper country code matching
4. **Hierarchy creation**: Enable drill-down from country to region

### Stage 6: Export Processed Data
**Module**: `src/data_processing.py`

Save processed files for efficient loading:
- `subnational_data.csv`: Complete filtered dataset with all years and components
  - Columns: isocode3, country, year, gdlcode, region, continent, shdi, healthindex, edindex, incindex, bottleneck_component, bottleneck_value, and raw indicators
- `region_timeseries.csv`: Long-format time series for dashboard charts
  - Columns: gdlcode, region, year, healthindex, edindex, incindex, bottleneck_component

## Application Architecture

### Interface Layout

The application is divided into three main areas:

**Left Sidebar**
- Simple control panel for visualization options
- Bottleneck visualization toggle (expandable in future versions)

**Main Dashboard - Left (Map Area)**
- Year slider at the top for temporal navigation (1990-2022)
- Primary world map showing subnational-level data
- Three smaller component maps below (Health, Education, Income) with synchronized interaction

**Main Dashboard - Right (Graph Area)**
- Component evolution chart showing temporal trends
- Dynamic background highlighting the bottleneck component in different time periods

### Primary Visualization: Bottleneck Map

The main map displays a geospatial visualization at the subnational level, showing variance or average/max distance of HDI components to identify potential bottlenecks.

**Map Metrics:**
- Variance/spread of component values within regions
- Distance from ideal balanced development
- Visual identification of bottleneck patterns

**Color Coding:**
- Red: Health is the bottleneck
- Blue: Education is the bottleneck  
- Yellow/Green: Income is the bottleneck
- Intensity indicates severity

### Component Detail Maps

Three synchronized smaller maps positioned below the main map:

1. **Health Component Map**: Displays health index values
2. **Education Component Map**: Displays education index values
3. **Income Component Map**: Displays income index values

**Synchronization:**
- Hover on one map highlights the same region on all three
- Click on one map selects across all maps
- Year slider affects all maps simultaneously

### Interactive Drill-Down

**Country Level (Initial View)**
- World map showing all countries at subnational resolution
- Click any country → zooms to show variance within subnational regions
- Displays internal variation and bottleneck patterns

**Subnational Level (Drill-Down)**
- Click on a specific province/region
- Displays detailed HDI component data for that region
- Shows time series evolution in the right panel

**Navigation:**
- Year slider controls temporal dimension across all views
- Click interactions enable spatial drill-down
- Breadcrumb or back button to return to higher level

### Component Evolution Chart

**Right Panel Display:**
- Three colored lines representing Health (red), Education (blue), Income (yellow)
- X-axis: Years (1990-2022)
- Y-axis: Index values (0-1)
- Background color changes to highlight which component is the bottleneck in each time period
- Smooth transitions between bottleneck periods

**Features:**
- Interactive tooltips showing exact values
- Legend with component names
- Clear visual identification of bottleneck shifts over time
- Updates dynamically when regions are selected

### Key Features

**Hierarchical Exploration**
- Start with global subnational view
- Drill down to country-level variance
- Drill further to individual region details
- Seamless navigation between levels

**Multi-Scale Analysis**
- Variance visualization at country level
- Detailed component values at region level
- Temporal evolution across all scales

**Synchronized Interactions**
- All map views respond to the same year slider
- Component maps highlight simultaneously
- Selection propagates across all visualizations

**Bottleneck Focus**
- Primary visualization emphasizes development constraints
- Component maps provide diagnostic detail
- Time series shows whether bottlenecks persist or shift

## Visualization Components

### 1. Main Bottleneck Map (`create_bottleneck_map()`)
**Purpose**: Primary visualization showing which component limits development across subnational regions

**Technology**: Plotly Choropleth with GeoJSON for subnational boundaries

**Display Metrics**:
- Variance/spread of HDI components within regions
- Average distance from balanced development
- Bottleneck identification (lowest component)

**Color Coding**:
- Red: Health is bottleneck
- Blue: Education is bottleneck
- Yellow/Green: Income is bottleneck
- Color intensity: Severity of bottleneck

**Interactivity**:
- Click country → drill down to subnational variance view
- Click region → display detailed component data
- Hover → tooltip with region name and key metrics
- Synchronized with year slider and component maps

### 2. Component Detail Maps (Set of 3)
**Purpose**: Synchronized smaller maps showing individual component values

#### Health Component Map (`create_health_map()`)
- Displays health index at subnational level
- Red color gradient (light to dark)
- Synchronized selection and highlighting

#### Education Component Map (`create_education_map()`)
- Displays education index at subnational level
- Blue color gradient (light to dark)
- Synchronized selection and highlighting

#### Income Component Map (`create_income_map()`)
- Displays income index at subnational level
- Yellow/Green color gradient (light to dark)
- Synchronized selection and highlighting

**Synchronization Features**:
- Hover on one map → highlights region on all three
- Click on one map → selects across all maps
- All respond to the same year slider
- Consistent geographic extent and zoom level

### 3. Component Evolution Chart (`create_evolution_chart()`)
**Purpose**: Time series visualization showing how the three HDI components evolve for selected region

**Technology**: Plotly Line Chart with custom background shading

**Elements**:
- Three lines: Health (red), Education (blue), Income (yellow)
- Dynamic background color indicating which component is bottleneck in each time period
- X-axis: Years (1990-2022)
- Y-axis: Index value (0-1 scale)

**Features**:
- Multi-line comparison of all three components
- Background shading transitions when bottleneck changes
- Interactive tooltips with exact values
- Legend with component names
- Updates dynamically when region is selected
- Zoom and pan capabilities

**Background Shading Logic**:
- Light red background when health is bottleneck
- Light blue background when education is bottleneck
- Light yellow background when income is bottleneck
- Smooth transitions between periods

## Technical Implementation

### Technology Stack
- **Streamlit**: Web application framework
- **Pandas**: Data manipulation and analysis
- **NumPy**: Numerical computations
- **Plotly/Plotly Express**: Interactive visualizations
- **PyYAML**: Configuration management
- **Python 3.8+**: Core language

### Performance Optimizations
- `@st.cache_data`: Cache processed data loading
- Pre-computed bottleneck analysis
- Lazy loading of detailed time series
- Efficient Pandas operations
- Minimal data transformations at runtime

### Configuration Files

**`config/app_config.yaml`**
```yaml
app:
  title: "Subnational HDI Explorer"
  layout: "wide"
  
data:
  latest_year: 2022
  year_range: [1990, 2022]
  
filters:
  default_continent: "All"
  default_year: 2022
```

**`config/viz_config.yaml`**
```yaml
colors:
  hdi_scale: "RdYlGn"
  health_scale: "Reds"
  education_scale: "Blues"
  income_scale: "YlOrBr"
  
  bottleneck_colors:
    health: "#e74c3c"
    education: "#3498db"
    income: "#f39c12"
  
  line_colors:
    health: "#e74c3c"
    education: "#3498db"
    income: "#f39c12"
  
map:
  projection: "natural earth"
  center: {lat: 20, lon: 0}
  zoom: 1
```

## Installation and Setup

### Prerequisites
- Python 3.8 or higher
- pip package manager
- 4GB+ RAM recommended for large dataset

### Installation Steps

1. Clone or download the project
```bash
cd new-data-vis-project
```

2. Create virtual environment
```bash
python -m venv venv
```

3. Activate virtual environment
```bash
# Linux/Mac
source venv/bin/activate

# Windows
venv\Scripts\activate
```

4. Install dependencies
```bash
pip install -r requirements.txt
```

5. Verify data files
```bash
ls data/raw/
# Should see: Subnational HDI Data v8.3.csv
```

6. Process data (first run)
```bash
python -c "from src.data_processing import process_all_data; process_all_data()"
python src\associate_shdi_geojson.py
```

### Running the Application

```bash
streamlit run app.py
```

The application will open in your default browser at `http://localhost:8501`

## Usage Guide

### Basic Workflow

1. **Select Year**: Use the slider at the top of the map area to select a year (1990-2022)
2. **View Global Bottlenecks**: The main map shows which component (Health, Education, or Income) is the bottleneck for each subnational region
3. **Examine Components**: Review the three smaller maps below to see individual component values
4. **Drill Down to Country**: Click on any country to see variance within its subnational regions
5. **Select Region**: Click on a specific province/region to see detailed HDI component data
6. **Analyze Time Series**: The right panel shows how the three components evolve over time for the selected region, with background highlighting the bottleneck periods

### Navigation

**Hierarchical Exploration**
- Start at global subnational view
- Click country → view internal variance
- Click region → view detailed time series
- Use back/breadcrumb to return to higher level

**Temporal Navigation**
- Year slider controls all map views simultaneously
- Time series chart shows full historical range
- Observe how bottlenecks shift over time

**Map Synchronization**
- Hover over any component map → highlights the same region on all three
- Click on any component map → selects across all visualizations
- All maps respond to the same year slider

## Development Guidelines

Refer to `.cursorrules` for comprehensive development standards.

### Key Principles
- Simplicity over complexity
- Functionality over features
- Clean, minimal design
- No placeholder code
- Complete documentation

### Code Style
- PEP 8 compliance
- Type hints where beneficial
- Descriptive variable names
- Clear function docstrings
- No decorative elements

## Future Enhancements

Potential additions for future versions:

1. **Additional Visualization Modes**: Expand sidebar controls with more visualization options beyond bottleneck view
2. **Gender Disaggregation**: Toggle to view male vs female HDI components separately
3. **Comparative Analysis**: Side-by-side comparison of multiple regions
4. **Statistical Clustering**: Identify regions with similar development patterns
5. **Export Capabilities**: Download selected data and visualizations
6. **Temporal Animations**: Automatic playback showing evolution over years
7. **Custom Metrics**: Alternative bottleneck definitions (e.g., gap from maximum component)
8. **Policy Insights**: Contextual suggestions based on identified bottlenecks

## Data Sources and Attribution

**Primary Source**: Global Data Lab, Institute for Management Research, Radboud University
- Database: Subnational Human Development Index (v8.3)
- URL: https://globaldatalab.org/shdi/
- License: Creative Commons BY 4.0

**Methodology**: Based on UNDP Human Development Index methodology
- UNDP Human Development Reports: http://hdr.undp.org/

## Citation

If using this tool in research or publications:

```
Global Data Lab. (2024). Subnational Human Development Index Database (v8.3). 
Institute for Management Research, Radboud University. 
Available at: https://globaldatalab.org/shdi/
```

## License

This project is developed for educational and research purposes.

## Acknowledgments

- Global Data Lab for providing the comprehensive subnational HDI dataset
- UNDP for developing the HDI methodology
- Data Visualization course instructors and peers

## Contact and Contributions

For questions, suggestions, or contributions, please refer to the project repository or contact the development team.

---

**Last Updated**: November 9, 2025
**Version**: 0.1.0
**Status**: Initial Development

