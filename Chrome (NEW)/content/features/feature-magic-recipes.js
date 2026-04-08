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

/* ---------- helper: read clipboard as JSON (via page context) ---------- */
async function readClipboardJSON() {
  // Use page context to read clipboard (better permissions)
  const text = await window.readClipboardViaPageContext();
  return JSON.parse(text);
}

/* ---------- helper: read clipboard using execCommand (avoids Clipboard API security) ---------- */
async function readClipboardViaExecCommand() {
  console.log('[Magic Recipes] Reading clipboard via execCommand...');
  
  // Create a temporary input element
  const input = document.createElement('input');
  input.style.position = 'fixed';
  input.style.left = '-9999px';
  input.style.top = '-9999px';
  document.body.appendChild(input);
  
  try {
    // Focus the input
    input.focus();
    
    // Use execCommand to paste clipboard content
    const success = document.execCommand('paste');
    console.log('[Magic Recipes] execCommand paste success:', success);
    
    if (!success) {
      throw new Error('execCommand("paste") returned false');
    }
    
    // Get the pasted content
    const clipboardData = input.value;
    console.log('[Magic Recipes] Clipboard data retrieved via execCommand');
    
    return clipboardData;
  } finally {
    // Clean up the temporary input
    document.body.removeChild(input);
  }
}

/* ---------- save handler ---------- */
async function saveMagicETLRecipe(jsonData) {
    console.log('[Magic Recipes] Save triggered with data');
    
    try {
      if (!jsonData) {
        console.error('[Magic Recipes] No JSON data provided!');
        DHref?.showNotification?.('No recipe data available', '#ed3737');
        return;
      }

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
      
      // NOTE: Modal save disabled - side panel form is now primary UI
      // The side panel handles recipe creation through the form
      DHref?.showNotification?.('Recipe saved via side panel.', '#4CAF50');
    } catch (err) {
      console.error('[Magic Recipes] Failed to save recipe: ', err);
      DHref?.showNotification?.('Failed to save recipe. ' + err.message, '#ed3737');
    }
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
   Listen for manual copy button clicks
----------------------------------*/
let copyButtonListener = null;

function bindCopyButtonListener() {
  if (copyButtonListener) return; // already bound
  
  copyButtonListener = async (e) => {
    const copyBtn = e.target.closest('[data-testid="COPY_SIDEBAR"]');
    if (!copyBtn) return;
    
    console.log('[Magic Recipes] Copy button clicked by user');
    
    // Send message to background script to signal copy detection
    // (content scripts can't directly access chrome.storage)
    console.log('[Magic Recipes] Sending magicRecipeCopyDetected message to background...');
    chrome.runtime.sendMessage({ action: 'magicRecipeCopyDetected' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[Magic Recipes] Error sending message to background:', chrome.runtime.lastError);
      } else {
        console.log('[Magic Recipes] Message sent successfully, response:', response);
      }
    });
  };
  
  document.addEventListener('click', copyButtonListener, true);
}

function unbindCopyButtonListener() {
  if (!copyButtonListener) return;
  document.removeEventListener('click', copyButtonListener, true);
  copyButtonListener = null;
}

/* --------------------------------
   Bridge from graph-menu
----------------------------------*/
function bindSaveRecipeTrigger() {
  if (onSaveReq) return; // already bound
  onSaveReq = (e) => {
    const jsonData = e.detail?.jsonData;
    if (jsonData) {
      saveMagicETLRecipe(jsonData);
    }
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
    init({ DH, PageDetector }) {
      DHref = DH;
      
      // Optional: Verify we're on the correct page type
      if (PageDetector && !PageDetector.isMagicETL()) {
        console.warn('[Magic Recipes] Warning: Feature initialized on non-Magic-ETL page');
      }
  
      ensureSaveModal();
      ensureListModal();
  
      // bind once
      bindCopyButtonListener();          // Listen for manual copy button clicks
      bindSaveRecipeTrigger();
      wireListModalDelegates();
      bindOpenListModalOnce();
      
      // Listen for messages from side panel
      chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.action === 'READ_RECIPE_CLIPBOARD') {
          console.log('[Magic Recipes] Reading clipboard for side panel...');
          const input = document.createElement('input');
          input.style.position = 'fixed';
          input.style.left = '-9999px';
          input.style.top = '-9999px';
          document.body.appendChild(input);
          
          try {
            input.focus();
            const success = document.execCommand('paste');
            
            if (!success) {
              sendResponse({ success: false, error: 'execCommand paste failed' });
              return;
            }
            
            const clipboardData = input.value;
            if (!clipboardData) {
              sendResponse({ success: false, error: 'clipboard empty' });
              return;
            }
            
            // Validate it's JSON
            try {
              JSON.parse(clipboardData);
              sendResponse({ success: true, clipboardData: clipboardData });
            } catch (err) {
              sendResponse({ success: false, error: 'invalid JSON' });
            }
          } catch (err) {
            sendResponse({ success: false, error: err.message });
          } finally {
            document.body.removeChild(input);
          }
          return true; // keep channel open
        }
      });
  
      isRecipesUIBound = true;
    },
  
    cleanup() {
      if (saveModalCtl) { saveModalCtl.destroy(); saveModalCtl = null; }
      if (listModalCtl) { listModalCtl.destroy(); listModalCtl = null; }
      document.getElementById('DH-Magic-Recipe-cont')?.remove();
  
      unbindCopyButtonListener();
      unbindSaveRecipeTrigger();
      unbindListModalDelegates();
      unbindOpenListModal();         
      isRecipesUIBound = false;
    },

    /**
     * Trigger save recipe from side panel
     */
    triggerSaveRecipe() {
      // Read clipboard data using execCommand
      const input = document.createElement('input');
      input.style.position = 'fixed';
      input.style.left = '-9999px';
      input.style.top = '-9999px';
      document.body.appendChild(input);
      
      try {
        input.focus();
        const success = document.execCommand('paste');
        
        if (!success) {
          DHref?.showNotification?.('Could not read clipboard. Make sure you clicked Copy on the canvas first.', '#ff9800');
          return false;
        }
        
        const clipboardData = input.value;
        
        if (!clipboardData) {
          DHref?.showNotification?.('Clipboard is empty. Please copy tiles first (click Copy to Clipboard on the canvas)', '#ff9800');
          return false;
        }
        
        try {
          let jsonData = JSON.parse(clipboardData);
          console.log('Got clipboard data via execCommand, opening save modal...');
          saveMagicETLRecipe(jsonData);
          return true;
        } catch (err) {
          console.error('Error parsing clipboard data:', err);
          DHref?.showNotification?.('Clipboard does not contain valid recipe data.', '#ed3737');
          return false;
        }
      } catch (err) {
        console.error('Error reading clipboard:', err);
        DHref?.showNotification?.('Error reading clipboard.', '#ed3737');
        return false;
      } finally {
        document.body.removeChild(input);
      }
    },

    /**
     * Insert recipe data directly (from side panel)
     */
    insertRecipeData(jsonData) {
      if (!jsonData) {
        console.warn('No recipe data provided to insertRecipeData');
        DHref?.showNotification?.('No recipe data provided', '#ed3737');
        return false;
      }
      
      try {
        let recipeData = JSON.parse(JSON.stringify(jsonData));
        if (recipeData.data?.length && recipeData.data[0].name) {
          recipeData.data[0].name += ' - DH-Panel';
        }
        const recipeJSON = JSON.stringify(recipeData, null, 2);

        // Set guards immediately
        insertingRecipeNow = true;
        setSuppress(1400);

        navigator.clipboard.writeText(recipeJSON).then(() => {
          console.log('Recipe copied to clipboard, executing paste...');
          
          // Delay paste to ensure canvas is ready
          setTimeout(() => {
            document.execCommand('paste');
            console.log('Paste command executed');

            // Center on newly-added nodes
            const host = document.querySelector('#innerCanvas') || document.body;
            const observer = new MutationObserver((mutations) => {
              console.log('DOM mutations detected, looking for new nodes...');
              
              const container = document.querySelector('[class^="DfScroller_container_"]');
              if (!container) {
                console.warn('Could not find scroll container');
                insertingRecipeNow = false;
                return;
              }

              const rects = [];
              for (const m of mutations) {
                for (const node of m.addedNodes) {
                  if (!(node instanceof Element)) continue;
                  const addedNodes = node.matches('.react-flow__node')
                    ? [node]
                    : Array.from(node.querySelectorAll('.react-flow__node'));
                  for (const n of addedNodes) {
                    const r = n.getBoundingClientRect();
                    if (r.width > 0 && r.height > 0) {
                      rects.push(r);
                      console.log('Found new node:', n);
                    }
                  }
                }
              }
              
              if (!rects.length) {
                console.log('No new nodes found yet, continuing to observe...');
                return;
              }

              console.log(`Found ${rects.length} new nodes, centering...`);

              // Calculate center point of all new nodes
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

              // Scroll to center new nodes
              container.scrollLeft += (bboxCx - viewCx);
              container.scrollTop  += (bboxCy - viewCy);

              // Focus on the newly added tile
              const newTile = Array.from(document.querySelectorAll('[class^="DfNode_actionName_"]'))
                .find(el => el.textContent.includes(' - DH-Panel'));
              const nameEl = newTile || document.querySelector('[class^="DfNode_actionName_"]');
              if (nameEl) {
                console.log('Clicking on new tile:', nameEl.textContent);
                nameEl.click();
              }

              observer.disconnect();
              insertingRecipeNow = false;
              console.log('Recipe insertion complete!');
              DHref?.showNotification?.('Recipe inserted successfully!', '#4CAF50');
            });

            observer.observe(host, { childList: true, subtree: true });
          }, 50);
        }).catch(err => {
          insertingRecipeNow = false;
          console.error('Failed to copy recipe to clipboard:', err);
          DHref?.showNotification?.('Failed to copy recipe to clipboard. Make sure the page has focus.', '#ed3737');
        });
        
        return true;
      } catch (err) {
        insertingRecipeNow = false;
        console.error('Error preparing recipe data:', err);
        DHref?.showNotification?.('Error preparing recipe data', '#ed3737');
        return false;
      }
    }
  };