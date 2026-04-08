// content/features/feature-graph-menu.js
let menuAdded = false;
let teardownFns = [];

const qs  = (sel, root=document) => root.querySelector(sel);
const qsa = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const visible = el => !!(el && el.offsetParent !== null);

let currentSidebar = null;
let bodyObserver = null;
let sidebarObserver = null;
let rafId = 0;

/* ---------------- basic helpers ---------------- */
function getSidebar() { return qs('[data-testid="sidebar"]'); }

function isMultiSelect(sb) {
  // treat as multi-select only if the action buttons are visible
  return ['COPY_SIDEBAR','DELETE_SIDEBAR','DUPLICATE_SIDEBAR']
    .some(t => visible(qs(`[data-testid="${t}"]`, sb)));
}
function isLibrary(sb) {
  return !!qs('[data-testid="SIDEBAR_DEFINITION"]', sb);
}

/* ---------------- Domo Helper (library) section ---------------- */
function addSection(sb) {
  if (menuAdded || !sb) return;
  if (!isLibrary(sb) || isMultiSelect(sb)) return;

  if (qs('[data-testid="domo helper"]', sb)) { menuAdded = true; return; }

  const cats = qsa(':scope > div[data-testid]:not([data-testid="domo helper"])', sb)
    .filter(el => qs('[data-testid="CATEGORY_NAME"]', el));
  const last = cats[cats.length - 1];
  if (!last) return;

  const helper = last.cloneNode(true);
  helper.setAttribute('data-testid', 'domo helper');

  (qs('[data-testid="CATEGORY_NAME"]', helper)
    || qs('[class^="DfCategorySlideOut_title_"] span', helper)
  ).textContent = 'Domo Helper';

  const titleContainer    = qs('[class^="DfCategorySlideOut_titleContainer_"]', helper);
  const arrow             = qs('[class^="DfCategorySlideOut_arrow_"]', helper);
  const childrenContainer = qs('[class^="DfCategorySlideOut_childrenContainer_"]', helper);
  const catContainer      = qs('[class^="DfCategories_categoryContainer_"]', helper);
  if (catContainer) catContainer.innerHTML = '';

  // Clone the first sidebar item to use as a template for perfect structure matching
  const sampleItem = qs('[data-testid="SIDEBAR_DEFINITION"]', sb);
  if (sampleItem) {
    const clonedItem = sampleItem.cloneNode(true);
    
    // Update the cloned item's internal elements
    const nodeDiv = clonedItem.querySelector('[class^="DfNode_node_"]');
    if (nodeDiv) nodeDiv.setAttribute('data-testid', 'MagicETLRecipes');
    
    const icon = clonedItem.querySelector('i[class*="db-icon"]');
    if (icon) {
      // Replace the icon class while preserving all other classes
      const classes = Array.from(icon.classList);
      const newClasses = classes
        .filter(c => !c.startsWith('icon-'))
        .join(' ');
      icon.className = newClasses + ' icon-magic';
    }
    
    const label = clonedItem.querySelector('[class*="DfNode_actionName_"]');
    if (label) {
      const span = label.querySelector('span');
      if (span) span.textContent = 'Magic ETL Recipes';
    }
    
    // Update the aria-describedby to match our tooltip
    const describer = clonedItem.querySelector('[aria-describedby]');
    if (describer) describer.setAttribute('aria-describedby', 'useUniqueIdMagicETLRecipes');
    
    // Add the title attribute for native tooltip
    const container = clonedItem.querySelector('[aria-describedby]');
    if (container) container.setAttribute('title', 'View and insert Magic ETL Recipes.');
    
    // Set the ID for our click handler
    const openBtn = clonedItem.querySelector('[class^="DfSidebarNode_container_"]');
    if (openBtn) openBtn.id = 'openMagicETLRecipes';
    
    // Wrap it in the proper container
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-testid', 'domo-helper-menu');
    wrapper.appendChild(clonedItem);
    
    catContainer?.appendChild(wrapper);
  }

  // collapse initially
  const someChildren = qs('[class^="DfCategorySlideOut_childrenContainer_"]', sb);
  const expandedClass = someChildren && Array.from(someChildren.classList).find(c => c.startsWith('DfCategorySlideOut_expanded_'));
  const someArrow = qs('[class^="DfCategorySlideOut_arrow_"]', sb);
  const arrowOpenClass   = someArrow && Array.from(someArrow.classList).find(c => c.includes('arrowOpen'));
  const arrowClosedClass = someArrow && Array.from(someArrow.classList).find(c => c.includes('arrowClosed'));
  const setState = (expanded) => {
    if (expandedClass) childrenContainer.classList.toggle(expandedClass, expanded);
    if (arrow) {
      if (arrowOpenClass)   arrow.classList.toggle(arrowOpenClass, expanded);
      if (arrowClosedClass) arrow.classList.toggle(arrowClosedClass, !expanded);
      if (!arrowOpenClass && !arrowClosedClass) arrow.style.transform = expanded ? 'rotate(90deg)' : '';
    }
  };
  setState(false);

  const toggle = (e) => {
    e.stopPropagation?.();
    const isExpanded = expandedClass
      ? childrenContainer.classList.contains(expandedClass)
      : arrow?.classList.contains(arrowOpenClass);
    setState(!isExpanded);
  };
  titleContainer?.addEventListener('click', toggle);
  arrow?.addEventListener('click', toggle);
  teardownFns.push(() => titleContainer?.removeEventListener('click', toggle));
  teardownFns.push(() => arrow?.removeEventListener('click', toggle));

  sb.appendChild(helper);
  menuAdded = true;
}

function removeSection() {
  qs('[data-testid="domo helper"]')?.remove();
  qs('[data-testid="domo-helper-menu"]')?.remove();
  teardownFns.forEach(fn => { try { fn(); } catch {} });
  teardownFns = [];
  menuAdded = false;
}

/* ---------------- Multi-select: inject Save button ---------------- */
function getMSOClasses(sb) {
  // sample from any existing button
  const cont  = qs('[class^="DfMultipleSelectedOperations_multiSelectButtonContainer_"]', sb);
  const btn   = cont?.querySelector('button');
  const span  = btn?.querySelector('span');
  const icon  = btn?.querySelector('i[class*="DfMultipleSelectedOperations_icon_"]');
  const label = btn?.querySelector('[class^="DfMultipleSelectedOperations_buttonLabel_"]');

  // Extract ALL Button-module classes from the existing button
  const buttonModuleClasses = Array.from(btn?.classList || [])
    .filter(c => c.startsWith('Button-module_'))
    .join(' ');

  return {
    containerCls: cont?.classList[0] || 'DfMultipleSelectedOperations_multiSelectButtonContainer_X',
    buttonCls:    Array.from(btn?.classList || []).find(c => c.startsWith('DfMultipleSelectedOperations_multiSelectButton_')) || 'DfMultipleSelectedOperations_multiSelectButton_X',
    buttonModuleClasses: buttonModuleClasses,
    contentCls:   Array.from(span?.classList || []).find(c => c.startsWith('DfMultipleSelectedOperations_content_')) || 'DfMultipleSelectedOperations_content_X',
    iconCls:      Array.from(icon?.classList || []).find(c => c.startsWith('DfMultipleSelectedOperations_icon_')) || 'DfMultipleSelectedOperations_icon_X',
    labelCls:     label?.classList[0] || 'DfMultipleSelectedOperations_buttonLabel_X',
  };
}

function ensureSaveButton(sb) {
  const host = qs('[class^="DfMultipleSelectedOperations_multiSelectContainer_"]', sb);
  if (!host) return;

  if (qs('#DH-Magic-Recipe-cont', host)) return; // already there

  // Find the first button container to use as a template
  const firstButtonContainer = qs('[class^="DfMultipleSelectedOperations_multiSelectButtonContainer_"]', host);
  if (!firstButtonContainer) return;

  // Clone the entire first button container
  const wrapper = firstButtonContainer.cloneNode(true);
  wrapper.id = 'DH-Magic-Recipe-cont';

  // Update the button inside the cloned container
  const button = wrapper.querySelector('button');
  if (button) {
    button.id = 'DH-Magic-Recipe-btn';
    button.removeAttribute('data-testid');

    // Update the icon
    const icon = button.querySelector('i');
    if (icon) {
      icon.className = icon.className.replace(/icon-\S+/, 'icon-magic');
    }

    // Update the label text
    const label = button.querySelector('[class*="DfMultipleSelectedOperations_buttonLabel_"]');
    if (label) {
      label.textContent = 'Save Magic ETL Recipe';
    }
  }

  // Find the Copy button container and insert after it
  const copyBtn = qs('[data-testid="COPY_SIDEBAR"]', host);
  const copyContainer = copyBtn?.closest('[class^="DfMultipleSelectedOperations_multiSelectButtonContainer_"]');
  if (copyContainer) {
    copyContainer.insertAdjacentElement('afterend', wrapper);
  } else {
    host.appendChild(wrapper);
  }

  // on click: ask recipes module to perform the save flow (pass the real Copy button)
  button.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('dh:request-save-recipe', {
      detail: { copyButton: copyBtn }
    }));
  });
}

function removeSaveButton(sb) {
  qs('#DH-Magic-Recipe-cont', sb || document)?.remove();
}

/* ---------------- Context menu: inject Save option ---------------- */
function getCtxClasses(ul) {
  const anyBtn = ul.querySelector('button[data-menu-item-button="true"]');
  const inner  = anyBtn?.querySelector('div'); // the listItem div
  const icon   = inner?.querySelector('i[class*="DfContextMenu_icon_"]') || anyBtn?.querySelector('i[class*="DfContextMenu_icon_"]');

  return {
    btnBase:  Array.from(anyBtn?.classList || []).find(c => c.startsWith('MenuItem-module_button_'))   || 'MenuItem-module_button_X',
    btnStyle: Array.from(anyBtn?.classList || []).find(c => c.startsWith('MenuItem-module_default_'))  || 'MenuItem-module_default_X',
    liDiv:    Array.from(inner?.classList || []).find(c => c.startsWith('MenuItem-module_listItem_'))  || 'MenuItem-module_listItem_X',
    liCont:   Array.from(inner?.classList || []).find(c => c.startsWith('ListItem-module_container_')) || 'ListItem-module_container_X',
    iconCls:  Array.from(icon?.classList || []).find(c => c.startsWith('DfContextMenu_icon_'))         || 'DfContextMenu_icon_X',
  };
}

function ensureContextSaveInMenu(ul) {
  if (!ul || ul.querySelector('#DH-ctx-save-recipe')) return;

  const copyBtn = ul.querySelector('[data-testid="COPY_CONTEXT_MENU"]');
  if (!copyBtn) return;

  const classes = getCtxClasses(ul);

  const li = document.createElement('li');
  li.innerHTML = `
    <button id="DH-ctx-save-recipe"
            class="${classes.btnBase} ${classes.btnStyle}"
            data-menu-item-button="true" type="button">
      <div class="${classes.liDiv} ${classes.liCont} db-text-body">
        <i class="db-icon icon-magic md ${classes.iconCls}" role="presentation"></i>
        Save Magic ETL Recipe
      </div>
    </button>
  `;

  // insert right after "Copy to Clipboard"
  const copyLi = copyBtn.closest('li');
  (copyLi || ul.lastElementChild)?.insertAdjacentElement('afterend', li);

  li.querySelector('#DH-ctx-save-recipe')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    document.dispatchEvent(new CustomEvent('dh:request-save-recipe', {
      detail: { copyButton: copyBtn }
    }));
    // Let the menu auto-close by default click behavior
  });
}

function ensureContextSaveInAllMenus() {
  // Right-click context menus live in an AnchoredPortal with a known data-class for Menu
  const activeUls = qsa('[data-class="Menu-module_menu__-Dayv"] ul[data-current-menu="true"]');
  activeUls.forEach(ensureContextSaveInMenu);
}

/* ---------------- sync + observers ---------------- */
function scheduleSync() {
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(sync);
}

function sync() {
  const sb = getSidebar();

  // sidebar swapped/removed
  if (!sb) {
    if (currentSidebar) {
      currentSidebar = null;
      sidebarObserver?.disconnect();
      removeSection();
      removeSaveButton();
    }
    // still handle context menus even if sidebar gone
    ensureContextSaveInAllMenus();
    return;
  }
  if (sb !== currentSidebar) {
    currentSidebar = sb;
    menuAdded = false;
    removeSection();
    removeSaveButton();
    sidebarObserver?.disconnect();
    sidebarObserver = new MutationObserver(scheduleSync);
    sidebarObserver.observe(sb, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
  }

  // library section vs multi-select toolbar
  if (isLibrary(sb) && !isMultiSelect(sb)) {
    if (!menuAdded) addSection(sb);
    removeSaveButton(sb);
  } else if (isMultiSelect(sb)) {
    removeSection();
    // Save button removed - use side panel save instead
    removeSaveButton(sb);
  } else {
    removeSection();
    removeSaveButton(sb);
  }

  // always check context menus on each sync
  // Context menu save option removed - use side panel save instead
  // ensureContextSaveInAllMenus();
}

/* ---------------- lifecycle ---------------- */
export default {
  init({ PageDetector } = {}) {
    // Optional: Verify we're on the correct page type
    if (PageDetector && !PageDetector.isMagicETL()) {
      console.warn('[Graph Menu] Warning: Feature initialized on non-Magic-ETL page');
    }
    
    bodyObserver = new MutationObserver(scheduleSync);
    bodyObserver.observe(document.body, { childList: true, subtree: true });
    scheduleSync();
  },
  cleanup() {
    bodyObserver?.disconnect();
    sidebarObserver?.disconnect();
    currentSidebar = null;
    removeSection();
    removeSaveButton();
    // context menu items are ephemeral; nothing persistent to clean
  }
};
