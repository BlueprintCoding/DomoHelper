// content/features/feature-column-search.js
// Magic ETL Column Search Feature
// Allows searching for columns across tiles and highlights where they're created/modified/removed

import createModal from './feature-general-modal.js';

let DH = null;

// Tile type name mapping for human-readable display
const tileTypeNames = {
  "FixedInput": "Fixed Input",
  "LoadFromVault": "Input DataSet",
  "PublishToVault": "Output DataSet",
  "ConcatFields": "Combine Columns",
  "ReplaceString": "Replace Text",
  "SplitColumnAction": "Split Column",
  "StringCalculator": "String Operations",
  "TextFormatting": "Text Formatting",
  "NumericCalculator": "Calculator",
  "DateCalculator": "Date Operations",
  "Constant": "Add Constants",
  "ExpressionEvaluator": "Add Formula",
  "Metadata": "Alter Columns",
  "SetValueField": "Duplicate Column",
  "SchemaAction": "Get Schema",
  "JsonExpandAction": "JSON Expander",
  "Limit": "Limit",
  "MetaSelectAction": "Meta Select",
  "Order": "Order",
  "SelectValues": "Select Columns",
  "ExpressionRowGenerator": "Series",
  "SQL": "SQL",
  "ValueMapper": "Value Mapper",
  "Filter": "Filter Rows",
  "Unique": "Remove Duplicates",
  "SplitFilter": "Split Filter",
  "UnionAll": "Append Rows",
  "MergeJoin": "Join Data",
  "SplitJoin": "Split Join",
  "GroupBy": "Group By",
  "WindowAction": "Rank & Window",
  "NormalizeAll": "Dynamic Unpivot",
  "Denormaliser": "Pivot",
  "Normalizer": "Unpivot",
  "PythonEngineAction": "Python Script",
  "REngineAction": "R Script",
  "MLInferenceAction": "AutoML Inference",
  "Classification": "Classification",
  "Clustering": "Clustering",
  "Forecasting": "Forecasting",
  "MultiVariateOutliers": "Multivariate Outliers",
  "OutlierDetection": "Outlier Detection",
  "Prediction": "Prediction",
  "UnstashAction": "Restore Columns",
  "StashAction": "Select and Store Columns",
  "AIForecasting": "AI Forecasting",
  "ModelInferenceAction": "AI Model Inference"
};

/**
 * Get human-readable tile type name
 */
function getTileDisplayName(tileType) {
  return tileTypeNames[tileType] || tileType;
}

// State management
let graphData = null;
let tileIndex = {}; // Map of tile ID -> tile object
let columnAnalysis = {}; // Map of column name -> list of operations

// Reference to highlighted tile for cleanup
let currentlyHighlightedTile = null;

/**
 * Set up canvas click listener to remove highlight
 */
function setupCanvasClickListener() {
  // Try to find the canvas or graph container
  const findCanvasContainer = () => {
    // Try various Domo canvas selectors
    const selectors = [
      '[class*="canvas"]',
      '[class*="graph"]',
      '[class*="flow"]',
      '.ReactVirtualized__Grid',
      'svg[class*="canvas"]',
      '[data-testid*="canvas"]',
      '[data-testid*="graph"]'
    ];
    
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) return element;
    }
    
    // Try searching for any SVG or large container that's the main canvas
    const largeContainers = document.querySelectorAll('svg, div[style*="width"], div[style*="height"]');
    for (const container of largeContainers) {
      if (container.offsetWidth > 500 && container.offsetHeight > 500) {
        return container;
      }
    }
    
    return document.body; // Fallback to body
  };
  
  const canvas = findCanvasContainer();
  
  // Add click listener to canvas
  canvas.addEventListener('click', (e) => {
    // Don't remove highlight if clicking on a tile result in the side panel
    if (e.target?.closest instanceof Function && e.target.closest('[class*="search-tile"]')) {
      return;
    }
    
    // Don't remove highlight if clicking on the side panel
    if (e.target?.closest instanceof Function && e.target.closest('[class*="panel"]')) {
      return;
    }
    
    // Only remove highlight if there's actually a tile highlighted
    if (currentlyHighlightedTile || document.querySelector('.dh-column-search-highlight')) {
      console.log('[Column Search] Canvas clicked, removing highlight');
      removeHighlight();
    }
  });
  
  console.log('[Column Search] Canvas click listener registered');
}

/**
 * Initialize the feature
 */
function init(ctx) {
  DH = ctx.DH;
  console.log('[Column Search] Feature initialized');
  
  // Optional: Verify we're on the correct page type
  if (ctx.PageDetector && !ctx.PageDetector.isMagicETL()) {
    console.warn('[Column Search] Warning: Feature initialized on non-Magic-ETL page');
  }
  
  console.log('[Column Search] Attempting to fetch initial graph data...');
  
  // Try to fetch graph data early so it's ready (non-critical, silent failure)
  fetchGraphDataAsync().then(data => {
    if (data) {
      console.log('[Column Search] Graph data loaded successfully on init');
      console.log('[Column Search] Found', data.actions?.length || 0, 'tiles');
    }
    // Silent failure on init - data will be fetched on-demand when user searches
  }).catch(() => {
    // Silent catch - initial fetch is non-critical, will retry on search
  });

  // Set up canvas click listener
  setupCanvasClickListener();
  
  // Set up mutation observer to watch for graph changes
  observeGraphChanges();
}

/**
 * Track the dataflow ID for cache validation
 */
let cachedDataflowId = null;

/**
 * Observe for dataflow changes - validate cache based on URL
 */
function observeGraphChanges() {
  // Store the initial dataflow ID
  cachedDataflowId = getDataflowId();
  console.log('[Column Search] Initialized with dataflow ID:', cachedDataflowId);
}

/**
 * Validate cache - clear if dataflow ID changed
 */
function validateCache() {
  const currentId = getDataflowId();
  
  if (currentId !== cachedDataflowId) {
    console.log(`[Column Search] Dataflow changed from ${cachedDataflowId} to ${currentId}`);
    clearGraphCache();
    cachedDataflowId = currentId;
    return false;
  }
  
  return true;
}

/**
 * Clear the cached graph data
 */
function clearGraphCache() {
  graphData = null;
  tileIndex = {};
  columnAnalysis = {};
  console.log('[Column Search] Graph cache cleared');
}

/**
 * Extract the dataflow ID from the current URL
 */
function getDataflowId() {
  const match = window.location.href.match(/\/dataflows\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * Extract the instance name from the current URL (e.g., "bcpequity" from "bcpequity.domo.com")
 */
function getInstance() {
  const match = window.location.host.match(/^([^.]+)\.domo\.com/);
  return match ? match[1] : null;
}

/**
 * Fetch the full dataflow JSON from Domo API
 * This gives us complete information about all tiles and their column references
 */
async function fetchDataflowJSON() {
  // Validate that we're still on the same dataflow
  validateCache();
  
  // Return cached data if still valid for this dataflow
  if (graphData) return graphData;
  
  const dataflowId = getDataflowId();
  const instance = getInstance();
  
  if (!dataflowId || !instance) {
    console.error('[Column Search] Could not extract dataflow ID or instance from URL');
    return null;
  }
  
  const url = `https://${instance}.domo.com/api/dataprocessing/v2/dataflows/${dataflowId}?hydrationState=VISUALIZATION&validationType=SAVE`;
  
  try {
    console.log('[Column Search] Fetching dataflow JSON from API:', url);
    
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        credentials: 'include', // Include session cookies for authentication
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        console.error('[Column Search] API error:', response.status, response.statusText);
        return null;
      }
      
      const data = await response.json();
      console.log('[Column Search] Dataflow JSON retrieved successfully');
      console.log('[Column Search] Found', data.actions?.length || 0, 'tiles');
      
      graphData = data;
      indexTiles();
      return data;
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        console.error('[Column Search] Fetch request timed out after 15 seconds');
      } else {
        console.error('[Column Search] Fetch error:', fetchError);
      }
      return null;
    }
  } catch (error) {
    console.error('[Column Search] Error fetching dataflow JSON:', error);
    return null;
  }
}

/**
 * Index tiles by ID for quick lookup during highlighting
 */
function indexTiles() {
  if (!graphData || !graphData.actions) return;
  
  tileIndex = {};
  graphData.actions.forEach(action => {
    tileIndex[action.id] = action;
  });
  console.log('[Column Search] Indexed', Object.keys(tileIndex).length, 'tiles');
}

/**
 * Get the current graph data from the page
 * This retrieves it via postMessage from the page context where clipboard-helper can access it
 */
function getGraphData() {
  if (graphData) return graphData;
  
  // Return null - we need to fetch async
  return null;
}

/**
 * Fetch graph data asynchronously via postMessage
 * Returns a Promise that resolves with the graph data
 */
async function fetchGraphDataAsync() {
  // Use the API-based fetch instead
  return fetchDataflowJSON();
}
    
/**
 * Analyze tiles for column-related operations
 * Searches through JSON data for column references in each tile
 */
function analyzeColumnsInTiles(columnName, filterPrefs) {
  const results = [];
  
  if (!graphData || !graphData.actions) {
    return results;
  }
  
  // Set default filters if not provided
  const filters = filterPrefs || {
    caseSensitive: false,
    exactMatch: false,
    searchTileNames: false,
    includeSelectColumns: true,
    includeInputOutput: true
  };
  
  // Prepare search term based on filter options
  const searchTerm = filters.caseSensitive ? columnName : columnName.toLowerCase();
  const isExactMatch = filters.exactMatch;
  
  // Helper function to normalize special characters (hyphens, underscores, spaces)
  const normalizeText = (text) => {
    return text.replace(/[-_\s]/g, '');
  };
  
  // Helper function to check if a text matches the search term
  const matchesSearch = (text) => {
    if (!text) return false;
    
    let compareText = filters.caseSensitive ? text : text.toLowerCase();
    let compareTerm = searchTerm;
    
    if (!isExactMatch) {
      // When NOT exact match: normalize special characters (ignore hyphens, underscores, spaces)
      // This allows "Payer_Type_Group" and "Payor Type Group" to match the same search
      compareText = normalizeText(compareText);
      compareTerm = normalizeText(compareTerm);
    }
    
    if (isExactMatch) {
      // Exact match: whole word only
      return compareText === compareTerm;
    } else {
      // Partial match: contains substring (after normalization)
      return compareText.includes(compareTerm);
    }
  };
  
  graphData.actions.forEach(action => {
    // Apply tile type filters
    if (action.type === 'SelectValues' && !filters.includeSelectColumns) {
      console.log('[Column Search] Skipping SelectValues tile (filter disabled):', action.name);
      return; // Skip this tile
    }
    
    if ((action.type === 'LoadFromVault' || action.type === 'Output' || action.type === 'PublishToVault') && !filters.includeInputOutput) {
      console.log('[Column Search] Skipping Input/Output tile (filter disabled):', action.name);
      return; // Skip this tile
    }
    
    // console.log(`[Column Search] Checking tile: ${action.name} (${action.type})`);
    
    const matches = {
      tileId: action.id,
      tileName: action.name || action.type,
      tileType: action.type,
      tileDisplayType: getTileDisplayName(action.type),
      operations: []
    };    
    // Check if tile name matches search term (if enabled)
    if (filters.searchTileNames && action.name && matchesSearch(action.name)) {
      matches.operations.push({
        operation: 'TILE_NAME_MATCH',
        detail: `Tile name: ${action.name}`,
        icon: '🏷️'
      });
    }    
    // Check different tile types for column references
    
    // 1. SelectValues - selects/renames columns
    if (action.type === 'SelectValues') {
      // Check fields array
      const fields = action.fields || action.settings?.fields || [];
      fields.forEach(field => {
        const fieldName = (typeof field === 'string') ? field : (field.name || field);
        if (fieldName && matchesSearch(fieldName)) {
          matches.operations.push({
            operation: 'SELECTS',
            detail: `Column: ${fieldName}`,
            icon: '✓'
          });
        }
      });
    }
    
    // 2. Formula tiles - create new columns
    if (action.type === 'Formula') {
      const outputField = action.settings?.outputField?.name || action.settings?.outputField;
      if (outputField && matchesSearch(outputField)) {
        matches.operations.push({
          operation: 'CREATES',
          detail: `New column: ${outputField}`,
          icon: '➕'
        });
      }
      
      // Check the formula expression for column references
      const sqlExpr = action.settings?.sqlExpression || '';
      if (sqlExpr && matchesSearch(sqlExpr)) {
        matches.operations.push({
          operation: 'USES IN FORMULA',
          detail: `Expression: ${sqlExpr.substring(0, 60)}...`,
          icon: '🔍'
        });
      }
    }
    
    // 3. ExpressionEvaluator - creates calculated columns
    if (action.type === 'ExpressionEvaluator') {
      const expressions = action.expressions || [];
      expressions.forEach(expr => {
        const fieldName = expr.fieldName || '';
        const expression = expr.expression || '';
        
        // Check if the search term matches the field name (column being created)
        if (fieldName && matchesSearch(fieldName)) {
          matches.operations.push({
            operation: 'CREATES',
            detail: `Column: ${fieldName} = ${expression}`,
            icon: '➕'
          });
        }
        // Or if it's referenced in the expression itself
        else if (expression && matchesSearch(expression)) {
          matches.operations.push({
            operation: 'USES IN EXPRESSION',
            detail: `${fieldName} = ${expression}`,
            icon: '🔍'
          });
        }
      });
    }
    
    // 4. FilterRows/Filter - references columns in conditions
    if (action.type === 'FilterRows' || action.type === 'Filter') {
      // Check WHERE clause for old style
      const whereClause = action.settings?.whereClause || '';
      if (whereClause && matchesSearch(whereClause)) {
        matches.operations.push({
          operation: 'FILTERS',
          detail: `Condition: ${whereClause.substring(0, 60)}...`,
          icon: '🔽'
        });
      }
      
      // Check filter list (newer style)
      const filterList = action.filterList || [];
      filterList.forEach(filter => {
        const leftField = filter.leftField || '';
        
        if (leftField && matchesSearch(leftField)) {
          matches.operations.push({
            operation: 'FILTERS',
            detail: `Field: ${leftField}`,
            icon: '🔽'
          });
        }
      });
    }
    
    // 5. Join/MergeJoin tile - uses columns for joining
    if (action.type === 'Join' || action.type === 'MergeJoin') {
      const keys1 = action.keys1 || [];
      const keys2 = action.keys2 || [];
      const joinConditions = action.settings?.joinConditions || [];
      
      [...keys1, ...keys2].forEach(key => {
        if (key && matchesSearch(key)) {
          matches.operations.push({
            operation: 'JOIN KEY',
            detail: `Joins on: ${key}`,
            icon: '🔗'
          });
        }
      });
      
      joinConditions.forEach(condition => {
        const leftCol = condition.leftColumnId || condition.leftColumn || '';
        const rightCol = condition.rightColumnId || condition.rightColumn || '';
        if ((leftCol && matchesSearch(leftCol)) || (rightCol && matchesSearch(rightCol))) {
          matches.operations.push({
            operation: 'JOIN KEY',
            detail: `Joins on: ${leftCol} = ${rightCol}`,
            icon: '🔗'
          });
        }
      });
    }
    
    // 6. Aggregate tile - groups by and aggregates columns
    if (action.type === 'Aggregate') {
      const groupByFields = action.settings?.groupByFields || [];
      groupByFields.forEach(field => {
        if (field && matchesSearch(field)) {
          matches.operations.push({
            operation: 'GROUP BY',
            detail: `Field: ${field}`,
            icon: '📊'
          });
        }
      });
      
      const measures = action.settings?.measures || [];
      measures.forEach(measure => {
        const fieldName = measure.field || measure.name || '';
        if (fieldName && matchesSearch(fieldName)) {
          matches.operations.push({
            operation: 'AGGREGATE VALUE',
            detail: `${measure.aggregation || 'Aggregate'}: ${fieldName}`,
            icon: '📈'
          });
        }
      });
    }
    
    // 7. SQLQuery - references in custom SQL
    if (action.type === 'SQLQuery') {
      const sql = action.settings?.sql || '';
      if (sql && matchesSearch(sql)) {
        matches.operations.push({
          operation: 'SQL REFERENCE',
          detail: 'Referenced in custom SQL',
          icon: '💾'
        });
      }
    }
    
    // 8. Unpivot - transforms column structure
    if (action.type === 'Unpivot') {
      const pivotCol = action.settings?.pivotColumn || '';
      const valueField = action.settings?.valueField || '';
      if (pivotCol && matchesSearch(pivotCol)) {
        matches.operations.push({
          operation: 'UNPIVOT KEY',
          detail: `Pivots: ${pivotCol}`,
          icon: '🔀'
        });
      }
      if (valueField && matchesSearch(valueField)) {
        matches.operations.push({
          operation: 'UNPIVOT VALUE',
          detail: `Values from: ${valueField}`,
          icon: '🔀'
        });
      }
    }
    
    // 9. UnionAll - check schema modification removals
    if (action.type === 'UnionAll') {
      const schemaModifications = action.schemaModification1 || action.schemaModification2 || [];
      schemaModifications.forEach(mod => {
        if (mod.name && matchesSearch(mod.name)) {
          matches.operations.push({
            operation: 'UNION SCHEMA',
            detail: `Column: ${mod.name}`,
            icon: '🔀'
          });
        }
      });
    }
    
    // 10. Output/PublishToVault - final output (only show if column found in transformation chain)
    if (action.type === 'Output' || action.type === 'PublishToVault') {
      const outputName = action.settings?.outputName || action.name || 'Output';
      matches.operations.push({
        operation: 'OUTPUT',
        detail: `Outputs to: ${outputName}`,
        icon: '📤'
      });
    }
    
    // Add to results if any operations found
    if (matches.operations.length > 0) {
      results.push(matches);
    }
  });
  
  return results;
}

/**
 * Search for a column and return matching tiles
 */
async function searchColumn(columnName, filters) {
  if (!columnName.trim()) {
    return { success: false, error: 'Column name cannot be empty' };
  }
  
  // Set default filters if not provided
  const filterPrefs = filters || {
    caseSensitive: false,
    exactMatch: false,
    includeSelectColumns: true,
    includeInputOutput: true
  };
  
  console.log('[Column Search] Search filters:', filterPrefs);
  
  // Fetch graph data if not already loaded
  if (!graphData) {
    console.log('[Column Search] Graph data not cached, fetching...');
    const data = await fetchGraphDataAsync();
    if (!data) {
      return { 
        success: false, 
        error: 'Could not access Magic ETL canvas data. Make sure:\n1. You\'re on the flow canvas (not builder)\n2. The page is fully loaded (wait 2-3 seconds)\n3. Try refreshing the page if it still doesn\'t work' 
      };
    }
  }
  
  if (!graphData || !graphData.actions || graphData.actions.length === 0) {
    return { 
      success: false, 
      error: 'No tiles found in canvas. The graph may still be loading - try again in a moment.' 
    };
  }
  
  const results = analyzeColumnsInTiles(columnName, filterPrefs);
  
  return {
    success: true,
    columnName,
    results,
    count: results.length
  };
}

/**
 * Highlight a tile on the canvas by its ID
 */
function highlightTile(tileId) {
  // Remove previous highlight
  removeHighlight();
  
  // Find the tile element on the canvas
  const tileElement = findTileElement(tileId);
  
  if (!tileElement) {
    console.log(`[Column Search] Could not find tile element for ID: ${tileId}`);
    return false;
  }
  
  // Add highlight styling
  tileElement.classList.add('dh-column-search-highlight');
  
  // Scroll tile into view
  tileElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
  
  // Add pulsing animation
  currentlyHighlightedTile = tileElement;
  
  console.log(`[Column Search] Highlighted tile: ${tileId}`);
  return true;
}

/**
 * Find the DOM element for a tile by its ID
 */
function findTileElement(tileId) {
  // Try various selectors that Domo might use
  const selectors = [
    `[data-tile-id="${tileId}"]`,
    `[data-id="${tileId}"]`,
    `[id*="${tileId}"]`,
    `.tile[data-id="${tileId}"]`,
    `.tile[data-tile-id="${tileId}"]`
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) return element;
  }
  
  // Try to find by examining all tile elements and their data attributes
  const tileElements = document.querySelectorAll('[class*="tile"], [class*="action"], [class*="node"]');
  for (const element of tileElements) {
    // Check various data attributes and properties
    if (element.dataset?.id === tileId || 
        element.dataset?.tileId === tileId ||
        element.getAttribute('data-id') === tileId) {
      return element;
    }
  }
  
  return null;
}

/**
 * Remove highlight from current tile
 */
function removeHighlight() {
  if (currentlyHighlightedTile) {
    currentlyHighlightedTile.classList.remove('dh-column-search-highlight');
    currentlyHighlightedTile = null;
  }
  
  // Also remove from any other elements that might have the class
  document.querySelectorAll('.dh-column-search-highlight').forEach(el => {
    el.classList.remove('dh-column-search-highlight');
  });
}

/**
 * Get statistics about all columns in the graph
 */
function getColumnStatistics() {
  if (!getGraphData()) {
    return { success: false, error: 'Graph data not available' };
  }
  
  const columnStats = {};
  
  graphData.actions.forEach(action => {
    // Extract all columns mentioned in this tile
    const columns = extractColumnsFromTile(action);
    columns.forEach(col => {
      if (!columnStats[col]) {
        columnStats[col] = 0;
      }
      columnStats[col]++;
    });
  });
  
  return {
    success: true,
    statistics: columnStats,
    totalUnique: Object.keys(columnStats).length
  };
}

/**
 * Extract all columns from a single tile
 */
function extractColumnsFromTile(action) {
  const columns = [];
  
  // Add output field if Formula
  if (action.type === 'Formula' && action.settings?.outputField?.name) {
    columns.push(action.settings.outputField.name);
  }
  
  // Add selected fields
  const fields = action.settings?.fields || action.fields || [];
  if (Array.isArray(fields)) {
    fields.forEach(f => {
      const name = f.name || f;
      if (typeof name === 'string') columns.push(name);
    });
  }
  
  // Add columns from filters
  const whereClause = action.settings?.whereClause || '';
  // Parse column names from WHERE clause (simple regex)
  const matches = whereClause.match(/`?([a-zA-Z_][a-zA-Z0-9_]*)`?/g);
  if (matches) {
    matches.forEach(m => columns.push(m.replace(/`/g, '')));
  }
  
  return [...new Set(columns)]; // Remove duplicates
}

// Export search API for side panel communication
window.DHColumnSearch = {
  search: searchColumn,
  highlight: highlightTile,
  removeHighlight: removeHighlight,
  getStats: getColumnStatistics,
  analyzeColumns: analyzeColumnsInTiles
};

/**
 * Cleanup function - called when page type changes or feature is disabled
 */
function cleanup() {
  console.log('[Column Search] Cleaning up...');
  removeHighlight();
  // Note: Canvas click listener is anonymous and added to document.body
  // It will be garbage collected when the page unloads or features are reloaded
}

// Export as ES module
export default {
  init,
  searchColumn,
  highlightTile,
  removeHighlight,
  getColumnStatistics,
  cleanup
};
