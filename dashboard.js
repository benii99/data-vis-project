/* ==================== CONFIGURATION ==================== */
const geojsonUrl = "http://127.0.0.1:8080/data/geojson/gdl_regons_simplified_5km.geojson";
const csvUrl = "http://127.0.0.1:8080/data/processed/subnational_hdi_processed.csv";

/* ==================== UTILITY FUNCTIONS ==================== */

// Helper function to convert string to number, handling NaN
function toNumber(s) {
    if (s == null || s === "") return null;
    const str = String(s).trim();
    if (str === "") return null;
    const n = +str.replace(/\u00A0/g, "");
    return isNaN(n) ? null : n;
}

// Helper function to safely get value
function safeValue(val) {
    if (val === null || val === undefined || val === "" || isNaN(val)) {
        return null;
    }
    return parseFloat(val);
}

// Horizon chart helper functions
function pearson(x, y) {
    if (!Array.isArray(x) || !Array.isArray(y) || x.length !== y.length) return 0;
    const a = [], b = [];
    for (let i = 0; i < x.length; i++) {
        if (!isNaN(x[i]) && !isNaN(y[i])) { a.push(x[i]); b.push(y[i]); }
    }
    if (!a.length) return 0;
    const mx = d3.mean(a), my = d3.mean(b);
    let num = 0, sx = 0, sy = 0;
    for (let i = 0; i < a.length; i++) {
        const dx = a[i] - mx, dy = b[i] - my;
        num += dx * dy; sx += dx * dx; sy += dy * dy;
    }
    const den = Math.sqrt(sx) * Math.sqrt(sy);
    return den === 0 ? 0 : num / den;
}

function permutations(xs) {
    if (xs.length === 0) return [[]];
    const out = [];
    for (let i = 0; i < xs.length; i++) {
        const rest = permutations(xs.slice(0, i).concat(xs.slice(i + 1)));
        for (const r of rest) out.push([xs[i], ...r]);
    }
    return out;
}

/* ==================== GLOBAL STATE ==================== */
let geojsonData = null;
let dataLookup = {};
let timeSeries = {};
let rawCsvData = null; // Store raw CSV for horizon chart
let years = [];
let currentYear = null;
let selectedGdlcode = null;
let chart = null;
let useRelativeScale = true;
let currentVizMode = 'components';

// Common projection parameters for synchronization
let commonProjection = null;
let referenceWidth = 0;
let referenceHeight = 0;

// Shared zoom behaviors for synchronization
let sharedZoomMaps = null;
let sharedZoomDiffMaps = null;

// Store all map instances (D3-based)
const maps = []; // Array of D3Map instances
const diffMaps = [];
let bottleneckMap = null;

/* ==================== D3MAP CLASS ==================== */

// D3Map class to encapsulate map functionality
class D3Map {
    constructor(containerId, options = {}) {
        this.containerId = containerId;
        this.mapType = options.mapType || null;
        this.syncGroup = options.syncGroup || null; // Array of maps to sync with
        this.syncIndex = options.syncIndex || null; // Index in sync group
        
        this.svg = null;
        this.g = null;
        this.projection = null;
        this.path = null;
        this.zoom = null;
        this.width = 0;
        this.height = 0;
        this.tooltip = null;
        
        this.initialized = false;
    }
    
    initialize() {
        const container = d3.select(`#${this.containerId}`);
        if (container.empty()) return false;
        
        // Get container dimensions
        const containerNode = container.node();
        let width = containerNode.clientWidth;
        let height = containerNode.clientHeight;
        
        // If dimensions are 0 or invalid, use defaults
        if (!width || width === 0) width = 800;
        if (!height || height === 0) height = 600;
        
        this.width = width;
        this.height = height;
        
        // Create SVG
        this.svg = container.append('svg')
            .attr('width', '100%')
            .attr('height', '100%')
            .attr('viewBox', `0 0 ${width} ${height}`)
            .attr('preserveAspectRatio', 'xMidYMid meet')
            .style('background-color', '#fafafa')
            .style('display', 'block');
        
        // Create projection - use Mercator projection
        this.projection = d3.geoMercator();
        this.path = d3.geoPath().projection(this.projection);
        
        // Fit projection to GeoJSON data
        // Use common projection if available (for synchronization)
        if (commonProjection && geojsonData) {
            // Copy the common projection parameters
            this.projection.scale(commonProjection.scale())
                .translate(commonProjection.translate());
        } else if (geojsonData) {
            this.projection.fitSize([width, height], geojsonData);
        } else {
            // Default projection if no data yet
            this.projection.scale(150).translate([width / 2, height / 2]);
        }
        
        // Create main group for map features
        this.g = this.svg.append('g');
        
        // Zoom behavior will be set up after all maps are initialized
        // This allows us to create a shared zoom behavior for the sync group
        this.zoom = null;
        
        // Set initial transform (will be applied when zoom is set up)
        this.initialTransform = d3.zoomIdentity;
        
        // Create tooltip
        this.tooltip = d3.select('body').selectAll(`.map-tooltip-${this.containerId}`)
            .data([0])
            .join('div')
            .attr('class', `map-tooltip map-tooltip-${this.containerId}`)
            .style('position', 'absolute')
            .style('padding', '8px')
            .style('background', 'rgba(0, 0, 0, 0.8)')
            .style('color', 'white')
            .style('border-radius', '4px')
            .style('pointer-events', 'none')
            .style('opacity', 0)
            .style('font-size', '12px')
            .style('z-index', 1000);
        
        this.initialized = true;
        return true;
    }
    
    update(mapType) {
        if (!this.initialized || !geojsonData || !this.g) return;
        
        this.mapType = mapType || this.mapType;
        if (!this.mapType) return;
        
        // Ensure projection is properly fitted
        const containerNode = d3.select(`#${this.containerId}`).node();
        let needsRefit = false;
        if (containerNode) {
            const width = containerNode.clientWidth || this.width;
            const height = containerNode.clientHeight || this.height;
            if (width > 0 && height > 0 && (width !== this.width || height !== this.height)) {
                this.width = width;
                this.height = height;
                this.svg.attr('viewBox', `0 0 ${width} ${height}`);
                needsRefit = true;
            }
        }
        
        // Refit projection if needed
        // But use common projection if available to maintain synchronization
        if (needsRefit) {
            if (commonProjection) {
                // Use common projection parameters to maintain sync
                this.projection.scale(commonProjection.scale())
                    .translate(commonProjection.translate());
            } else if (geojsonData) {
                this.projection.fitSize([this.width, this.height], geojsonData);
            }
            this.path.projection(this.projection);
        }
        
        // Remove existing paths
        this.g.selectAll('path.region').remove();
        
        // Bind data and create paths
        const paths = this.g.selectAll('path.region')
            .data(geojsonData.features)
            .join('path')
            .attr('class', 'region')
            .attr('d', this.path)
            .attr('fill', d => {
                const gdlcode = d.properties.gdlcode;
                const yearData = dataLookup[gdlcode] && dataLookup[gdlcode][currentYear];
                let value = null;
                if (yearData) {
                    if (this.mapType === 'shdi') {
                        value = yearData.shdi;
                    } else if (this.mapType === 'healthindex') {
                        value = yearData.healthindex;
                    } else if (this.mapType === 'edindex') {
                        value = yearData.edindex;
                    } else if (this.mapType === 'incindex') {
                        value = yearData.incindex;
                    }
                }
                return getColorForValue(value, this.mapType);
            })
            .attr('stroke', d => {
                const gdlcode = d.properties.gdlcode;
                return selectedGdlcode === gdlcode ? '#ff0000' : '#333';
            })
            .attr('stroke-width', d => {
                const gdlcode = d.properties.gdlcode;
                return selectedGdlcode === gdlcode ? 2 : 0.5;
            })
            .attr('vector-effect', 'non-scaling-stroke')
            .style('shape-rendering', 'geometricPrecision')
            .attr('fill-opacity', d => {
                const gdlcode = d.properties.gdlcode;
                const yearData = dataLookup[gdlcode] && dataLookup[gdlcode][currentYear];
                let value = null;
                if (yearData) {
                    if (this.mapType === 'shdi') {
                        value = yearData.shdi;
                    } else if (this.mapType === 'healthindex') {
                        value = yearData.healthindex;
                    } else if (this.mapType === 'edindex') {
                        value = yearData.edindex;
                    } else if (this.mapType === 'incindex') {
                        value = yearData.incindex;
                    }
                }
                return value !== null ? 0.7 : 0.3;
            })
            .style('cursor', 'pointer')
            .on('mouseover', (event, d) => {
                const gdlcode = d.properties.gdlcode;
                const yearData = dataLookup[gdlcode] && dataLookup[gdlcode][currentYear];
                
                let value = null;
                let label = this.mapType.toUpperCase();
                if (yearData) {
                    if (this.mapType === 'shdi') {
                        value = yearData.shdi;
                        label = 'HDI';
                    } else if (this.mapType === 'healthindex') {
                        value = yearData.healthindex;
                        label = 'Health';
                    } else if (this.mapType === 'edindex') {
                        value = yearData.edindex;
                        label = 'Education';
                    } else if (this.mapType === 'incindex') {
                        value = yearData.incindex;
                        label = 'Income';
                    }
                }
                
                const regionName = yearData ? yearData.region : gdlcode;
                const tooltipText = value !== null 
                    ? `${regionName}<br>${label}: ${value.toFixed(3)}`
                    : `${regionName}<br>No data`;
                
                this.tooltip
                    .html(tooltipText)
                    .style('opacity', 1)
                    .style('left', (event.pageX + 10) + 'px')
                    .style('top', (event.pageY - 10) + 'px');
            })
            .on('mousemove', (event) => {
                this.tooltip
                    .style('left', (event.pageX + 10) + 'px')
                    .style('top', (event.pageY - 10) + 'px');
            })
            .on('mouseout', () => {
                this.tooltip.style('opacity', 0);
            })
            .on('click', (event, d) => {
                selectRegion(d.properties.gdlcode);
            });
    }
    
    resize() {
        if (!this.initialized) return;
        
        const containerNode = d3.select(`#${this.containerId}`).node();
        if (containerNode) {
            const newWidth = containerNode.clientWidth || this.width;
            const newHeight = containerNode.clientHeight || this.height;
            
            if (newWidth > 0 && newHeight > 0) {
                this.width = newWidth;
                this.height = newHeight;
                this.svg.attr('viewBox', `0 0 ${newWidth} ${newHeight}`);
                
                // Use common projection if available to maintain synchronization
                if (commonProjection) {
                    this.projection.scale(commonProjection.scale())
                        .translate(commonProjection.translate());
                    this.path.projection(this.projection);
                } else if (geojsonData) {
                    this.projection.fitSize([newWidth, newHeight], geojsonData);
                    this.path.projection(this.projection);
                }
            }
        }
    }
    
    setZoomBehavior(zoomBehavior) {
        if (!this.initialized || !this.svg) return;
        this.zoom = zoomBehavior;
        this.svg.call(this.zoom);
        // Apply initial transform
        this.svg.call(this.zoom.transform, this.initialTransform);
    }
    
    getTransform() {
        if (!this.initialized || !this.g || !this.g.node()) return null;
        return d3.zoomTransform(this.g.node());
    }
    
    // Static method to create shared zoom behavior for a group of maps
    static createSharedZoom(mapGroup) {
        const zoom = d3.zoom()
            .scaleExtent([0.5, 8])
            .on('zoom', (event) => {
                // Apply the same transform to all maps in the group
                mapGroup.forEach(map => {
                    if (map && map.initialized && map.g) {
                        map.g.attr('transform', event.transform);
                    }
                });
            });
        
        return zoom;
    }
}

/* ==================== CONSTANTS ==================== */

// Component colors
const COMPONENT_COLORS = {
    health: '#D81B60',
    education: '#1E88E5',
    income: '#FFC107',
    missing: '#E0E0E0'
};

// Map types and their legend IDs
const mapTypes = [
    {id: 'map-top', type: 'shdi', legendId: 'legend-top', title: 'HDI'},
    {id: 'map-bottom-1', type: 'healthindex', legendId: 'legend-bottom-1', title: 'Health'},
    {id: 'map-bottom-2', type: 'edindex', legendId: 'legend-bottom-2', title: 'Education'},
    {id: 'map-bottom-3', type: 'incindex', legendId: 'legend-bottom-3', title: 'Income'}
];

// Difference map types and their legend IDs
const diffMapTypes = [
    {id: 'map-diff-top', type: 'diff-bottleneck', legendId: 'legend-diff-top', title: 'HDI - Lowest'},
    {id: 'map-diff-bottom-1', type: 'diff-health', legendId: 'legend-diff-bottom-1', title: 'HDI - Health'},
    {id: 'map-diff-bottom-2', type: 'diff-education', legendId: 'legend-diff-bottom-2', title: 'HDI - Education'},
    {id: 'map-diff-bottom-3', type: 'diff-income', legendId: 'legend-diff-bottom-3', title: 'HDI - Income'}
];

/* ==================== GEOJSON PROCESSING ==================== */

// Simple function to rewind GeoJSON features (fixes polygon winding order)
// Based on: https://stackoverflow.com/a/49311635
function rewindFeature(feature, reverse) {
    const geom = feature.geometry;
    if (geom.type === 'Polygon') {
        geom.coordinates = rewindRings(geom.coordinates, reverse);
    } else if (geom.type === 'MultiPolygon') {
        geom.coordinates = geom.coordinates.map(rings => rewindRings(rings, reverse));
    }
    return feature;
}

function rewindRings(rings, reverse) {
    if (rings.length === 0) return rings;
    rings[0] = rewindRing(rings[0], reverse);
    for (let i = 1; i < rings.length; i++) {
        rings[i] = rewindRing(rings[i], !reverse);
    }
    return rings;
}

function rewindRing(ring, reverse) {
    if (ring.length < 4) return ring;
    let area = 0;
    for (let i = 0, len = ring.length, j = len - 1; i < len; j = i++) {
        area += (ring[i][0] - ring[j][0]) * (ring[j][1] + ring[i][1]);
    }
    if (area > 0 !== reverse) {
        return ring.reverse();
    }
    return ring;
}

/* ==================== DATA LOADING ==================== */

// Load and process data
Promise.all([
    d3.json(geojsonUrl),
    d3.csv(csvUrl)
]).then(([geojson, csvRows]) => {
    // Rewind features to fix polygon winding order (important for proper rendering)
    const fixedFeatures = geojson.features.map(feature => rewindFeature(feature, true));
    geojsonData = {
        type: 'FeatureCollection',
        features: fixedFeatures
    };
    rawCsvData = csvRows; // Store raw CSV data for horizon chart
    
    // Process CSV data
    const processedRows = csvRows.map(row => ({
        gdlcode: row.gdlcode,
        year: parseInt(row.year),
        shdi: safeValue(row.shdi),
        healthindex: safeValue(row.healthindex),
        edindex: safeValue(row.edindex),
        incindex: safeValue(row.incindex),
        region: row.region || '',
        country: row.country || ''
    }));
    
    // Get available years
    years = [...new Set(processedRows.map(r => r.year))].filter(y => !isNaN(y)).sort((a, b) => a - b);
    currentYear = years[years.length - 1]; // Default to latest year
    
    // Create data lookup: {gdlcode: {year: {shdi, healthindex, edindex, incindex, region, country}}}
    dataLookup = {};
    processedRows.forEach(row => {
        if (!dataLookup[row.gdlcode]) {
            dataLookup[row.gdlcode] = {};
        }
        dataLookup[row.gdlcode][row.year] = {
            shdi: row.shdi,
            healthindex: row.healthindex,
            edindex: row.edindex,
            incindex: row.incindex,
            region: row.region,
            country: row.country
        };
    });
    
    // Create time series data
    timeSeries = {};
    Object.keys(dataLookup).forEach(gdlcode => {
        const yearKeys = Object.keys(dataLookup[gdlcode]).map(y => parseInt(y)).sort((a, b) => a - b);
        if (yearKeys.length > 0) {
            const firstYear = dataLookup[gdlcode][yearKeys[0]];
            timeSeries[gdlcode] = {
                years: yearKeys,
                shdi: yearKeys.map(y => dataLookup[gdlcode][y].shdi),
                healthindex: yearKeys.map(y => dataLookup[gdlcode][y].healthindex),
                edindex: yearKeys.map(y => dataLookup[gdlcode][y].edindex),
                incindex: yearKeys.map(y => dataLookup[gdlcode][y].incindex),
                region: firstYear.region,
                country: firstYear.country
            };
        }
    });
    
    // Update UI
    document.getElementById('loading').style.display = 'none';
    document.getElementById('year-slider').min = years[0];
    document.getElementById('year-slider').max = years[years.length - 1];
    document.getElementById('year-slider').value = currentYear;
    document.getElementById('year-slider').disabled = false;
    document.getElementById('year-display').textContent = currentYear;
    document.getElementById('scale-toggle').disabled = false;
    
    // Initialize maps
    initMaps();
}).catch(err => {
    console.error("Failed to load data:", err);
    document.getElementById('loading').textContent = 'Error loading data. Please check that the server is running and data files are accessible.';
});

// ==================== GEOJSON UTILITY FUNCTIONS ====================

// Calculate map center and bounds from GeoJSON
function getMapBounds() {
    if (!geojsonData) return null;
    const bounds = d3.geoBounds(geojsonData);
    return bounds;
}

function getMapCenter() {
    const bounds = getMapBounds();
    if (!bounds) return [0, 20];
    const centerLon = (bounds[0][0] + bounds[1][0]) / 2;
    const centerLat = (bounds[0][1] + bounds[1][1]) / 2;
    return [centerLat, centerLon];
}

// ==================== COLOR AND STYLING FUNCTIONS ====================

// Helper function to interpolate between two colors
function interpolateColor(color1, color2, factor) {
    const hex1 = color1.replace('#', '');
    const hex2 = color2.replace('#', '');
    const r1 = parseInt(hex1.substring(0, 2), 16);
    const g1 = parseInt(hex1.substring(2, 4), 16);
    const b1 = parseInt(hex1.substring(4, 6), 16);
    const r2 = parseInt(hex2.substring(0, 2), 16);
    const g2 = parseInt(hex2.substring(2, 4), 16);
    const b2 = parseInt(hex2.substring(4, 6), 16);
    
    const r = Math.round(r1 + (r2 - r1) * factor);
    const g = Math.round(g1 + (g2 - g1) * factor);
    const b = Math.round(b1 + (b2 - b1) * factor);
    
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// Calculate min/max values for current year (excluding nulls)
function getValueRange(mapType) {
    const values = [];
    Object.keys(dataLookup).forEach(gdlcode => {
        const yearData = dataLookup[gdlcode][currentYear];
        if (yearData) {
            let value = null;
            if (mapType === 'shdi') {
                value = yearData.shdi;
            } else if (mapType === 'healthindex') {
                value = yearData.healthindex;
            } else if (mapType === 'edindex') {
                value = yearData.edindex;
            } else if (mapType === 'incindex') {
                value = yearData.incindex;
            }
            if (value !== null && value !== undefined && !isNaN(value)) {
                values.push(value);
            }
        }
    });
    
    if (values.length === 0) {
        return {min: 0, max: 1};
    }
    
    return {
        min: Math.min(...values),
        max: Math.max(...values)
    };
}

// Normalize value based on scale mode
function normalizeValue(value, mapType) {
    if (value === null || value === undefined || isNaN(value)) {
        return null;
    }
    
    if (useRelativeScale) {
        const range = getValueRange(mapType);
        if (range.max === range.min) {
            return 0.5;
        }
        return (value - range.min) / (range.max - range.min);
    } else {
        return Math.max(0, Math.min(1, value));
    }
}

// Color scales
function getColorForValue(value, type) {
    if (value === null || value === undefined || isNaN(value)) {
        return COMPONENT_COLORS.missing;
    }
    
    const normalized = normalizeValue(value, type);
    if (normalized === null) {
        return COMPONENT_COLORS.missing;
    }
    
    if (type === 'shdi') {
        return interpolateColor('#00ff00', '#ff0000', 1 - normalized);
    } else if (type === 'healthindex') {
        return interpolateColor('#ffffff', COMPONENT_COLORS.health, normalized);
    } else if (type === 'edindex') {
        return interpolateColor('#ffffff', COMPONENT_COLORS.education, normalized);
    } else if (type === 'incindex') {
        return interpolateColor('#ffffff', COMPONENT_COLORS.income, normalized);
    }
    return COMPONENT_COLORS.missing;
}

// Create gradient CSS for legend
function createGradientCSS(mapType) {
    if (mapType === 'shdi') {
        return 'linear-gradient(to top, #ff0000, #00ff00)';
    } else if (mapType === 'healthindex') {
        return `linear-gradient(to top, #ffffff, ${COMPONENT_COLORS.health})`;
    } else if (mapType === 'edindex') {
        return `linear-gradient(to top, #ffffff, ${COMPONENT_COLORS.education})`;
    } else if (mapType === 'incindex') {
        return `linear-gradient(to top, #ffffff, ${COMPONENT_COLORS.income})`;
    }
    return 'linear-gradient(to top, #ffffff, #000000)';
}

// Update legend for a map
function updateLegend(mapType, legendId, title) {
    const legendEl = document.getElementById(legendId);
    if (!legendEl) return;
    
    let minVal, maxVal;
    if (useRelativeScale) {
        const range = getValueRange(mapType);
        minVal = range.min.toFixed(3);
        maxVal = range.max.toFixed(3);
    } else {
        minVal = '0.000';
        maxVal = '1.000';
    }
    
    const gradientCSS = createGradientCSS(mapType);
    
    legendEl.innerHTML = `
        <div class="legend-title">${title}</div>
        <div class="legend-gradient-container">
            <div class="legend-gradient" style="background: ${gradientCSS};"></div>
            <div class="legend-labels">
                <span class="legend-label-top">${maxVal}</span>
                <span class="legend-label-bottom">${minVal}</span>
            </div>
        </div>
    `;
}

// Update all legends
function updateAllLegends() {
    mapTypes.forEach(({type, legendId, title}) => {
        updateLegend(type, legendId, title);
    });
}

// ==================== DATA ANALYSIS FUNCTIONS ====================

// Function to determine bottleneck component
function getBottleneckComponent(health, education, income) {
    if (health === null || education === null || income === null) {
        return null;
    }
    const values = [
        {component: 'health', value: health},
        {component: 'education', value: education},
        {component: 'income', value: income}
    ];
    values.sort((a, b) => a.value - b.value);
    return values[0].component;
}

// Function to get bottleneck data for a region
function getBottleneckData(gdlcode, year) {
    const yearData = dataLookup[gdlcode] && dataLookup[gdlcode][year];
    if (!yearData) {
        return {component: null, value: null};
    }
    
    const health = yearData.healthindex;
    const education = yearData.edindex;
    const income = yearData.incindex;
    
    const bottleneck = getBottleneckComponent(health, education, income);
    if (!bottleneck) {
        return {component: null, value: null};
    }
    
    const value = bottleneck === 'health' ? health : 
                 bottleneck === 'education' ? education : income;
    
    return {component: bottleneck, value: value};
}

// Function to get difference values for a region
function getDifferenceData(gdlcode, year, diffType) {
    const yearData = dataLookup[gdlcode] && dataLookup[gdlcode][year];
    if (!yearData || !yearData.shdi) {
        return {value: null, component: null};
    }
    
    const hdi = yearData.shdi;
    const health = yearData.healthindex;
    const education = yearData.edindex;
    const income = yearData.incindex;
    
    if (diffType === 'diff-bottleneck') {
        const bottleneck = getBottleneckComponent(health, education, income);
        if (!bottleneck) {
            return {value: null, component: null};
        }
        const lowestValue = bottleneck === 'health' ? health : 
                          bottleneck === 'education' ? education : income;
        const diff = hdi - lowestValue;
        return {value: diff, component: bottleneck};
    } else if (diffType === 'diff-health') {
        return {value: hdi - health, component: 'health'};
    } else if (diffType === 'diff-education') {
        return {value: hdi - education, component: 'education'};
    } else if (diffType === 'diff-income') {
        return {value: hdi - income, component: 'income'};
    }
    
    return {value: null, component: null};
}

// Get color for difference value
function getColorForDifference(value, component) {
    if (value === null || value === undefined || isNaN(value)) {
        return COMPONENT_COLORS.missing;
    }
    
    const normalized = Math.max(0, Math.min(1, Math.abs(value) * 2));
    return interpolateColor('#ffffff', COMPONENT_COLORS[component], normalized);
}

// Get value range for difference maps
function getDifferenceValueRange(diffType) {
    const values = [];
    Object.keys(dataLookup).forEach(gdlcode => {
        const yearData = dataLookup[gdlcode][currentYear];
        if (yearData) {
            const diffData = getDifferenceData(gdlcode, currentYear, diffType);
            if (diffData.value !== null && diffData.value !== undefined && !isNaN(diffData.value)) {
                values.push(diffData.value);
            }
        }
    });
    
    if (values.length === 0) {
        return {min: 0, max: 0.5};
    }
    
    return {
        min: Math.min(...values),
        max: Math.max(...values)
    };
}

// Normalize difference value based on scale mode
function normalizeDifferenceValue(value, diffType) {
    if (value === null || value === undefined || isNaN(value)) {
        return null;
    }
    
    if (useRelativeScale) {
        const range = getDifferenceValueRange(diffType);
        if (range.max === range.min) {
            return 0.5;
        }
        return (value - range.min) / (range.max - range.min);
    } else {
        return Math.max(0, Math.min(1, Math.abs(value) * 2));
    }
}

// Style function for difference maps
function createDifferenceStyleFunction(diffType) {
    return function(feature) {
        const gdlcode = feature.properties.gdlcode;
        const diffData = getDifferenceData(gdlcode, currentYear, diffType);
        
        const isSelected = selectedGdlcode === gdlcode;
        let fillColor = COMPONENT_COLORS.missing;
        
        if (diffData.value !== null && diffData.component) {
            const normalized = normalizeDifferenceValue(diffData.value, diffType);
            if (normalized !== null) {
                fillColor = interpolateColor('#ffffff', COMPONENT_COLORS[diffData.component], normalized);
            }
        }
        
        return {
            fillColor: fillColor,
            color: isSelected ? '#ff0000' : '#333',
            weight: isSelected ? 3 : 1,
            fillOpacity: diffData.value !== null ? 0.7 : 0.3,
            opacity: 1
        };
    };
}

// Update difference maps (TODO: Implement D3 version)
function updateDifferenceMaps() {
    // TODO: Implement D3-based difference maps
    // This will be implemented after the 4 components view is complete
    console.log('Difference maps not yet implemented with D3');
}

// Update difference legends
function updateDifferenceLegends() {
    diffMapTypes.forEach(({type, legendId, title}) => {
        const legendEl = document.getElementById(legendId);
        if (!legendEl) return;
        
        let minVal, maxVal;
        if (useRelativeScale) {
            const range = getDifferenceValueRange(type);
            minVal = range.min.toFixed(3);
            maxVal = range.max.toFixed(3);
        } else {
            minVal = '0.000';
            maxVal = '0.500';
        }
        
        let componentColor = '#ffffff';
        if (type === 'diff-bottleneck') {
            componentColor = COMPONENT_COLORS.health;
        } else if (type === 'diff-health') {
            componentColor = COMPONENT_COLORS.health;
        } else if (type === 'diff-education') {
            componentColor = COMPONENT_COLORS.education;
        } else if (type === 'diff-income') {
            componentColor = COMPONENT_COLORS.income;
        }
        
        const gradientCSS = `linear-gradient(to top, #ffffff, ${componentColor})`;
        
        legendEl.innerHTML = `
            <div class="legend-title">${title}</div>
            <div class="legend-gradient-container">
                <div class="legend-gradient" style="background: ${gradientCSS};"></div>
                <div class="legend-labels">
                    <span class="legend-label-top">${maxVal}</span>
                    <span class="legend-label-bottom">${minVal}</span>
                </div>
            </div>
        `;
    });
}

// Style function for bottleneck map
function createBottleneckStyleFunction() {
    return function(feature) {
        const gdlcode = feature.properties.gdlcode;
        const bottleneckData = getBottleneckData(gdlcode, currentYear);
        
        const isSelected = selectedGdlcode === gdlcode;
        let fillColor = COMPONENT_COLORS.missing;
        
        if (bottleneckData.component) {
            fillColor = COMPONENT_COLORS[bottleneckData.component];
        }
        
        return {
            fillColor: fillColor,
            color: isSelected ? '#ff0000' : '#333',
            weight: isSelected ? 3 : 1,
            fillOpacity: bottleneckData.component ? 0.7 : 0.3,
            opacity: 1
        };
    };
}

// Update bottleneck map (TODO: Implement D3 version)
function updateBottleneckMap() {
    // TODO: Implement D3-based bottleneck map
    // This will be implemented after the 4 components view is complete
    console.log('Bottleneck map not yet implemented with D3');
}

// Update bottleneck legend
function updateBottleneckLegend() {
    const legendEl = document.getElementById('legend-bottleneck');
    if (!legendEl) return;
    
    legendEl.innerHTML = `
        <div class="bottleneck-legend-title">Bottleneck Component</div>
        <div class="bottleneck-legend-item">
            <div class="bottleneck-legend-color" style="background-color: ${COMPONENT_COLORS.health};"></div>
            <span>Health</span>
        </div>
        <div class="bottleneck-legend-item">
            <div class="bottleneck-legend-color" style="background-color: ${COMPONENT_COLORS.education};"></div>
            <span>Education</span>
        </div>
        <div class="bottleneck-legend-item">
            <div class="bottleneck-legend-color" style="background-color: ${COMPONENT_COLORS.income};"></div>
            <span>Income</span>
        </div>
    `;
}

// Switch visualization mode
function switchVisualization(mode) {
    currentVizMode = mode;
    
    document.querySelectorAll('.viz-button').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(`viz-${mode}`).classList.add('active');
    
    document.querySelectorAll('.viz-description').forEach(desc => {
        desc.classList.add('hidden');
    });
    const descEl = document.getElementById(`desc-${mode}`);
    if (descEl) {
        descEl.classList.remove('hidden');
    }
    
    document.getElementById('viz-components-container').classList.toggle('active', mode === 'components');
    document.getElementById('viz-difference-container').classList.toggle('active', mode === 'difference');
    document.getElementById('viz-bottleneck-container').classList.toggle('active', mode === 'bottleneck');
    
    const scaleToggle = document.getElementById('scale-toggle');
    if (scaleToggle) {
        scaleToggle.style.display = (mode === 'components' || mode === 'difference') ? 'block' : 'none';
    }
    
    // Trigger resize for D3 maps if needed
    setTimeout(() => {
        // Maps will resize automatically on next update
        updateMaps();
    }, 200);
    
    if (mode === 'bottleneck') {
        updateBottleneckMap();
        updateBottleneckLegend();
    } else if (mode === 'difference') {
        updateDifferenceMaps();
    } else {
        updateMaps();
    }
}

// Style function factory
function createStyleFunction(mapType) {
    return function(feature) {
        const gdlcode = feature.properties.gdlcode;
        const yearData = dataLookup[gdlcode] && dataLookup[gdlcode][currentYear];
        
        let value = null;
        if (yearData) {
            if (mapType === 'shdi') {
                value = yearData.shdi;
            } else if (mapType === 'healthindex') {
                value = yearData.healthindex;
            } else if (mapType === 'edindex') {
                value = yearData.edindex;
            } else if (mapType === 'incindex') {
                value = yearData.incindex;
            }
        }
        
        const isSelected = selectedGdlcode === gdlcode;
        
        return {
            fillColor: getColorForValue(value, mapType),
            color: isSelected ? '#ff0000' : '#333',
            weight: isSelected ? 3 : 1,
            fillOpacity: value !== null ? 0.7 : 0.3,
            opacity: 1
        };
    };
}

// ==================== MAP UPDATE FUNCTIONS ====================

// Function to update all maps (D3-based)
function updateMaps() {
    if (!geojsonData) return;
    
    maps.forEach((map, index) => {
        if (!map || !map.initialized) return;
        
        const mapType = index === 0 ? 'shdi' : 
                       index === 1 ? 'healthindex' : 
                       index === 2 ? 'edindex' : 'incindex';
        
        map.update(mapType);
    });
    
    updateAllLegends();
}

// ==================== INTERACTION FUNCTIONS ====================

// Function to select a region
function selectRegion(gdlcode) {
    selectedGdlcode = gdlcode;
    if (currentVizMode === 'components') {
        updateMaps();
    } else if (currentVizMode === 'difference') {
        updateDifferenceMaps();
    } else {
        updateBottleneckMap();
    }
    updateChart();
}

// ==================== CHART FUNCTIONS ====================

// Function to update chart data (when chart already exists)
function updateChartData() {
    if (!selectedGdlcode || !timeSeries[selectedGdlcode] || !chart) {
        return;
    }
    
    const data = timeSeries[selectedGdlcode];
    
    if (!data || !data.years || data.years.length === 0) {
        return;
    }
    
    // Ensure all data arrays have the same length
    const numYears = data.years.length;
    const shdiData = (data.shdi || []).slice(0, numYears);
    const healthData = (data.healthindex || []).slice(0, numYears);
    const edData = (data.edindex || []).slice(0, numYears);
    const incData = (data.incindex || []).slice(0, numYears);
    
    const bottleneckColors = data.years.map((year, idx) => {
        const health = healthData[idx];
        const education = edData[idx];
        const income = incData[idx];
        const bottleneck = getBottleneckComponent(health, education, income);
        return bottleneck ? COMPONENT_COLORS[bottleneck] : COMPONENT_COLORS.missing;
    });
    
    const backgroundDatasets = [];
    if (bottleneckColors.length > 0) {
        let currentColor = bottleneckColors[0] || COMPONENT_COLORS.missing;
        let segmentStart = 0;
        
        for (let i = 1; i <= bottleneckColors.length; i++) {
            if (i === bottleneckColors.length || bottleneckColors[i] !== currentColor) {
                const segmentData = new Array(data.years.length).fill(null);
                // Use half-open interval [start, end) - inclusive start, exclusive end
                const endIndex = i;
                for (let j = segmentStart; j < endIndex && j < data.years.length; j++) {
                    segmentData[j] = 1.0;
                }
                
                const hex = (currentColor || COMPONENT_COLORS.missing).replace('#', '');
                const r = parseInt(hex.substring(0, 2), 16);
                const g = parseInt(hex.substring(2, 4), 16);
                const b = parseInt(hex.substring(4, 6), 16);
                
                backgroundDatasets.push({
                    label: '',
                    data: segmentData,
                    backgroundColor: `rgba(${r}, ${g}, ${b}, 0.2)`,
                    borderWidth: 0,
                    pointRadius: 0,
                    fill: 'origin',
                    order: 0,
                    showLine: false,
                    tension: 0
                });
                
                if (i < bottleneckColors.length) {
                    currentColor = bottleneckColors[i] || COMPONENT_COLORS.missing;
                    // Next segment starts at current index (exclusive end becomes inclusive start)
                    segmentStart = i;
                }
            }
        }
    }
    
    // Update chart data
    chart.data.labels = data.years;
    chart.data.datasets = [
        ...backgroundDatasets,
        {
            label: 'HDI',
            data: shdiData.map(v => v === null || v === undefined ? null : v),
            borderColor: '#000000',
            backgroundColor: 'rgba(0, 0, 0, 0.1)',
            tension: 0.4,
            order: 1,
            spanGaps: false,
            pointRadius: 0,
            pointHoverRadius: 0,
            borderDash: [5, 5]
        },
        {
            label: 'Health',
            data: healthData.map(v => v === null || v === undefined ? null : v),
            borderColor: COMPONENT_COLORS.health,
            backgroundColor: COMPONENT_COLORS.health + '20',
            tension: 0.4,
            order: 1,
            spanGaps: false,
            pointRadius: 0,
            pointHoverRadius: 0
        },
        {
            label: 'Education',
            data: edData.map(v => v === null || v === undefined ? null : v),
            borderColor: COMPONENT_COLORS.education,
            backgroundColor: COMPONENT_COLORS.education + '20',
            tension: 0.4,
            order: 1,
            spanGaps: false,
            pointRadius: 0,
            pointHoverRadius: 0
        },
        {
            label: 'Income',
            data: incData.map(v => v === null || v === undefined ? null : v),
            borderColor: COMPONENT_COLORS.income,
            backgroundColor: COMPONENT_COLORS.income + '20',
            tension: 0.4,
            order: 1,
            spanGaps: false,
            pointRadius: 0,
            pointHoverRadius: 0
        }
    ];
    
    // Ensure container has proper dimensions before updating
    const chartContainer = document.getElementById('chart-container');
    if (chartContainer) {
        chartContainer.style.display = 'block';
        void chartContainer.offsetHeight; // Force reflow
    }
    
    chart.update('none'); // Update without animation
    
    // Explicitly resize after update to ensure dimensions are correct
    requestAnimationFrame(() => {
        if (chart) {
            chart.resize();
        }
    });
}

// Function to update chart
function updateChart() {
    if (!selectedGdlcode || !timeSeries[selectedGdlcode]) {
        document.getElementById('region-info').style.display = 'none';
        document.getElementById('chart-container').style.display = 'none';
        document.getElementById('horizon-chart-container').style.display = 'none';
        document.getElementById('no-selection').style.display = 'block';
        if (chart) {
            chart.destroy();
            chart = null;
        }
        return;
    }
    
    const data = timeSeries[selectedGdlcode];
    
    if (!data || !data.years || data.years.length === 0) {
        console.error('Invalid time series data');
        return;
    }
    
    document.getElementById('region-name').textContent = data.region || 'Unknown';
    document.getElementById('region-country').textContent = data.country || 'Unknown';
    document.getElementById('region-info').style.display = 'block';
    document.getElementById('no-selection').style.display = 'none';
    
    const chartContainer = document.getElementById('chart-container');
    if (!chartContainer) {
        console.error('Chart container element not found');
        return;
    }
    
    // Show container first and force layout recalculation
    chartContainer.style.display = 'block';
    // Force reflow to ensure dimensions are calculated
    void chartContainer.offsetHeight;
    
    const canvas = document.getElementById('time-series-chart');
    if (!canvas) {
        console.error('Chart canvas element not found');
        return;
    }
    
    // Ensure container is visible and has proper dimensions before chart creation
    chartContainer.style.display = 'block';
    void chartContainer.offsetHeight; // Force reflow
    
    // If chart exists, update it instead of destroying/recreating (preserves dimensions)
    if (chart) {
        // Update existing chart data
        updateChartData();
        // Update horizon chart
        updateHorizonChart();
        return;
    }
    
    // Clear any inline styles that might interfere with canvas sizing
    canvas.style.width = '';
    canvas.style.height = '';
    // Clear canvas width/height attributes to let Chart.js handle sizing
    canvas.removeAttribute('width');
    canvas.removeAttribute('height');
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error('Could not get 2D context from canvas');
        return;
    }
    
    // Ensure all data arrays have the same length
    const numYears = data.years.length;
    const shdiData = (data.shdi || []).slice(0, numYears);
    const healthData = (data.healthindex || []).slice(0, numYears);
    const edData = (data.edindex || []).slice(0, numYears);
    const incData = (data.incindex || []).slice(0, numYears);
    
    const bottleneckColors = data.years.map((year, idx) => {
        const health = healthData[idx];
        const education = edData[idx];
        const income = incData[idx];
        const bottleneck = getBottleneckComponent(health, education, income);
        return bottleneck ? COMPONENT_COLORS[bottleneck] : COMPONENT_COLORS.missing;
    });
    
    const backgroundDatasets = [];
    if (bottleneckColors.length > 0) {
        let currentColor = bottleneckColors[0] || COMPONENT_COLORS.missing;
        let segmentStart = 0;
        
        for (let i = 1; i <= bottleneckColors.length; i++) {
            if (i === bottleneckColors.length || bottleneckColors[i] !== currentColor) {
                const segmentData = new Array(data.years.length).fill(null);
                // Use half-open interval [start, end) - inclusive start, exclusive end
                const endIndex = i;
                for (let j = segmentStart; j < endIndex && j < data.years.length; j++) {
                    segmentData[j] = 1.0;
                }
                
                const hex = (currentColor || COMPONENT_COLORS.missing).replace('#', '');
                const r = parseInt(hex.substring(0, 2), 16);
                const g = parseInt(hex.substring(2, 4), 16);
                const b = parseInt(hex.substring(4, 6), 16);
                
                backgroundDatasets.push({
                    label: '',
                    data: segmentData,
                    backgroundColor: `rgba(${r}, ${g}, ${b}, 0.2)`,
                    borderWidth: 0,
                    pointRadius: 0,
                    fill: 'origin',
                    order: 0,
                    showLine: false,
                    tension: 0
                });
                
                if (i < bottleneckColors.length) {
                    currentColor = bottleneckColors[i] || COMPONENT_COLORS.missing;
                    // Next segment starts at current index (exclusive end becomes inclusive start)
                    segmentStart = i;
                }
            }
        }
    }
    
    try {
        if (typeof Chart === 'undefined') {
            console.error('Chart.js is not loaded');
            return;
        }
        
        chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.years,
                datasets: [
                    ...backgroundDatasets,
                    {
                        label: 'HDI',
                        data: shdiData.map(v => v === null || v === undefined ? null : v),
                        borderColor: '#000000',
                        backgroundColor: 'rgba(0, 0, 0, 0.1)',
                        tension: 0.4,
                        order: 1,
                        spanGaps: false,
                        pointRadius: 0,
                        pointHoverRadius: 0
                    },
                    {
                        label: 'Health',
                        data: healthData.map(v => v === null || v === undefined ? null : v),
                        borderColor: COMPONENT_COLORS.health,
                        backgroundColor: COMPONENT_COLORS.health + '20',
                        tension: 0.4,
                        order: 1,
                        spanGaps: false,
                        pointRadius: 0,
                        pointHoverRadius: 0
                    },
                    {
                        label: 'Education',
                        data: edData.map(v => v === null || v === undefined ? null : v),
                        borderColor: COMPONENT_COLORS.education,
                        backgroundColor: COMPONENT_COLORS.education + '20',
                        tension: 0.4,
                        order: 1,
                        spanGaps: false,
                        pointRadius: 0,
                        pointHoverRadius: 0
                    },
                    {
                        label: 'Income',
                        data: incData.map(v => v === null || v === undefined ? null : v),
                        borderColor: COMPONENT_COLORS.income,
                        backgroundColor: COMPONENT_COLORS.income + '20',
                        tension: 0.4,
                        order: 1,
                        spanGaps: false,
                        pointRadius: 0,
                        pointHoverRadius: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'HDI Components Over Time',
                        color: '#333'
                    },
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: '#333',
                            filter: (item) => item.text !== ''
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 1,
                        title: {
                            display: true,
                            text: 'Index Value',
                            color: '#333'
                        },
                        ticks: {
                            color: '#666'
                        },
                        grid: {
                            color: '#e0e0e0'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Year',
                            color: '#333'
                        },
                        ticks: {
                            color: '#666'
                        },
                        grid: {
                            color: '#e0e0e0'
                        }
                    }
                }
            }
        });
        
        // Ensure chart resizes properly after creation
        // Use requestAnimationFrame to ensure DOM has updated
        requestAnimationFrame(() => {
            if (chart) {
                chart.resize();
            }
        });
    } catch (error) {
        console.error('Error creating chart:', error);
    }
    
    // Update horizon chart
    updateHorizonChart();
}

// ==================== HORIZON CHART FUNCTIONS ====================

// Horizon chart configuration
const horizonFactors = "shdi,healthindex,edindex,incindex,lifexp,esch,msch,lgnic".split(",");
const horizonLabels = {
    shdi: "SHDI",
    healthindex: "Health index",
    edindex: "Education index",
    incindex: "Income index",
    lifexp: "Life expectancy",
    esch: "Expected years of schooling",
    msch: "Mean amount of schooling",
    lgnic: "Log gross national income per capita"
};
const horizonOverlap = 3;
const horizonStep = 40;
const horizonMirror = true;
const horizonWidth = 300;
const horizonMargin = { top: 30, right: 10, bottom: 0, left: 10 };
const horizonTickEveryYears = 5;

// Function to update horizon chart
function updateHorizonChart() {
    if (!selectedGdlcode || !timeSeries[selectedGdlcode] || !rawCsvData) {
        document.getElementById('horizon-chart-container').style.display = 'none';
        return;
    }
    
    const data = timeSeries[selectedGdlcode];
    
    // Filter CSV rows by gdlcode (not region name, as region names may not be unique)
    const regionRows = rawCsvData.filter(r => r.gdlcode === selectedGdlcode);
    
    if (regionRows.length === 0) {
        document.getElementById('horizon-chart-container').style.display = 'none';
        return;
    }
    
    document.getElementById('horizon-chart-container').style.display = 'block';
    
    // Clear previous chart
    d3.select("#horizon-chart").selectAll("*").remove();
    d3.select("#horizon-legend").html("");
    
    // Parse rows, keep raw strings and numeric values separately
    const parsed = regionRows
        .map(r => {
            const year = parseInt(r.year ?? r.Year ?? r.YEAR, 10);
            const date = Number.isFinite(year) ? new Date(Date.UTC(year, 0, 1)) : null;
            const obj = { date, raw: {}, num: {} };
            for (const f of horizonFactors) {
                const rawCell = (r[f] === undefined || r[f] === null) ? "" : String(r[f]);
                obj.raw[f] = rawCell;
                // Use horizon chart's toNumber (returns NaN instead of null)
                const str = String(rawCell).trim();
                const n = str === "" ? NaN : +str.replace(/\u00A0/g, "");
                obj.num[f] = isNaN(n) ? NaN : n;
            }
            return obj;
        })
        .sort((a,b) => (a.date && b.date) ? a.date - b.date : 0);
    
    // Aligned arrays
    const dates = parsed.map(d => d.date);
    const rawMatrix = {};
    const numericMatrix = {};
    for (const f of horizonFactors) {
        rawMatrix[f] = parsed.map(d => d.raw[f]);
        numericMatrix[f] = parsed.map(d => d.num[f]);
    }
    
    // Build start-at-zero arrays (aligned)
    const startAtZero = {};
    for (const f of horizonFactors) {
        // Find first valid baseline value (must be > 0 for log calculation)
        const baseline = numericMatrix[f].find(v => typeof v === "number" && !isNaN(v) && v > 0);
        if (!baseline || !isFinite(baseline) || baseline <= 0) {
            // If no valid baseline, set all to NaN
            startAtZero[f] = numericMatrix[f].map(() => NaN);
            continue;
        }
        startAtZero[f] = numericMatrix[f].map(v => {
            if (!(v === 0 || v) && isNaN(v)) return NaN;
            if (typeof v !== "number" || isNaN(v) || v <= 0) return NaN;
            if (!isFinite(baseline) || baseline <= 0) return NaN;
            return Math.log(v / baseline);
        });
    }
    
    // Correlations on start-at-zero arrays
    const corr = horizonFactors.map(f1 => 
        horizonFactors.map(f2 => f1 === f2 ? 1 : pearson(startAtZero[f1], startAtZero[f2]))
    );
    
    // Find the permutation that maximizes pairwise correlation
    const perms = permutations(horizonFactors);
    let best = perms[0], bestScore = -Infinity;
    for (const p of perms) {
        let s = 0;
        for (let i = 0; i < p.length - 1; i++) {
            s += corr[horizonFactors.indexOf(p[i])][horizonFactors.indexOf(p[i+1])];
        }
        if (s > bestScore) { bestScore = s; best = p; }
    }
    
    // Prepare series: use start-at-zero for plotting, keep original raw/num for tooltip
    // Interpolate missing values to avoid white spaces
    const series = best.map(key => {
        const vals = [];
        let lastValidValue = 0; // Default to zero (baseline) for missing values
        
        for (let i = 0; i < dates.length; i++) {
            const date = dates[i];
            const v = startAtZero[key][i];
            const origRaw = rawMatrix[key][i];
            const origNum = numericMatrix[key][i];
            
            if (date instanceof Date && !isNaN(+date)) {
                let valueToUse;
                if (typeof v === "number" && !isNaN(v)) {
                    valueToUse = v;
                    lastValidValue = v; // Update last valid value
                } else {
                    // Use last valid value to maintain continuity (or 0 if no previous value)
                    valueToUse = lastValidValue;
                }
                
                vals.push({ 
                    date, 
                    value: valueToUse, 
                    originalRaw: origRaw, 
                    originalNum: origNum, 
                    rowIndex: i,
                    isInterpolated: (typeof v !== "number" || isNaN(v))
                });
            }
        }
        return { key, label: horizonLabels[key] ?? key, values: vals };
    }).filter(s => s.values.length > 0);
    
    if (series.length === 0) {
        document.getElementById('horizon-chart-container').style.display = 'none';
        return;
    }
    
    // Scales
    const allDates = series.flatMap(s => s.values.map(d => d.date));
    const x = d3.scaleUtc().domain(d3.extent(allDates)).range([0, horizonWidth]);
    const maxAbs = d3.max(series, s => d3.max(s.values, d => Math.abs(d.value))) || 1;
    const y = d3.scaleLinear().domain([-maxAbs, maxAbs]).range([horizonOverlap * horizonStep, -horizonOverlap * horizonStep]);
    
    // Build arrays of years present in the dataset
    const uniqueYears = Array.from(new Set(dates.filter(d => d instanceof Date).map(d => d.getUTCFullYear())))
        .sort((a,b) => a - b)
        .map(yv => new Date(Date.UTC(yv, 0, 1)));
    
    // Axis tick dates
    const domain0 = x.domain()[0], domain1 = x.domain()[1];
    const tickInterval = d3.utcYear.every(Math.max(1, horizonTickEveryYears));
    const tickDates = tickInterval.range(d3.utcYear.floor(domain0), d3.utcYear.offset(domain1, 1))
        .filter(d => d >= domain0 && d <= domain1);
    
    // Area generator
    // All values are now valid (interpolated), so no need for .defined()
    const area = d3.area()
        .curve(d3.curveStep)
        .x(d => x(d.date))
        .y0(() => y(0))
        .y1(d => y(d.value));
    
    // Color mapping
    const colorForIndex = i => i < 0
        ? d3.interpolateReds(0.25 + 0.75 * (Math.min(1, Math.abs(i)/horizonOverlap)))
        : d3.interpolateBlues(0.25 + 0.75 * ((i+1)/(horizonOverlap+1)));
    
    // Build SVG
    const height = series.length * (horizonStep + 1) + horizonMargin.top + horizonMargin.bottom;
    const container = d3.select("#horizon-chart");
    const svg = container.append("svg")
        .attr("viewBox", `0 0 ${horizonWidth} ${height}`)
        .style("font", "12px sans-serif");
    
    // Hover line (created early so it can be used in event handlers)
    const horizonHoverLine = svg.append("line")
        .attr("class", "horizon-hover-line")
        .attr("y1", horizonMargin.top - 6)
        .attr("y2", height - horizonMargin.bottom)
        .style("display", "none");
    
    // Tooltip helper
    const horizonTooltip = d3.select("#horizon-tooltip");
    function positionHorizonTooltip(ev) {
        const tt = document.getElementById("horizon-tooltip");
        tt.style.display = "block";
        const mouseX = ev.clientX, mouseY = ev.clientY;
        let left = mouseX + 12, top = mouseY + 12;
        const rect = tt.getBoundingClientRect();
        if (left + rect.width + 8 > window.innerWidth) left = mouseX - rect.width - 12;
        if (top + rect.height + 8 > window.innerHeight) top = mouseY - rect.height - 12;
        horizonTooltip.style("left", `${left}px`).style("top", `${top}px`);
    }
    
    // Groups and defs
    const groups = svg.append("g")
        .selectAll("g")
        .data(series)
        .join("g")
        .attr("transform", (d,i) => `translate(0,${i*(horizonStep+1)+horizonMargin.top})`);
    
    groups.append("clipPath")
        .attr("id", (d,i) => `horizon-clip-${i}`)
        .append("rect")
        .attr("width", horizonWidth)
        .attr("height", horizonStep);
    
    groups.append("defs").append("path")
        .attr("id", (d,i) => `horizon-path-${i}`)
        .attr("d", d => area(d.values));
    
    // Add bands
    groups.append("g")
        .attr("clip-path", (d,i) => `url(#horizon-clip-${i})`)
        .selectAll("use")
        .data(() => Array.from({ length: horizonOverlap * 2 }, (_, i) => i))
        .join("use")
        .attr("fill", (d,i) => {
            const index = i < horizonOverlap ? -i - 1 : i - horizonOverlap;
            return colorForIndex(index);
        });
    
    // Fix hrefs and transforms per group
    groups.each(function(d,i) {
        const pathId = `#horizon-path-${i}`;
        d3.select(this).selectAll("use")
            .attr("href", pathId).attr("xlink:href", pathId)
            .attr("transform", (_, j) => {
                const index = j < horizonOverlap ? -j - 1 : j - horizonOverlap;
                return (horizonMirror && index < 0) ? `scale(1,-1) translate(0,${index * horizonStep})` : `translate(0,${(index + 1) * horizonStep})`;
            });
    });
    
    // Draw missing-value grey boxes
    groups.each(function(series, gi) {
        const gnode = d3.select(this);
        const key = series.key;
        const missingRects = [];
        for (let t = 0; t < uniqueYears.length; t++) {
            const yearDate = uniqueYears[t];
            const year = yearDate.getUTCFullYear();
            const rowIndex = dates.findIndex(d => d && d.getUTCFullYear() === year);
            const rawCell = (rowIndex === -1) ? "" : rawMatrix[key][rowIndex];
            if (rawCell == null || String(rawCell).trim() === "") {
                const cx = x(yearDate);
                const left = t === 0 ? 0 : (x(uniqueYears[t-1]) + cx) / 2;
                const right = t === uniqueYears.length - 1 ? horizonWidth : (cx + x(uniqueYears[t+1])) / 2;
                missingRects.push({ x: left, w: Math.max(1, right - left), cx, yearDate, rowIndex });
            }
        }
        if (missingRects.length) {
            gnode.append("g").selectAll("rect.missing")
                .data(missingRects).join("rect")
                .attr("class", "horizon-missing-box")
                .attr("x", d => d.x)
                .attr("y", 0)
                .attr("width", d => d.w)
                .attr("height", horizonStep)
                .on("mouseenter", (ev, d) => {
                    const year = d.yearDate.getUTCFullYear();
                    horizonTooltip.style("display", "block").html(`<strong>${series.label}</strong>: <em>missing</em><br/><small>${year}</small>`);
                    horizonHoverLine.attr("x1", d.cx).attr("x2", d.cx).style("display", null);
                    svg.node().appendChild(horizonHoverLine.node());
                })
                .on("mousemove", (ev, d) => {
                    positionHorizonTooltip(ev);
                    horizonHoverLine.attr("x1", d.cx).attr("x2", d.cx);
                    svg.node().appendChild(horizonHoverLine.node());
                })
                .on("mouseleave", () => {
                    horizonTooltip.style("display", "none");
                    horizonHoverLine.style("display", "none");
                });
        }
    });
    
    // Labels
    groups.append("text")
        .attr("class", "horizon-label")
        .attr("x", 4)
        .attr("y", horizonStep / 2)
        .attr("dy", "0.35em")
        .text(d => d.label);
    
    // X axis
    const axis = d3.axisTop(x)
        .tickValues(tickDates)
        .tickFormat(d3.utcFormat("%Y"))
        .tickSizeOuter(0);
    
    svg.append("g")
        .attr("transform", `translate(0,${horizonMargin.top})`)
        .call(axis)
        .call(g => g.selectAll(".tick text").classed("horizon-axis-tick", true))
        .call(g => g.selectAll(".tick").filter(d => x(d) < horizonMargin.left || x(d) >= horizonWidth - horizonMargin.right).remove())
        .call(g => g.select(".domain").remove());
    
    // Hit areas for every year
    groups.each(function(series, gi) {
        const gnode = d3.select(this);
        const pointByYear = new Map(series.values.map(p => [p.date.getUTCFullYear(), p]));
        const hitRects = uniqueYears.map((yearDate, t) => {
            const left = t === 0 ? 0 : (x(uniqueYears[t-1]) + x(yearDate)) / 2;
            const right = t === uniqueYears.length - 1 ? horizonWidth : (x(yearDate) + x(uniqueYears[t+1])) / 2;
            const cx = x(yearDate);
            const year = yearDate.getUTCFullYear();
            const point = pointByYear.get(year) || null;
            return { left, w: Math.max(1, right - left), cx, yearDate, year, point };
        });
        
        gnode.append("g").selectAll("rect.hit")
            .data(hitRects).join("rect")
            .attr("class", "horizon-hit")
            .attr("x", r => r.left).attr("y", 0).attr("width", r => r.w).attr("height", horizonStep)
            .on("mouseenter", (ev, r) => {
                const year = r.year;
                if (r.point) {
                    const origNum = r.point.originalNum;
                    const origRaw = r.point.originalRaw;
                    const displayVal = (typeof origNum === "number" && !isNaN(origNum)) ? origNum : (origRaw && String(origRaw).trim() !== "" ? origRaw : "missing");
                    horizonTooltip.style("display", "block").html(`<strong>${series.label}</strong>: ${displayVal}<br/><small>${year}</small>`);
                } else {
                    const rowIndex = dates.findIndex(d => d && d.getUTCFullYear() === year);
                    const rawCell = (rowIndex === -1) ? "" : rawMatrix[series.key][rowIndex];
                    const isMissing = rawCell == null || String(rawCell).trim() === "";
                    horizonTooltip.style("display", "block").html(`<strong>${series.label}</strong>: ${isMissing ? "<em>missing</em>" : rawCell}<br/><small>${year}</small>`);
                }
                horizonHoverLine.attr("x1", r.cx).attr("x2", r.cx).style("display", null);
                svg.node().appendChild(horizonHoverLine.node());
            })
            .on("mousemove", (ev, r) => {
                positionHorizonTooltip(ev);
                horizonHoverLine.attr("x1", r.cx).attr("x2", r.cx);
                svg.node().appendChild(horizonHoverLine.node());
            })
            .on("mouseleave", () => {
                horizonTooltip.style("display", "none");
                horizonHoverLine.style("display", "none");
            });
    });
    
    // Legend
    const fmt = d3.format(".1%");
    const bandSize = maxAbs / horizonOverlap;
    
    const negIndices = Array.from({length: horizonOverlap}, (_, i) => -(horizonOverlap - i));
    const posIndices = Array.from({length: horizonOverlap}, (_, i) => i);
    const indices = negIndices.concat(posIndices);
    
    const legendEntries = indices.map(index => {
        if (index < 0) {
            const k = Math.abs(index);
            const pLow = -Math.expm1(k * bandSize);
            const pHigh = -Math.expm1((k - 1) * bandSize);
            return {
                index,
                color: colorForIndex(index),
                label: `${fmt(pLow)} → ${fmt(pHigh)}`,
                lower: pLow,
                upper: pHigh
            };
        } else {
            const pLow = Math.expm1(index * bandSize);
            const pHigh = Math.expm1((index + 1) * bandSize);
            return {
                index,
                color: colorForIndex(index),
                label: `${fmt(pLow)} → ${fmt(pHigh)}`,
                lower: pLow,
                upper: pHigh
            };
        }
    });
    
    // Render legend
    const legendEl = d3.select("#horizon-legend");
    legendEl.html("");
    legendEl.append("div").attr("class", "horizon-legend-title").style("font-weight", "600").text("Band ranges");
    
    const rows = legendEl.selectAll("div.horizon-legend-row")
        .data(legendEntries)
        .join("div")
        .attr("class", "horizon-legend-row");
    
    rows.append("div")
        .attr("class", "horizon-legend-swatch")
        .style("background-color", d => d.color);
    
    rows.append("div")
        .attr("class", "horizon-legend-label")
        .text(d => d.label);
}

// ==================== MAP MANAGEMENT FUNCTIONS ====================

// Factory function to create and initialize a D3Map instance
function initD3Map(containerId, mapType, syncGroup, syncIndex) {
    const map = new D3Map(containerId, {
        mapType: mapType,
        syncGroup: syncGroup,
        syncIndex: syncIndex
    });
    
    if (map.initialize()) {
        return map;
    }
    return null;
}

// Initialize maps
function initMaps() {
    // Use requestAnimationFrame to ensure DOM is ready and containers have dimensions
    requestAnimationFrame(() => {
        // Give a small delay to ensure containers are properly sized
    setTimeout(() => {
            // Initialize the 4 component maps with sync group
            // First create all maps, then set sync groups
            const mapTop = initD3Map('map-top', 'shdi', null, null);
            if (mapTop) maps.push(mapTop);
        
        const mapIds = ['map-bottom-1', 'map-bottom-2', 'map-bottom-3'];
            const mapTypes = ['healthindex', 'edindex', 'incindex'];
            mapIds.forEach((id, index) => {
                const map = initD3Map(id, mapTypes[index], null, null);
                if (map) maps.push(map);
            });
            
            // Create shared zoom behavior for component maps
            sharedZoomMaps = D3Map.createSharedZoom(maps);
            
            // Attach shared zoom to all component maps
            maps.forEach(map => {
                if (map && map.initialized) {
                    map.setZoomBehavior(sharedZoomMaps);
                }
            });
            
            // Initialize difference maps (for later)
            const diffMapTop = initD3Map('map-diff-top', null, null, null);
            if (diffMapTop) diffMaps.push(diffMapTop);
        
        const diffMapIds = ['map-diff-bottom-1', 'map-diff-bottom-2', 'map-diff-bottom-3'];
            diffMapIds.forEach((id, index) => {
                const map = initD3Map(id, null, null, null);
                if (map) diffMaps.push(map);
            });
            
            // Create shared zoom behavior for difference maps
            sharedZoomDiffMaps = D3Map.createSharedZoom(diffMaps);
            
            // Attach shared zoom to all difference maps
            diffMaps.forEach(map => {
                if (map && map.initialized) {
                    map.setZoomBehavior(sharedZoomDiffMaps);
                }
            });
            
            // Initialize bottleneck map (for later)
            bottleneckMap = initD3Map('map-bottleneck', null, null, null);
            
            // Calculate common projection for all maps to ensure synchronization
            // Use the largest map dimensions as reference
            if (geojsonData && maps.length > 0) {
                // Find the largest map dimensions
                let maxWidth = 0;
                let maxHeight = 0;
                maps.forEach(map => {
                    if (map && map.initialized) {
                        maxWidth = Math.max(maxWidth, map.width);
                        maxHeight = Math.max(maxHeight, map.height);
                    }
                });
                
                if (maxWidth > 0 && maxHeight > 0) {
                    // Create a common projection based on reference dimensions
                    const refProjection = d3.geoMercator();
                    refProjection.fitSize([maxWidth, maxHeight], geojsonData);
                    
                    // Store common projection parameters
                    commonProjection = refProjection;
                    referenceWidth = maxWidth;
                    referenceHeight = maxHeight;
                    
                    // Apply common projection to all maps
            maps.forEach(map => {
                        if (map && map.initialized) {
                            map.projection.scale(commonProjection.scale())
                                .translate(commonProjection.translate());
                            map.path.projection(map.projection);
                        }
                    });
                }
            }
            
            // Update all maps after setting common projection
            updateMaps();
            
            // Handle window resize
            let resizeTimeout;
            window.addEventListener('resize', function() {
                clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(() => {
                maps.forEach(map => {
                        if (map && map.initialized) {
                            map.resize();
                        }
                });
                    updateMaps();
                }, 250);
                });
        
        updateMaps();
            // Note: updateDifferenceMaps and updateBottleneckMap will be implemented later
            // updateDifferenceMaps();
            // updateBottleneckMap();
            // updateBottleneckLegend();
        }, 100);
    });
}

/* ==================== EVENT HANDLERS ==================== */

// Year slider handler
document.getElementById('year-slider').addEventListener('input', function(e) {
    currentYear = parseInt(e.target.value);
    document.getElementById('year-display').textContent = currentYear;
    if (currentVizMode === 'components') {
        updateMaps();
    } else if (currentVizMode === 'difference') {
        updateDifferenceMaps();
    } else {
        updateBottleneckMap();
    }
});

// Scale toggle handler
document.getElementById('scale-toggle').addEventListener('click', function() {
    useRelativeScale = !useRelativeScale;
    this.textContent = useRelativeScale ? 'Scale: Relative' : 'Scale: Absolute';
    this.classList.toggle('active', useRelativeScale);
    if (currentVizMode === 'components') {
        updateMaps();
    } else if (currentVizMode === 'difference') {
        updateDifferenceMaps();
    }
});

// Visualization mode buttons
document.querySelectorAll('.viz-button').forEach(button => {
    button.addEventListener('click', function() {
        const mode = this.getAttribute('data-viz');
        switchVisualization(mode);
    });
});

