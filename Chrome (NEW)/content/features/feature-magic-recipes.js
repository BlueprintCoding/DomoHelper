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
    try {
      if (!window.__domoHelperContextValid) return;
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
    } catch (error) {
      // Silently ignore errors from stale listeners
    }
  };


  // DELETE ONE
  deleteOneHandler = async (e) => {
    try {
      if (!window.__domoHelperContextValid) return;
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
    } catch (error) {
      // Silently ignore errors from stale listeners
    }
  };

  // DELETE ALL
  deleteAllHandler = async (e) => {
    try {
      if (!window.__domoHelperContextValid) return;
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
    } catch (error) {
      // Silently ignore errors from stale listeners
    }
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
   Listen for manual copy button clicks (sidebar and context menu)
----------------------------------*/
let copyButtonListener = null;

function bindCopyButtonListener() {
  // Always unbind first to ensure fresh listener on re-initialization
  unbindCopyButtonListener();
  
  copyButtonListener = (e) => {
    try {
      // Check for both sidebar copy button and context menu copy button
      const copyBtn = e.target.closest('[data-testid="COPY_SIDEBAR"]') || 
                      e.target.closest('[data-testid="COPY_CONTEXT_MENU"]');
      if (!copyBtn) return;
      
      console.log('[Magic Recipes] Copy button clicked by user');
      
      // CRITICAL: Validate extension context BEFORE any chrome API call
      // This prevents "Extension context invalidated" errors from old instances
      if (!window.__domoHelperContextValid) {
        console.log('[Magic Recipes] Extension context invalid for this page instance, ignoring');
        return;
      }
      
      // Check chrome object existence
      if (typeof chrome === 'undefined' || !chrome || !chrome.runtime) {
        console.log('[Magic Recipes] Chrome API not available');
        return;
      }
      
      // Safe sendMessage with error suppression
      const promise = chrome.runtime.sendMessage({ action: 'magicRecipeCopyDetected' });
      
      // Attach catch handler to prevent unhandled promise rejection
      if (promise && typeof promise.catch === 'function') {
        promise.catch((err) => {
          // Silently ignore - extension context invalidation is normal
        });
      }
    } catch (error) {
      // Silently consume any errors - stale listeners from old contexts are harmless
    }
  };
  
  document.addEventListener('click', copyButtonListener, true);
  console.log('[Magic Recipes] Copy button listener bound');
}

function unbindCopyButtonListener() {
  if (!copyButtonListener) return;
  document.removeEventListener('click', copyButtonListener, true);
  copyButtonListener = null;
  console.log('[Magic Recipes] Copy button listener unbound');
}

/* --------------------------------
   Bridge from graph-menu
----------------------------------*/
function bindSaveRecipeTrigger() {
  // Always unbind first to ensure fresh listener on re-initialization
  if (onSaveReq) {
    document.removeEventListener('dh:request-save-recipe', onSaveReq);
    onSaveReq = null;
  }
  
  onSaveReq = (e) => {
    try {
      if (!window.__domoHelperContextValid) return;
      const jsonData = e.detail?.jsonData;
      if (jsonData) {
        saveMagicETLRecipe(jsonData);
      }
    } catch (error) {
      // Silently ignore errors from stale listeners
    }
  };
  document.addEventListener('dh:request-save-recipe', onSaveReq);
  console.log('[Magic Recipes] Save recipe trigger bound');
}
function unbindSaveRecipeTrigger() {
  if (!onSaveReq) return;
  document.removeEventListener('dh:request-save-recipe', onSaveReq);
  onSaveReq = null;
}

// ---- OPEN trigger (replaces jQuery .on/#openMagicETLRecipes) ----
function bindOpenListModalOnce() {
    // Always unbind first to ensure fresh listener on re-initialization
    if (openMenuHandler) {
      document.removeEventListener('click', openMenuHandler, true);
      openMenuHandler = null;
    }
  
    openMenuHandler = (e) => {
        try {
          if (!window.__domoHelperContextValid) return;
          const hit = e.target && e.target.closest && e.target.closest('#openMagicETLRecipes');
          if (!hit) return;
        
          // Stop other handlers first
          e.stopPropagation();
          if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
        
          // If we're in the middle of an insert/paste, ignore any open attempts
          if (isSuppressed()) return;
        
          const now = Date.now();
          if (now - openClickDebounceAt < 300) return;
          openClickDebounceAt = now;
        
          ensureListModal().open();
        } catch (error) {
          // Silently ignore errors from stale listeners
        }
      };
      
  
    // Capture phase so we pre-empt bubble-phase jQuery handlers
    document.addEventListener('click', openMenuHandler, true);
    console.log('[Magic Recipes] Open menu handler bound');
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
      
      // Mark this execution context as valid for our listeners
      window.__domoHelperContextValid = true;
      
      // Subscribe to context updates from background.js
      if (window.subscribeToContextUpdates) {
        window.subscribeToContextUpdates((context) => {
          const isMagicETL = ['DATAFLOW', 'MAGIC_ETL', 'DATAFLOW_TYPE'].includes(context?.domoObject?.typeId);
          if (!isMagicETL) {
            console.log('[Magic Recipes] Non-ETL context detected, disabling feature');
          } else {
            console.log('[Magic Recipes] ETL context detected, feature active');
          }
        });
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
      // Mark context as invalid to prevent stale listeners from firing
      window.__domoHelperContextValid = false;
      
      if (saveModalCtl) { saveModalCtl.destroy(); saveModalCtl = null; }
      if (listModalCtl) { listModalCtl.destroy(); listModalCtl = null; }
      document.getElementById('DH-Magic-Recipe-cont')?.remove();
  
      unbindCopyButtonListener();
      unbindSaveRecipeTrigger();
      unbindListModalDelegates();
      unbindOpenListModal();
      
      // Clear the copyDetected flag from storage when cleaning up
      chrome.storage.session.remove('copyDetected', () => {
        console.log('[Magic Recipes] Cleared copyDetected flag during cleanup');
      });
      
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
     * Generate a UUID v4
     */
    generateUUID() {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
      }
      // Fallback for older browsers
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    },

    /**
     * Wrap recipe nodes in a section
     */
    wrapNodesInSection(recipeData, recipeTitle) {
      if (!recipeData || !recipeData.data) return recipeData;
      
      const sectionId = this.generateUUID();
      const data = recipeData.data;
      
      // Initialize arrays if they don't exist
      if (!data.sections) {
        data.sections = [];
      }
      if (!data.nodes) {
        data.nodes = [];
      }
      
      // Find all tile nodes to calculate bounding box
      const tileNodes = data.nodes.filter(n => n.type === 'Tile');
      
      if (tileNodes.length === 0) {
        console.log('[Magic Recipes] No tiles found, skipping section wrap');
        return recipeData;
      }
      
      // Calculate bounding box of all tiles in absolute coordinates
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      
      tileNodes.forEach(node => {
        const nodeX = node.x || 0;
        const nodeY = node.y || 0;
        const nodeWidth = 96; // Standard tile width
        const nodeHeight = 96; // Standard tile height
        
        minX = Math.min(minX, nodeX);
        maxX = Math.max(maxX, nodeX + nodeWidth);
        minY = Math.min(minY, nodeY);
        maxY = Math.max(maxY, nodeY + nodeHeight);
      });
      
      // Add padding around the bounding box
      const padding = 50;
      const sectionX = Math.max(0, minX - padding);
      const sectionY = Math.max(0, minY - padding);
      const sectionWidth = (maxX - minX) + (padding * 2);
      const sectionHeight = (maxY - minY) + (padding * 2);
      
      // Create section node for the nodes array
      const sectionNode = {
        id: sectionId,
        type: 'Section',
        x: sectionX,
        y: sectionY,
        width: sectionWidth,
        height: sectionHeight
      };
      
      // Create section definition for sections array
      const sectionDef = {
        id: sectionId,
        name: `✨MER: ${recipeTitle}`,
        type: 'Section',
        backgroundColor: 'rgba(57, 255, 20, 0.5)',
        x: sectionX,
        y: sectionY,
        width: sectionWidth,
        height: sectionHeight
      };
      
      // Add section node to nodes array
      data.nodes.push(sectionNode);
      
      // Add section definition to sections array
      data.sections.push(sectionDef);
      
      // NOW adjust all tile nodes to be relative to the section
      // Their positions need to be recalculated as offsets from the section's origin
      tileNodes.forEach(node => {
        // Convert absolute coordinates to relative (section-local) coordinates
        node.x = (node.x || 0) - sectionX;
        node.y = (node.y || 0) - sectionY;
        node.parentId = sectionId;
        
        // Update gui if it exists
        if (node.gui) {
          const guiX = node.gui.x || 0;
          const guiY = node.gui.y || 0;
          node.gui.x = guiX - sectionX;
          node.gui.y = guiY - sectionY;
          node.gui.parentId = sectionId;
        }
      });
      
      console.log('[Magic Recipes] Wrapped nodes in section:', recipeTitle, 'with ID:', sectionId, 'section bounds:', {x: sectionX, y: sectionY, width: sectionWidth, height: sectionHeight});
      return recipeData;
    },

    /**
     * Get all existing nodes on the canvas from DOM
     */
    getExistingNodesFromDOM() {
      const nodes = [];
      try {
        // Find all react-flow nodes on the canvas
        const nodeElements = document.querySelectorAll('[class*="react-flow__node"]');
        
        nodeElements.forEach(el => {
          // Extract position from transform style
          const transform = el.style.transform;
          const match = transform.match(/translate\(([\d.-]+)px,\s*([\d.-]+)px\)/);
          
          if (match) {
            const x = parseFloat(match[1]);
            const y = parseFloat(match[2]);
            const id = el.getAttribute('data-id');
            
            nodes.push({
              id,
              x: x,
              y: y,
              width: el.offsetWidth || 96,
              height: el.offsetHeight || 96
            });
          }
        });
      } catch (err) {
        console.warn('[Magic Recipes] Error reading existing nodes from DOM:', err);
      }
      
      console.log('[Magic Recipes] Found', nodes.length, 'existing nodes on canvas');
      return nodes;
    },

    /**
     * Get the current viewport center and bounds from the canvas container
     */
    getViewportCenter() {
      try {
        const container = document.querySelector('[class^="DfScroller_container_"]');
        if (!container) {
          console.warn('[Magic Recipes] Could not find scroll container for viewport calc');
          return null;
        }
        
        // Get viewport dimensions
        const viewportWidth = container.clientWidth;
        const viewportHeight = container.clientHeight;
        
        // Get scroll position
        const scrollLeft = container.scrollLeft;
        const scrollTop = container.scrollTop;
        
        // Calculate center point in canvas coordinates
        const centerX = scrollLeft + (viewportWidth / 2);
        const centerY = scrollTop + (viewportHeight / 2);
        
        return {
          centerX,
          centerY,
          viewportWidth,
          viewportHeight,
          scrollLeft,
          scrollTop
        };
      } catch (err) {
        console.warn('[Magic Recipes] Error getting viewport center:', err);
        return null;
      }
    },

    /**
     * Check if a rectangle overlaps with any existing nodes
     */
    doesRectOverlap(x, y, width, height, existingNodes) {
      const padding = 50;
      
      return existingNodes.some(node => {
        const nodeLeft = node.x;
        const nodeRight = node.x + node.width;
        const nodeTop = node.y;
        const nodeBottom = node.y + node.height;
        
        const rectLeft = x - padding;
        const rectRight = x + width + padding;
        const rectTop = y - padding;
        const rectBottom = y + height + padding;
        
        // Check for overlap
        return !(rectRight < nodeLeft || rectLeft > nodeRight || 
                 rectBottom < nodeTop || rectTop > nodeBottom);
      });
    },

    /**
     * Calculate best position for new section near viewport center, avoiding overlaps
     */
    calculateNonOverlappingPosition(sectionWidth, sectionHeight, existingNodes) {
      const viewport = this.getViewportCenter();
      
      if (!viewport) {
        // Fallback if we can't get viewport
        return { x: 1200, y: 1100 };
      }
      
      // Try to center the section at the viewport center
      let bestX = viewport.centerX - (sectionWidth / 2);
      let bestY = viewport.centerY - (sectionHeight / 2);
      
      // If no overlaps, use the centered position
      if (!this.doesRectOverlap(bestX, bestY, sectionWidth, sectionHeight, existingNodes)) {
        console.log('[Magic Recipes] Using viewport-centered position:', {x: bestX, y: bestY});
        return { x: bestX, y: bestY };
      }
      
      // If there's overlap, spiral outward to find the nearest empty spot
      const step = 100;
      let distance = step;
      let maxDistance = 1000; // Max spiral distance
      let minDistance = Infinity;
      let candidatePos = { x: bestX, y: bestY };
      
      while (distance <= maxDistance) {
        // Try 8 directions: up, down, left, right, and 4 diagonals
        const directions = [
          { offsetX: 0, offsetY: -distance },  // up
          { offsetX: 0, offsetY: distance },   // down
          { offsetX: -distance, offsetY: 0 },  // left
          { offsetX: distance, offsetY: 0 },   // right
          { offsetX: -distance, offsetY: -distance },  // up-left
          { offsetX: distance, offsetY: -distance },   // up-right
          { offsetX: -distance, offsetY: distance },   // down-left
          { offsetX: distance, offsetY: distance }     // down-right
        ];
        
        for (const dir of directions) {
          const testX = bestX + dir.offsetX;
          const testY = bestY + dir.offsetY;
          
          if (!this.doesRectOverlap(testX, testY, sectionWidth, sectionHeight, existingNodes)) {
            // Found an empty spot - calculate how far it is from viewport center
            const distToCenter = Math.sqrt(
              Math.pow(testX + sectionWidth/2 - viewport.centerX, 2) +
              Math.pow(testY + sectionHeight/2 - viewport.centerY, 2)
            );
            
            // Keep track of the nearest valid position
            if (distToCenter < minDistance) {
              minDistance = distToCenter;
              candidatePos = { x: testX, y: testY };
            }
          }
        }
        
        // If we found a position in this ring, use the closest one
        if (minDistance < Infinity && minDistance <= distance + step) {
          console.log('[Magic Recipes] Found non-overlapping position at distance:', minDistance, 'pos:', candidatePos);
          return candidatePos;
        }
        
        distance += step;
      }
      
      // Fallback: place far away
      console.log('[Magic Recipes] Could not find nearby empty space, falling back to far position');
      return { x: viewport.centerX + 500, y: viewport.centerY + 500 };
    },

    /**

    /**
     * Insert recipe data directly (from side panel)
     */
    insertRecipeData(jsonData, recipeTitle) {
      if (!jsonData) {
        console.warn('No recipe data provided to insertRecipeData');
        DHref?.showNotification?.('No recipe data provided', '#ed3737');
        return false;
      }
      
      try {
        let recipeData = JSON.parse(JSON.stringify(jsonData));
        
        // Wrap nodes in a section with the recipe title
        if (recipeTitle) {
          recipeData = this.wrapNodesInSection(recipeData, recipeTitle);
        }
        
        // Get existing nodes on canvas and adjust position to avoid overlap
        const existingNodes = this.getExistingNodesFromDOM();
        
        // Find the section we just created
        const sectionNode = recipeData.data?.nodes?.find(n => n.type === 'Section');
        if (sectionNode && existingNodes.length > 0) {
          // Calculate a non-overlapping position
          const newPos = this.calculateNonOverlappingPosition(
            sectionNode.width,
            sectionNode.height,
            existingNodes
          );
          
          // Apply offset to section position ONLY
          // Nodes are already in section-relative coordinates, so don't move them
          sectionNode.x = newPos.x;
          sectionNode.y = newPos.y;
          
          // Update section definition
          const sectionDef = recipeData.data?.sections?.find(s => s.id === sectionNode.id);
          if (sectionDef) {
            sectionDef.x = newPos.x;
            sectionDef.y = newPos.y;
          }
          
          console.log('[Magic Recipes] Repositioned section to:', {x: newPos.x, y: newPos.y}, 'to avoid overlap');
        }
        
        // Update first action name if it exists (legacy behavior)
        if (recipeData.data?.actions?.length && recipeData.data.actions[0]?.name) {
          recipeData.data.actions[0].name += ' - DH-Panel';
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

              console.log(`Found ${rects.length} new nodes, centering on section...`);

              // Find the section element (it will have ✨MER: in its title when rendered)
              let sectionElement = null;
              let sectionRect = null;
              
              // Wait for section to render - look for it by the ✨MER: prefix
              const sectionNameElements = Array.from(document.querySelectorAll('[class*="DfSection"]'));
              for (const el of sectionNameElements) {
                const textContent = el.textContent || '';
                if (textContent.includes('✨MER:')) {
                  sectionElement = el.closest('[class*="react-flow__node"]');
                  if (sectionElement) {
                    sectionRect = sectionElement.getBoundingClientRect();
                    if (sectionRect.width > 0 && sectionRect.height > 0) {
                      console.log('Found section element:', sectionElement);
                      break;
                    }
                  }
                }
              }
              
              // Use section bounds if found, otherwise fall back to node rects
              const boundsToCenter = sectionRect ? [sectionRect] : rects;
              
              // Calculate center point
              const bbox = boundsToCenter.reduce((b, r) => ({
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

              // Scroll to center section
              console.log('Scrolling to center section at:', {bboxCx, bboxCy});
              container.scrollLeft += (bboxCx - viewCx);
              container.scrollTop  += (bboxCy - viewCy);

              // Click on the section to select it
              if (sectionElement) {
                console.log('Selecting section');
                sectionElement.click();
              } else {
                // Fallback: click on first new node
                const newTile = Array.from(document.querySelectorAll('[class^="DfNode_actionName_"]'))
                  .find(el => el.textContent.includes(' - DH-Panel'));
                if (newTile) {
                  console.log('Clicking on new tile:', newTile.textContent);
                  newTile.click();
                }
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