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

// Import helper modules
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
        return;
      }
    }

    // Context changed or first detection - store and broadcast
    console.log(
      `[Background] ✓ Detected ${context.domoObject?.typeName} "${context.domoObject?.metadata?.name || context.domoObject?.id}" on tab ${tabId}`
    );
    setTabContext(tabId, context);
    tabRetryCount.delete(tabId);

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

  return false;
});

// ============================================================
// INITIALIZATION
// ============================================================

restoreFromSession();
console.log('[Background] Service worker initialized');
