// content/features/feature-page-fulltext.js
// Handles: Full Text Popup, disabling data-drill, removing invalid links on card pages.
// Now uses the generalized modal utility.

import createModal from './feature-general-modal.js';

let isBound = false;
let settingsState = { enabled: true, removeLinks: false };
let DHref = null;
let modalCtl = null;

function modifyDataDrillAttributes() {
  $("td a[data-drill]").each(function () {
    const dataDrill = $(this).attr('data-drill');
    if (dataDrill) $(this).attr('data-drill-none', dataDrill).removeAttr('data-drill');
  });
}
function resetDataDrillAttributes() {
  $("td a[data-drill-none]").each(function () {
    const dataDrillNone = $(this).attr('data-drill-none');
    if (dataDrillNone) $(this).attr('data-drill', dataDrillNone).removeAttr('data-drill-none');
  });
}

function removeInvalidLinks() {
  if (!settingsState.removeLinks) return;
  $("td a[data-drill-none]").each(function () {
    const dataDrillNone = $(this).attr('data-drill-none');
    if (dataDrillNone) {
      const drillData = JSON.parse(dataDrillNone.replace(/&quot;/g, '"'));
      if (drillData.filters?.length) {
        const values = drillData.filters[0].values;
        if (values?.length) {
          const spanElement = $('<div>').html(values[0]).find('span');
          const fontColorValue = spanElement.attr('font-color');
          if (fontColorValue === 'NOTEXT') $(this).replaceWith(spanElement);
        }
      }
    }
  });
}
function resetInvalidLinks() {
  $("td span[font-color='NOTEXT']").each(function () {
    const spanElement = $(this);
    const originalAnchor = spanElement.parent('a');
    if (originalAnchor?.length) {
      const originalDataDrill = originalAnchor.attr('data-drill-none');
      if (originalDataDrill) originalAnchor.attr('data-drill', originalDataDrill).removeAttr('data-drill-none');
      originalAnchor.replaceWith(spanElement);
    }
  });
}

// Build or update the reusable modal contents
function ensureModal() {
  if (modalCtl) return modalCtl;

  const bodyHtml = `
    <textarea readonly id="dh-fontColorValue"
      class="details-landing DfSaveModalContentsWithTriggering_textarea_Sp86n Textarea-module_textarea__Etl2x"
      style="width:100%;min-height:180px;"></textarea>
    <p class="authorNote footnote">Full Text Modal created by Domo Helper Browser Extension.</p>
  `;

  modalCtl = createModal({
    title: 'Full Text Value',
    body: bodyHtml,
    wide: false,
    buttons: [
      { id: 'copy',  label: 'Copy to Clipboard', kind: 'default',
        onClick: async () => {
          const text = document.getElementById('dh-fontColorValue')?.value || '';
          try {
            await navigator.clipboard.writeText(text);
            console.log('Text copied to clipboard');
            DHref?.showNotification?.('Copied to clipboard', '#4CAF50');
          } catch (e) {
            console.error('Could not copy text:', e);
            DHref?.showNotification?.('Copy failed', '#ed3737');
          }
        }
      },
      { id: 'close', label: 'Close', kind: 'primary', autofocus: true,
        onClick: (_evt, ctl) => ctl.close()
      }
    ]
  });

  return modalCtl;
}

function openFullTextModal(textValue) {
  console.log('📝 Opening modal with text:', textValue);
  const ctl = ensureModal();
  
  // Open the modal first to ensure DOM elements exist
  ctl.open();
  
  // Then set the textarea value after a short delay to ensure DOM is ready
  setTimeout(() => {
    const ta = document.getElementById('dh-fontColorValue');
    if (ta) {
      ta.value = textValue || 'No full text value found';
      console.log('✅ Modal textarea value set to:', ta.value);
    } else {
      console.error('❌ Could not find textarea element dh-fontColorValue after opening modal');
    }
  }, 50);
}

function bindHandlers() {
  if (isBound) return;
  isBound = true;

  console.log('🔗 Binding full text popup handlers');

  // Native DOM event delegation - more reliable for dynamic content
  document.addEventListener('click', function(event) {
    const link = event.target.closest('a[data-drill-none]');
    if (!link) return;
    
    console.log('📋 Full text link clicked:', link.textContent);
    if (!settingsState.enabled) {
      console.log('❌ Full text feature disabled');
      return;
    }
    event.preventDefault();

    const dataDrillNone = link.getAttribute('data-drill-none');
    console.log('📊 data-drill-none attribute:', dataDrillNone ? 'found' : 'NOT FOUND');
    
    let fontColorValue = 'No full text value found';

    if (dataDrillNone) {
      try {
        console.log('🔍 Parsing drill data...');
        const drillData = JSON.parse(dataDrillNone.replace(/&quot;/g, '"'));
        console.log('✅ Parsed drill data:', drillData);
        
        if (drillData.filters?.length) {
          console.log('✅ Found', drillData.filters.length, 'filters');
          const values = drillData.filters[0].values;
          console.log('📝 Values:', values);
          
          if (values?.length) {
            console.log('🔍 Extracting font-color from:', values[0].substring(0, 100));
            const div = document.createElement('div');
            div.innerHTML = values[0];
            const spanElement = div.querySelector('span');
            console.log('✅ Found span element:', spanElement ? 'yes' : 'no');
            
            if (spanElement) {
              fontColorValue = spanElement.getAttribute('font-color');
              console.log('✅ Extracted full text:', fontColorValue);
            } else {
              console.log('❌ No span element found in HTML');
            }
          } else {
            console.log('❌ No values in filters');
          }
        } else {
          console.log('❌ No filters in drill data');
        }
      } catch (e) {
        console.error('❌ Error parsing drill data:', e);
        fontColorValue = 'Error parsing: ' + e.message;
      }
    } else {
      console.log('❌ No data-drill-none attribute found');
      fontColorValue = 'No data-drill-none attribute found';
    }

    console.log('📝 Final text to display:', fontColorValue);
    openFullTextModal(fontColorValue);
  }, true); // Use capture phase to ensure we catch events

  // Also add jQuery delegated event handler as backup
  $(document).on("click",
    "a[data-drill-none]",
    function (event) {
      console.log('📋 jQuery - Full text link clicked');
      if (!settingsState.enabled) return;
      event.preventDefault();

      const dataDrillNone = $(this).attr('data-drill-none');
      let fontColorValue = 'No full text value found';

      if (dataDrillNone) {
        try {
          const drillData = JSON.parse(dataDrillNone.replace(/&quot;/g, '"'));
          if (drillData.filters?.length) {
            const values = drillData.filters[0].values;
            if (values?.length) {
              const spanElement = $('<div>').html(values[0]).find('span');
              fontColorValue = spanElement.attr('font-color') || fontColorValue;
              console.log('✅ Extracted full text:', fontColorValue);
            }
          }
        } catch (e) {
          console.error('Error parsing drill data:', e);
        }
      }

      openFullTextModal(fontColorValue);
    }
  );

  // Watch KPI chart insertions to re-apply transformations
  const observer = new MutationObserver((ml) => {
    ml.forEach(m => {
      m.addedNodes.forEach(node => {
        if (node.nodeType === 1 && (node.matches('.kpi_chart, .kpi_chart *'))) {
          console.log('📊 KPI chart detected - applying transformations');
          if (settingsState.removeLinks) removeInvalidLinks();
          if (settingsState.enabled) modifyDataDrillAttributes();
          else resetDataDrillAttributes();
        }
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

export default {
  init({ DH, settings, PageDetector }) {
    DHref = DH;
    settingsState.enabled = settings.enabled;
    settingsState.removeLinks = settings.removeLinks;
    
    // Support both old (PageDetector) and new (context subscription) systems
    if (window.subscribeToContextUpdates) {
      window.subscribeToContextUpdates((context) => {
        const isPageContext = context?.domoObject?.typeId === 'PAGE';
        if (!isPageContext) {
          console.log('[Page Full Text] Non-PAGE context detected, disabling transformations');
          resetDataDrillAttributes();
          resetInvalidLinks();
          isBound = false;
        } else {
          console.log('[Page Full Text] PAGE context detected, enabling feature');
          if (settingsState.removeLinks) removeInvalidLinks();
          if (settingsState.enabled) modifyDataDrillAttributes();
          if (!isBound) bindHandlers();
        }
      });
    } else if (PageDetector && !PageDetector.isPage()) {
      console.warn('[Page Full Text] Warning: Feature initialized on non-PAGE context');
    }

    console.log('🎯 Full Text Popup feature initializing - enabled:', settingsState.enabled, 'removeLinks:', settingsState.removeLinks);

    ensureModal(); // build once
    if (settingsState.removeLinks) removeInvalidLinks();
    if (settingsState.enabled) modifyDataDrillAttributes(); else resetDataDrillAttributes();
    bindHandlers();
    
    // Watch for dynamically added links and rebind handlers
    const linkWatcher = new MutationObserver(() => {
      const links = document.querySelectorAll('a[data-drill-none]');
      if (links.length > 0 && !isBound) {
        console.log('🔗 Found', links.length, 'links with data-drill-none - rebinding handlers');
        bindHandlers();
      }
    });
    linkWatcher.observe(document.body, { childList: true, subtree: true });
  },
  applySettings(newSettings) {
    if (newSettings.enabled !== undefined) settingsState.enabled = !!newSettings.enabled;
    if (newSettings.removeLinks !== undefined) settingsState.removeLinks = !!newSettings.removeLinks;

    console.log('⚙️ Settings updated - enabled:', settingsState.enabled, 'removeLinks:', settingsState.removeLinks);

    if (settingsState.removeLinks) removeInvalidLinks();
    else resetInvalidLinks();

    if (settingsState.enabled) modifyDataDrillAttributes();
    else resetDataDrillAttributes();
  },
  cleanup() {
    // Destroy modal instance if present
    if (modalCtl) { modalCtl.destroy(); modalCtl = null; }
    // Try to restore attributes
    resetDataDrillAttributes();
  }
};
