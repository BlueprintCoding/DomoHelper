/**
 * Analyzer Tools Feature
 * Provides utilities for Domo Analyzer pages (clearing columns, etc.)
 */

export default {
  /**
   * Initialize analyzer tools
   */
  init({ DH, settings } = {}) {
    console.log('[Analyzer Tools] Feature initialized');
  },

  /**
   * Clear all columns from the analyzer
   * This executes in the page context via chrome.scripting.executeScript
   * @param {boolean} autoSelectTable - Whether to auto-select table chart type after clearing
   * @returns {Object} Script function to inject into page
   */
  getClearColumnsScript() {
    // Return the function that will be injected into the page
    return function(autoSelectTable) {
      (async () => {
        let count = 0;
        
        const removeNextColumn = () => {
          const xIcons = document.querySelectorAll('i.icon-x-circle-outline');
          const xButtons = Array.from(xIcons)
            .map(icon => icon.closest('button'))
            .filter(btn => btn !== null);
          
          console.log('[Analyzer Clear] Remaining columns:', xButtons.length);
          
          if (xButtons.length === 0) {
            // All columns cleared
            if (autoSelectTable) {
              const tableChartElement = document.querySelector('[data-ui-test-chart-type="badge_basic_table"]');
              if (tableChartElement) {
                console.log('[Analyzer Clear] Auto-selecting table chart type');
                tableChartElement.click();
              }
            }
            console.log('[Analyzer Clear] Completed:', count, 'columns cleared');
            return;
          }
          
          // Click the X button to open the popover
          const xButton = xButtons[0];
          console.log('[Analyzer Clear] Clicking X button (' + (count + 1) + ')');
          xButton.click();
          
          // Wait for popover to appear, then click remove button
          setTimeout(() => {
            const removeBtn = document.querySelector('button.remove-button.db-button');
            if (removeBtn) {
              console.log('[Analyzer Clear] Clicking remove button');
              removeBtn.click();
              count++;
            }
            // Move to next column with minimal delay
            setTimeout(removeNextColumn, 40);
          }, 30);
        };
        
        console.log('[Analyzer Clear] Starting column removal');
        removeNextColumn();
      })();
    };
  },

  /**
   * Apply settings changes to the analyzer tools
   */
  applySettings(newSettings = {}) {
    console.log('[Analyzer Tools] Settings applied:', newSettings);
  },

  /**
   * Cleanup - called when page type changes or feature is disabled
   */
  cleanup() {
    console.log('[Analyzer Tools] Cleaned up');
  }
};
