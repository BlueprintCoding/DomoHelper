/**
 * Page/Tab Type Detector
 * Single source of truth for determining what type of page we're on
 * 
 * Usage:
 * - PageDetector.getPageType() → returns page type constant
 * - PageDetector.isMagicETL() → true if on Magic ETL canvas
 * - PageDetector.isPage() → true if on dashboard/card page
 * - PageDetector.isSQLAuthor() → true if on SQL author page
 * - PageDetector.isRelevant() → true if page is supported
 */

const PageDetector = {
  // ===== PAGE TYPE CONSTANTS =====
  PAGE_TYPES: {
    UNKNOWN: 'UNKNOWN',
    PAGE: 'PAGE',           // Dashboard/card pages (/page/)
    MAGIC_ETL: 'MAGIC_ETL', // Magic ETL canvas (ends with 'graph')
    SQL_AUTHOR: 'SQL_AUTHOR' // SQL query author (contains 'author')
  },
  
  /**
   * Detect page type from URL
   * @param {string} url - URL to analyze (default: current location)
   * @returns {string} - One of PAGE_TYPES constants
   */
  detectPageType(url = window.location.href) {
    const urlLower = url.toLowerCase();
    
    // Check in priority order (most specific first)
    if (urlLower.includes('/page/')) {
      return this.PAGE_TYPES.PAGE;
    }
    
    if (urlLower.endsWith('graph')) {
      return this.PAGE_TYPES.MAGIC_ETL;
    }
    
    if (urlLower.includes('author')) {
      return this.PAGE_TYPES.SQL_AUTHOR;
    }
    
    return this.PAGE_TYPES.UNKNOWN;
  },
  
  /**
   * Get current page type
   * @returns {string} - Current page type
   */
  getPageType() {
    return this.detectPageType(window.location.href);
  },
  
  /**
   * Check if current page is a dashboard/card page
   * @returns {boolean}
   */
  isPage() {
    return this.getPageType() === this.PAGE_TYPES.PAGE;
  },
  
  /**
   * Check if current page is Magic ETL canvas
   * @returns {boolean}
   */
  isMagicETL() {
    return this.getPageType() === this.PAGE_TYPES.MAGIC_ETL;
  },
  
  /**
   * Check if current page is SQL author page
   * @returns {boolean}
   */
  isSQLAuthor() {
    return this.getPageType() === this.PAGE_TYPES.SQL_AUTHOR;
  },
  
  /**
   * Check if current page is any supported page type
   * @returns {boolean}
   */
  isRelevant() {
    return this.getPageType() !== this.PAGE_TYPES.UNKNOWN;
  },
  
  /**
   * Start monitoring for URL changes
   * Calls callback whenever page type changes
   * 
   * @param {Function} onChangeCallback - Called with (newPageType, previousUrl)
   * @returns {MutationObserver} - Observer instance (can be disconnected if needed)
   */
  startUrlMonitoring(onChangeCallback) {
    let previousUrl = window.location.href;
    let previousPageType = this.detectPageType(previousUrl);
    
    const observer = new MutationObserver(() => {
      const currentUrl = window.location.href;
      
      // Only fire callback if URL actually changed
      if (currentUrl !== previousUrl) {
        const newPageType = this.detectPageType(currentUrl);
        
        // Only fire callback if page type changed (reduce unnecessary callbacks)
        if (newPageType !== previousPageType) {
          console.log(`[PageDetector] Page type changed: ${previousPageType} → ${newPageType}`);
          onChangeCallback(newPageType, previousUrl, previousPageType);
        }
        
        previousUrl = currentUrl;
        previousPageType = newPageType;
      }
    });
    
    // Monitor DOM changes that might indicate URL change
    observer.observe(document.body, { 
      childList: true, 
      subtree: true 
    });
    
    return observer;
  },
  
  /**
   * Get detailed description of current page state
   * Useful for debugging
   * 
   * @returns {Object} - Page detection details
   */
  describe() {
    const pageType = this.getPageType();
    return {
      url: window.location.href,
      pageType,
      isPage: pageType === this.PAGE_TYPES.PAGE,
      isMagicETL: pageType === this.PAGE_TYPES.MAGIC_ETL,
      isSQLAuthor: pageType === this.PAGE_TYPES.SQL_AUTHOR,
      isUnknown: pageType === this.PAGE_TYPES.UNKNOWN,
      isRelevant: pageType !== this.PAGE_TYPES.UNKNOWN
    };
  },
  
  /**
   * Log detection results to console
   * Use for debugging page detection issues
   */
  logDetection() {
    const state = this.describe();
    if (state.isPage) {
      console.log('[PageDetector] ✓ Detected: Dashboard/Card Page');
    } else if (state.isMagicETL) {
      console.log('[PageDetector] ✓ Detected: Magic ETL Canvas');
    } else if (state.isSQLAuthor) {
      console.log('[PageDetector] ✓ Detected: SQL Author Page');
    } else {
      console.log('[PageDetector] Non-Relevant Page');
    }
    console.log('[PageDetector] Details:', state);
  }
};

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PageDetector;
}
