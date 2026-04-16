/**
 * Background Service Worker - Refactored with Domo Toolkit Architecture
 * 
 * Implements context tracking with:
 * - Rich DomoContext/DomoObject models
 * - Page context execution for accurate detection
 * - LRU caching with stale detection prevention
 * - Multiple detection triggers (tab activation, URL change, SPA nav, manual)
 * - Session persistence for service worker restarts
 */

// Import helper modules using import.meta.url for proper module resolution
import { DomoContext } from './src/models/DomoContext.js';
import { DomoObject, DomoObjectType } from './src/models/DomoObject.js';
import { executeInPage } from './src/utils/executeInPage.js';
import { detectCurrentObject } from './src/utils/detectCurrentObject.js';

// ============================================================
// CACHE & MANAGEMENT
// ============================================================

const tabContexts = new Map();
const tabAccessTimes = new Map();
const tabDetectionGen = new Map();
const tabRetryCount = new Map();

// ===== FAVICON OPTIMIZATION TRACKING =====
// Option 3: Track last favicon URL per tab to avoid setting the same favicon twice
const lastFaviconPerTab = new Map();
// Option 2: Track debounce timers per tab to prevent rapid successive favicon updates
const faviconDebounceTimers = new Map();
const FAVICON_DEBOUNCE_MS = 500; // Wait 500ms before setting favicon

const MAX_CACHED_TABS = 10;
const MAX_RETRIES = 5;
const SESSION_STORAGE_KEY = 'domoHelperContexts';

/**
 * LRU eviction - remove least recently used tab if cache is full
 */
function evictLRUIfNeeded() {
  if (tabContexts.size >= MAX_CACHED_TABS) {
    let oldestTabId = null;
    let oldestTime = Infinity;

    for (const [tabId, time] of tabAccessTimes.entries()) {
      if (time < oldestTime) {
        oldestTime = time;
        oldestTabId = tabId;
      }
    }

    if (oldestTabId !== null) {
      console.log(`[Background] Evicting LRU tab ${oldestTabId}`);
      tabContexts.delete(oldestTabId);
      tabAccessTimes.delete(oldestTabId);
      tabDetectionGen.delete(oldestTabId);
      tabRetryCount.delete(oldestTabId);
    }
  }
}

/**
 * Touch tab to update LRU timestamp
 */
function touchTab(tabId) {
  tabAccessTimes.set(tabId, Date.now());
}

/**
 * Get context from cache
 */
function getTabContext(tabId) {
  touchTab(tabId);
  const context = tabContexts.get(tabId);
  return context ? DomoContext.fromJSON(context) : null;
}

/**
 * Store context and broadcast to all listeners
 */
function setTabContext(tabId, context) {
  evictLRUIfNeeded();
  tabContexts.set(tabId, context.toJSON());
  touchTab(tabId);
  persistToSession();
  broadcastContextUpdate(tabId, context);
}

/**
 * Broadcast context to all listeners
 */
function broadcastContextUpdate(tabId, context) {
  const contextJson = context.toJSON ? context.toJSON() : context;

  // Send to content script in specific tab
  chrome.tabs.sendMessage(tabId, {
    type: 'TAB_CONTEXT_UPDATED',
    context: contextJson
  }).catch(() => {
    // Tab might not have content script yet
  });

  // Broadcast to extension pages (popup, side panel)
  chrome.runtime.sendMessage({
    type: 'TAB_CONTEXT_UPDATED',
    tabId,
    context: contextJson
  }).catch(() => {
    // No listeners open
  });
}

/**
 * Persist contexts to session storage
 */
async function persistToSession() {
  try {
    const data = {};
    for (const [tabId, context] of tabContexts.entries()) {
      data[tabId] = context;
    }
    await chrome.storage.session.set({ [SESSION_STORAGE_KEY]: data });
  } catch (error) {
    console.error('[Background] Error persisting to session:', error);
  }
}

/**
 * Restore contexts from session storage on startup
 */
async function restoreFromSession() {
  try {
    const result = await chrome.storage.session.get([SESSION_STORAGE_KEY]);
    const data = result[SESSION_STORAGE_KEY] || {};

    for (const [tabId, context] of Object.entries(data)) {
      try {
        const restored = DomoContext.fromJSON(context);
        tabContexts.set(parseInt(tabId), restored.toJSON());
        touchTab(parseInt(tabId));
      } catch (e) {
        console.warn(`Failed to restore tab ${tabId}:`, e);
      }
    }

    console.log(`[Background] Restored ${tabContexts.size} contexts from session`);
  } catch (error) {
    console.error('[Background] Error restoring from session:', error);
  }
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function isDomoDomain(url) {
  return url && /^https:\/\/.*\.domo\.com\//.test(url);
}

/**
 * Inject content script if not already loaded
 */
async function ensureContentScript(tabId) {
  try {
    // Try to ping the content script
    await Promise.race([
      chrome.tabs.sendMessage(tabId, { type: 'PING' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
    ]);
    return true;
  } catch {
    // Content script not loaded, inject it
    try {
      console.log(`[Background] Injecting content script into tab ${tabId}`);
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['jquery-3.7.1.min.js'],
        world: 'ISOLATED'
      });
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content/loader.js'],
        world: 'ISOLATED'
      });
      console.log(`[Background] ✓ Content script injected into tab ${tabId}`);
      return true;
    } catch (error) {
      console.log(`[Background] Could not inject content script:`, error.message);
      return false;
    }
  }
}

// ============================================================
// MAIN DETECTION FUNCTION
// ============================================================

/**
 * Detect and store context for a tab
 * Executes detection in page context for accurate results
 */
async function detectAndStoreContext(tabId) {
  // Increment generation counter to prevent stale detections
  const gen = (tabDetectionGen.get(tabId) || 0) + 1;
  tabDetectionGen.set(tabId, gen);

  try {
    const isRedetection = tabContexts.has(tabId);
    console.log(
      `[Background] Detecting context for tab ${tabId} (gen ${gen}, redetect: ${isRedetection})`
    );

    // Get tab info
    const tab = await chrome.tabs.get(tabId);
    if (!tab || !isDomoDomain(tab.url)) {
      console.log(`[Background] Tab ${tabId} is not a Domo page`);
      return;
    }

    // Ensure content script is loaded
    await ensureContentScript(tabId);

    // Execute detection in page context
    let detected = await executeInPage(detectCurrentObject, [], tabId);

    // Ignore stale responses
    if (tabDetectionGen.get(tabId) !== gen) {
      console.log(`[Background] Stale response for tab ${tabId}, ignoring`);
      return;
    }

    // If detection failed, use cached context or broadcast error
    if (!detected) {
      console.log(`[Background] No object detected on tab ${tabId}`);
      const cached = tabContexts.get(tabId);
      if (!isRedetection && cached) {
        broadcastContextUpdate(tabId, DomoContext.fromJSON(cached));
      }
      return;
    }

    console.log(`[Background] Detected object - ID: ${detected.id}, Type: ${detected.typeId}, URL: ${detected.url}`);

    // Create DomoObject from detection result
    const domoObject = new DomoObject(
      detected.typeId,
      detected.id,
      detected.baseUrl,
      {},
      detected.url,
      detected.parentId || null
    );

    // Create DomoContext
    const context = new DomoContext(
      tabId,
      tab.url,
      domoObject,
      null,
      null
    );

    // Check if context changed (for re-detection suppression)
    const previousContext = tabContexts.get(tabId);
    let contextChanged = true;

    if (previousContext && isRedetection) {
      const prev = DomoContext.fromJSON(previousContext);
      contextChanged =
        prev.url !== context.url ||
        prev.domoObject?.id !== context.domoObject?.id ||
        prev.domoObject?.typeId !== context.domoObject?.typeId;

      if (!contextChanged) {
        console.log(`[Background] Context unchanged, silently updating for tab ${tabId}`);
        evictLRUIfNeeded();
        tabContexts.set(tabId, context.toJSON());
        touchTab(tabId);
        persistToSession();
        tabRetryCount.delete(tabId);
        
        // NOTE: Favicon NOT reapplied on silent updates - prevents redundant settings
        
        // Still enrich metadata even on silent updates
        enrichContextMetadata(tabId, context, detected);
        return;
      }
    }

    // Context changed or first detection - store and broadcast
    console.log(
      `[Background] ✓ Detected ${context.domoObject?.typeName} "${context.domoObject?.metadata?.name || context.domoObject?.id}" on tab ${tabId}`
    );
    setTabContext(tabId, context);
    tabRetryCount.delete(tabId);

    // Set favicon immediately based on detected type (will be updated with metadata during enrichment)
    setCustomFavicon(tabId, context.domoObject?.typeId);

    // Enrich metadata asynchronously (non-blocking)
    enrichContextMetadata(tabId, context, detected);

  } catch (error) {
    console.log(`[Background] Detection error for tab ${tabId}:`, error.message);

    const isRedetection = tabContexts.has(tabId);
    const isConnectionError = error.message.includes('Could not establish') ||
      error.message.includes('Receiving end') ||
      error.message.includes('timeout') ||
      error.message.includes('tab');

    // Retry on connection errors
    if (isConnectionError) {
      const retries = (tabRetryCount.get(tabId) || 0) + 1;
      tabRetryCount.set(tabId, retries);

      if (retries < MAX_RETRIES) {
        console.log(
          `[Background] Connection error, retrying (${retries}/${MAX_RETRIES})...`
        );
        setTimeout(() => {
          if (tabDetectionGen.get(tabId) === gen) {
            detectAndStoreContext(tabId);
          }
        }, 500);
        return;
      } else {
        console.log(`[Background] Max retries exceeded for tab ${tabId}`);
        tabRetryCount.delete(tabId);

        // Try injecting content script as fallback
        const injected = await ensureContentScript(tabId);
        if (injected) {
          setTimeout(() => detectAndStoreContext(tabId), 500);
          return;
        }
      }
    }

    // Use cached context or fall back to error
    const cached = tabContexts.get(tabId);
    if (cached && isRedetection) {
      console.log(`[Background] Using cached context for tab ${tabId}`);
      broadcastContextUpdate(tabId, DomoContext.fromJSON(cached));
    } else if (!isRedetection) {
      // First detection failed, broadcast error
      const errorContext = new DomoContext(tabId, (await chrome.tabs.get(tabId)).url, null);
      setTabContext(tabId, errorContext);
    }
  }
}

/**
 * Resolve a path expression in an object (supports nested objects and arrays)
 * Examples: 'name', '[0].title', 'details.owner.name'
 */
function resolvePath(path, data) {
  if (!path || !data) return null;
  
  // Split path into parts: 'details.owner.name' → ['details', 'owner', 'name']
  // Also handles array indexes: '[0].title' → ['[0]', 'title'] → ['0', 'title']
  const parts = (path.match(/[^.[\]]+/g) || []);
  
  return parts.reduce((current, prop) => {
    if (!current) return null;
    return current[prop] ?? null;
  }, data);
}

/**
 * Enrich context with API metadata (name, description, etc.)
 * Runs asynchronously without blocking initial context broadcast
 * Using domo-toolkit's path-based approach
 */
async function enrichContextMetadata(tabId, context, detected) {
  if (!context?.domoObject?.id || !context?.domoObject?.typeId) {
    console.log('[Background] Skipping enrichment - no object ID or type');
    return;
  }

  try {
    const { typeId, id: objectId } = context.domoObject;
    console.log(`[Background] Starting enrichment for ${typeId} ${objectId}`);
    
    // Special handling for ANALYZER pages - no API call needed
    if (typeId === 'ANALYZER') {
      const objIdNum = parseInt(objectId, 10);
      let name = 'Analyzer';
      
      if (objIdNum < 0) {
        name = 'Unsaved Analyzer';
      }
      
      // Update context with analyzer name 
      const cachedJson = tabContexts.get(tabId);
      if (cachedJson) {
        const cachedContext = DomoContext.fromJSON(cachedJson);
        cachedContext.domoObject.metadata = {
          ...cachedContext.domoObject.metadata,
          name,
          details: {}
        };
        setTabContext(tabId, cachedContext);
        updateTabTitle(tabId, name);
        setCustomFavicon(tabId, typeId);
      }
      console.log(`[Background] ✓ Enriched ANALYZER: "${name}"`);
      return;
    }
    
    // API Configuration using domo-toolkit pattern
    const apiConfigs = {
      'CARD': {
        endpoint: `/api/content/v1/cards?urns=${objectId}&includeFiltered=true&parts=metadata,datasources,domoapp,owners`,
        pathToDetails: '[0]',
        pathToName: '[0].title'
      },
      'PAGE': {
        endpoint: `/api/content/v3/stacks/${objectId}`,
        pathToDetails: '.',
        pathToName: 'title'
      },
      'MAGIC_ETL': {
        endpoint: `/api/dataprocessing/v2/dataflows/${objectId}`,
        pathToDetails: '.',
        pathToName: 'name'
      },
      'DATAFLOW_TYPE': {
        endpoint: `/api/dataprocessing/v2/dataflows/${objectId}`,
        pathToDetails: '.',
        pathToName: 'name'
      },
      'DATA_SOURCE': {
        endpoint: `/api/data/v3/datasources/${objectId}?includeAllDetails=true`,
        pathToDetails: '.',
        pathToName: 'name'
      }
    };

    const config = apiConfigs[typeId];
    if (!config) {
      console.log(`[Background] No API config for type ${typeId}, skipping enrichment`);
      return;
    }

    console.log(`[Background] Fetching metadata from ${config.endpoint}`);

    // Execute API call in page context
    const apiResponse = await executeInPage(
      async (endpoint) => {
        try {
          const response = await fetch(endpoint, {
            credentials: 'include',
            headers: {
              'Accept': 'application/json'
            }
          });
          
          if (!response.ok) {
            console.log('[Page Context] API response not OK:', response.status);
            return null;
          }
          
          const data = await response.json();
          console.log('[Page Context] ✓ Got API response, type:', typeof data, 'keys:', Array.isArray(data) ? `array[${data.length}]` : Object.keys(data).slice(0,5).join(','));
          return data;
        } catch (e) {
          console.log('[Page Context] Fetch error:', e.message);
          return null;
        }
      },
      [config.endpoint],
      tabId
    );

    if (!apiResponse) {
      console.log(`[Background] No API response returned`);
      return;
    }

    // Extract details and name using path resolution (domo-toolkit style)
    const details = config.pathToDetails === '.'
      ? apiResponse
      : resolvePath(config.pathToDetails, apiResponse);

    const name = resolvePath(config.pathToName, apiResponse);

    console.log(`[Background] Extracted: details=${!!details}, name="${name}"`);

    if (name) {
      // Get the cached context
      const cachedJson = tabContexts.get(tabId);
      if (!cachedJson) {
        console.log(`[Background] No cached context found for tab ${tabId}`);
        return;
      }

      // Reconstruct DomoContext from JSON
      const cachedContext = DomoContext.fromJSON(cachedJson);
      
      if (cachedContext?.domoObject?.id !== objectId) {
        console.log(`[Background] Cached context ID mismatch`);
        return;
      }

      // Update metadata with enriched name and details
      cachedContext.domoObject.metadata = {
        ...cachedContext.domoObject.metadata,
        name,
        details: details || apiResponse
      };
      
      console.log(`[Background] ✓ Enriched ${typeId} ${objectId}: "${name}"`);
      
      // Re-store and broadcast with enriched metadata
      setTabContext(tabId, cachedContext);
      
      // Update browser tab title if setting is enabled
      updateTabTitle(tabId, name);
      
      // Set custom favicon based on object type
      setCustomFavicon(tabId, typeId);
    } else {
      console.log(`[Background] Could not extract name from response using path "${config.pathToName}"`);
    }
  } catch (error) {
    console.log(`[Background] Enrichment error for tab ${tabId}:`, error.message);
  }
}

/**
 * Update the browser tab title with the object name
 * Respects user settings for stripping certain strings
 */
async function updateTabTitle(tabId, objectName) {
  try {
    // Get user settings
    const settings = await chrome.storage.local.get([
      'updateTabTitle',
      'tabTitleStripPatterns'
    ]);
    
    const updateTabTitle = settings.updateTabTitle !== false;  // Default: true
    if (!updateTabTitle) {
      console.log('[Background] Tab title updates disabled by user');
      return;
    }
    
    let displayName = objectName;
    
    // Apply user-defined strip patterns
    if (settings.tabTitleStripPatterns) {
      const patterns = settings.tabTitleStripPatterns.split('\n').filter(p => p.trim());
      for (const pattern of patterns) {
        displayName = displayName.replace(new RegExp(pattern.trim(), 'gi'), '').trim();
      }
    }
    
    if (displayName && displayName !== objectName) {
      console.log(`[Background] Stripped title: "${objectName}" → "${displayName}"`);
    }
    
    const finalTitle = displayName + ' - Domo';
    
    // Simple title update - set it once on page load
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (targetTitle) => {
        // Only set if title is generic "Domo" or empty
        if (document.title === 'Domo' || document.title === '') {
          document.title = targetTitle;
        }
      },
      args: [finalTitle],
      world: 'MAIN'
    });
    
    console.log(`[Background] ✓ Updated tab title to: "${finalTitle}"`);
  } catch (error) {
    console.log(`[Background] Could not update tab title:`, error.message);
  }
}

/**
 * Set custom favicon based on object type
 * Includes cache-busting to force browser reload
 * 
 * Implements 3 optimization techniques:
 * 1. Debounce: Wait 500ms before setting to batch rapid calls
 * 2. Deduplication: Skip if favicon URL hasn't changed since last set
 * 3. Silent update suppression: Don't reapply on silent/unchanged context updates
 */
async function setCustomFavicon(tabId, objectType) {
  console.log(`[Background] setCustomFavicon called - tabId: ${tabId}, objectType: ${objectType}`);
  try {
    // Map object types to favicon files
    const faviconMap = {
      'PAGE': 'dashboard.png',
      'CARD': 'cards.png',
      'ANALYZER': 'analyzer.png',
      'MAGIC_ETL': 'magic-etl.png',
      'DATAFLOW_TYPE': 'dataflows.png',
      'MYSQL_DATAFLOW': 'sql.png',
      'SQL_DATAFLOW': 'sql.png',
      'DATA_SOURCE': 'dataset.png',
      'DATA_VIEW': 'view.png',
      'WORKSHEET_VIEW': 'worksheets.png',
      'DATA_APP_VIEW': 'apps.png',
      'SQL_AUTHOR': 'sql.png',
      'ADMIN': 'admin.png',
      'WORKFLOW': 'workflows.png',
      'WORKFLOW_INSTANCE': 'workflows.png',
      'WORKFLOW_MODEL': 'workflows.png',
      'HOPPER_TASK': 'workflows.png',
      'WORKFLOW_TRIGGER': 'workflows.png',
      'ALERT': 'workflows.png',
      'DRILL_VIEW': 'cards.png',
      'USER': 'dashboard.png',
      'GROUP': 'dashboard.png',
      'ROLE': 'admin.png',
      'BEAST_MODE_FORMULA': 'sql.png'
    };

    const faviconFile = faviconMap[objectType];
    if (!faviconFile) {
      console.log(`[Background] No favicon mapping for type: ${objectType}`);
      return;
    }

    // Add cache-bust parameter with timestamp
    const faviconUrl = chrome.runtime.getURL(`icons/tab-custom-favicons/${faviconFile}?v=${Date.now()}`);
    
    // OPTION 3: Check if favicon URL has already been set for this tab
    const lastUrl = lastFaviconPerTab.get(tabId);
    if (lastUrl === faviconUrl) {
      console.log(`[Background] Skipping favicon update - already set to: ${faviconFile}`);
      return; // Skip if same favicon already set
    }
    
    // OPTION 2: Implement debounce - only set favicon once per 500ms window
    // Clear any pending timer for this tab
    const existingTimer = faviconDebounceTimers.get(tabId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      console.log(`[Background] Favicon update debounced for tab ${tabId}`);
    }
    
    // Set a new debounce timer
    const newTimer = setTimeout(async () => {
      faviconDebounceTimers.delete(tabId);
      
      console.log(`[Background] Setting favicon for ${objectType}: ${faviconFile} (tab ${tabId})`);

      try {
        // Convert PNG to data URL (like domo-toolkit does)
        let faviconDataUrl;
        try {
          const response = await fetch(faviconUrl);
          const blob = await response.blob();
          faviconDataUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });
          console.log(`[Background] Converted favicon to data URL`);
        } catch (fetchError) {
          console.log(`[Background] Could not convert to data URL, using URL directly:`, fetchError.message);
          faviconDataUrl = faviconUrl;
        }

        // Send message to content script to apply favicon
        try {
          await chrome.tabs.sendMessage(tabId, {
            type: 'APPLY_FAVICON',
            faviconDataUrl: faviconDataUrl
          });
          console.log(`[Background] Favicon message sent to tab ${tabId}`);
        } catch (error) {
          console.log(`[Background] Could not send favicon message to tab ${tabId}:`, error.message);
        }
        
        // Remember this favicon URL for this tab
        lastFaviconPerTab.set(tabId, faviconUrl);
      } catch (error) {
        console.log(`[Background] Could not set favicon:`, error.message);
      }
    }, FAVICON_DEBOUNCE_MS);
    
    faviconDebounceTimers.set(tabId, newTimer);
    console.log(`[Background] Favicon debounce timer set for tab ${tabId} (${FAVICON_DEBOUNCE_MS}ms delay)`);

  } catch (error) {
    console.log(`[Background] Could not set favicon:`, error.message);
  }
}

// ============================================================
// EVENT LISTENERS
// ============================================================

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
  if (isDomoDomain(tab.url)) {
    detectAndStoreContext(tab.id).catch(() => {});
  }
});

// EAGER detection: Tab activation
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab && isDomoDomain(tab.url)) {
      console.log(`[Background] Tab ${tabId} activated, detecting...`);
      detectAndStoreContext(tabId);
    }
  } catch (error) {
    console.error(`[Background] Error in onActivated:`, error);
  }
});

// LAZY detection: URL changes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && isDomoDomain(tab.url)) {
    console.log(`[Background] Tab ${tabId} page loaded, detecting...`);
    
    // If we have cached metadata, immediately apply the title (but NOT favicon to avoid duplicates)
    // detectAndStoreContext will set the appropriate favicon when detection completes
    const cachedContext = tabContexts.get(tabId);
    if (cachedContext?.domoObject?.metadata?.name) {
      console.log(`[Background] Applying cached title for tab ${tabId}`);
      updateTabTitle(tabId, cachedContext.domoObject.metadata.name);
      // NOTE: Favicon setting removed from here - prevents duplicate favicon updates
      // detectAndStoreContext will set favicon after detection completes
    }
    
    detectAndStoreContext(tabId);
  }
});

// SPA navigation detection
chrome.webNavigation.onHistoryStateUpdated.addListener(({ tabId, url }) => {
  if (isDomoDomain(url)) {
    console.log(`[Background] Tab ${tabId} SPA navigation detected, detecting...`);
    detectAndStoreContext(tabId);
  }
});

// Cleanup on tab close
chrome.tabs.onRemoved.addListener((tabId) => {
  console.log(`[Background] Cleaning up tab ${tabId}`);
  tabContexts.delete(tabId);
  lastFaviconPerTab.delete(tabId); // Clean up favicon tracking
  
  // Cancel any pending favicon debounce timers
  const timer = faviconDebounceTimers.get(tabId);
  if (timer) {
    clearTimeout(timer);
    faviconDebounceTimers.delete(tabId);
  }
  tabAccessTimes.delete(tabId);
  tabDetectionGen.delete(tabId);
  tabRetryCount.delete(tabId);
  persistToSession();
});

// ============================================================
// MESSAGE HANDLER
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id || message.tabId;

  if (message.type === 'GET_TAB_CONTEXT') {
    if (!tabId) {
      sendResponse({ success: false, context: null });
      return true;
    }

    // Get or trigger detection
    let context = tabContexts.get(tabId);
    if (!context) {
      detectAndStoreContext(tabId).catch(() => {});
      // Return empty result, will broadcast when detection completes
      sendResponse({ success: true, context: null });
      return true;
    }

    sendResponse({ success: true, context });
    return true;
  }

  if (message.type === 'DETECT_CONTEXT') {
    if (!tabId) {
      sendResponse({ success: false });
      return true;
    }
    detectAndStoreContext(tabId);
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'REAPPLY_TAB_TITLE') {
    if (!tabId) {
      sendResponse({ success: false });
      return true;
    }
    const context = tabContexts.get(tabId);
    if (context && context.domoObject && context.domoObject.metadata && context.domoObject.metadata.name) {
      updateTabTitle(tabId, context.domoObject.metadata.name);
      // Also reapply favicon when title is reapplied
      setCustomFavicon(tabId, context.domoObject.typeId);
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, reason: 'No metadata available' });
    }
    return true;
  }

  // Cache invalidation relay (optional fallback - not currently used)
  // if (message.type === 'RELAY_CACHE_INVALIDATION') { ... }

  return false;
});

// ============================================================
// INITIALIZATION
// ============================================================

restoreFromSession();
console.log('[Background] Service worker initialized');
