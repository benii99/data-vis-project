"""
Helpers to detect HDI bottlenecks and related metadata.
"""

from typing import Dict, Iterable, List, Optional, Sequence, Tuple

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
        "health": "216, 27, 96",    # #D81B60
        "education": "30, 136, 229",  # #1E88E5
        "income": "255, 193, 7",    # #FFC107
    }
    return {k: f"rgba({rgb}, {alpha})" for k, rgb in base_colors.items()}


def get_bottleneck_components(
    shdi_df: pd.DataFrame,
    year: int,
    gdlcodes: Sequence[str],
    missing_label: str = "missing",
) -> List[str]:
    """
    Return the bottleneck component name for each gdlcode in a specific year.
    """
    year_data = shdi_df[shdi_df["year"] == year].set_index("gdlcode")
    results: List[str] = []

    for code in gdlcodes:
        if code in year_data.index:
            component = detect_row_bottleneck(year_data.loc[code])
            results.append(component if component else missing_label)
        else:
            results.append(missing_label)

    return results


def detect_row_bottleneck_with_value(row: pd.Series) -> Tuple[Optional[str], Optional[float]]:
    """
    Return bottleneck component and its value for a given row.
    """
    component = detect_row_bottleneck(row)
    if not component:
        return None, None
    column = COMPONENT_COLUMNS[component]
    return component, row.get(column, np.nan)


def get_bottleneck_components_with_values(
    shdi_df: pd.DataFrame,
    year: int,
    gdlcodes: Sequence[str],
    missing_label: str = "missing",
) -> Tuple[List[str], List[float]]:
    """
    Return bottleneck component labels and their corresponding values for each region.
    """
    year_data = shdi_df[shdi_df["year"] == year].set_index("gdlcode")
    components: List[str] = []
    values: List[float] = []

    for code in gdlcodes:
        if code in year_data.index:
            component, value = detect_row_bottleneck_with_value(year_data.loc[code])
            components.append(component if component else missing_label)
            if value is None or pd.isna(value):
                values.append(np.nan)
            else:
                values.append(float(value))
        else:
            components.append(missing_label)
            values.append(np.nan)

    return components, values


__all__ = [
    "detect_row_bottleneck",
    "detect_bottleneck_sequence",
    "component_color_map",
    "COMPONENT_COLUMNS",
    "get_bottleneck_components",
    "detect_row_bottleneck_with_value",
    "get_bottleneck_components_with_values",
]


