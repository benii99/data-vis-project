/* ==================== CONFIGURATION ==================== */
// World-level (national) geojson and HDI data
const worldGeojsonUrl = "http://127.0.0.1:8080/data/geojson/worldmap.geojson";
const hdrCsvUrl = "http://127.0.0.1:8080/data/processed/hdr_general.csv";

// Subnational (regional) geojson and processed regional CSV (SHDI)
const regionGeojsonUrl = "http://127.0.0.1:8080/data/geojson/gdl_regons_simplified_5km.geojson";
const subnationalCsvUrl = "http://127.0.0.1:8080/data/processed/subnational_hdi_processed.csv";

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
// GeoJSON datasets
let geojsonDataWorld = null; // world features
let geojsonDataRegions = null; // all region features
let geojsonData = null; // active dataset used by the maps (points to world or filtered regions)

// Data lookups
let nationalLookup = {}; // keyed by iso3 -> { year: {hdi, healthindex, edindex, incindex, country}}
let nationalTimeSeries = {};

let dataLookup = {}; // regional lookup keyed by gdlcode -> { year: {...} }
let timeSeries = {}; // regional time series (by gdlcode)
let countryComponentVariance = {}; // keyed by "iso3_year" -> { hdiVariance, healthVariance, edVariance, incVariance }

let rawNationalCsv = null; // hdr_general raw CSV for horizon chart (national)
let rawRegionalCsv = null; // subnational raw CSV for horizon chart (regional)
let years = [];
let currentYear = null;
let selectedGdlcode = null;
let selectedCountryIso = null;
let overlayRegionFeatures = null; // when a country is selected, keep regional features to draw on top of world
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
const valuesMaps = []; // Array of D3Map instances for values visualization
let sharedZoomValuesMaps = null;

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
            // Use identical projection for all maps (offset handled in zoom behavior)
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
        
        // Use neutral white background for all maps
        this.svg.style('background-color', '#fafafa');
        
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
                // Use identical projection for all maps (offset handled in zoom behavior)
                this.projection.scale(commonProjection.scale())
                    .translate(commonProjection.translate());
            } else if (geojsonData) {
                this.projection.fitSize([this.width, this.height], geojsonData);
            }
            this.path.projection(this.projection);
        }
        
        // Remove existing paths
        this.g.selectAll('path.region').remove();
        this.g.selectAll('path.overlay-region').remove();
        
        // Bind data and create paths (works for both world and regional geojson)
        const paths = this.g.selectAll('path.region')
            .data(geojsonData.features)
            .join('path')
            .attr('class', 'region')
            .attr('d', this.path)
            .attr('fill', d => {
                const gdlcode = d.properties.gdlcode;
                let value = null;

                if (gdlcode) {
                    const yearData = dataLookup[gdlcode] && dataLookup[gdlcode][currentYear];
                    if (yearData) {
                        if (this.mapType === 'shdi') value = yearData.shdi;
                        else if (this.mapType === 'healthindex') value = yearData.healthindex;
                        else if (this.mapType === 'edindex') value = yearData.edindex;
                        else if (this.mapType === 'incindex') value = yearData.incindex;
                    }
                } else {
                    const iso = findIsoFromProps(d.properties);
                    
                    // For national level maps, use variance coloring
                    const varianceKey = `${iso}_${currentYear}`;
                    const varianceData = countryComponentVariance[varianceKey];
                    
                    if (varianceData) {
                        // Top map: HDI variance
                        if (this.mapType === 'shdi') {
                            if (varianceData.hdiVariance !== null && varianceData.hdiVariance !== undefined) {
                                return getColorForHdiVariance(varianceData.hdiVariance);
                            }
                        } else {
                            // Bottom maps: component bottleneck (how much component lags behind others)
                            let bottleneck = null;
                            if (this.mapType === 'healthindex') bottleneck = varianceData.healthBottleneck;
                            else if (this.mapType === 'edindex') bottleneck = varianceData.edBottleneck;
                            else if (this.mapType === 'incindex') bottleneck = varianceData.incBottleneck;
                            
                            if (bottleneck !== null && bottleneck !== undefined) {
                                return getColorForBottleneck(bottleneck, this.mapType);
                            }
                        }
                    }
                    return COMPONENT_COLORS.missing;
                }

                return getColorForValue(value, this.mapType);
            })
            .attr('stroke', d => {
                const gdlcode = d.properties.gdlcode;
                if (gdlcode) return selectedGdlcode === gdlcode ? '#ff0000' : '#333';
                const iso = findIsoFromProps(d.properties);
                return selectedCountryIso === iso ? '#ff0000' : '#333';
            })
            .attr('stroke-width', d => {
                const gdlcode = d.properties.gdlcode;
                if (gdlcode) return selectedGdlcode === gdlcode ? 3.5 : 0.5;
                const iso = findIsoFromProps(d.properties);
                return selectedCountryIso === iso ? 3.5 : 0.5;
            })
            .attr('vector-effect', 'non-scaling-stroke')
            .style('shape-rendering', 'geometricPrecision')
            .attr('fill-opacity', d => {
                const gdlcode = d.properties.gdlcode;
                let value = null;
                if (gdlcode) {
                const yearData = dataLookup[gdlcode] && dataLookup[gdlcode][currentYear];
                    if (yearData) {
                        if (this.mapType === 'shdi') value = yearData.shdi;
                        else if (this.mapType === 'healthindex') value = yearData.healthindex;
                        else if (this.mapType === 'edindex') value = yearData.edindex;
                        else if (this.mapType === 'incindex') value = yearData.incindex;
                    }
                } else {
                    const iso = findIsoFromProps(d.properties);
                    
                    // For national level maps, check variance data
                    if (iso) {
                        const varianceKey = `${iso}_${currentYear}`;
                        const varianceData = countryComponentVariance[varianceKey];
                        return varianceData ? 0.7 : 0.3;
                    }
                }
                return value !== null ? 0.7 : 0.3;
            })
            .style('cursor', 'pointer')
            .on('mouseover', (event, d) => {
                const gdlcode = d.properties.gdlcode;
                let value = null;
                let label = this.mapType.toUpperCase();
                let name = '';

                if (gdlcode) {
                const yearData = dataLookup[gdlcode] && dataLookup[gdlcode][currentYear];
                    if (yearData) {
                        if (this.mapType === 'shdi') { value = yearData.shdi; label = 'HDI'; }
                        else if (this.mapType === 'healthindex') { value = yearData.healthindex; label = 'Health'; }
                        else if (this.mapType === 'edindex') { value = yearData.edindex; label = 'Education'; }
                        else if (this.mapType === 'incindex') { value = yearData.incindex; label = 'Income'; }
                        name = yearData.region || gdlcode;
                    } else {
                        name = gdlcode;
                    }
                } else {
                    const iso = findIsoFromProps(d.properties);
                    name = (d.properties.name || d.properties.ADMIN || d.properties.country || iso) || iso;
                    
                    // For national level maps, show variance/bottleneck info
                    if (iso) {
                        const varianceKey = `${iso}_${currentYear}`;
                        const varianceData = countryComponentVariance[varianceKey];
                        if (varianceData) {
                            // Top map: HDI variance
                            if (this.mapType === 'shdi') {
                                const variance = varianceData.hdiVariance;
                                if (variance !== null) {
                                    const tooltipText = `${name}<br>Regional SHDI variance: ${variance.toFixed(4)}<br>Regions: ${varianceData.regionCount}`;
                                    this.tooltip
                                        .html(tooltipText)
                                        .style('opacity', 1)
                                        .style('left', (event.pageX + 10) + 'px')
                                        .style('top', (event.pageY - 10) + 'px');
                                    return;
                                }
                            } else {
                                // Bottom maps: component bottleneck (using national values)
                                let bottleneck = null;
                                let natValue = null;
                                let componentName = '';
                                if (this.mapType === 'healthindex') { 
                                    bottleneck = varianceData.healthBottleneck; 
                                    natValue = varianceData.natHealth;
                                    componentName = 'Health';
                                } else if (this.mapType === 'edindex') { 
                                    bottleneck = varianceData.edBottleneck; 
                                    natValue = varianceData.natEd;
                                    componentName = 'Education';
                                } else if (this.mapType === 'incindex') { 
                                    bottleneck = varianceData.incBottleneck; 
                                    natValue = varianceData.natInc;
                                    componentName = 'Income';
                                }
                                
                                if (bottleneck !== null) {
                                    const natText = natValue !== null ? natValue.toFixed(3) : 'N/A';
                                    // Only show positive bottleneck values (component lagging)
                                    const displayBottleneck = Math.max(0, bottleneck).toFixed(3);
                                    const tooltipText = `${name}<br>${componentName} Index: ${natText}<br>Bottleneck: ${displayBottleneck}<br>Regions: ${varianceData.regionCount}`;
                                    this.tooltip
                                        .html(tooltipText)
                                        .style('opacity', 1)
                                        .style('left', (event.pageX + 10) + 'px')
                                        .style('top', (event.pageY - 10) + 'px');
                                    return;
                                }
                            }
                        }
                    }
                }

                const tooltipText = value !== null && value !== undefined
                    ? `${name}<br>${label}: ${value.toFixed(3)}`
                    : `${name}<br>No data`;

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
                // If region feature -> select region, otherwise select country
                if (d.properties.gdlcode) {
                selectRegion(d.properties.gdlcode);
                } else {
                    const iso = findIsoFromProps(d.properties);
                    selectCountry(iso);
                }
            });

        // Draw overlay regional features (if any) on top of base world features
        if (overlayRegionFeatures && Array.isArray(overlayRegionFeatures) && overlayRegionFeatures.length > 0) {
            const overlay = this.g.selectAll('path.overlay-region')
                .data(overlayRegionFeatures)
                .join('path')
                .attr('class', 'overlay-region')
                .attr('d', this.path)
                .attr('fill', d => {
                    const yearData = dataLookup[d.properties.gdlcode] && dataLookup[d.properties.gdlcode][currentYear];
                    
                    // Top map (shdi) shows deviation from country average for subnational data
                    if (this.mapType === 'shdi') {
                        const deviation = yearData ? yearData.hdi_deviation : null;
                        return getColorForDeviation(deviation);
                    }
                    
                    // Bottom maps show component deviation from country average HDI
                    if (yearData && yearData.country_avg_shdi !== null) {
                        let componentValue = null;
                        if (this.mapType === 'healthindex') componentValue = yearData.healthindex;
                        else if (this.mapType === 'edindex') componentValue = yearData.edindex;
                        else if (this.mapType === 'incindex') componentValue = yearData.incindex;
                        
                        return getColorForComponentDeviation(componentValue, yearData.country_avg_shdi, this.mapType);
                    }
                    return COMPONENT_COLORS.missing;
                })
                .attr('stroke', d => selectedGdlcode === d.properties.gdlcode ? '#ff0000' : '#222')
                .attr('stroke-width', d => selectedGdlcode === d.properties.gdlcode ? 3.5 : 0.8)
            .attr('vector-effect', 'non-scaling-stroke')
                .style('shape-rendering', 'geometricPrecision')
                .attr('fill-opacity', d => {
                    const yearData = dataLookup[d.properties.gdlcode] && dataLookup[d.properties.gdlcode][currentYear];
                    if (this.mapType === 'shdi') {
                        const deviation = yearData ? yearData.hdi_deviation : null;
                        return deviation !== null ? 0.85 : 0.3;
                    }
                    // Bottom maps: check if component and country average HDI both exist
                    if (yearData && yearData.country_avg_shdi !== null) {
                        let componentValue = null;
                        if (this.mapType === 'healthindex') componentValue = yearData.healthindex;
                        else if (this.mapType === 'edindex') componentValue = yearData.edindex;
                        else if (this.mapType === 'incindex') componentValue = yearData.incindex;
                        return componentValue !== null ? 0.85 : 0.3;
                    }
                    return 0.3;
                })
                .style('cursor', 'pointer')
                .on('mouseover', (event, d) => {
                    const yearData = dataLookup[d.properties.gdlcode] && dataLookup[d.properties.gdlcode][currentYear];
                    const name = (yearData && yearData.region) || d.properties.region || d.properties.name || d.properties.GDL_NAME || d.properties.gdlcode;
                
                let tooltipText = '';
                
                    // Top map shows deviation info for subnational regions
                if (this.mapType === 'shdi') {
                    const deviation = yearData ? yearData.hdi_deviation : null;
                    const hdi = yearData ? yearData.shdi : null;
                    const countryAvg = yearData ? yearData.country_avg_shdi : null;
                    
                    if (deviation !== null && hdi !== null) {
                        const sign = deviation >= 0 ? '+' : '';
                        const avgText = countryAvg !== null ? countryAvg.toFixed(3) : 'N/A';
                            tooltipText = `${name}<br>SHDI: ${hdi.toFixed(3)}<br>Country Avg: ${avgText}<br>Deviation: ${sign}${deviation.toFixed(3)}`;
                    } else {
                            tooltipText = `${name}<br>No data`;
                    }
                } else {
                        // Bottom maps show component deviation from country average HDI
                        let componentValue = null;
                        const countryAvg = yearData ? yearData.country_avg_shdi : null;
                        const label = this.mapType === 'healthindex' ? 'Health' : (this.mapType === 'edindex' ? 'Education' : 'Income');
                        
                        if (yearData) {
                            if (this.mapType === 'healthindex') componentValue = yearData.healthindex;
                            else if (this.mapType === 'edindex') componentValue = yearData.edindex;
                            else if (this.mapType === 'incindex') componentValue = yearData.incindex;
                        }
                        
                        if (componentValue !== null && countryAvg !== null) {
                            const deviation = componentValue - countryAvg;
                            const sign = deviation >= 0 ? '+' : '';
                            tooltipText = `${name}<br>${label}: ${componentValue.toFixed(3)}<br>Country Avg SHDI: ${countryAvg.toFixed(3)}<br>Deviation: ${sign}${deviation.toFixed(3)}`;
                        } else {
                            tooltipText = `${name}<br>No data`;
                        }
                    }
                    
                    this.tooltip.html(tooltipText).style('opacity', 1).style('left', (event.pageX + 10) + 'px').style('top', (event.pageY - 10) + 'px');
                })
                .on('mousemove', (event) => {
                    this.tooltip.style('left', (event.pageX + 10) + 'px').style('top', (event.pageY - 10) + 'px');
                })
                .on('mouseout', () => {
                    this.tooltip.style('opacity', 0);
                })
                .on('click', (event, d) => {
                    // Selecting a region from the overlay
                    if (d.properties && d.properties.gdlcode) selectRegion(d.properties.gdlcode);
                });
        }
    }
    
    // Update method for Values Visualization (shows raw values, no deviations)
    updateValues(mapType) {
        if (!this.initialized || !geojsonData || !this.g) return;
        
        this.mapType = mapType || this.mapType;
        if (!this.mapType) return;

        // Use neutral white background for all maps
        this.svg.style('background-color', '#fafafa');
        
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
        if (needsRefit) {
            if (commonProjection) {
                // Use identical projection for all maps (offset handled in zoom behavior)
                this.projection.scale(commonProjection.scale())
                    .translate(commonProjection.translate());
            } else if (geojsonData) {
                this.projection.fitSize([this.width, this.height], geojsonData);
            }
            this.path.projection(this.projection);
        }
        
        // Remove existing paths
        this.g.selectAll('path.region').remove();
        this.g.selectAll('path.overlay-region').remove();
        
        // Bind data and create paths for world countries
        const paths = this.g.selectAll('path.region')
            .data(geojsonData.features)
            .join('path')
            .attr('class', 'region')
            .attr('d', this.path)
            .attr('fill', d => {
                const gdlcode = d.properties.gdlcode;
                    let value = null;

                if (gdlcode) {
                    const yearData = dataLookup[gdlcode] && dataLookup[gdlcode][currentYear];
                    if (yearData) {
                        if (this.mapType === 'shdi') value = yearData.shdi;
                        else if (this.mapType === 'healthindex') value = yearData.healthindex;
                        else if (this.mapType === 'edindex') value = yearData.edindex;
                        else if (this.mapType === 'incindex') value = yearData.incindex;
                    }
                } else {
                    // National level: get country HDI or average component value
                    const iso = findIsoFromProps(d.properties);
                    if (iso && nationalTimeSeries[iso]) {
                        const yearIndex = nationalTimeSeries[iso].years.indexOf(currentYear);
                        if (yearIndex !== -1) {
                            if (this.mapType === 'shdi') {
                                value = nationalTimeSeries[iso].shdi[yearIndex];
                            } else if (this.mapType === 'healthindex') {
                                value = nationalTimeSeries[iso].healthindex ? nationalTimeSeries[iso].healthindex[yearIndex] : null;
                            } else if (this.mapType === 'edindex') {
                                value = nationalTimeSeries[iso].edindex ? nationalTimeSeries[iso].edindex[yearIndex] : null;
                            } else if (this.mapType === 'incindex') {
                                value = nationalTimeSeries[iso].incindex ? nationalTimeSeries[iso].incindex[yearIndex] : null;
                            }
                        }
                    }
                }

                return getColorForRawValue(value, this.mapType);
            })
            .attr('stroke', d => {
                const gdlcode = d.properties.gdlcode;
                if (gdlcode) return selectedGdlcode === gdlcode ? '#ff0000' : '#333';
                const iso = findIsoFromProps(d.properties);
                return selectedCountryIso === iso ? '#ff0000' : '#333';
            })
            .attr('stroke-width', d => {
                const gdlcode = d.properties.gdlcode;
                if (gdlcode) return selectedGdlcode === gdlcode ? 3.5 : 0.5;
                const iso = findIsoFromProps(d.properties);
                return selectedCountryIso === iso ? 3.5 : 0.5;
            })
            .attr('vector-effect', 'non-scaling-stroke')
            .style('shape-rendering', 'geometricPrecision')
            .attr('fill-opacity', d => {
                const gdlcode = d.properties.gdlcode;
                let value = null;
                if (gdlcode) {
                    const yearData = dataLookup[gdlcode] && dataLookup[gdlcode][currentYear];
                    if (yearData) {
                        if (this.mapType === 'shdi') value = yearData.shdi;
                        else if (this.mapType === 'healthindex') value = yearData.healthindex;
                        else if (this.mapType === 'edindex') value = yearData.edindex;
                        else if (this.mapType === 'incindex') value = yearData.incindex;
                    }
                } else {
                    const iso = findIsoFromProps(d.properties);
                    if (iso && nationalTimeSeries[iso]) {
                        const yearIndex = nationalTimeSeries[iso].years.indexOf(currentYear);
                        if (yearIndex !== -1) {
                            if (this.mapType === 'shdi') {
                                value = nationalTimeSeries[iso].shdi[yearIndex];
                            } else if (this.mapType === 'healthindex') {
                                value = nationalTimeSeries[iso].healthindex ? nationalTimeSeries[iso].healthindex[yearIndex] : null;
                            } else if (this.mapType === 'edindex') {
                                value = nationalTimeSeries[iso].edindex ? nationalTimeSeries[iso].edindex[yearIndex] : null;
                            } else if (this.mapType === 'incindex') {
                                value = nationalTimeSeries[iso].incindex ? nationalTimeSeries[iso].incindex[yearIndex] : null;
                            }
                        }
                    }
                }
                return value !== null ? 0.85 : 0.3;
            })
            .style('cursor', 'pointer')
            .on('mouseover', (event, d) => {
                const iso = findIsoFromProps(d.properties);
                const name = d.properties.name || d.properties.NAME || d.properties.ADMIN || d.properties.SOVEREIGNT || iso || 'Unknown';
                
                let tooltipText = '';
                
                if (iso && nationalTimeSeries[iso]) {
                    const yearIndex = nationalTimeSeries[iso].years.indexOf(currentYear);
                    if (yearIndex !== -1) {
                        let value = null;
                        let label = '';
                        if (this.mapType === 'shdi') {
                            value = nationalTimeSeries[iso].shdi[yearIndex];
                            label = 'HDI';
                        } else if (this.mapType === 'healthindex') {
                            value = nationalTimeSeries[iso].healthindex ? nationalTimeSeries[iso].healthindex[yearIndex] : null;
                            label = 'Health';
                        } else if (this.mapType === 'edindex') {
                            value = nationalTimeSeries[iso].edindex ? nationalTimeSeries[iso].edindex[yearIndex] : null;
                            label = 'Education';
                        } else if (this.mapType === 'incindex') {
                            value = nationalTimeSeries[iso].incindex ? nationalTimeSeries[iso].incindex[yearIndex] : null;
                            label = 'Income';
                        }
                        
                        if (value !== null) {
                            tooltipText = `${name}<br>${label}: ${value.toFixed(3)}`;
                        } else {
                            tooltipText = `${name}<br>No data`;
                        }
                    } else {
                        tooltipText = `${name}<br>No data for ${currentYear}`;
                    }
                } else {
                    tooltipText = `${name}<br>No data`;
                }
                
                this.tooltip.html(tooltipText).style('opacity', 1).style('left', (event.pageX + 10) + 'px').style('top', (event.pageY - 10) + 'px');
            })
            .on('mousemove', (event) => {
                this.tooltip.style('left', (event.pageX + 10) + 'px').style('top', (event.pageY - 10) + 'px');
            })
            .on('mouseout', () => {
                this.tooltip.style('opacity', 0);
            })
            .on('click', (event, d) => {
                const iso = findIsoFromProps(d.properties);
                if (iso) selectCountry(iso);
            });
        
        // Add overlay regions for selected country (subnational view)
        if (overlayRegionFeatures && overlayRegionFeatures.length > 0) {
            const overlay = this.g.selectAll('path.overlay-region')
                .data(overlayRegionFeatures)
                .join('path')
                .attr('class', 'overlay-region')
                .attr('d', this.path)
                .attr('fill', d => {
                    const yearData = dataLookup[d.properties.gdlcode] && dataLookup[d.properties.gdlcode][currentYear];
                    
                    // Show raw values
                    let value = null;
                    if (yearData) {
                        if (this.mapType === 'shdi') value = yearData.shdi;
                        else if (this.mapType === 'healthindex') value = yearData.healthindex;
                        else if (this.mapType === 'edindex') value = yearData.edindex;
                        else if (this.mapType === 'incindex') value = yearData.incindex;
                    }
                    
                    return getColorForRawValue(value, this.mapType);
                })
                .attr('stroke', d => selectedGdlcode === d.properties.gdlcode ? '#ff0000' : '#222')
                .attr('stroke-width', d => selectedGdlcode === d.properties.gdlcode ? 3.5 : 0.8)
                .attr('vector-effect', 'non-scaling-stroke')
                .style('shape-rendering', 'geometricPrecision')
                .attr('fill-opacity', d => {
                    const yearData = dataLookup[d.properties.gdlcode] && dataLookup[d.properties.gdlcode][currentYear];
                    let value = null;
                    if (yearData) {
                        if (this.mapType === 'shdi') value = yearData.shdi;
                        else if (this.mapType === 'healthindex') value = yearData.healthindex;
                        else if (this.mapType === 'edindex') value = yearData.edindex;
                        else if (this.mapType === 'incindex') value = yearData.incindex;
                    }
                    return value !== null ? 0.85 : 0.3;
                })
                .style('cursor', 'pointer')
                .on('mouseover', (event, d) => {
                    const yearData = dataLookup[d.properties.gdlcode] && dataLookup[d.properties.gdlcode][currentYear];
                    const name = (yearData && yearData.region) || d.properties.region || d.properties.name || d.properties.GDL_NAME || d.properties.gdlcode;
                    
                    let tooltipText = '';
                    let value = null;
                    let label = '';
                    
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
                    
                    if (value !== null) {
                        tooltipText = `${name}<br>${label}: ${value.toFixed(3)}`;
                    } else {
                        tooltipText = `${name}<br>No data`;
                    }
                    
                    this.tooltip.html(tooltipText).style('opacity', 1).style('left', (event.pageX + 10) + 'px').style('top', (event.pageY - 10) + 'px');
                })
                .on('mousemove', (event) => {
                    this.tooltip.style('left', (event.pageX + 10) + 'px').style('top', (event.pageY - 10) + 'px');
                })
                .on('mouseout', () => {
                    this.tooltip.style('opacity', 0);
                })
                .on('click', (event, d) => {
                    if (d.properties && d.properties.gdlcode) selectRegion(d.properties.gdlcode);
                });
        }
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
                    // Use identical projection for all maps (offset handled in zoom behavior)
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
            .scaleExtent([0.5, 20])
            .on('zoom', (event) => {
                // Apply transform to all maps, adjusted for each map's offset
                const t = event.transform;
                mapGroup.forEach(map => {
                    if (map && map.initialized && map.g) {
                        // Calculate offset for this map relative to reference
                        const offsetX = (map.width - referenceWidth) / 2;
                        const offsetY = (map.height - referenceHeight) / 2;
                        
                        // Combine zoom transform with map's offset
                        // The offset needs to be applied before scaling
                        const adjustedX = t.x + offsetX;
                        const adjustedY = t.y + offsetY;
                        
                        map.g.attr('transform', `translate(${adjustedX}, ${adjustedY}) scale(${t.k})`);
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
    {id: 'map-top', type: 'shdi', legendId: 'legend-top', title: 'SHDI'},
    {id: 'map-bottom-1', type: 'healthindex', legendId: 'legend-bottom-1', title: 'Health'},
    {id: 'map-bottom-2', type: 'edindex', legendId: 'legend-bottom-2', title: 'Education'},
    {id: 'map-bottom-3', type: 'incindex', legendId: 'legend-bottom-3', title: 'Income'}
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
    d3.json(worldGeojsonUrl),
    d3.csv(hdrCsvUrl),
    d3.json(regionGeojsonUrl),
    d3.csv(subnationalCsvUrl)
]).then(([worldGeojson, hdrRows, regionGeojson, subnationalRows]) => {
    // Rewind features to fix polygon winding order (important for proper rendering)
    const fixedWorld = worldGeojson.features.map(f => rewindFeature(f, true));
    const fixedRegions = regionGeojson.features.map(f => rewindFeature(f, true));

    geojsonDataWorld = { type: 'FeatureCollection', features: fixedWorld };
    geojsonDataRegions = { type: 'FeatureCollection', features: fixedRegions };
    // Start with world map
    geojsonData = geojsonDataWorld;

    // Store raw CSVs
    rawNationalCsv = hdrRows;
    rawRegionalCsv = subnationalRows;

    // Process national HDR CSV to build nationalLookup and nationalTimeSeries
    const processedNational = hdrRows.map(row => ({
        iso3: (row.iso3 || '').toUpperCase(),
        country: row.country || '',
        year: parseInt(row.year, 10),
        hdi: safeValue(row.hdi),
        life_expectancy: toNumber(row.life_expectancy),
        expec_yr_school: toNumber(row.expec_yr_school),
        mean_yr_school: toNumber(row.mean_yr_school),
        gross_inc_percap: toNumber(row.gross_inc_percap)
    }));

    nationalLookup = {};
    processedNational.forEach(r => {
        if (!nationalLookup[r.iso3]) nationalLookup[r.iso3] = {};

        // Compute component indexes (approx. UN method bounds)
        let healthIndex = null;
        if (typeof r.life_expectancy === 'number' && !isNaN(r.life_expectancy)) {
            healthIndex = (r.life_expectancy - 20) / (85 - 20);
            healthIndex = Math.max(0, Math.min(1, healthIndex));
        }

        let edIndex = null;
        const eys = r.expec_yr_school;
        const mys = r.mean_yr_school;
        if (typeof eys === 'number' && !isNaN(eys) && typeof mys === 'number' && !isNaN(mys)) {
            const eysIndex = Math.max(0, Math.min(1, eys / 18));
            const mysIndex = Math.max(0, Math.min(1, mys / 15));
            edIndex = (eysIndex + mysIndex) / 2;
        }

        let incIndex = null;
        if (typeof r.gross_inc_percap === 'number' && !isNaN(r.gross_inc_percap) && r.gross_inc_percap > 0) {
            const ln = Math.log;
            const value = r.gross_inc_percap;
            const minV = 100; const maxV = 75000;
            incIndex = (ln(value) - ln(minV)) / (ln(maxV) - ln(minV));
            incIndex = Math.max(0, Math.min(1, incIndex));
        }

        nationalLookup[r.iso3][r.year] = {
            hdi: r.hdi,
            healthindex: healthIndex,
            edindex: edIndex,
            incindex: incIndex,
            country: r.country
        };
    });

    // Build nationalTimeSeries
    nationalTimeSeries = {};
    Object.keys(nationalLookup).forEach(iso3 => {
        const yearsKeys = Object.keys(nationalLookup[iso3]).map(y => parseInt(y, 10)).sort((a,b)=>a-b);
        if (yearsKeys.length) {
            nationalTimeSeries[iso3] = {
                years: yearsKeys,
                shdi: yearsKeys.map(y => nationalLookup[iso3][y].hdi),
                hdi: yearsKeys.map(y => nationalLookup[iso3][y].hdi),
                healthindex: yearsKeys.map(y => nationalLookup[iso3][y].healthindex),
                edindex: yearsKeys.map(y => nationalLookup[iso3][y].edindex),
                incindex: yearsKeys.map(y => nationalLookup[iso3][y].incindex),
                country: nationalLookup[iso3][yearsKeys[0]] ? nationalLookup[iso3][yearsKeys[0]].country : ''
            };
        }
    });

    // Process regional CSV (subnational) as before to populate dataLookup/timeSeries
    const processedRows = subnationalRows.map(row => ({
        gdlcode: row.gdlcode,
        year: parseInt(row.year, 10),
        shdi: safeValue(row.shdi),
        healthindex: safeValue(row.healthindex),
        edindex: safeValue(row.edindex),
        incindex: safeValue(row.incindex),
        region: row.region || '',
        country: row.country || '',
        isocode3: (row.isocode3 || '').toUpperCase()
    }));

    // Get available years from national data (use national years for the global slider)
    years = [...new Set(processedNational.map(r => r.year))].filter(y => !isNaN(y)).sort((a, b) => a - b);
    currentYear = years[years.length - 1];

    dataLookup = {};
    processedRows.forEach(row => {
        if (!dataLookup[row.gdlcode]) dataLookup[row.gdlcode] = {};
        dataLookup[row.gdlcode][row.year] = {
            shdi: row.shdi,
            healthindex: row.healthindex,
            edindex: row.edindex,
            incindex: row.incindex,
            region: row.region,
            country: row.country
        };
    });

    // Compute country HDI deviation for each region using NATIONAL HDI (not regional average)
    // First, build a mapping from gdlcode to isocode3
    const gdlcodeToIso = {};
    processedRows.forEach(row => {
        if (row.gdlcode && row.isocode3) {
            gdlcodeToIso[row.gdlcode] = row.isocode3.toUpperCase();
        }
    });

    // Add deviation to dataLookup using national HDI from nationalLookup
    Object.keys(dataLookup).forEach(gdlcode => {
        const isocode = gdlcodeToIso[gdlcode];
        Object.keys(dataLookup[gdlcode]).forEach(year => {
            const entry = dataLookup[gdlcode][year];
            const yearNum = parseInt(year, 10);
            
            // Get national HDI from nationalLookup
            const nationalData = isocode && nationalLookup[isocode] && nationalLookup[isocode][yearNum];
            const countryHdi = nationalData ? nationalData.hdi : null;
            
            if (countryHdi !== null && entry.shdi !== null) {
                entry.country_avg_shdi = countryHdi;
                entry.hdi_deviation = entry.shdi - countryHdi;
            } else {
                entry.country_avg_shdi = null;
                entry.hdi_deviation = null;
            }
        });
    });

    // Calculate component variance per country per year (from regional data)
    // Group component values by ISO code and year (using isocode3 from subnational data)
    const countryComponentGroups = {};
    processedRows.forEach(row => {
        if (!row.isocode3) return;
        const key = `${row.isocode3}_${row.year}`;
        if (!countryComponentGroups[key]) {
            countryComponentGroups[key] = {
                isocode3: row.isocode3,
                country: row.country,
                year: row.year,
                hdi: [],
                health: [],
                education: [],
                income: []
            };
        }
        if (row.shdi !== null) countryComponentGroups[key].hdi.push(row.shdi);
        if (row.healthindex !== null) countryComponentGroups[key].health.push(row.healthindex);
        if (row.edindex !== null) countryComponentGroups[key].education.push(row.edindex);
        if (row.incindex !== null) countryComponentGroups[key].income.push(row.incindex);
    });

    countryComponentVariance = {};
    Object.values(countryComponentGroups).forEach(group => {
        const key = `${group.isocode3}_${group.year}`;
        
        // Calculate variance from regional data: sum((x - mean)^2) / n
        const calcVariance = (values) => {
            if (values.length < 2) return 0;
            const mean = values.reduce((a, b) => a + b, 0) / values.length;
            const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
            return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
        };
        
        // Get NATIONAL component values from nationalLookup (not regional averages)
        const nationalData = nationalLookup[group.isocode3] && nationalLookup[group.isocode3][group.year];
        const natHealth = nationalData ? nationalData.healthindex : null;
        const natEd = nationalData ? nationalData.edindex : null;
        const natInc = nationalData ? nationalData.incindex : null;
        const natHdi = nationalData ? nationalData.hdi : null;
        
        // Calculate bottleneck metric using NATIONAL component values:
        // For component X: Avg(otherComponent1 - X, otherComponent2 - X)
        // Positive = component is lagging (bottleneck), Negative = component is ahead
        let healthBottleneck = null;
        let edBottleneck = null;
        let incBottleneck = null;
        
        if (natHealth !== null && natEd !== null && natInc !== null) {
            // Health bottleneck: Avg(education - health, income - health)
            healthBottleneck = ((natEd - natHealth) + (natInc - natHealth)) / 2;
            // Education bottleneck: Avg(health - education, income - education)
            edBottleneck = ((natHealth - natEd) + (natInc - natEd)) / 2;
            // Income bottleneck: Avg(health - income, education - income)
            incBottleneck = ((natHealth - natInc) + (natEd - natInc)) / 2;
        }
        
        countryComponentVariance[key] = {
            // Variance still calculated from regional data (for top map)
            hdiVariance: calcVariance(group.hdi),
            healthVariance: calcVariance(group.health),
            edVariance: calcVariance(group.education),
            incVariance: calcVariance(group.income),
            // Bottleneck metrics using NATIONAL values (for bottom maps)
            healthBottleneck: healthBottleneck,
            edBottleneck: edBottleneck,
            incBottleneck: incBottleneck,
            // National component values for tooltip
            natHealth: natHealth,
            natEd: natEd,
            natInc: natInc,
            natHdi: natHdi,
            regionCount: Math.max(group.hdi.length, group.health.length, group.education.length, group.income.length)
        };
    });

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
    if (years.length) {
    document.getElementById('year-slider').min = years[0];
    document.getElementById('year-slider').max = years[years.length - 1];
    document.getElementById('year-slider').value = currentYear;
    document.getElementById('year-display').textContent = currentYear;
    }
    document.getElementById('year-slider').disabled = false;
    
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

// Helper to find an ISO3 code from a feature's properties (tries common property names)
function findIsoFromProps(props) {
    if (!props) return null;
    // Prioritize _eh variants which have proper ISO codes (iso_a3 can be '-99' for some countries)
    const candidates = ['iso_a3_eh', 'ISO_A3_EH', 'adm0_a3', 'ADM0_A3', 'iso_a3', 'ISO_A3', 'iso3', 'ISO3', 'iso_code', 'ISO'];
    for (const k of candidates) {
        const val = props[k];
        // Skip invalid values like '-99', -99, null, undefined, empty string
        if (val && val !== '-99' && val !== -99 && String(val).trim() !== '') {
            return String(val).toUpperCase();
        }
    }
    // Try some name fields as last resort (not ideal)
    if (props['geounit'] && props['geounit_iso']) return String(props['geounit_iso']).toUpperCase();
    return null;
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

// Get deviation value range for normalization (for subnational HDI deviation from country avg)
function getDeviationValueRange() {
    const deviations = [];
    Object.keys(dataLookup).forEach(gdlcode => {
        const yearData = dataLookup[gdlcode] && dataLookup[gdlcode][currentYear];
        if (yearData && yearData.hdi_deviation !== null && !isNaN(yearData.hdi_deviation)) {
            deviations.push(Math.abs(yearData.hdi_deviation));
        }
    });
    
    if (deviations.length === 0) {
        return {min: 0, max: 0.1};
    }
    
    return {
        min: 0,
        max: Math.max(...deviations)
    };
}

// Get color for HDI deviation (green for positive/above avg, red for negative/below avg)
function getColorForDeviation(deviation) {
    if (deviation === null || deviation === undefined || isNaN(deviation)) {
        return COMPONENT_COLORS.missing;
    }
    
    const range = getDeviationValueRange();
    if (range.max === 0) {
        return '#ffffff'; // Neutral color if no variation
    }
    
    // Normalize absolute deviation to 0-1 range
    const normalized = Math.min(1, Math.abs(deviation) / range.max);
    
    if (deviation > 0) {
        // Positive deviation (above country avg): green
        return interpolateColor('#ffffff', '#0066cc', normalized);
    } else {
        // Negative deviation (below country avg): red
        return interpolateColor('#ffffff', '#cc0000', normalized);
    }
}

// Get HDI variance range (for national level top map)
function getHdiVarianceRange() {
    const variances = [];
    Object.keys(countryComponentVariance).forEach(key => {
        if (!key.endsWith(`_${currentYear}`)) return;
        const data = countryComponentVariance[key];
        if (data.hdiVariance !== null && data.hdiVariance !== undefined && !isNaN(data.hdiVariance) && data.hdiVariance > 0) {
            variances.push(data.hdiVariance);
        }
    });
    
    if (variances.length === 0) {
        return { min: 0, max: 0.01 };
    }
    
    return {
        min: 0,
        max: Math.max(...variances)
    };
}

// Get color for HDI variance (uses blue: higher variance = more blue)
function getColorForHdiVariance(variance) {
    if (variance === null || variance === undefined || isNaN(variance)) {
        return COMPONENT_COLORS.missing;
    }
    
    const range = getHdiVarianceRange();
    if (range.max === 0) {
        return '#ffffff';
    }
    
    // Normalize variance to 0-1 range
    const normalized = Math.min(1, variance / range.max);
    
    // Use blue for HDI variance (same as component variance)
    return interpolateColor('#ffffff', '#0066cc', normalized);
}

// Get variance range for a component type (for national level maps)
function getComponentVarianceRange(componentType) {
    const variances = [];
    Object.keys(countryComponentVariance).forEach(key => {
        if (!key.endsWith(`_${currentYear}`)) return;
        const data = countryComponentVariance[key];
        let variance = null;
        if (componentType === 'healthindex') variance = data.healthVariance;
        else if (componentType === 'edindex') variance = data.edVariance;
        else if (componentType === 'incindex') variance = data.incVariance;
        
        if (variance !== null && variance !== undefined && !isNaN(variance) && variance > 0) {
            variances.push(variance);
        }
    });
    
    if (variances.length === 0) {
        return { min: 0, max: 0.01 };
    }
    
    return {
        min: 0,
        max: Math.max(...variances)
    };
}

// Get shared variance range across all three component types
function getSharedComponentVarianceRange() {
    const allVariances = [];
    Object.keys(countryComponentVariance).forEach(key => {
        if (!key.endsWith(`_${currentYear}`)) return;
        const data = countryComponentVariance[key];
        
        if (data.healthVariance !== null && data.healthVariance !== undefined && !isNaN(data.healthVariance) && data.healthVariance > 0) {
            allVariances.push(data.healthVariance);
        }
        if (data.edVariance !== null && data.edVariance !== undefined && !isNaN(data.edVariance) && data.edVariance > 0) {
            allVariances.push(data.edVariance);
        }
        if (data.incVariance !== null && data.incVariance !== undefined && !isNaN(data.incVariance) && data.incVariance > 0) {
            allVariances.push(data.incVariance);
        }
    });
    
    if (allVariances.length === 0) {
        return { min: 0, max: 0.01 };
    }
    
    return {
        min: 0,
        max: Math.max(...allVariances)
    };
}

// Get color for component variance (higher variance = more blue)
function getColorForVariance(variance, componentType) {
    if (variance === null || variance === undefined || isNaN(variance)) {
        return COMPONENT_COLORS.missing;
    }
    
    const range = getSharedComponentVarianceRange();
    if (range.max === 0) {
        return '#ffffff';
    }
    
    // Normalize variance to 0-1 range using shared range
    const normalized = Math.min(1, variance / range.max);
    
    // Use blue for all component variance (same as deviation positive)
    return interpolateColor('#ffffff', '#0066cc', normalized);
}

// Get shared bottleneck range across all three component types (for national level)
function getSharedBottleneckRange() {
    const allBottlenecks = [];
    Object.keys(countryComponentVariance).forEach(key => {
        if (!key.endsWith(`_${currentYear}`)) return;
        const data = countryComponentVariance[key];
        
        if (data.healthBottleneck !== null && data.healthBottleneck !== undefined && !isNaN(data.healthBottleneck)) {
            allBottlenecks.push(Math.abs(data.healthBottleneck));
        }
        if (data.edBottleneck !== null && data.edBottleneck !== undefined && !isNaN(data.edBottleneck)) {
            allBottlenecks.push(Math.abs(data.edBottleneck));
        }
        if (data.incBottleneck !== null && data.incBottleneck !== undefined && !isNaN(data.incBottleneck)) {
            allBottlenecks.push(Math.abs(data.incBottleneck));
        }
    });
    
    if (allBottlenecks.length === 0) {
        return { min: 0, max: 0.1 };
    }
    
    return {
        min: 0,
        max: Math.max(...allBottlenecks)
    };
}

// Get color for bottleneck value (white to blue, only positive values matter)
function getColorForBottleneck(bottleneck, componentType) {
    if (bottleneck === null || bottleneck === undefined || isNaN(bottleneck)) {
        return COMPONENT_COLORS.missing;
    }
    
    // Only care about positive values (component lagging behind others)
    // Negative values (component ahead) are treated as 0
    const effectiveBottleneck = Math.max(0, bottleneck);
    
    const range = getSharedBottleneckRange();
    if (range.max === 0) {
        return '#ffffff';
    }
    
    // Normalize to 0-1 range
    const normalized = Math.min(1, effectiveBottleneck / range.max);
    
    // White to blue: more blue = bigger bottleneck
    return interpolateColor('#ffffff', '#0066cc', normalized);
}

// Get component deviation from HDI value range (for bottom maps)
function getComponentDeviationRange(componentType) {
    const deviations = [];
    Object.keys(dataLookup).forEach(gdlcode => {
        const yearData = dataLookup[gdlcode] && dataLookup[gdlcode][currentYear];
        if (yearData && yearData.country_avg_shdi !== null) {
            let componentValue = null;
            if (componentType === 'healthindex') componentValue = yearData.healthindex;
            else if (componentType === 'edindex') componentValue = yearData.edindex;
            else if (componentType === 'incindex') componentValue = yearData.incindex;
            
            if (componentValue !== null && !isNaN(componentValue)) {
                const deviation = componentValue - yearData.country_avg_shdi;
                deviations.push(Math.abs(deviation));
            }
        }
    });
    
    if (deviations.length === 0) {
        return {min: 0, max: 0.1};
    }
    
    return {
        min: 0,
        max: Math.max(...deviations)
    };
}

// Get shared component deviation range across all three component types (for subnational divergent maps)
function getSharedComponentDeviationRange() {
    const allDeviations = [];
    Object.keys(dataLookup).forEach(gdlcode => {
        const yearData = dataLookup[gdlcode] && dataLookup[gdlcode][currentYear];
        if (yearData && yearData.country_avg_shdi !== null) {
            if (yearData.healthindex !== null && !isNaN(yearData.healthindex)) {
                const deviation = yearData.healthindex - yearData.country_avg_shdi;
                allDeviations.push(Math.abs(deviation));
            }
            if (yearData.edindex !== null && !isNaN(yearData.edindex)) {
                const deviation = yearData.edindex - yearData.country_avg_shdi;
                allDeviations.push(Math.abs(deviation));
            }
            if (yearData.incindex !== null && !isNaN(yearData.incindex)) {
                const deviation = yearData.incindex - yearData.country_avg_shdi;
                allDeviations.push(Math.abs(deviation));
            }
        }
    });
    
    if (allDeviations.length === 0) {
        return {min: 0, max: 0.1};
    }
    
    return {
        min: 0,
        max: Math.max(...allDeviations)
    };
}

// Get color for component deviation from HDI (green = component above HDI, red = component below HDI)
function getColorForComponentDeviation(componentValue, hdiValue, componentType) {
    if (componentValue === null || componentValue === undefined || isNaN(componentValue) ||
        hdiValue === null || hdiValue === undefined || isNaN(hdiValue)) {
        return COMPONENT_COLORS.missing;
    }
    
    const deviation = componentValue - hdiValue;
    const range = getSharedComponentDeviationRange();
    
    if (range.max === 0) {
        return '#ffffff'; // Neutral color if no variation
    }
    
    // Normalize absolute deviation to 0-1 range
    const normalized = Math.min(1, Math.abs(deviation) / range.max);
    
    if (deviation > 0) {
        // Positive deviation (component above HDI): green
        return interpolateColor('#ffffff', '#0066cc', normalized);
    } else {
        // Negative deviation (component below HDI): red
        return interpolateColor('#ffffff', '#cc0000', normalized);
    }
}

// Calculate min/max values for current year (excluding nulls)
// Get shared range across all three component indices for consistent coloring
// For national view, uses nationalLookup; for regional view, uses dataLookup
function getSharedComponentRange() {
    const values = [];
    
    // Determine if we're showing regional overlay
    const isShowingSubnational = overlayRegionFeatures && overlayRegionFeatures.length > 0;
    
    if (isShowingSubnational) {
        // Use regional data (dataLookup)
        Object.keys(dataLookup).forEach(gdlcode => {
            const yearData = dataLookup[gdlcode][currentYear];
            if (yearData) {
                if (yearData.healthindex !== null && yearData.healthindex !== undefined && !isNaN(yearData.healthindex)) {
                    values.push(yearData.healthindex);
                }
                if (yearData.edindex !== null && yearData.edindex !== undefined && !isNaN(yearData.edindex)) {
                    values.push(yearData.edindex);
                }
                if (yearData.incindex !== null && yearData.incindex !== undefined && !isNaN(yearData.incindex)) {
                    values.push(yearData.incindex);
                }
            }
        });
    } else {
        // Use national data (nationalLookup)
        Object.keys(nationalLookup).forEach(iso3 => {
            const yearData = nationalLookup[iso3][currentYear];
            if (yearData) {
                if (yearData.healthindex !== null && yearData.healthindex !== undefined && !isNaN(yearData.healthindex)) {
                    values.push(yearData.healthindex);
                }
                if (yearData.edindex !== null && yearData.edindex !== undefined && !isNaN(yearData.edindex)) {
                    values.push(yearData.edindex);
                }
                if (yearData.incindex !== null && yearData.incindex !== undefined && !isNaN(yearData.incindex)) {
                    values.push(yearData.incindex);
                }
            }
        });
    }
    
    if (values.length === 0) {
        return {min: 0, max: 1};
    }
    
    return {
        min: Math.min(...values),
        max: Math.max(...values)
    };
}

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
        // For component indices, use shared range so they're comparable
        let range;
        if (mapType === 'healthindex' || mapType === 'edindex' || mapType === 'incindex') {
            range = getSharedComponentRange();
        } else {
            range = getValueRange(mapType);
        }
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

// Get color for raw value display (Values Visualization) - HDI uses white-to-green
function getColorForRawValue(value, type) {
    if (value === null || value === undefined || isNaN(value)) {
        return COMPONENT_COLORS.missing;
    }
    
    const normalized = normalizeValue(value, type);
    if (normalized === null) {
        return COMPONENT_COLORS.missing;
    }
    
    if (type === 'shdi') {
        // White to green for HDI in values visualization
        return interpolateColor('#ffffff', '#00aa44', normalized);
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
function createGradientCSS(mapType, isDeviation = false) {
    if (mapType === 'shdi') {
        if (isDeviation) {
        // Deviation: red (below avg) -> white (avg) -> green (above avg)
            return 'linear-gradient(to top, #cc0000, #ffffff, #0066cc)';
        }
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
    
    // Check if we're showing subnational data (overlay features present)
    const isShowingSubnational = overlayRegionFeatures && overlayRegionFeatures.length > 0;
    
    // Top map: HDI deviation from country average
    if (mapType === 'shdi' && isShowingSubnational) {
        const range = getDeviationValueRange();
        const maxDev = range.max.toFixed(3);
        
        const gradientCSS = createGradientCSS(mapType, true);
        
        legendEl.innerHTML = `
            <div class="legend-title">${title} (vs National HDI)</div>
            <div class="legend-gradient-container">
                <div class="legend-gradient" style="background: ${gradientCSS};"></div>
                <div class="legend-labels">
                    <span class="legend-label-top">+${maxDev}</span>
                    <span class="legend-label-middle">0.000</span>
                    <span class="legend-label-bottom">-${maxDev}</span>
                </div>
            </div>
        `;
        return;
    }
    
    // Bottom maps: component deviation from HDI
    if ((mapType === 'healthindex' || mapType === 'edindex' || mapType === 'incindex') && isShowingSubnational) {
        const range = getSharedComponentDeviationRange();
        const maxDev = range.max.toFixed(3);
        
        const gradientCSS = createGradientCSS('shdi', true); // Use same red-white-green gradient
        
        legendEl.innerHTML = `
            <div class="legend-title">${title} (vs National HDI)</div>
            <div class="legend-gradient-container">
                <div class="legend-gradient" style="background: ${gradientCSS};"></div>
                <div class="legend-labels">
                    <span class="legend-label-top">+${maxDev}</span>
                    <span class="legend-label-middle">0.000</span>
                    <span class="legend-label-bottom">-${maxDev}</span>
                </div>
            </div>
        `;
        return;
    }
    
    // National view: top map shows HDI variance
    if (mapType === 'shdi' && !isShowingSubnational) {
        const range = getHdiVarianceRange();
        const maxVar = range.max.toFixed(4);
        
        // Use white to blue gradient for HDI variance
        const gradientCSS = 'linear-gradient(to top, #ffffff, #0066cc)';
        
        legendEl.innerHTML = `
            <div class="legend-title">${title} Variance</div>
            <div class="legend-gradient-container">
                <div class="legend-gradient" style="background: ${gradientCSS};"></div>
                <div class="legend-labels">
                    <span class="legend-label-top">${maxVar}</span>
                    <span class="legend-label-bottom">0</span>
                </div>
            </div>
        `;
        return;
    }
    
    // National view: bottom maps show bottleneck (white to blue, positive values only)
    if ((mapType === 'healthindex' || mapType === 'edindex' || mapType === 'incindex') && !isShowingSubnational) {
        const range = getSharedBottleneckRange();
        const maxVal = range.max.toFixed(3);
        
        // White to blue gradient: more blue = bigger bottleneck
        const gradientCSS = 'linear-gradient(to top, #ffffff, #0066cc)';
        
        legendEl.innerHTML = `
            <div class="legend-title">${title} Bottleneck</div>
            <div class="legend-gradient-container">
                <div class="legend-gradient" style="background: ${gradientCSS};"></div>
                <div class="legend-labels">
                    <span class="legend-label-top">${maxVal}</span>
                    <span class="legend-label-bottom">0</span>
                </div>
            </div>
        `;
        return;
    }
    
    // Standard legend for national HDI view
    let minVal, maxVal;
    if (useRelativeScale) {
        // For component indices, use shared range so they're comparable
        if (mapType === 'healthindex' || mapType === 'edindex' || mapType === 'incindex') {
            const range = getSharedComponentRange();
            minVal = range.min.toFixed(3);
            maxVal = range.max.toFixed(3);
        } else {
            const range = getValueRange(mapType);
            minVal = range.min.toFixed(3);
            maxVal = range.max.toFixed(3);
        }
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

// Values map types for the Values Visualization
const valuesMapTypes = [
    {id: 'map-values-top', type: 'shdi', legendId: 'legend-values-top', title: 'HDI'},
    {id: 'map-values-bottom-1', type: 'healthindex', legendId: 'legend-values-bottom-1', title: 'Health'},
    {id: 'map-values-bottom-2', type: 'edindex', legendId: 'legend-values-bottom-2', title: 'Education'},
    {id: 'map-values-bottom-3', type: 'incindex', legendId: 'legend-values-bottom-3', title: 'Income'}
];

function updateValuesLegends() {
    valuesMapTypes.forEach(({type, legendId, title}) => {
        updateValuesLegend(type, legendId, title);
    });
}

// Update legend for Values Visualization (simple value gradient)
function updateValuesLegend(mapType, legendId, title) {
    const legendEl = document.getElementById(legendId);
    if (!legendEl) return;
    
    const range = getValueRange(mapType);
    const minVal = range.min.toFixed(3);
    const maxVal = range.max.toFixed(3);
    
    // For HDI (top map), use white-to-green instead of default gradient
    let gradientCSS;
    if (mapType === 'shdi') {
        gradientCSS = 'linear-gradient(to top, #ffffff, #00aa44)';
    } else {
        gradientCSS = createGradientCSS(mapType, false);
    }
    
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
// (switchVisualization removed - single visualization mode only)

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

// Function to update values visualization maps (shows raw values, no deviations)
function updateValuesMaps() {
    if (!geojsonData) return;
    
    valuesMaps.forEach((map, index) => {
        if (!map || !map.initialized) return;
        
        const mapType = index === 0 ? 'shdi' : 
                       index === 1 ? 'healthindex' : 
                       index === 2 ? 'edindex' : 'incindex';
        
        // Use a special update mode for values visualization
        map.updateValues(mapType);
    });
    
    updateValuesLegends();
}

// ==================== INTERACTION FUNCTIONS ====================

// Function to select a region
function selectRegion(gdlcode) {
    selectedGdlcode = gdlcode;
    // Ensure we know which country this region belongs to
    selectedCountryIso = null;
    if (geojsonDataRegions && Array.isArray(geojsonDataRegions.features)) {
        const f = geojsonDataRegions.features.find(ff => ff.properties && ff.properties.gdlcode === gdlcode);
        if (f && f.properties && f.properties.iso_code) selectedCountryIso = String(f.properties.iso_code).toUpperCase();
    }
    // Keep world as the base dataset but overlay regional features for the selected country
    geojsonData = geojsonDataWorld;
    if (selectedCountryIso) {
        const feats = geojsonDataRegions.features.filter(ff => ff.properties && String(ff.properties.iso_code).toUpperCase() === selectedCountryIso);
        overlayRegionFeatures = feats;
    } else {
        overlayRegionFeatures = null;
    }
    if (currentVizMode === 'components') {
        updateMaps();
    } else if (currentVizMode === 'values') {
        updateValuesMaps();
    }
    updateChart();
}

// Select a country by ISO3 code: show national horizon and display regional SHDI inside country
function selectCountry(iso3) {
    if (!iso3) return;
    selectedCountryIso = String(iso3).toUpperCase();
    selectedGdlcode = null;
    // Keep world as the base dataset and set overlayRegionFeatures to regional features for this country (if available)
    geojsonData = geojsonDataWorld;
    if (geojsonDataRegions) {
        const feats = geojsonDataRegions.features.filter(f => f.properties && String(f.properties.iso_code).toUpperCase() === selectedCountryIso);
        overlayRegionFeatures = feats.length > 0 ? feats : null;
    } else {
        overlayRegionFeatures = null;
    }

    // Update maps and legends
    if (currentVizMode === 'components') {
        updateMaps();
    } else if (currentVizMode === 'values') {
        updateValuesMaps();
    }

    // Update chart to show national HDI time series
    updateChart();
}

// ==================== CHART FUNCTIONS ====================

// Function to update chart data (when chart already exists)
function updateChartData() {
    if (!chart) return;

    let data = null;
    if (selectedGdlcode && timeSeries[selectedGdlcode]) {
        data = timeSeries[selectedGdlcode];
    } else if (selectedCountryIso && nationalTimeSeries[selectedCountryIso]) {
        data = nationalTimeSeries[selectedCountryIso];
    } else {
        return;
    }
    
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
    
    // Create a single bar dataset where each bar is colored by its bottleneck
    const backgroundColors = bottleneckColors.map(color => {
        const hex = (color || COMPONENT_COLORS.missing).replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, 0.2)`;
    });
    
    const backgroundDatasets = [{
        label: '',
        data: new Array(data.years.length).fill(1.0),
        backgroundColor: backgroundColors,
        borderWidth: 0,
        barPercentage: 1.0,
        categoryPercentage: 1.0,
        order: 0,
        type: 'bar'
    }];
    
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
    
    // Recalculate Y-axis bounds based on new data
    const allValues = [...shdiData, ...healthData, ...edData, ...incData]
        .filter(v => v !== null && v !== undefined && !isNaN(v));
    if (allValues.length > 0) {
        const minVal = Math.min(...allValues);
        const maxVal = Math.max(...allValues);
        const range = maxVal - minVal;
        const padding = Math.max(0.02, range * 0.1); // At least 0.02 or 10% of range
        chart.options.scales.y.min = Math.max(0, Math.floor((minVal - padding) * 20) / 20);
        chart.options.scales.y.max = Math.min(1, Math.ceil((maxVal + padding) * 20) / 20);
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
    // Determine whether a region or a country is selected and pick the appropriate timeseries
    let data = null;
    let isNational = false;

    if (selectedGdlcode && timeSeries[selectedGdlcode]) {
        data = timeSeries[selectedGdlcode];
    } else if (selectedCountryIso && nationalTimeSeries[selectedCountryIso]) {
        data = nationalTimeSeries[selectedCountryIso];
        isNational = true;
    }

    if (!data || !data.years || data.years.length === 0) {
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
    
    // Populate header info: for national selection show country name
    if (isNational) {
        document.getElementById('region-name').textContent = data.country || selectedCountryIso;
        document.getElementById('region-country').textContent = '';
    } else {
    document.getElementById('region-name').textContent = data.region || 'Unknown';
    document.getElementById('region-country').textContent = data.country || 'Unknown';
    }
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
    
    // Create a single bar dataset where each bar is colored by its bottleneck
    const backgroundColors = bottleneckColors.map(color => {
        const hex = (color || COMPONENT_COLORS.missing).replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, 0.2)`;
    });
    
    const backgroundDatasets = [{
        label: '',
        data: new Array(data.years.length).fill(1.0),
        backgroundColor: backgroundColors,
        borderWidth: 0,
        barPercentage: 1.0,
        categoryPercentage: 1.0,
        order: 0,
        type: 'bar'
    }];
    
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
                        beginAtZero: false,
                        // Dynamic min/max calculated from data with padding
                        min: (() => {
                            const allValues = [...shdiData, ...healthData, ...edData, ...incData]
                                .filter(v => v !== null && v !== undefined && !isNaN(v));
                            if (allValues.length === 0) return 0;
                            const minVal = Math.min(...allValues);
                            const maxVal = Math.max(...allValues);
                            const range = maxVal - minVal;
                            const padding = Math.max(0.02, range * 0.1); // At least 0.02 or 10% of range
                            return Math.max(0, Math.floor((minVal - padding) * 20) / 20); // Round down to nearest 0.05
                        })(),
                        max: (() => {
                            const allValues = [...shdiData, ...healthData, ...edData, ...incData]
                                .filter(v => v !== null && v !== undefined && !isNaN(v));
                            if (allValues.length === 0) return 1;
                            const minVal = Math.min(...allValues);
                            const maxVal = Math.max(...allValues);
                            const range = maxVal - minVal;
                            const padding = Math.max(0.02, range * 0.1); // At least 0.02 or 10% of range
                            return Math.min(1, Math.ceil((maxVal + padding) * 20) / 20); // Round up to nearest 0.05
                        })(),
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
                            color: '#666',
                            // Show year labels every 5 years
                            callback: function(value, index) {
                                const year = this.getLabelForValue(value);
                                return year % 5 === 0 ? year : '';
                            },
                            autoSkip: false
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
    // Determine source rows: regional if a region selected, national if a country selected
    let isNational = false;
    let sourceRows = null;
    let data = null;

    if (selectedGdlcode && timeSeries[selectedGdlcode]) {
        // regional selection
        data = timeSeries[selectedGdlcode];
        if (!rawRegionalCsv) {
            document.getElementById('horizon-chart-container').style.display = 'none';
            return;
        }
        sourceRows = rawRegionalCsv.filter(r => r.gdlcode === selectedGdlcode);
    } else if (selectedCountryIso && nationalTimeSeries[selectedCountryIso]) {
        // national selection
        isNational = true;
        data = nationalTimeSeries[selectedCountryIso];
        if (!rawNationalCsv) {
            document.getElementById('horizon-chart-container').style.display = 'none';
            return;
        }
        sourceRows = rawNationalCsv.filter(r => (r.iso3 || '').toUpperCase() === selectedCountryIso);
    } else {
        document.getElementById('horizon-chart-container').style.display = 'none';
        return;
    }
    
    if (!sourceRows || sourceRows.length === 0) {
        document.getElementById('horizon-chart-container').style.display = 'none';
        return;
    }
    
    document.getElementById('horizon-chart-container').style.display = 'block';
    
    // Clear previous chart
    d3.select("#horizon-chart").selectAll("*").remove();
    d3.select("#horizon-legend").html("");
    
    // Parse rows, keep raw strings and numeric values separately
    const parsed = sourceRows
        .map(r => {
            // Determine year field (regional CSV uses 'year', national CSV uses 'year' too)
            const year = parseInt(r.year ?? r.Year ?? r.YEAR, 10);
            const date = Number.isFinite(year) ? new Date(Date.UTC(year, 0, 1)) : null;
            const obj = { date, raw: {}, num: {} };

            for (const f of horizonFactors) {
                let rawCell = "";
                if (!isNational) {
                    // regional data expected to have direct factor columns
                    rawCell = (r[f] === undefined || r[f] === null) ? "" : String(r[f]);
                } else {
                    // national CSV uses different column names - map them
                    if (f === 'shdi' || f === 'hdi') rawCell = (r.hdi === undefined || r.hdi === null) ? "" : String(r.hdi);
                    else if (f === 'healthindex') rawCell = (r.life_expectancy === undefined || r.life_expectancy === null) ? "" : String(r.life_expectancy);
                    else if (f === 'edindex') rawCell = (r.expec_yr_school === undefined || r.expec_yr_school === null) ? "" : String(r.expec_yr_school);
                    else if (f === 'incindex') rawCell = (r.gross_inc_percap === undefined || r.gross_inc_percap === null) ? "" : String(r.gross_inc_percap);
                    else if (f === 'lifexp') rawCell = (r.life_expectancy === undefined || r.life_expectancy === null) ? "" : String(r.life_expectancy);
                    else if (f === 'esch') rawCell = (r.expec_yr_school === undefined || r.expec_yr_school === null) ? "" : String(r.expec_yr_school);
                    else if (f === 'msch') rawCell = (r.mean_yr_school === undefined || r.mean_yr_school === null) ? "" : String(r.mean_yr_school);
                    else if (f === 'lgnic') rawCell = (r.gross_inc_percap === undefined || r.gross_inc_percap === null) ? "" : String(r.gross_inc_percap);
                    else rawCell = (r[f] === undefined || r[f] === null) ? "" : String(r[f]);
                }

                obj.raw[f] = rawCell;
                const str = String(rawCell).trim();
                const n = str === "" ? NaN : +str.replace(/\u00A0/g, "");
                // For lgnic we want log value when available
                if (f === 'lgnic' && isNational && !isNaN(n) && n > 0) {
                    obj.num[f] = Math.log(n);
                } else {
                obj.num[f] = isNaN(n) ? NaN : n;
            }
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
        .style("font-size", "12px")
        .style("font-family", "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif");
    
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
                    // Format numbers to 3 decimal places
                    const displayVal = (typeof origNum === "number" && !isNaN(origNum)) 
                        ? origNum.toFixed(3) 
                        : (origRaw && String(origRaw).trim() !== "" ? origRaw : "missing");
                    horizonTooltip.style("display", "block").html(`<strong>${series.label}</strong>: ${displayVal}<br/><small>${year}</small>`);
                } else {
                    const rowIndex = dates.findIndex(d => d && d.getUTCFullYear() === year);
                    const rawCell = (rowIndex === -1) ? "" : rawMatrix[series.key][rowIndex];
                    const isMissing = rawCell == null || String(rawCell).trim() === "";
                    // Format raw cell value if it's a number
                    let displayCell = rawCell;
                    if (!isMissing) {
                        const numVal = parseFloat(rawCell);
                        displayCell = (!isNaN(numVal)) ? numVal.toFixed(3) : rawCell;
                    }
                    horizonTooltip.style("display", "block").html(`<strong>${series.label}</strong>: ${isMissing ? "<em>missing</em>" : displayCell}<br/><small>${year}</small>`);
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
            
            // Initialize values maps
            const valuesMapTop = initD3Map('map-values-top', 'shdi', null, null);
            if (valuesMapTop) valuesMaps.push(valuesMapTop);
        
            const valuesMapIds = ['map-values-bottom-1', 'map-values-bottom-2', 'map-values-bottom-3'];
            const valuesMapTypes = ['healthindex', 'edindex', 'incindex'];
            valuesMapIds.forEach((id, index) => {
                const map = initD3Map(id, valuesMapTypes[index], null, null);
                if (map) valuesMaps.push(map);
            });
            
            // Create shared zoom behavior for values maps
            sharedZoomValuesMaps = D3Map.createSharedZoom(valuesMaps);
            
            // Attach shared zoom to all values maps
            valuesMaps.forEach(map => {
                if (map && map.initialized) {
                    map.setZoomBehavior(sharedZoomValuesMaps);
                }
            });
            
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
                    
                    // Apply common projection to all maps (offset handled in zoom behavior)
            maps.forEach(map => {
                        if (map && map.initialized) {
                            map.projection.scale(commonProjection.scale())
                                .translate(commonProjection.translate());
                            map.path.projection(map.projection);
                            // Apply initial offset transform to g element
                            const offsetX = (map.width - referenceWidth) / 2;
                            const offsetY = (map.height - referenceHeight) / 2;
                            map.g.attr('transform', `translate(${offsetX}, ${offsetY})`);
                        }
                    });
                    
                    // Apply common projection to values maps (offset handled in zoom behavior)
                    valuesMaps.forEach(map => {
                        if (map && map.initialized) {
                            map.projection.scale(commonProjection.scale())
                                .translate(commonProjection.translate());
                            map.path.projection(map.projection);
                            // Apply initial offset transform to g element
                            const offsetX = (map.width - referenceWidth) / 2;
                            const offsetY = (map.height - referenceHeight) / 2;
                            map.g.attr('transform', `translate(${offsetX}, ${offsetY})`);
                        }
                    });
                }
            }
            
            // Update all maps after setting common projection
            updateMaps();
            updateValuesMaps();
            
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
                    valuesMaps.forEach(map => {
                        if (map && map.initialized) {
                            map.resize();
                        }
                    });
                    if (currentVizMode === 'components') {
                    updateMaps();
                    } else if (currentVizMode === 'values') {
                        updateValuesMaps();
                    }
                }, 250);
                });
        
        updateMaps();
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
    }
});

// Visualization mode buttons removed - single mode only

