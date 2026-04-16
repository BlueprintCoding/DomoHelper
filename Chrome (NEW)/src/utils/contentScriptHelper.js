/**
 * Content Script Enhancement
 * Listens for context updates from background and dispatches to features
 * Also implements modal detection for improved context accuracy
 */

/**
 * Setup message listeners
 */
function setupMessageListeners() {
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
 * Watches for common Domo modals that change the current object context
 */
function setupModalDetection() {
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
          triggerRedetection();
        }
      } else if (!element && wasPresent) {
        // Modal disappeared
        console.log(`[Content] Modal removed: ${detector.name}`);
        detectedModals.set(detector.name, false);

        if (detector.triggerRedetection) {
          triggerRedetection();
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
 */
function triggerRedetection() {
  console.log('[Content] Triggering context re-detection');
  chrome.runtime.sendMessage({
    type: 'DETECT_CONTEXT'
  }).catch(error => {
    console.warn('[Content] Error triggering re-detection:', error.message);
  });
}

/**
 * Request current context from background
 */
async function getContext() {
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
 */
function setupWindowMessageHandler() {
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;

    // Feature requesting context
    if (event.data.type === 'DH_REQUEST_CONTEXT') {
      getContext().then(context => {
        window.postMessage({
          type: 'DH_CONTEXT_RESPONSE',
          requestId: event.data.requestId,
          context: context
        }, '*');
      });
    }

    // Feature requesting re-detection
    if (event.data.type === 'DH_TRIGGER_REDETECTION') {
      triggerRedetection();
    }
  });
}

/**
 * Export helper function for features to get current context
 */
window.getDomoHelperContext = async () => {
  // Check cache first
  if (window.__domoHelperContext) {
    return window.__domoHelperContext;
  }
  
  // Request from background
  return getContext();
};

/**
 * Export helper function for features to trigger re-detection
 */
window.triggerDomoHelperRedetection = () => {
  triggerRedetection();
};

/**
 * Initialize content script
 */
function initialize() {
  console.log('[Content] Initializing content script');

  setupMessageListeners();
  setupModalDetection();
  setupWindowMessageHandler();

  // Request initial context
  getContext().then(context => {
    if (context) {
      window.__domoHelperContext = context;
      console.log('[Content] Initial context loaded:', context.domoObject?.typeId);
    }
  });
}

// Initialize when script loads
initialize();
