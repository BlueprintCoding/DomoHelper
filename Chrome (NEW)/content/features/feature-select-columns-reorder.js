// content/features/feature-select-columns-reorder.js
// Adds bulk reordering functionality to Magic ETL "Select Columns" transformation

let DHref = null;
let isActive = false;
let observerSelectColumns = null;
let isReordering = false; // Prevent recursive calls

// Selectors based on the provided DOM structure
const SELECTORS = {
  actionEditor: '[data-testid="ACTION_EDITOR"]',
  selectColumnsContainer: '[data-testid="SELECT_COLUMNS_LIST"]',
  columnField: '.DfSelectColumns_field_59fc9',
  reorderIcon: '.DfSelectColumns_reorderIcon_59fc9',
  fieldName: '.DfSelectColumns_fieldName_59fc9',
  numberSpace: '.DfSelectColumns_numberSpace_59fc9',
  removeButton: '[data-testid^="remove_select_column_"]',
  selectColumnsEditor: '.DfActionEditor_innerEditorPanel_fe0ba',
  editorToolbar: '.DfEditorPanelToolbar_toolbar_a6045'
};

// Tunables for pointer-based drag
const DH_REORDER_CONFIG = {
  pointer: {
    thresholdPx: 16,
    dwellMs: 40,
    stepsPerMove: 8,
    stepDelayMs: 10,
    verifyDelayMs: 150,
    retryDelayMs: 100
  },
  enableDebuggerDrag: false // can be toggled via window.DH_ENABLE_DEBUGGER_DRAG = true
};

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
  const items = Array.from(container.querySelectorAll(SELECTORS.columnField))
    .map((field, index) => {
      const nameEl = field.querySelector(`${SELECTORS.fieldName} .Truncate-module_truncateText__afW2y`);
      const numberEl = field.querySelector(SELECTORS.numberSpace);
      const renameInput = field.querySelector('input[placeholder="Rename to"]');
      // Read visual position (virtualized absolute rows use top)
      let top = 0;
      try {
        const styleTop = field.style?.top;
        if (styleTop && styleTop.endsWith('px')) top = parseInt(styleTop, 10);
        else top = field.getBoundingClientRect().top;
      } catch {}
      
      return {
        element: field,
        name: nameEl?.textContent?.trim() || `Column ${index + 1}`,
        originalIndex: index,
        currentIndex: index,
        renameValue: renameInput?.value || '',
        numberElement: numberEl,
        _top: isNaN(top) ? 0 : top
      };
    });

  // Sort by visual position (top) so we always work with on-screen order
  items.sort((a, b) => a._top - b._top);
  // Reassign currentIndex to match sorted order
  items.forEach((it, i) => { it.currentIndex = i; });
  return items;
}

// Add reorder dropdowns to each column row
function addReorderDropdowns() {
  const columns = getColumnItems();
  
  columns.forEach((column, index) => {
    // Skip if dropdown already added
    if (column.element.querySelector('.dh-reorder-dropdown')) return;
  // Assign a stable id to this row for targeting
  const thisId = ensureDhId(column.element);
    
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
        const otherId = ensureDhId(otherColumn.element);
        options.push(`<option value="id:${otherId}">After: ${otherColumn.name}</option>`);
      }
    });
    
    // Add "Move to End" option
    options.push('<option value="end">-- Move to End --</option>');
    
    dropdown.innerHTML = options.join('');
    // Ensure blank by default
    dropdown.value = '';
    
    dropdownContainer.appendChild(dropdown);
    
    // Insert dropdown after the field name
    const fieldName = column.element.querySelector(SELECTORS.fieldName);
    if (fieldName) {
      fieldName.insertAdjacentElement('afterend', dropdownContainer);
    }
    
    // Add event listener for dropdown change
    dropdown.addEventListener('change', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const selectedValue = e.target.value;
      const selectedText = e.target.options[e.target.selectedIndex]?.text || 'Unknown';
      console.log('🎯 DROPDOWN SELECTION:', selectedText, '(value:', selectedValue + ')');
      
      const current = getColumnItems();
      console.log('🎯 Dropdown event - current order:', current.map((c, i) => `${i}: ${c.name}`).join(', '));
      // Compute current source index by locating this row element
      const sourceEl = dropdown.closest(SELECTORS.columnField);
      const srcIndex = current.findIndex(c => c.element === sourceEl);
      console.log('🎯 Dropdown event - sourceEl:', sourceEl?.querySelector('.Truncate-module_truncateText__afW2y')?.textContent, 'srcIndex:', srcIndex);
      if (srcIndex < 0) { e.target.value = ''; return; }

      let targetIndex = null;
      if (selectedValue === 'top') {
        targetIndex = 0;
      } else if (selectedValue === 'end') {
        targetIndex = current.length - 1; // Move to last position
      } else if (selectedValue && selectedValue.startsWith('id:')) {
        const targetId = selectedValue.slice(3);
        const tgtIdx = current.findIndex(c => c.element?.dataset?.dhId === targetId);
        if (tgtIdx >= 0) {
          // Calculate proper target index accounting for splice behavior
          if (tgtIdx < srcIndex) {
            // Moving to before current position: target stays the same
            targetIndex = tgtIdx + 1;
            console.log(`🎯 Target "${current[tgtIdx].name}" at ${tgtIdx}, moving backward: after position = ${targetIndex}`);
          } else {
            // Moving to after current position: target shifts down by 1 after splice
            targetIndex = tgtIdx;
            console.log(`🎯 Target "${current[tgtIdx].name}" at ${tgtIdx}, moving forward: after position = ${targetIndex} (accounting for splice)`);
          }
        }
      }

      console.log(`🎯 Dropdown computed: srcIndex=${srcIndex}, targetIndex=${targetIndex}, selectedValue=${selectedValue}`);
      
      if (targetIndex !== null && targetIndex !== srcIndex && targetIndex !== srcIndex + 1) {
        // Fire move; reset dropdown to blank immediately for UX
        e.target.value = '';
        console.log(`🎯 Dropdown triggering move from ${srcIndex} to ${targetIndex} (${selectedValue})`);
        moveColumnToPosition(srcIndex, targetIndex);
      } else {
        // Reset if no-op or invalid selection
        console.log(`🎯 No-op move: src=${srcIndex}, target=${targetIndex}, value=${selectedValue}`);
        e.target.value = '';
      }
    });
  });
}

// // Add bulk reorder button to toolbar (simplified version)
// function addBulkReorderButton() {
//   const toolbar = document.querySelector(SELECTORS.editorToolbar);
//   if (!toolbar) return;
  
//   // Check if button already exists
//   if (toolbar.querySelector('.dh-bulk-reorder-btn')) return;
  
//   const buttonsContainer = toolbar.querySelector('.DfEditorPanelToolbar_buttons_a6045');
//   if (!buttonsContainer) return;
  
//   const bulkReorderBtn = document.createElement('div');
//   bulkReorderBtn.className = 'AnchoredPortal-module_anchorWrapper__j-Eqo';
//   bulkReorderBtn.innerHTML = `
//     <button data-testid="BULK_REORDER_BUTTON" class="dh-bulk-reorder-btn db-text-button Button-module_button__7BLGt Button-module_default__utLb- Button-module_flat__aBcd9" type="button" aria-labelledby="dhBulkReorderTooltip">
//       <span class="Button-module_content__b7-cz">
//         <i class="db-icon icon-refresh sm" role="presentation"></i>
//       </span>
//     </button>
//     <div role="tooltip" class="Tooltip-module_srOnly__V-ZI0" id="dhBulkReorderTooltip">
//       <div><div>Refresh Column Order</div></div>
//     </div>
//   `;
  
//   // Insert before the duplicate button
//   const duplicateBtn = buttonsContainer.querySelector('[aria-labelledby*="duplicate" i], [data-testid*="duplicate" i]');
//   if (duplicateBtn?.parentElement) {
//     buttonsContainer.insertBefore(bulkReorderBtn, duplicateBtn.parentElement);
//   } else {
//     buttonsContainer.insertBefore(bulkReorderBtn, buttonsContainer.firstChild);
//   }
  
//   bulkReorderBtn.querySelector('.dh-bulk-reorder-btn').addEventListener('click', refreshAllDropdowns);
// }

// Refresh all dropdowns manually
// function refreshAllDropdowns() {
//   refreshReorderDropdowns();
//   DHref?.showNotification?.('Column order dropdowns refreshed', '#4CAF50');
// }

// Move a column to a specific position using actual DOM manipulation and event simulation
async function moveColumnToPosition(fromIndex, toIndex) {
  // Prevent recursive calls
  if (isReordering) {
    console.log('Already reordering, skipping recursive call');
    return;
  }
  
  const columns = getColumnItems();
  console.log('📋 BEFORE MOVE - Current order:', columns.map((c, i) => `${i}: ${c.name}`).join(', '));
  
  if (fromIndex < 0 || fromIndex >= columns.length || toIndex < 0 || toIndex >= columns.length) {
    console.log(`❌ Invalid indices: from=${fromIndex}, to=${toIndex}, length=${columns.length}`);
    return;
  }
  
  if (fromIndex === toIndex || (toIndex === fromIndex + 1)) {
    console.log('❌ No-op move detected');
    return; // No change needed
  }
  
  const sourceColumn = columns[fromIndex];
  if (!sourceColumn) {
    console.log(`❌ No source column at index ${fromIndex}`);
    return;
  }
  
  console.log(`🎯 MOVE REQUEST: "${sourceColumn.name}" from index ${fromIndex} to index ${toIndex}`);
  
  isReordering = true; // Set flag to prevent recursion
  
  try {
    // Method 1: Try SortableJS drag simulation FIRST (most likely to trigger persistence)
    console.log('🎯 Trying SortableJS drag simulation...');
    const targetColumn = columns[toIndex];
    if (targetColumn && await simulateSortableJSDrag(sourceColumn.element, targetColumn.element, fromIndex, toIndex)) {
      // DHref?.showNotification?.(`Successfully moved "${sourceColumn.name}" to position ${toIndex + 1}`, '#4CAF50');
      await waitForColumnOrderChange(1500);
      const afterColumns = getColumnItems();
      console.log('📋 AFTER MOVE - New order:', afterColumns.map((c, i) => `${i}: ${c.name}`).join(', '));
      refreshReorderDropdowns();
      isReordering = false;
      return;
    }

    // Method 2: Try enhanced React state manipulation
    console.log('🎯 Trying enhanced React state manipulation...');
    if (await tryEnhancedReactStateManipulation(sourceColumn.element, fromIndex, toIndex)) {
      // DHref?.showNotification?.(`Successfully moved "${sourceColumn.name}" to position ${toIndex + 1}`, '#4CAF50');
      await waitForColumnOrderChange(1500);
      const afterColumns = getColumnItems();
      console.log('📋 AFTER MOVE - New order:', afterColumns.map((c, i) => `${i}: ${c.name}`).join(', '));
      refreshReorderDropdowns();
      isReordering = false;
      return;
    }

    // Method 3: Try realistic/native drag and drop simulation
    console.log('🎯 Trying realistic drag simulation...');
    if (await simulateReactDnd(sourceColumn.element, fromIndex, toIndex)) {
      // DHref?.showNotification?.(`Successfully moved "${sourceColumn.name}" to position ${toIndex + 1}`, '#4CAF50');
      // Wait for DOM to reflect new order, then rebuild dropdowns
      await waitForColumnOrderChange(1500);
      const afterColumns = getColumnItems();
      console.log('📋 AFTER MOVE - New order:', afterColumns.map((c, i) => `${i}: ${c.name}`).join(', '));
      refreshReorderDropdowns();
      isReordering = false; // Reset flag before return
      return;
    }
    
    // Method 3: Try direct state manipulation
    if (tryDirectStateManipulation(fromIndex, toIndex)) {
      // DHref?.showNotification?.(`Attempted state manipulation for "${sourceColumn.name}" to position ${toIndex + 1}`, '#2196F3');
      await waitForColumnOrderChange(800);
      refreshReorderDropdowns();
      isReordering = false; // Reset flag before return
      return;
    }

  // Method 3: LAST resort - complete DOM replacement (visual only; may not persist)
    console.log('Primary methods failed; attempting complete DOM replacement as a last resort...');
    if (completeReorder(fromIndex, toIndex)) {
      // Visual feedback only
      // DHref?.showNotification?.(`Reordered "${sourceColumn.name}" visually. If it doesn't persist, try dragging manually once.`, '#FF9800');
      await waitForColumnOrderChange(800);
      refreshReorderDropdowns();
      isReordering = false;
      return;
    }    // Method 5: Fallback notification with debugging info
    console.log('All reorder methods failed, column structure:', {
      sourceElement: sourceColumn.element,
      fromIndex,
      toIndex,
      allColumns: columns
    });
    DHref?.showNotification?.(`Could not move "${sourceColumn.name}" - check console for debug info`, '#ed3737');
    
  } catch (error) {
    console.error('Error moving column:', error);
    DHref?.showNotification?.('Error moving column', '#ed3737');
  } finally {
    isReordering = false; // Always reset the flag
  }
}

// Try keyboard-based reordering (some drag-drop systems respond to arrow keys)
function simulateKeyboardReorder(fromIndex, toIndex) {
  try {
    console.log('Trying keyboard-based reordering...');
    
    const columns = getColumnItems();
    const sourceElement = columns[fromIndex]?.element;
    
    if (!sourceElement) return false;
    
    // Find the sortable element
    const sortableElement = sourceElement.querySelector('[aria-roledescription="sortable"]') || sourceElement;
    
    console.log('Using sortable element for keyboard:', sortableElement);
    
    // Focus the element first
    sortableElement.focus();
    sortableElement.click();
    
    // Try different keyboard patterns that might work with Domo
    
    // Pattern 1: Try Ctrl+Shift+Arrow (common reordering pattern)
    const direction = toIndex > fromIndex ? 'ArrowDown' : 'ArrowUp';
    const steps = Math.abs(toIndex - fromIndex);
    
    for (let i = 0; i < steps; i++) {
      // Method A: Ctrl+Shift+Arrow
      const ctrlShiftArrow = new KeyboardEvent('keydown', {
        key: direction,
        code: direction,
        keyCode: direction === 'ArrowDown' ? 40 : 38,
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true
      });
      sortableElement.dispatchEvent(ctrlShiftArrow);
      
      // Method B: Alt+Arrow
      const altArrow = new KeyboardEvent('keydown', {
        key: direction,
        code: direction,
        keyCode: direction === 'ArrowDown' ? 40 : 38,
        altKey: true,
        bubbles: true,
        cancelable: true
      });
      sortableElement.dispatchEvent(altArrow);
    }
    
    // Try triggering a change event
    const changeEvent = new Event('change', { bubbles: true });
    sortableElement.dispatchEvent(changeEvent);
    
    return true;
    
  } catch (error) {
    console.error('Keyboard simulation failed:', error);
    return false;
  }
}

// Enhanced React state manipulation - trigger Domo's actual save mechanisms
async function tryEnhancedReactStateManipulation(sourceElement, fromIndex, toIndex) {
  try {
    console.log('🔥 Enhanced React state manipulation - triggering save mechanisms...');
    
    const columns = getColumnItems();
    const targetElement = columns[toIndex]?.element;
    
    if (!sourceElement || !targetElement) return false;
    
    // Step 1: Perform the visual reorder first
    console.log('🔥 Step 1: Physical DOM reorder...');
    if (!performPhysicalReorder(fromIndex, toIndex)) {
      console.log('❌ Physical reorder failed');
      return false;
    }
    
    // Step 2: Trigger comprehensive React events to force state updates
    console.log('🔥 Step 2: Triggering React events...');
    
    // Find the main container and transformation editor
    const container = document.querySelector(SELECTORS.selectColumnsContainer);
    const actionEditor = document.querySelector(SELECTORS.actionEditor);
    const selectColumnsEditor = document.querySelector(SELECTORS.selectColumnsEditor);
    
    if (!container || !actionEditor) return false;
    
    // Trigger input events on all rename fields (simulates user interaction)
    const allRenameInputs = container.querySelectorAll('input[placeholder="Rename to"]');
    allRenameInputs.forEach(input => {
      // Focus each input briefly to trigger React's focus handling
      input.focus();
      
      // Trigger a sequence of events that React typically responds to
      const events = ['focus', 'input', 'change', 'blur'];
      events.forEach(eventType => {
        const event = new Event(eventType, { bubbles: true, cancelable: true });
        input.dispatchEvent(event);
      });
    });
    
    // Step 3: Trigger transformation-level events
    console.log('🔥 Step 3: Triggering transformation-level events...');
    
    // Dispatch events that might trigger Domo's save mechanisms
    const transformationEvents = [
      new Event('input', { bubbles: true }),
      new Event('change', { bubbles: true }),
      new CustomEvent('transformationChange', { 
        bubbles: true, 
        detail: { type: 'columnReorder', fromIndex, toIndex } 
      }),
      new CustomEvent('stateChange', { 
        bubbles: true, 
        detail: { type: 'columnOrder', fromIndex, toIndex } 
      })
    ];
    
    transformationEvents.forEach(event => {
      actionEditor.dispatchEvent(event);
      if (selectColumnsEditor) selectColumnsEditor.dispatchEvent(event);
      container.dispatchEvent(event);
    });
    
    // Step 4: Try to trigger React Fiber updates
    console.log('🔥 Step 4: Triggering React Fiber updates...');
    
    // Look for React instances and try to force updates
    const reactKeys = Object.keys(container).filter(key => key.startsWith('__react'));
    if (reactKeys.length > 0) {
      const reactInstance = container[reactKeys[0]];
      console.log('🔥 Found React instance:', reactInstance);
      
      // Try to access and trigger React's update mechanisms
      try {
        // Look for common React patterns
        if (reactInstance?.stateNode?.forceUpdate) {
          console.log('🔥 Calling forceUpdate on React instance');
          reactInstance.stateNode.forceUpdate();
        }
        
        // Try to trigger re-render through props/state mutation
        if (reactInstance?.memoizedProps) {
          console.log('🔥 Found memoized props, triggering mutation detection');
          // Create a new custom event to signal prop changes
          const propChangeEvent = new CustomEvent('__reactPropsChanged', {
            bubbles: true,
            detail: { fromIndex, toIndex, timestamp: Date.now() }
          });
          container.dispatchEvent(propChangeEvent);
        }
      } catch (reactError) {
        console.log('🔥 React direct manipulation failed:', reactError);
      }
    }
    
    // Step 5: Simulate user-like interaction sequence
    console.log('🔥 Step 5: Simulating user interaction sequence...');
    
    // Click somewhere else and back to trigger blur/focus cycles
    const toolbar = document.querySelector(SELECTORS.editorToolbar);
    if (toolbar) {
      toolbar.click();
      setTimeout(() => {
        container.click();
      }, 50);
    }
    
    // Step 6: Force form validation and save triggers
    console.log('🔥 Step 6: Triggering form validation and save mechanisms...');
    
    // Look for form elements and trigger validation
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
      const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
      const inputEvent = new Event('input', { bubbles: true });
      form.dispatchEvent(inputEvent);
      // Don't actually submit, just trigger the event handlers
    });
    
    // Trigger any hidden input changes that might track state
    const hiddenInputs = document.querySelectorAll('input[type="hidden"]');
    hiddenInputs.forEach(input => {
      const changeEvent = new Event('change', { bubbles: true });
      input.dispatchEvent(changeEvent);
    });
    
    // Step 7: Final state persistence triggers
    console.log('🔥 Step 7: Final state persistence triggers...');
    
    // Try triggering common autosave patterns
    const autosaveEvents = [
      new CustomEvent('autosave', { bubbles: true }),
      new CustomEvent('dataChanged', { bubbles: true }),
      new CustomEvent('modelUpdate', { bubbles: true }),
      new Event('beforeunload', { bubbles: true }) // Sometimes triggers save
    ];
    
    autosaveEvents.forEach(event => {
      document.dispatchEvent(event);
      if (actionEditor) actionEditor.dispatchEvent(event);
    });
    
    // Wait for any async operations to complete
    await new Promise(resolve => setTimeout(resolve, 200));
    
    console.log('🔥 Enhanced React state manipulation completed');
    return true;
    
  } catch (error) {
    console.error('🔥 Enhanced React state manipulation failed:', error);
    return false;
  }
}

// Try to directly manipulate Domo's internal state (more aggressive approach)
function tryDirectStateManipulation(fromIndex, toIndex) {
  try {
    console.log('Trying direct state manipulation...');
    
    // Look for React Fiber nodes or other internal state
    const container = document.querySelector(SELECTORS.selectColumnsContainer);
    if (!container) return false;
    
    // Try to find React components in the DOM
    const reactKeys = Object.keys(container).filter(key => key.startsWith('__react'));
    console.log('Found React keys:', reactKeys);
    
    if (reactKeys.length > 0) {
      const reactInstance = container[reactKeys[0]];
      console.log('React instance:', reactInstance);
      
      // Try to find state or props that might contain the column order
      if (reactInstance?.memoizedProps || reactInstance?.pendingProps) {
        console.log('React props:', reactInstance.memoizedProps || reactInstance.pendingProps);
      }
      
      if (reactInstance?.memoizedState) {
        console.log('React state:', reactInstance.memoizedState);
      }
    }
    
    // Try to trigger React updates by modifying DOM attributes
    const columns = getColumnItems();
    const sourceElement = columns[fromIndex]?.element;
    const targetElement = columns[toIndex]?.element;
    
    if (sourceElement && targetElement) {
      // Force a React re-render by changing a data attribute
      sourceElement.setAttribute('data-dh-moving', 'true');
      targetElement.setAttribute('data-dh-target', 'true');
      
      // Trigger various events that might cause React to re-evaluate
      ['input', 'change', 'blur', 'focus'].forEach(eventType => {
        const event = new Event(eventType, { bubbles: true });
        sourceElement.dispatchEvent(event);
        targetElement.dispatchEvent(event);
      });
      
      // Clean up the attributes
      setTimeout(() => {
        sourceElement.removeAttribute('data-dh-moving');
        targetElement.removeAttribute('data-dh-target');
      }, 100);
    }
    
    return true;
    
  } catch (error) {
    console.error('Direct state manipulation failed:', error);
    return false;
  }
}

// Perform physical DOM reordering to match the new positions
function performPhysicalReorder(fromIndex, toIndex) {
  try {
    console.log('🔄 Performing physical DOM reorder...');
    
    const container = document.querySelector(SELECTORS.selectColumnsContainer);
    if (!container) return false;
    
    const virtualContainer = container.querySelector('[style*="position: relative"]');
    if (!virtualContainer) return false;
    
    const heightContainer = virtualContainer.querySelector('[style*="height:"]');
    if (!heightContainer) return false;
    
    // Use getColumnItems to get the current visual order (sorted by position)
    const currentColumns = getColumnItems();
    if (!currentColumns[fromIndex] || !currentColumns[toIndex]) return false;
    
    console.log('🔄 Reordering DOM elements...');
    console.log('🔄 Current visual order:', currentColumns.map((c, i) => `${i}: ${c.name}`).join(', '));
    
    // Create new ordered array using the visual order
    const reorderedColumns = [...currentColumns];
    const [movedColumn] = reorderedColumns.splice(fromIndex, 1);
    reorderedColumns.splice(toIndex, 0, movedColumn);
    
    console.log('🔄 Target order:', reorderedColumns.map((c, i) => `${i}: ${c.name}`).join(', '));
    
    // Update positions for all columns
    reorderedColumns.forEach((columnInfo, index) => {
      const topPosition = index * 56;
      columnInfo.element.style.top = `${topPosition}px`;
      
      // Update the number display
      const numberEl = columnInfo.element.querySelector('.DfSelectColumns_numberSpace_59fc9');
      if (numberEl) {
        numberEl.textContent = index + 1;
      }
      
      // Update the remove button data-testid
      const removeButton = columnInfo.element.querySelector('[data-testid^="remove_select_column_"]');
      if (removeButton) {
        removeButton.setAttribute('data-testid', `remove_select_column_${index}`);
      }
    });
    
    console.log('🔄 Physical DOM reorder completed');
    return true;
    
  } catch (error) {
    console.error('❌ Physical DOM reorder failed:', error);
    return false;
  }
}

// Comprehensive state save triggering - aggressive approach to force persistence
async function triggerComprehensiveStateSave(fromIndex, toIndex) {
  try {
    console.log('💾🔥 Comprehensive state save triggering...');
    
    const container = document.querySelector(SELECTORS.selectColumnsContainer);
    const actionEditor = document.querySelector(SELECTORS.actionEditor);
    const selectColumnsEditor = document.querySelector(SELECTORS.selectColumnsEditor);
    
    // Method 1: Trigger all input fields to simulate user interaction
    console.log('💾🔥 Method 1: Trigger all input interactions');
    const allInputs = document.querySelectorAll('input, select, textarea');
    allInputs.forEach(input => {
      // Simulate focus/blur cycle that often triggers saves
      input.focus();
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.blur();
    });
    
    // Method 2: Trigger mouse events that might indicate "user finished editing"
    console.log('💾🔥 Method 2: Trigger completion mouse events');
    const mouseEvents = ['mouseup', 'click', 'mouseout', 'mouseleave'];
    mouseEvents.forEach(eventType => {
      if (container) container.dispatchEvent(new MouseEvent(eventType, { bubbles: true }));
      if (actionEditor) actionEditor.dispatchEvent(new MouseEvent(eventType, { bubbles: true }));
    });
    
    // Method 3: Trigger keyboard events that often save state (Tab, Enter, Escape)
    console.log('💾🔥 Method 3: Trigger save-triggering keyboard events');
    const saveKeyEvents = [
      { key: 'Tab', keyCode: 9 },
      { key: 'Enter', keyCode: 13 },
      { key: 'Escape', keyCode: 27 }
    ];
    
    saveKeyEvents.forEach(({ key, keyCode }) => {
      const keyEvent = new KeyboardEvent('keydown', { 
        key, 
        keyCode, 
        code: key, 
        bubbles: true 
      });
      document.dispatchEvent(keyEvent);
      if (container) container.dispatchEvent(keyEvent);
    });
    
    // Method 4: Trigger window/document level events that might trigger autosave
    console.log('💾🔥 Method 4: Trigger autosave events');
    const autosaveEvents = [
      'beforeunload',
      'unload', 
      'pagehide',
      'visibilitychange',
      'blur'
    ];
    
    autosaveEvents.forEach(eventType => {
      try {
        if (eventType === 'visibilitychange') {
          Object.defineProperty(document, 'hidden', { value: true, configurable: true });
          document.dispatchEvent(new Event(eventType));
          Object.defineProperty(document, 'hidden', { value: false, configurable: true });
          document.dispatchEvent(new Event(eventType));
        } else {
          window.dispatchEvent(new Event(eventType));
        }
      } catch (e) {
        console.log(`💾🔥 Could not trigger ${eventType}:`, e);
      }
    });
    
    // Method 5: Look for and trigger any observable mutations
    console.log('💾🔥 Method 5: Trigger mutation observers');
    
    // Create temporary DOM mutations that might trigger observers
    const tempDiv = document.createElement('div');
    tempDiv.setAttribute('data-temp-mutation-trigger', 'true');
    if (container) {
      container.appendChild(tempDiv);
      setTimeout(() => {
        try { container.removeChild(tempDiv); } catch {}
      }, 100);
    }
    
    // Method 6: Try to trigger any global state management (Redux, MobX, etc.)
    console.log('💾🔥 Method 6: Trigger global state events');
    
    const globalStateEvents = [
      new CustomEvent('redux-action', { detail: { type: 'COLUMN_REORDER', fromIndex, toIndex } }),
      new CustomEvent('mobx-action', { detail: { type: 'columnReorder', fromIndex, toIndex } }),
      new CustomEvent('flux-action', { detail: { type: 'REORDER_COLUMNS', fromIndex, toIndex } }),
      new CustomEvent('state-update', { detail: { type: 'columnOrder', fromIndex, toIndex } })
    ];
    
    globalStateEvents.forEach(event => {
      document.dispatchEvent(event);
      window.dispatchEvent(event);
    });
    
    // Method 7: Simulate user "leaving" the transformation (often triggers save)
    console.log('💾🔥 Method 7: Simulate user leaving transformation');
    
    // Click outside the transformation area
    const body = document.body;
    const outsideClick = new MouseEvent('click', {
      bubbles: true,
      clientX: 10,  // Far left of screen
      clientY: 10   // Far top of screen
    });
    body.dispatchEvent(outsideClick);
    
    // Simulate focus leaving the editor
    if (selectColumnsEditor) {
      selectColumnsEditor.dispatchEvent(new Event('focusout', { bubbles: true }));
    }
    
    // Wait for any async operations
    await new Promise(resolve => setTimeout(resolve, 150));
    
    console.log('💾🔥 Comprehensive state save triggering completed');
    return true;
    
  } catch (error) {
    console.error('💾🔥 Comprehensive state save failed:', error);
    return false;
  }
}

// Trigger Domo's internal save state mechanism
function triggerSaveState() {
  try {
    console.log('💾 Attempting to trigger save state...');
    
    // Method 1: Try to find and trigger React's state update mechanisms
    const container = document.querySelector(SELECTORS.selectColumnsContainer);
    if (container) {
      // Look for React fiber nodes
      const reactKeys = Object.keys(container).filter(key => key.startsWith('__react'));
      if (reactKeys.length > 0) {
        const reactInstance = container[reactKeys[0]];
        console.log('💾 Found React instance for state trigger');
        
        // Try to trigger a state update by dispatching synthetic events
        const syntheticEvent = new CustomEvent('stateChange', {
          bubbles: true,
          detail: { type: 'columnReorder' }
        });
        container.dispatchEvent(syntheticEvent);
      }
    }
    
    // Method 2: Try to trigger blur/focus events that might trigger save
    const editor = document.querySelector(SELECTORS.selectColumnsEditor);
    if (editor) {
      console.log('💾 Triggering editor blur/focus to save state');
      editor.dispatchEvent(new Event('blur', { bubbles: true }));
      setTimeout(() => {
        editor.dispatchEvent(new Event('focus', { bubbles: true }));
      }, 100);
    }
    
    // Method 3: Try triggering input events on the transformation
    const actionEditor = document.querySelector(SELECTORS.actionEditor);
    if (actionEditor) {
      console.log('💾 Triggering action editor input event');
      actionEditor.dispatchEvent(new Event('input', { bubbles: true }));
      actionEditor.dispatchEvent(new Event('change', { bubbles: true }));
    }
    
    console.log('💾 Save state triggers completed');
    return true;
    
  } catch (error) {
    console.error('💾 Save state trigger failed:', error);
    return false;
  }
}

// Simulate SortableJS drag events - this is the key to triggering persistence
async function simulateSortableJSDrag(sourceElement, targetElement, fromIndex, toIndex) {
  return new Promise((resolve) => {
    try {
      console.log('🎯 Starting SortableJS drag simulation...');
      
      // Find the sortable container and element
      const container = document.querySelector(SELECTORS.selectColumnsContainer);
      const sortableElement = sourceElement.closest('[aria-roledescription="sortable"]') || sourceElement;
      const targetSortableElement = targetElement.closest('[aria-roledescription="sortable"]') || targetElement;
      
      if (!container || !sortableElement || !targetSortableElement) {
        console.log('❌ Required elements not found');
        resolve(false);
        return;
      }
      
      console.log('🎯 Found elements:', { container, sortableElement, targetSortableElement });
      
      // Look for SortableJS instance more comprehensively
      let sortableInstance = null;
      
      // Method 1: Check all DOM elements in the hierarchy for SortableJS instances
      const elementsToCheck = [
        container,
        container.parentElement,
        container.parentElement?.parentElement,
        sortableElement,
        targetSortableElement,
        document.querySelector('[class*="DfSelectColumns"]'),
        document.querySelector('.DfSelectColumns_field_59fc9')?.parentElement?.parentElement
      ].filter(Boolean);
      
      const possibleKeys = ['Sortable', '_sortable', 'sortable', '__sortable__', 'sortableJS'];
      
      for (const element of elementsToCheck) {
        if (sortableInstance) break;
        
        // Check direct properties
        for (const key of possibleKeys) {
          if (element[key]) {
            sortableInstance = element[key];
            console.log('🎯 Found SortableJS instance via:', key, 'on', element);
            break;
          }
        }
        
        // Check all properties for SortableJS-like objects
        if (!sortableInstance) {
          const allKeys = Object.getOwnPropertyNames(element);
          for (const key of allKeys) {
            try {
              const value = element[key];
              if (value && typeof value === 'object' && 
                  (value.constructor?.name === 'Sortable' || 
                   typeof value.handleEnd === 'function' ||
                   typeof value._onEnd === 'function')) {
                sortableInstance = value;
                console.log('🎯 Found SortableJS-like instance via:', key, 'on', element);
                break;
              }
            } catch (e) {
              // Skip inaccessible properties
            }
          }
        }
      }
      
      // Method 2: Look in React fiber more thoroughly
      if (!sortableInstance) {
        const reactKeys = Object.keys(container).filter(key => key.startsWith('__react'));
        for (const reactKey of reactKeys) {
          const reactInstance = container[reactKey];
          
          // Check memoizedProps
          if (reactInstance?.memoizedProps) {
            const props = reactInstance.memoizedProps;
            for (const key of Object.keys(props)) {
              const value = props[key];
              if (value && typeof value === 'object' && 
                  (value.constructor?.name === 'Sortable' || 
                   typeof value.handleEnd === 'function')) {
                sortableInstance = value;
                console.log('🎯 Found SortableJS instance in React props:', key);
                break;
              }
            }
          }
          
          // Check stateNode
          if (!sortableInstance && reactInstance?.stateNode) {
            const stateNode = reactInstance.stateNode;
            for (const key of Object.keys(stateNode)) {
              const value = stateNode[key];
              if (value && typeof value === 'object' && 
                  (value.constructor?.name === 'Sortable' || 
                   typeof value.handleEnd === 'function')) {
                sortableInstance = value;
                console.log('🎯 Found SortableJS instance in React stateNode:', key);
                break;
              }
            }
          }
        }
      }
      
      // Method 3: Global search for SortableJS instances
      if (!sortableInstance) {
        console.log('🎯 Searching globally for SortableJS instances...');
        
        // Check if SortableJS is available globally
        if (window.Sortable) {
          console.log('🎯 Found global Sortable constructor');
          
          // Look for instances in the global Sortable registry
          if (window.Sortable.active) {
            sortableInstance = window.Sortable.active;
            console.log('🎯 Found active SortableJS instance');
          }
        }
        
        // Check for instances in common global locations
        const globalChecks = [
          () => window.__sortableInstances,
          () => window.sortableInstance,
          () => document.__sortable,
          () => container.closest('[data-sortable]')?.__sortable
        ];
        
        for (const check of globalChecks) {
          try {
            const instance = check();
            if (instance) {
              sortableInstance = instance;
              console.log('🎯 Found SortableJS instance via global check');
              break;
            }
          } catch (e) {
            // Skip failed checks
          }
        }
      }
      
      console.log('🎯 SortableJS instance:', sortableInstance);
      
      // Method 4: Look for SortableJS by examining element attributes and data
      if (!sortableInstance) {
        console.log('🎯 Searching for SortableJS by examining DOM attributes...');
        
        // Look for elements with sortable-related attributes
        const sortableElements = [
          ...document.querySelectorAll('[data-sortable]'),
          ...document.querySelectorAll('[class*="sortable"]'),
          ...document.querySelectorAll('[aria-roledescription="sortable"]'),
          container,
          container.parentElement
        ];
        
        for (const element of sortableElements) {
          // Check for SortableJS instance stored in element data
          if (element && element._sortable) {
            sortableInstance = element._sortable;
            console.log('🎯 Found SortableJS via _sortable property');
            break;
          }
          
          // Check for jQuery data (if SortableJS was initialized via jQuery)
          if (element && window.jQuery && window.jQuery.data) {
            const jqData = window.jQuery.data(element, 'sortable');
            if (jqData) {
              sortableInstance = jqData;
              console.log('🎯 Found SortableJS via jQuery data');
              break;
            }
          }
        }
      }
      
      // Method 5: Try to find SortableJS in module systems
      if (!sortableInstance) {
        console.log('🎯 Searching for SortableJS in module systems...');
        
        // Check require.js modules
        if (window.require && window.require.defined) {
          const modules = ['sortablejs', 'sortable', 'sortable.js'];
          for (const moduleName of modules) {
            try {
              if (window.require.defined(moduleName)) {
                const module = window.require(moduleName);
                if (module && module.active) {
                  sortableInstance = module.active;
                  console.log('🎯 Found SortableJS via require.js module:', moduleName);
                  break;
                }
              }
            } catch (e) {
              // Skip failed module checks
            }
          }
        }
        
        // Check webpack modules (look for SortableJS in webpack chunk)
        if (window.webpackChunkLoad || window.__webpack_require__) {
          console.log('🎯 Detected webpack, looking for SortableJS in chunks...');
          
          // This is tricky - SortableJS might be in a webpack chunk
          // We can try to find it by looking at loaded modules
        }
      }
      
      // Perform visual DOM reorder first
      console.log('🎯 Step 1: Performing physical DOM reorder');
      performPhysicalReorder(fromIndex, toIndex);
      
      // Step 2: Trigger SortableJS events manually
      console.log('🎯 Step 2: Triggering SortableJS events');
      
      // Create the event data that SortableJS expects
      const eventData = {
        item: sortableElement,
        target: targetSortableElement,
        from: container,
        to: container,
        oldIndex: fromIndex,
        newIndex: toIndex,
        clone: sortableElement.cloneNode(true),
        pullMode: false
      };
      
      console.log('🎯 SortableJS event data:', eventData);
      
      // Method 1: Try to call SortableJS methods directly
      if (sortableInstance) {
        try {
          console.log('🎯 Attempting direct SortableJS method calls');
          
          // Try to trigger the end event handler
          if (typeof sortableInstance._onEndDrag === 'function') {
            console.log('🎯 Calling _onEndDrag');
            sortableInstance._onEndDrag(eventData);
          } else if (typeof sortableInstance.handleEnd === 'function') {
            console.log('🎯 Calling handleEnd');
            sortableInstance.handleEnd(eventData);
          } else if (typeof sortableInstance._onEnd === 'function') {
            console.log('🎯 Calling _onEnd');
            sortableInstance._onEnd(eventData);
          }
          
          // Try to trigger any onChange callback
          if (typeof sortableInstance.options?.onEnd === 'function') {
            console.log('🎯 Calling options.onEnd');
            sortableInstance.options.onEnd(eventData);
          }
          
        } catch (error) {
          console.log('🎯 Direct SortableJS method calls failed:', error);
        }
      }
      
      // Method 2: Dispatch custom SortableJS events
      console.log('🎯 Step 3: Dispatching SortableJS custom events');
      
      const sortableEvents = [
        new CustomEvent('sortable:end', { 
          bubbles: true, 
          detail: eventData 
        }),
        new CustomEvent('end', { 
          bubbles: true, 
          detail: eventData 
        }),
        new CustomEvent('sortEnd', { 
          bubbles: true, 
          detail: eventData 
        }),
        new CustomEvent('change', { 
          bubbles: true, 
          detail: eventData 
        })
      ];
      
      sortableEvents.forEach(event => {
        container.dispatchEvent(event);
        sortableElement.dispatchEvent(event);
        document.dispatchEvent(event);
      });
      
      // Method 3: Try to trigger React's drag end handlers directly
      console.log('🎯 Step 4: Triggering React drag handlers');
      
      // Look for React props that might handle drag end
      const reactKeys = Object.keys(container).filter(key => key.startsWith('__react'));
      reactKeys.forEach(reactKey => {
        const reactInstance = container[reactKey];
        if (reactInstance?.memoizedProps) {
          const props = reactInstance.memoizedProps;
          
          // Look for common drag handler props
          const dragHandlers = ['onEnd', 'onSortEnd', 'onDragEnd', 'handleEnd', 'handleDragEnd'];
          dragHandlers.forEach(handler => {
            if (typeof props[handler] === 'function') {
              console.log(`🎯 Calling React prop handler: ${handler}`);
              try {
                props[handler](eventData);
              } catch (error) {
                console.log(`🎯 React handler ${handler} failed:`, error);
              }
            }
          });
        }
      });
      
      // Method 4: Trigger Redux dispatch directly (based on stack trace)
      console.log('🎯 Step 5: Triggering Redux dispatch directly');
      
      // From the stack trace: sortable.esm handleEnd → DfSelectColumns → Redux dispatch
      // Let's try to find and trigger the Redux store directly
      const reduxChecks = [
        () => window.__REDUX_STORE__,
        () => window.store,
        () => window.__store__,
        () => document.__store__,
        () => container.__store__
      ];
      
      let reduxStore = null;
      for (const check of reduxChecks) {
        try {
          const store = check();
          if (store && typeof store.dispatch === 'function') {
            reduxStore = store;
            console.log('🎯 Found Redux store');
            break;
          }
        } catch (e) {
          // Skip failed checks
        }
      }
      
      // If we found Redux store, dispatch reorder action
      if (reduxStore) {
        try {
          console.log('🎯 Dispatching Redux reorder action');
          
          // Try common Redux action patterns for column reordering
          const actions = [
            { type: 'REORDER_COLUMNS', payload: { fromIndex, toIndex, oldIndex: fromIndex, newIndex: toIndex } },
            { type: 'COLUMN_REORDER', fromIndex, toIndex, oldIndex: fromIndex, newIndex: toIndex },
            { type: 'UPDATE_COLUMN_ORDER', fromIndex, toIndex },
            { type: 'MOVE_COLUMN', from: fromIndex, to: toIndex },
            { type: 'SET_COLUMN_ORDER', oldIndex: fromIndex, newIndex: toIndex }
          ];
          
          actions.forEach(action => {
            try {
              reduxStore.dispatch(action);
              console.log('🎯 Dispatched Redux action:', action.type);
            } catch (e) {
              console.log('🎯 Redux action failed:', action.type, e.message);
            }
          });
        } catch (error) {
          console.log('🎯 Redux dispatch failed:', error);
        }
      }
      
      // Method 5: Trigger the specific DfSelectColumns handler path
      console.log('🎯 Step 6: Triggering DfSelectColumns handler directly');
      
      // From the stack trace, we need to find the DfSelectColumns component instance
      const selectColumnsElements = [
        document.querySelector('.DfSelectColumns_field_59fc9'),
        document.querySelector('[class*="DfSelectColumns"]'),
        container,
        sortableElement
      ].filter(Boolean);
      
      for (const element of selectColumnsElements) {
        const reactKeys = Object.keys(element).filter(key => key.startsWith('__react'));
        
        reactKeys.forEach(reactKey => {
          const reactInstance = element[reactKey];
          
          // Look for the component that has the drag handler
          const checkInstance = (instance) => {
            if (!instance) return;
            
            // Check if this is the DfSelectColumns component
            const componentName = instance.elementType?.name || instance.type?.name || '';
            if (componentName.includes('SelectColumns') || componentName.includes('DfSelectColumns')) {
              console.log('🎯 Found DfSelectColumns component:', componentName);
              
              // Look for drag handlers in the instance
              const handlers = ['handleEnd', 'onEnd', 'onSortEnd', 'handleSortEnd', '_handleEnd'];
              for (const handlerName of handlers) {
                if (instance.stateNode && typeof instance.stateNode[handlerName] === 'function') {
                  console.log('🎯 Calling DfSelectColumns handler:', handlerName);
                  try {
                    instance.stateNode[handlerName](eventData);
                  } catch (e) {
                    console.log('🎯 Handler call failed:', e.message);
                  }
                }
                
                if (instance.memoizedProps && typeof instance.memoizedProps[handlerName] === 'function') {
                  console.log('🎯 Calling DfSelectColumns prop handler:', handlerName);
                  try {
                    instance.memoizedProps[handlerName](eventData);
                  } catch (e) {
                    console.log('🎯 Prop handler call failed:', e.message);
                  }
                }
              }
            }
            
            // Recursively check child instances
            if (instance.child) checkInstance(instance.child);
            if (instance.sibling) checkInstance(instance.sibling);
          };
          
          checkInstance(reactInstance);
        });
      }
      
      // Method 6: Simulate actual SortableJS handleEnd call pattern
      console.log('🎯 Step 7: Simulating SortableJS handleEnd pattern');
      
      // Based on the stack trace, we need to trigger:
      // sortable.esm handleEnd → DfSelectColumns → React Batch Updates → Redux
      
      // Create the exact event object that SortableJS handleEnd expects
      const sortEvent = {
        type: 'end',
        target: sortableElement,
        item: sortableElement,
        from: container,
        to: container,
        oldIndex: fromIndex,
        newIndex: toIndex,
        oldDraggableIndex: fromIndex,
        newDraggableIndex: toIndex,
        clone: sortableElement.cloneNode(true),
        pullMode: false,
        preventDefault: () => {},
        stopPropagation: () => {}
      };
      
      // Try to find and call the actual handleEnd function from the stack trace
      const handleEndSearches = [
        // Look in window/global scope
        () => window.handleEnd,
        () => window.sortableHandleEnd,
        
        // Look in sortable elements
        () => sortableElement.handleEnd,
        () => container.handleEnd,
        () => targetSortableElement.handleEnd,
        
        // Look for the specific sortable.esm function
        () => {
          // Check all script elements for sortable.esm
          const scripts = Array.from(document.scripts);
          for (const script of scripts) {
            if (script.src && script.src.includes('sortable.esm')) {
              console.log('🎯 Found sortable.esm script:', script.src);
              // The handleEnd function is internal, but we can try to trigger it
            }
          }
          return null;
        }
      ];
      
      for (const search of handleEndSearches) {
        try {
          const handleEnd = search();
          if (typeof handleEnd === 'function') {
            console.log('🎯 Found handleEnd function, calling it');
            handleEnd.call(sortableInstance || sortableElement, sortEvent);
          }
        } catch (e) {
          // Skip failed searches
        }
      }
      
      // Method 7: Trigger React's unstable_batchedUpdates (from stack trace)
      console.log('🎯 Step 8: Triggering React batchedUpdates');
      
      // Look for React's batchedUpdates function
      const reactBatchedUpdates = window.React?.unstable_batchedUpdates || 
                                  window.ReactDOM?.unstable_batchedUpdates ||
                                  window.__React?.unstable_batchedUpdates;
      
      if (reactBatchedUpdates && typeof reactBatchedUpdates === 'function') {
        console.log('🎯 Found React batchedUpdates, triggering batch');
        
        try {
          reactBatchedUpdates(() => {
            console.log('🎯 Inside React batch update');
            
            // Trigger state changes inside the batch
            const stateChangeEvent = new CustomEvent('sortableEnd', {
              bubbles: true,
              detail: sortEvent
            });
            
            container.dispatchEvent(stateChangeEvent);
            sortableElement.dispatchEvent(stateChangeEvent);
            document.dispatchEvent(stateChangeEvent);
          });
        } catch (e) {
          console.log('🎯 React batchedUpdates failed:', e.message);
        }
      }
      
      // Method 8: Force React re-render after reorder
      console.log('🎯 Step 9: Force React re-render');
      
      // Update any inputs to trigger React's change detection
      const updatedColumns = getColumnItems();
      updatedColumns.forEach((column, index) => {
        if (column.renameInput) {
          const currentValue = column.renameInput.value;
          column.renameInput.value = currentValue + ' '; // Add space
          column.renameInput.dispatchEvent(new Event('input', { bubbles: true }));
          column.renameInput.value = currentValue; // Remove space
          column.renameInput.dispatchEvent(new Event('input', { bubbles: true }));
          column.renameInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      
      // Method 9: Trigger the exact network request pattern
      console.log('🎯 Step 10: Attempting direct API call');
      
      // Based on the network requests you showed, try to make them directly
      setTimeout(async () => {
        try {
          // First, the session keepalive request
          console.log('🎯 Making session keepalive request');
          
          await fetch('/api/sessions/v1/me', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json;charset=UTF-8',
              'Accept': 'application/json, text/plain, */*'
            },
            body: '{}'
          }).catch(e => console.log('🎯 Session request failed (expected):', e.message));
          
          // Then try to trigger the dataflow preview with reordered columns
          const currentColumns = getColumnItems();
          const fieldOrder = currentColumns.map(col => ({
            name: col.name,
            rename: col.renameInput?.value || ''
          }));
          
          console.log('🎯 Column order for API:', fieldOrder);
          
          // This would be the preview request - we can't make it directly without the full context
          // but we can trigger events that might cause Domo to make it
          
        } catch (e) {
          console.log('🎯 Direct API approach failed:', e.message);
        }
        
        console.log('🎯 SortableJS drag simulation completed');
        resolve(true);
      }, 100);
      
    } catch (error) {
      console.error('❌ SortableJS drag simulation failed:', error);
      resolve(false);
    }
  });
}

// Simulate exact manual drag behavior based on captured debug data
async function simulateExactManualDrag(sourceElement, targetElement, fromIndex, toIndex) {
  return new Promise(async (resolve) => {
    try {
      console.log('🎯 Starting exact manual drag simulation based on captured data...');
      
      // First try the SortableJS approach (most likely to work)
      if (await simulateSortableJSDrag(sourceElement, targetElement, fromIndex, toIndex)) {
        console.log('🎯 SortableJS drag simulation succeeded');
        resolve(true);
        return;
      }
      
      // Fallback to original approach
      console.log('🎯 Falling back to original drag simulation');
      
      // Find the sortable element (the main column div with aria-roledescription="sortable")
      const sortableElement = sourceElement.closest('[aria-roledescription="sortable"]') || sourceElement;
      const dragHandle = sortableElement.querySelector('[role="button"][aria-label*="Drag"]') || 
                        sortableElement.querySelector('.DfSelectColumns_reorderIcon_59fc9');
      
      if (!dragHandle) {
        console.log('❌ Drag handle not found');
        resolve(false);
        return;
      }
      
      console.log('🎯 Found drag handle:', dragHandle);
      
      // Get position data
      const sourceRect = sortableElement.getBoundingClientRect();
      const targetRect = targetElement.getBoundingClientRect();
      
      // Calculate movement distance (based on debug data showing 56px per row)
      const moveDistance = (toIndex - fromIndex) * 56;
      let startX = sourceRect.left + sourceRect.width / 2;
      let startY= sourceRect.top + sourceRect.height / 2;
      
      console.log('🎯 Movement calculation:', { fromIndex, toIndex, moveDistance, startX, startY });
      
      // Step 1: Focus and mousedown (exactly as captured in debug data)
      console.log('🎯 Step 1: Focus and mousedown');
      dragHandle.focus();
      
      const mousedownEvent = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        clientX: startX,
        clientY: startY,
        button: 0,
        buttons: 1
      });
      dragHandle.dispatchEvent(mousedownEvent);
      
      // Step 2: Set aria-pressed to true (captured in debug data)
      setTimeout(() => {
        console.log('🎯 Step 2: Setting aria-pressed to true');
        dragHandle.setAttribute('aria-pressed', 'true');
        
      // Step 3: Apply transforms to ALL elements (matching debug data pattern)
      console.log('🎯 Step 3: Applying 3D transforms with proper transitions');
      
      // Get all columns for multi-element animation (like real drag)
      const allColumns = getColumnItems();
      
      // Apply transform linear transition to all elements first
      allColumns.forEach(col => {
        col.element.style.transition = 'transform linear';
        col.element.style.transform = 'translate3d(0px, 0px, 0px) scaleX(1) scaleY(1)';
      });
      
      // Then apply the specific transforms based on movement direction
      if (fromIndex > toIndex) {
        // Moving up - dragged element goes negative, others go positive
        sortableElement.style.transform = `translate3d(0px, ${moveDistance}px, 0px) scaleX(1) scaleY(1)`;
        sortableElement.style.opacity = '0'; // Dragged element becomes invisible
        
        // Elements that need to move down
        for (let i = toIndex; i < fromIndex; i++) {
          if (allColumns[i]) {
            allColumns[i].element.style.transform = 'translate3d(0px, 56px, 0px) scaleX(1) scaleY(1)';
          }
        }
      } else {
        // Moving down - dragged element goes positive, others go negative
        sortableElement.style.transform = `translate3d(0px, ${moveDistance}px, 0px) scaleX(1) scaleY(1)`;
        sortableElement.style.opacity = '0'; // Dragged element becomes invisible
        
        // Elements that need to move up
        for (let i = fromIndex + 1; i <= toIndex; i++) {
          if (allColumns[i]) {
            allColumns[i].element.style.transform = 'translate3d(0px, -56px, 0px) scaleX(1) scaleY(1)';
          }
        }
      }        // Step 4: Switch to 200ms transition (matching debug data)
        setTimeout(() => {
          console.log('🎯 Step 4: Switching to 200ms transition');
          
          // Update all elements to use 200ms transition like real drag
          allColumns.forEach(col => {
            col.element.style.transition = 'transform 200ms';
          });
          
          // Step 5: Complete the drag operation (matching debug data sequence)
          setTimeout(() => {
            console.log('🎯 Step 5: Completing drag operation');
            
            // Reset aria-pressed to null (not 'false' as debug data shows)
            dragHandle.removeAttribute('aria-pressed');
            
            // Reset all transforms and opacity
            allColumns.forEach(col => {
              col.element.style.transform = '';
              col.element.style.transition = '';
              col.element.style.opacity = '1';
            });
            
            // Final mouseup
            const mouseupEvent = new MouseEvent('mouseup', {
              bubbles: true,
              cancelable: true,
              clientX: startX,
              clientY: startY + moveDistance,
              button: 0,
              buttons: 0
            });
            dragHandle.dispatchEvent(mouseupEvent);
            
            // Blur to complete the focus cycle (as in debug data)
            setTimeout(() => {
              dragHandle.blur();
              
              // Try SortableJS simulation after visual effects
              setTimeout(async () => {
                if (await simulateSortableJSDrag(sourceElement, targetElement, fromIndex, toIndex)) {
                  console.log('🎯 Post-visual SortableJS simulation succeeded');
                  resolve(true);
                } else {
                  console.log('🎯 Post-visual SortableJS simulation failed, trying other methods');
                  resolve(false);
                }
              }, 100);
              
            }, 50);
          }, 200); // Match the 200ms transition timing
        }, 100);
      }, 30);
      
    } catch (error) {
      console.error('❌ Exact manual drag simulation failed:', error);
      resolve(false);
    }
  });
}

// Simulate React DnD (react-beautiful-dnd or react-dnd) events
async function simulateReactDnd(sourceElement, fromIndex, toIndex) {
  try {
    console.log('Attempting React DnD simulation...', { sourceElement, fromIndex, toIndex });
    
    // Look for the drag handle
    const dragHandle = sourceElement.querySelector('.DfSelectColumns_reorderIcon_59fc9') || 
                      sourceElement.querySelector('[role="button"][aria-roledescription="sortable"]') ||
                      sourceElement.querySelector('[aria-roledescription="sortable"]') ||
                      sourceElement;
    
    if (!dragHandle) {
      console.log('No drag handle found');
      return false;
    }
    
    console.log('Found drag handle:', dragHandle);
    
    // Get all column elements for targeting
    const columns = getColumnItems();
    const targetElement = columns[toIndex]?.element;
    
    if (!targetElement) {
      console.log('No target element found for index:', toIndex);
      return false;
    }
    
    console.log('Target element:', targetElement);
    
    // Method 1: Try exact manual behavior replication (MOST RELIABLE - based on debug capture)
    console.log('Trying exact manual behavior replication...');
    if (await simulateExactManualDrag(sourceElement, targetElement, fromIndex, toIndex)) {
      console.log('Exact manual behavior replication completed');
      return true;
    }

    // Method 2: Try DevTools Protocol-backed drag (trusted-like) only if enabled
    if (DH_REORDER_CONFIG.enableDebuggerDrag || window.DH_ENABLE_DEBUGGER_DRAG) {
      console.log('Trying DevTools Protocol drag...');
      if (await tryDebuggerDrag(sourceElement, targetElement)) {
        console.log('DevTools Protocol drag completed');
        return true;
      }
    }
    
    // Method 3: Try native PointerEvent drag (fallback - has segmentation issues)
    console.log('Trying native PointerEvent drag...');
    if (await simulateNativePointerDrag(sourceElement, targetElement, fromIndex, toIndex)) {
      console.log('Native PointerEvent drag completed');
      return true;
    }
    
    // Method 4: Try realistic mouse drag (most likely to work)
    console.log('Trying realistic mouse drag simulation...');
    if (await simulateRealisticMouseDrag(sourceElement, targetElement, fromIndex, toIndex)) {
      console.log('Realistic mouse drag completed');
      return true;
    }
    
    // Method 5: Try enhanced HTML5 drag and drop
    console.log('Trying enhanced HTML5 drag and drop...');
    if (await simulateEnhancedHTML5DragDrop(sourceElement, targetElement, fromIndex, toIndex)) {
      console.log('Enhanced HTML5 drag and drop completed');
      return true;
    }
    
    // Method 6: Try react-beautiful-dnd style events (original approach)
    if (simulateBeautifulDnd(dragHandle, targetElement, fromIndex, toIndex)) {
      return true;
    }
    
    return false;
    
  } catch (error) {
    console.error('React DnD simulation failed:', error);
    return false;
  }
}

// Use background debugger to perform a trusted-like drag
function tryDebuggerDrag(sourceElement, targetElement) {
  return new Promise((resolve) => {
    try {
      if (!chrome?.runtime?.sendMessage) return resolve(false);
      const handle = sourceElement.querySelector('.DfSelectColumns_reorderIcon_59fc9') ||
                     sourceElement.querySelector('[role="button"][aria-label*="Drag"]') ||
                     sourceElement.closest('[aria-roledescription="sortable"]') ||
                     sourceElement;
      const s = handle.getBoundingClientRect();
      const t = targetElement.getBoundingClientRect();
      let startX = Math.round(s.left + s.width / 2);
      let startY = Math.round(s.top + s.height / 2);
      const endX = Math.round(t.left + t.width / 2);
      const endY = Math.round(t.top + t.height / 2);
      chrome.runtime.sendMessage({ type: 'DH_DEBUGGER_DRAG', startX, startY, endX, endY, steps: 10 }, (resp) => {
        if (resp?.ok) return resolve(true);
        console.warn('Debugger drag failed:', resp?.error);
        resolve(false);
      });
    } catch (e) {
      console.error('Debugger drag exception:', e);
      resolve(false);
    }
  });
}

// Simulate react-beautiful-dnd accessible keyboard drag sequence on the correct handle
function simulateKeyboardLiftMoveDrop(sourceElement, fromIndex, toIndex) {
  return new Promise((resolve) => {
    try {
      const sortable = sourceElement.closest('[aria-roledescription="sortable"]') || sourceElement;
      if (!sortable) return resolve(false);

      // The target is the same list; arrows will move internally
      const steps = Math.abs(toIndex - fromIndex);
      const direction = toIndex > fromIndex ? 'ArrowDown' : 'ArrowUp';

  // Snapshot order before
  const before = getColumnItems().map(c => c.name).join('|');

      function kd(key, code, keyCode) {
        return new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, code, keyCode, which: keyCode });
      }
      function ku(key, code, keyCode) {
        return new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key, code, keyCode, which: keyCode });
      }

      // Focus first to ensure key events reach the element
      sortable.focus();

      // Space to pick up (keydown + keyup)
      sortable.dispatchEvent(kd(' ', 'Space', 32));
      setTimeout(() => {
        sortable.dispatchEvent(ku(' ', 'Space', 32));

        // Move with arrow keys step by step
        let i = 0;
        function moveStep() {
          if (i >= steps) {
            // Space to drop
            setTimeout(() => {
              sortable.dispatchEvent(kd(' ', 'Space', 32));
              setTimeout(() => {
                sortable.dispatchEvent(ku(' ', 'Space', 32));
                // Verify order changed; if not, report failure
                setTimeout(() => {
                  const after = getColumnItems().map(c => c.name).join('|');
                  const changed = before !== after;
                  resolve(changed);
                }, 200);
              }, 20);
            }, 80);
            return;
          }
          const code = direction;
          const keyCode = direction === 'ArrowDown' ? 40 : 38;
          sortable.dispatchEvent(kd(direction, code, keyCode));
          setTimeout(() => {
            sortable.dispatchEvent(ku(direction, code, keyCode));
            i++;
            setTimeout(moveStep, 60);
          }, 20);
        }
        setTimeout(moveStep, 120);
      }, 40);
    } catch (e) {
      console.error('Keyboard lift/move/drop failed:', e);
      resolve(false);
    }
  });
}

// Try to simulate a native-like drag via PointerEvents (the sensors many libs use)
function simulateNativePointerDrag(sourceElement, targetElement, fromIndex, toIndex) {
  return new Promise((resolve) => {
    try {
      // Prefer the sortable item as the event target (most sensors attach here)
      const sortable = sourceElement.closest('[aria-roledescription="sortable"]') || sourceElement;
      const handle = sourceElement.querySelector('.DfSelectColumns_reorderIcon_59fc9') || sortable;
      if (!sortable) return resolve(false);

      // Ensure both source and target are visible (virtualized list safety)
      try { sortable.scrollIntoView({ block: 'center' }); } catch {}
      try { targetElement.scrollIntoView({ block: 'center' }); } catch {}

      const srcRect = sortable.getBoundingClientRect();
      const tgtRect = targetElement.getBoundingClientRect();
  const startX = Math.round(srcRect.left + srcRect.width / 2);
  const startY = Math.round(srcRect.top + srcRect.height / 2);
      const endX = Math.round(tgtRect.left + tgtRect.width / 2);
      const endY = Math.round(tgtRect.top + tgtRect.height / 2);

      const pointerId = 1;

      function pe(type, x, y, extra = {}) {
        const evt = new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId,
          pointerType: 'mouse',
          isPrimary: true,
          clientX: x,
          clientY: y,
          screenX: x,
          screenY: y,
          pageX: x,
          pageY: y,
          buttons: type === 'pointerup' ? 0 : 1,
          pressure: type === 'pointerup' ? 0 : 0.5,
          ...extra
        });
        return evt;
      }

      const tryOnce = (done) => {
        const before = getColumnItems().map(c => c.name).join('|');

  function segmentDrag(currentIndex, finalIndex, currentY) {
          if (currentIndex === finalIndex) {
            // Drop now
            targetElement.dispatchEvent(pe('pointerup', endX, endY));
            try { if (sortable.releasePointerCapture) sortable.releasePointerCapture(pointerId); } catch {}
            targetElement.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: endX, clientY: endY, button: 0 }));
            setTimeout(() => {
              const after = getColumnItems().map(c => c.name).join('|');
              done(before !== after);
            }, DH_REORDER_CONFIG.pointer.verifyDelayMs);
            return;
          }

          // Install capture on first segment
          function captureListener(e) {
            try { if (e.target.setPointerCapture) e.target.setPointerCapture(e.pointerId); } catch {}
          }
          sortable.addEventListener('pointerdown', captureListener, { capture: true, once: true });

          // Start at sortable center
          sortable.dispatchEvent(pe('pointerdown', startX, currentY));
          sortable.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: startX, clientY: currentY, button: 0, buttons: 1 }));

          const direction = finalIndex < currentIndex ? -1 : 1;
          const rowDelta = 56 * direction;

          // Threshold to activate sensor
          const thrY = currentY + (direction * DH_REORDER_CONFIG.pointer.thresholdPx);
          document.dispatchEvent(pe('pointermove', startX, thrY));
          document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: startX, clientY: thrY, buttons: 1 }));

          setTimeout(() => {
            // Move one-row worth
            let step = 0;
            const steps = DH_REORDER_CONFIG.pointer.stepsPerMove;
            function advance() {
              if (step >= steps) {
                // Simulate drop at end of this segment (libs often auto-reposition on hover)
                const segEndY = currentY + rowDelta;
                document.dispatchEvent(pe('pointermove', startX, segEndY));
                document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: startX, clientY: segEndY, buttons: 1 }));
                document.dispatchEvent(pe('pointerup', startX, segEndY));
                try { if (sortable.releasePointerCapture) sortable.releasePointerCapture(pointerId); } catch {}
                document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: startX, clientY: segEndY, button: 0 }));

                // Update our startY for next segment
                const nextIndex = currentIndex + direction;
                const nextStartY = segEndY;
                // Recompute rects in case of virtualization changes
                try { targetElement.scrollIntoView({ block: 'center' }); } catch {}
                setTimeout(() => {
                  // Recurse to next segment until finalIndex
                  segmentDrag(nextIndex, finalIndex, nextStartY);
                }, DH_REORDER_CONFIG.pointer.retryDelayMs);
                return;
              }
              const t = (step + 1) / steps;
              const cy = Math.round(currentY + (rowDelta * t));
              document.dispatchEvent(pe('pointermove', startX, cy));
              document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: startX, clientY: cy, buttons: 1 }));
              step++;
              setTimeout(advance, DH_REORDER_CONFIG.pointer.stepDelayMs);
            }
            advance();
          }, DH_REORDER_CONFIG.pointer.dwellMs);
        }

        // Begin segmented drag
        segmentDrag(fromIndex, toIndex, startY);
      };

      // Try once, retry once if order didn't change
      tryOnce((ok) => {
        if (ok) return resolve(true);
        setTimeout(() => tryOnce((ok2) => resolve(!!ok2)), 120);
      });

    } catch (e) {
      console.error('Pointer drag simulation failed:', e);
      resolve(false);
    }
  });
}

// Simulate react-beautiful-dnd events
function simulateBeautifulDnd(dragHandle, targetElement, fromIndex, toIndex) {
  try {
    console.log('Trying react-beautiful-dnd simulation...');
    
    // Find the actual sortable element (the main field div, not the icon)
    const sortableElement = dragHandle.closest('[aria-roledescription="sortable"]') || 
                           dragHandle.closest('.DfSelectColumns_field_59fc9') ||
                           dragHandle;
    
    console.log('Using sortable element:', sortableElement);
    
    // Focus the sortable element first
    sortableElement.focus();
    sortableElement.click();
    
    // Wait for focus, then start the keyboard drag sequence
    setTimeout(() => {
      console.log('Starting keyboard drag sequence...');
      
      // Step 1: Press Space to enter drag mode (react-beautiful-dnd pattern)
      const spaceDown = new KeyboardEvent('keydown', {
        key: ' ',
        code: 'Space',
        keyCode: 32,
        which: 32,
        bubbles: true,
        cancelable: true
      });
      
      console.log('Dispatching space down to enter drag mode');
      sortableElement.dispatchEvent(spaceDown);
      
      // Step 2: Wait a moment for drag mode to activate, then use arrow keys
      setTimeout(() => {
        const direction = toIndex > fromIndex ? 'ArrowDown' : 'ArrowUp';
        const steps = Math.abs(toIndex - fromIndex);
        
        console.log(`Moving ${steps} steps ${direction}`);
        
        // Function to dispatch arrow key events
        function dispatchArrowKey(step) {
          if (step >= steps) {
            // Finished moving, confirm with space
            console.log('Confirming move with space');
            const spaceConfirm = new KeyboardEvent('keydown', {
              key: ' ',
              code: 'Space',
              keyCode: 32,
              which: 32,
              bubbles: true,
              cancelable: true
            });
            
            sortableElement.dispatchEvent(spaceConfirm);
            return;
          }
          
          // Dispatch arrow key
          const arrowEvent = new KeyboardEvent('keydown', {
            key: direction,
            code: direction,
            keyCode: direction === 'ArrowDown' ? 40 : 38,
            which: direction === 'ArrowDown' ? 40 : 38,
            bubbles: true,
            cancelable: true
          });
          
          console.log(`Step ${step + 1}: dispatching ${direction}`);
          sortableElement.dispatchEvent(arrowEvent);
          
          // Continue with next step after a small delay
          setTimeout(() => dispatchArrowKey(step + 1), 100);
        }
        
        // Start the arrow key sequence
        dispatchArrowKey(0);
        
      }, 200); // Give time for drag mode to activate
      
    }, 100); // Give time for focus
    
    return true;
    
  } catch (error) {
    console.error('react-beautiful-dnd simulation failed:', error);
    return false;
  }
}

// Simulate HTML5 drag and drop
function simulateHTML5DragDrop(dragHandle, targetElement, fromIndex, toIndex) {
  try {
    console.log('Trying HTML5 drag and drop simulation...');
    
    // Find the actual draggable element
    const draggableElement = dragHandle.closest('[aria-roledescription="sortable"]') || 
                            dragHandle.closest('.DfSelectColumns_field_59fc9') ||
                            dragHandle;
    
    console.log('Using draggable element:', draggableElement);
    
    // Get position information for more realistic coordinates
    const sourceRect = draggableElement.getBoundingClientRect();
    const targetRect = targetElement.getBoundingClientRect();
    
    // Create a proper DataTransfer object
    const dataTransfer = new DataTransfer();
    
    // Set some data that drag-drop libraries might expect
    dataTransfer.setData('text/plain', fromIndex.toString());
    dataTransfer.setData('application/json', JSON.stringify({
      index: fromIndex,
      id: draggableElement.getAttribute('data-testid') || 'column-' + fromIndex
    }));
    
    // Step 1: Mouse down
    console.log('Dispatching mousedown');
    const mouseDownEvent = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      clientX: sourceRect.left + sourceRect.width / 2,
      clientY: sourceRect.top + sourceRect.height / 2,
      button: 0,
      buttons: 1
    });
    draggableElement.dispatchEvent(mouseDownEvent);
    
    // Step 2: Drag start
    setTimeout(() => {
      console.log('Dispatching dragstart');
      const dragStartEvent = new DragEvent('dragstart', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dataTransfer,
        clientX: sourceRect.left + sourceRect.width / 2,
        clientY: sourceRect.top + sourceRect.height / 2
      });
      
      draggableElement.dispatchEvent(dragStartEvent);
      
      // Step 3: Drag enter and over on target
      setTimeout(() => {
        console.log('Dispatching dragenter and dragover on target');
        
        const dragEnterEvent = new DragEvent('dragenter', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dataTransfer,
          clientX: targetRect.left + targetRect.width / 2,
          clientY: targetRect.top + targetRect.height / 2
        });
        targetElement.dispatchEvent(dragEnterEvent);
        
        const dragOverEvent = new DragEvent('dragover', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dataTransfer,
          clientX: targetRect.left + targetRect.width / 2,
          clientY: targetRect.top + targetRect.height / 2
        });
        targetElement.dispatchEvent(dragOverEvent);
        
        // Step 4: Drop
        setTimeout(() => {
          console.log('Dispatching drop');
          const dropEvent = new DragEvent('drop', {
            bubbles: true,
            cancelable: true,
            dataTransfer: dataTransfer,
            clientX: targetRect.left + targetRect.width / 2,
            clientY: targetRect.top + targetRect.height / 2
          });
          
          targetElement.dispatchEvent(dropEvent);
          
          // Step 5: Drag end
          setTimeout(() => {
            console.log('Dispatching dragend');
            const dragEndEvent = new DragEvent('dragend', {
              bubbles: true,
              cancelable: true,
              dataTransfer: dataTransfer,
              clientX: targetRect.left + targetRect.width / 2,
              clientY: targetRect.top + targetRect.height / 2
            });
            
            draggableElement.dispatchEvent(dragEndEvent);
            
            // Step 6: Mouse up
            const mouseUpEvent = new MouseEvent('mouseup', {
              bubbles: true,
              cancelable: true,
              clientX: targetRect.left + targetRect.width / 2,
              clientY: targetRect.top + targetRect.height / 2,
              button: 0
            });
            
            targetElement.dispatchEvent(mouseUpEvent);
            
          }, 50);
        }, 50);
      }, 50);
    }, 50);
    
    return true;
    
  } catch (error) {
    console.error('HTML5 drag and drop simulation failed:', error);
    return false;
  }
}

// Simulate realistic mouse drag and drop (like actual manual dragging)
function simulateRealisticMouseDrag(sourceElement, targetElement, fromIndex, toIndex) {
  return new Promise((resolve) => {
    try {
      console.log('Trying realistic mouse drag simulation...');
      
      // Find the actual draggable element (the main field div)
      const draggableElement = sourceElement.closest('[aria-roledescription="sortable"]') || sourceElement;
      
      console.log('Using draggable element:', draggableElement);
      
      // Get position information
      const sourceRect = draggableElement.getBoundingClientRect();
      const targetRect = targetElement.getBoundingClientRect();
      
      // Calculate starting and ending positions (center of elements)
      let startX = sourceRect.left + sourceRect.width / 2;
      let startY= sourceRect.top + sourceRect.height / 2;
      const endX = targetRect.left + targetRect.width / 2;
      const endY = targetRect.top + targetRect.height / 2;
      
      console.log('Drag from:', { startX, startY }, 'to:', { endX, endY });
      
      // Step 1: Mouse down to start the drag
      console.log('Step 1: Mouse down');
      const mouseDownEvent = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        clientX: startX,
        clientY: startY,
        button: 0,
        buttons: 1,
        which: 1
      });
      
      draggableElement.dispatchEvent(mouseDownEvent);
      
      // Step 2: Small delay, then start moving
      setTimeout(() => {
        console.log('Step 2: Starting mouse move sequence');
        
        // Create multiple mousemove events to simulate real dragging
        const steps = 10;
        const deltaX = (endX - startX) / steps;
        const deltaY = (endY - startY) / steps;
        
        let currentStep = 0;
        
        function performDragStep() {
          if (currentStep >= steps) {
            // Finished dragging, dispatch mouse up
            console.log('Step 3: Mouse up (drop)');
            
            const mouseUpEvent = new MouseEvent('mouseup', {
              bubbles: true,
              cancelable: true,
              clientX: endX,
              clientY: endY,
              button: 0,
              buttons: 0,
              which: 1
            });
            
            // Dispatch mouseup on the target element
            targetElement.dispatchEvent(mouseUpEvent);
            
            // Also try dispatching on document for good measure
            document.dispatchEvent(mouseUpEvent);
            
            resolve(true);
            return;
          }
          
          // Calculate current position
          const currentX = startX + (deltaX * currentStep);
          const currentY = startY + (deltaY * currentStep);
          
          // Dispatch mouse move event
          const mouseMoveEvent = new MouseEvent('mousemove', {
            bubbles: true,
            cancelable: true,
            clientX: currentX,
            clientY: currentY,
            button: 0,
            buttons: 1, // Left button is pressed during drag
            which: 1
          });
          
          // Dispatch on document (this is important for drag operations)
          document.dispatchEvent(mouseMoveEvent);
          
          // Also dispatch on the element being dragged
          draggableElement.dispatchEvent(mouseMoveEvent);
          
          currentStep++;
          
          // Continue with next step
          setTimeout(performDragStep, 20); // 20ms between steps for smooth animation
        }
        
        // Start the drag sequence
        performDragStep();
        
      }, 100); // Initial delay before starting drag
      
    } catch (error) {
      console.error('Realistic mouse drag simulation failed:', error);
      resolve(false);
    }
  });
}

// Enhanced HTML5 drag and drop with more accurate event timing
function simulateEnhancedHTML5DragDrop(sourceElement, targetElement, fromIndex, toIndex) {
  return new Promise((resolve) => {
    try {
      console.log('Trying enhanced HTML5 drag and drop...');
      
      // Find the actual draggable element
      const draggableElement = sourceElement.closest('[aria-roledescription="sortable"]') || sourceElement;
      
      console.log('Using draggable element:', draggableElement);
      
      // Get position information for more realistic coordinates
      const sourceRect = draggableElement.getBoundingClientRect();
      const targetRect = targetElement.getBoundingClientRect();
      
      // Create a proper DataTransfer object
      const dataTransfer = new DataTransfer();
      
      // Set data that might be expected by Domo's drag-drop system
      dataTransfer.setData('text/plain', `column-${fromIndex}`);
      dataTransfer.setData('application/json', JSON.stringify({
        sourceIndex: fromIndex,
        targetIndex: toIndex,
        columnName: sourceElement.querySelector('.Truncate-module_truncateText__afW2y')?.textContent || `Column ${fromIndex + 1}`
      }));
      
      // Step 1: Focus and mouse down
      draggableElement.focus();
      
      const mouseDownEvent = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        clientX: sourceRect.left + sourceRect.width / 2,
        clientY: sourceRect.top + sourceRect.height / 2,
        button: 0,
        buttons: 1
      });
      draggableElement.dispatchEvent(mouseDownEvent);
      
      // Step 2: Drag start (after a small delay)
      setTimeout(() => {
        console.log('Dispatching dragstart');
        const dragStartEvent = new DragEvent('dragstart', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dataTransfer,
          clientX: sourceRect.left + sourceRect.width / 2,
          clientY: sourceRect.top + sourceRect.height / 2
        });
        
        const dragStartResult = draggableElement.dispatchEvent(dragStartEvent);
        console.log('Dragstart result:', dragStartResult);
        
        // Step 3: Drag enter on target (after small delay)
        setTimeout(() => {
          console.log('Dispatching dragenter on target');
          
          const dragEnterEvent = new DragEvent('dragenter', {
            bubbles: true,
            cancelable: true,
            dataTransfer: dataTransfer,
            clientX: targetRect.left + targetRect.width / 2,
            clientY: targetRect.top + targetRect.height / 2
          });
          targetElement.dispatchEvent(dragEnterEvent);
          
          // Step 4: Drag over on target (after small delay)
          setTimeout(() => {
            console.log('Dispatching dragover on target');
            
            const dragOverEvent = new DragEvent('dragover', {
              bubbles: true,
              cancelable: true,
              dataTransfer: dataTransfer,
              clientX: targetRect.left + targetRect.width / 2,
              clientY: targetRect.top + targetRect.height / 2
            });
            
            // Prevent default to allow drop
            dragOverEvent.preventDefault = () => {};
            const dragOverResult = targetElement.dispatchEvent(dragOverEvent);
            console.log('Dragover result:', dragOverResult);
            
            // Step 5: Drop on target (after small delay)
            setTimeout(() => {
              console.log('Dispatching drop on target');
              
              const dropEvent = new DragEvent('drop', {
                bubbles: true,
                cancelable: true,
                dataTransfer: dataTransfer,
                clientX: targetRect.left + targetRect.width / 2,
                clientY: targetRect.top + targetRect.height / 2
              });
              
              const dropResult = targetElement.dispatchEvent(dropEvent);
              console.log('Drop result:', dropResult);
              
              // Step 6: Drag end (after small delay)
              setTimeout(() => {
                console.log('Dispatching dragend');
                
                const dragEndEvent = new DragEvent('dragend', {
                  bubbles: true,
                  cancelable: true,
                  dataTransfer: dataTransfer,
                  clientX: targetRect.left + targetRect.width / 2,
                  clientY: targetRect.top + targetRect.height / 2
                });
                
                draggableElement.dispatchEvent(dragEndEvent);
                
                // Final mouse up
                const mouseUpEvent = new MouseEvent('mouseup', {
                  bubbles: true,
                  cancelable: true,
                  clientX: targetRect.left + targetRect.width / 2,
                  clientY: targetRect.top + targetRect.height / 2,
                  button: 0
                });
                
                targetElement.dispatchEvent(mouseUpEvent);
                
                resolve(true);
                
              }, 50);
            }, 50);
          }, 50);
        }, 50);
      }, 100);
      
    } catch (error) {
      console.error('Enhanced HTML5 drag and drop simulation failed:', error);
      resolve(false);
    }
  });
}

// Complete DOM replacement approach - rebuild the entire structure in correct order
function completeReorder(fromIndex, toIndex) {
  try {
    console.log('Trying complete DOM replacement approach...');
    
    const container = document.querySelector(SELECTORS.selectColumnsContainer);
    if (!container) return false;
    
    // Find the virtualized container that holds the columns
    const virtualContainer = container.querySelector('[style*="position: relative"]');
    if (!virtualContainer) return false;
    
    const heightContainer = virtualContainer.querySelector('[style*="height:"]');
    if (!heightContainer) return false;
    
    console.log('Found containers for complete reorder');
    
    // Get all current column data BEFORE making changes
    const columns = getColumnItems();
    if (!columns[fromIndex]) return false;
    
    console.log('Current column order:', columns.map(col => col.name));
    
    // Store reference to the actual source and target elements for drag simulation
    const sourceElement = columns[fromIndex].element;
    const targetElement = columns[toIndex >= fromIndex ? toIndex : toIndex]?.element || columns[0].element;
    
    // Create new ordered array
    const reorderedColumns = [...columns];
    const [movedColumn] = reorderedColumns.splice(fromIndex, 1);
    reorderedColumns.splice(toIndex, 0, movedColumn);
    
    console.log('New column order:', reorderedColumns.map(col => col.name));
    
    // Build the complete new HTML structure
    let newHTML = '';
    
    reorderedColumns.forEach((column, index) => {
      // Extract the column name from the current element
      const nameEl = column.element.querySelector('.Truncate-module_truncateText__afW2y');
      const columnName = nameEl ? nameEl.textContent : `Column ${index + 1}`;
      
      // Extract any rename value
      const renameInput = column.element.querySelector('input[placeholder="Rename to"]');
      const renameValue = renameInput ? renameInput.value : '';
      
      // Calculate position
      const topPosition = index * 56; // 56px height per row
      
      // Build the complete HTML for this column
      newHTML += `
        <div>
          <div role="button" tabindex="0" aria-disabled="false" aria-roledescription="sortable"
            aria-describedby="DndDescribedBy-8" class="DfSelectColumns_field_59fc9"
            style="margin: 0px; position: absolute; left: 0px; top: ${topPosition}px; height: 56px; width: 100%; opacity: 1;">
            <div class="DfSelectColumns_numberSpace_59fc9">${index + 1}</div>
            <div class="DfSelectColumns_fieldName_59fc9 DfSelectColumns_border_59fc9">
              <div class="overflow-hidden display-flex">
                <i class="db-icon icon-lines-horizontal sm DfSelectColumns_reorderIcon_59fc9" role="presentation"></i>
                <div class="Truncate-module_minWidth__wCcR1">
                  <div class="Truncate-module_truncateText__afW2y Truncate-module_overflow__FYKIw"
                    aria-labelledby="useUniqueId${97 + index}">${columnName}</div>
                  <div role="tooltip" class="Tooltip-module_srOnly__V-ZI0" id="useUniqueId${97 + index}">${columnName}</div>
                </div>
              </div>
            </div>
            <div class="DfSelectColumns_rename_59fc9 DfSelectColumns_border_59fc9" data-etl-no-dnd="true">
              <span role="presentation">
                <input class="Input-module_input__aRXjR db-text-body" placeholder="Rename to"
                  type="text" value="${renameValue}">
              </span>
            </div>
            <div class="DfSelectColumns_removeSpace_59fc9 DfSelectColumns_border_59fc9" data-etl-no-dnd="true">
              <button data-testid="remove_select_column_${index}"
                class="db-text-button Button-module_button__7BLGt Button-module_default__utLb- Button-module_flat__aBcd9"
                type="button">
                <span class="Button-module_content__b7-cz">
                  <i class="db-icon icon-x md" role="presentation"></i>
                </span>
              </button>
            </div>
          </div>
        </div>`;
    });
    
    console.log('Built new HTML structure');
    
    // Calculate new container height
    const newHeight = reorderedColumns.length * 56;
    
    // Replace the entire content
    heightContainer.innerHTML = newHTML;
    heightContainer.style.height = `${newHeight}px`;
    
    console.log('Replaced DOM content with reordered structure');
    
    // Force a repaint by triggering layout
    heightContainer.offsetHeight;
    
    // Now simulate the actual drag-and-drop to update Domo's state
    setTimeout(async () => {
      console.log('Triggering actual drag-and-drop simulation to update state...');
      
      // Get the new elements after DOM replacement
      const newSourceElement = heightContainer.querySelector(`[data-testid="remove_select_column_${toIndex}"]`)?.closest('.DfSelectColumns_field_59fc9');
      const newTargetElement = heightContainer.querySelector(`[data-testid="remove_select_column_${fromIndex > toIndex ? fromIndex : fromIndex - 1}"]`)?.closest('.DfSelectColumns_field_59fc9');
      
      if (newSourceElement && newTargetElement) {
        console.log('Found new elements for state update simulation');
        
        // Try multiple approaches to trigger state update
        await Promise.all([
          simulateReactDndStateUpdate(newSourceElement, newTargetElement, fromIndex, toIndex),
          triggerDndLiveRegionUpdate(movedColumn.name, reorderedColumns[toIndex === 0 ? 0 : toIndex - 1]?.name, container),
          simulateKeyboardDragComplete(newSourceElement, fromIndex, toIndex)
        ]);
      }
      
      // Re-add dropdowns after state update attempts
      setTimeout(() => {
        console.log('Re-adding dropdowns to new structure...');
        addReorderDropdowns();
      }, 200);
      
    }, 100);
    
    return true;
    
  } catch (error) {
    console.error('Complete DOM replacement failed:', error);
    return false;
  }
}

// Simulate drag-and-drop state update after DOM replacement
async function simulateReactDndStateUpdate(sourceElement, targetElement, fromIndex, toIndex) {
  try {
    console.log('Simulating React DnD state update...');
    
    // Method 1: Simulate keyboard drag completion
    const sortableElement = sourceElement.querySelector('[aria-roledescription="sortable"]') || sourceElement;
    
    // Focus and start keyboard drag sequence
    sortableElement.focus();
    
    // Space to enter drag mode
    const spaceDown = new KeyboardEvent('keydown', {
      key: ' ',
      code: 'Space',
      keyCode: 32,
      bubbles: true
    });
    sortableElement.dispatchEvent(spaceDown);
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Space again to confirm/complete drag
    const spaceUp = new KeyboardEvent('keydown', {
      key: ' ',
      code: 'Space',
      keyCode: 32,
      bubbles: true
    });
    sortableElement.dispatchEvent(spaceUp);
    
    return true;
    
  } catch (error) {
    console.error('React DnD state update failed:', error);
    return false;
  }
}

// Update the DnD live region to reflect the change (like manual drag does)
function triggerDndLiveRegionUpdate(movedColumnName, targetColumnName, container) {
  try {
    console.log('Updating DnD live region...');
    
    const liveRegion = container.querySelector('[id*="DndLiveRegion"]');
    if (liveRegion) {
      const message = `Draggable item ${movedColumnName} was dropped over droppable area ${targetColumnName}`;
      liveRegion.textContent = message;
      console.log('Updated live region:', message);
      
      // Trigger screen reader announcement
      const announceEvent = new CustomEvent('DnDStateChange', {
        bubbles: true,
        detail: { message, movedColumnName, targetColumnName }
      });
      container.dispatchEvent(announceEvent);
    }
    
    return true;
    
  } catch (error) {
    console.error('DnD live region update failed:', error);
    return false;
  }
}

// Simulate completing a keyboard drag operation
async function simulateKeyboardDragComplete(element, fromIndex, toIndex) {
  try {
    console.log('Simulating keyboard drag completion...');
    
    const sortableElement = element.querySelector('[aria-roledescription="sortable"]') || element;
    
    // Simulate the complete keyboard drag sequence that Domo expects
    sortableElement.focus();
    
    // 1. Space to pick up
    const pickupEvent = new KeyboardEvent('keydown', {
      key: ' ',
      code: 'Space',
      keyCode: 32,
      bubbles: true,
      cancelable: true
    });
    sortableElement.dispatchEvent(pickupEvent);
    
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // 2. Arrow keys to move (simulate the movement that already happened visually)
    const direction = toIndex > fromIndex ? 'ArrowDown' : 'ArrowUp';
    const steps = Math.abs(toIndex - fromIndex);
    
    for (let i = 0; i < steps; i++) {
      const arrowEvent = new KeyboardEvent('keydown', {
        key: direction,
        code: direction,
        keyCode: direction === 'ArrowDown' ? 40 : 38,
        bubbles: true,
        cancelable: true
      });
      sortableElement.dispatchEvent(arrowEvent);
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    
    // 3. Space to drop/confirm
    const dropEvent = new KeyboardEvent('keydown', {
      key: ' ',
      code: 'Space',
      keyCode: 32,
      bubbles: true,
      cancelable: true
    });
    sortableElement.dispatchEvent(dropEvent);
    
    return true;
    
  } catch (error) {
    console.error('Keyboard drag completion failed:', error);
    return false;
  }
}

// Refresh all reorder dropdowns after a change
function refreshReorderDropdowns() {
  // Remove existing dropdowns
  document.querySelectorAll('.dh-reorder-dropdown').forEach(dropdown => dropdown.remove());
  
  // Re-add dropdowns with updated options
  setTimeout(() => {
    addReorderDropdowns();
    // Ensure all dropdowns are blank after refresh
    document.querySelectorAll('.dh-move-after-select').forEach(sel => { sel.value = ''; });
  }, 50);
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
        addReorderDropdowns();
        // addBulkReorderButton();
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
      addReorderDropdowns();
    //   addBulkReorderButton();
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
  
  // Remove added elements
  document.querySelectorAll('.dh-reorder-dropdown, .dh-bulk-reorder-btn').forEach(el => el.remove());
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

// Debug helpers (non-production): expose a console API to trigger moves
try {
  // Only attach once
  if (!window.DH_reorderMove) {
    window.DH_reorderMove = async function(fromIndex, toIndex) {
      try {
        return await moveColumnToPosition(fromIndex, toIndex);
      } catch (e) { console.error(e); return false; }
    };
  }
} catch {}

// Enhanced function to wait for column order change and detect state persistence
function waitForColumnOrderChange(timeoutMs = 1000) {
  return new Promise((resolve) => {
    try {
      const container = document.querySelector(SELECTORS.selectColumnsContainer);
      if (!container) return resolve();
      const before = getColumnItems().map(c => c.name).join('|');
      
      console.log('🔍 Monitoring for column order changes...');
      console.log('🔍 Before order:', before);

      let done = false;
      let changeDetected = false;
      const finish = (detected = false) => { 
        if (!done) { 
          done = true; 
          console.log('🔍 Order change monitoring completed. Change detected:', detected);
          resolve(detected); 
        } 
      };

      // Monitor DOM mutations
      const obs = new MutationObserver((mutations) => {
        const after = getColumnItems().map(c => c.name).join('|');
        if (after && after !== before) {
          console.log('🔍 DOM order change detected!');
          console.log('🔍 After order:', after);
          changeDetected = true;
          obs.disconnect();
          
          // Also monitor for any network requests that might indicate persistence
          setTimeout(() => {
            checkForNetworkActivity();
            finish(true);
          }, 200);
        }
      });
      obs.observe(container, { childList: true, subtree: true, attributes: true, characterData: true });

      // Also monitor for React state changes via custom events
      const stateChangeListener = (e) => {
        console.log('🔍 React state change event detected:', e.detail);
        changeDetected = true;
      };
      
      document.addEventListener('stateChange', stateChangeListener);
      document.addEventListener('transformationChange', stateChangeListener);

      setTimeout(() => { 
        try { obs.disconnect(); } catch {} 
        document.removeEventListener('stateChange', stateChangeListener);
        document.removeEventListener('transformationChange', stateChangeListener);
        finish(changeDetected); 
      }, timeoutMs);
    } catch { resolve(false); }
  });
}

// Check for network activity that might indicate state persistence
function checkForNetworkActivity() {
  try {
    console.log('🔍 Checking for recent network activity...');
    
    // Check if Performance API is available
    if (window.performance && window.performance.getEntriesByType) {
      const recentRequests = window.performance.getEntriesByType('navigation')
        .concat(window.performance.getEntriesByType('xmlhttprequest'))
        .concat(window.performance.getEntriesByType('fetch'))
        .filter(entry => {
          const timeSinceRequest = Date.now() - entry.fetchStart;
          return timeSinceRequest < 5000; // Last 5 seconds
        });
      
      if (recentRequests.length > 0) {
        console.log('🔍 Recent network requests detected:', recentRequests.length);
        recentRequests.forEach(req => {
          console.log('🔍 Request:', req.name || req.url || 'unknown', 'Duration:', req.duration);
        });
      } else {
        console.log('🔍 No recent network requests detected - state may not be persisting');
      }
    }
    
    // Check for any XHR or fetch that might be in progress
    if (window.XMLHttpRequest) {
      console.log('🔍 XMLHttpRequest available for monitoring');
    }
    
  } catch (error) {
    console.log('🔍 Network activity check failed:', error);
  }
}

// Debug function to analyze current React state
function debugReactState() {
  try {
    console.log('🔍 REACT STATE DEBUG:');
    
    const container = document.querySelector(SELECTORS.selectColumnsContainer);
    if (!container) {
      console.log('🔍 No container found');
      return;
    }
    
    // Find all React instances
    const reactKeys = Object.keys(container).filter(key => key.startsWith('__react'));
    console.log('🔍 React keys found:', reactKeys.length);
    
    reactKeys.forEach((key, index) => {
      const instance = container[key];
      console.log(`🔍 React instance ${index}:`, {
        type: instance?.elementType?.name || instance?.type?.name || 'unknown',
        props: instance?.memoizedProps ? Object.keys(instance.memoizedProps) : 'none',
        state: instance?.memoizedState ? 'present' : 'none',
        stateNode: instance?.stateNode ? 'present' : 'none'
      });
    });
    
    // Check for any data attributes that might indicate state
    const dataAttrs = Array.from(container.attributes)
      .filter(attr => attr.name.startsWith('data-'))
      .map(attr => ({ name: attr.name, value: attr.value }));
    
    console.log('🔍 Container data attributes:', dataAttrs);
    
  } catch (error) {
    console.log('🔍 React state debug failed:', error);
  }
}

// Expose debug function globally for manual testing
window.DH_debugReactState = debugReactState;
