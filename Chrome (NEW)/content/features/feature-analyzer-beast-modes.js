/**
 * Analyzer Beast Modes Feature
 * Displays formulas (Beast Modes) from the card definition in the side panel
 */

// Track in-flight requests to prevent duplicates
const inflightRequests = new Map();

// Track polling interval IDs so we can stop them when clearing cache
const pollingIntervals = new Map();

// Cache beast modes results by card ID
// Clears on page refresh when a new card detection occurs
const beastModesCache = new Map();

export default {
  /**
   * Initialize beast modes feature
   */
  init({ DH, settings } = {}) {
    console.log('[Analyzer Beast Modes] Feature initialized');
  },
  
  /**
   * Clear cache when page context changes (e.g., page refresh, navigation)
   */
  clearCache() {
    console.log('[Analyzer Beast Modes] Clearing cache - had', beastModesCache.size, 'items');
    beastModesCache.clear();
    console.log('[Analyzer Beast Modes] Cache cleared - now has', beastModesCache.size, 'items');
  },

  /**
   * Clear in-flight requests (used when invalidating cache on save)
   * Allows fresh fetch instead of reusing stale request
   */
  clearInflightRequests() {
    console.log('[Analyzer Beast Modes] Clearing in-flight requests - had', inflightRequests.size, 'requests');
    inflightRequests.clear();
    
    // Also stop any polling intervals that are still running
    console.log('[Analyzer Beast Modes] Stopping polling intervals - tracking', pollingIntervals.size, 'intervals');
    pollingIntervals.forEach((intervalId, requestKey) => {
      clearInterval(intervalId);
      console.log('[Analyzer Beast Modes] Stopped polling interval for:', requestKey);
    });
    pollingIntervals.clear();
    
    console.log('[Analyzer Beast Modes] In-flight requests cleared - now has', inflightRequests.size, 'requests');
  },

  /**
   * Get a script function that fetches formulas from the page context
   * This runs in the page context where authentication already exists
   * @param {string} cardId - The card ID from the analyzer URL
   * @returns {Function} Script function to inject into page
   */
  getFetchFormulasScript() {
    // Return the function that will be injected into the page
    return function(cardId) {
      (async () => {
        try {
          console.log('[Analyzer Beast Modes] Injected script: Fetching formulas for card:', cardId);
          
          const response = await fetch(window.location.origin + '/api/content/v3/cards/kpi/definition', {
            method: 'PUT',
            headers: {
              'accept': 'application/json, text/plain, */*',
              'content-type': 'application/json;charset=UTF-8',
              'x-requested-with': 'XMLHttpRequest'
            },
            body: JSON.stringify({
              dynamicText: true,
              variables: true,
              urn: cardId
            }),
            credentials: 'include'
          });

          if (!response.ok) {
            console.error('[Analyzer Beast Modes] API error:', response.status, response.statusText);
            window.analyzerBeastModesResult = {
              error: true,
              status: response.status,
              message: `API error: ${response.status}`
            };
            return;
          }

          const data = await response.json();
          console.log('[Analyzer Beast Modes] Response received', data);

          // Extract formulas from the definition - safely handle missing data
          let formulas = [];
          if (data?.definition?.formulas && Array.isArray(data.definition.formulas)) {
            formulas = data.definition.formulas.map(formula => ({
              id: formula.id,
              name: formula.name,
              formula: formula.formula,
              dataType: formula.dataType,
              persistedOnDataSource: formula.persistedOnDataSource === true,
              status: formula.status
            }));
          }

          console.log('[Analyzer Beast Modes] Extracted', formulas.length, 'formulas - Names:', formulas.map(f => f.name).join(', '));
          
          // Store result where side panel can access it after checking via polling
          window.analyzerBeastModesResult = {
            error: false,
            formulas: formulas
          };
          
          console.log('[Analyzer Beast Modes] Stored in window.analyzerBeastModesResult:', window.analyzerBeastModesResult.formulas.length, 'formulas');
        } catch (error) {
          console.error('[Analyzer Beast Modes] Error fetching formulas:', error);
          window.analyzerBeastModesResult = {
            error: true,
            message: error.message
          };
        }
      })();
    };
  },

  /**
   * Async fetch formulas using script injection
   * @param {string} cardId - The card ID
   * @param {number} tabId - The tab ID to inject into
   * @returns {Promise<Array>} Array of formula objects
   */
  async fetchFormulasViaInjection(cardId, tabId) {
    // Use deduplication key to prevent multiple simultaneous requests
    const requestKey = `${tabId}-${cardId}`;
    
    // Check cache first - return cached result if available
    if (beastModesCache.has(cardId)) {
      console.log('[Analyzer Beast Modes] Returning cached formulas for card:', cardId, 'count:', beastModesCache.get(cardId).length);
      return beastModesCache.get(cardId);
    }
    
    // If request is already in flight, return the existing promise
    if (inflightRequests.has(requestKey)) {
      console.log('[Analyzer Beast Modes] Reusing existing request for:', requestKey);
      return inflightRequests.get(requestKey);
    }
    
    // Create new promise and cache it
    const promise = new Promise((resolve, reject) => {
      try {
        // Get the script function
        const script = this.getFetchFormulasScript();
        
        // Inject and execute
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: script,
          args: [cardId]
        }, () => {
          if (chrome.runtime.lastError) {
            console.error('[Analyzer Beast Modes] Script injection error:', chrome.runtime.lastError);
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          
          // Script is now running in page context
          // Poll for the result to be available
          let pollCount = 0;
          const maxPolls = 60; // 6 seconds max (100ms * 60)
          
          const pollResult = setInterval(() => {
            pollCount++;
            
            // Query the result from the page
            chrome.scripting.executeScript({
              target: { tabId: tabId },
              func: () => {
                // Return the entire result object as-is, no intermediate wrapping
                if (window.analyzerBeastModesResult) {
                  console.log('[Analyzer Beast Modes] [POLLING] About to return window.analyzerBeastModesResult:', {
                    hasError: window.analyzerBeastModesResult.error,
                    formulasCount: window.analyzerBeastModesResult.formulas ? window.analyzerBeastModesResult.formulas.length : 0,
                    names: window.analyzerBeastModesResult.formulas ? window.analyzerBeastModesResult.formulas.map(f => f.name).join(', ') : 'N/A'
                  });
                }
                return window.analyzerBeastModesResult;
              }
            }, (results) => {
              if (chrome.runtime.lastError) {
                // Check if it's a "No tab with id" error - stop polling immediately
                const errorMsg = chrome.runtime.lastError?.message || '';
                if (errorMsg.includes('No tab with id') || errorMsg.includes('Cannot access')) {
                  clearInterval(pollResult);
                  pollingIntervals.delete(requestKey);
                  console.log('[Analyzer Beast Modes] Tab no longer exists, stopping poll');
                  reject(new Error('Tab closed'));
                  return;
                }
                // For other errors, just log but continue polling
                console.warn('[Analyzer Beast Modes] Poll warning:', chrome.runtime.lastError);
                return;
              }
              
              if (results && results[0]?.result) {
                const result = results[0].result;
                console.log('[Analyzer Beast Modes] [POLLING] results[0].result received, checking structure...');
                console.log('[Analyzer Beast Modes] [POLLING] result.error:', result.error, 'result.formulas count:', result.formulas ? result.formulas.length : 'undefined');
                
                if (result.error) {
                  clearInterval(pollResult);
                  pollingIntervals.delete(requestKey);
                  console.error('[Analyzer Beast Modes] Page script error:', result.message);
                  reject(new Error(result.message || 'Failed to fetch formulas'));
                } else if (result.formulas && Array.isArray(result.formulas)) {
                  clearInterval(pollResult);
                  pollingIntervals.delete(requestKey);
                  console.log('[Analyzer Beast Modes] Poll attempt', pollCount, ': Retrieved formulas array (length=' + result.formulas.length + ')');
                  console.log('[Analyzer Beast Modes] Formula names:', result.formulas.map(f => f.name).join(', '));
                  // Cache the formulas
                  beastModesCache.set(cardId, result.formulas);
                  resolve(result.formulas);
                }
              } else if (pollCount >= maxPolls) {
                clearInterval(pollResult);
                pollingIntervals.delete(requestKey);
                console.error('[Analyzer Beast Modes] Poll timeout - no result received');
                reject(new Error('Timeout waiting for formulas'));
              }
            });
          }, 100);
          
          // Track this interval so we can stop it if cache is cleared
          pollingIntervals.set(requestKey, pollResult);
          console.log('[Analyzer Beast Modes] Started polling interval for:', requestKey);
        });
      } catch (error) {
        console.error('[Analyzer Beast Modes] Injection error:', error);
        reject(error);
      }
    });
    
    // Cache the promise
    inflightRequests.set(requestKey, promise);
    
    // Clean up cache when promise settles
    promise.finally(() => {
      inflightRequests.delete(requestKey);
      pollingIntervals.delete(requestKey); // Safety cleanup
    });
    
    return promise;
  },

  /**
   * Generate HTML for beast modes list
   * @param {Array} formulas - Array of formula objects
   * @returns {string} HTML string for the formulas
   */
  generateHTML(formulas) {
    if (!formulas || formulas.length === 0) {
      return '<div style="color: var(--text-secondary); font-size: 12px; padding: 12px; text-align: center;">No Beast Modes found on this card</div>';
    }

    const formulasHTML = formulas.map((formula, index) => {
      const savedStatus = formula.persistedOnDataSource ? 'Yes' : 'No';
      const statusColor = formula.persistedOnDataSource ? '#4caf50' : '#ff9800';
      const uniqueId = `formula-${index}-${formula.id}`;
      
      return `
        <div class="beast-mode-item" style="border: 1px solid var(--border-color); border-radius: 6px; margin-bottom: 10px; overflow: hidden;">
          <div class="beast-mode-header" 
               onclick="toggleBeastModeContent('${uniqueId}')"
               style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background-color: var(--surface-light); cursor: pointer; user-select: none; transition: background-color 0.2s;">
            <div style="flex: 1; display: flex; flex-direction: row; gap: 4px;">
              <div style="font-weight: 600; color: var(--text-primary); font-size: 12px;">${escapeHtml(formula.name)}</div>
              <div style="font-size: 11px; color: var(--text-secondary);">Saved to DS: <span style="color: ${statusColor}; font-weight: 600;">${savedStatus}</span></div>
            </div>
            <div style="color: var(--text-secondary); font-size: 14px; transition: transform 0.2s; flex-shrink: 0;" class="toggle-icon">▼</div>
          </div>
          <div id="${uniqueId}" class="beast-mode-content" style="display: none; padding: 12px; background-color: var(--background-dark); border-top: 1px solid var(--border-color);">
            <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 8px; font-weight: 600;">Formula:</div>
            <pre style="background-color: var(--surface-dark); border: 1px solid var(--border-color); border-radius: 4px; padding: 10px; font-size: 11px; color: #a8ff60; font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', monospace; white-space: pre-wrap; word-wrap: break-word; margin: 0; overflow-x: auto; max-height: 200px; overflow-y: auto;">${escapeHtml(formula.formula)}</pre>
            ${formula.dataType ? `<div style="margin-top: 10px; font-size: 11px; color: var(--text-secondary);"><strong>Type:</strong> ${escapeHtml(formula.dataType)}</div>` : ''}
            ${formula.status ? `<div style="margin-top: 4px; font-size: 11px; color: var(--text-secondary);"><strong>Status:</strong> <span style="color: ${formula.status === 'VALID' ? '#4caf50' : '#ff9800'};">${escapeHtml(formula.status)}</span></div>` : ''}
          </div>
        </div>
      `;
    }).join('');

    return `
      <div style="display: flex; flex-direction: column; gap: 0;">
        ${formulasHTML}
      </div>
    `;
  },

  /**
   * Apply settings changes
   */
  applySettings(newSettings = {}) {
    console.log('[Analyzer Beast Modes] Settings applied:', newSettings);
  },

  /**
   * Cleanup
   */
  cleanup() {
    console.log('[Analyzer Beast Modes] Cleaned up');
  }
};

/**
 * Helper function to escape HTML special characters
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
