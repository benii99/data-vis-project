# Subnational HDI Explorer

Interactive Streamlit application for exploring the Global Data Lab (GDL) Subnational Human Development Index (SHDI) dataset. The tool highlights which HDI component (Health, Education, Income) bottlenecks each region, and how those constraints evolve over time.

---

## Project Overview

- Global choropleth of subnational HDI values with year slider
- Region detail pane that surfaces component trajectories and bottleneck shifts
- Modular Python package split into data access, analysis helpers, visualization primitives, and preprocessing pipelines
- Designed for quick iteration while keeping performance tight through Streamlit caching

---

## Dataset Information

- **Source**: Global Data Lab – Subnational HDI Database v8.3 (https://globaldatalab.org/shdi/)
- **Coverage**: 1,600+ regions across 160+ countries
- **Years**: 1990–2022
- **Key Variables**:
  - Identifiers: `isocode3`, `country`, `gdlcode`, `region`, `year`
  - Composite indices: `shdi`, `healthindex`, `edindex`, `incindex`
  - Raw indicators: `lifexp`, `esch`, `msch`, `lgnic`
  - Optional disaggregation: gender-specific variants (`*_f`, `*_m`) and `sgdi`

---

## HDI Methodology

The Human Development Index is the geometric mean of three normalized components:

```
HDI = (Health_Index × Education_Index × Income_Index)^(1/3)
```

- **Health Index**: normalized life expectancy at birth  
- **Education Index**: mean of expected and mean years of schooling  
- **Income Index**: logarithmic transformation of GNI per capita

## Bottleneck Analysis

The limiting dimension for a region-year pair is defined as:

```
bottleneck_component = argmin(healthindex, edindex, incindex)
```

`src/analysis/bottlenecks.py` exposes helpers that (a) detect bottlenecks row-by-row, (b) assemble time-series of bottleneck shifts, and (c) provide consistent color assignments for the UI background shading.

---

## Project Structure

```
new-data-vis-project/
├── app.py                    # Streamlit entry point (UI orchestration only)
├── assets/
│   └── styles/               # Custom CSS (optional)
├── config/                   # YAML-based application / viz settings
├── data/
│   ├── raw/                  # Raw GDL downloads (never edited)
│   ├── processed/            # Cached outputs (CSV + GeoJSON)
│   └── geojson/              # Boundary files (original + simplified)
├── src/
│   ├── analysis/             # Bottleneck + region utilities
│   ├── data/                 # Path helpers and cached loaders
│   ├── visualizations/       # Plotly chart + map builders
│   └── pipelines/            # Standalone preprocessing scripts
├── tests/                    # (Placeholder) test suite entry point
├── README.md                 # This document
├── CHANGELOG.md              # Project history
└── requirements.txt          # Pinned dependencies
```

### Key Packages

- `src/data/paths.py`: centralizes file-system references (`SHDI_PROCESSED_PATH`, `GEOJSON_ACTIVE_PATH`, …)
- `src/data/loaders.py`: thin wrappers around `pandas`/`geopandas` readers, used by Streamlit caches
- `src/analysis/regions.py`: vectorized helpers for per-year HDI slices and region time series
- `src/visualizations/maps.py`: Plotly map construction + colorscale logic
- `src/visualizations/charts.py`: Component evolution chart with bottleneck-aware shading
- `src/pipelines/`: CLI-friendly scripts for cleaning SHDI data, simplifying GeoJSON, and joining both datasets

---

## Features

- HDI overview with absolute or data-driven color scales
- Click-to-select region interactions with stored session state
- Component evolution chart that highlights the bottleneck at each time step
- Streamlit caching for GeoJSON, SHDI table, yearly HDI vectors, and per-region series
- Modular architecture ready for adding Bottleneck Overview or comparative dashboards

---

## Installation & Setup

### Requirements

- Python 3.8+
- pip
- Optional: GDAL-friendly environment if you plan to re-run GeoJSON simplification (`pyogrio`)

### Steps

```bash
git clone <repo-url>
cd new-data-vis-project
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install --upgrade pip
pip install -r requirements.txt
```

### Prepare Data (first run only)

```bash
# Process SHDI CSV → data/processed/subnational_hdi_processed.csv
python src/pipelines/data_processing.py

# (Optional) regenerate simplified boundaries or join with SHDI
python src/pipelines/simplify_geojson.py
python src/pipelines/associate_shdi_geojson.py
```

Processed artifacts committed to the repo:
- `data/processed/subnational_hdi_processed.csv`
- `data/processed/geojson_shdi.geojson`
- `data/geojson/gdl_regons_simplified_5km.geojson`

---

## Running the Application

```bash
streamlit run app.py
```

Default browser → `http://localhost:8501`

---

## Usage Guide

1. **Mode Selection**: Sidebar radio toggles between HDI Overview (current) and placeholder Bottleneck Overview.
2. **Color Scale**: choose `Absolute (0–1)` or `Range (dynamic)` scale for the choropleth.
3. **Map Interaction**: click any region to load its details; slider beneath the map controls the displayed year.
4. **Detail Pane**: shows selected region metadata and the component evolution chart with bottleneck shading.
5. **Session State**: the latest selected year/region persist across reruns for a smoother workflow.

Tips:
- Use `Shift + scroll` or the Plotly toolbar to zoom the map.
- If the map returns blank regions, ensure the processed CSV and GeoJSON paths described in `src/data/paths.py` exist.

---

## Data Processing Pipeline

1. **Filtering / Bottleneck detection** – `src/pipelines/data_processing.py`
   - Keeps `level == "Subnat"` rows
   - Adds `bottleneck_component` + `bottleneck_value`
   - Stores curated columns into `data/processed/subnational_hdi_processed.csv`
2. **GeoJSON Simplification** – `src/pipelines/simplify_geojson.py`
   - Simplifies raw boundaries, reducing rendering cost
3. **Data ↔ GeoJSON Association** – `src/pipelines/associate_shdi_geojson.py`
   - Adds indices of SHDI rows to GeoJSON (optional helper for advanced tooling)

The Streamlit app consumes only the processed CSV + simplified GeoJSON and leaves raw data untouched.

---

## Application Architecture

- `app.py` imports reusable pieces from `src/*` and focuses on layout, event handling, and caching.
- All expensive IO is wrapped inside `@st.cache_data` so repeated interactions (year slider, selections) stay snappy.
- Visualization logic is pure Plotly → straightforward to extend with additional figures or color policies.

---

## Future Enhancements

1. Implement the Bottleneck Overview mode (e.g., stacked bars or radar charts per component).
2. Gender disaggregation toggle based on `*_f` / `*_m` columns.
3. Comparative view to overlay multiple regions’ trajectories.
4. Export buttons (CSV or PNG) for selected regions.
5. Automated tests in `tests/` covering analysis and visualization helpers.

---

## Attribution & License

- **Dataset**: Global Data Lab, Institute for Management Research, Radboud University – Subnational Human Development Index (v8.3), Creative Commons BY 4.0.
- **Methodology**: Based on UNDP HDI guidelines (https://hdr.undp.org/).
- **License**: Educational / research use. Cite the data source above when publishing derived work.

Recommended citation:

```
Global Data Lab. (2024). Subnational Human Development Index Database (v8.3).
Institute for Management Research, Radboud University. https://globaldatalab.org/shdi/
```

---

_Last updated: November 24, 2025_

