// content/features/feature-magic-recipes.js
// Uses the generalized modal utility for Save and View/Insert flows.

import createModal, { quickConfirm, quickAlert } from './feature-general-modal.js';

let DHref = null;

// Modal controllers
let saveModalCtl = null;
let listModalCtl = null;

let openMenuHandler = null;     
let openClickDebounceAt = 0; 

// delegation bindings
let delegatesBound = false;
let insertHandler = null;
let deleteOneHandler = null;
let deleteAllHandler = null;

// cross-feature trigger binding
let onSaveReq = null;

// flag (used in init/cleanup)
let isRecipesUIBound = false;
let insertingRecipeNow = false;
let suppressOpenUntil = 0;


/* --------------------------------
   SAVE MODAL
----------------------------------*/

function ensureSaveModal() {
  if (saveModalCtl) return saveModalCtl;

  const bodyHtml = `
    <label for="dh-recipeTitle">Title:</label>
    <input type="text" id="dh-recipeTitle" class="Textarea-module_textarea__Etl2x" style="width:100%;margin-bottom:8px;">
    <label for="dh-recipeDescription">Description:</label>
    <textarea id="dh-recipeDescription" class="Textarea-module_textarea__Etl2x" style="width:100%;min-height:60px;margin-bottom:8px;"></textarea>
    <label for="dh-recipePreview">Recipe Preview:</label>
    <textarea readonly id="dh-recipePreview" class="Textarea-module_textarea__Etl2x" style="width:100%;min-height:180px;"></textarea>
    <p class="authorNote footnote">Magic ETL Recipes added by Domo Helper Browser Extension.</p>
  `;

  saveModalCtl = createModal({
    title: 'Save Magic ETL Recipe',
    body: bodyHtml,
    wide: false,
    buttons: [
      { id: 'close', label: 'Close', kind: 'default' },
      { id: 'save',  label: 'Save',  kind: 'primary', autofocus: true }
    ],
    onClose: () => {
      const t = document.getElementById('dh-recipeTitle');
      const d = document.getElementById('dh-recipeDescription');
      const p = document.getElementById('dh-recipePreview');
      if (t) t.value = '';
      if (d) d.value = '';
      if (p) p.value = '';
      navigator.clipboard.writeText('').catch(() => {});
    }
  });

  saveModalCtl.on('button:close', () => saveModalCtl.close());
  saveModalCtl.on('button:save', () => {
    const title = document.getElementById('dh-recipeTitle')?.value.trim() || '';
    const description = document.getElementById('dh-recipeDescription')?.value.trim() || '';
    const preview = document.getElementById('dh-recipePreview')?.value || '';

    if (!title || !description || !preview) {
      DHref?.showNotification?.('Please provide a title and description', '#ed3737');
      return;
    }

    let jsonData = null;
    try {
      jsonData = JSON.parse(preview);
    } catch {
      DHref?.showNotification?.('Preview is not valid JSON', '#ed3737');
      return;
    }

    const recipeData = { title, description, recipe: jsonData, timestamp: new Date().toISOString() };

    chrome.storage.local.get(['MagicETLRecipes'], function (result) {
      const recipes = result.MagicETLRecipes || {};
      recipes[title] = recipeData;
      chrome.storage.local.set({ MagicETLRecipes: recipes }, function () {
        if (chrome.runtime.lastError) {
          console.error('Error saving:', chrome.runtime.lastError);
          DHref?.showNotification?.('Error saving recipe', '#ed3737');
        } else {
          console.log('Magic ETL Recipe saved successfully!', recipes);
          DHref?.showNotification?.('Magic ETL Recipe saved successfully!', '#4CAF50');
          saveModalCtl.close();
        }
      });
    });
  });

  return saveModalCtl;
}

/* ---------- save handler ---------- */
async function saveMagicETLRecipe(copyButton) {
    // Trigger Domo "Copy to Clipboard"
    if (copyButton?.click) copyButton.click();
  
    // Helper to read clipboard with one retry
    const readClipboardJSON = async () => {
      try {
        const text = await navigator.clipboard.readText();
        return JSON.parse(text);
      } catch {
        // brief retry – first invocation can race the copy
        await new Promise(r => setTimeout(r, 250));
        const text2 = await navigator.clipboard.readText();
        return JSON.parse(text2);
      }
    };
  
    // Give Domo a moment to populate clipboard
    setTimeout(async () => {
      try {
        let jsonData = await readClipboardJSON();
  
        // Strip data.data.*.data
        const clearDataValues = (obj) => {
          if (Array.isArray(obj)) obj.forEach(clearDataValues);
          else if (obj && typeof obj === 'object') {
            for (const k in obj) {
              if (k === 'data' && Array.isArray(obj[k])) {
                obj[k].forEach(sub => { if (sub?.hasOwnProperty('data')) delete sub.data; });
              } else if (typeof obj[k] === 'object') clearDataValues(obj[k]);
            }
          }
        };
        clearDataValues(jsonData);
  
        // OPEN FIRST, then fill
        const ctl = ensureSaveModal();
        ctl.open();
  
        const previewTA = ctl.getElement().querySelector('#dh-recipePreview');
        if (previewTA) previewTA.value = JSON.stringify(jsonData, null, 2);
  
      } catch (err) {
        console.error('Failed to read clipboard contents: ', err);
        DHref?.showNotification?.('Failed to read clipboard', '#ed3737');
      }
    }, 1000);
  }
  

/* --------------------------------
   LIST / INSERT MODAL
----------------------------------*/

// (optional) share guard across multiple injected instances
function setSuppress(ms = 1200) {
    const now = Date.now();
    suppressOpenUntil = now + ms;
    try {
      window.__DH_SUPPRESS_OPEN_UNTIL__ =
        Math.max(window.__DH_SUPPRESS_OPEN_UNTIL__ || 0, suppressOpenUntil);
    } catch {}
  }
  function isSuppressed() {
    const now = Date.now();
    const globalUntil = (window.__DH_SUPPRESS_OPEN_UNTIL__ || 0);
    return insertingRecipeNow || now < suppressOpenUntil || now < globalUntil;
  }


function ensureListModal() {
    if (listModalCtl) return listModalCtl;
  
    const bodyHtml = `
      <p class="modal-title-desc">When you click insert, Domo Helper will attempt to scroll to the newly added tiles.</p>
      <div class="modal-body-scrollable" id="dh-recipesList" style="max-height:50vh;overflow:auto;"></div>
      <p class="authorNote footnote">Magic ETL Recipes created by Domo Helper Browser Extension.</p>
    `;
  
    listModalCtl = createModal({
      title: 'Magic ETL Recipes',
      body: bodyHtml,
      wide: true,
      buttons: [
        { id: 'close', label: 'Close', kind: 'primary', autofocus: true }
      ]
    });
  
    listModalCtl.on('button:close', () => listModalCtl.close());
    listModalCtl.on('open', populateRecipeList);
  
    // Tag the DOM node so other instances can detect it if needed
    try { listModalCtl.getElement().setAttribute('data-dh-modal', 'recipes-list'); } catch {}
  
    return listModalCtl;
  }


function populateRecipeList() {
  const list = document.getElementById('dh-recipesList');
  if (!list) return;

  list.innerHTML = '';

  chrome.storage.local.get(['MagicETLRecipes'], function (result) {
    const recipes = result.MagicETLRecipes || {};
    const sorted = Object.values(recipes).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    sorted.forEach(recipe => {
      const item = document.createElement('div');
      item.className = 'recipe-item';
      item.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;';
      item.dataset.title = recipe.title;

      item.innerHTML = `
        <div style="display:flex;align-items:center;">
          <button class="db-text-button Button-module_button__7BLGt Button-module_primary__TrzCx Button-module_raised__IpSHu dh-insert-recipe" data-title="${recipe.title}">Insert</button>
          <div style="margin-left:10px;">
            <h5 style="margin:0;">${recipe.title}</h5>
            <p style="margin:0;">${recipe.description}</p>
          </div>
        </div>
        <div>
          <button class="db-text-button Button-module_button__7BLGt Button-module_default__utLb- Button-module_raised__IpSHu dh-delete-recipe" data-title="${recipe.title}">Delete</button>
        </div>
      `;
      list.appendChild(item);
    });

    if (!list.querySelector('.dh-delete-all-row')) {
      const row = document.createElement('div');
      row.className = 'dh-delete-all-row';
      row.style.cssText = 'display:flex;justify-content:flex-end;margin-top:20px;';
      row.innerHTML = `
        <button class="db-text-button Button-module_button__7BLGt Button-module_default__utLb- Button-module_raised__IpSHu dh-delete-all-recipes">Delete All Recipes</button>
      `;
      list.appendChild(row);
    }
  });
}

// Delegates (bind once)
function wireListModalDelegates() {
  if (delegatesBound) return;
  delegatesBound = true;

  // INSERT
  insertHandler = async (e) => {
    const btn = e.target.closest('.dh-insert-recipe');
    if (!btn) return;

    const title = btn.getAttribute('data-title');
    chrome.storage.local.get(['MagicETLRecipes'], async function (result) {
        const recipes = result.MagicETLRecipes || {};
        const recipeData = recipes[title];
        if (!recipeData?.recipe) return;

        let jsonData = JSON.parse(JSON.stringify(recipeData.recipe));
        if (jsonData.data?.length && jsonData.data[0].name) jsonData.data[0].name += ' - AB-DH';
        const recipeJSON = JSON.stringify(jsonData, null, 2);

        try {
        await navigator.clipboard.writeText(recipeJSON);

        // --- begin guard window ---
        insertingRecipeNow = true;
        setSuppress(1400); // block re-open for a moment

        listModalCtl?.close();

        setTimeout(() => {
            document.execCommand('paste');

            // Center on newly-added nodes (unchanged)
            const host = document.querySelector('#innerCanvas') || document.body;
            const observer2 = new MutationObserver((mutations) => {
            const container = document.querySelector('[class^="DfScroller_container_"]');
            if (!container) return;

            const rects = [];
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                if (!(node instanceof Element)) continue;
                const addedNodes = node.matches('.react-flow__node')
                    ? [node]
                    : Array.from(node.querySelectorAll('.react-flow__node'));
                for (const n of addedNodes) {
                    const r = n.getBoundingClientRect();
                    if (r.width > 0 && r.height > 0) rects.push(r);
                }
                }
            }
            if (!rects.length) return;

            const bbox = rects.reduce((b, r) => ({
                left:   Math.min(b.left,   r.left),
                top:    Math.min(b.top,    r.top),
                right:  Math.max(b.right,  r.right),
                bottom: Math.max(b.bottom, r.bottom),
            }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });

            const cRect = container.getBoundingClientRect();
            const bboxCx = (bbox.left + bbox.right) / 2;
            const bboxCy = (bbox.top  + bbox.bottom) / 2;
            const viewCx = (cRect.left + cRect.right) / 2;
            const viewCy = (cRect.top  + cRect.bottom) / 2;

            container.scrollLeft += (bboxCx - viewCx);
            container.scrollTop  += (bboxCy - viewCy);

            const ab = Array.from(document.querySelectorAll('[class^="DfNode_actionName_"]'))
                .find(el => el.textContent.includes(' - AB-DH'));
            const nameEl = ab || document.querySelector('[class^="DfNode_actionName_"]');
            nameEl?.click();

            observer2.disconnect();

            // release guard right after we’re done centering/focusing
            insertingRecipeNow = false;
            // (let suppressOpenUntil naturally expire)
            });

            observer2.observe(host, { childList: true, subtree: true });
        }, 50);

        } catch (err) {
        insertingRecipeNow = false; // make sure we drop the guard on error
        console.error('Could not copy text: ', err);
        DHref?.showNotification?.('Failed to copy recipe JSON', '#ed3737');
        }
    });
    };


  // DELETE ONE
  deleteOneHandler = async (e) => {
    const btn = e.target.closest('.dh-delete-recipe');
    if (!btn) return;

    const title = btn.getAttribute('data-title');
    const ok = await quickConfirm({
      title: 'Delete recipe?',
      message: `Delete "${title}" permanently?`,
      okLabel: 'Delete',
      cancelLabel: 'Cancel'
    });
    if (!ok) return;

    chrome.storage.local.get(['MagicETLRecipes'], function (result) {
      const recipes = result.MagicETLRecipes || {};
      delete recipes[title];
      chrome.storage.local.set({ MagicETLRecipes: recipes }, function () {
        if (chrome.runtime.lastError) {
          console.error('Error deleting:', chrome.runtime.lastError);
          DHref?.showNotification?.('Error deleting recipe', '#ed3737');
        } else {
          const row = document.querySelector(`.recipe-item[data-title="${CSS.escape(title)}"]`);
          row?.remove();
        }
      });
    });
  };

  // DELETE ALL
  deleteAllHandler = async (e) => {
    const btn = e.target.closest('.dh-delete-all-recipes');
    if (!btn) return;

    const ok = await quickConfirm({
      title: 'Delete all recipes?',
      message: 'This action is permanent.',
      okLabel: 'Delete All',
      cancelLabel: 'Cancel'
    });
    if (!ok) return;

    chrome.storage.local.set({ MagicETLRecipes: {} }, function () {
      if (chrome.runtime.lastError) {
        console.error('Error deleting all:', chrome.runtime.lastError);
        DHref?.showNotification?.('Error deleting all recipes', '#ed3737');
      } else {
        const list = document.getElementById('dh-recipesList');
        if (list) list.innerHTML = '';
      }
    });
  };

  document.addEventListener('click', insertHandler);
  document.addEventListener('click', deleteOneHandler);
  document.addEventListener('click', deleteAllHandler);
}

function unbindListModalDelegates() {
  if (!delegatesBound) return;
  document.removeEventListener('click', insertHandler);
  document.removeEventListener('click', deleteOneHandler);
  document.removeEventListener('click', deleteAllHandler);
  insertHandler = deleteOneHandler = deleteAllHandler = null;
  delegatesBound = false;
}

/* --------------------------------
   Bridge from graph-menu
----------------------------------*/
function bindSaveRecipeTrigger() {
  if (onSaveReq) return; // already bound
  onSaveReq = (e) => {
    const btn = e.detail?.copyButton || document.querySelector('[data-testid="COPY_SIDEBAR"]');
    saveMagicETLRecipe(btn);
  };
  document.addEventListener('dh:request-save-recipe', onSaveReq);
}
function unbindSaveRecipeTrigger() {
  if (!onSaveReq) return;
  document.removeEventListener('dh:request-save-recipe', onSaveReq);
  onSaveReq = null;
}

// ---- OPEN trigger (replaces jQuery .on/#openMagicETLRecipes) ----
function bindOpenListModalOnce() {
    if (openMenuHandler) return;
  
    openMenuHandler = (e) => {
        const hit = e.target && e.target.closest && e.target.closest('#openMagicETLRecipes');
        if (!hit) return;
      
        // Stop other handlers first
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      
        // If we’re in the middle of an insert/paste, ignore any open attempts
        if (isSuppressed()) return;
      
        const now = Date.now();
        if (now - openClickDebounceAt < 300) return;
        openClickDebounceAt = now;
      
        ensureListModal().open();
      };
      
  
    // Capture phase so we pre-empt bubble-phase jQuery handlers
    document.addEventListener('click', openMenuHandler, true);
  }
  
  function unbindOpenListModal() {
    if (!openMenuHandler) return;
    document.removeEventListener('click', openMenuHandler, true);
    openMenuHandler = null;
  }

/* --------------------------------
   PUBLIC API
----------------------------------*/

export default {
    init({ DH }) {
      DHref = DH;
  
      ensureSaveModal();
      ensureListModal();
  
      // bind once
      bindSaveRecipeTrigger();
      wireListModalDelegates();
      bindOpenListModalOnce();     
  
      isRecipesUIBound = true;
    },
  
    cleanup() {
      if (saveModalCtl) { saveModalCtl.destroy(); saveModalCtl = null; }
      if (listModalCtl) { listModalCtl.destroy(); listModalCtl = null; }
      document.getElementById('DH-Magic-Recipe-cont')?.remove();
  
      unbindSaveRecipeTrigger();
      unbindListModalDelegates();
      unbindOpenListModal();         
      isRecipesUIBound = false;
    }
  };