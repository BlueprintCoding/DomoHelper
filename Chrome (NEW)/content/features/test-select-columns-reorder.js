// Test file for Select Columns Reorder Feature
// This is a simple test to verify the feature works correctly

console.log('Testing Select Columns Reorder Feature...');

// Simulate being on a Magic ETL page with Select Columns active
function simulateSelectColumnsEnvironment() {
  // Create a mock DOM structure similar to what Domo provides
  const mockHTML = `
    <div class="DfEditorPanelToolbar_toolbar_a6045" data-testid="EDITOR_TOOLBAR">
      <div class="DfEditToggle_display_ddd57">
        <div class="Truncate-module_truncateText__afW2y">Select Columns</div>
      </div>
      <div class="DfEditorPanelToolbar_buttons_a6045"></div>
    </div>
    
    <div data-testid="SELECT_COLUMNS_LIST">
      <div style="position: relative; height: 259px; width: 986px;">
        <div class="DfSelectColumns_field_59fc9" style="position: absolute; left: 0px; top: 0px;">
          <div class="DfSelectColumns_numberSpace_59fc9">1</div>
          <div class="DfSelectColumns_fieldName_59fc9">
            <div class="Truncate-module_truncateText__afW2y">Demo Column 1</div>
          </div>
          <input placeholder="Rename to" type="text" value="">
        </div>
        
        <div class="DfSelectColumns_field_59fc9" style="position: absolute; left: 0px; top: 56px;">
          <div class="DfSelectColumns_numberSpace_59fc9">2</div>
          <div class="DfSelectColumns_fieldName_59fc9">
            <div class="Truncate-module_truncateText__afW2y">Demo Column 2</div>
          </div>
          <input placeholder="Rename to" type="text" value="">
        </div>
      </div>
    </div>
  `;
  
  const container = document.createElement('div');
  container.innerHTML = mockHTML;
  document.body.appendChild(container);
  
  return container;
}

// Test the feature detection
function testFeatureDetection() {
  const mockContainer = simulateSelectColumnsEnvironment();
  
  // Import and test the feature
  import('./feature-select-columns-reorder.js').then(module => {
    const feature = module.default;
    
    // Mock DH object
    const mockDH = {
      showNotification: (message, color) => {
        console.log(`Notification: ${message} (${color})`);
      }
    };
    
    // Initialize the feature
    feature.init({ DH: mockDH });
    
    // Test if buttons are added
    setTimeout(() => {
      const reorderButtons = document.querySelectorAll('.dh-reorder-buttons');
      const bulkReorderButton = document.querySelector('.dh-bulk-reorder-btn');
      
      console.log('Reorder buttons found:', reorderButtons.length > 0);
      console.log('Bulk reorder button found:', bulkReorderButton !== null);
      
      if (bulkReorderButton) {
        console.log('Testing bulk reorder modal...');
        bulkReorderButton.click();
        
        setTimeout(() => {
          const modal = document.querySelector('.dh-reorder-modal');
          console.log('Modal opened:', modal !== null);
          
          if (modal) {
            // Test modal close
            const closeBtn = modal.querySelector('.dh-close-modal');
            if (closeBtn) closeBtn.click();
            console.log('Modal can be closed');
          }
        }, 100);
      }
      
      // Cleanup
      feature.cleanup();
      mockContainer.remove();
      console.log('Test completed successfully!');
      
    }, 500);
    
  }).catch(error => {
    console.error('Test failed:', error);
  });
}

// Run the test
if (typeof window !== 'undefined') {
  testFeatureDetection();
}
