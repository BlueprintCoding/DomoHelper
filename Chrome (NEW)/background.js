/**
 * Enhanced Background Service Worker
 * Implements proactive page type detection with caching and broadcast to all listeners
 * Based on domo-toolkit architecture
 */

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function isDomoDomain(url) {
    const domoRegex = /^https:\/\/.*\.domo\.com\//;
    return domoRegex.test(url);
}

/**
 * Extract instance name from URL (e.g., 'bcpequity' from 'https://bcpequity.domo.com/...')
 */
function getInstanceFromUrl(url) {
    const match = url.match(/https:\/\/([^.]+)\.domo\.com/);
    return match ? match[1] : null;
}

/**
 * Extract dataflow ID from URL
 */
function getDataflowIdFromUrl(url) {
    const match = url.match(/dataflows\/(\d+)/);
    return match ? match[1] : null;
}

// ============================================================
// TAB CONTEXT CACHING & LRU MANAGEMENT
// ============================================================

// In-memory cache of tab contexts (tabId -> context object)
const tabContexts = new Map();
// LRU tracking (tabId -> timestamp)
const tabAccessTimes = new Map();
const MAX_CACHED_TABS = 20;

// Session storage key for persistence
const SESSION_STORAGE_KEY = 'domoHelperTabContexts';

// Per-tab detection generation counter to prevent stale async callbacks
const tabDetectionGen = new Map();

// Per-tab connection error retry counter to prevent infinite retry loops
const tabRetryCount = new Map();
const MAX_RETRIES = 5; // Give up after 5 failed connection attempts

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
            console.log(`[Background] Evicting LRU tab ${oldestTabId} from cache`);
            tabContexts.delete(oldestTabId);
            tabAccessTimes.delete(oldestTabId);
            tabDetectionGen.delete(oldestTabId);
        }
    }
}

/**
 * Update LRU timestamp for a tab
 */
function touchTab(tabId) {
    tabAccessTimes.set(tabId, Date.now());
}

/**
 * Get context for a specific tab
 */
function getTabContext(tabId) {
    touchTab(tabId);
    return tabContexts.get(tabId) || null;
}

/**
 * Store context for a specific tab
 */
function setTabContext(tabId, context) {
    evictLRUIfNeeded();
    tabContexts.set(tabId, context);
    touchTab(tabId);
    
    console.log(`[Background] Stored context for tab ${tabId}:`, context);
    
    // Persist to session storage (async, non-blocking)
    persistToSession();
    
    // Broadcast to all listeners (content script, side panel, popup)
    broadcastContextUpdate(tabId, context);
}

/**
 * Broadcast context update to all listeners
 */
function broadcastContextUpdate(tabId, context) {
    // Send to content script in the specific tab
    chrome.tabs.sendMessage(tabId, {
        type: 'TAB_CONTEXT_UPDATED',
        context: context
    }).catch((error) => {
        console.log(`[Background] Could not send context to tab ${tabId}:`, error.message);
    });
    
    // Broadcast to extension pages (side panel, popup)
    chrome.runtime.sendMessage({
        type: 'TAB_CONTEXT_UPDATED',
        tabId: tabId,
        context: context
    }).catch((error) => {
        // Expected to fail if no listeners are open
    });
}

/**
 * Persist current tab contexts to session storage
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
 * Restore tab contexts from session storage on service worker wake
 */
async function restoreFromSession() {
    try {
        const result = await chrome.storage.session.get([SESSION_STORAGE_KEY]);
        const data = result[SESSION_STORAGE_KEY] || {};
        
        for (const [tabId, context] of Object.entries(data)) {
            tabContexts.set(parseInt(tabId), context);
            touchTab(parseInt(tabId));
        }
        
        console.log(`[Background] Restored ${tabContexts.size} tabs from session storage`);
    } catch (error) {
        console.error('[Background] Error restoring from session:', error);
    }
}

// ============================================================
// PAGE TYPE DETECTION
// ============================================================

/**
 * Inject content script into a tab if not already loaded
 * Uses loader.js which properly imports content-main.js as an ES6 module
 * Also injects jQuery first to match manifest order
 */
async function injectContentScript(tabId) {
    try {
        console.log(`[Background] Attempting to inject content script into tab ${tabId}`);
        
        // First inject jQuery (matches manifest order)
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['jquery-3.7.1.min.js'],
            world: 'ISOLATED'
        });
        
        // Then inject loader.js which will dynamically import content-main.js as a module
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content/loader.js'],
            world: 'ISOLATED'
        });
        console.log(`[Background] ✓ Content script injected into tab ${tabId}`);
        return true;
    } catch (error) {
        console.log(`[Background] Could not inject content script into tab ${tabId}:`, error.message);
        return false;
    }
}

/**
 * Detect page type from content script and store it
 * IMPLEMENTS RE-DETECTION SUPPRESSION PATTERN (from domo-toolkit):
 * 
 * During re-detection (when switching between dataflows):
 * 1. Silent store context (don't broadcast) until detection completes
 * 2. This prevents UI from showing null/empty state between detections
 * 3. When detection completes, broadcast the full context once
 * 
 * This fixes the "context disappears on tab switch" issue
 */
async function detectPageType(tabId) {
    // Increment generation counter OUTSIDE try-catch so both blocks can access it
    const gen = (tabDetectionGen.get(tabId) || 0) + 1;
    tabDetectionGen.set(tabId, gen);
    
    try {
        // Check if this is a re-detection (already have context for this tab)
        const isRedetection = tabContexts.has(tabId);
        console.log(`[Background] Detecting page type for tab ${tabId} (gen ${gen}, redetection: ${isRedetection})`);
        
        // Request page type from content script with timeout
        const response = await Promise.race([
            chrome.tabs.sendMessage(tabId, { action: 'GET_PAGE_TYPE' }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Detection timeout')), 3000))
        ]);
        
        // Ignore stale responses from older detection generations
        if (tabDetectionGen.get(tabId) !== gen) {
            console.log(`[Background] Ignoring stale response from tab ${tabId} (gen ${gen} vs current ${tabDetectionGen.get(tabId)})`);
            return;
        }
        
        const context = {
            pageType: response.pageType,
            description: response.description,
            url: (await chrome.tabs.get(tabId)).url,
            timestamp: Date.now()
        };
        
        // RE-DETECTION SUPPRESSION PATTERN:
        // Check if this is a re-detection AND if the context actually changed
        const previousContext = tabContexts.get(tabId);
        const contextChanged = !previousContext || 
                              previousContext.url !== context.url ||
                              previousContext.pageType !== context.pageType ||
                              previousContext.description?.objectName !== context.description?.objectName;
        
        if (isRedetection && !contextChanged) {
            // Same context - silently update without broadcasting
            console.log(`[Background] Re-detection: context unchanged, silently storing for tab ${tabId}`);
            evictLRUIfNeeded();
            tabContexts.set(tabId, context);
            touchTab(tabId);
            persistToSession();
            // Don't broadcast - UI keeps old context
            console.log(`[Background] ✓ Page type detected for tab ${tabId}:`, context.pageType);
            tabRetryCount.delete(tabId);
            return;
        }
        
        if (isRedetection && contextChanged) {
            // Context changed (different URL/flow/type) - silently store but then broadcast
            console.log(`[Background] Re-detection: context changed, storing and broadcasting for tab ${tabId}`);
            evictLRUIfNeeded();
            tabContexts.set(tabId, context);
            touchTab(tabId);
            persistToSession();
            // Will broadcast below
        } else {
            // First-time detection: broadcast immediately so UI knows it's on a Domo page
            console.log(`[Background] First detection: broadcasting context for tab ${tabId}`);
            setTabContext(tabId, context);
        }
        
        console.log(`[Background] ✓ Page type detected for tab ${tabId}:`, context.pageType);
        
        // Reset retry counter on successful detection
        tabRetryCount.delete(tabId);
        
        // Broadcast the context (for changed re-detections and first-time detections)
        if (isRedetection && contextChanged) {
            console.log(`[Background] Broadcasting updated context for tab ${tabId} (URL/flow changed)`);
            broadcastContextUpdate(tabId, context);
        }
        
    } catch (error) {
        console.log(`[Background] Failed to detect page type for tab ${tabId}:`, error.message);
        
        const isRedetection = tabContexts.has(tabId);
        const isConnectionError = error.message.includes('Receiving end does not exist') ||
                                 error.message.includes('Could not establish') ||
                                 error.message.includes('timeout');
        
        // For connection errors (content script not ready), retry on BOTH first detection AND re-detection
        if (isConnectionError) {
            const retries = (tabRetryCount.get(tabId) || 0) + 1;
            tabRetryCount.set(tabId, retries);
            
            if (retries < MAX_RETRIES) {
                console.log(`[Background] Connection error, retrying in 500ms... (attempt ${retries}/${MAX_RETRIES})`);
                setTimeout(() => {
                    // Check if we haven't already detected this tab with a newer generation
                    if (tabDetectionGen.get(tabId) === gen) {
                        console.log(`[Background] Retrying detection for tab ${tabId} after delay (attempt ${retries}/${MAX_RETRIES})`);
                        detectPageType(tabId);
                    }
                }, 500);
                return;
            } else {
                // Max retries exceeded - content script likely not loaded
                console.log(`[Background] Max retries (${MAX_RETRIES}) exceeded for tab ${tabId}. Attempting content script injection...`);
                tabRetryCount.delete(tabId); // Reset retry counter
                
                // Try to inject content script as fallback
                const injected = await injectContentScript(tabId);
                
                if (injected) {
                    // After injection, wait a moment and retry detection
                    console.log(`[Background] Content script injected, retrying detection in 500ms...`);
                    setTimeout(() => {
                        // Use a new generation to allow fresh detection
                        detectPageType(tabId);
                    }, 500);
                    return;
                }
                
                // Injection failed - fall back to cached context or error context
                if (isRedetection) {
                    // Re-detection: try to use cached context
                    const existingContext = tabContexts.get(tabId);
                    if (existingContext) {
                        console.log(`[Background] Broadcasting cached context for tab ${tabId}:`, existingContext.pageType);
                        broadcastContextUpdate(tabId, existingContext);
                        return;
                    }
                }
                
                // First detection with no cache, or no cached context available
                console.log(`[Background] No cached context available, broadcasting error for tab ${tabId}`);
            }
        }
        
        // Non-connection errors or final fallback: create and broadcast error context
        const errorContext = {
            pageType: null,
            error: error.message,
            timestamp: Date.now(),
            url: (await chrome.tabs.get(tabId).catch(() => ({ url: 'unknown' }))).url
        };
        
        if (!isRedetection) {
            // First-time detection: broadcast error so side panel knows to stop waiting
            setTabContext(tabId, errorContext);
        } else {
            // Re-detection: only broadcast if we haven't already cached a good context
            const existingContext = tabContexts.get(tabId);
            if (!existingContext) {
                setTabContext(tabId, errorContext);
            } else {
                // We have cached context, keep using it
                console.log(`[Background] Non-connection error on re-detection, keeping existing context for tab ${tabId}`);
                broadcastContextUpdate(tabId, existingContext);
            }
        }
    }
}

// ============================================================
// EVENT LISTENERS
// ============================================================

// Handle extension icon click - open side panel
chrome.action.onClicked.addListener((tab) => {
    // Open side panel immediately in response to user gesture
    chrome.sidePanel.open({ tabId: tab.id });
    
    // Inject content script asynchronously (doesn't need to wait for side panel open)
    if (isDomoDomain(tab.url)) {
        injectContentScript(tab.id).catch(() => {
            console.log(`[Background] Could not inject on icon click`);
        });
    }
});

// EAGER detection: Tab becomes active
chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
    try {
        const tab = await chrome.tabs.get(tabId);
        if (tab && isDomoDomain(tab.url)) {
            console.log(`[Background] Tab ${tabId} activated, injecting content script and detecting page type...`);
            // Inject content script early - don't wait for detection
            injectContentScript(tabId).catch(() => {
                console.log(`[Background] Could not inject on activation, will retry on detection`);
            });
            // Then detect page type
            detectPageType(tabId);
        }
    } catch (error) {
        console.error(`[Background] Error in onActivated for tab ${tabId}:`, error);
    }
});

// LAZY detection: Tab URL changes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && isDomoDomain(tab.url)) {
        console.log(`[Background] Tab ${tabId} fully loaded, injecting content script and detecting page type...`);
        // Inject content script early - don't wait for detection
        injectContentScript(tabId).catch(() => {
            console.log(`[Background] Could not inject on update, will retry on detection`);
        });
        // Then detect page type
        detectPageType(tabId);
    }
});

// SPA navigation detection: History state changed
chrome.webNavigation.onHistoryStateUpdated.addListener(({ tabId, url }) => {
    if (isDomoDomain(url)) {
        console.log(`[Background] Tab ${tabId} SPA navigation detected, detecting page type...`);
        detectPageType(tabId);
    }
});

// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
    console.log(`[Background] Tab ${tabId} removed, cleaning up context`);
    tabContexts.delete(tabId);
    tabAccessTimes.delete(tabId);
    tabDetectionGen.delete(tabId);
    persistToSession();
});

// ============================================================
// MESSAGE HANDLER
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[Background] Message received:', message.type || message.action, 'from tab:', sender.tab?.id);
    
    // Get current tab context
    if (message.type === 'GET_TAB_CONTEXT') {
        // Use sender.tab.id if available, otherwise use message.tabId (from side panel/popup)
        const tabId = sender.tab?.id || message.tabId;
        if (!tabId) {
            console.log('[Background] GET_TAB_CONTEXT: No tab ID available');
            sendResponse({ success: false, context: null });
            return true;
        }
        
        // If no context exists, try injecting content script to trigger detection
        const existingContext = getTabContext(tabId);
        if (!existingContext) {
            console.log(`[Background] GET_TAB_CONTEXT: No context for tab ${tabId}, injecting content script...`);
            injectContentScript(tabId)
                .then(() => {
                    // After injection, trigger detection
                    detectPageType(tabId);
                })
                .catch(err => {
                    console.log(`[Background] GET_TAB_CONTEXT: Could not inject:`, err.message);
                });
        }
        
        const context = getTabContext(tabId);
        sendResponse({ success: true, context });
        return true;
    }
    
    // Trigger page type detection
    if (message.type === 'DETECT_PAGE_TYPE') {
        const tabId = sender.tab?.id || message.tabId;
        if (!tabId) {
            console.log('[Background] DETECT_PAGE_TYPE: No tab ID available');
            sendResponse({ success: false });
            return true;
        }
        detectPageType(tabId);
        sendResponse({ success: true });
        return true;
    }
    
    if (message.action === 'magicRecipeCopyDetected') {
        console.log('[Background] Setting copyDetected flag in session storage');
        // Use timestamp instead of boolean to ensure the value changes each copy
        chrome.storage.session.set({ copyDetected: Date.now() }, () => {
            if (chrome.runtime.lastError) {
                console.error('[Background] Error setting session storage:', chrome.runtime.lastError);
            } else {
                console.log('[Background] copyDetected flag set successfully');
            }
            sendResponse({ ok: true });
        });
        return true;
    }
    
    return false;
});

// ============================================================
// INITIALIZATION
// ============================================================

// Restore persisted contexts on service worker startup
restoreFromSession();

console.log('[Background] Service worker initialized with detection capabilities');
