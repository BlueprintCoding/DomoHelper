// content/features/feature-select-columns-rename.js
// Adds enhanced rename functionality to Magic ETL "Select Columns" transformation

let DHref = null;
let isActive = false;
let observerSelectColumns = null;
let bulkRenameModal = null;

// Selectors based on the provided DOM structure
const SELECTORS = {
  actionEditor: '[data-testid="ACTION_EDITOR"]',
  selectColumnsContainer: '[data-testid="SELECT_COLUMNS_LIST"]',
  columnField: '.DfSelectColumns_field_59fc9',
  fieldName: '.DfSelectColumns_fieldName_59fc9',
  renameField: '.DfSelectColumns_rename_59fc9',
  renameInput: 'input[placeholder="Rename to"]',
  removeButton: '[data-testid^="remove_select_column_"]',
  selectColumnsEditor: '.DfActionEditor_innerEditorPanel_fe0ba',
  editorToolbar: '.DfEditorPanelToolbar_toolbar_a6045',
  buttonsContainer: '.DfEditorPanelToolbar_buttons_a6045'
};

// Check if we're in a Select Columns transformation
function isSelectColumnsActive() {
  const toolbar = document.querySelector(SELECTORS.editorToolbar);
  if (!toolbar) return false;
  
  const titleElement = toolbar.querySelector('.DfEditToggle_display_ddd57 .Truncate-module_truncateText__afW2y');
  return titleElement?.textContent?.trim() === 'Select Columns';
}

// Get all column items currently visible
function getColumnItems() {
  const container = document.querySelector(SELECTORS.selectColumnsContainer);
  if (!container) return [];
  
  return Array.from(container.querySelectorAll(SELECTORS.columnField))
    .map((field, index) => {
      const nameEl = field.querySelector(`${SELECTORS.fieldName} .Truncate-module_truncateText__afW2y`);
      const renameInput = field.querySelector(SELECTORS.renameInput);
      
      return {
        element: field,
        name: nameEl?.textContent?.trim() || `Column ${index + 1}`,
        renameInput: renameInput,
        renameValue: renameInput?.value || '',
        index: index
      };
    });
}

// Add copy buttons to rename fields
function addCopyButtons() {
  const columns = getColumnItems();
  
  columns.forEach((column, index) => {
    const renameField = column.element.querySelector(SELECTORS.renameField);
    if (!renameField || renameField.querySelector('.dh-copy-name-btn')) return;
    
    // Create copy button
    const copyButton = document.createElement('button');
    copyButton.className = 'dh-copy-name-btn db-text-button Button-module_button__7BLGt Button-module_default__utLb- Button-module_flat__aBcd9';
    copyButton.type = 'button';
    copyButton.title = `Copy "${column.name}" to rename field`;
    copyButton.style.cssText = `
      margin-left: 4px;
      padding: 2px 6px;
      min-width: auto;
      height: 28px;
    `;
    
    copyButton.innerHTML = `
      <span class="Button-module_content__b7-cz">
        <i class="db-icon icon-duplicate xs" role="presentation"></i>
      </span>
    `;
    
    // Add click handler
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
    
    // Insert button after the input span
    const inputSpan = renameField.querySelector('span[role="presentation"]');
    if (inputSpan) {
      inputSpan.insertAdjacentElement('afterend', copyButton);
    }
  });
}

// Add bulk rename button to toolbar
function addBulkRenameButton() {
  const toolbar = document.querySelector(SELECTORS.editorToolbar);
  if (!toolbar) return;
  
  // Check if button already exists
  if (toolbar.querySelector('.dh-bulk-rename-btn')) return;
  
  const buttonsContainer = toolbar.querySelector(SELECTORS.buttonsContainer);
  if (!buttonsContainer) return;
  
  const bulkRenameBtn = document.createElement('div');
  bulkRenameBtn.className = 'AnchoredPortal-module_anchorWrapper__j-Eqo';
  bulkRenameBtn.innerHTML = `
    <button data-testid="BULK_RENAME_BUTTON" class="dh-bulk-rename-btn db-text-button Button-module_button__7BLGt Button-module_default__utLb- Button-module_flat__aBcd9" type="button" aria-labelledby="dhBulkRenameTooltip">
      <span class="Button-module_content__b7-cz">
        <i class="db-icon icon-pencil sm" role="presentation"></i>
      </span>
    </button>
    <div role="tooltip" class="Tooltip-module_srOnly__V-ZI0" id="dhBulkRenameTooltip">
      <div><div>Bulk Rename with Pre/Suffix</div></div>
    </div>
  `;
  
  // Insert before the duplicate button
  const duplicateBtn = buttonsContainer.querySelector('[aria-labelledby*="duplicate" i], [data-testid*="duplicate" i]');
  if (duplicateBtn?.parentElement) {
    buttonsContainer.insertBefore(bulkRenameBtn, duplicateBtn.parentElement);
  } else {
    buttonsContainer.insertBefore(bulkRenameBtn, buttonsContainer.firstChild);
  }
  
  bulkRenameBtn.querySelector('.dh-bulk-rename-btn').addEventListener('click', openBulkRenameModal);
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
    max-width: 600px;
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
        
        <div style="margin-bottom: 15px;">
          <label style="display: flex; align-items: center; font-weight: 500; color: #555;">
            <input type="checkbox" class="dh-select-all-checkbox" style="margin-right: 8px;">
            Select All Columns
          </label>
        </div>
      </div>
      
      <div style="border: 1px solid #e0e0e0; border-radius: 4px; max-height: 300px; overflow-y: auto;">
        <div style="background: #f5f5f5; padding: 10px; border-bottom: 1px solid #e0e0e0; font-weight: 500;">
          Select columns to rename:
        </div>
        <div class="dh-column-list" style="padding: 10px;">
          ${columns.map((column, index) => `
            <label style="display: flex; align-items: center; padding: 8px 0; border-bottom: 1px solid #f0f0f0;">
              <input type="checkbox" class="dh-column-checkbox" data-index="${index}" style="margin-right: 12px;">
              <span style="flex: 1; font-family: monospace; background: #f8f8f8; padding: 4px 8px; border-radius: 3px;">
                ${column.name}
              </span>
              <span style="margin-left: 8px; font-size: 12px; color: #666;">
                → <span class="dh-preview" data-index="${index}"><em>Preview</em></span>
              </span>
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
  const selectAllCheckbox = modal.querySelector('.dh-select-all-checkbox');
  const columnCheckboxes = modal.querySelectorAll('.dh-column-checkbox');
  const applyBtn = modal.querySelector('.dh-apply-btn');
  const cancelBtn = modal.querySelector('.dh-cancel-btn');
  
  // Update previews when prefix/suffix changes
  const updatePreviewsDebounced = debounce(() => updatePreviews(modal, columns), 200);
  prefixInput.addEventListener('input', updatePreviewsDebounced);
  suffixInput.addEventListener('input', updatePreviewsDebounced);
  
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

// Handle escape key for modal
function handleEscapeKey(e) {
  if (e.key === 'Escape' && bulkRenameModal) {
    closeBulkRenameModal();
  }
}

// Update preview names in the modal
function updatePreviews(modal, columns) {
  const prefix = modal.querySelector('.dh-prefix-input').value;
  const suffix = modal.querySelector('.dh-suffix-input').value;
  
  modal.querySelectorAll('.dh-preview').forEach(preview => {
    const index = parseInt(preview.dataset.index);
    const column = columns[index];
    if (column) {
      const newName = `${prefix}${column.name}${suffix}`;
      preview.textContent = newName;
      preview.style.fontFamily = 'monospace';
      preview.style.background = '#e8f5e8';
      preview.style.padding = '2px 4px';
      preview.style.borderRadius = '2px';
    }
  });
}

// Apply bulk rename to selected columns
function applyBulkRename(modal, columns) {
  const prefix = modal.querySelector('.dh-prefix-input').value;
  const suffix = modal.querySelector('.dh-suffix-input').value;
  const selectedIndices = Array.from(modal.querySelectorAll('.dh-column-checkbox:checked'))
    .map(cb => parseInt(cb.dataset.index));
  
  if (selectedIndices.length === 0) {
    DHref?.showNotification?.('No columns selected', '#FF9800');
    return;
  }
  
  let successCount = 0;
  
  // Apply rename to each selected column
  selectedIndices.forEach(index => {
    const column = columns[index];
    if (column && column.renameInput) {
      const newName = `${prefix}${column.name}${suffix}`;
      column.renameInput.value = newName;
      
      // Trigger input event to notify any listeners
      const inputEvent = new Event('input', { bubbles: true });
      column.renameInput.dispatchEvent(inputEvent);
      const changeEvent = new Event('change', { bubbles: true });
      column.renameInput.dispatchEvent(changeEvent);
      
      successCount++;
    }
  });
  
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

// Observer to watch for Select Columns editor
function setupSelectColumnsObserver() {
  if (observerSelectColumns) return;
  
  observerSelectColumns = new MutationObserver((mutations) => {
    if (!isActive) return;
    
    // Check if Select Columns is now active
    if (isSelectColumnsActive()) {
      // Small delay to let the UI render
      setTimeout(() => {
        addCopyButtons();
        addBulkRenameButton();
      }, 100);
    }
  });
  
  observerSelectColumns.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Initialize the feature
function init({ DH }) {
  if (isActive) return;
  
  DHref = DH;
  isActive = true;
  
  setupSelectColumnsObserver();
  
  // Initial check
  if (isSelectColumnsActive()) {
    setTimeout(() => {
      addCopyButtons();
      addBulkRenameButton();
    }, 100);
  }
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
  document.querySelectorAll('.dh-copy-name-btn, .dh-bulk-rename-btn').forEach(el => el.remove());
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
