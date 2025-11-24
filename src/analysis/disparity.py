"""
Component disparity metrics used for bottleneck overview visualizations.
"""

from typing import Dict, List, Sequence

import numpy as np
import pandas as pd

COMPONENT_COLUMNS = ["healthindex", "edindex", "incindex"]

METRIC_LABELS: Dict[str, str] = {
    "variance": "Variance (σ²)",
    "avg_distance": "Average Distance from Mean",
    "max_gap": "Max Component Gap",
}

METRIC_DESCRIPTIONS: Dict[str, str] = {
    "variance": "Variance of the three component indices; higher values mean unbalanced development.",
    "avg_distance": "Average absolute distance of each component from their mean; highlights overall imbalance.",
    "max_gap": "Difference between highest and lowest component; 1.0 means complete divergence.",
}

# Reasonable default ranges for absolute color scale mode
METRIC_ABSOLUTE_RANGES: Dict[str, tuple[float, float]] = {
    "variance": (0.0, 0.25),        # Variance of values bounded to [0,1]
    "avg_distance": (0.0, 0.5),
    "max_gap": (0.0, 1.0),
}


def _component_values(row: pd.Series) -> np.ndarray:
    values = [row.get(col, np.nan) for col in COMPONENT_COLUMNS]
    valid = [float(v) for v in values if pd.notna(v)]
    return np.array(valid, dtype=float)


def _calculate_disparity(values: np.ndarray, metric: str) -> float:
    if values.size == 0:
        return np.nan

    if metric == "variance":
        return float(np.var(values))
    if metric == "avg_distance":
        mean_val = np.mean(values)
        return float(np.mean(np.abs(values - mean_val)))
    if metric == "max_gap":
        return float(np.max(values) - np.min(values))

    raise ValueError(f"Unknown disparity metric: {metric}")


def get_disparity_values(
    shdi_df: pd.DataFrame,
    year: int,
    gdlcodes: Sequence[str],
    metric: str,
    missing_value: float = -1.0,
) -> List[float]:
    """
    Compute disparity metric per region for a given year.
    """
    year_data = shdi_df[shdi_df["year"] == year].set_index("gdlcode")
    results: List[float] = []

    for code in gdlcodes:
        if code in year_data.index:
            components = _component_values(year_data.loc[code])
            value = _calculate_disparity(components, metric)
            results.append(value if not np.isnan(value) else missing_value)
        else:
            results.append(missing_value)

    return results


__all__ = [
    "METRIC_LABELS",
    "METRIC_DESCRIPTIONS",
    "METRIC_ABSOLUTE_RANGES",
    "get_disparity_values",
]


