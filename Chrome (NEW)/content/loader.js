// Loader script for content-main.js
// This is a regular (non-module) script that dynamically imports the ES6 module
// Uses chrome.runtime.getURL to properly resolve extension resource paths

// Guard: Only run once per page to prevent duplicate loaders
if (window.__domoHelperLoaderRan) {
  console.log('[Content Loader] Loader already ran, skipping duplicate');
  // Exit early if loader already ran
} else {
  window.__domoHelperLoaderRan = true;

  console.log('[Content Loader] Starting to load content-main.js as module...');

  // Register a temporary message handler IMMEDIATELY before the async import completes
  // This allows the side panel to know the content script is loading
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[Content Loader] Received message:', message.action || message.type);
    
    // Respond to health checks while loading
    if (message.action === 'PING') {
      console.log('[Content Loader] PING received (still loading modules)');
      sendResponse({ pong: true, columnSearchReady: false, loader: true });
      return true;
    }
    
    // For other messages, don't respond here - let them be handled by content-main.js
    // after it loads
    return false;
  });

  // Dynamically import content-main.js with proper extension path resolution
  import(chrome.runtime.getURL('content/content-main.js'))
    .then(() => {
      console.log('[Content Loader] content-main.js loaded successfully');
    })
    .catch(err => {
      console.error('[Content Loader] Failed to load content-main.js:', err);
      console.error('[Content Loader] Stack:', err.stack);
    });
}
