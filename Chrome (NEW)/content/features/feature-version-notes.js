// content/features/feature-version-notes.js
// Enforce version notes ONLY on MagicETL /graph and SQL Author /author pages.
// Save / Save and Run / Save as: require description >= minWords.
// Save as: ALSO require a non-empty "Add new DataFlow name" input.
// Includes resilience against Domo toggling the primary button after our logic.

let ctx = { isAuthor: false, isGraph: false };
let settings = { forceVersionNotes: true, minWords: 5 };
let currentToggle = null;

let modalsObserver = null;
let urlObserver = null;
let lastHref = location.href;

// ---------- URL guards ----------
const hostOk = () => /\.domo\.com$/i.test(location.hostname);
const pathQS = () => location.pathname + location.search + location.hash;
const isMagicGraphUrl = () =>
  hostOk() && /\/datacenter\/dataflows\/[^/]+\/graph(?:[?#].*)?$/i.test(pathQS());
const isAuthorUrl = () =>
  hostOk() && /\/datacenter\/dataflows\/(?:new\/author|[^/]+\/author)(?:[?#].*)?/i.test(pathQS());

function computeCtxFromUrl() {
  ctx.isGraph = isMagicGraphUrl();
  ctx.isAuthor = !ctx.isGraph && isAuthorUrl();
}
function isSupportedPage() { return isMagicGraphUrl() || isAuthorUrl(); }

// ---------- utils ----------
const q  = (n, s) => { try { return n.querySelector(s); } catch { return null; } };
const qa = (n, s) => { try { return Array.from(n.querySelectorAll(s)); } catch { return []; } };
const filterVisibleButtons = (btns=[]) => btns.filter(b => b && typeof b.disabled !== 'undefined');
const hasMinimumWordCount = (text, min) => String(text).trim().split(/\s+/).filter(Boolean).length >= min;

// Observe and re-assert disabled state if Domo flips it after our check
function watchButtonDisabled(btn, shouldDisableFn) {
  const obs = new MutationObserver(() => {
    const shouldDisable = shouldDisableFn();
    if (shouldDisable && !btn.disabled) {
      btn.disabled = true;
      btn.setAttribute('disabled', 'true');
    }
  });
  obs.observe(btn, { attributes: true, attributeFilter: ['disabled', 'class', 'aria-disabled'] });
  return obs;
}

// ---------- modal targets ----------
const MODAL_TARGETS = [
  // Magic ETL (React/bits) Save / Save and Run / Save as
  {
    name: 'magic-react:header-anchor',
    match(root) {
      const hdr = q(root, 'header.db-text-display-4');
      if (!hdr) return false;
      const txt = hdr.textContent?.trim()?.toLowerCase() || '';
      return txt === 'save dataflow' || txt === 'save and run dataflow' || txt === 'save as';
    },
    findTextarea(root) {
      return q(root, 'textarea[class*="DfSaveModalContentsWithTriggering_textarea"]')
          || q(root, '.ModalBody-module_container__-GWJa textarea')
          || q(root, 'textarea');
    },
    // Save-as title input (present only for Save as)
    findTitleInput(root) {
      // Try class that appears in dumps, else by placeholder
      return q(root, 'input[class*="DfSaveModalSharedContents_saveAsInput"]')
          || qa(root, 'input[placeholder]').find(i => /add new dataflow name/i.test(i.placeholder));
    },
    findSaveButtons(root) {
      const footer = q(root, 'footer[class*="ModalFooter-module_container"]') || root;
      const btns = qa(footer, 'button');
      const primary = btns.filter(b => /\bButton-module_primary__/.test(b.className) || /primary/i.test(b.className));
      return filterVisibleButtons(primary.length ? primary : btns.slice(-1));
    }
  },
  {
    name: 'magic-react:container-class',
    match(root) { return !!q(root, 'div[class*="Modal-module_modal"][role="dialog"]'); },
    findTextarea(root) {
      return q(root, 'textarea[class*="DfSaveModalContentsWithTriggering_textarea"]') || q(root, 'textarea');
    },
    findTitleInput(root) {
      return q(root, 'input[class*="DfSaveModalSharedContents_saveAsInput"]')
          || qa(root, 'input[placeholder]').find(i => /add new dataflow name/i.test(i.placeholder));
    },
    findSaveButtons(root) {
      const footer = q(root, 'footer[class*="ModalFooter-module_container"]') || root;
      return filterVisibleButtons(qa(footer, 'button'));
    }
  },
  // SQL ETL (Angular) Save / Save & Run / Save & Close (no special save-as title)
  {
    name: 'sql-angular:backdrop',
    match(root) { return root.classList?.contains('df-save-modal') || !!q(root, '.df-save-modal'); },
    findTextarea(root) { return q(root, 'textarea.input') || q(root, 'textarea'); },
    findTitleInput() { return null; }, // SQL Save As not handled here
    findSaveButtons(root) { return filterVisibleButtons(qa(root, '.modal-footer .done.db-button, .modal-footer button')); }
  }
];

function resolveModalRootFromNode(node) {
  if (!(node instanceof Element)) return null;
  let cur = node;
  while (cur && cur !== document.body) {
    if (
      cur.getAttribute?.('role') === 'dialog' ||
      cur.classList?.contains('df-save-modal') ||
      /\bModal-module_modal\b/.test(cur.className) ||
      /\bcentered-container\b/.test(cur.className)
    ) return cur;
    cur = cur.parentElement;
  }
  return null;
}

function buildModalAccessors(modalRoot) {
  for (const target of MODAL_TARGETS) {
    try {
      if (!target.match(modalRoot)) continue;
      const textarea   = target.findTextarea(modalRoot);
      const titleInput = target.findTitleInput?.(modalRoot) || null;
      const saveButtons= target.findSaveButtons(modalRoot);
      return { modalRoot, textarea, titleInput, saveButtons, targetName: target.name };
    } catch { /* noop */ }
  }
  return null;
}

// ---------- core wiring ----------
function wireTextAreaAndButtons({ textarea, titleInput, saveButtons, isSaveAs }) {
  if (!textarea || !saveButtons?.length) return;

  textarea.placeholder = 'Version Description (Required)';
  let msg = textarea.nextElementSibling;
  if (!msg || msg.id !== 'word-count-message') {
    msg = document.createElement('div');
    msg.id = 'word-count-message';
    msg.style.color = 'LightGray';
    textarea.parentNode.insertBefore(msg, textarea.nextSibling);
  }
  msg.textContent = `A minimum of ${settings.minWords} words is required by the Domo Helper Extension.`;

  // Combined rule:
  // - Always require description >= minWords
  // - If Save as modal, ALSO require non-empty title input
  const computeShouldDisable = () => {
    const descOk = hasMinimumWordCount(textarea.value, settings.minWords);
    const titleOk = !isSaveAs ? true : !!(titleInput && titleInput.value.trim().length);
    return !(descOk && titleOk);
  };

  const applyDisabled = () => {
    const shouldDisable = computeShouldDisable();
    saveButtons.forEach(btn => {
      if (shouldDisable) {
        if (!btn.disabled) btn.disabled = true;
        btn.setAttribute('disabled', 'true');
      } else {
        btn.removeAttribute('disabled');
        btn.disabled = false;
      }
    });
  };

  // Debounced input handlers
  if (currentToggle) {
    textarea.removeEventListener('input', currentToggle);
    titleInput?.removeEventListener('input', currentToggle);
  }
  currentToggle = () => applyDisabled();
  textarea.addEventListener('input', currentToggle);
  titleInput?.addEventListener('input', currentToggle);

  // First-run
  applyDisabled();

  // Defend against Domo’s own enabling logic
  const btnObservers = saveButtons.map(btn => watchButtonDisabled(btn, computeShouldDisable));

  // Clean-up hook if modal node disappears
  const mo = new MutationObserver((ml) => {
    const stillInDom = document.body.contains(textarea);
    if (!stillInDom) {
      btnObservers.forEach(o => o.disconnect());
      mo.disconnect();
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });
}

function initOrUpdateFromRoot(modalRoot) {
  if (!settings.forceVersionNotes || !isSupportedPage() || !modalRoot) return;

  const access = buildModalAccessors(modalRoot);
  if (!access) return;

  const { textarea, titleInput, saveButtons, targetName } = access;

  // Identify Save as explicitly (by header text or presence of title input)
  const header = q(modalRoot, 'header.db-text-display-4');
  const headerTxt = header?.textContent?.trim()?.toLowerCase() || '';
  const isSaveAs = headerTxt === 'save as' || !!titleInput;

  // Fallbacks per page type (rare)
  let ta = textarea;
  let sb = saveButtons;
  if (!ta) {
    if (ctx.isAuthor) ta = q(document, 'div.df-save-modal.visible textarea') || q(document, 'textarea');
    else if (ctx.isGraph) ta = q(document, 'textarea[class*="DfSaveModalContentsWithTriggering_textarea"]') || q(document, 'textarea');
  }
  if (!sb?.length) {
    if (ctx.isAuthor) sb = qa(document, '.df-save-modal .modal-footer .done.db-button');
    else if (ctx.isGraph) {
      const footer = modalRoot.querySelector('footer') || modalRoot;
      const all = Array.from(footer.querySelectorAll('button'));
      sb = all.slice(-1);
    }
  }

  if (ta && sb?.length) {
    wireTextAreaAndButtons({ textarea: ta, titleInput, saveButtons: sb, isSaveAs });
  }
}

function initOrUpdateModal() {
  if (!settings.forceVersionNotes || !isSupportedPage()) return;

  const candidates = [
    ...qa(document, 'div[class*="Modal-module_modal"][role="dialog"]'),
    ...qa(document, '.df-save-modal.modal-backdrop.visible .modal')
  ];
  candidates.forEach(root => initOrUpdateFromRoot(root));
}

// ---------- observers ----------
function startModalsObserver() {
  if (modalsObserver) return;
  modalsObserver = new MutationObserver((mutations) => {
    if (!isSupportedPage()) return;
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (!(node instanceof Element)) continue;

        if (
          node.getAttribute?.('role') === 'dialog' ||
          node.classList?.contains('df-save-modal') ||
          /\bModal-module_modal\b/.test(node.className) ||
          /\bcentered-container\b/.test(node.className)
        ) {
          setTimeout(() => initOrUpdateFromRoot(node), 80);
          continue;
        }
        const root = resolveModalRootFromNode(node);
        if (root) setTimeout(() => initOrUpdateFromRoot(root), 80);
      }
    }
  });
  modalsObserver.observe(document.body, { childList: true, subtree: true });

  // Hook from Magic Recipes feature (React path)
  document.addEventListener('dh:etlSaveModalDetected', () => setTimeout(initOrUpdateModal, 80));
}
function stopModalsObserver() {
  if (modalsObserver) { modalsObserver.disconnect(); modalsObserver = null; }
  document.removeEventListener('dh:etlSaveModalDetected', () => setTimeout(initOrUpdateModal, 80));
}

// Observe URL changes in SPA and toggle observers accordingly
function startUrlObserver() {
  if (urlObserver) return;
  urlObserver = new MutationObserver(() => {
    const hrefNow = location.href;
    if (hrefNow === lastHref) return;
    lastHref = hrefNow;

    const wasSupported = ctx.isAuthor || ctx.isGraph;
    computeCtxFromUrl();

    if (isSupportedPage()) {
      if (!wasSupported) startModalsObserver();
      setTimeout(initOrUpdateModal, 80);
    } else {
      stopModalsObserver();
    }
  });
  urlObserver.observe(document.body, { childList: true, subtree: true });
}
function stopUrlObserver() {
  if (urlObserver) { urlObserver.disconnect(); urlObserver = null; }
}

// ---------- public API ----------
export default {
  init({ isAuthor, isGraph, settings: initSettings } = {}) {
    if (initSettings) {
      if (initSettings.forceVersionNotes !== undefined) settings.forceVersionNotes = !!initSettings.forceVersionNotes;
      if (initSettings.minWords !== undefined) settings.minWords = parseInt(initSettings.minWords, 10) || settings.minWords;
    }
    computeCtxFromUrl();
    if (!ctx.isAuthor && !ctx.isGraph) { ctx.isAuthor = !!isAuthor; ctx.isGraph = !!isGraph; }

    if (isSupportedPage()) {
      startModalsObserver();
      setTimeout(initOrUpdateModal, 80);
    }
    startUrlObserver();
  },

  applySettings(newSettings = {}) {
    if (newSettings.forceVersionNotes !== undefined) settings.forceVersionNotes = !!newSettings.forceVersionNotes;
    if (newSettings.minWords !== undefined) settings.minWords = parseInt(newSettings.minWords, 10) || settings.minWords;
    if (isSupportedPage()) initOrUpdateModal();
  },

  cleanup() {
    stopModalsObserver();
    stopUrlObserver();
    currentToggle = null;
  }
};
