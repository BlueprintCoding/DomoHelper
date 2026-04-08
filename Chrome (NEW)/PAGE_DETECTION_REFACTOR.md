# Page/Tab Detection Refactoring Plan

## Problem Statement
Page type detection is currently duplicated across multiple files and executed multiple times:
- **content.js** - Lines 270-272, 381-383
- **content/content-main.js** - Lines 112-114, 348-350  
- **side_panel.js** - Line 305
- **background.js** - Implied in tab change handlers

This causes:
- Multiple "Domo Helper - Non-Relevant Page" logs
- Redundant cleanup calls
- Inconsistent detection logic across modules
- Difficult to maintain consistent detection patterns

---

## Detection Points (Current State)

### 1. **content.js** (Global Content Script)
```javascript
// Line 270-272: Initial detection
let isPage = url.includes('/page/');
let isGraph = url.endsWith('graph');
let isAuthor = url.includes('author');

// Line 381-383: Re-detection on URL change
isPage = currentUrl.includes('/page/');
isGraph = currentUrl.endsWith('graph');
isAuthor = currentUrl.includes('author');
```
**Calls:**
- Line 393-399: Logs page type detection result
- Line 405: Conditional feature injection
- Line 415: Feature initialization for pages
- Line 547: Feature initialization for graphs
- Line 981-985: Modal handling conditional logic
- Line 1019-1021: Author context detection
- Line 1050: Page-specific cleanup

**Status:** ❌ DUPLICATE - Replicated in content-main.js

---

### 2. **content/content-main.js** (Feature Module Router)
```javascript
// Line 112-114: Initial detection (DUPLICATE)
let isPage = url.includes('/page/');
let isGraph = url.endsWith('graph');
let isAuthor = url.includes('author');

// Line 348-350: Re-detection on URL change (DUPLICATE)
isPage = url.includes('/page/');
isGraph = url.endsWith('graph');
isAuthor = url.includes('author');
```
**Calls:**
- Line 152: Load page features conditionally
- Line 170: Load graph features conditionally
- Line 202: Load version notes conditionally
- Line 204: Pass isAuthor/isGraph to features
- Line 373: Cleanup conditional

**Status:** ❌ DUPLICATE - This is the active path, content.js is legacy

---

### 3. **side_panel.js** (Persistent UI Panel)
```javascript
// Line 305: URL-based Magic ETL detection
const isMagicETL = currentUrl && currentUrl.endsWith('graph');
```
**Calls:**
- Line 317-318: Initialize features conditionally
- Line 325: Fallback PING verification if URL detection fails
- Line 86-96: Tab activation handler with re-detection
- Line 99-113: URL change handler with re-detection

**Status:** ⚠️ INCOMPLETE - Only checks for graph, no page/author detection

---

### 4. **background.js** (Service Worker - Not Yet Reviewed)
```javascript
// Implied: Tab injection, activation handling
// Likely calls multiple onActivated/onUpdated listeners
```
**Probable Calls:**
- Injects content scripts
- Triggers re-detection on tab changes

**Status:** ⚠️ NEEDS AUDIT

---

## Detection Rule Definitions

### URL Patterns
| Page Type | Pattern | Method |
|-----------|---------|--------|
| **Page** | Contains `/page/` | `.includes('/page/')` |
| **MagicETL (Graph)** | Ends with `graph` | `.endsWith('graph')` |
| **SQL Author** | Contains `author` | `.includes('author')` |

---

## All Files Requiring Changes

### CORE REFACTORING (Must Do)
| File | Type | Change | Priority |
|------|------|--------|----------|
| **content/modules/page-detector.js** | CREATE | New unified detection module | 🔴 P1 |
| **content/content-main.js** | UPDATE | Remove duplicate detection, import PageDetector, add GET_PAGE_TYPE handler | 🔴 P1 |
| **side_panel.js** | UPDATE | Remove URL detection, use GET_PAGE_TYPE message, fix PING logic | 🔴 P1 |

### CLEANUP (Must Do)
| File | Type | Change | Priority |
|------|------|--------|----------|
| **content.js** | ❌ DELETE | Legacy duplicate of content-main.js | 🔴 P1 |
| **popup.js** | ❌ DELETE | Deprecated - features migrated to side_panel | 🔴 P1 |
| **manifest.json** | UPDATE | Remove references to deleted files | 🔴 P1 |

### DEFENSIVE CHECKS (Should Do)
| File | Type | Change | Priority |
|------|------|--------|----------|
| **content/features/feature-column-search.js** | UPDATE | Add page type validation, add cleanup() function | 🟡 P2 |
| **content/features/feature-magic-recipes.js** | UPDATE | Add page type validation, add cleanup() function, reset global state | 🟡 P2 |
| **content/features/feature-select-columns-rename.js** | UPDATE | Add page type validation, add cleanup() function | 🟡 P2 |
| **content/features/feature-select-columns-reorder.js** | UPDATE | Add page type validation, add cleanup() function | 🟡 P2 |
| **content/features/feature-version-notes.js** | UPDATE | Ensure page type handling consistent with other features | 🟡 P2 |
| **content/features/feature-general-modal.js** | REVIEW | No changes needed - utility module | 🟢 P3 |
| **content/features/feature-graph-menu.js** | UPDATE | Add page type validation, add cleanup() function | 🟡 P2 |
| **content/features/feature-page-fulltext.js** | UPDATE | Add page type validation, add cleanup() function | 🟡 P2 |
| **content/features/feature-page-jump-to.js** | UPDATE | Add page type validation, add cleanup() function | 🟡 P2 |
| **content/shared/select-columns-utils.js** | REVIEW | Optional: improve selector brittleness (current selectors work) | 🟢 P3 |

### AUDIT/REVIEW (Should Do)
| File | Type | Change | Priority |
|------|------|--------|----------|
| **background.js** | AUDIT | Review tab change handlers, ensure no duplicate detection | 🟡 P2 |
| **debug-drag-monitor.js** | REVIEW | Check for page type dependencies | 🟢 P3 |

**Summary:**
- **3 CORE files:** Create/Update core detection
- **3 CLEANUP files:** Delete legacy + update manifest
- **9 FEATURE files:** Add defensive checks + cleanup functions
- **2 REVIEW files:** Audit for consistency

---

## Refactoring Plan

### Phase 1: Create Unified Page Detector Module

**New File:** `content/modules/page-detector.js`

```javascript
/**
 * Unified page/tab detection module
 * Single source of truth for determining page type
 */

const PageDetector = {
  // === STATE ===
  currentUrl: window.location.href,
  cachedPageType: null,
  
  // === PAGE TYPE CONSTANTS ===
  PAGE_TYPES: {
    UNKNOWN: 'UNKNOWN',
    PAGE: 'PAGE',           // Dashboard/card pages
    MAGIC_ETL: 'MAGIC_ETL', // Magic ETL canvas
    SQL_AUTHOR: 'SQL_AUTHOR' // SQL query author
  },
  
  // === DETECTION LOGIC ===
  detectPageType(url = window.location.href) {
    const urlStr = url.toLowerCase();
    
    // Check in priority order
    if (urlStr.includes('/page/')) return this.PAGE_TYPES.PAGE;
    if (urlStr.endsWith('graph')) return this.PAGE_TYPES.MAGIC_ETL;
    if (urlStr.includes('author')) return this.PAGE_TYPES.SQL_AUTHOR;
    
    return this.PAGE_TYPES.UNKNOWN;
  },
  
  // === PUBLIC API ===
  getPageType() {
    return this.detectPageType(window.location.href);
  },
  
  isPage() {
    return this.getPageType() === this.PAGE_TYPES.PAGE;
  },
  
  isMagicETL() {
    return this.getPageType() === this.PAGE_TYPES.MAGIC_ETL;
  },
  
  isSQLAuthor() {
    return this.getPageType() === this.PAGE_TYPES.SQL_AUTHOR;
  },
  
  isRelevant() {
    return this.getPageType() !== this.PAGE_TYPES.UNKNOWN;
  },
  
  // === URL CHANGE DETECTION ===
  startUrlMonitoring(onChangeCallback) {
    let previousUrl = window.location.href;
    
    const observer = new MutationObserver(() => {
      const currentUrl = window.location.href;
      if (currentUrl !== previousUrl) {
        previousUrl = currentUrl;
        const newPageType = this.detectPageType(currentUrl);
        onChangeCallback(newPageType, previousUrl);
      }
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
    return observer;
  },
  
  // === DEBUGGING ===
  describe() {
    return {
      url: window.location.href,
      pageType: this.getPageType(),
      isPage: this.isPage(),
      isMagicETL: this.isMagicETL(),
      isSQLAuthor: this.isSQLAuthor(),
      isRelevant: this.isRelevant()
    };
  }
};
```

---

### Phase 2: Update content-main.js

**Remove:** Lines 112-114 (initial detection)
**Remove:** Lines 348-350 (re-detection)
**Remove:** Line 353-355 (cleanup conditional based on detection)

**Replace with:**
```javascript
import PageDetector from './modules/page-detector.js';

// Detection now done via module
const pageType = PageDetector.getPageType();

// Conditionals change from:
// if (isPage) { ... }
// To:
// if (pageType === PageDetector.PAGE_TYPES.PAGE) { ... }
// Or simply:
// if (PageDetector.isPage()) { ... }

// URL change detection:
PageDetector.startUrlMonitoring((newPageType, previousUrl) => {
  console.log(`[Content Main] Page type changed: ${previousUrl} -> ${newPageType}`);
  
  // Cleanup logic
  if (newPageType === PageDetector.PAGE_TYPES.UNKNOWN) {
    cleanupAllFeatures();
  }
  
  // Re-initialize features
  loadFeaturesForPage();
});
```

---

### Phase 3: Update side_panel.js

**Remove:** Line 305 (URL-based detection)
**Remove:** Lines 325-380 (attemptPingVerification fallback - use detector instead)

**Replace with:**
```javascript
// For side_panel, use PING to ask content script for page type
// Call new API:
function getPageTypeFromContentScript() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs.length === 0) return resolve(null);
      
      chrome.tabs.sendMessage(tabs[0].id, { action: 'GET_PAGE_TYPE' }, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
        } else if (response?.pageType) {
          resolve(response.pageType);
        }
      });
    });
  });
}

// In initializeContextFeatures:
const pageType = await getPageTypeFromContentScript();
if (pageType === 'MAGIC_ETL') {
  initializeColumnSearch();
  initializeMagicRecipes();
}
```

---

### Phase 4: Update content.js (Legacy)

**Option A (Recommended):** Delete entirely if not used
**Option B:** Make it delegate to page-detector.js for consistency

---

---

## Implementation Steps (To-Do List)

### PHASE 1: CORE REFACTORING 

#### Step 1.1: Create PageDetector Module
- [ ] Create file: `content/modules/page-detector.js`
- [ ] Implement `detectPageType(url)` logic
- [ ] Implement `getPageType()`, `isPage()`, `isMagicETL()`, `isSQLAuthor()` methods
- [ ] Implement `startUrlMonitoring(callback)` for URL changes
- [ ] Implement `describe()` for debugging
- [ ] **Test:** Verify module loads without errors
- [ ] **Verify:** `npm run test` passes (if applicable) or manual console verification

#### Step 1.2: Update content/content-main.js
- [ ] Add import: `import PageDetector from './modules/page-detector.js';`
- [ ] Remove lines 112-114 (initial `isPage`, `isGraph`, `isAuthor` detection)
- [ ] Remove lines 348-350 (re-detection on URL change)
- [ ] Remove lines 353-355 (cleanup conditional)
- [ ] **Update feature loading (lines 152-208):**
  - Replace `if (isPage)` with `if (PageDetector.isPage())`
  - Replace `if (isGraph)` with `if (PageDetector.isMagicETL())`
  - Replace `isAuthor` references with `PageDetector.isSQLAuthor()`
- [ ] **Add GET_PAGE_TYPE message handler:**
  ```javascript
  if (message.action === 'GET_PAGE_TYPE') {
    const pageType = PageDetector.getPageType();
    sendResponse({ pageType, description: PageDetector.describe() });
    return true;
  }
  ```
- [ ] **Replace URL change detection (around line 348):** Use `PageDetector.startUrlMonitoring(callback)`
- [ ] **Remove console logs:** "Non-Relevant Page" message (if applicable)
- [ ] **Test:** Load each page type (PAGE, MAGIC_ETL, SQL_AUTHOR)
- [ ] **Verify:** No "Non-Relevant Page" logs on multiple injections

#### Step 1.3: Update side_panel.js  
- [ ] Remove line 305 (magic ETL URL check: `const isMagicETL = currentUrl && currentUrl.endsWith('graph');`)
- [ ] Remove lines 325-380 (old `attemptPingVerification()` function)
- [ ] **Create new function: `getPageTypeFromContentScript()`**
  ```javascript
  function getPageTypeFromContentScript() {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (tabs.length === 0) return resolve(null);
        
        chrome.tabs.sendMessage(
          tabs[0].id, 
          { action: 'GET_PAGE_TYPE' }, 
          (response) => {
            if (chrome.runtime.lastError) {
              console.warn('[Side Panel] Content script not ready, retrying...');
              resolve(null);
            } else if (response?.pageType) {
              resolve(response.pageType);
            }
          }
        );
      });
    });
  }
  ```
- [ ] **Update `initializeContextFeatures()` function:**
  - Get page type from content script using new function
  - Implement retry logic if first attempt fails (3 attempts, 500ms delay)
  - Initialize features based on page type (not just MAGIC_ETL)
- [ ] **Verify tab switching:** Side panel re-fetches page type on `chrome.tabs.onActivated`
- [ ] **Verify page refresh:** Side panel re-fetches on `chrome.tabs.onUpdated` with `status === 'complete'`
- [ ] **Test:** Manual verification of side panel content changing correctly

---

### PHASE 2: CLEANUP 

#### Step 2.1: Delete Legacy Files
- [ ] Delete file: `content.js`
  - **Before deletion:** Run grep to confirm no other files import it
  - **Command:** `grep -r "require.*content\.js\|import.*content\.js" .`
- [ ] Delete file: `popup.js`
  - **Verify:** Check that `side_panel.js` has all popup functionality
- [ ] **Test:** Extension loads without errors

#### Step 2.2: Update manifest.json
- [ ] Open `manifest.json`
- [ ] **Search for references:**
  - Find any entry for `content.js`
  - Find any entry for `popup.js` (in `action` or `browser_action`)
  - Find any entry for `popup.html` (likely references popup.js)
- [ ] Remove or update entries:
  - Remove content script entry for `content.js`
  - Update/remove popup action references
  - Keep `content-main.js` entry
  - Keep `side_panel_html` and `side_panel.html` entries
- [ ] **Test:** Run `npm run build` or verify manifest validity

---

### PHASE 3: DEFENSIVE CHECKS 

#### Step 3.1: Update Feature Modules (All 9 files)

For each feature file below, apply these updates:

**Feature Files to Update:**
1. `content/features/feature-column-search.js`
2. `content/features/feature-magic-recipes.js`
3. `content/features/feature-select-columns-rename.js`
4. `content/features/feature-select-columns-reorder.js`
5. `content/features/feature-version-notes.js`
6. `content/features/feature-graph-menu.js`
7. `content/features/feature-page-fulltext.js`
8. `content/features/feature-page-jump-to.js`

**For each file:**

- [ ] **Add page type validation in `init()` function:**
  ```javascript
  export async function init(config) {
    // Validate page type
    if (!config.isGraph) {
      console.warn('[FeatureName] This feature requires Magic ETL (graph) context');
      return;
    }
    
    // ... rest of initialization
  }
  ```
  * Adjust `!config.isGraph` based on feature requirements
  * PAGE features should check `config.isPage`
  * SQL_AUTHOR features should check `config.isAuthor`

- [ ] **Add cleanup function export:**
  ```javascript
  export function cleanup() {
    // Remove all event listeners
    document.removeEventListener('click', yourClickHandler);
    document.removeEventListener('mousedown', yourMouseHandler);
    // etc.
    
    // Reset global state
    yourGlobalVar = null;
    delegatesBound = false;
    
    console.log('[FeatureName] Cleaned up');
  }
  ```

- [ ] **Track listener registrations:**
  - Make note of all `addEventListener` calls
  - Make note of all global variables/state
  - Include all in cleanup function

- [ ] **Test:** Load/unload feature multiple times, verify no memory leaks

#### Step 3.2: Special Case - feature-magic-recipes.js
- [ ] Add to cleanup function:
  ```javascript
  // Reset global state specific to this feature
  insertingRecipeNow = false;
  suppressOpenUntil = null;
  lastViewedTab = null;
  ```
- [ ] Verify recipe storage is not cleared (chrome.storage should persist)

#### Step 3.3: Special Case - feature-version-notes.js
- [ ] Update signature to match other features:
  - Change from: `export async function init({ DH, isAuthor, isGraph, settings })`
  - To: `export async function init(config)` with destructuring
  - Ensure consistency with how content-main.js passes config

---

### PHASE 4: AUDIT & OPTIONAL IMPROVEMENTS 

#### Step 4.1: Review background.js
- [ ] Open `background.js`
- [ ] Check `chrome.tabs.onActivated` handler:
  - Verify it doesn't re-inject content scripts unnecessarily
  - Verify it doesn't trigger duplicate page detection
- [ ] Check `chrome.tabs.onUpdated` handler:
  - Same checks as above
- [ ] **Document findings:** Add comments explaining tab change handling
- [ ] **No changes needed?** That's OK - just verify it's idempotent

#### Step 4.2: Review select-columns-utils.js
- [ ] Open file
- [ ] Review all CSS selectors (`.querySelector`, `.querySelectorAll` calls)
- [ ] Current status: ✅ Mostly robust (uses `data-testid` where available)
- [ ] **Optional improvements** (can be done later):
  - Replace `[class*="DfSelectColumns_fieldName"]` with more stable selectors
  - Add fallback selectors if primary selector fails
  - Document selector rationale
- [ ] **Decision:** Defer to Phase 5 (future optimization)

#### Step 4.3: Review feature-general-modal.js
- [ ] Open file
- [ ] Verify it has no state management (should be stateless utility)
- [ ] Confirm all features using it are compatible
- [ ] **No changes expected** - this is a utility module

#### Step 4.4: Review debug-drag-monitor.js
- [ ] Open file
- [ ] Check for any page type dependencies
- [ ] Verify it doesn't assume specific page types
- [ ] **No changes expected** unless it has page-type-specific logic

---

### PHASE 5: TESTING & VALIDATION 

#### Step 5.1: Manual Testing
- [ ] **Test PAGE (Dashboard/Card):**
  - [ ] Open dashboard page
  - [ ] Verify side panel shows appropriate features
  - [ ] Verify no MAGIC_ETL features are active
  - [ ] Console should NOT show "Non-Relevant Page"

- [ ] **Test MAGIC_ETL (Graph Canvas):**
  - [ ] Open Magic ETL canvas
  - [ ] Verify column search initializes
  - [ ] Verify magic recipes UI appears
  - [ ] Verify select columns features available
  - [ ] Test column search functionality
  - [ ] Test recipe save/insert

- [ ] **Test SQL_AUTHOR:**
  - [ ] Open SQL query author
  - [ ] Verify version notes feature works (if applicable)
  - [ ] Verify page-type-specific features active

- [ ] **Test TAB SWITCHING:**
  - [ ] Open Dashboard in Tab A
  - [ ] Open Magic ETL in Tab B
  - [ ] Switch to Tab B → side panel should show graph features
  - [ ] Switch to Tab A → side panel should show page features
  - [ ] Repeat several times

- [ ] **Test PAGE REFRESH:**
  - [ ] On Magic ETL page, refresh browser
  - [ ] Side panel should remain functional
  - [ ] Features should re-initialize correctly
  - [ ] No "Not available on this page" error

- [ ] **Test FEATURE CLEANUP:**
  - [ ] Navigate from Magic ETL to different page type
  - [ ] Verify old listeners are removed (check console for cleanup logs)
  - [ ] Navigate back → verify new listeners are attached

#### Step 5.2: Console Audit
- [ ] Open DevTools console on each page type
- [ ] Search for `"Non-Relevant Page"` → should find ZERO occurrences
- [ ] Search for `"[Content Main]"` → should see detection logs only on page changes
- [ ] Verify no error messages related to PageDetector

#### Step 5.3: Code Review
- [ ] Review all changes against this plan
- [ ] Verify all duplicate detection removed
- [ ] Verify all cleanup functions implemented
- [ ] Verify all page type checks added to features
- [ ] **Run**: Static code analysis if available (eslint, etc.)

#### Step 5.4: Final Validation
- [ ] Create test checklist document
- [ ] Mark each test as PASS/FAIL
- [ ] Document any new issues found
- [ ] Commit code to git with detailed message

---

## Quick Reference - Refactoring Phases

| Phase | Focus | Files |
|-------|-------|-------|
| **Phase 1** | Core refactoring |  page-detector.js, content-main.js, side_panel.js |
| **Phase 2** | Cleanup legacy |  Delete content.js/popup.js, Update manifest.json |
| **Phase 3** | Defensive checks | 9 feature modules + special handling |
| **Phase 4** | Audit & optional | background.js, select-columns-utils.js, etc. |
| **Phase 5** | Testing & validation |  Manual testing, console audit, code review |

**See full implementation steps above for detailed checklists.**

---

## Expected Improvements
✅ Single detection logic - no duplication
✅ Consistent across all modules
✅ Easier maintenance
✅ Reduced console spam
✅ Clearer error messages
✅ Page type available to all features via PageDetector
✅ URL change handling unified in one place
