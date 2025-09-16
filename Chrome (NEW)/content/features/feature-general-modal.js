// content/features/feature-general-modal.js
// Reusable modal factory for Domo Helper features (MV3-friendly, no external deps beyond jQuery if present)

let MODAL_SEQ = 0;
const Z_BASE = 10_000; // high enough to sit over Domo UI
const ACTIVE_STACK = [];

/**
 * createModal(options) -> controller
 *
 * options = {
 *   title: string | Node,
 *   body: string | Node,               // HTML string or Node
 *   wide: boolean,                     // larger dialog width
 *   onOpen: fn(controller),
 *   onClose: fn(reason, controller),   // reason: 'close-btn'|'esc'|'backdrop'|'api'
 *   closeOnEsc: boolean (default true),
 *   closeOnBackdrop: boolean (default true),
 *   buttons: [                         // footer buttons, left-to-right
 *     { id, label, kind:'primary'|'default'|'danger', className, autofocus, onClick: fn(evt, controller) }
 *   ]
 * }
 *
 * controller API:
 * - open()
 * - close(reason='api')
 * - destroy()
 * - setTitle(content)
 * - setBody(content)
 * - setButtons(buttonsArray)
 * - getElement() -> root modal element
 * - on(eventName, handler)            // 'open' | 'close' | 'destroy' | 'button:<id>'
 * - off(eventName, handler)
 * - openAsPromise(primaryId='ok')     // resolves on button:<primaryId>, rejects on close
 */
export default function createModal(options = {}) {
  const id = ++MODAL_SEQ;
  const state = {
    id,
    isOpen: false,
    closeOnEsc: options.closeOnEsc !== false,
    closeOnBackdrop: options.closeOnBackdrop !== false,
    listeners: new Map(), // event -> Set<fn>
  };

  // ---------- DOM ----------
  const $ = window.jQuery || null;

  const root = document.createElement('div');
  root.className = 'modal fade modal-custom';
  root.id = `dh-modal-${id}`;
  root.setAttribute('tabindex', '-1');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-hidden', 'true');

  const dialog = document.createElement('div');
  dialog.className = `modal-dialog ${options.wide ? 'modal-dialog-centered-recipes' : 'modal-dialog-centered'}`;
  dialog.setAttribute('role', 'document');

  const content = document.createElement('div');
  content.className = 'modal-content';

  // Header
  const header = document.createElement('div');
  header.className = 'modal-header';

  const titleEl = document.createElement('h5');
  titleEl.className = 'modal-title';
  setNodeContent(titleEl, options.title ?? '');

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.id = `dh-modal-close-${id}`;
  closeBtn.className = 'db-text-button Modal-module_closeX__UCijY Button-module_button__7BLGt Button-module_default__utLb- Button-module_text__unL1r';
  closeBtn.setAttribute('aria-label', 'Close dialog');
  closeBtn.innerHTML = `
    <span class="Button-module_content__b7-cz">
      <i role="presentation" class="db-icon icon-x md"></i>
    </span>
  `;

  header.appendChild(titleEl);
  header.appendChild(closeBtn);

  // Body
  const body = document.createElement('div');
  body.className = 'modal-body';
  setNodeContent(body, options.body ?? '');

  // Footer
  const footer = document.createElement('div');
  footer.className = 'modal-footer';

  // Footnote (optional class hook)
  const footnote = document.createElement('p');
  footnote.className = 'authorNote footnote';
  footnote.style.display = 'none'; // features can show/use if desired
  footer.appendChild(footnote);

  content.appendChild(header);
  content.appendChild(body);
  content.appendChild(footer);
  dialog.appendChild(content);
  root.appendChild(dialog);

  // Backdrop (owned by this modal instance so we can stack/use z-index)
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-fade';
  backdrop.id = `dh-modal-backdrop-${id}`;
  backdrop.setAttribute('role', 'presentation');

  // ---------- Helpers ----------
  function setNodeContent(target, content) {
    if (content instanceof Node) {
      target.innerHTML = '';
      target.appendChild(content);
    } else if (typeof content === 'string') {
      target.innerHTML = content;
    } else if (content == null) {
      target.innerHTML = '';
    } else {
      target.textContent = String(content);
    }
  }

  function classesForKind(kind) {
    // Use Domo button visual classes while matching your prior code
    const base = 'db-text-button Button-module_button__7BLGt Button-module_raised__IpSHu';
    if (kind === 'primary') return `${base} Button-module_primary__TrzCx`;
    if (kind === 'danger')  return `${base} Button-module_default__utLb-`; // tweak if you have a danger class
    return `${base} Button-module_default__utLb-`;
  }

  function setButtons(buttons = []) {
    // wipe current footer buttons but keep possible footnote
    footer.querySelectorAll('button[data-dh-modal-btn]').forEach(b => b.remove());

    buttons.forEach((btnSpec, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.dhModalBtn = '1';
      btn.id = btnSpec.id || `btn-${id}-${idx}`;
      btn.className = btnSpec.className || classesForKind(btnSpec.kind);
      btn.innerHTML = `<span class="Button-module_content__b7-cz">${btnSpec.label ?? 'OK'}</span>`;
      if (btnSpec.autofocus) btn.autofocus = true;

      btn.addEventListener('click', (evt) => {
        emit(`button:${btn.id}`, evt);
        if (typeof btnSpec.onClick === 'function') btnSpec.onClick(evt, controller);
      });

      // Insert before footnote if footnote is visible
      if (footnote && footnote.parentElement === footer) {
        footer.insertBefore(btn, footnote);
      } else {
        footer.appendChild(btn);
      }
    });
  }

  function pushToStack() {
    ACTIVE_STACK.push(controller);
    const z = Z_BASE + ACTIVE_STACK.length * 10;
    root.style.zIndex = z.toString();
    backdrop.style.zIndex = (z - 1).toString();
  }
  function popFromStack() {
    const i = ACTIVE_STACK.indexOf(controller);
    if (i >= 0) ACTIVE_STACK.splice(i, 1);
  }

  function trapFocus(e) {
    if (!state.isOpen) return;
    if (!root.contains(document.activeElement)) {
      // Focus the first button or close button
      const firstFocusable = root.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      (firstFocusable || closeBtn).focus();
    }
  }

  function onKeydown(e) {
    if (e.key === 'Escape' && state.closeOnEsc && isTopMost()) {
      e.stopPropagation();
      controller.close('esc');
    }
  }

  function onBackdropClick(e) {
    if (!state.closeOnBackdrop || !isTopMost()) return;
    if (e.target === backdrop) controller.close('backdrop');
  }

  function isTopMost() {
    return ACTIVE_STACK.length && ACTIVE_STACK[ACTIVE_STACK.length - 1] === controller;
  }

  function emit(evt, ...args) {
    const set = state.listeners.get(evt);
    if (!set) return;
    set.forEach(fn => {
      try { fn(...args); } catch (err) { console.error('[DH Modal] listener error', err); }
    });
  }

  // ---------- Controller ----------
  const controller = {
    open() {
      if (state.isOpen) return controller;
      document.body.appendChild(root);
      document.body.appendChild(backdrop);

      pushToStack();
      root.style.display = 'block';
      backdrop.style.display = 'block';
      state.isOpen = true;

      // Events
      closeBtn.addEventListener('click', onCloseBtnClick);
      document.addEventListener('keydown', onKeydown, true);
      backdrop.addEventListener('click', onBackdropClick, true);
      setTimeout(() => trapFocus(), 0);

      if (typeof options.onOpen === 'function') options.onOpen(controller);
      emit('open');
      return controller;
    },
    close(reason = 'api') {
      if (!state.isOpen) return controller;
      state.isOpen = false;

      root.style.display = 'none';
      backdrop.style.display = 'none';

      closeBtn.removeEventListener('click', onCloseBtnClick);
      document.removeEventListener('keydown', onKeydown, true);
      backdrop.removeEventListener('click', onBackdropClick, true);

      popFromStack();
      if (typeof options.onClose === 'function') options.onClose(reason, controller);
      emit('close', reason);
      return controller;
    },
    destroy() {
      controller.close('destroy');
      root.remove();
      backdrop.remove();
      emit('destroy');
      state.listeners.clear();
      return null;
    },
    setTitle(content) { setNodeContent(titleEl, content); return controller; },
    setBody(content) { setNodeContent(body, content); return controller; },
    setButtons(buttons) { setButtons(buttons); return controller; },
    setFootnote(text) { if (text == null || text === '') { footnote.style.display='none'; footnote.textContent=''; } else { footnote.style.display='block'; footnote.textContent = text; } return controller; },
    showBackdrop(show = true) { backdrop.style.display = show ? 'block' : 'none'; return controller; },
    getElement() { return root; },
    on(evt, fn) {
      if (!state.listeners.has(evt)) state.listeners.set(evt, new Set());
      state.listeners.get(evt).add(fn);
      return controller;
    },
    off(evt, fn) {
      state.listeners.get(evt)?.delete(fn);
      return controller;
    },
    openAsPromise(primaryId = 'ok') {
      // If no button ids provided, caller should pass the button id that should resolve.
      return new Promise((resolve, reject) => {
        const onPrimary = () => { controller.off('close', onClose); resolve(); };
        const onClose = (reason) => { controller.off(`button:${primaryId}`, onPrimary); reject(new Error(`modal-closed:${reason}`)); };
        controller.on(`button:${primaryId}`, onPrimary);
        controller.on('close', onClose);
        controller.open();
      });
    }
  };

  function onCloseBtnClick() { controller.close('close-btn'); }

  // Initialize buttons
  setButtons(options.buttons || []);

  // Pre-insert into DOM hidden so width/height CSS apply consistently on open()
  root.style.display = 'none';
  backdrop.style.display = 'none';

  return controller;
}

/* ===========================
   Convenience shorthands
   =========================== */

/**
 * quickConfirm({title, message, okLabel, cancelLabel}) -> Promise<boolean>
 * Resolves true on OK, false on cancel/close.
 */
export function quickConfirm({ title = 'Confirm', message = '', okLabel = 'OK', cancelLabel = 'Cancel', wide = false } = {}) {
  const modal = createModal({
    title,
    body: typeof message === 'string' ? `<div>${message}</div>` : message,
    wide,
    buttons: [
      { id: 'cancel', label: cancelLabel, kind: 'default' },
      { id: 'ok', label: okLabel, kind: 'primary', autofocus: true }
    ]
  });
  return new Promise((resolve) => {
    modal.on('button:ok', () => { resolve(true); modal.destroy(); });
    modal.on('button:cancel', () => { resolve(false); modal.destroy(); });
    modal.on('close', () => { resolve(false); modal.destroy(); });
    modal.open();
  });
}

/**
 * quickAlert({title, message, label}) -> Promise<void>
 */
export function quickAlert({ title = 'Alert', message = '', label = 'Close', wide = false } = {}) {
  const modal = createModal({
    title,
    body: typeof message === 'string' ? `<div>${message}</div>` : message,
    wide,
    buttons: [{ id: 'ok', label, kind: 'primary', autofocus: true }]
  });
  return new Promise((resolve) => {
    modal.on('button:ok', () => { resolve(); modal.destroy(); });
    modal.on('close', () => { resolve(); modal.destroy(); });
    modal.open();
  });
}
