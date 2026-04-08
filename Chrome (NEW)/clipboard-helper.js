// Injected page script - runs in page context for clipboard access and graph data extraction
(function setupClipboardHelper() {
  console.log('[DH Clipboard Helper] Initializing...');
  
  // Page-level clipboard helper accessed via postMessage
  window.__DHClipboardHelper = {
    async readAsText() {
      try {
        console.log('[DH Clipboard Helper] readAsText called');
        const text = await navigator.clipboard.readText();
        console.log('[DH Clipboard Helper] Successfully read clipboard');
        return { success: true, data: text };
      } catch (err) {
        console.error('[DH Clipboard Helper] Read failed:', err);
        return { success: false, error: err.message };
      }
    },

    /**
     * Extract Magic ETL canvas/graph data from the page
     * Domo's Magic ETL stores the flow definition in various places depending on the UI version
     */
    getGraphData() {
      console.log('[DH Clipboard Helper] getGraphData called');
      
      try {
        // Method 1: Check window object for injected graph state
        if (window.__DOMO_GRAPH_DATA__) {
          console.log('[DH Clipboard Helper] Found graph data in window.__DOMO_GRAPH_DATA__');
          return { success: true, data: window.__DOMO_GRAPH_DATA__ };
        }

        // Method 2: Try to find Domo's internal graph/canvas API
        if (window.__DOMO__ && window.__DOMO__.graph) {
          console.log('[DH Clipboard Helper] Found graph in window.__DOMO__.graph');
          return { success: true, data: window.__DOMO__.graph };
        }

        // Method 3: Look for React component state with graph data
        // Search for common data containers in the DOM and their associated React state
        let foundData = null;
        const possibleContainers = [
          document.querySelector('[class*="GraphCanvas"]'),
          document.querySelector('[class*="Canvas"]'),
          document.querySelector('[class*="ETL"]'),
          document.querySelector('main'),
          document.querySelector('#app'),
          document.querySelector('[data-react-root]'),
        ];

        for (const container of possibleContainers) {
          if (!container) continue;
          
          // Try to find React fiber or props
          const fiberKey = Object.keys(container).find(key => 
            key.startsWith('__reactFiber') || key.startsWith('__reactProps')
          );
          
          if (fiberKey) {
            console.log('[DH Clipboard Helper] Found React element with key:', fiberKey);
            let fiber = container[fiberKey];
            
            // Walk the fiber tree looking for state or props with graph data
            let depth = 0;
            while (fiber && depth < 100) {
              depth++;
              
              // Check component state
              if (fiber.memoizedState) {
                const state = fiber.memoizedState;
                // Check if this looks like graph state
                if (state.memoizedState && state.nextEffect) {
                  // This is a hooks state, let's try to find graph data
                  let current = state;
                  while (current) {
                    if (current.memoizedState && current.memoizedState.actions) {
                      console.log('[DH Clipboard Helper] Found actions in component state');
                      foundData = current.memoizedState;
                      break;
                    }
                    if (current.memoizedState && current.memoizedState.tiles) {
                      console.log('[DH Clipboard Helper] Found tiles in component state');
                      foundData = { actions: current.memoizedState.tiles };
                      break;
                    }
                    current = current.next;
                  }
                }
              }
              
              // Check component props
              if (fiber.memoizedProps && fiber.memoizedProps.graph) {
                console.log('[DH Clipboard Helper] Found graph in fiber props');
                foundData = fiber.memoizedProps.graph;
                break;
              }
              
              if (fiber.memoizedProps && fiber.memoizedProps.data && fiber.memoizedProps.data.actions) {
                console.log('[DH Clipboard Helper] Found actions in fiber props');
                foundData = fiber.memoizedProps.data;
                break;
              }
              
              if (foundData) break;
              
              // Go up the tree
              fiber = fiber.return;
            }
            
            if (foundData) break;
          }
        }

        if (foundData) {
          console.log('[DH Clipboard Helper] Found graph data via React traversal');
          return { success: true, data: foundData };
        }

        // Method 4: Try to extract from page's SVG/Canvas rendering as final fallback
        // If the flow is rendered as SVG with data attributes
        const svgTiles = document.querySelectorAll('[data-tile-id], [data-action-id], [data-id]');
        if (svgTiles.length > 0) {
          console.log(`[DH Clipboard Helper] Found ${svgTiles.length} tile elements with data attributes`);
          const tiles = Array.from(svgTiles).map(tile => ({
            id: tile.getAttribute('data-tile-id') || tile.getAttribute('data-action-id') || tile.getAttribute('data-id'),
            name: tile.getAttribute('data-name') || tile.textContent?.trim() || 'Unknown',
            type: tile.getAttribute('data-type') || 'Unknown',
            x: tile.getAttribute('x'),
            y: tile.getAttribute('y')
          }));
          
          if (tiles.length > 0) {
            return { success: true, data: { actions: tiles, source: 'dom_extraction' } };
          }
        }

        console.log('[DH Clipboard Helper] Could not extract graph data from any method');
        return { success: false, error: 'Graph data not found. Page may not be fully loaded or not on canvas view.' };
      } catch (err) {
        console.error('[DH Clipboard Helper] Error extracting graph data:', err);
        return { success: false, error: err.message };
      }
    }
  };
  
  // Listen for postMessage requests from content script
  window.addEventListener('message', async (e) => {
    if (e.source !== window) return;
    
    if (e.data.type === 'DH_CLIPBOARD_REQUEST') {
      console.log('[DH Clipboard Helper] Received clipboard request');
      const result = await window.__DHClipboardHelper.readAsText();
      console.log('[DH Clipboard Helper] Sending clipboard response:', result.success);
      window.postMessage({ 
        type: 'DH_CLIPBOARD_RESPONSE',
        requestId: e.data.requestId,
        ...result
      }, '*');
    }
    
    if (e.data.type === 'DH_GRAPH_DATA_REQUEST') {
      console.log('[DH Clipboard Helper] Received graph data request');
      const result = window.__DHClipboardHelper.getGraphData();
      console.log('[DH Clipboard Helper] Sending graph data response:', result.success);
      window.postMessage({
        type: 'DH_GRAPH_DATA_RESPONSE',
        requestId: e.data.requestId,
        ...result
      }, '*');
    }
  });
  
  console.log('[DH Clipboard Helper] Setup complete, listening for requests...');
})();

