// content/features/feature-select-columns-rename.js
// Adds enhanced rename functionality to Magic ETL "Select Columns" transformation
let DHref = null;
let isActive = false;
let observerSelectColumns = null;
let bulkRenameModal = null;

// Import shared utilities dynamically
let SELECTORS, isSelectColumnsActive, getColumnItems, setupSelectColumnsObserver, addToolbarButton;

async function loadSharedUtils() {
  const utils = await import(chrome.runtime.getURL('content/shared/select-columns-utils.js'));
  SELECTORS = utils.SELECTORS;
  isSelectColumnsActive = utils.isSelectColumnsActive;
  getColumnItems = utils.getColumnItems;
  setupSelectColumnsObserver = utils.setupSelectColumnsObserver;
  addToolbarButton = utils.addToolbarButton;
}

// Add copy buttons to rename fields
function addCopyButtons() {
  const columns = getColumnItems();
  
  if (columns.length === 0) {
    console.log('⏳ No columns found for copy buttons, will retry...');
    setTimeout(() => {
      if (isSelectColumnsActive() && getColumnItems().length > 0) {
        addCopyButtons();
      }
    }, 300);
    return;
  }
  
  console.log(`📋 Checking ${columns.length} columns for copy buttons`);
  
  let addedCount = 0;
  let skippedCount = 0;
  
  columns.forEach((column, index) => {
    const renameField = column.element.querySelector(SELECTORS.renameField);
    if (!renameField) {
      console.warn(`⚠️ No rename field found for column ${index}`);
      return;
    }
    
    // Skip if already has buttons
    if (renameField.querySelector('.dh-copy-name-btn')) {
      skippedCount++;
      return;
    }
    
    // Create button container
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
      display: flex;
      gap: 4px;
      margin-left: 4px;
    `;
    
    // Create copy button
    const copyButton = document.createElement('button');
    copyButton.className = 'dh-copy-name-btn db-text-button Button-module_button__7BLGt Button-module_default__utLb- Button-module_flat__aBcd9';
    copyButton.type = 'button';
    copyButton.title = `Copy "${column.name}" to rename field`;
    copyButton.style.cssText = `
      padding: 2px 6px;
      min-width: auto;
      height: 28px;
    `;
    
    copyButton.innerHTML = `
      <span class="Button-module_content__b7-cz">
        <i class="db-icon icon-duplicate xs" role="presentation"></i>
      </span>
    `;
    
    // Add copy click handler
    copyButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const input = column.renameInput;
      if (input) {
        input.value = column.name;
        input.focus();
        
        // Trigger input event to notify any listeners
        const inputEvent = new Event('input', { bubbles: true });
        input.dispatchEvent(inputEvent);
        
        // Show brief success feedback
        DHref?.showNotification?.(`Copied "${column.name}" to rename field`, '#4CAF50');
      }
    });
    
    // Create clear button
    const clearButton = document.createElement('button');
    clearButton.className = 'dh-clear-rename-btn db-text-button Button-module_button__7BLGt Button-module_default__utLb- Button-module_flat__aBcd9';
    clearButton.type = 'button';
    clearButton.title = 'Clear rename field';
    clearButton.style.cssText = `
      padding: 2px 6px;
      min-width: auto;
      height: 28px;
      color: #ed3737;
    `;
    
    clearButton.innerHTML = `
      <span class="Button-module_content__b7-cz">
        <i class="db-icon icon-x xs" role="presentation"></i>
      </span>
    `;
    
    // Add clear click handler
    clearButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const input = column.renameInput;
      if (input) {
        // Get the native input value setter
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value'
        ).set;
        
        input.focus();
        
        // Use React's way to set the value
        nativeInputValueSetter.call(input, '');
        
        // Trigger input event (this is what React listens to)
        const inputEvent = new Event('input', { bubbles: true });
        input.dispatchEvent(inputEvent);
        
        // Trigger change event
        const changeEvent = new Event('change', { bubbles: true });
        input.dispatchEvent(changeEvent);
        
        // Blur to commit the change
        input.blur();
        
        // Show brief success feedback
        DHref?.showNotification?.('Cleared rename field', '#4CAF50');
      }
    });
    
    // Add buttons to container
    buttonContainer.appendChild(copyButton);
    buttonContainer.appendChild(clearButton);
    
    // Insert button container after the input span
    const inputSpan = renameField.querySelector('span[role="presentation"]');
    if (inputSpan) {
      inputSpan.insertAdjacentElement('afterend', buttonContainer);
      addedCount++;
    }
  });
  
  if (addedCount > 0) {
    console.log(`✅ Added ${addedCount} new copy/clear buttons (${skippedCount} already present)`);
  }
}

// Add bulk rename button to toolbar
function addBulkRenameButton() {
  addToolbarButton({
    testId: 'BULK_RENAME_BUTTON',
    className: 'dh-bulk-rename-btn',
    iconClass: 'icon-pencil',
    tooltipText: 'Bulk Rename with Pre/Suffix',
    onClick: openBulkRenameModal,
    insertBefore: 'done'
  });
}

// Open bulk rename modal
function openBulkRenameModal() {
  if (bulkRenameModal) {
    closeBulkRenameModal();
  }
  
  const columns = getColumnItems();
  if (columns.length === 0) {
    DHref?.showNotification?.('No columns found', '#FF9800');
    return;
  }
  
  // Create modal overlay
  const overlay = document.createElement('div');
  overlay.className = 'dh-bulk-rename-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  
  // Create modal content
  const modal = document.createElement('div');
  modal.className = 'dh-bulk-rename-modal';
  modal.style.cssText = `
    background: white;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    max-width: 700px;
    max-height: 80vh;
    overflow-y: auto;
    width: 90%;
    padding: 0;
    font-family: system-ui, -apple-system, sans-serif;
  `;
  
  modal.innerHTML = `
    <div style="padding: 20px; border-bottom: 1px solid #e0e0e0;">
      <h2 style="margin: 0; font-size: 18px; font-weight: 500; color: #333;">
        Bulk Rename with Prefix/Suffix
      </h2>
    </div>
    
    <div style="padding: 20px;">
      <div style="margin-bottom: 20px;">
        <div style="display: flex; gap: 15px; margin-bottom: 15px;">
          <div style="flex: 1;">
            <label style="display: block; margin-bottom: 5px; font-weight: 500; color: #555;">
              Prefix (optional):
            </label>
            <input type="text" class="dh-prefix-input Input-module_input__aRXjR db-text-body" 
              placeholder="e.g., NEW_" style="width: 100%; padding: 8px;">
          </div>
          <div style="flex: 1;">
            <label style="display: block; margin-bottom: 5px; font-weight: 500; color: #555;">
              Suffix (optional):
            </label>
            <input type="text" class="dh-suffix-input Input-module_input__aRXjR db-text-body" 
              placeholder="e.g., _UPDATED" style="width: 100%; padding: 8px;">
          </div>
        </div>
        
        <!-- Find and Replace Section -->
        <div style="margin-bottom: 15px; border: 1px solid #e0e0e0; border-radius: 4px;">
          <button type="button" class="dh-find-replace-toggle" style="width: 100%; padding: 10px; background: #f5f5f5; border: none; cursor: pointer; display: flex; align-items: center; justify-content: space-between; font-weight: 500; color: #555; border-radius: 4px;">
            <span>Find and Replace</span>
            <i class="db-icon icon-chevron-down xs" role="presentation"></i>
          </button>
          <div class="dh-find-replace-content" style="display: none; padding: 15px; border-top: 1px solid #e0e0e0;">
            <div style="display: flex; gap: 15px; margin-bottom: 10px;">
              <div style="flex: 1;">
                <label style="display: block; margin-bottom: 5px; font-weight: 500; color: #555;">
                  Find:
                </label>
                <input type="text" class="dh-find-input Input-module_input__aRXjR db-text-body" 
                  placeholder="e.g., Demo or spaces" style="width: 100%; padding: 8px;">
              </div>
              <div style="flex: 1;">
                <label style="display: block; margin-bottom: 5px; font-weight: 500; color: #555;">
                  Replace with:
                </label>
                <input type="text" class="dh-replace-input Input-module_input__aRXjR db-text-body" 
                  placeholder="e.g., Prod or _" style="width: 100%; padding: 8px;">
              </div>
            </div>
            <div style="display: flex; gap: 10px; align-items: center;">
              <label style="display: flex; align-items: center; font-size: 13px; color: #666; cursor: pointer;">
                <input type="checkbox" class="dh-case-sensitive-checkbox" style="margin-right: 6px;">
                Case sensitive
              </label>
              <label style="display: flex; align-items: center; font-size: 13px; color: #666; cursor: pointer;">
                <input type="checkbox" class="dh-find-replace-enabled" style="margin-right: 6px;">
                Enable find and replace
              </label>
            </div>
            <div style="margin-top: 8px; padding: 8px; background: #fff3cd; border-radius: 3px; font-size: 12px; color: #856404;">
              <strong>Note:</strong> Find and replace is applied BEFORE prefix/suffix. It uses the base name (or existing rename value if that option is checked).
            </div>
          </div>
        </div>
        
        <div style="margin-bottom: 15px;">
          <label style="display: flex; align-items: center; font-weight: 500; color: #555;">
            <input type="checkbox" class="dh-select-all-checkbox" style="margin-right: 8px;">
            Select All Columns
          </label>
        </div>
        
        <div style="margin-bottom: 15px; padding: 10px; background: #f0f7ff; border-radius: 4px; border-left: 3px solid #2196F3;">
          <label style="display: flex; align-items: flex-start; font-weight: 500; color: #555; cursor: pointer;">
            <input type="checkbox" class="dh-use-existing-checkbox" style="margin-right: 8px; margin-top: 3px;">
            <div>
              <div>Use existing rename values (when present)</div>
              <div style="font-size: 12px; font-weight: 400; color: #666; margin-top: 4px;">
                When checked, columns that already have a rename value will use that value + prefix/suffix instead of the original column name
              </div>
            </div>
          </label>
        </div>
      </div>
      
      <div style="border: 1px solid #e0e0e0; border-radius: 4px; max-height: 350px; overflow-y: auto;">
        <div style="background: #f5f5f5; padding: 10px; border-bottom: 1px solid #e0e0e0; display: flex; align-items: center; gap: 10px;">
          <div style="flex: 1; font-weight: 500;">Select columns to rename:</div>
          <label style="font-size: 12px; color: #666; display: flex; align-items: center; cursor: pointer;" title="Toggle individual override options">
            <input type="checkbox" class="dh-show-individual-override" style="margin-right: 5px;">
            Show individual overrides
          </label>
        </div>
        <div class="dh-column-list" style="padding: 10px;">
          ${columns.map((column, index) => `
            <label style="display: flex; align-items: center; padding: 8px 0; border-bottom: 1px solid #f0f0f0;">
              <input type="checkbox" class="dh-column-checkbox" data-index="${index}" style="margin-right: 12px;">
              <span style="flex: 1; font-family: monospace; background: #f8f8f8; padding: 4px 8px; border-radius: 3px;">
                ${column.name}
                ${column.renameValue ? `<span style="color: #2196F3; font-size: 11px;"> (renamed: ${column.renameValue})</span>` : ''}
              </span>
              <span style="margin-left: 8px; font-size: 12px; color: #666; min-width: 150px; text-align: right;">
                → <span class="dh-preview" data-index="${index}"><em>Preview</em></span>
              </span>
              <label class="dh-individual-override" data-index="${index}" style="margin-left: 10px; font-size: 11px; color: #666; display: none; cursor: pointer;" title="Use existing rename for this column">
                <input type="checkbox" class="dh-use-existing-individual" data-index="${index}" style="margin-left: 5px;">
                Use existing
              </label>
            </label>
          `).join('')}
        </div>
      </div>
    </div>
    
    <div style="padding: 20px; border-top: 1px solid #e0e0e0; display: flex; gap: 10px; justify-content: flex-end;">
      <button class="dh-cancel-btn db-text-button Button-module_button__7BLGt Button-module_default__utLb- Button-module_flat__aBcd9" type="button">
        <span class="Button-module_content__b7-cz">Cancel</span>
      </button>
      <button class="dh-apply-btn db-text-button Button-module_button__7BLGt Button-module_primary__iHPwQ Button-module_raised__IpSHu" type="button">
        <span class="Button-module_content__b7-cz">Apply Rename</span>
      </button>
    </div>
  `;
  
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  bulkRenameModal = overlay;
  
  // Setup event handlers
  setupBulkRenameHandlers(modal, columns);
  
  // Initial preview update
  updatePreviews(modal, columns);
  
  // Focus first input
  setTimeout(() => {
    modal.querySelector('.dh-prefix-input').focus();
  }, 100);
}

// Setup event handlers for bulk rename modal
function setupBulkRenameHandlers(modal, columns) {
  const prefixInput = modal.querySelector('.dh-prefix-input');
  const suffixInput = modal.querySelector('.dh-suffix-input');
  const findInput = modal.querySelector('.dh-find-input');
  const replaceInput = modal.querySelector('.dh-replace-input');
  const caseSensitiveCheckbox = modal.querySelector('.dh-case-sensitive-checkbox');
  const findReplaceEnabledCheckbox = modal.querySelector('.dh-find-replace-enabled');
  const findReplaceToggle = modal.querySelector('.dh-find-replace-toggle');
  const findReplaceContent = modal.querySelector('.dh-find-replace-content');
  const selectAllCheckbox = modal.querySelector('.dh-select-all-checkbox');
  const useExistingCheckbox = modal.querySelector('.dh-use-existing-checkbox');
  const showIndividualOverride = modal.querySelector('.dh-show-individual-override');
  const columnCheckboxes = modal.querySelectorAll('.dh-column-checkbox');
  const individualOverrides = modal.querySelectorAll('.dh-individual-override');
  const individualCheckboxes = modal.querySelectorAll('.dh-use-existing-individual');
  const applyBtn = modal.querySelector('.dh-apply-btn');
  const cancelBtn = modal.querySelector('.dh-cancel-btn');
  
  // Toggle find and replace section
  findReplaceToggle.addEventListener('click', () => {
    const isVisible = findReplaceContent.style.display !== 'none';
    findReplaceContent.style.display = isVisible ? 'none' : 'block';
    const icon = findReplaceToggle.querySelector('i');
    icon.className = isVisible ? 'db-icon icon-chevron-down xs' : 'db-icon icon-chevron-up xs';
  });
  
  // Update previews when inputs change
  const updatePreviewsDebounced = debounce(() => updatePreviews(modal, columns), 200);
  prefixInput.addEventListener('input', updatePreviewsDebounced);
  suffixInput.addEventListener('input', updatePreviewsDebounced);
  findInput.addEventListener('input', updatePreviewsDebounced);
  replaceInput.addEventListener('input', updatePreviewsDebounced);
  caseSensitiveCheckbox.addEventListener('change', () => updatePreviews(modal, columns));
  findReplaceEnabledCheckbox.addEventListener('change', () => updatePreviews(modal, columns));
  
  // Update previews when use existing checkbox changes
  useExistingCheckbox.addEventListener('change', () => {
    updatePreviews(modal, columns);
    
    // Sync individual checkboxes to match global setting
    if (!showIndividualOverride.checked) {
      individualCheckboxes.forEach(cb => {
        cb.checked = useExistingCheckbox.checked;
      });
    }
  });
  
  // Show/hide individual override checkboxes
  showIndividualOverride.addEventListener('change', (e) => {
    const show = e.target.checked;
    individualOverrides.forEach(el => {
      el.style.display = show ? 'flex' : 'none';
    });
    
    if (show) {
      // When showing, sync individual checkboxes to global setting
      individualCheckboxes.forEach(cb => {
        cb.checked = useExistingCheckbox.checked;
      });
      // Disable global checkbox when showing individual
      useExistingCheckbox.disabled = true;
      useExistingCheckbox.parentElement.style.opacity = '0.6';
    } else {
      // When hiding, enable global checkbox
      useExistingCheckbox.disabled = false;
      useExistingCheckbox.parentElement.style.opacity = '1';
    }
    
    updatePreviews(modal, columns);
  });
  
  // Update previews when individual checkboxes change
  individualCheckboxes.forEach(cb => {
    cb.addEventListener('change', () => {
      updatePreviews(modal, columns);
    });
  });
  
  // Select all functionality
  selectAllCheckbox.addEventListener('change', (e) => {
    columnCheckboxes.forEach(checkbox => {
      checkbox.checked = e.target.checked;
    });
    updateApplyButtonState();
  });
  
  // Individual checkbox changes
  columnCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      // Update select all state
      const checkedCount = Array.from(columnCheckboxes).filter(cb => cb.checked).length;
      if (checkedCount === 0) {
        selectAllCheckbox.indeterminate = false;
        selectAllCheckbox.checked = false;
      } else if (checkedCount === columnCheckboxes.length) {
        selectAllCheckbox.indeterminate = false;
        selectAllCheckbox.checked = true;
      } else {
        selectAllCheckbox.indeterminate = true;
        selectAllCheckbox.checked = false;
      }
      
      updateApplyButtonState();
    });
  });
  
  // Update apply button state based on selection
  function updateApplyButtonState() {
    const hasSelection = Array.from(columnCheckboxes).some(cb => cb.checked);
    applyBtn.disabled = !hasSelection;
    applyBtn.style.opacity = hasSelection ? '1' : '0.5';
  }
  
  // Apply button
  applyBtn.addEventListener('click', () => {
    applyBulkRename(modal, columns);
  });
  
  // Cancel button
  cancelBtn.addEventListener('click', closeBulkRenameModal);
  
  // Close on overlay click
  bulkRenameModal.addEventListener('click', (e) => {
    if (e.target === bulkRenameModal) {
      closeBulkRenameModal();
    }
  });
  
  // Close on Escape key
  document.addEventListener('keydown', handleEscapeKey);
  
  // Initial button state
  updateApplyButtonState();
}

// Update preview names in the modal
function updatePreviews(modal, columns) {
  const prefix = modal.querySelector('.dh-prefix-input').value;
  const suffix = modal.querySelector('.dh-suffix-input').value;
  const findText = modal.querySelector('.dh-find-input').value;
  const replaceText = modal.querySelector('.dh-replace-input').value;
  const caseSensitive = modal.querySelector('.dh-case-sensitive-checkbox').checked;
  const findReplaceEnabled = modal.querySelector('.dh-find-replace-enabled').checked;
  const useExistingGlobal = modal.querySelector('.dh-use-existing-checkbox').checked;
  const showIndividual = modal.querySelector('.dh-show-individual-override').checked;
  
  modal.querySelectorAll('.dh-preview').forEach(preview => {
    const index = parseInt(preview.dataset.index);
    const column = columns[index];
    
    if (column) {
      // Determine if we should use existing rename value for this column
      let useExisting = useExistingGlobal;
      
      // If individual overrides are shown, use the individual checkbox
      if (showIndividual) {
        const individualCheckbox = modal.querySelector(`.dh-use-existing-individual[data-index="${index}"]`);
        useExisting = individualCheckbox?.checked ?? false;
      }
      
      // Build the new name
      let baseName = column.name;
      if (useExisting && column.renameValue) {
        baseName = column.renameValue;
      }
      
      // Apply find and replace if enabled and find text is not empty
      if (findReplaceEnabled && findText) {
        if (caseSensitive) {
          // Case sensitive replace - use split/join for all occurrences
          baseName = baseName.split(findText).join(replaceText);
        } else {
          // Case insensitive replace - use regex with 'gi' flag
          const regex = new RegExp(escapeRegex(findText), 'gi');
          baseName = baseName.replace(regex, replaceText);
        }
      }
      
      // Apply prefix and suffix
      const newName = `${prefix}${baseName}${suffix}`;
      preview.textContent = newName;
      preview.style.fontFamily = 'monospace';
      preview.style.background = '#e8f5e8';
      preview.style.padding = '2px 4px';
      preview.style.borderRadius = '2px';
    }
  });
}

// Helper function to escape special regex characters
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Apply bulk rename to selected columns
async function applyBulkRename(modal, columns) {
  const prefix = modal.querySelector('.dh-prefix-input').value;
  const suffix = modal.querySelector('.dh-suffix-input').value;
  const findText = modal.querySelector('.dh-find-input').value;
  const replaceText = modal.querySelector('.dh-replace-input').value;
  const caseSensitive = modal.querySelector('.dh-case-sensitive-checkbox').checked;
  const findReplaceEnabled = modal.querySelector('.dh-find-replace-enabled').checked;
  const useExistingGlobal = modal.querySelector('.dh-use-existing-checkbox').checked;
  const showIndividual = modal.querySelector('.dh-show-individual-override').checked;
  const selectedIndices = Array.from(modal.querySelectorAll('.dh-column-checkbox:checked'))
    .map(cb => parseInt(cb.dataset.index));
  
  if (selectedIndices.length === 0) {
    DHref?.showNotification?.('No columns selected', '#FF9800');
    return;
  }
  
  // Get the native input value setter
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  ).set;
  
  let successCount = 0;
  
  // Apply rename to each selected column sequentially with delays
  for (const index of selectedIndices) {
    const column = columns[index];
    if (column && column.renameInput) {
      // Determine if we should use existing rename value for this column
      let useExisting = useExistingGlobal;
      
      // If individual overrides are shown, use the individual checkbox
      if (showIndividual) {
        const individualCheckbox = modal.querySelector(`.dh-use-existing-individual[data-index="${index}"]`);
        useExisting = individualCheckbox?.checked ?? false;
      }
      
      // Build the new name
      let baseName = column.name;
      if (useExisting && column.renameValue) {
        baseName = column.renameValue;
      }
      
      // Apply find and replace if enabled and find text is not empty
      if (findReplaceEnabled && findText) {
        if (caseSensitive) {
          // Case sensitive replace
          baseName = baseName.split(findText).join(replaceText);
        } else {
          // Case insensitive replace
          const regex = new RegExp(escapeRegex(findText), 'gi');
          baseName = baseName.replace(regex, replaceText);
        }
      }
      
      // Apply prefix and suffix
      const newName = `${prefix}${baseName}${suffix}`;
      
      // Focus the input first (important for React to track it)
      column.renameInput.focus();
      
      // Wait a bit for focus to register
      await new Promise(r => setTimeout(r, 50));
      
      // Use React's way to set the value
      nativeInputValueSetter.call(column.renameInput, newName);
      
      // Trigger input event (this is what React listens to)
      const inputEvent = new Event('input', { bubbles: true });
      column.renameInput.dispatchEvent(inputEvent);
      
      // Trigger change event
      const changeEvent = new Event('change', { bubbles: true });
      column.renameInput.dispatchEvent(changeEvent);
      
      // Wait before blur
      await new Promise(r => setTimeout(r, 50));
      
      // IMPORTANT: Blur the input to force React to commit the change
      column.renameInput.blur();
      
      // Wait for React to process the blur before moving to next column
      await new Promise(r => setTimeout(r, 100));
      
      successCount++;
    }
  }
  
  // Close modal after all updates are complete
  closeBulkRenameModal();
  
  if (successCount > 0) {
    DHref?.showNotification?.(
      `Applied bulk rename to ${successCount} column${successCount === 1 ? '' : 's'}`, 
      '#4CAF50'
    );
  } else {
    DHref?.showNotification?.('Failed to apply bulk rename', '#ed3737');
  }
}

// Handle escape key for modal
function handleEscapeKey(e) {
  if (e.key === 'Escape' && bulkRenameModal) {
    closeBulkRenameModal();
  }
}

// Close bulk rename modal
function closeBulkRenameModal() {
  if (bulkRenameModal) {
    document.removeEventListener('keydown', handleEscapeKey);
    document.body.removeChild(bulkRenameModal);
    bulkRenameModal = null;
  }
}

// Debounce utility function
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Initialize the feature
async function init({ DH }) {
  if (isActive) return;
  
  // Subscribe to context updates from background.js
  if (window.subscribeToContextUpdates) {
    window.subscribeToContextUpdates((context) => {
      const isMagicETL = ['DATAFLOW', 'MAGIC_ETL', 'DATAFLOW_TYPE'].includes(context?.domoObject?.typeId);
      if (!isMagicETL) {
        console.log('[Select Columns Rename] Non-ETL context detected');
      } else {
        console.log('[Select Columns Rename] ETL context detected, feature active');
      }
    });
  }
  
  DHref = DH;
  isActive = true;
  
  // Load shared utilities
  await loadSharedUtils();
  
  observerSelectColumns = setupSelectColumnsObserver(
    // Init callback when Select Columns becomes active
    () => {
      addCopyButtons();
      addBulkRenameButton();
    },
    // Cleanup callback when Select Columns becomes inactive
    () => {
      closeBulkRenameModal();
      document.querySelectorAll('.dh-copy-name-btn, .dh-clear-rename-btn').forEach(el => el.remove());
    }
  );
  
  // Listen for refresh events from other features (like reorder)
  document.addEventListener('dh-select-columns-refresh', () => {
    if (isSelectColumnsActive()) {
      addCopyButtons();
    }
  });
}
// Cleanup the feature
function cleanup() {
  if (!isActive) return;
  
  isActive = false;
  DHref = null;
  
  if (observerSelectColumns) {
    observerSelectColumns.disconnect();
    observerSelectColumns = null;
  }
  
  // Close modal if open
  closeBulkRenameModal();
  
  // Remove added elements
  document.querySelectorAll('.dh-copy-name-btn, .dh-clear-rename-btn, .dh-bulk-rename-btn').forEach(el => el.remove());
}

// Apply settings changes
function applySettings(newSettings) {
  // This feature doesn't currently use settings, but we implement this for consistency
}

export default {
  init,
  cleanup,
  applySettings
};