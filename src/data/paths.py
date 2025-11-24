"""
Centralized filesystem helpers for the Streamlit app.
"""

from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR = PROJECT_ROOT / "data"
GEOJSON_DIR = DATA_DIR / "geojson"
PROCESSED_DIR = DATA_DIR / "processed"
RAW_DIR = DATA_DIR / "raw"

GEOJSON_ORIGINAL_PATH = GEOJSON_DIR / "geoBoundariesCGAZ_ADM1.geojson"
GEOJSON_SIMPLIFIED_PATH = GEOJSON_DIR / "geoBoundariesCGAZ_ADM1_simplified_5km.geojson"
GEOJSON_ASSOCIATED_PATH = PROCESSED_DIR / "geojson_shdi.geojson"
GEOJSON_ACTIVE_PATH = GEOJSON_DIR / "gdl_regons_simplified_5km.geojson"

SHDI_PROCESSED_PATH = PROCESSED_DIR / "subnational_hdi_processed.csv"


__all__ = [
    "PROJECT_ROOT",
    "DATA_DIR",
    "GEOJSON_DIR",
    "PROCESSED_DIR",
    "RAW_DIR",
    "GEOJSON_ORIGINAL_PATH",
    "GEOJSON_SIMPLIFIED_PATH",
    "GEOJSON_ASSOCIATED_PATH",
    "GEOJSON_ACTIVE_PATH",
    "SHDI_PROCESSED_PATH",
]


