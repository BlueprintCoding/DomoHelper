/**
 * Execute a function in the page context (MAIN world)
 * This allows access to page-level APIs like fetch with proper credentials
 * @param {Function} func - The function to execute in page context
 * @param {Array} [args] - Arguments to pass to the function
 * @param {number} [tabId] - Optional specific tab ID. If not provided, uses active tab
 * @returns {Promise<any>} - The result from the executed function
 */
export async function executeInPage(func, args = [], tabId = null) {
  try {
    let targetTabId = tabId;

    // If no tabId provided, try to get active tab
    if (!targetTabId) {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
      });

      if (!tab) {
        throw new Error('No active tab found');
      }

      targetTabId = tab.id;
    }

    // Verify the tab exists and is on a Domo page
    let tabInfo;
    try {
      tabInfo = await chrome.tabs.get(targetTabId);
    } catch (error) {
      throw new Error(`Tab ${targetTabId} not found: ${error.message}`);
    }

    if (!tabInfo.url || !tabInfo.url.includes('domo.com')) {
      throw new Error(`Tab ${targetTabId} is not on a Domo page`);
    }

    // Execute function in the page context
    const result = await chrome.scripting.executeScript({
      args,
      func,
      target: { tabId: targetTabId },
      world: 'MAIN'
    });

    if (result && result[0] && result[0].result !== undefined) {
      return result[0].result;
    }

    throw new Error('No result from script execution');
  } catch (error) {
    console.error('[executeInPage] Error:', error);
    throw error;
  }
}
