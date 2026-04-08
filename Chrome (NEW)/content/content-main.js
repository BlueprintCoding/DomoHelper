// content/content-main.js

// === PAGE DETECTION MODULE ===
import PageDetector from './modules/page-detector.js';

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
  
    // Shared settings defaults
    let currentSettings = {
      enabled: true,
      removeLinks: false,
      forceVersionNotes: true,
      minWords: 5
    };
  
    // Fetch stored settings and then init features
    chrome.storage.local.get(['enabled', 'removeLinks', 'forceVersionNotes', 'minWords'], async (settings) => {
      currentSettings = {
        enabled: settings.enabled !== undefined ? settings.enabled : currentSettings.enabled,
        removeLinks: settings.removeLinks !== undefined ? settings.removeLinks : currentSettings.removeLinks,
        forceVersionNotes: settings.forceVersionNotes !== undefined ? settings.forceVersionNotes : currentSettings.forceVersionNotes,
        minWords: settings.minWords || currentSettings.minWords
      };
  
      // PAGE features
      if (PageDetector.isPage()) {
        // Inject page CSS
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.type = 'text/css';
        css.href = chrome.runtime.getURL('css/dh-page-style.css');
        document.head.appendChild(css);
  
        // Full text modal feature
        featureModules.pageFullText = (await import(chrome.runtime.getURL('content/features/feature-page-fulltext.js'))).default;
        featureModules.pageFullText.init({ DH, settings: currentSettings, PageDetector });
  
        // "Jump to:" body navigation
        featureModules.pageJumpTo = (await import(chrome.runtime.getURL('content/features/feature-page-jump-to.js'))).default;
        featureModules.pageJumpTo.init({ DH, PageDetector });
      }
  
      // GRAPH features (Magic ETL)
      if (PageDetector.isMagicETL()) {
        // Inject graph CSS
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.type = 'text/css';
        css.href = chrome.runtime.getURL('css/dh-graph-style.css');
        document.head.appendChild(css);
  
        // Magic ETL recipes (UI + storage + insertion)
        featureModules.magicRecipes = (await import(chrome.runtime.getURL('content/features/feature-magic-recipes.js'))).default;
        featureModules.magicRecipes.init({ DH, PageDetector });
  
        // Domo Helper menu in sidebar
        featureModules.graphMenu = (await import(chrome.runtime.getURL('content/features/feature-graph-menu.js'))).default;
        featureModules.graphMenu.init({ DH, PageDetector });

        // Select Columns reorder functionality
        featureModules.selectColumnsReorder = (await import(chrome.runtime.getURL('content/features/feature-select-columns-reorder.js'))).default;
        featureModules.selectColumnsReorder.init({ DH, PageDetector });

        // Select Columns rename functionality
        featureModules.selectColumnsRename = (await import(chrome.runtime.getURL('content/features/feature-select-columns-rename.js'))).default;
        featureModules.selectColumnsRename.init({ DH, PageDetector });

        // Column Search functionality
        featureModules.columnSearch = (await import(chrome.runtime.getURL('content/features/feature-column-search.js'))).default;
        console.log('[Content Main] Column Search feature imported successfully');
        featureModules.columnSearch.init({ DH, PageDetector });
        console.log('[Content Main] Column Search feature initialized');
      }
  
      // Version Notes enforcement (applies to SQL Author + Magic ETL Graph)
      if (PageDetector.isSQLAuthor() || PageDetector.isMagicETL()) {
        featureModules.versionNotes = (await import(chrome.runtime.getURL('content/features/feature-version-notes.js'))).default;
        featureModules.versionNotes.init({ 
          DH, 
          PageDetector,
          isAuthor: PageDetector.isSQLAuthor(),
          isGraph: PageDetector.isMagicETL(),
          settings: currentSettings 
        });
      }
    });
  }
  
  // Set up message listener IMMEDIATELY (outside loadFeaturesForPage so it's available right away)
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[Content Main] Received message:', message);
    
    // Health check - verify content script is ready
    if (message.action === 'PING') {
      console.log('[Content Main] PING received');
      sendResponse({ pong: true, columnSearchReady: !!featureModules.columnSearch });
      return true;
    }
    
    // Get page type - used by side panel to determine context
    if (message.action === 'GET_PAGE_TYPE') {
      const pageType = PageDetector.getPageType();
      console.log('[Content Main] GET_PAGE_TYPE requested, returning:', pageType);
      sendResponse({ pageType, description: PageDetector.describe() });
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
          const result = featureModules.magicRecipes.insertRecipeData(message.recipeData);
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
    
    return false; // No async response needed for other message types
  });
  
  // Cleanup when leaving relevant pages
  function cleanupAll() {
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
  
  // Watch for URL changes and reload features if page type changes
  PageDetector.startUrlMonitoring((newPageType, previousUrl) => {
    console.log(`[Content Main] URL changed from ${previousUrl} to ${window.location.href}, page type: ${newPageType}`);
    
    // clean up if no longer relevant
    if (!PageDetector.isRelevant()) {
      cleanupAll();
      return;
    }
    
    // reload features for new context
    cleanupAll();
    loadFeaturesForPage();
  });
  
  // Initial boot
  document.onreadystatechange = function () {
    if (document.readyState === 'complete') {
      console.log('Page Loaded & Domo Helper Active');
    }
  };
  
  // If relevant at load, start features
  if (PageDetector.isRelevant()) {
    loadFeaturesForPage();
  } else {
    cleanupAll();
  }
  