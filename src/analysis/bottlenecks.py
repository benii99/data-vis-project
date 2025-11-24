"""
Helpers to detect HDI bottlenecks and related metadata.
"""

from typing import Dict, Iterable, List, Optional

import numpy as np
import pandas as pd

COMPONENT_COLUMNS: Dict[str, str] = {
    "health": "healthindex",
    "education": "edindex",
    "income": "incindex",
}


def detect_row_bottleneck(row: pd.Series) -> Optional[str]:
    """
    Return the component with the lowest value for a given row.
    """
    component_values = {
        component: row.get(column, np.nan)
        for component, column in COMPONENT_COLUMNS.items()
    }
    valid_components = {k: v for k, v in component_values.items() if pd.notna(v)}
    if not valid_components:
        return None
    return min(valid_components, key=valid_components.get)


def detect_bottleneck_sequence(df: pd.DataFrame) -> List[Optional[str]]:
    """
    Return the bottleneck component for each row in a DataFrame.
    """
    return [detect_row_bottleneck(row) for _, row in df.iterrows()]


def component_color_map(alpha: float = 0.15) -> Dict[str, str]:
    """
    Map components to RGBA colors used throughout the UI.
    """
    base_colors = {
        "health": "220, 20, 60",       # Crimson red
        "education": "30, 144, 255",   # Dodger blue
        "income": "34, 139, 34",       # Forest green
    }
    return {k: f"rgba({rgb}, {alpha})" for k, rgb in base_colors.items()}


__all__ = ["detect_row_bottleneck", "detect_bottleneck_sequence", "component_color_map", "COMPONENT_COLUMNS"]


