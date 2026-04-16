// content/content-main.js

// Signal that content script is loading - set IMMEDIATELY
console.log('[Content Main] Module loading...');
window.domoHelperContentScriptReady = false;

// Context validity flag - used to prevent stale listeners from responding
window.__domoHelperContentMainValid = false;

// === NEW CONTEXT SYSTEM ===
// Store current context for features to access
window.__domoHelperContext = null;
window.__domoHelperContextUpdateCallbacks = [];

/**
 * Features can subscribe to context updates
 */
window.subscribeToContextUpdates = (callback) => {
  window.__domoHelperContextUpdateCallbacks.push(callback);
};

/**
 * Get current context (may be null if not yet detected)
 */
window.getDomoHelperContext = () => window.__domoHelperContext;

/**
 * Trigger re-detection from a feature
 */
window.triggerDomoHelperRedetection = () => {
  chrome.runtime.sendMessage({ type: 'DETECT_CONTEXT' }).catch(err => {
    console.warn('[Content Main] Failed to trigger re-detection:', err.message);
  });
};

// === PAGE TYPE HELPER (uses context from background.js) ===
// Instead of separate detection, use the comprehensive detection from background.js
const ContextHelper = {
  /**
   * Check if current context indicates we're on a dashboard/card page
   */
  isPageType() {
    const context = window.__domoHelperContext;
    return context?.domoObject?.typeId === 'PAGE';
  },
  
  /**
   * Check if current context indicates we're on Magic ETL
   */
  isMagicETLType() {
    const context = window.__domoHelperContext;
    return context?.domoObject?.typeId === 'MAGIC_ETL' || 
           context?.domoObject?.typeId === 'DATAFLOW_TYPE';
  },
  
  /**
   * Check if current context indicates we're on SQL Author
   */
  isSQLAuthorType() {
    const context = window.__domoHelperContext;
    return context?.domoObject?.typeId === 'SQL_AUTHOR';
  },
  
  /**
   * Check if current context is a relevant page type
   */
  isRelevantType() {
    const context = window.__domoHelperContext;
    const typeId = context?.domoObject?.typeId;
    return typeId && ['PAGE', 'MAGIC_ETL', 'DATAFLOW_TYPE', 'SQL_AUTHOR', 'ANALYZER'].includes(typeId);
  },
  
  /**
   * Get current page type from context
   */
  getPageType() {
    const context = window.__domoHelperContext;
    const typeId = context?.domoObject?.typeId;
    
    if (!typeId) return 'UNKNOWN';
    
    // Map typeId to display page type
    const typeMap = {
      'PAGE': 'PAGE',
      'MAGIC_ETL': 'MAGIC_ETL',
      'DATAFLOW_TYPE': 'MAGIC_ETL',
      'SQL_AUTHOR': 'SQL_AUTHOR',
      'ANALYZER': 'ANALYZER'
    };
    
    return typeMap[typeId] || typeId;
  }
};

// === CLIPBOARD INTERCEPTION SYSTEM ===
// Intercept clipboard writes to capture what Domo is copying
let capturedClipboardData = null;
let clipboardInterceptor = null;

function setupClipboardInterceptor() {
  console.log('[Clipboard Interceptor] Setting up...');
  
  if (!navigator.clipboard) {
    console.error('[Clipboard Interceptor] navigator.clipboard not available!');
    return;
  }
  
  const originalWriteText = navigator.clipboard.writeText;
  
  navigator.clipboard.writeText = function(text) {
    console.log('[Clipboard Interceptor] writeText called, capturing data');
    capturedClipboardData = text;
    console.log('[Clipboard Interceptor] Data captured, length:', text.length);
    console.log('[Clipboard Interceptor] First 200 chars:', text.substring(0, 200));
    // Still write to clipboard normally
    return originalWriteText.call(navigator.clipboard, text);
  };
  
  console.log('[Clipboard Interceptor] Setup complete, hook installed');
}

function getCapturedClipboardData() {
  console.log('[Clipboard Interceptor] getCapturedClipboardData called');
  console.log('[Clipboard Interceptor] Current capturedClipboardData:', capturedClipboardData ? 'has data (' + capturedClipboardData.length + ' chars)' : 'null/undefined');
  const data = capturedClipboardData;
  capturedClipboardData = null; // Clear after retrieval
  return data;
}

// Expose to window for use by features
window.getCapturedClipboardData = getCapturedClipboardData;

setupClipboardInterceptor();

// === FETCH INTERCEPTION FOR ANALYZER SAVE DETECTION ===
function setupAnalyzerSaveDetection() {
  console.log('[Fetch Interceptor] Setting up analyzer save detection');
  
  // Inject fetch interceptor script via external file (complies with CSP)
  const script = document.createElement('script');
  const interceptorUrl = chrome.runtime.getURL('fetch-interceptor.js');
  console.log('[Fetch Interceptor] Loading from:', interceptorUrl);
  
  script.src = interceptorUrl;
  script.onload = function() {
    console.log('[Fetch Interceptor] Script loaded successfully');
    this.remove();
  };
  script.onerror = function() {
    console.error('[Fetch Interceptor] Failed to load script from:', interceptorUrl);
  };
  
  (document.head || document.documentElement).appendChild(script);
  console.log('[Fetch Interceptor] Script tag appended to page');
}

setupAnalyzerSaveDetection();

// Inject page script for clipboard helper (loads external file to comply with CSP)
(function injectPageScript() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('clipboard-helper.js');
  script.onload = function() {
    this.remove();
  };
  (document.head || document.documentElement).appendChild(script);
})();

// Helper function to read clipboard via page context
let clipboardRequestId = 0;
function readClipboardViaPageContext() {
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

// Simple shared helpers
const DH = {
    sleep: (ms) => new Promise(r => setTimeout(r, ms)),
    showNotification(message, color) {
      const notification = document.createElement('div');
      notification.innerText = message;
      Object.assign(notification.style, {
        position: 'fixed',
        top: '100px',
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: color || '#333',
        color: '#fff',
        fontSize: '2em',
        padding: '10px',
        borderRadius: '5px',
        zIndex: 9999
      });
      document.body.appendChild(notification);
      setTimeout(() => document.body.removeChild(notification), 4000);
    }
  };
  
  // Feature module registry
  const featureModules = {
    pageFullText: null,
    pageJumpTo: null,
    magicRecipes: null,
    graphMenu: null,
    versionNotes: null,
    selectColumnsReorder: null,
    selectColumnsRename: null,
    columnSearch: null
  };
  
  let loadedForThisUrl = false;
  
  // Load features for the current page
  async function loadFeaturesForPage() {
    if (loadedForThisUrl) return;
    loadedForThisUrl = true;
  
    try {
      // Check if extension context is still valid
      if (!chrome || !chrome.runtime || !chrome.runtime.id) {
        console.log('[Content Main] Extension context not available, skipping feature load');
        return;
      }

      // Shared settings defaults
      let currentSettings = {
        enabled: true,
        removeLinks: false,
        forceVersionNotes: true,
        minWords: 5
      };
    
      // Fetch stored settings using promise wrapper
      const settings = await new Promise((resolve) => {
        try {
          chrome.storage.local.get(['enabled', 'removeLinks', 'forceVersionNotes', 'minWords'], (result) => {
            if (chrome.runtime.lastError) {
              console.warn('[Content Main] Could not fetch settings:', chrome.runtime.lastError.message);
              resolve({});
            } else {
              resolve(result || {});
            }
          });
        } catch (e) {
          console.warn('[Content Main] Storage API call failed:', e.message);
          resolve({});
        }
      });

      currentSettings = {
        enabled: settings.enabled !== undefined ? settings.enabled : currentSettings.enabled,
        removeLinks: settings.removeLinks !== undefined ? settings.removeLinks : currentSettings.removeLinks,
        forceVersionNotes: settings.forceVersionNotes !== undefined ? settings.forceVersionNotes : currentSettings.forceVersionNotes,
        minWords: settings.minWords || currentSettings.minWords
      };
  
      // PAGE features
      if (ContextHelper.isPageType()) {
        try {
          // Inject page CSS
          const css = document.createElement('link');
          css.rel = 'stylesheet';
          css.type = 'text/css';
          css.href = chrome.runtime.getURL('css/dh-page-style.css');
          document.head.appendChild(css);
    
          // Full text modal feature
          featureModules.pageFullText = (await import(chrome.runtime.getURL('content/features/feature-page-fulltext.js'))).default;
          featureModules.pageFullText.init({ DH, settings: currentSettings });
    
          // "Jump to:" body navigation
          featureModules.pageJumpTo = (await import(chrome.runtime.getURL('content/features/feature-page-jump-to.js'))).default;
          featureModules.pageJumpTo.init({ DH });
        } catch (error) {
          console.error('[Content Main] Error loading page features:', error.message);
        }
      }
  
      // GRAPH features (Magic ETL)
      if (ContextHelper.isMagicETLType()) {
        try {
          // Inject graph CSS
          const css = document.createElement('link');
          css.rel = 'stylesheet';
          css.type = 'text/css';
          css.href = chrome.runtime.getURL('css/dh-graph-style.css');
          document.head.appendChild(css);
    
          // Magic ETL recipes (UI + storage + insertion)
          featureModules.magicRecipes = (await import(chrome.runtime.getURL('content/features/feature-magic-recipes.js'))).default;
          featureModules.magicRecipes.init({ DH });
    
          // Domo Helper menu in sidebar
          featureModules.graphMenu = (await import(chrome.runtime.getURL('content/features/feature-graph-menu.js'))).default;
          featureModules.graphMenu.init({ DH });

          // Select Columns reorder functionality
          featureModules.selectColumnsReorder = (await import(chrome.runtime.getURL('content/features/feature-select-columns-reorder.js'))).default;
          featureModules.selectColumnsReorder.init({ DH });

          // Select Columns rename functionality
          featureModules.selectColumnsRename = (await import(chrome.runtime.getURL('content/features/feature-select-columns-rename.js'))).default;
          featureModules.selectColumnsRename.init({ DH });

          // Column Search functionality
          featureModules.columnSearch = (await import(chrome.runtime.getURL('content/features/feature-column-search.js'))).default;
          console.log('[Content Main] Column Search feature imported successfully');
          featureModules.columnSearch.init({ DH });
          console.log('[Content Main] Column Search feature initialized');

          // Node Alignment functionality
          featureModules.nodeAlign = (await import(chrome.runtime.getURL('content/features/feature-node-align.js'))).default;
          featureModules.nodeAlign.init();
          console.log('[Content Main] Node Align feature initialized');
        } catch (error) {
          console.error('[Content Main] Error loading Magic ETL features:', error.message);
        }
      }
  
      // Version Notes enforcement (applies to SQL Author + Magic ETL Graph)
      if (ContextHelper.isSQLAuthorType() || ContextHelper.isMagicETLType()) {
        try {
          featureModules.versionNotes = (await import(chrome.runtime.getURL('content/features/feature-version-notes.js'))).default;
          featureModules.versionNotes.init({ 
            DH,
            isAuthor: ContextHelper.isSQLAuthorType(),
            isGraph: ContextHelper.isMagicETLType(),
            settings: currentSettings 
          });
        } catch (error) {
          console.error('[Content Main] Error loading version notes feature:', error.message);
        }
      }
    } catch (error) {
      console.error('[Content Main] Fatal error in loadFeaturesForPage:', error.message);
      loadedForThisUrl = false;
    }
  }
  
  // Set up message listener IMMEDIATELY (outside loadFeaturesForPage so it's available right away)
  // Mark as valid BEFORE registering listener to avoid race condition
  window.__domoHelperContentMainValid = true;
  
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Guard against stale listeners from old execution contexts
    if (!window.__domoHelperContentMainValid) {
      return false; // Silently ignore, don't respond
    }
    
    console.log('[Content Main] Received message:', message);
    
    // Health check - verify content script is ready
    if (message.action === 'PING') {
      console.log('[Content Main] PING received');
      sendResponse({ pong: true, columnSearchReady: !!featureModules.columnSearch });
      return true;
    }
    
    // Get page type - used by side panel to determine context
    if (message.action === 'GET_PAGE_TYPE') {
      const pageType = ContextHelper.getPageType();
      console.log('[Content Main] GET_PAGE_TYPE requested, returning:', pageType);
      sendResponse({ pageType, context: window.__domoHelperContext });
      return true;
    }
    
    if (message.type === 'settingsChanged') {
      const { settings } = message;
      // Forward to live features if loaded
      if (featureModules.pageFullText?.applySettings) featureModules.pageFullText.applySettings(settings);
      if (featureModules.versionNotes?.applySettings) featureModules.versionNotes.applySettings(settings);
      if (featureModules.magicRecipes?.applySettings) featureModules.magicRecipes.applySettings?.(settings);
      if (featureModules.graphMenu?.applySettings) featureModules.graphMenu.applySettings?.(settings);
      if (featureModules.pageJumpTo?.applySettings) featureModules.pageJumpTo.applySettings?.(settings);
      if (featureModules.selectColumnsReorder?.applySettings) featureModules.selectColumnsReorder.applySettings?.(settings);
      if (featureModules.selectColumnsRename?.applySettings) featureModules.selectColumnsRename.applySettings?.(settings);
    }
    
    // Handle side panel requests for Magic Recipes
    if (message.action === 'SAVE_MAGIC_RECIPE_FROM_PANEL') {
      console.log('[Content Main] SAVE_MAGIC_RECIPE_FROM_PANEL received');
      try {
        if (featureModules.magicRecipes?.triggerSaveRecipe) {
          console.log('[Content Main] Calling triggerSaveRecipe()');
          featureModules.magicRecipes.triggerSaveRecipe();
          console.log('[Content Main] triggerSaveRecipe() completed');
          sendResponse({ success: true });
        } else {
          console.log('[Content Main] Magic Recipes not initialized');
          sendResponse({ success: false, error: 'Magic Recipes not initialized' });
        }
      } catch (err) {
        console.error('[Content Main] Error in SAVE_MAGIC_RECIPE_FROM_PANEL:', err);
        sendResponse({ success: false, error: err.message });
      }
      return true; // Keep channel alive for async operations
    }
    
    if (message.action === 'INSERT_MAGIC_RECIPE') {
      console.log('[Content Main] INSERT_MAGIC_RECIPE received');
      try {
        if (featureModules.magicRecipes?.insertRecipeData) {
          const result = featureModules.magicRecipes.insertRecipeData(message.recipeData, message.recipeTitle);
          sendResponse({ success: result });
        } else {
          sendResponse({ success: false, error: 'Magic Recipes not initialized' });
        }
      } catch (err) {
        console.error('[Content Main] Error in INSERT_MAGIC_RECIPE:', err);
        sendResponse({ success: false, error: err.message });
      }
      return true; // Keep channel alive for async operations
    }

    // Handle column search requests
    if (message.action === 'SEARCH_COLUMN') {
      console.log('[Content Main] SEARCH_COLUMN received:', message.columnName, 'filters:', message.filters);
      
      // Use async IIFE to properly handle async operation
      (async () => {
        try {
          if (featureModules.columnSearch?.searchColumn) {
            const result = await featureModules.columnSearch.searchColumn(message.columnName, message.filters);
            console.log('[Content Main] Search results:', result);
            try {
              sendResponse(result);
            } catch (e) {
              console.warn('[Content Main] Could not send response (context may be invalid):', e.message);
            }
          } else {
            try {
              sendResponse({ success: false, error: 'Column search feature not initialized' });
            } catch (e) {
              console.warn('[Content Main] Could not send error response:', e.message);
            }
          }
        } catch (err) {
          console.error('[Content Main] Error in SEARCH_COLUMN:', err);
          try {
            sendResponse({ success: false, error: err.message });
          } catch (e) {
            console.warn('[Content Main] Could not send error response:', e.message);
          }
        }
      })();
      
      return true; // Return true to keep channel open for async response
    }

    // Handle node alignment debug requests
    if (message.action === 'NODE_ALIGN_DEBUG') {
      console.log('[Content Main] NODE_ALIGN_DEBUG received');
      try {
        if (featureModules.nodeAlign && featureModules.nodeAlign.inspectNodeDragState) {
          const debugInfo = featureModules.nodeAlign.inspectNodeDragState();
          sendResponse({ success: true, debugInfo });
        } else {
          sendResponse({ success: false, error: 'Node Align feature not properly initialized' });
        }
      } catch (err) {
        console.error('[Content Main] Error in NODE_ALIGN_DEBUG:', err);
        sendResponse({ success: false, error: err.message });
      }
      return true;
    }

    // Handle node alignment requests
    if (message.action === 'NODE_ALIGN') {
      console.log('[Content Main] NODE_ALIGN received:', message.alignAction);
      
      try {
        if (featureModules.nodeAlign) {
          const action = message.alignAction;
          
          // Use async IIFE to handle async alignment operations
          (async () => {
            let success = false;
            let resultMessage = '';
            
            try {
              switch(action) {
                case 'centerVertically':
                  success = await featureModules.nodeAlign.centerNodesVertically();
                  resultMessage = 'Nodes centered vertically';
                  break;
                case 'centerHorizontally':
                  success = await featureModules.nodeAlign.centerNodesHorizontally();
                  resultMessage = 'Nodes centered horizontally';
                  break;
                default:
                  success = false;
                  resultMessage = 'Unknown alignment action';
              }
              
              try {
                sendResponse({
                  success: success,
                  message: resultMessage,
                  error: success ? null : 'Alignment failed. Select at least 2 nodes (3 for distribution).'
                });
              } catch (e) {
                console.warn('[Content Main] Could not send alignment response:', e.message);
              }
            } catch (err) {
              console.error('[Content Main] Error during alignment:', err);
              try {
                sendResponse({ success: false, error: err.message });
              } catch (e) {
                console.warn('[Content Main] Could not send error response:', e.message);
              }
            }
          })();
        } else {
          sendResponse({ success: false, error: 'Node Align feature not initialized' });
        }
      } catch (err) {
        console.error('[Content Main] Error in NODE_ALIGN:', err);
        sendResponse({ success: false, error: err.message });
      }
      return true;
    }

    // Handle tile highlight requests
    if (message.action === 'HIGHLIGHT_TILE') {
      console.log('[Content Main] HIGHLIGHT_TILE received:', message.tileId);
      try {
        if (featureModules.columnSearch?.highlightTile) {
          const result = featureModules.columnSearch.highlightTile(message.tileId);
          sendResponse({ success: result });
        } else {
          sendResponse({ success: false, error: 'Column search feature not initialized' });
        }
      } catch (err) {
        console.error('[Content Main] Error in HIGHLIGHT_TILE:', err);
        sendResponse({ success: false, error: err.message });
      }
      return true;
    }

    // Handle clear analyzer columns requests
    if (message.type === 'clearAnalyzerColumns') {
      console.log('[Content Main] clearAnalyzerColumns received');
      
      try {
        // Send immediate response to keep port open
        sendResponse({ success: true, started: true });
      } catch (e) {
        console.warn('[Content Main] Could not send response:', e.message);
      }
      
      // Do the actual work in the background without waiting
      (async () => {
        try {
          let count = 0;
          const autoSelectTable = message.autoSelectTable || false;
          
          const removeNextColumn = () => {
            // Re-query for X buttons each time (they change after each removal)
            const xIcons = document.querySelectorAll('i.icon-x-circle-outline');
            const xButtons = Array.from(xIcons).map(icon => icon.closest('button')).filter(btn => btn !== null);
            
            console.log(`[Content Main] Remaining columns: ${xButtons.length}`);
            
            if (xButtons.length === 0) {
              // All done removing columns
              if (autoSelectTable) {
                console.log(`[Content Main] Auto-selecting table chart type`);
                selectTableChartType();
              }
              
              console.log(`[Content Main] Completed: ${count} columns cleared`);
              return; // No response needed since we already responded above
            }
            
            // Always click the first button (since others shift after removal)
            const xButton = xButtons[0];
            console.log(`[Content Main] Clicking X button to open popover (${count + 1})`);
            
            // Click the X button to open the popover
            xButton.click();
            
            // Wait for popover to appear, then click remove button
            setTimeout(() => {
              const removeBtn = document.querySelector('button.remove-button.db-button');
              if (removeBtn) {
                console.log(`[Content Main] Clicking remove column button`);
                removeBtn.click();
                count++;
              } else {
                console.log(`[Content Main] Could not find remove button`);
              }
              
              // Move to next column with delay
              setTimeout(removeNextColumn, 300);
            }, 150);
          };
          
          console.log(`[Content Main] Starting column removal process`);
          removeNextColumn();
        } catch (err) {
          console.error('[Content Main] Error in clearAnalyzerColumns:', err);
        }
      })();
      
      return true; // Keep channel open
    }

    // Helper function to select table chart type
    function selectTableChartType() {
      // Look for the table chart type element with class containing 'basic-table-small'
      const tableChartElement = document.querySelector('[data-ui-test-chart-type="badge_basic_table"]');
      
      if (tableChartElement) {
        console.log(`[Content Main] Found table chart type element, clicking it`);
        tableChartElement.click();
      } else {
        console.log(`[Content Main] Could not find table chart type element`);
      }
    }

    // Apply favicon to the page
    if (message.type === 'APPLY_FAVICON' && message.faviconDataUrl) {
      console.log('[Content Main] APPLY_FAVICON received');
      try {
        // Wait for page to finish loading before applying favicon (like domo-toolkit)
        const applyFavicon = () => {
          // STEP 1: Install mutation observer to block page from changing favicon
          const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
              if (mutation.type === 'childList') {
                mutation.addedNodes.forEach((node) => {
                  if (node.nodeName === 'LINK' && (node.rel === 'icon' || node.rel === 'shortcut icon')) {
                    // If it's not ours, remove it immediately
                    if (node.id !== 'dh-custom-favicon') {
                      node.remove();
                    }
                  }
                });
              }
            });
          });

          observer.observe(document.head, { childList: true, subtree: false });
          window.__domoHelperFaviconObserver = observer;

          // STEP 2: Remove all existing favicon links
          const faviconLinks = document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]');
          faviconLinks.forEach(link => {
            link.remove();
          });

          // STEP 3: Create and inject our favicon
          const link = document.createElement('link');
          link.id = 'dh-custom-favicon';
          link.rel = 'icon';
          link.href = message.faviconDataUrl;
          link.type = 'image/png';
          document.head.insertBefore(link, document.head.firstChild);
          
          // STEP 4: Backup favicon with different rel attribute
          const link2 = document.createElement('link');
          link2.id = 'dh-custom-favicon-2';
          link2.rel = 'shortcut icon';
          link2.href = message.faviconDataUrl;
          link2.type = 'image/png';
          document.head.insertBefore(link2, document.head.firstChild);

          console.log('[Content Main] Favicon applied successfully');
        };

        // Check if page is already loaded
        if (document.readyState === 'complete') {
          // Page already loaded, apply immediately
          applyFavicon();
        } else {
          // Wait for page to load
          window.addEventListener('load', applyFavicon, { once: true });
        }
        
        sendResponse({ success: true });
      } catch (err) {
        console.error('[Content Main] Error applying favicon:', err);
        sendResponse({ success: false, error: err.message });
      }
      return true;
    }
    
    return false; // No async response needed for other message types
  });
  
  // Signal that content script is ready - message listener is now registered
  window.domoHelperContentScriptReady = true;
  console.log('[Content Main] Message listener registered and ready');
  
  // === NEW CONTEXT UPDATE LISTENER ===
  // Listen for context broadcasts from background service worker
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'TAB_CONTEXT_UPDATED' && message.context) {
      console.log('[Content Main] Context updated:', message.context.domoObject?.typeId);
      
      // Store context in window for feature access
      window.__domoHelperContext = message.context;
      
      // Notify all subscribers
      window.__domoHelperContextUpdateCallbacks.forEach(callback => {
        try {
          callback(message.context);
        } catch (err) {
          console.warn('[Content Main] Context callback error:', err.message);
        }
      });
    }
    return false;
  });
  
  console.log('[Content Main] Context update listener registered');
  
  // Cleanup when leaving relevant pages
  function cleanupAll() {
    // Mark this context as invalid to prevent stale listeners from responding
    window.__domoHelperContentMainValid = false;
    
    featureModules.pageFullText?.cleanup?.();
    featureModules.pageJumpTo?.cleanup?.();
    featureModules.magicRecipes?.cleanup?.();
    featureModules.graphMenu?.cleanup?.();
    featureModules.versionNotes?.cleanup?.();
    featureModules.selectColumnsReorder?.cleanup?.();
    featureModules.selectColumnsRename?.cleanup?.();
    featureModules.columnSearch?.cleanup?.();
  
    // Remove injected CSS
    document.querySelectorAll("link[href*='dh-page-style.css'], link[href*='dh-graph-style.css']").forEach(l => l.remove());
    loadedForThisUrl = false;
  }
  
  // Watch for context changes from background service worker
  window.subscribeToContextUpdates((context) => {
    console.log(`[Content Main] Context changed: ${context?.domoObject?.typeId}`);
    
    // Clean up if no longer relevant
    if (!ContextHelper.isRelevantType()) {
      cleanupAll();
      return;
    }
    
    // Reload features for new context
    cleanupAll();
    loadFeaturesForPage();
  });
  
  // Initial boot
  document.onreadystatechange = function () {
    if (document.readyState === 'complete') {
      console.log('Page Loaded & Domo Helper Active');
      
      // Notify background service worker of initial page load (new domo-toolkit pattern)
      try {
        if (chrome && chrome.runtime && chrome.runtime.id) {
          chrome.runtime.sendMessage({ type: 'DETECT_PAGE_TYPE' }).catch(() => {
            console.log('[Content Main] Background service worker not ready for initial detection');
          });
        }
      } catch (error) {
        console.log('[Content Main] Could not send initial detection message:', error.message);
      }
    }
  };
  
  // Wait for initial context from background, then load features
  const initialContextCheck = setInterval(() => {
    if (window.__domoHelperContext) {
      clearInterval(initialContextCheck);
      if (ContextHelper.isRelevantType()) {
        loadFeaturesForPage();
      }
    }
  }, 100);
  
  // Timeout after 5 seconds
  setTimeout(() => clearInterval(initialContextCheck), 5000);
  