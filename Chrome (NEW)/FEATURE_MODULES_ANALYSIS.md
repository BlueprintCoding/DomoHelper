# Feature Modules & Utilities - Complete Analysis

## Overview

There are 9 feature modules, 2 utility files, and 1 debug module. All feature modules use dynamic imports and follow a consistent initialization pattern.

---

## Feature Modules Summary

| Feature | Context | Exports | Dependencies | Page Type |
|---------|---------|---------|--------------|-----------|
| **feature-page-fulltext.js** | PAGE | `{ init, applySettings }` | feature-general-modal.js | PAGE only |
| **feature-page-jump-to.js** | PAGE | `{ init, applySettings }` | None | PAGE only |
| **feature-magic-recipes.js** | MAGIC_ETL | `{ init, insertRecipeData, triggerSaveRecipe }` | feature-general-modal.js | MAGIC_ETL only |
| **feature-graph-menu.js** | MAGIC_ETL | `{ init, applySettings }` | None | MAGIC_ETL only |
| **feature-select-columns-reorder.js** | MAGIC_ETL | `{ init, applySettings }` | select-columns-utils.js | MAGIC_ETL only |
| **feature-select-columns-rename.js** | MAGIC_ETL | `{ init, applySettings }` | select-columns-utils.js | MAGIC_ETL only |
| **feature-column-search.js** | MAGIC_ETL | `{ init, searchColumn, highlightTile, ... }` | None | MAGIC_ETL only |
| **feature-version-notes.js** | MAGIC_ETL + SQL | `{ init, applySettings }` | None | BOTH (special handling) |
| **feature-general-modal.js** | Utility | `createModal, quickConfirm, quickAlert` | None | N/A |

---

## Detailed Feature Analysis

### 1. **feature-page-fulltext.js** 📄
**Purpose:** Display full text of table cells in a modal  
**Context:** Dashboard/Card pages (PAGE)  
**Loads When:** `content-main.js` detects `isPage === true`

**Exports:**
```javascript
export default {
  init: ({ DH, settings }) → {
    // Initialize full-text UI
    // Bind click handlers on table cells
  },
  applySettings: (settings) → {
    // Update modal settings
  }
}
```

**Key Features:**
- Click table cells → Opens modal with full text
- `modifyDataDrillAttributes()` - Disables drill-down links if needed
- `removeInvalidLinks()` - Filters invalid drill data
- Uses `feature-general-modal.js` for modal UI

**Event Handlers:**
- `click` on table cells → triggers modal open
- Uses jQuery for DOM traversal

**State Management:**
```javascript
let isBound = false;           // Track if handlers bound
let settingsState = {...};     // Store user settings
let modalCtl = null;           // Modal instance
```

**No Page Detection** - Assumes correct context from router

---

### 2. **feature-page-jump-to.js** 🔗
**Purpose:** Navigation menu for jumping to sections on page  
**Context:** Dashboard/Card pages (PAGE)  
**Loads When:** `content-main.js` detects `isPage === true`

**Code Size:** ~50 lines (minimal)

**Exports:**
```javascript
export default {
  init: ({ DH }) → {
    // Create navigation menu
    // Bind click handlers
  },
  applySettings: () → {}  // No-op
}
```

**Key Features:**
- "Jump to:" menu in page header
- Click section → scrolls to section
- Uses simple button click listeners

**No Page Detection** - Assumes correct context

---

### 3. **feature-magic-recipes.js** 🧪
**Purpose:** Save/load/insert Magic ETL recipe tiles  
**Context:** Magic ETL canvas (MAGIC_ETL)  
**Loads When:** `content-main.js` detects `isGraph === true`

**Complexity:** ⚠️ HIGHLY COMPLEX (~600 lines)

**Exports:**
```javascript
export default {
  init: ({ DH }) → {
    // Initialize recipe UI
    // Bind copy detection
    // Bind save triggers
  },
  insertRecipeData: (recipeData) → boolean,
  triggerSaveRecipe: () → void
}
```

**Key Features:**
- **Save Modal** - Save custom recipes to local storage
- **List Modal** - View/insert/delete saved recipes
- **Copy Detection** - Monitors user copying tiles
- **Clipboard Monkey-Patch** - Adds clipboard paste capability
- **Dynamic UX** - Scrolls to newly inserted tiles

**Message Handlers:**
```javascript
// In init():
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'SAVE_MAGIC_RECIPE_FROM_PANEL') {
    triggerSaveRecipe();
    sendResponse({ success: true });
  }
  
  if (msg.action === 'INSERT_MAGIC_RECIPE') {
    const result = insertRecipeData(msg.recipeData);
    sendResponse({ success: result });
  }
});
```

**Browser Messaging:**
```javascript
// Sends to background.js:
chrome.runtime.sendMessage({ 
  action: 'magicRecipeCopyDetected' 
}, callback);
```

**Event Handlers:**
- Copy button detection → signals to background
- Recipe insert click → pastes recipe tiles
- Recipe delete click → removes from storage
- List modal open triggers

**State Management:**
```javascript
let saveModalCtl = null;        // Save modal instance
let listModalCtl = null;        // List modal instance
let delegatesBound = false;     // Track if listeners bound
let insertingRecipeNow = false; // Guard paste operations
let suppressOpenUntil = 0;      // Debounce modal open
```

**Storage:**
```javascript
chrome.storage.local.get(['MagicETLRecipes'], callback);
// MagicETLRecipes format:
// {
//   "Recipe Title": {
//     title: string,
//     description: string,
//     recipe: object (ETL JSON),
//     timestamp: ISO string
//   }
// }
```

**No Page Detection** - Assumes MAGIC_ETL context

---

### 4. **feature-graph-menu.js** 📋
**Purpose:** Sidebar menu linking to recipes, navigation, etc.  
**Context:** Magic ETL canvas (MAGIC_ETL)  
**Loads When:** `content-main.js` detects `isGraph === true`

**Complexity:** Medium (~300 lines)

**Exports:**
```javascript
export default {
  init: ({ DH }) → {
    // Create sidebar menu
    // Bind toggle handlers
    // Bind recipe menu items
  },
  applySettings: () → {}  // No-op
}
```

**Key Features:**
- Collapsible menu in sidebar
- Links to Magic Recipes
- Navigation items
- Custom tile info display

**Event Handlers:**
- Toggle expand/collapse
- Menu item clicks

**No Page Detection** - Assumes MAGIC_ETL context

---

### 5. **feature-select-columns-reorder.js** 🔄
**Purpose:** Bulk reorder columns in Select Columns transformation  
**Context:** Magic ETL canvas (MAGIC_ETL)  
**Loads When:** `content-main.js` detects `isGraph === true`  
**Uses:** `select-columns-utils.js`

**Complexity:** High (~700 lines)

**Exports:**
```javascript
export default {
  init: ({ DH }) → {
    // Initialize reorder UI
    // Bind to Select Columns modal
    // Create control buttons
  },
  applySettings: () → {}
}
```

**Key Features:**
- "Sort A→Z" / "Sort Z→A" buttons
- Drag-and-drop reordering
- Column position tracking
- DOM manipulation via shared utils

**Event Handlers:**
- Sort button clicks
- Drag event listeners
- Custom drag monitor

**Dependencies:**
```javascript
const utils = await import(
  chrome.runtime.getURL('content/shared/select-columns-utils.js')
);
```

**UI Injection Pattern:**
- Detects Select Columns modal open
- Injects toolbar buttons
- Observes column list changes

**No Page Detection** - Assumes MAGIC_ETL context

---

### 6. **feature-select-columns-rename.js** ✏️
**Purpose:** Bulk rename/find-replace columns in Select Columns transformation  
**Context:** Magic ETL canvas (MAGIC_ETL)  
**Loads When:** `content-main.js` detects `isGraph === true`  
**Uses:** `select-columns-utils.js`

**Complexity:** Very High (~700 lines)

**Exports:**
```javascript
export default {
  init: ({ DH }) → {
    // Initialize rename UI
    // Bind to Select Columns modal
    // Create control buttons + modal
  },
  applySettings: () → {}
}
```

**Key Features:**
- **Bulk Rename Modal** with multiple strategies:
  - Prefix/suffix addition
  - Find/replace
  - Individual column rename
- **Live Preview** showing before/after
- **Case Sensitivity Toggle**
- **Select All / Deselect All**

**Event Handlers:**
- Prefix/suffix input changes → live preview
- Find/replace toggles → live preview
- Apply button → commits renames
- Control panel buttons

**Modal Architecture:**
- Custom CSS styling
- Scrollable column list
- Controls section
- Preview section

**Dependencies:**
```javascript
const utils = await import(
  chrome.runtime.getURL('content/shared/select-columns-utils.js')
);
```

**No Page Detection** - Assumes MAGIC_ETL context

---

### 7. **feature-column-search.js** 🔍
**Purpose:** Search for columns across Magic ETL tiles  
**Context:** Magic ETL canvas (MAGIC_ETL)  
**Loads When:** `content-main.js` detects `isGraph === true`

**Complexity:** Very High (~800 lines)

**Exports:**
```javascript
export default {
  init: ({ DH }) → {
    // Initialize search feature
    // Set up observers
    // Fetch graph data
  },
  searchColumn: (columnName, filters) → Promise<{...}>,
  highlightTile: (tileId) → boolean,
  removeHighlight: () → void
}
```

**Message Handlers:**
```javascript
// In content-main.js message listener:
if (message.action === 'SEARCH_COLUMN') {
  result = await featureModules.columnSearch.searchColumn(
    message.columnName,
    message.filters
  );
  sendResponse(result);
}

if (message.action === 'HIGHLIGHT_TILE') {
  result = featureModules.columnSearch.highlightTile(message.tileId);
  sendResponse({ success: result });
}
```

**Key Features:**
- **Graph Data Fetching** via API call to `/api/v2/dataflows/{id}/json`
- **Column Analysis** across 10+ tile types:
  - SelectValues, Filter, Join, Aggregate, Formula, etc.
  - Tracks where columns are created/used/removed
- **Filter Options:**
  - Case Sensitive (off by default)
  - Exact Match (off by default)
  - Normalize special characters (hyphens, underscores)
  - Include SelectColumns tiles
  - Include Input/Output tiles
- **Tile Highlighting** with yellow glow + pulse animation
- **Canvas Click Listener** to clear highlight

**Event Handlers:**
- Canvas click → removes highlight
- Tab events → clears search state

**State Management:**
```javascript
let graphData = null;                  // Cached graph JSON
let tileIndex = {};                    // Tile ID → Tile object
let currentlyHighlightedTile = null;   // Currently highlighted element
let cachedDataflowId = null;           // For cache validation
```

**API Integration:**
```javascript
// Fetches: GET /api/v2/dataflows/{dataflowId}/json
// Uses: Authorization headers from Domo Cookie
```

**Complex Matching Logic:**
- Normalizes text (removes `-`, `_`, spaces)
- Case-insensitive by default
- Partial substring matching or exact match
- Recursive tile analysis (10+ operation types)

**Canvas DOM Integration:**
- Observes graph data changes via MutationObserver
- Finds tile elements by data-id attributes
- Applies CSS highlight class
- Auto-scrolls to highlighted tile

---

### 8. **feature-version-notes.js** 📝
**Purpose:** Enforce version notes on ETL modifications  
**Context:** SQL Author + Magic ETL (BOTH)  
**Loads When:** `content-main.js` detects `isAuthor || isGraph`

**Complexity:** Medium (~300 lines)

**Init Signature:**
```javascript
// SPECIAL: Receives page type info
function init({ DH, isAuthor, isGraph, settings }) {
  // Can behave differently based on context
}
```

**Exports:**
```javascript
export default {
  init: ({ DH, isAuthor, isGraph, settings }) → {...},
  applySettings: (settings) → {...}
}
```

**Key Features:**
- Modal appears when saving ETL modifications
- Requires version notes in text field
- Counts words (minimum word requirement)
- Prevents save if notes missing

**Event Handlers:**
- Save modal detection
- Textarea input monitoring
- Word count updates

**Message Posting:**
```javascript
// Word count calculation via postMessage:
window.postMessage({ id: 'word-count-message', text: ... });
```

**Special Handling:**
- Sets different modal behavior for `isAuthor` vs `isGraph`
- Can enforce stricter rules based on context
- Shares settings with other features

**No Page Detection** - Receives context from router

---

### 9. **feature-general-modal.js** 🎯
**Purpose:** Reusable modal creation utility  
**Context:** Shared utility (no page specificity)  
**Used By:** feature-page-fulltext.js, feature-magic-recipes.js

**Exports:**
```javascript
export default function createModal(options) {
  // Create and return modal instance
}

export function quickConfirm({title, message, okLabel, cancelLabel, wide}) {
  // Promise-based confirm dialog
}

export function quickAlert({title, message, label, wide}) {
  // Promise-based alert dialog
}
```

**Modal Instance API:**
```javascript
const modal = createModal({
  title: string,
  body: HTML string,
  wide: boolean,
  buttons: [{
    id: string,
    label: string,
    kind: 'primary' | 'default',
    autofocus: boolean,
    onClick: (event, modalControl) => void
  }]
});

// Methods:
modal.open() → Promise
modal.close() → void
modal.on(event, callback) → void
modal.getElement() → HTMLElement

// Events:
modal.on('open', callback)
modal.on('close', callback)
modal.on('button:id', callback)
```

**Styling:**
- Uses Domo CSS classes for consistency
- Modal backdrop overlay
- Keyboard shortcuts (ESC to close)
- Click-outside to close

**Event Listeners:**
- Button clicks with delegation
- ESC key handler
- Backdrop click handler
- DOM cleanup on close

**No Page Detection** - Pure utility

---

## Shared Utilities

### **select-columns-utils.js** 🛠️

**Purpose:** Shared DOM utilities for Select Columns features  
**Used By:** feature-select-columns-reorder.js, feature-select-columns-rename.js

**Key Functions:**

```javascript
// Detection
isSelectColumnsActive() → boolean
getSelectColumnsColumns() → Array<ColumnObject>

// Column manipulation
getColumnByName(name) → ColumnElement | null
reorderColumns(columnOrder) → boolean
renameColumn(columnName, newName) → boolean

// DOM observation
observeColumnsListChanges(callback) → MutationObserver

// Utilities
findRenameInput() → HTMLInputElement | null
```

**Constants:**
```javascript
const SELECTORS = {
  actionEditor: '[data-testid="ACTION_EDITOR"]',
  selectColumnsContainer: '[data-testid="SELECT_COLUMNS_LIST"]',
  columnField: '[aria-roledescription="sortable"]',
  // ... many more robust selectors
}
```

**Strategy:** Uses data-testid and aria attributes instead of class names (avoids version brittle ness)

**No Page Detection** - Utility module

---

## Debug Module

### **debug-drag-monitor.js** 🐛
**Purpose:** Monitor drag-and-drop operations (development aid)  
**Context:** Debug only (not auto-loaded)  
**Status:** Not formally integrated

**Features:**
- Logs all drag events
- Tracks mouse position
- Velocity calculation
- Visual debugging overlay

**Manually loaded** - Not part of standard flow

---

## Other Test Files

### **test-select-columns-reorder.js** 🧪
**Purpose:** Unit tests for select-columns-reorder feature  
**Status:** Test file (not production code)

---

## Message Flow Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                      INTER-MODULE MESSAGING                      │
└──────────────────────────────────────────────────────────────────┘

Side Panel Functions                                 Content Script
    │                                                      │
    │─ PING ────────────────────────────────────────→  content-main.js
    │                                                    │ returns { pong, columnSearchReady }
    │
    │─ GET_PAGE_TYPE ───────────────────────────────→  content-main.js
    │                                                    │ returns { pageType }
    │
    │─ SEARCH_COLUMN ───────────────────────────────→  content-main.js
    │   ({ columnName, filters })                         │ feature-column-search.js
    │                                                    │ returns { success, results }
    │
    │─ HIGHLIGHT_TILE ──────────────────────────────→  content-main.js
    │   ({ tileId })                                     │ feature-column-search.js
    │
    │─ SAVE_MAGIC_RECIPE_FROM_PANEL ──────────────→  content-main.js
    │                                                    │ feature-magic-recipes.js
    │                                                    │ returns { success }
    │
    │─ INSERT_MAGIC_RECIPE ──────────────────────────→  content-main.js
    │   ({ recipeData })                                 │ feature-magic-recipes.js
    │
    │                                                   Browser Storage
    │                                                      │
Feature Modules ───────────────────────────────────→ chrome.storage.local
(Send)                                               get/set MagicETLRecipes

Canvas Events                                        Feature Modules
    │                                                      │
    └─ dh:request-save-recipe ───────────────────────→ feature-magic-recipes.js
    └─ dh-select-columns-refresh ────────────────────→ feature-select-columns-rename.js
    └─ dh:etlSaveModalDetected ──────────────────────→ feature-version-notes.js

Background.js                                        Feature Modules
    │                                                      │
    └─ magicRecipeCopyDetected ──────────────────────→ Sets storage flag
       (from page context via content script)
```

---

## Common Patterns Across Features

### **1. Initialization Pattern**
```javascript
export default {
  async init({ DH, settings, isAuthor, isGraph }) {
    // Bind event listeners
    // Create DOM elements
    // Initialize state
    // Register message handlers (some features)
  },
  
  applySettings(settings) {
    // Update feature behavior based on settings
  }
}
```

### **2. Modal Management Pattern**
```javascript
let modalCtl = null;

function ensureModal() {
  if (modalCtl) return modalCtl;
  modalCtl = createModal({...});
  modalCtl.on('button:id', handler);
  return modalCtl;
}
```

### **3. Delegate Pattern** (for dynamic content)
```javascript
let handler = null;
let bound = false;

function bind() {
  if (bound) return;
  bound = true;
  handler = (e) => {
    const target = e.target.closest('.specific-selector');
    if (!target) return;
    // Handle event
  };
  document.addEventListener('click', handler);
}

function unbind() {
  if (!bound) return;
  document.removeEventListener('click', handler);
  bound = false;
}
```

### **4. Storage Pattern**
```javascript
chromestorage.local.get(['MagicETLRecipes'], (result) => {
  const data = result.MagicETLRecipes || {};
  // Use data
  chrome.storage.local.set({ MagicETLRecipes: data }, callback);
});
```

### **5. Message Handler Pattern**
```javascript
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'FEATURE_ACTION') {
    try {
      const result = doSomething(msg.data);
      sendResponse({ success: true, result });
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }
    return true; // Keep channel open if async
  }
});
```

---

## Missing Page Detection in Features

✅ **NO page detection in ANY feature module** (by design)
- Router (content-main.js) handles detection
- Features assume correct context
- Possible to load wrong feature by mistake = runtime error
- **Example:** Load feature-page-fulltext on MAGIC_ETL context → breaks

**Improvement:** Features could add defensive checks:
```javascript
function init({ DH, isPage, isGraph }) {
  if (!isPage) {
    console.warn('[Feature] Wrong context! Expected PAGE, got', {isPage, isGraph});
    return; // Don't initialize
  }
  // ... rest of init
}
```

---

## Feature Initialization Order (from content-main.js)

1. **If isPage:**
   - feature-page-fulltext.js
   - feature-page-jump-to.js

2. **If isGraph:**
   - feature-magic-recipes.js
   - feature-graph-menu.js
   - feature-select-columns-reorder.js
   - feature-select-columns-rename.js
   - feature-column-search.js

3. **If isAuthor || isGraph:**
   - feature-version-notes.js

**Order matters:** feature-general-modal.js is imported by features when needed (not pre-loaded)

---

## Potential Issues & Improvements

### **Issues Found:**

1. ❌ **No defensive page type checks in features**
   - If router sends wrong feature to wrong context = silent failure

2. ❌ **Multiple event listeners not cleaned up**
   - Switching pages → listeners accumulate
   - No `cleanup()` export from features
   - content-main.js has `cleanupAll()` but features don't clean their listeners

3. ⚠️  **Mutation Observers** in features + content-main
   - Could have multiple observers watching DOM
   - Performance concern if many tabs open

4. ⚠️  **Global state** (e.g., `delegatesBound`, `modalCtl`)
   - Can conflict if feature loaded multiple times
   - No reset mechanism between page switches

5. ❌ **select-columns-utils** uses class selectors
   - Comment says "avoids version-specific class suffixes"
   - But still uses many `[class*="..."]` selectors
   - Could benefit from more data-testid reliance

### **Improvements Needed:**

- [ ] Add defensive page type checks in features
- [ ] Export `cleanup()` from each feature
- [ ] Call feature.cleanup() before unloading in content-main.js
- [ ] Consolidate MutationObservers
- [ ] Reset global state between page switches
- [ ] Add context validation in init()

