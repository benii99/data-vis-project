"""
Utilities to prepare Plotly choropleth maps for the HDI overview.
"""

from typing import List, Sequence, Tuple

import numpy as np
import plotly.graph_objects as go

from src.analysis.disparity import METRIC_ABSOLUTE_RANGES


def compute_hdi_scale(values: Sequence[float], mode: str) -> Tuple[List[float], float, float]:
    """
    Return normalized values plus zmin/zmax taking missing entries (-1) into account.
    """
    valid_values = [v for v in values if v != -1]
    if mode == "Range" and valid_values:
        zmin = min(valid_values)
        zmax = max(valid_values)
    else:
        zmin, zmax = 0.0, 1.0

    if zmax > zmin:
        k = 0.0204  # keeps zmin near start of the red band
        missing_value = zmin - k * (zmax - zmin)
    else:
        missing_value = -0.1

    normalized_values = [missing_value if v == -1 else v for v in values]
    return normalized_values, missing_value, zmax


def hdi_colorscale():
    return [
        [0.0, "rgb(255, 255, 255)"],
        [0.01, "rgb(255, 255, 255)"],
        [0.02, "rgb(220, 20, 60)"],
        [0.5, "rgb(255, 200, 0)"],
        [1.0, "rgb(34, 139, 34)"],
    ]


def build_hdi_map(
    gdf,
    geojson_data,
    hdi_values: Sequence[float],
    scale_mode: str,
) -> Tuple[go.Figure, List[int], float, float]:
    """
    Create the base choropleth map figure and return metadata needed for interaction.
    """
    values, display_zmin, display_zmax = compute_hdi_scale(hdi_values, scale_mode)
    region_indices = gdf.index.tolist()

    fig = go.Figure(
        go.Choroplethmapbox(
            geojson=geojson_data,
            locations=gdf.index,
            z=values,
            zmin=display_zmin,
            zmax=display_zmax,
            colorscale=hdi_colorscale(),
            showscale=True,
            marker=dict(line=dict(color="white", width=0.5)),
            text=gdf["gdlcode"],
            customdata=[[idx] for idx in region_indices],
        )
    )

    fig.update_traces(
        selected=dict(marker=dict(opacity=1.0)),
        unselected=dict(marker=dict(opacity=0.7)),
    )

    fig.update_layout(
        mapbox=dict(style="carto-positron", center=dict(lat=20, lon=0), zoom=1.5),
        margin=dict(l=0, r=0, t=0, b=0),
        height=700,
        dragmode="pan",
        clickmode="event+select",
    )

    return fig, region_indices, display_zmin, display_zmax


DISPARITY_COLORSCALE = [
    [0.0, "rgb(255, 255, 255)"],
    [0.1, "rgb(255, 247, 188)"],
    [0.35, "rgb(254, 196, 79)"],
    [0.65, "rgb(236, 112, 20)"],
    [1.0, "rgb(189, 0, 38)"],
]


def compute_disparity_scale(values: Sequence[float], mode: str, metric_key: str) -> Tuple[List[float], float, float]:
    valid_values = [v for v in values if v != -1 and not np.isnan(v)]

    if mode == "Range" and valid_values:
        zmin = min(valid_values)
        zmax = max(valid_values)
    else:
        zmin, zmax = METRIC_ABSOLUTE_RANGES.get(metric_key, (0.0, 1.0))

    if zmax <= zmin:
        zmax = zmin + 1e-6

    missing_value = zmin - 0.05 * (zmax - zmin)
    normalized_values = [missing_value if (v == -1 or np.isnan(v)) else v for v in values]
    return normalized_values, missing_value, zmax


def build_disparity_map(
    gdf,
    geojson_data,
    values: Sequence[float],
    metric_key: str,
    metric_label: str,
    scale_mode: str,
) -> Tuple[go.Figure, List[int], float, float]:
    scaled_values, display_zmin, display_zmax = compute_disparity_scale(values, scale_mode, metric_key)
    region_indices = gdf.index.tolist()

    fig = go.Figure(
        go.Choroplethmapbox(
            geojson=geojson_data,
            locations=gdf.index,
            z=scaled_values,
            zmin=display_zmin,
            zmax=display_zmax,
            colorscale=DISPARITY_COLORSCALE,
            showscale=True,
            marker=dict(line=dict(color="white", width=0.5)),
            text=gdf["gdlcode"],
            customdata=[[idx] for idx in region_indices],
            colorbar=dict(title=metric_label),
        )
    )

    fig.update_traces(
        selected=dict(marker=dict(opacity=1.0)),
        unselected=dict(marker=dict(opacity=0.7)),
    )

    fig.update_layout(
        mapbox=dict(style="carto-positron", center=dict(lat=20, lon=0), zoom=1.5),
        margin=dict(l=0, r=0, t=0, b=0),
        height=700,
        dragmode="pan",
        clickmode="event+select",
    )

    return fig, region_indices, display_zmin, display_zmax


__all__ = [
    "build_hdi_map",
    "compute_hdi_scale",
    "hdi_colorscale",
    "build_disparity_map",
    "compute_disparity_scale",
    "DISPARITY_COLORSCALE",
]


