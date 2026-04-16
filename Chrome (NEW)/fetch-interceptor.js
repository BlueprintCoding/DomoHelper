/**
 * Fetch Interceptor for Analyzer Card Saves
 * Runs in the page context to intercept save requests
 */

console.log('[Fetch Interceptor] Script loaded and executing');

// Wrap in IIFE to set up both fetch and XMLHttpRequest interception
(function setupAnalyzerSaveInterception() {
  console.log('[Page Fetch Hook] Installing analyzer save detection');
  
  // ===== INTERCEPT FETCH CALLS =====
  if (window.fetch) {
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
      const [resource, config] = args;
      const url = typeof resource === 'string' ? resource : resource.url;
      const method = config?.method || 'GET';

      // Check if this is a save request to the cards API (PUT without /definition)
      const isSaveRequest = method === 'PUT' && 
                           url.includes('/api/content/v3/cards/kpi/') && 
                           !url.includes('/definition');

      if (isSaveRequest) {
        console.log('[Page Fetch Hook] Save request detected via fetch:', url);
      }

      // Call original fetch
      const fetchPromise = originalFetch.apply(this, args);

      // If it's a save request, monitor for success and notify via custom event
      if (isSaveRequest) {
        fetchPromise.then(response => {
          if (response.ok) {
            // Extract card ID from URL like /api/content/v3/cards/kpi/329258951
            const cardIdMatch = url.match(/\/api\/content\/v3\/cards\/kpi\/(\d+)/);
            if (cardIdMatch) {
              const cardId = cardIdMatch[1];
              console.log('[Page Fetch Hook] Card saved successfully via fetch, cardId:', cardId);
              // Dispatch event that content script can listen to
              window.dispatchEvent(new CustomEvent('analyzerCardSaved', {
                detail: { cardId: cardId }
              }));
            }
          } else {
            console.log('[Page Fetch Hook] Save request failed with status:', response.status);
          }
        }).catch(error => {
          console.log('[Page Fetch Hook] Save request error:', error.message);
        });
      }

      return fetchPromise;
    };
    console.log('[Page Fetch Hook] Fetch interception installed');
  }
  
  // ===== INTERCEPT XMLHttpRequest CALLS =====
  if (window.XMLHttpRequest) {
    const OriginalXHR = window.XMLHttpRequest;
    const XHRPrototype = OriginalXHR.prototype;
    
    const originalOpen = XHRPrototype.open;
    const originalSend = XHRPrototype.send;
    
    XHRPrototype.open = function(method, url) {
      this.__dh_method = method;
      this.__dh_url = url;
    //   console.log('[XHR Hook] XHR.open:', method, url);
      return originalOpen.apply(this, arguments);
    };
    
    XHRPrototype.send = function(data) {
      const method = this.__dh_method;
      const url = this.__dh_url;
      
      // Only match the actual save endpoint: /api/content/v3/cards/kpi/{cardId}
      // NOT render/preview, minmaxdate, or other operations
      const actualSavePattern = /^\/api\/content\/v3\/cards\/kpi\/(\d+)$/;
      const isActualSave = method === 'PUT' && actualSavePattern.test(url);
      
      if (isActualSave) {
        console.log('[XHR Hook] ACTUAL CARD SAVE detected via XHR:', url);
      }
      
      // Monitor the response
      if (isActualSave) {
        const self = this;
        const originalOnReadyStateChange = this.onreadystatechange;
        
        this.onreadystatechange = function() {
          if (self.readyState === 4) {
            // console.log('[XHR Hook] XHR request completed, status:', self.status);
            if (self.status >= 200 && self.status < 300) {
              // Success
              const cardIdMatch = url.match(actualSavePattern);
              if (cardIdMatch) {
                const cardId = cardIdMatch[1];
                console.log('[XHR Hook] ✓ Card SAVED successfully via XHR, cardId:', cardId);
                window.dispatchEvent(new CustomEvent('analyzerCardSaved', {
                  detail: { cardId: cardId }
                }));
              }
            }
          }
          
          // Call original onreadystatechange if it exists
          if (originalOnReadyStateChange) {
            return originalOnReadyStateChange.apply(this, arguments);
          }
        };
      }
      
      return originalSend.apply(this, arguments);
    };
    
    console.log('[Page Fetch Hook] XMLHttpRequest interception installed');
  }
  
  console.log('[Page Fetch Hook] Setup complete - both fetch and XHR are now intercepted');
})();


