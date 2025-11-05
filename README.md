# Subnational HDI Explorer

Interactive visualization tool for exploring Human Development Index at the subnational level, with focus on identifying bottlenecking factors across regions and over time.

## Project Overview

This application provides an interactive platform to explore the Global Data Lab Subnational HDI dataset, enabling users to visualize development patterns and identify which components (Health, Education, or Income) are limiting factors for different subnational regions worldwide.

### Core Objectives

- Visualize subnational HDI data on an interactive world map
- Identify bottlenecking components for each region
- Track evolution of HDI components over time
- Compare effect of subnational regions with whole-country HDI values

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

**Left Sidebar**: Visualization mode selector
**Center**: Interactive world map with time slider on top
**Right Panel**: Insight dashboard with component evolution

### Visualization Modes

#### 1. HDI Visualization Mode
Displays human development levels across subnational regions.

**Map Display Options:**
- **Overall HDI**: Shows the composite HDI value (0-1 scale)
  - Color scale: Red (low) → Yellow (medium) → Green (high)
  
- **Health Component**: Life expectancy index only
  - Color scale: Light to dark red
  
- **Education Component**: Education index only
  - Color scale: Light to dark blue
  
- **Income Component**: GNI per capita index only
  - Color scale: Light to dark yellow

Color intensity represents the component value, with darker shades indicating higher values.

#### 2. Bottleneck Visualization Mode
Identifies which component is limiting development in each region.

**Map Display:**
- **Red regions**: Health is the bottleneck (lowest component)
- **Blue regions**: Education is the bottleneck (lowest component)
- **Yellow regions**: Income is the bottleneck (lowest component)

Color intensity represents the bottleneck component's value - darker shades indicate a higher bottleneck value (less severe limitation), lighter shades indicate a lower value (more severe limitation).

This visualization immediately reveals geographic patterns in development constraints, enabling targeted policy focus.

### Interactive Elements

**Time Slider** (positioned above map)
- Range: 1990-2022
- Allows temporal exploration of HDI evolution
- Updates map and dashboard in real-time

**Map Interaction**
- Click any subnational region to select it
- Hover for quick information tooltip
- Zoom and pan controls for detailed exploration

**Insight Dashboard** (right panel)
- **Component Evolution Chart**: Line graph showing the three components over time
  - Three lines: Health (red), Education (blue), Income (yellow)
  - Background shading indicates which component is the bottleneck during each time period
  - Clear visualization of how bottlenecks shift over time
  - Shows whether regions are improving their limiting factors

### Key Features

**Geographic Visualization**
- Subnational regions displayed with proper boundaries
- Two distinct visualization modes for different analytical needs
- Smooth color gradients for intuitive understanding
- Interactive tooltips with region name and values

**Temporal Analysis**
- Explore 33 years of development data
- Track component evolution over time
- Identify when bottlenecks change
- Observe improvement patterns

**Bottleneck Identification**
- Instantly see which component limits each region
- Understand geographic patterns of constraints
- Focus policy attention on limiting factors
- Track whether bottlenecks persist or shift

## Visualization Components

### 1. HDI Choropleth Map (`create_hdi_map()`)
**Purpose**: Display human development levels across subnational regions

**Technology**: Plotly Choropleth

**Variants**:
- Overall HDI: Red-Yellow-Green gradient
- Health component: Red gradient (light to dark)
- Education component: Blue gradient (light to dark)
- Income component: Yellow gradient (light to dark)

**Features**: 
- Subnational boundaries
- Interactive hover tooltips
- Click to select region
- Zoom and pan

### 2. Bottleneck Choropleth Map (`create_bottleneck_map()`)
**Purpose**: Identify which component limits development in each region

**Technology**: Plotly Choropleth

**Color Coding**:
- Red: Health is bottleneck
- Blue: Education is bottleneck
- Yellow: Income is bottleneck
- Intensity: Value of bottleneck component (darker = higher value)

**Features**:
- Clear categorical distinction
- Reveals geographic patterns of constraints
- Interactive selection

### 3. Component Evolution Chart (`create_evolution_chart()`)
**Purpose**: Show how the three HDI components change over time for selected region

**Technology**: Plotly Line Chart

**Elements**:
- Three lines: Health (red), Education (blue), Income (yellow)
- Background shading: Indicates which component is bottleneck during each period
- X-axis: Years (1990-2022)
- Y-axis: Index value (0-1)

**Features**:
- Multi-line comparison
- Bottleneck periods highlighted
- Interactive legend
- Zoom capability

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
```

### Running the Application

```bash
streamlit run app.py
```

The application will open in your default browser at `http://localhost:8501`

## Usage Guide

### Basic Workflow

1. **Explore the map**: View subnational HDI distribution globally
2. **Select a region**: Click on a region to view details
3. **Analyze bottlenecks**: See which component limits development
4. **Track over time**: Use the year slider to see evolution
5. **Compare regions**: Filter and compare similar areas

### Advanced Features

**Time Range Analysis**
- Select year range with slider
- View average HDI over period
- Track component changes

**Bottleneck Filtering**
- Filter regions by bottleneck type
- Identify patterns (e.g., education bottlenecks in specific areas)
- Compare intervention effectiveness

**Gender Analysis** (if implemented)
- Toggle gender-disaggregated view
- Compare male vs female indices
- Analyze gender development gaps

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

Potential additions based on user needs:

1. **Comparative analysis**: Side-by-side region comparison
2. **Statistical clustering**: Group regions by development patterns
3. **Projection models**: Predict future HDI based on trends
4. **Gender focus**: Dedicated gender development analysis
5. **Export capabilities**: Download filtered data and visualizations
6. **Custom regions**: Define custom region groups for analysis
7. **Policy insights**: Automated suggestions based on bottlenecks

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

**Last Updated**: November 5, 2025
**Version**: 1.0.0
**Status**: In Development

