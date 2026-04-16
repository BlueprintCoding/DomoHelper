// content/features/feature-select-columns-reorder.js
// Adds bulk reordering functionality to Magic ETL "Select Columns" transformation

let DHref = null;
let isActive = false;
let observerSelectColumns = null;
let isReordering = false;

let SELECTORS, isSelectColumnsActive, getColumnItems, setupSelectColumnsObserver, ensureColumnId;

async function loadSharedUtils() {
  const utils = await import(chrome.runtime.getURL('content/shared/select-columns-utils.js'));
  SELECTORS = utils.SELECTORS;
  isSelectColumnsActive = utils.isSelectColumnsActive;
  getColumnItems = utils.getColumnItems;
  setupSelectColumnsObserver = utils.setupSelectColumnsObserver;
  ensureColumnId = utils.ensureColumnId;
}

// Ensure each column row has a stable ID for option targeting
function ensureDhId(el) {
  try {
    if (!el?.dataset) return null;
    if (!el.dataset.dhId) {
      el.dataset.dhId = 'dh-' + Math.random().toString(36).slice(2, 10);
    }
    return el.dataset.dhId;
  } catch { return null; }
}

// Directly manipulate input values and trigger React updates
function reorderByManipulatingState(fromIndex, toIndex, columns) {
  console.log('🔄 Attempting to manipulate column state directly...');
  
  // Strategy: Swap the rename input values to trigger React re-render
  // This won't actually reorder, but might trigger state updates we can use
  
  // Get all rename inputs
  const renameInputs = columns.map(c => c.renameInput).filter(Boolean);
  
  if (renameInputs.length === 0) {
    console.log('❌ No rename inputs found');
    return false;
  }
  
  // Store current values
  const values = renameInputs.map(input => input.value);
  
  // Swap values at fromIndex and toIndex
  const temp = values[fromIndex];
  values[fromIndex] = values[toIndex];
  values[toIndex] = temp;
  
  // Apply new values and trigger React's onChange
  renameInputs.forEach((input, i) => {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    ).set;
    
    nativeInputValueSetter.call(input, values[i]);
    
    // Trigger React's synthetic event
    const event = new Event('input', { bubbles: true });
    input.dispatchEvent(event);
  });
  
  console.log('✅ Values swapped, React should update');
  return false; // This won't actually reorder columns
}

// Use the remove button to manipulate order
async function reorderUsingRemoveAndAdd(fromIndex, toIndex, columns) {
  console.log('🔄 Attempting reorder via remove/add...');
  
  // Get the column to move
  const columnToMove = columns[fromIndex];
  const columnName = columnToMove.name;
  const renameValue = columnToMove.renameValue;
  
  // Step 1: Click remove button
  const removeButton = columnToMove.element.querySelector(SELECTORS.removeButton);
  if (!removeButton) {
    console.log('❌ No remove button found');
    return false;
  }
  
  console.log(`📋 Removing column: ${columnName}`);
  removeButton.click();
  
  await new Promise(r => setTimeout(r, 300));
  
  // Step 2: Find the "Add Column" dropdown
  const columnPicker = document.querySelector(SELECTORS.columnPicker);
  if (!columnPicker) {
    console.log('❌ Column picker not found');
    return false;
  }
  
  const input = columnPicker.querySelector('input');
  if (!input) {
    console.log('❌ Column picker input not found');
    return false;
  }
  
  // Step 3: Type the column name to search
  console.log(`📋 Re-adding column: ${columnName}`);
  
  // Enable the input (it's disabled when all columns are selected)
  input.disabled = false;
  
  // Set value using React's way
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  ).set;
  nativeInputValueSetter.call(input, columnName);
  
  // Trigger input event
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  
  await new Promise(r => setTimeout(r, 200));
  
  // Step 4: Find and click the matching option
  const dropdown = columnPicker.querySelector('[role="listbox"]');
  if (dropdown) {
    const options = Array.from(dropdown.querySelectorAll('[role="option"]'));
    const matchingOption = options.find(opt => opt.textContent.trim() === columnName);
    
    if (matchingOption) {
      console.log('✅ Found matching option, clicking...');
      matchingOption.click();
      
      await new Promise(r => setTimeout(r, 300));
      
      // Restore rename value if it had one
      if (renameValue) {
        const newColumns = getColumnItems();
        const readdedColumn = newColumns[newColumns.length - 1]; // It's added at the end
        if (readdedColumn?.renameInput) {
          nativeInputValueSetter.call(readdedColumn.renameInput, renameValue);
          readdedColumn.renameInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
      
      return true;
    }
  }
  
  console.log('❌ Could not find dropdown option');
  return false;
}

// Add reorder dropdowns to each column row
function addReorderDropdowns() {
  const columns = getColumnItems();
  
  if (columns.length === 0) {
    console.log('⏳ No columns found yet, will retry...');
    setTimeout(() => {
      if (isSelectColumnsActive() && getColumnItems().length > 0) {
        addReorderDropdowns();
      }
    }, 300);
    return;
  }
  
  console.log(`📋 Checking ${columns.length} columns for dropdowns`);
  
  // First pass: ensure all elements have IDs
  columns.forEach(column => ensureDhId(column.element));
  
  let addedCount = 0;
  let skippedCount = 0;
  
  columns.forEach((column, index) => {
    // Skip if dropdown already added
    if (column.element.querySelector('.dh-reorder-dropdown')) {
      skippedCount++;
      return;
    }
    
    const thisId = column.element.dataset.dhId;
    if (!thisId) {
      console.warn(`⚠️ No dh-id for column ${index}: ${column.name}`);
      return;
    }
    
    const dropdownContainer = document.createElement('div');
    dropdownContainer.className = 'dh-reorder-dropdown';
    dropdownContainer.style.cssText = `
      display: flex;
      align-items: center;
      margin-left: 8px;
      margin-right: 8px;
      min-width: 120px;
    `;
    
    const dropdown = document.createElement('select');
    dropdown.className = 'dh-move-after-select Input-module_input__aRXjR';
    dropdown.style.cssText = 'font-size: 12px; padding: 2px 4px; border: 1px solid #ddd; border-radius: 3px;';
    dropdown.title = 'Move After Column';
    
    // Build dropdown options
    const options = [
      '<option value="" disabled selected>-- Move --</option>',
      '<option value="top">-- Move to Top --</option>'
    ];
    
    columns.forEach((otherColumn, otherIndex) => {
      if (otherIndex !== index) {
        const otherId = otherColumn.element.dataset.dhId;
        if (otherId) {
          options.push(`<option value="id:${otherId}">After: ${otherColumn.name}</option>`);
        }
      }
    });
    
    options.push('<option value="end">-- Move to End --</option>');
    dropdown.innerHTML = options.join('');
    dropdown.value = '';
    
    dropdownContainer.appendChild(dropdown);
    
    // Insert dropdown after the field name
    const fieldName = column.element.querySelector(SELECTORS.fieldName);
    if (fieldName) {
      fieldName.insertAdjacentElement('afterend', dropdownContainer);
      addedCount++;
    } else {
      console.warn(`⚠️ No field name found for column ${index}`);
    }
    
    // Add event listener for dropdown change
    dropdown.addEventListener('change', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const selectedValue = e.target.value;
      const current = getColumnItems();
      const sourceEl = dropdown.closest(SELECTORS.columnField);
      const srcIndex = current.findIndex(c => c.element === sourceEl);
      
      if (srcIndex < 0) { e.target.value = ''; return; }

      let targetIndex = null;
      if (selectedValue === 'top') {
        targetIndex = 0;
      } else if (selectedValue === 'end') {
        targetIndex = current.length - 1;
      } else if (selectedValue && selectedValue.startsWith('id:')) {
        const targetId = selectedValue.slice(3);
        const tgtIdx = current.findIndex(c => c.element?.dataset?.dhId === targetId);
        if (tgtIdx >= 0) {
          targetIndex = tgtIdx < srcIndex ? tgtIdx + 1 : tgtIdx;
        }
      }
      
      if (targetIndex !== null && targetIndex !== srcIndex && targetIndex !== srcIndex + 1) {
        e.target.value = '';
        console.log(`🎯 Moving from ${srcIndex} to ${targetIndex}`);
        moveColumnToPosition(srcIndex, targetIndex);
      } else {
        e.target.value = '';
      }
    });
  });
  
  if (addedCount > 0) {
    console.log(`✅ Added ${addedCount} new dropdowns (${skippedCount} already present)`);
  }
}

// Move a column using remove/add strategy
async function moveColumnToPosition(fromIndex, toIndex) {
  if (isReordering) {
    console.log('❌ Already reordering');
    return;
  }
  
  const columns = getColumnItems();
  console.log('📋 Moving:', fromIndex, '→', toIndex, '|', columns.map(c => c.name).join(', '));
  
  if (fromIndex < 0 || fromIndex >= columns.length || toIndex < 0 || toIndex >= columns.length) {
    console.log('❌ Invalid indices');
    return;
  }
  
  if (fromIndex === toIndex || toIndex === fromIndex + 1) {
    console.log('❌ No-op move');
    return;
  }
  
  isReordering = true;
  
  try {
    // Determine how many columns we need to remove and re-add
    let columnsToRemove = [];
    
    if (fromIndex < toIndex) {
      // Moving down: remove source, then remove all from target+1 to end
      columnsToRemove.push({ ...columns[fromIndex], originalIndex: fromIndex });
      for (let i = toIndex; i < columns.length; i++) {
        if (i !== fromIndex) {
          columnsToRemove.push({ ...columns[i], originalIndex: i });
        }
      }
    } else {
      // Moving up: remove all from target to source (inclusive)
      for (let i = toIndex; i <= fromIndex; i++) {
        columnsToRemove.push({ ...columns[i], originalIndex: i });
      }
    }
    
    // Sort by index descending so we remove from bottom up (stable indices)
    columnsToRemove.sort((a, b) => b.originalIndex - a.originalIndex);
    
    console.log('📋 Removing columns:', columnsToRemove.map(c => c.name).join(', '));
    
    // Remove all columns with minimal delay
    for (const col of columnsToRemove) {
      const currentColumns = getColumnItems();
      const currentCol = currentColumns.find(c => c.name === col.name);
      if (!currentCol) continue;
      
      const removeButton = currentCol.element.querySelector(SELECTORS.removeButton);
      if (removeButton) {
        removeButton.click();
        await new Promise(r => setTimeout(r, 30)); // Reduced from 50ms
      }
    }
    
    // Minimal wait for DOM to settle
    await new Promise(r => setTimeout(r, 50)); // Reduced from 100ms
    
    // Now re-add in the correct order
    let readdOrder = [];
    if (fromIndex < toIndex) {
      // Moving down: add everything except source, then add source
      readdOrder = columnsToRemove.filter(c => c.originalIndex !== fromIndex);
      readdOrder.push(columnsToRemove.find(c => c.originalIndex === fromIndex));
    } else {
      // Moving up: add source first, then the rest
      const sourceCol = columnsToRemove.find(c => c.originalIndex === fromIndex);
      const others = columnsToRemove.filter(c => c.originalIndex !== fromIndex).reverse();
      readdOrder = [sourceCol, ...others];
    }
    
    console.log('📋 Re-adding columns:', readdOrder.map(c => c.name).join(', '));
    
    // Re-add all columns with minimal delay
    for (const col of readdOrder) {
      const success = await addColumnByName(col.name, col.renameValue);
      if (!success) {
        console.warn(`⚠️ Failed to re-add column: ${col.name}`);
        DHref?.showNotification?.(`Failed to reorder - ${col.name} couldn't be re-added`, '#ed3737');
        isReordering = false;
        return;
      }
      // No delay between re-adds - let them happen as fast as possible
    }
    
    DHref?.showNotification?.('Column reordered successfully', '#4CAF50');
    await new Promise(r => setTimeout(r, 100)); // Reduced from 200ms
    refreshReorderDropdowns();
    
  } catch (error) {
    console.error('❌ Reorder failed:', error);
    DHref?.showNotification?.('Reorder failed - try dragging manually', '#ed3737');
  } finally {
    isReordering = false;
  }
}

// Helper function to add a column by name
async function addColumnByName(columnName, renameValue = '') {
  const columnPicker = document.querySelector(SELECTORS.columnPicker);
  if (!columnPicker) {
    console.log('❌ Column picker not found');
    return false;
  }
  
  const input = columnPicker.querySelector('input');
  if (!input) {
    console.log('❌ Column picker input not found');
    return false;
  }
  
  console.log(`📋 Adding column: ${columnName}`);
  
  // Enable the input
  input.disabled = false;
  input.readOnly = false;
  
  // Set value using React's way
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  ).set;
  
  // Clear and set value in one go
  nativeInputValueSetter.call(input, '');
  input.focus();
  nativeInputValueSetter.call(input, columnName);
  
  // Trigger input events
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  
  // Wait for dropdown to appear - optimized polling
  let listbox = null;
  for (let attempt = 0; attempt < 8; attempt++) { // Increased attempts but shorter interval
    await new Promise(r => setTimeout(r, 50)); // Check every 50ms instead of 100ms
    
    listbox = document.querySelector('.DfColumnPicker_selectList_7eff4');
    
    if (!listbox) {
      const allListboxes = Array.from(document.querySelectorAll('[role="grid"][aria-label="grid"]'));
      listbox = allListboxes.find(lb => {
        const rect = lb.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
    }
    
    if (listbox) {
      // Also check if options are loaded
      const optionContainer = listbox.querySelector('.ReactVirtualized__Grid__innerScrollContainer');
      if (optionContainer?.querySelectorAll('[role="option"]').length > 0) {
        break; // Found it with options loaded
      }
    }
  }
  
  if (!listbox) {
    console.log('❌ No listbox found after retries');
    return false;
  }
  
  // Find options - they're in a virtual scrolling container
  const optionContainer = listbox.querySelector('.ReactVirtualized__Grid__innerScrollContainer');
  if (!optionContainer) {
    console.log('❌ No option container found');
    return false;
  }
  
  const options = Array.from(optionContainer.querySelectorAll('[role="option"]'));
  
  if (options.length === 0) {
    console.log('❌ No options in listbox');
    return false;
  }
  
  // Find exact match by looking at text content
  const matchingOption = options.find(opt => {
    // Try to find truncated text div first (class may vary with version suffix)
    const truncateDiv = opt.querySelector('[class*="truncateText"]');
    if (truncateDiv) {
      const text = truncateDiv.textContent.trim();
      if (text === columnName) return true;
    }
    // Fallback to textContent of the whole option
    const text = opt.textContent.trim();
    return text === columnName;
  });
  
  if (matchingOption) {
    console.log('✅ Found matching option:', columnName);
    
    // Click the option
    matchingOption.click();
    
    await new Promise(r => setTimeout(r, 50)); // Reduced from 100ms
    
    // Restore rename value if it had one (do this without waiting)
    if (renameValue) {
      // Use setTimeout to not block the next operation
      setTimeout(() => {
        const currentColumns = getColumnItems();
        const readdedColumn = currentColumns[currentColumns.length - 1];
        if (readdedColumn?.renameInput) {
          nativeInputValueSetter.call(readdedColumn.renameInput, renameValue);
          readdedColumn.renameInput.dispatchEvent(new Event('input', { bubbles: true }));
          readdedColumn.renameInput.dispatchEvent(new Event('blur', { bubbles: true }));
        }
      }, 0);
    }
    
    return true;
  }
  
  console.log('❌ Could not find dropdown option for:', columnName);
  return false;
}

// Add bulk sort buttons to toolbar
// Add bulk sort buttons to toolbar
function addBulkSortButtons() {
  const toolbar = document.querySelector(SELECTORS.buttonsContainer);
  if (!toolbar) {
    console.warn('⚠️ Toolbar not found for bulk sort buttons');
    return;
  }
  
  // Check if buttons already exist
  if (toolbar.querySelector('.dh-sort-az-btn')) {
    return;
  }
  
  // Create container for both buttons
  const sortContainer = document.createElement('div');
  sortContainer.className = 'dh-sort-buttons-container';
  sortContainer.style.cssText = `
    display: flex;
    gap: 4px;
    align-items: center;
  `;
  
  // Create A-Z sort button
  const sortAZBtn = document.createElement('button');
  sortAZBtn.className = 'dh-sort-az-btn db-text-button Button-module_button__7BLGt_v3 Button-module_default__utLb-_v3 Button-module_flat__aBcd9_v3';
  sortAZBtn.type = 'button';
  sortAZBtn.setAttribute('data-testid', 'SORT_AZ_BUTTON');
  sortAZBtn.title = 'Sort columns A-Z';
  sortAZBtn.innerHTML = `
    <span class="Button-module_content__b7-cz_v3">
      <span style="font-size: 11px; font-weight: 600;">A-Z</span>
    </span>
  `;
  
  // Create Z-A sort button
  const sortZABtn = document.createElement('button');
  sortZABtn.className = 'dh-sort-za-btn db-text-button Button-module_button__7BLGt_v3 Button-module_default__utLb-_v3 Button-module_flat__aBcd9_v3';
  sortZABtn.type = 'button';
  sortZABtn.setAttribute('data-testid', 'SORT_ZA_BUTTON');
  sortZABtn.title = 'Sort columns Z-A';
  sortZABtn.innerHTML = `
    <span class="Button-module_content__b7-cz_v3">
      <span style="font-size: 11px; font-weight: 600;">Z-A</span>
    </span>
  `;
  
  sortContainer.appendChild(sortAZBtn);
  sortContainer.appendChild(sortZABtn);
  
  // Add event listeners
  sortAZBtn.addEventListener('click', () => bulkSortColumns('asc'));
  sortZABtn.addEventListener('click', () => bulkSortColumns('desc'));
  
  // Insert before the Done button
  const doneButton = toolbar.querySelector('.DfEditorDoneButton_doneButton_75b3a');
  if (doneButton) {
    doneButton.parentElement.insertBefore(sortContainer, doneButton);
  } else {
    toolbar.appendChild(sortContainer);
  }
  
  console.log('✅ Bulk sort buttons added');
}

// Bulk sort all columns alphabetically
async function bulkSortColumns(direction = 'asc') {
  if (isReordering) {
    DHref?.showNotification?.('Already reordering columns', '#FF9800');
    return;
  }
  
  const columns = getColumnItems();
  if (columns.length <= 1) {
    DHref?.showNotification?.('Need at least 2 columns to sort', '#FF9800');
    return;
  }
  
  // Create a sorted version of columns
  // Use rename value if present, otherwise use original name
  const columnsWithSortKey = columns.map((col, index) => ({
    ...col,
    sortKey: (col.renameValue || col.name).toLowerCase(),
    originalPosition: index
  }));
  
  // Sort by the sort key
  columnsWithSortKey.sort((a, b) => {
    if (direction === 'asc') {
      return a.sortKey.localeCompare(b.sortKey);
    } else {
      return b.sortKey.localeCompare(a.sortKey);
    }
  });
  
  // Check if order actually changed
  const orderChanged = columnsWithSortKey.some((col, index) => col.originalPosition !== index);
  if (!orderChanged) {
    DHref?.showNotification?.(`Columns already in ${direction === 'asc' ? 'A-Z' : 'Z-A'} order`, '#4CAF50');
    return;
  }
  
  // Confirm with user
  const sortedNames = columnsWithSortKey.map(c => c.renameValue || c.name).join(', ');
  const confirmMsg = `Sort all columns ${direction === 'asc' ? 'A-Z' : 'Z-A'}?\n\nNew order: ${sortedNames}`;
  
  if (!confirm(confirmMsg)) {
    return;
  }
  
  isReordering = true;
  
  try {
    DHref?.showNotification?.(`Sorting columns ${direction === 'asc' ? 'A-Z' : 'Z-A'}...`, '#2196F3');
    
    console.log('📋 Original order:', columns.map(c => c.name).join(', '));
    console.log('📋 Sorted order:', columnsWithSortKey.map(c => c.name).join(', '));
    
    // Remove all columns from bottom to top
    console.log('📋 Removing all columns...');
    const columnsToRemove = [...columns].reverse(); // Remove from bottom up
    
    for (const col of columnsToRemove) {
      const currentColumns = getColumnItems();
      const currentCol = currentColumns.find(c => c.name === col.name);
      if (!currentCol) continue;
      
      const removeButton = currentCol.element.querySelector(SELECTORS.removeButton);
      if (removeButton) {
        removeButton.click();
        await new Promise(r => setTimeout(r, 30));
      }
    }
    
    // Wait for DOM to settle
    await new Promise(r => setTimeout(r, 100));
    
    // Re-add columns in sorted order
    console.log('📋 Re-adding columns in sorted order...');
    for (const col of columnsWithSortKey) {
      const success = await addColumnByName(col.name, col.renameValue);
      if (!success) {
        console.warn(`⚠️ Failed to re-add column: ${col.name}`);
        DHref?.showNotification?.(`Failed to sort - ${col.name} couldn't be re-added`, '#ed3737');
        isReordering = false;
        return;
      }
    }
    
    DHref?.showNotification?.(`Columns sorted ${direction === 'asc' ? 'A-Z' : 'Z-A'} successfully`, '#4CAF50');
    await new Promise(r => setTimeout(r, 100));
    refreshReorderDropdowns();
    
  } catch (error) {
    console.error('❌ Sort failed:', error);
    DHref?.showNotification?.('Sort failed - please try again', '#ed3737');
  } finally {
    isReordering = false;
  }
}

// Refresh all dropdowns
function refreshReorderDropdowns() {
  document.querySelectorAll('.dh-reorder-dropdown').forEach(d => d.remove());
  setTimeout(() => {
    addReorderDropdowns();
    document.querySelectorAll('.dh-move-after-select').forEach(s => { s.value = ''; });
    
    // Trigger a custom event so other features can refresh too
    const event = new CustomEvent('dh-select-columns-refresh', { bubbles: true });
    document.dispatchEvent(event);
  }, 200); // Increased delay to ensure DOM is settled
}


// Initialize the feature
async function init({ DH }) {
  if (isActive) return;
  
  console.log('🔧 Initializing Select Columns Reorder...');
  
  // Subscribe to context updates from background.js
  if (window.subscribeToContextUpdates) {
    window.subscribeToContextUpdates((context) => {
      const isMagicETL = ['DATAFLOW', 'MAGIC_ETL', 'DATAFLOW_TYPE'].includes(context?.domoObject?.typeId);
      if (!isMagicETL) {
        console.log('[Select Columns Reorder] Non-ETL context detected');
      } else {
        console.log('[Select Columns Reorder] ETL context detected, feature active');
      }
    });
  }
  
  DHref = DH;
  isActive = true;
  
  await loadSharedUtils();
  
  observerSelectColumns = setupSelectColumnsObserver(
    () => {
      console.log('📋 Select Columns opened - adding dropdowns');
      addReorderDropdowns();
      addBulkSortButtons();
    },
    () => {
      console.log('🧹 Cleaning up dropdowns and sort buttons');
      document.querySelectorAll('.dh-reorder-dropdown').forEach(el => el.remove());
      document.querySelectorAll('.dh-sort-buttons-container').forEach(el => el.remove());
    }
  );
  
  console.log('✅ Select Columns Reorder initialized');
}

// Cleanup
function cleanup() {
  if (!isActive) return;
  isActive = false;
  DHref = null;
  
  if (observerSelectColumns) {
    observerSelectColumns.disconnect();
    observerSelectColumns = null;
  }
  
  document.querySelectorAll('.dh-reorder-dropdown').forEach(el => el.remove());
  document.querySelectorAll('.dh-sort-buttons-container').forEach(el => el.remove());
}

// Apply settings
function applySettings(newSettings) {
  // No settings for this feature yet
}

export default {
  init,
  cleanup,
  applySettings
};