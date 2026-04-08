// content/shared/select-columns-utils.js
// Shared utilities for Select Columns transformation features

// Robust selectors that avoid version-specific class suffixes
const SELECTORS = {
  // Core containers
  actionEditor: '[data-testid="ACTION_EDITOR"]',
  selectColumnsContainer: '[data-testid="SELECT_COLUMNS_LIST"]',
  editorToolbar: '[data-testid="EDITOR_TOOLBAR"]',
  
  // Column field elements
  columnField: '[aria-roledescription="sortable"]',
  reorderIcon: '[class*="DfSelectColumns_reorderIcon"]',
  fieldName: '[class*="DfSelectColumns_fieldName"]',
  numberSpace: '[class*="DfSelectColumns_numberSpace"]',
  renameField: '[class*="DfSelectColumns_rename"]',
  renameInput: 'input[placeholder="Rename to"]',
  removeButton: '[data-testid^="remove_select_column_"]',
  
  // Toolbar elements
  buttonsContainer: '[class*="DfEditorPanelToolbar_buttons"]',
  transformTitle: '[class*="DfEditToggle_display"] [class*="Truncate-module_truncateText"]',
  
  // Column picker
  columnPicker: '[class*="DfSelectColumns_columnPicker"]',
  
  // Borders and spacing
  border: '[class*="DfSelectColumns_border"]'
};

/**
 * Check if we're currently in a Select Columns transformation
 * Uses data-testid and icon to avoid class name version issues
 */
function isSelectColumnsActive() {
  const toolbar = document.querySelector(SELECTORS.editorToolbar);
  if (!toolbar) return false;
  
  // Check for the column-select icon (more reliable than text)
  const hasColumnIcon = toolbar.querySelector('[class*="icon-column-select"]');
  if (hasColumnIcon) return true;
  
  // Fallback to text check (in case icon class changes)
  const titleElement = toolbar.querySelector(SELECTORS.transformTitle);
  return titleElement?.textContent?.trim() === 'Select Columns';
}

/**
 * Get all column items currently visible in the Select Columns list
 * Returns array of column objects with element references and metadata
 */
function getColumnItems() {
  const container = document.querySelector(SELECTORS.selectColumnsContainer);
  if (!container) return [];
  
  const items = Array.from(container.querySelectorAll(SELECTORS.columnField))
    .map((field, index) => {
      // Find the truncated text element (works with any version suffix)
      const nameEl = field.querySelector(`${SELECTORS.fieldName} [class*="Truncate-module_truncateText"]`);
      const numberEl = field.querySelector(SELECTORS.numberSpace);
      const renameInput = field.querySelector(SELECTORS.renameInput);
      
      // Skip if essential elements are missing (column not fully rendered)
      if (!nameEl || !renameInput) {
        return null;
      }
      
      // Read visual position for sorting (virtualized lists use absolute positioning)
      let top = 0;
      try {
        const styleTop = field.style?.top;
        if (styleTop && styleTop.endsWith('px')) {
          top = parseInt(styleTop, 10);
        } else {
          top = field.getBoundingClientRect().top;
        }
      } catch {}
      
      return {
        element: field,
        name: nameEl?.textContent?.trim() || `Column ${index + 1}`,
        originalIndex: index,
        currentIndex: index,
        renameValue: renameInput?.value || '',
        renameInput: renameInput,
        numberElement: numberEl,
        _top: isNaN(top) ? 0 : top
      };
    })
    .filter(item => item !== null); // Filter out incomplete items

  // Sort by visual position so we work with on-screen order
  items.sort((a, b) => a._top - b._top);
  // Reassign currentIndex to match sorted order
  items.forEach((it, i) => { it.currentIndex = i; });
  
  return items;
}

/**
 * Setup a mutation observer to watch for Select Columns editor appearing
 * Calls initCallback when Select Columns becomes active
 */
function setupSelectColumnsObserver(initCallback, cleanupCallback) {
  let isCurrentlyActive = false;
  let virtualListObserver = null;
  
  const checkAndInit = () => {
    const nowActive = isSelectColumnsActive();
    
    if (nowActive && !isCurrentlyActive) {
      // Select Columns just became active
      isCurrentlyActive = true;
      console.log('✅ Select Columns detected - initializing features');
      // Longer delay to ensure all columns are fully rendered
      setTimeout(() => {
        if (initCallback) initCallback();
        
        // Set up observer for the virtualized list to catch when rows are added
        setupVirtualListObserver(initCallback);
      }, 400);
    } else if (!nowActive && isCurrentlyActive) {
      // Select Columns just became inactive
      isCurrentlyActive = false;
      console.log('❌ Select Columns closed - cleaning up features');
      
      // Disconnect virtual list observer
      if (virtualListObserver) {
        virtualListObserver.disconnect();
        virtualListObserver = null;
      }
      
      if (cleanupCallback) cleanupCallback();
    }
  };
  
  // Setup observer for virtualized list to detect when new rows are rendered
  function setupVirtualListObserver(callback) {
    const container = document.querySelector(SELECTORS.selectColumnsContainer);
    if (!container) return;
    
    // Find the virtualized scrolling container
    const virtualContainer = container.querySelector('[style*="position: relative"][style*="overflow: auto"]');
    if (!virtualContainer) {
      console.warn('⚠️ Could not find virtual scroll container');
      return;
    }
    
    // Disconnect old observer if it exists
    if (virtualListObserver) {
      virtualListObserver.disconnect();
    }
    
    // Create new observer that watches for child changes in the virtualized list
    virtualListObserver = new MutationObserver((mutations) => {
      // Check if any mutations added new column rows
      const hasNewRows = mutations.some(mutation => {
        return Array.from(mutation.addedNodes).some(node => {
          return node.nodeType === Node.ELEMENT_NODE && 
                 node.querySelector?.(SELECTORS.columnField);
        });
      });
      
      if (hasNewRows) {
        console.log('👁️ Virtual list updated - refreshing enhancements');
        // Small delay to ensure DOM is stable
        setTimeout(() => {
          if (callback) callback();
        }, 50);
      }
    });
    
    virtualListObserver.observe(virtualContainer, {
      childList: true,
      subtree: true
    });
    
    console.log('👁️ Virtual list observer started');
  }
  
  const observer = new MutationObserver(() => {
    checkAndInit();
  });
  
  // Wait for body to be ready before observing
  const startObserving = () => {
    if (!document.body) {
      setTimeout(startObserving, 100);
      return;
    }
    
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-testid', 'class']
    });
    
    console.log('👁️ Select Columns observer started');
    
    // Initial check
    checkAndInit();
  };
  
  startObserving();
  
  return observer;
}


/**
 * Add a button to the Select Columns toolbar
 * Returns the created button element
 */
function addToolbarButton({ 
  testId, 
  className, 
  iconClass, 
  tooltipText, 
  onClick,
  insertBefore = 'duplicate' // 'duplicate', 'delete', 'first', or null for last
}) {
  const toolbar = document.querySelector(SELECTORS.editorToolbar);
  if (!toolbar) return null;
  
  // Check if button already exists
  if (toolbar.querySelector(`[data-testid="${testId}"]`)) return null;
  
  const buttonsContainer = toolbar.querySelector(SELECTORS.buttonsContainer);
  if (!buttonsContainer) return null;
  
  const buttonWrapper = document.createElement('div');
  buttonWrapper.innerHTML = `
    <button data-testid="${testId}" class="${className} db-text-button Button-module_button__7BLGt_v3 Button-module_default__utLb-_v3 Button-module_flat__aBcd9_v3" type="button" title="${tooltipText}">
      <span class="Button-module_content__b7-cz_v3">
        <i class="db-icon ${iconClass} sm" role="presentation"></i>
      </span>
    </button>
  `;
  
  // Find insertion point
  let insertionPoint = null;
  if (insertBefore === 'first') {
    insertionPoint = buttonsContainer.firstChild;
  } else if (insertBefore === 'duplicate') {
    insertionPoint = buttonsContainer.querySelector('[aria-labelledby*="duplicate" i], [data-testid*="duplicate" i]')?.parentElement;
  } else if (insertBefore === 'delete') {
    insertionPoint = buttonsContainer.querySelector('[data-testid="Delete_Action_Button"]')?.parentElement;
  } else if (insertBefore === 'done') {
    insertionPoint = buttonsContainer.querySelector('[class*="DfEditorDoneButton_doneButton"]');
  }
  
  if (insertionPoint) {
    buttonsContainer.insertBefore(buttonWrapper, insertionPoint);
  } else {
    buttonsContainer.appendChild(buttonWrapper);
  }
  
  const button = buttonWrapper.querySelector('button');
  if (onClick) {
    button.addEventListener('click', onClick);
  }
  
  return button;
}

/**
 * Ensure each column row has a stable ID for targeting
 */
function ensureColumnId(element) {
  try {
    if (!element?.dataset) return null;
    if (!element.dataset.dhId) {
      element.dataset.dhId = 'dh-' + Math.random().toString(36).slice(2, 10);
    }
    return element.dataset.dhId;
  } catch { 
    return null; 
  }
}

export {
  SELECTORS,
  isSelectColumnsActive,
  getColumnItems,
  setupSelectColumnsObserver,
  addToolbarButton,
  ensureColumnId
};