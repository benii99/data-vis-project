"""
Plotly chart helpers for the Streamlit UI.
"""

from typing import Optional

import numpy as np
import pandas as pd
import plotly.graph_objects as go

from src.analysis.bottlenecks import component_color_map, detect_bottleneck_sequence


def create_component_evolution_chart(region_data: pd.DataFrame) -> Optional[go.Figure]:
    """
    Build a Plotly line chart showing component trajectories with bottleneck shading.
    """
    if region_data.empty:
        return None

    years = region_data["year"].values
    health = region_data.get("healthindex", pd.Series(dtype=float)).values
    education = region_data.get("edindex", pd.Series(dtype=float)).values
    income = region_data.get("incindex", pd.Series(dtype=float)).values
    hdi = region_data.get("shdi", pd.Series(dtype=float)).values
    bottlenecks = detect_bottleneck_sequence(region_data)
    color_map = component_color_map()

    fig = go.Figure()

    for i, bottleneck in enumerate(bottlenecks):
        if not bottleneck or bottleneck not in color_map:
            continue
        if i == 0:
            x0 = years[i] - 0.5
            x1 = (years[i] + years[i + 1]) / 2 if len(years) > 1 else years[i] + 0.5
        elif i == len(years) - 1:
            x0 = (years[i - 1] + years[i]) / 2
            x1 = years[i] + 0.5
        else:
            x0 = (years[i - 1] + years[i]) / 2
            x1 = (years[i] + years[i + 1]) / 2

        fig.add_shape(
            type="rect",
            x0=x0,
            x1=x1,
            y0=0,
            y1=1,
            fillcolor=color_map[bottleneck],
            layer="below",
            line_width=0,
        )

    component_traces = [
        ("Health", health, "rgb(220, 20, 60)"),
        ("Education", education, "rgb(30, 144, 255)"),
        ("Income", income, "rgb(34, 139, 34)"),
    ]

    for name, values, color in component_traces:
        fig.add_trace(
            go.Scatter(
                x=years,
                y=values,
                mode="lines+markers",
                name=name,
                line=dict(color=color, width=2),
                marker=dict(size=4),
            )
        )

    fig.add_trace(
        go.Scatter(
            x=years,
            y=hdi,
            mode="lines+markers",
            name="HDI",
            line=dict(color="rgb(128, 128, 128)", width=2, dash="dash"),
            marker=dict(size=4),
        )
    )

    fig.update_layout(
        xaxis_title="Year",
        yaxis_title="Index Value",
        yaxis=dict(range=[0, 1]),
        hovermode="x unified",
        height=400,
        margin=dict(l=40, r=20, t=20, b=40),
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
    )

    return fig


__all__ = ["create_component_evolution_chart"]


