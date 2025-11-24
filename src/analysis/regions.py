"""
Region-level data helpers for the Streamlit interface.
"""

from typing import List, Sequence

import pandas as pd


def get_year_hdi_values(shdi_df: pd.DataFrame, year: int, gdlcodes: Sequence[str]) -> List[float]:
    """
    Return SHDI values for the provided gdlcodes in a specific year.
    Missing regions are filled with -1 to signal absent data downstream.
    """
    year_data = shdi_df[shdi_df["year"] == year].set_index("gdlcode")
    shdi_series = year_data["shdi"]
    return [shdi_series.get(code, -1) for code in gdlcodes]


def get_region_timeseries(shdi_df: pd.DataFrame, gdlcode: str) -> pd.DataFrame:
    """
    Return all rows for a region sorted by year.
    """
    region_data = shdi_df[shdi_df["gdlcode"] == gdlcode].copy()
    return region_data.sort_values("year")


def available_year_bounds(shdi_df: pd.DataFrame) -> tuple[int, int]:
    """
    Convenience helper returning min/max year present in the dataset.
    """
    years = shdi_df["year"].dropna().astype(int)
    return years.min(), years.max()


__all__ = ["get_year_hdi_values", "get_region_timeseries", "available_year_bounds"]


