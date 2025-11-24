import json
import numpy as np
import pandas as pd
from urllib.request import urlopen

import dash
from dash import dcc, html
from dash.dependencies import Input, Output

import plotly.graph_objects as go

# Load counties
with urlopen('https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json') as response:
    counties = json.load(response)

# Load unemployment data
df = pd.read_csv(
    "https://raw.githubusercontent.com/plotly/datasets/master/fips-unemp-16.csv",
    dtype={"fips": str}
)

app = dash.Dash(__name__)

def make_figure(center={"lat":37.0902,"lon":-95.7129}, zoom=3.4):
    fig = go.Figure()

    fig.add_trace(go.Choroplethmap(
        geojson=counties,
        locations=df.fips,
        z=df.unemp,
        colorscale="Viridis",
        marker=dict(opacity=0.75),
        colorbar_title="Normal"
    ))

    fig.update_layout(
        mapbox=dict(
            style="carto-positron",
            center=center,
            zoom=zoom
        ),
        margin=dict(l=0,r=0,t=0,b=0)
    )
    return fig

def make_figure_log(center={"lat":37.0902,"lon":-95.7129}, zoom=3.4):
    fig = go.Figure()

    fig.add_trace(go.Choroplethmap(
        geojson=counties,
        locations=df.fips,
        z=np.log10(df.unemp),
        colorscale="Viridis",
        marker=dict(opacity=0.75),
        colorbar_title="Log10"
    ))

    fig.update_layout(
        mapbox=dict(
            style="carto-positron",
            center=center,
            zoom=zoom
        ),
        margin=dict(l=0,r=0,t=0,b=0)
    )
    return fig

app.layout = html.Div([
    html.Div([
        dcc.Graph(id="map1", figure=make_figure())
    ], style={"width":"50%","display":"inline-block"}),

    html.Div([
        dcc.Graph(id="map2", figure=make_figure_log())
    ], style={"width":"50%","display":"inline-block"})
])

# Synchronize pan/zoom
@app.callback(
    Output("map2", "figure"),
    Input("map1", "relayoutData"),
    prevent_initial_call=True
)
def sync_mapbox(relayout_data):
    center = {"lat":37.0902,"lon":-95.7129}
    zoom = 3.4
    if relayout_data:
        if "mapbox.center" in relayout_data:
            center = relayout_data["mapbox.center"]
        if "mapbox.zoom" in relayout_data:
            zoom = relayout_data["mapbox.zoom"]
    return make_figure_log(center=center, zoom=zoom)

@app.callback(
    Output("map1", "figure"),
    Input("map2", "relayoutData"),
    prevent_initial_call=True
)
def sync_mapbox_reverse(relayout_data):
    center = {"lat":37.0902,"lon":-95.7129}
    zoom = 3.4
    if relayout_data:
        if "mapbox.center" in relayout_data:
            center = relayout_data["mapbox.center"]
        if "mapbox.zoom" in relayout_data:
            zoom = relayout_data["mapbox.zoom"]
    return make_figure(center=center, zoom=zoom)

if __name__ == "__main__":
    app.run(debug=True)
