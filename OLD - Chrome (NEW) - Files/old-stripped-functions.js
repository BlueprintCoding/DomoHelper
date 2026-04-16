/**
 * OLD/UNUSED FUNCTIONS ARCHIVE
 * 
 * This file contains functions that were identified as unused in the Chrome (NEW) extension.
 * They are preserved here in case they're needed in the future.
 * 
 * Date: April 16, 2026
 * Analysis: Comprehensive scan of all JS files for undefined/uncalled functions
 */

// ============================================================================
// FROM: src/utils/executeInPage.js
// STATUS: ❌ UNUSED - Never called in extension
// REASON: Defined but never imported or used. executeInPage() is used, but executeInAllFrames() is not.
// ============================================================================

/**
 * Execute a function in ALL frames in the page context
 * Useful for detecting content in nested iframes
 * @param {Function} func - The function to execute in page context
 * @param {Array} [args] - Arguments to pass to the function
 * @param {number} [tabId] - Optional specific tab ID
 * @returns {Promise<Array>} - Array of results from all frames
 */
export async function executeInAllFrames_UNUSED(func, args = [], tabId = null) {
  try {
    let targetTabId = tabId;

    if (!targetTabId) {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
      });

      if (!tab) {
        throw new Error('No active tab found');
      }

      targetTabId = tab.id;
    }

    let tabInfo;
    try {
      tabInfo = await chrome.tabs.get(targetTabId);
    } catch (error) {
      throw new Error(`Tab ${targetTabId} not found: ${error.message}`);
    }

    if (!tabInfo.url || !tabInfo.url.includes('domo.com')) {
      throw new Error(`Tab ${targetTabId} is not on a Domo page`);
    }

    const results = await chrome.scripting.executeScript({
      args,
      func,
      target: { allFrames: true, tabId: targetTabId },
      world: 'MAIN'
    });

    const validResults = [];
    if (results && Array.isArray(results)) {
      results.forEach((frameResult) => {
        if (frameResult && frameResult.result !== undefined && frameResult.result !== null) {
          if (Array.isArray(frameResult.result)) {
            if (frameResult.result.length > 0) {
              validResults.push(...frameResult.result);
            }
          } else {
            validResults.push(frameResult.result);
          }
        }
      });
    }

    return validResults;
  } catch (error) {
    console.error('[executeInAllFrames] Error:', error);
    return [];
  }
}

// ============================================================================
// FROM: background.js
// STATUS: ❌ UNUSED - Never called anywhere
// REASON: Defined helper functions but never invoked in the file
// ============================================================================

/**
 * Extract instance name from URL (e.g., 'bcpequity' from 'https://bcpequity.domo.com/...')
 * UNUSED: This utility was planned but never used in detection logic
 */
function getInstanceFromUrl_UNUSED(url) {
    const match = url.match(/https:\/\/([^.]+)\.domo\.com/);
    return match ? match[1] : null;
}

/**
 * Extract dataflow ID from URL
 * UNUSED: This utility was planned but never used in detection logic
 */
function getDataflowIdFromUrl_UNUSED(url) {
    const match = url.match(/dataflows\/(\d+)/);
    return match ? match[1] : null;
}

// ============================================================================
// FROM: content/features/feature-node-align.js
// STATUS: ❌ UNUSED - Never called anywhere
// REASON: Attempted implementation that was superseded or never completed
// ============================================================================

/**
 * Try to trigger React Flow's drag detection on a node
 * React Flow might use different handlers/libraries, so we try multiple approaches
 * UNUSED: Attempted approach that was abandoned in favor of emulation drag
 */
function triggerNodeDragStart_UNUSED(node, x, y) {
  // Try finding React event handlers attached to the element
  const keys = Object.keys(node);
  const reactFiberKey = keys.find(key => key.startsWith('__react'));
  
  if (reactFiberKey) {
    console.log('[Node Align] Found React fiber, attempting direct handler invocation');
    try {
      const fiber = node[reactFiberKey];
      // React might have handlers we can access
      if (fiber && fiber.memoizedProps && fiber.memoizedProps.onMouseDown) {
        console.log('[Node Align] Calling React onMouseDown handler directly');
        fiber.memoizedProps.onMouseDown({ clientX: x, clientY: y, buttons: 1, preventDefault: () => {}, stopPropagation: () => {} });
      }
    } catch (e) {
      console.log('[Node Align] Could not invoke React handler:', e.message);
    }
  }
}

/**
 * Get info about currently selected nodes (for debugging/UI display)
 * UNUSED: Duplicate of functionality - just call getSelectedNodes().map(getNodeInfo) instead
 */
function getSelectedNodesInfo_UNUSED() {
  return getSelectedNodes().map(getNodeInfo);
}

// ============================================================================
// FROM: content/content-main.js
// STATUS: ⚠️ QUESTIONABLE - Function defined but may not be properly exposed
// REASON: Wrapper function that posts messages, but not directly called in script context
// NOTE: feature-magic-recipes.js calls window.readClipboardViaPageContext() but this 
//       function doesn't appear to be exposed via window assignment
// ============================================================================

/**
 * Helper function to read clipboard via page context
 * QUESTIONABLE: This wrapper posts messages but isn't exposed to window properly
 * May be dead code or incomplete implementation
 */
function readClipboardViaPageContext_QUESTIONABLE() {
  return new Promise((resolve, reject) => {
    const id = ++clipboardRequestId;
    console.log(`[Content Script] Sending clipboard request ${id}`);
    
    const timeout = setTimeout(() => {
      window.removeEventListener('message', handler);
      console.error(`[Content Script] Clipboard request ${id} timed out`);
      reject(new Error('Clipboard read timeout'));
    }, 5000);
    
    const handler = (e) => {
      if (e.source !== window) return;
      if (e.data.type !== 'DH_CLIPBOARD_RESPONSE' || e.data.requestId !== id) return;
      
      clearTimeout(timeout);
      window.removeEventListener('message', handler);
      
      console.log(`[Content Script] Received clipboard response ${id}:`, e.data.success ? 'success' : 'failed');
      
      if (e.data.success) {
        resolve(e.data.data);
      } else {
        reject(new Error(e.data.error || 'Clipboard read failed'));
      }
    };
    
    window.addEventListener('message', handler);
    window.postMessage({ type: 'DH_CLIPBOARD_REQUEST', requestId: id }, '*');
  });
}

// ============================================================================
// FROM: src/utils/contentScriptHelper.js (ENTIRE FILE UNUSED)
// STATUS: ❌ UNUSED - No file is ever imported
// REASON: Helper module never imported or referenced anywhere in extension
// ============================================================================

/**
 * Setup message listeners
 * FROM contentScriptHelper.js - ENTIRE FILE UNUSED
 */
function setupMessageListeners_UNUSED() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[Content] Received message:', message.type);

    // TAB_CONTEXT_UPDATED: Background detected new context
    if (message.type === 'TAB_CONTEXT_UPDATED') {
      const context = message.context;
      console.log('[Content] Context updated:', context?.domoObject?.typeId);

      // Forward to features
      window.postMessage({
        type: 'DH_CONTEXT_UPDATED',
        context: context
      }, '*');

      // Store in window for feature access
      window.__domoHelperContext = context;

      sendResponse({ success: true });
      return true;
    }

    // PING: Check if content script is alive
    if (message.type === 'PING') {
      sendResponse({ success: true });
      return true;
    }

    return false;
  });
}

/**
 * Setup modal detection
 * FROM contentScriptHelper.js - ENTIRE FILE UNUSED
 */
function setupModalDetection_UNUSED() {
  const MODAL_DETECTORS = [
    {
      name: 'Card Modal',
      selector: '[id^="card-details-modal-"]',
      triggerRedetection: true
    },
    {
      name: 'Admin Modal',
      selector: '[role="dialog"][aria-labelledby*="admin"]',
      triggerRedetection: true
    },
    {
      name: 'Workflow Trigger Modal',
      selector: '[role="dialog"][class*="TimerModal"]',
      triggerRedetection: true
    },
    {
      name: 'App Studio Modal',
      selector: '[role="dialog"][class*="app-studio"]',
      triggerRedetection: true
    }
  ];

  // Track which modals are currently detected
  const detectedModals = new Map();

  const observer = new MutationObserver(() => {
    for (const detector of MODAL_DETECTORS) {
      const element = document.querySelector(detector.selector);
      const wasPresent = detectedModals.get(detector.name);

      if (element && !wasPresent) {
        // Modal appeared
        console.log(`[Content] Modal detected: ${detector.name}`);
        detectedModals.set(detector.name, true);

        if (detector.triggerRedetection) {
          triggerRedetection_UNUSED();
        }
      } else if (!element && wasPresent) {
        // Modal disappeared
        console.log(`[Content] Modal removed: ${detector.name}`);
        detectedModals.set(detector.name, false);

        if (detector.triggerRedetection) {
          triggerRedetection_UNUSED();
        }
      }
    }
  });

  // Start observing document body for modal changes
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false
  });

  console.log('[Content] Modal detection initialized');
}

/**
 * Trigger context re-detection via background
 * FROM contentScriptHelper.js - ENTIRE FILE UNUSED
 */
function triggerRedetection_UNUSED() {
  console.log('[Content] Triggering context re-detection');
  chrome.runtime.sendMessage({
    type: 'DETECT_CONTEXT'
  }).catch(error => {
    console.warn('[Content] Error triggering re-detection:', error.message);
  });
}

/**
 * Request current context from background
 * FROM contentScriptHelper.js - ENTIRE FILE UNUSED
 */
async function getContext_UNUSED() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'GET_TAB_CONTEXT' },
      (response) => {
        resolve(response?.context || null);
      }
    );
  });
}

/**
 * Window message handler for features
 * Allows features to request context or trigger re-detection
 * FROM contentScriptHelper.js - ENTIRE FILE UNUSED
 */
function setupWindowMessageHandler_UNUSED() {
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;

    // Feature requesting context
    if (event.data.type === 'DH_REQUEST_CONTEXT') {
      getContext_UNUSED().then(context => {
        window.postMessage({
          type: 'DH_CONTEXT_RESPONSE',
          requestId: event.data.requestId,
          context: context
        }, '*');
      });
    }

    // Feature requesting re-detection
    if (event.data.type === 'DH_TRIGGER_REDETECTION') {
      triggerRedetection_UNUSED();
    }
  });
}

/**
 * Initialize content script
 * FROM contentScriptHelper.js - ENTIRE FILE UNUSED
 */
function initializeContentScriptHelper_UNUSED() {
  console.log('[Content] Initializing content script');

  setupMessageListeners_UNUSED();
  setupModalDetection_UNUSED();
  setupWindowMessageHandler_UNUSED();

  // Request initial context
  getContext_UNUSED().then(context => {
    if (context) {
      window.__domoHelperContext = context;
      console.log('[Content] Initial context loaded:', context.domoObject?.typeId);
    }
  });
}

// ============================================================================
// FROM: content/features/feature-select-columns-reorder.js
// STATUS: ❌ UNUSED - Never called anywhere
// REASON: Abandoned implementation approaches, superseded by actual working reorder logic
// ============================================================================

/**
 * Directly manipulate input values and trigger React updates
 * UNUSED: Attempted approach to reorder by swapping values, but never used
 * Superseded by addColumnByName() and moveColumnToPosition()
 */
function reorderByManipulatingState_UNUSED(fromIndex, toIndex, columns) {
  console.log('🔄 Attempting to manipulate column state directly...');
  
  // Strategy: Swap the rename input values to trigger React re-render
  // This won't actually reorder, but might trigger state updates we can use
  
  // Get all rename inputs
  const renameInputs = columns.map(c => c.renameInput).filter(Boolean);
  
  if (renameInputs.length === 0) {
    console.log('❌ No rename inputs found');
    return false;
  }
  
  // Store current values
  const values = renameInputs.map(input => input.value);
  
  // Swap values at fromIndex and toIndex
  const temp = values[fromIndex];
  values[fromIndex] = values[toIndex];
  values[toIndex] = temp;
  
  // Apply new values and trigger React's onChange
  renameInputs.forEach((input, i) => {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    ).set;
    
    nativeInputValueSetter.call(input, values[i]);
    
    // Trigger React's synthetic event
    const event = new Event('input', { bubbles: true });
    input.dispatchEvent(event);
  });
  
  console.log('✅ Values swapped, React should update');
  return false; // This won't actually reorder columns
}

/**
 * Use the remove button to manipulate order
 * UNUSED: Attempted approach to reorder via remove/add simulation
 * Never used - superseded by actual working implementation
 */
async function reorderUsingRemoveAndAdd_UNUSED(fromIndex, toIndex, columns) {
  console.log('🔄 Attempting reorder via remove/add...');
  
  // Get the column to move
  const columnToMove = columns[fromIndex];
  const columnName = columnToMove.name;
  const renameValue = columnToMove.renameValue;
  
  // Step 1: Click remove button
  const removeButton = columnToMove.element.querySelector(SELECTORS.removeButton);
  if (!removeButton) {
    console.log('❌ No remove button found');
    return false;
  }
  
  console.log(`📋 Removing column: ${columnName}`);
  removeButton.click();
  
  await new Promise(r => setTimeout(r, 300));
  
  // Step 2: Find the "Add Column" dropdown
  const columnPicker = document.querySelector(SELECTORS.columnPicker);
  if (!columnPicker) {
    console.log('❌ Column picker not found');
    return false;
  }
  
  const input = columnPicker.querySelector('input');
  if (!input) {
    console.log('❌ Column picker input not found');
    return false;
  }
  
  // Step 3: Type the column name to search
  console.log(`📋 Re-adding column: ${columnName}`);
  
  // Enable the input (it's disabled when all columns are selected)
  input.disabled = false;
  
  // Set value using React's way
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  ).set;
  nativeInputValueSetter.call(input, columnName);
  
  // Trigger input event
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  
  await new Promise(r => setTimeout(r, 200));
  
  // Step 4: Find and click the matching option
  const dropdown = columnPicker.querySelector('[role="listbox"]');
  if (dropdown) {
    const options = Array.from(dropdown.querySelectorAll('[role="option"]'));
    const matchingOption = options.find(opt => opt.textContent.trim() === columnName);
    
    if (matchingOption) {
      console.log('✅ Found matching option, clicking...');
      matchingOption.click();
      
      await new Promise(r => setTimeout(r, 300));
      
      // Restore rename value if it had one
      if (renameValue) {
        const newColumns = getColumnItems();
        const readdedColumn = newColumns[newColumns.length - 1]; // It's added at the end
        if (readdedColumn?.renameInput) {
          nativeInputValueSetter.call(readdedColumn.renameInput, renameValue);
          readdedColumn.renameInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
      
      return true;
    }
  }
  
  console.log('❌ Could not find dropdown option');
  return false;
}

// ============================================================================
// SUMMARY OF FINDINGS
// ============================================================================

/*
TOTAL UNUSED FUNCTIONS IDENTIFIED: 16

CATEGORY BREAKDOWN:
- Exported but never used:       3 functions (executeInAllFrames, getInstanceFromUrl, getDataflowIdFromUrl)
- Attempted approaches:           4 functions (triggerNodeDragStart, getSelectedNodesInfo, reorderByManipulatingState, reorderUsingRemoveAndAdd)
- Questionable exposure:          1 function (readClipboardViaPageContext)
- Entire unused module:           8 functions (all from contentScriptHelper.js)

FILE DISTRIBUTION:
- src/utils/executeInPage.js:     1 unused export
- background.js:                  2 unused utilities
- feature-node-align.js:          2 unused functions
- content-main.js:                1 questionable function
- content/features/feature-select-columns-reorder.js: 2 unused functions (abandoned reorder approaches)
- src/utils/contentScriptHelper.js: 8 unused functions (ENTIRE FILE)

RECOMMENDED ACTIONS:
1. Delete src/utils/contentScriptHelper.js (entire file - 8 functions)
2. Remove executeInAllFrames() export from src/utils/executeInPage.js
3. Remove getInstanceFromUrl() and getDataflowIdFromUrl() from background.js
4. Remove triggerNodeDragStart() from feature-node-align.js
5. Remove getSelectedNodesInfo() from feature-node-align.js
6. Investigate readClipboardViaPageContext() in content-main.js (check if properly exposed)
*/
