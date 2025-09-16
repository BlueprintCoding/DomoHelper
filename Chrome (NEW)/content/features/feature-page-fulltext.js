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
  $("td a[data-drill]").each(function () {
    const dataDrill = $(this).attr('data-drill');
    if (dataDrill) {
      const drillData = JSON.parse(dataDrill.replace(/&quot;/g, '"'));
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
  const ctl = ensureModal();
  // Update body textarea value before open (modal preserves Node tree)
  const ta = document.getElementById('dh-fontColorValue');
  if (ta) ta.value = textValue || 'No full text value found';
  ctl.open();
}

function bindHandlers() {
  if (isBound) return;
  isBound = true;

  // Open modal with full text when clicking KPI cell link
  $(document).on("click",
    ".kpi-details .kpi-content .kpiimage table tr td a, .kpi-details .kpicontent .kpiimage table tr td a",
    function (event) {
      if (!settingsState.enabled) return;
      event.preventDefault();

      const dataDrillNone = $(this).attr('data-drill-none');
      let fontColorValue = 'No full text value found';

      if (dataDrillNone) {
        const drillData = JSON.parse(dataDrillNone.replace(/&quot;/g, '"'));
        if (drillData.filters?.length) {
          const values = drillData.filters[0].values;
          if (values?.length) {
            const spanElement = $('<div>').html(values[0]).find('span');
            fontColorValue = spanElement.attr('font-color') || fontColorValue;
          }
        }
      } else {
        fontColorValue = 'No data-drill-none attribute found';
      }

      openFullTextModal(fontColorValue);
    }
  );

  // Watch KPI chart insertions to re-apply transformations
  const observer = new MutationObserver((ml) => {
    ml.forEach(m => {
      m.addedNodes.forEach(node => {
        if (node.nodeType === 1 && (node.matches('.kpi_chart, .kpi_chart *'))) {
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
  init({ DH, settings }) {
    DHref = DH;
    settingsState.enabled = settings.enabled;
    settingsState.removeLinks = settings.removeLinks;

    ensureModal(); // build once
    if (settingsState.removeLinks) removeInvalidLinks();
    if (settingsState.enabled) modifyDataDrillAttributes(); else resetDataDrillAttributes();
    bindHandlers();
  },
  applySettings(newSettings) {
    if (newSettings.enabled !== undefined) settingsState.enabled = !!newSettings.enabled;
    if (newSettings.removeLinks !== undefined) settingsState.removeLinks = !!newSettings.removeLinks;

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
