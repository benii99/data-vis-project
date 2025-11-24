"""
Data loading utilities so Streamlit app stays lean.
"""

from pathlib import Path
from typing import Optional

import geopandas as gpd
import pandas as pd


def load_geojson(path: Path, simplify: bool = False, tolerance: float = 0.05) -> gpd.GeoDataFrame:
    """
    Load a GeoJSON file and optionally simplify its geometry.
    """
    gdf = gpd.read_file(path)
    if simplify:
        gdf["geometry"] = gdf["geometry"].simplify(tolerance=tolerance, preserve_topology=True)
    return gdf


def load_shdi_dataframe(path: Path) -> pd.DataFrame:
    """
    Load the processed SHDI CSV file.
    """
    return pd.read_csv(path)


__all__ = ["load_geojson", "load_shdi_dataframe"]


