# HDI Explorer - Quick Start Guide

## Running the Application

### 1. Activate Virtual Environment
```bash
source venv/bin/activate
```

### 2. Run the Streamlit App
```bash
streamlit run app.py
```

The app will automatically open in your browser at `http://localhost:8501`

## Features Implemented

### Interactive World Map
- **Choropleth visualization** showing HDI or component indices by country
- **Click and hover** for country details
- **Multiple metrics** to display:
  - Human Development Index (HDI)
  - Health Index
  - Education Index
  - Income Index
  - Component Gap (difference between strongest and weakest components)

### Filtering Options (Sidebar)
1. **HDI Category**: Filter by Very High, High, Medium, or Low development
2. **Region**: Filter by UN geographic regions
3. **Bottleneck Component**: Show only countries where Health, Education, or Income is the limiting factor

### Time Range Slider
- **Select year range** from 1990-2021
- **Calculates mean HDI** for the selected period
- **Displays statistics**:
  - Global mean HDI for selected years
  - Filtered mean HDI (if filters are applied)
  - Delta showing difference from global average

### Summary Statistics
- Average HDI, Health, Education, and Income indices
- Real-time updates based on filters

### Bottleneck Analysis
- **Bar chart** showing distribution of bottleneck components
- **Percentage breakdown** of limiting factors
- Helps identify which component is holding back development in different regions

### Data Table
- Expandable detailed view of all filtered countries
- Sortable by any column
- Shows all key metrics

## Color Schemes

- **HDI**: Red-Yellow-Green (low to high)
- **Health Index**: Red gradient
- **Education Index**: Blue gradient
- **Income Index**: Green gradient
- **Component Gap**: Yellow-Orange-Red (small to large gaps)

## Usage Examples

### Example 1: Find Education Bottlenecks in Africa
1. Set **Bottleneck Component** to "Education"
2. Set **Region** to "SSA" (Sub-Saharan Africa)
3. Select **Display on Map** as "Education Index"
4. Result: See which African countries have education as their main limiting factor

### Example 2: Compare HDI Progress Over Time
1. Move **Year Range Slider** from 1990-2000
2. Note the "Global Mean HDI" value
3. Move slider to 2010-2021
4. Compare the difference in global average

### Example 3: Analyze Very High Development Countries
1. Set **HDI Category** to "Very High"
2. Set **Display on Map** to "Component Gap"
3. Result: Even in highly developed countries, see which have unbalanced development

## Troubleshooting

### "No processed data found" Error
Run the data processing script first:
```bash
python3 src/data_processing.py
```

### Module Not Found Errors
Install dependencies:
```bash
pip install -r requirements.txt
```

### Port Already in Use
Specify a different port:
```bash
streamlit run app.py --server.port 8502
```

## File Structure

```
app.py                          # Main Streamlit application
src/
  ├── data_processing.py        # Data loading and processing
  ├── visualizations.py         # Chart creation functions
  └── utils.py                  # Helper functions
data/
  ├── raw/data-raw.csv          # Original HDI dataset
  └── processed/                # Processed CSV files
```

## Next Steps

You can extend the application with:
- Country comparison feature
- Clustering visualization (K-Means, Hierarchical)
- Time series charts for individual countries
- Radar charts comparing countries to regional averages
- Export functionality for filtered data

Enjoy exploring the Human Development Index!

