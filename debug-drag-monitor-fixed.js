// Fixed debug script to monitor drag and drop operations
// Run this in the console before doing a manual drag

console.log('🔍 Starting drag-and-drop monitoring...');

// 1. Monitor all network requests
const originalFetch = window.fetch;
const originalXHR = window.XMLHttpRequest.prototype.send;

// Intercept fetch requests
window.fetch = function(...args) {
  const url = args[0];
  if (url && typeof url === 'string' && (url.includes('dataflow') || url.includes('preview') || url.includes('transform'))) {
    console.log('🌐 FETCH Request:', {
      url: url,
      method: args[1]?.method || 'GET',
      body: args[1]?.body,
      timestamp: new Date().toISOString()
    });
  }
  return originalFetch.apply(this, args).then(response => {
    if (url && typeof url === 'string' && (url.includes('dataflow') || url.includes('preview') || url.includes('transform'))) {
      console.log('🌐 FETCH Response:', {
        url: url,
        status: response.status,
        timestamp: new Date().toISOString()
      });
    }
    return response;
  });
};

// Intercept XHR requests
window.XMLHttpRequest.prototype.send = function(data) {
  if (this._url && (this._url.includes('dataflow') || this._url.includes('preview') || this._url.includes('transform'))) {
    console.log('🌐 XHR Request:', {
      url: this._url,
      method: this._method || 'GET',
      data: data,
      timestamp: new Date().toISOString()
    });
  }
  return originalXHR.call(this, data);
};

// 2. Monitor React state changes
const container = document.querySelector('[data-testid="SELECT_COLUMNS_LIST"]');
if (container) {
  // Look for React Fiber
  const reactKeys = Object.keys(container).filter(key => key.startsWith('__react'));
  console.log('⚛️ Found React keys:', reactKeys);
  
  if (reactKeys.length > 0) {
    const reactInstance = container[reactKeys[0]];
    console.log('⚛️ React instance:', reactInstance);
    
    // Try to find the state
    if (reactInstance?.memoizedProps) {
      console.log('⚛️ React props:', reactInstance.memoizedProps);
    }
    if (reactInstance?.memoizedState) {
      console.log('⚛️ React state:', reactInstance.memoizedState);
    }
  }
}

// 3. Monitor DOM changes
const observer = new MutationObserver(mutations => {
  mutations.forEach(mutation => {
    if (mutation.type === 'childList') {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === 1 && node.classList?.contains('DfSelectColumns_field_59fc9')) {
          console.log('➕ Column added:', {
            node: node,
            columnName: node.querySelector('.Truncate-module_truncateText__afW2y')?.textContent,
            position: node.style.top,
            timestamp: new Date().toISOString()
          });
        }
      });
      
      mutation.removedNodes.forEach(node => {
        if (node.nodeType === 1 && node.classList?.contains('DfSelectColumns_field_59fc9')) {
          console.log('➖ Column removed:', {
            node: node,
            columnName: node.querySelector('.Truncate-module_truncateText__afW2y')?.textContent,
            position: node.style.top,
            timestamp: new Date().toISOString()
          });
        }
      });
    }
    
    if (mutation.type === 'attributes' && mutation.target.classList?.contains('DfSelectColumns_field_59fc9')) {
      console.log('🔄 Column attribute changed:', {
        target: mutation.target,
        attribute: mutation.attributeName,
        oldValue: mutation.oldValue,
        newValue: mutation.target.getAttribute(mutation.attributeName),
        columnName: mutation.target.querySelector('.Truncate-module_truncateText__afW2y')?.textContent,
        timestamp: new Date().toISOString()
      });
    }
  });
});

if (container) {
  observer.observe(container, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeOldValue: true
  });
}

// 4. Monitor drag events (including Pointer Events)
const eventTypes = [
  'dragstart', 'drag', 'dragenter', 'dragleave', 'dragover', 'drop', 'dragend',
  'pointerdown', 'pointermove', 'pointerup', 'pointercancel',
  'gotpointercapture', 'lostpointercapture',
  'mousedown', 'mousemove', 'mouseup',
  'keydown', 'keyup',
  'focus', 'blur'
];

eventTypes.forEach(eventType => {
  document.addEventListener(eventType, (e) => {
    const target = e.target;
    if (target.closest?.('.DfSelectColumns_field_59fc9') || target.closest?.('[data-testid="SELECT_COLUMNS_LIST"]')) {
      console.log(`🎯 ${eventType.toUpperCase()} Event:`, {
        type: eventType,
        target: target,
        columnName: target.closest('.DfSelectColumns_field_59fc9')?.querySelector('.Truncate-module_truncateText__afW2y')?.textContent,
        key: e.key,
        code: e.code,
        clientX: e.clientX,
        clientY: e.clientY,
        pageX: e.pageX,
        pageY: e.pageY,
        screenX: e.screenX,
        screenY: e.screenY,
        pointerId: e.pointerId,
        isPrimary: e.isPrimary,
        pointerType: e.pointerType,
        buttons: e.buttons,
        pressure: e.pressure,
        dataTransfer: e.dataTransfer,
        timestamp: new Date().toISOString()
      });
    }
  }, true);
});

// 5. Monitor live region changes
const liveRegion = container?.querySelector('[id*="DndLiveRegion"]');
if (liveRegion) {
  const liveObserver = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      if (mutation.type === 'characterData' || mutation.type === 'childList') {
        console.log('📢 Live Region Updated:', {
          oldValue: mutation.oldValue,
          newValue: liveRegion.textContent,
          timestamp: new Date().toISOString()
        });
      }
    });
  });
  
  liveObserver.observe(liveRegion, {
    characterData: true,
    childList: true,
    characterDataOldValue: true
  });
}

console.log('✅ Monitoring setup complete! Now perform a manual drag operation and check the output above.');
console.log('📝 After dragging, copy all the console output and send it to help debug the issue.');

// Helper function to get current column order
window.getCurrentColumnOrder = function() {
  const columns = Array.from(document.querySelectorAll('.DfSelectColumns_field_59fc9'));
  return columns.map(col => ({
    name: col.querySelector('.Truncate-module_truncateText__afW2y')?.textContent,
    position: col.style.top,
    index: parseInt(col.style.top) / 56
  })).sort((a, b) => a.index - b.index);
};

console.log('Current column order before drag:', window.getCurrentColumnOrder());
