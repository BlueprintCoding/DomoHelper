# Magic ETL Column Search Feature - Implementation Guide

## Overview

A new **Column Search** feature has been added to the DomoHelper Chrome extension. This feature allows you to search for columns across all tiles in a Magic ETL canvas and see exactly where they're created, modified, renamed, filtered, aggregated, and more.

## How It Works

### UI Location
- **Tab**: "Search" tab in the side panel (appears when you open a Magic ETL canvas)
- **Availability**: Only appears on Magic ETL graph pages (`domo.com/datacenter/dataflows/*/graph`)

### Search Process

1. **Enter Column Name**: Type the column name you want to find in the search input
2. **Click Search** or press **Enter**: The system searches through all tiles
3. **View Results**: See a list of tiles that reference the column, organized by tile name and type
4. **Click Tile**: Click on any result to highlight that tile on the canvas with a pulsing blue glow

### Search Capabilities

The feature detects columns across these tile types:

| Tile Type | Detects |
|-----------|---------|
| **Formula** | Creates new columns, uses columns in expressions |
| **SelectValues** | Selects columns, renames columns |
| **FilterRows** | Uses columns in WHERE clauses |
| **Join** | Uses columns as join keys |
| **Aggregate** | Groups by columns, aggregates columns |
| **SQLQuery** | References in custom SQL |
| **Unpivot** | Unpivots specified columns |
| **LoadFromVault** | Input datasets (source) |
| **Output** | Output datasets (sink) |

### Operation Icons

- **➕ CREATES** - Tile creates this column
- **🔍 USES** - Tile uses column in calculations
- **✓ SELECTS** - Tile selects this column
- **🔄 RENAMED FROM/TO** - Column is renamed
- **⚙️ FILTERS BY** - Column used in filter condition
- **🔗 JOIN KEY** - Column is a join key
- **📊 GROUPS BY** - Column is aggregated/grouped
- **📈 AGGREGATES** - Column has aggregation applied
- **💾 USES IN SQL** - Referenced in SQL query
- **🔀 UNPIVOTS** - Column is unpivoted
- **📥 SOURCE** - Input dataset
- **📤 OUTPUT** - Output dataset

## Files Modified/Created

### New Files
1. **`content/features/feature-column-search.js`** (New)
   - Main feature logic
   - Tile analysis and column extraction
   - Canvas highlighting functionality

### Modified Files
1. **`side_panel.html`**
   - Added "Search" tab to navigation
   - Added search UI section with input, button, and results display
   - Added styling for search results and tile items

2. **`side_panel.js`**
   - Added `initializeColumnSearch()` function
   - Added `performColumnSearch()` function
   - Added `displaySearchResults()` function
   - Added `highlightTileOnCanvas()` function
   - Added helper functions for status display and results management

3. **`content/content-main.js`**
   - Added `columnSearch` to feature modules
   - Added feature loading for graph pages
   - Added message handlers for `SEARCH_COLUMN` and `HIGHLIGHT_TILE`
   - Added cleanup for column search highlighting

4. **`css/dh-graph-style.css`**
   - Added `.dh-column-search-highlight` class for tile highlighting
   - Added `@keyframes dh-highlight-pulse` animation

## Technical Architecture

### Component Flow

```
Side Panel (UI)
    ↓
search input → performColumnSearch()
    ↓
chrome.tabs.sendMessage(SEARCH_COLUMN)
    ↓
Content Script (Message Handler)
    ↓
feature-column-search.searchColumn()
    ↓
Response with results
    ↓
Side Panel displays results
    ↓
Click tile → showMessage(HIGHLIGHT_TILE)
    ↓
feature-column-search.highlightTile()
    ↓
Canvas tile highlighted
```

### Key Functions

**In `feature-column-search.js`:**
- `searchColumn(columnName)` - Searches all tiles for column references
- `highlightTile(tileId)` - Highlights a tile on the canvas
- `removeHighlight()` - Removes highlighting
- `analyzeColumnsInTiles(columnName)` - Performs detailed analysis

**In `side_panel.js`:**
- `initializeColumnSearch()` - Sets up the feature UI
- `performColumnSearch()` - Handles search button/enter key
- `displaySearchResults(response)` - Renders results
- `highlightTileOnCanvas(tileId, element)` - Sends highlight message

### Message Protocol

**From Side Panel to Content Script:**
```javascript
{
  action: 'SEARCH_COLUMN',
  columnName: 'column_name'
}

{
  action: 'HIGHLIGHT_TILE',
  tileId: 'tile_id'
}
```

**Response from Content Script:**
```javascript
{
  success: true,
  columnName: 'column_name',
  results: [
    {
      tileId: 'tile-id',
      tileName: 'Tile Display Name',
      tileType: 'FormulaType',
      operations: [
        {
          operation: 'OPERATION_TYPE',
          detail: 'Description',
          icon: '📊'
        }
      ]
    }
  ],
  count: 1
}
```

## Usage Examples

### Example 1: Finding Where a Column is Used
1. Open a Magic ETL canvas
2. Go to the "Search" tab
3. Search for "customer_id"
4. See all tiles that reference `customer_id`
5. Click on a result to highlight that tile on the canvas

### Example 2: Tracking Column Transformations
1. Search for "revenue"
2. Results show:
   - LoadFromVault → SOURCE
   - Formula with "REVENUE_ADJUSTED" → USES revenue, CREATES revenue_adjusted
   - Aggregate → AGGREGATES revenue_adjusted
   - Output → Outputs to dataset

### Example 3: Finding Rename Operations
1. Search for "OrderDate"
2. Results include:
   - SelectValues → RENAMED FROM OrderDate → order_date
3. Subsequent tiles reference "order_date"

## Limitations & Notes

1. **Tile Element Detection**: The feature attempts to locate tiles on the canvas using various selectors. If Domo's HTML structure changes significantly, tile highlighting may not work until selectors are updated.

2. **Graph Data Availability**: The feature requires access to the graph's tile/action data structure. This is typically available through the page's JavaScript context but depends on Domo's implementation.

3. **Search is Case-Insensitive**: Searches are performed with lowercase comparison for better results.

4. **Highlight Duration**: The highlight effect uses a CSS animation that pulses continuously until removed. Close the side panel or search for a different column to clear it.

5. **Dynamic Tile Discovery**: If tiles are added/removed while the panel is open, the feature will automatically refresh its cache on the next search.

## Styling

### Highlight Animation
- **Duration**: 1.5 seconds per cycle
- **Effect**: Blue glow with pulsing opacity
- **Color**: `rgba(74, 144, 226, 0.8)`
- **Shadow**: Drop-shadow effect from 8px to 16px radius

### Result Item Styling
- **Hover Effect**: Border color changes to primary blue, slight translation
- **Active State**: Primary color border with inset shadow
- **Responsive**: Colors match the dark theme of the extension

## Future Enhancements

Possible improvements:
1. **Graph Traversal**: Follow column lineage backwards/forwards through the ETL
2. **Statistical Analysis**: Show column count across all tiles
3. **Datatype Tracking**: Show how datatypes change through transformations
4. **Dependency Visualization**: Visual diagram of column dependencies
5. **Export Results**: Save column analysis to file
6. **Batch Highlighting**: Highlight multiple related tiles at once
