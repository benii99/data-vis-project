# Quick Start Guide

Get the Subnational HDI Explorer up and running in just a few minutes.

## Prerequisites

- Python 3.8 or higher
- pip package manager
- 4GB+ RAM recommended

## Installation

1. Navigate to the project directory:
```bash
cd new-data-vis-project
```

2. Create and activate a virtual environment:
```bash
# Create virtual environment
python -m venv venv

# Activate on Linux/Mac
source venv/bin/activate

# Activate on Windows
venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Verify data files are present:
```bash
ls data/raw/
# Should show: Subnational HDI Data v8.3.csv
```

## First Run

The application will automatically process the raw data on first launch.

```bash
streamlit run app.py
```

The application will:
- Load raw data (61,180 observations)
- Filter to subnational level (51,492 observations)
- Perform bottleneck analysis
- Save processed files to `data/processed/`
- Open in your browser at `http://localhost:8501`

This initial processing takes about 30-60 seconds depending on your system.

## Usage

### Basic Navigation

1. **Choose Visualization Mode** (left sidebar)
   - HDI Components: View overall HDI or individual components
   - Bottleneck Analysis: Identify limiting factors

2. **Select Year** (slider)
   - Explore data from 1990 to 2022

3. **Filter by Continent** (dropdown)
   - Focus on specific geographic regions

4. **Select a Region** (bottom section)
   - View detailed time series analysis
   - See component evolution over time

### Interpreting the Visualizations

**HDI Components Mode:**
- Darker colors = higher index values
- Red-Yellow-Green scale for overall HDI
- Component-specific colors for individual indices

**Bottleneck Analysis Mode:**
- Red regions: Health is the limiting factor
- Blue regions: Education is the limiting factor
- Yellow regions: Income is the limiting factor
- Color intensity shows bottleneck severity

**Component Evolution Chart:**
- Three lines show Health, Education, and Income over time
- Background shading indicates which component is the bottleneck
- Shows whether regions are improving their limiting factors

## Troubleshooting

### Data file not found
```
Error: Data file not found: data/raw/Subnational HDI Data v8.3.csv
```
**Solution:** Ensure the raw data file is in the `data/raw/` directory.

### Memory errors
```
MemoryError or system slowdown
```
**Solution:** Close other applications. The full dataset requires about 2-3GB RAM.

### Module import errors
```
ModuleNotFoundError: No module named 'streamlit'
```
**Solution:** Ensure virtual environment is activated and dependencies are installed:
```bash
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
```

### Port already in use
```
Error: Address already in use
```
**Solution:** Use a different port:
```bash
streamlit run app.py --server.port 8502
```

## Manual Data Processing

If you need to reprocess the data manually:

```python
from src.data_processing import process_all_data

# Process raw data
df, timeseries_df = process_all_data()
```

Or from command line:
```bash
python -c "from src.data_processing import process_all_data; process_all_data()"
```

## Running Tests

If you want to run the test suite:

```bash
# Install pytest
pip install pytest

# Run all tests
pytest tests/

# Run with coverage
pip install pytest-cov
pytest tests/ --cov=src
```

## Performance Tips

1. **First load:** The initial data processing takes 30-60 seconds. Subsequent loads are much faster due to caching.

2. **Filtering:** Use continent and year filters to reduce the amount of data being visualized.

3. **Browser:** Modern browsers (Chrome, Firefox, Edge) provide better performance for interactive visualizations.

## Next Steps

- Explore the full documentation in `README.md`
- Check the changelog in `CHANGELOG.md`
- Read about the data in `data/README.md`

## Getting Help

- Review the comprehensive `README.md` for detailed information
- Check data documentation in `data/README.md`
- Examine the code comments and docstrings

## Shutting Down

To stop the application:
1. Press `Ctrl+C` in the terminal
2. Deactivate the virtual environment: `deactivate`

Enjoy exploring global development patterns!

