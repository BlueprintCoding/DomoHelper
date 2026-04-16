/**
 * Main detection function that runs in page context
 * This is a self-contained function that must be injected via chrome.scripting.executeScript
 * It has NO external dependencies and returns serializable data only
 * @returns {Object|null} Plain object with typeId, id, baseUrl, url properties
 */
export async function detectCurrentObject() {
  const url = location.href.toLowerCase();
  const baseUrl = `${location.protocol}//${location.hostname}`;

  if (!location.hostname.includes('domo.com')) {
    return null;
  }

  // --- HELPER FUNCTIONS (must be inline for injection) ---

  // Detect if a card detail modal is open
  function detectCardModal() {
    const modalElement = document.querySelector('[id^="card-details-modal-"]');
    if (modalElement && modalElement.id) {
      const match = modalElement.id.match(/card-details-modal-(\d+)/);
      if (match && match[1]) {
        return match[1];
      }
    }
    return null;
  }

  // Extract ID from URL using pattern matching
  function extractIdFromUrl(keyword, offset = 1) {
    const parts = url.split(/[/?=&]/);
    const index = parts.indexOf(keyword);
    return index !== -1 ? parts[index + offset] || null : null;
  }

  // --- TYPE DETECTION SWITCH ---

  let typeId = null;
  let objectId = null;
  let parentId = null;

  // Switch through all known Domo pages
  switch (true) {
    // ADMIN PAGES
    case url.includes('/admin/'):
      typeId = 'ADMIN';
      // Try to extract admin section ID
      objectId = extractIdFromUrl('admin', 1) || 'admin';
      break;

    // PAGES & APP STUDIO
    case url.includes('page/') || url.includes('pages/'):
      // Check for card modal first (takes precedence)
      objectId = detectCardModal();
      if (objectId) {
        typeId = 'CARD';
      } else if (url.includes('/page/') && url.includes('/kpis/details/')) {
        // View Card page (card detail view on dashboard)
        typeId = 'CARD';
        objectId = extractIdFromUrl('kpis', 2) || extractIdFromUrl('details', 1) || 'card';
      } else if (url.includes('app-studio')) {
        // Determine if it's a Data App or Worksheet
        try {
          const appId = extractIdFromUrl('app-studio', 1);
          const response = await fetch(`/api/content/v1/dataapps/${appId}`);
          if (response.ok) {
            const data = await response.json();
            typeId = data.type === 'worksheet' ? 'WORKSHEET_VIEW' : 'DATA_APP_VIEW';
            parentId = appId;
            objectId = extractIdFromUrl('pages', 1);
          } else {
            typeId = 'DATA_APP_VIEW';
            parentId = appId;
            objectId = extractIdFromUrl('pages', 1);
          }
        } catch (e) {
          typeId = 'DATA_APP_VIEW';
          parentId = extractIdFromUrl('app-studio', 1);
          objectId = extractIdFromUrl('pages', 1);
        }
      } else {
        typeId = 'PAGE';
        objectId = extractIdFromUrl('page', 1);
      }
      break;

    // CARDS (additional card detection patterns)
    case url.includes('kpis/details/'):
      // Check for drill view breadcrumb first
      try {
        const bcSpan = document.querySelector('ul.breadcrumb li:last-child span[id]');
        const bcId = bcSpan && (bcSpan.id || bcSpan.getAttribute('id'));
        if (bcId && bcId.indexOf(':') > -1) {
          const partsColon = bcId.split(':');
          const dpIdRaw = partsColon[1];
          const dpId = dpIdRaw && (dpIdRaw.match(/\d+/) || [])[0];
          if (dpId) {
            typeId = 'DRILL_VIEW';
            objectId = dpId;
            break;
          }
        }
      } catch (e) {
        // Fall back
      }
      // Default to CARD
      typeId = 'CARD';
      objectId = extractIdFromUrl('kpis', 2) || 'card';
      break;

    case url.includes('cardid='):
      typeId = 'CARD';
      objectId = extractIdFromUrl('cardid', 1);
      break;

    case url.includes('domoapp/card/edit/'):
      typeId = 'CARD';
      objectId = extractIdFromUrl('edit', 1);
      break;

    // DATA SOURCES & DATAFLOWS
    case url.includes('datacenter/datasources'):
      // Datacenter datasources listing
      typeId = 'DATA_SOURCE';
      objectId = extractIdFromUrl('datasources', 1) || 'datasources';
      break;

    case url.includes('datasources/'):
      // Check if it's a dataset view vs a datasource
      if (url.includes('/view/') || url.includes('/details/')) {
        typeId = 'DATA_VIEW';
        objectId = extractIdFromUrl('datasources', 1);
      } else if (extractIdFromUrl('datasources', 1)?.length > 5) {
        typeId = 'DATA_SOURCE';
        objectId = extractIdFromUrl('datasources', 1);
      } else {
        // Generic datasource listing
        typeId = 'DATA_SOURCE';
        objectId = 'datasources';
      }
      break;

    case url.includes('datacenter/dataflows') && !url.includes('datacenter/dataflows/'):
      // Datacenter dataflows listing page
      typeId = 'DATAFLOW_TYPE';
      objectId = 'dataflows';
      break;

    // SQL AUTHOR (distinguish from Magic ETL) - CHECK BEFORE general datacenter/dataflows
    case url.includes('datacenter/dataflows/') && url.includes('/author'):
      typeId = 'SQL_AUTHOR';
      objectId = extractIdFromUrl('dataflows', 1) || 'sql-author';
      break;

    case url.includes('datacenter/dataflows/'):
      // Need to determine if it's Magic ETL or MySQL/other SQL dataflow
      try {
        // Check for Magic ETL v2 indicator in page
        const dfLabel = document.querySelector('[data-ui-test-dataflow-type-label]');
        if (dfLabel && dfLabel.textContent.includes('Magic ETL')) {
          typeId = 'MAGIC_ETL';
        } else if (dfLabel && dfLabel.textContent.includes('MySQL')) {
          typeId = 'MYSQL_DATAFLOW';
        } else if (dfLabel && dfLabel.textContent.includes('SQL')) {
          typeId = 'SQL_DATAFLOW';
        } else if (url.includes('/graph')) {
          // Magic ETL graph canvas
          typeId = 'MAGIC_ETL';
        } else {
          // Default to DATAFLOW_TYPE for other cases
          typeId = 'DATAFLOW_TYPE';
        }
        objectId = extractIdFromUrl('dataflows', 1);
      } catch (e) {
        typeId = 'DATAFLOW_TYPE';
        objectId = extractIdFromUrl('dataflows', 1);
      }
      break;

    case url.includes('/dataflows/'):
      typeId = 'DATAFLOW_TYPE';
      objectId = extractIdFromUrl('dataflows', 1);
      break;

    // USERS
    case url.includes('people/'):
      typeId = 'USER';
      break;

    case url.includes('/up/'):
      typeId = 'USER';
      objectId = extractIdFromUrl('up', 1);
      break;

    // GROUPS
    case url.includes('groups/'):
      typeId = 'GROUP';
      objectId = extractIdFromUrl('groups', 1);
      break;

    // WORKFLOWS
    case url.includes('workflows/user-task-response') && url.includes('id='):
      typeId = 'WORKFLOW';
      objectId = extractIdFromUrl('id', 1);
      break;

    case url.includes('workflows/instances/'):
      typeId = 'WORKFLOW';
      objectId = extractIdFromUrl('instances', 3);
      break;

    case url.includes('workflows/triggers/'):
      // Detect trigger modal
      try {
        const triggerModal = document.querySelector('[role="dialog"][class*="TimerModal"]');
        if (triggerModal) {
          const fiberKey = Object.keys(triggerModal).find((k) =>
            k.startsWith('__reactFiber')
          );
          let triggerId = null;
          if (fiberKey) {
            let fiber = triggerModal[fiberKey];
            for (let i = 0; i < 15 && fiber; i++) {
              if (fiber.memoizedProps?.triggerId) {
                triggerId = fiber.memoizedProps.triggerId;
                break;
              }
              fiber = fiber.return;
            }
          }
          if (triggerId) {
            return {
              baseUrl,
              id: triggerId,
              parentId: extractIdFromUrl('triggers', 1),
              typeId: 'WORKFLOW',
              url
            };
          }
        }
      } catch (e) {
        // Fall back
      }
      typeId = 'WORKFLOW';
      objectId = extractIdFromUrl('triggers', 1);
      break;

    case url.includes('workflows/'):
      typeId = 'WORKFLOW';
      objectId = extractIdFromUrl('workflows', 1);
      break;

    // APP STORE
    case url.includes('appstore/'):
      typeId = 'DATA_APP_VIEW';
      objectId = extractIdFromUrl('appstore', 1);
      break;

    // ALERTS
    case url.includes('alerts/'):
      typeId = 'ALERT';
      objectId = extractIdFromUrl('alerts', 1);
      break;

    // ROLES
    case url.includes('admin/roles/'):
      typeId = 'ADMIN';
      objectId = extractIdFromUrl('roles', 1);
      break;

    // BEAST MODE
    case url.includes('beastmode?'):
      typeId = 'BEAST_MODE_FORMULA';
      break;

    // DRILL VIEWS
    case url.includes('drillviewid='):
      typeId = 'DRILL_VIEW';
      objectId = extractIdFromUrl('drillviewid', 1);
      break;

    // ANALYZER (detect what's being analyzed)
    case url.includes('/analyzer'):
      // Analyzer pages are their own context type
      typeId = 'ANALYZER';
      const pageId = extractIdFromUrl('pageid', 1);
      objectId = pageId || 'analyzer-' + Date.now();
      break;

    default:
      typeId = 'UNKNOWN';
  }

  // Don't return for unknown or partial detections
  if (!typeId || typeId === 'UNKNOWN' || !objectId) {
    return null;
  }

  // Build the response
  const result = {
    baseUrl,
    id: objectId,
    typeId,
    url
  };

  // Add parent ID if detected
  if (parentId) {
    result.parentId = parentId;
  }

  return result;
}
