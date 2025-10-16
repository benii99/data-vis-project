# HDI Explorer - Changelog

## Version 1.1 - Dashboard Redesign (October 6, 2025)

### Major Changes

#### **Layout Restructure**
- **Map is now the main focus** - Takes up 70% of the screen width
- **Left Sidebar (30%)** - Visualization controls and filters
- **Right Panel (30%)** - Country details panel (appears when country is selected)
- Map height increased to 650px for better visibility

#### **Map Improvements**

**1. Time Range Integration**
- Map now displays **average values** over the selected year range (not just current year)
- Year slider moved from sidebar to **directly under the map** for better UX
- Real-time calculation of averages for HDI, Health, Education, and Income indices

**2. Enhanced Color Scaling**
- Fixed color legend to show **more contrast** between different values
- Color scale now adjusts to actual data min/max values with padding
- Example: 0.7 and 0.9 now have clearly distinguishable colors
- Formula: `color_range = (data_min - 10%, data_max + 10%)`

**3. Statistics Display**
- Three metrics shown above the map:
  - Global Average for selected period
  - Filtered Average (with delta from global)
  - Number of countries displayed

#### **Right Panel - Country Details**

**New interactive country detail panel showing:**

1. **Country Header**
   - Country name
   - HDI Category
   - Selected time period

2. **HDI Components Display**
   - Health Index (red)
   - Education Index (blue)  
   - Income Index (green)
   - Each with value, progress bar, and color coding

3. **Overall HDI Score**
   - Large display of HDI value
   - Time period reference

4. **Bottleneck Analysis**
   - Highlights the weakest component
   - Shows bottleneck value
   - Provides improvement suggestion

5. **Component Comparison Chart**
   - Bar chart comparing the three indices
   - Visual reference line for HDI value

#### **Left Sidebar - Simplified Controls**

**Visualization Section:**
- Radio buttons to select metric (HDI, Health, Education, Income)
- Clear visual hierarchy

**Filters Section:**
- HDI Category filter
- Region filter
- Bottleneck Component filter
- Country count display

#### **Technical Improvements**

**1. Dynamic Average Calculation**
```python
# For each metric and year range:
- Extracts time series data for selected years
- Calculates mean across years for each country
- Normalizes to index values (0-1 scale)
- Applies to map visualization
```

**2. Metric-Specific Calculations**
- **HDI**: Direct average from time series
- **Health Index**: `(Life_Expectancy - 20) / 65`
- **Education Index**: `(Mean_Schooling/18 + Expected_Schooling/18) / 2`
- **Income Index**: `(ln(GNI) - ln(100)) / (ln(75000) - ln(100))`

**3. Better Color Distribution**
```python
# Calculates dynamic color range based on actual data
data_min = valid_values.min()
data_max = valid_values.max()
value_range = data_max - data_min

color_min = max(0, data_min - value_range * 0.1)
color_max = min(1, data_max + value_range * 0.1)
```

**4. Session State Management**
- Added session state for selected country
- Enables persistent selection across re-renders

### User Experience Improvements

#### Before:
- Sidebar cluttered with all controls
- Map showed only 2021 data
- Colors too similar for different values
- Year slider placement was confusing
- No way to view country details

#### After:
- Clean, focused layout with map as centerpiece
- Year slider logically placed under the map
- Map shows averages for selected time period
- Much better color contrast (0.7 vs 0.9 clearly different)
- Rich country detail panel on the right
- Easy country selection via dropdown
- Real-time statistics update

### How to Use

1. **Select what to visualize** (left sidebar)
   - Choose HDI or component indices

2. **Apply filters** (left sidebar)
   - Filter by category, region, or bottleneck

3. **Adjust time range** (under map)
   - Drag slider to select years
   - Map updates to show averages

4. **View country details** (right panel)
   - Select country from dropdown
   - See all component values
   - Identify bottlenecks

