# Subnational HDI Explorer

An interactive data visualization dashboard for exploring Subnational Human Development Index (HDI) data across regions worldwide. This application provides multiple visualization modes to analyze HDI components, differences, and bottlenecks using D3.js for map rendering and Chart.js for time series visualization.

## Features

### 🗺️ Multiple Visualization Modes

1. **4-Map Components View**
   - Displays overall HDI (top map) and three component indices: Health, Education, and Income (bottom maps)
   - Each map uses color gradients to represent index values
   - Supports relative and absolute scaling modes

2. **4-Map Difference View**
   - Shows the difference between HDI and component values
   - Top map displays HDI minus the lowest component (bottleneck), colored by the bottleneck component
   - Bottom maps show HDI minus each specific component, highlighting development gaps

3. **Bottleneck View**
   - Displays which component (Health, Education, or Income) is the bottleneck for each region
   - Regions are colored by their bottleneck component
   - Helps identify limiting factors in regional development

### 📊 Interactive Features

- **Time Series Chart**: Click on any region to view HDI and component trends over time
- **Horizon Chart**: Visualizes multiple indicators simultaneously using horizon band visualization
- **Map Synchronization**: All maps in a view are synchronized for pan and zoom
- **Year Slider**: Navigate through data from 1990 to 2022
- **Scale Toggle**: Switch between relative (data-driven) and absolute (0-1) scaling
- **Interactive Tooltips**: Hover over regions to see detailed information
- **Region Selection**: Click regions to view their time series data

## Technologies Used

- **D3.js v7**: Map rendering, geo projections, zoom/pan interactions, and horizon chart visualization
- **Chart.js v4.4.0**: Time series line charts with multiple datasets
- **HTML5/CSS3**: Modern responsive layout
- **Python HTTP Server**: Local development server

## Project Structure

```
d3/
├── dashboard.html          # Main HTML file
├── dashboard.js           # Application logic and D3 map implementation
├── dashboard.css          # Styling
├── start_server.sh        # Server startup script
├── README.md              # This file
└── data/
    ├── geojson/
    │   └── gdl_regons_simplified_5km.geojson  # Geographic boundaries
    └── processed/
        └── subnational_hdi_processed.csv      # HDI data by region and year
```

## Setup Instructions

### Prerequisites

- Python 3 (for HTTP server)
- Modern web browser (Chrome, Firefox, Edge, etc.)
- Bash shell (for start_server.sh on Linux/Mac)

### Running the Application

1. **Navigate to the d3 directory**:
   ```bash
   cd d3
   ```

2. **Start the server**:
   ```bash
   ./start_server.sh dashboard.html
   ```

   Or manually:
   ```bash
   python3 -m http.server 8080
   ```

3. **Open in browser**:
   - The script will automatically open Chrome, or
   - Navigate to `http://127.0.0.1:8080/dashboard.html`

4. **Stop the server**:
   - Press `Ctrl+C` in the terminal, or
   - Run `kill <PID>` where PID is shown when starting the server

## Code Architecture

### Main Components

#### 1. **D3Map Class** (`dashboard.js`)

A custom class that replaces Leaflet maps with pure D3.js implementation:

```javascript
class D3Map {
    constructor(containerId)
    init()                    // Initialize SVG, projection, zoom
    updateSize()              // Update map dimensions
    fitBounds()               // Fit projection to data bounds
    setView(center, zoom)     // Set map center and zoom level
    getCenter()               // Get current map center
    getZoom()                 // Get current zoom level
    syncFrom(sourceMap)       // Synchronize with another map
    renderFeatures()          // Render GeoJSON features
    invalidateSize()          // Recalculate size and re-render
}
```

**Key Features**:
- Uses `d3.geoMercator()` for map projection
- Implements pan/zoom with `d3.zoom()`
- Handles tooltips, click events, and styling
- Supports map synchronization across multiple instances

#### 2. **Data Loading and Processing**

- Loads GeoJSON for geographic boundaries
- Loads CSV for HDI data
- Creates lookup tables for efficient data access:
  - `dataLookup`: `{gdlcode: {year: {shdi, healthindex, edindex, incindex, region, country}}}`
  - `timeSeries`: `{gdlcode: {years, shdi, healthindex, edindex, incindex, region, country}}`

#### 3. **Visualization Functions**

- `updateMaps()`: Renders component maps (HDI, Health, Education, Income)
- `updateDifferenceMaps()`: Renders difference maps
- `updateBottleneckMap()`: Renders bottleneck visualization
- `updateChart()`: Updates time series chart
- `updateHorizonChart()`: Updates horizon band chart

#### 4. **Styling Functions**

- `createStyleFunction(mapType)`: Creates style function for component maps
- `createDifferenceStyleFunction(diffType)`: Creates style function for difference maps
- `createBottleneckStyleFunction()`: Creates style function for bottleneck map
- `getColorForValue(value, type)`: Maps values to colors based on type
- `normalizeValue(value, mapType)`: Normalizes values based on scale mode

#### 5. **Helper Functions**

- `getMapCenter()`: Calculates geographic center from GeoJSON
- `getValueRange(mapType)`: Gets min/max values for current year
- `getBottleneckComponent()`: Determines which component is the bottleneck
- `getDifferenceData()`: Calculates difference values
- `interpolateColor()`: Interpolates between two hex colors

### State Management

Global state variables:
- `geojsonData`: Loaded GeoJSON data
- `dataLookup`: Data organized by gdlcode and year
- `timeSeries`: Time series data for each region
- `currentYear`: Currently selected year
- `selectedGdlcode`: Currently selected region
- `useRelativeScale`: Scale mode (relative vs absolute)
- `currentVizMode`: Active visualization mode
- `maps`, `diffMaps`, `bottleneckMap`: Map instances

## Data Format

### GeoJSON Structure

The GeoJSON file contains geographic boundaries with properties:
```json
{
  "type": "FeatureCollection",
  "features": [{
    "type": "Feature",
    "properties": {
      "gdlcode": "unique_region_id"
    },
    "geometry": {...}
  }]
}
```

### CSV Structure

The CSV file contains HDI data with columns:
- `gdlcode`: Unique region identifier (matches GeoJSON)
- `year`: Year of data (1990-2022)
- `shdi`: Subnational HDI value
- `healthindex`: Health component index
- `edindex`: Education component index
- `incindex`: Income component index
- `region`: Region name
- `country`: Country name

## Usage Guide

### Navigating the Dashboard

1. **Select Visualization Mode**: Click buttons in the left sidebar
2. **Change Year**: Use the slider at the top of the left panel
3. **Toggle Scale**: Click "Scale: Relative/Absolute" button
4. **Select Region**: Click on any region in the maps
5. **View Details**: Hover over regions to see tooltips
6. **Pan/Zoom Maps**: 
   - Drag to pan
   - Scroll to zoom
   - Maps in the same view are synchronized

### Understanding the Visualizations

- **Color Gradients**: 
  - HDI: Green (high) to Red (low)
  - Components: White (low) to Component Color (high)
  - Differences: White (no difference) to Component Color (large difference)

- **Bottleneck Colors**:
  - Health: Pink (#D81B60)
  - Education: Blue (#1E88E5)
  - Income: Yellow (#FFC107)

- **Scale Modes**:
  - **Relative**: Colors based on min/max values in current year (highlights variation)
  - **Absolute**: Colors based on 0-1 scale (shows absolute values)

### Horizon Chart

The horizon chart shows multiple indicators simultaneously:
- Uses log-scale transformation from baseline
- Automatically orders indicators by correlation
- Color bands represent positive (blue) and negative (red) changes
- Hover to see exact values for each year

## Browser Compatibility

- Chrome/Chromium (recommended)
- Firefox
- Safari
- Edge

## Development Notes

### Custom D3 Map Implementation

This project uses a custom D3.js map implementation instead of Leaflet for:
- Full control over rendering
- Better integration with D3 visualizations
- Smaller bundle size (no Leaflet dependency)
- Consistent styling with other D3 charts

### Performance Considerations

- GeoJSON is simplified (5km tolerance) for faster rendering
- Maps use SVG for crisp rendering at any zoom level
- Features are re-rendered only when data changes
- Map synchronization prevents infinite loops with debouncing

### Future Enhancements

Potential improvements:
- Add more visualization modes
- Export functionality for charts and maps
- Filter by country or region
- Compare multiple regions side-by-side
- Add animation for year transitions

## License

This project is part of a data visualization course/master's project.

## Credits

- Data: Subnational HDI Data v8.3
- Geographic boundaries: GDL Shapefiles V6.5
- Visualization libraries: D3.js, Chart.js

