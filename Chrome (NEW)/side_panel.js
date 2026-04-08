/**
 * Side Panel Script - Migrated from Popup
 * 
 * All functionality from the popup has been migrated to the side panel.
 * This provides a persistent settings and tools interface with context-aware features.
 */

document.addEventListener('DOMContentLoaded', function() {
    // Tab switching functionality
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            const tabName = this.getAttribute('data-tab');
            
            // Remove active class from all buttons and contents
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            // Add active class to clicked button and corresponding content
            this.classList.add('active');
            document.getElementById(tabName).classList.add('active');
        });
    });

    // Initialize context-aware features
    initializeContextFeatures();

    // Track active tab for search context awareness
    let currentTabId = null;
    let currentDataflowId = null;
    
    /**
     * Monitor active tab changes to detect dataflow changes
     */
    function updateActiveTabContext() {
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (tabs.length === 0) return;
            
            const tab = tabs[0];
            const url = tab.url || '';
            
            // Extract dataflow ID from URL (e.g., /dataflows/516)
            const flowMatch = url.match(/\/dataflows\/(\d+)/);
            const dataflowId = flowMatch ? flowMatch[1] : null;
            
            // Check if we've switched to a different dataflow
            if (dataflowId && dataflowId !== currentDataflowId) {
                console.log(`[Side Panel] Dataflow changed from ${currentDataflowId} to ${dataflowId}`);
                currentDataflowId = dataflowId;
                
                // Clear search results and errors when switching flows
                clearColumnSearchUI();
            }
            
            currentTabId = tab.id;
        });
    }
    
    /**
     * Clear column search UI when switching flows
     */
    function clearColumnSearchUI() {
        const searchStatus = document.getElementById('searchStatus');
        const searchResultsSection = document.getElementById('searchResultsSection');
        const searchInput = document.getElementById('columnSearchInput');
        const searchBtn = document.getElementById('columnSearchBtn');
        
        if (searchStatus) searchStatus.textContent = '';
        if (searchResultsSection) searchResultsSection.style.display = 'none';
        if (searchInput) searchInput.value = '';
        if (searchBtn) {
            searchBtn.disabled = false;
            searchBtn.textContent = 'Search';
        }
        
        console.log('[Side Panel] Column search UI cleared for new dataflow');
    }
    
    // Update active tab context on load
    updateActiveTabContext();
    initializeContextFeatures(); // Initial check
    
    // Listen for active tab changes - re-initialize features for new tab
    chrome.tabs.onActivated.addListener((activeInfo) => {
        console.log('[Side Panel] Tab activated (ID:', activeInfo.tabId, '), re-checking page...');
        updateActiveTabContext();
        // Reset UI state for new tab
        clearColumnSearchUI();
        // Re-check if new tab is Magic ETL
        initializeContextFeatures();
    });
    
    // Listen for URL changes and page loads within any tab
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        // Only process updates for the currently active side panel tab
        chrome.tabs.query({ active: true, currentWindow: true }, function(activeTabs) {
            if (activeTabs.length === 0) return;
            const activeTabId = activeTabs[0].id;
            
            // If this update is for the active tab
            if (tabId === activeTabId) {
                // Check for URL changes (navigation)
                if (changeInfo.url) {
                    console.log('[Side Panel] Active tab URL changed:', changeInfo.url);
                    updateActiveTabContext();
                    clearColumnSearchUI();
                    // Re-check if new URL is Magic ETL
                    initializeContextFeatures();
                }
                // Also check when page finish loading (handles refreshes)
                else if (changeInfo.status === 'complete') {
                    console.log('[Side Panel] Active tab page loading complete');
                    updateActiveTabContext();
                    // Re-check features for refreshed page
                    initializeContextFeatures();
                }
            }
        });
    });

    // Listen for copy detected signal from content script
    console.log('[Side Panel] Attaching storage listener...');
    chrome.storage.onChanged.addListener((changes, areaName) => {
        console.log('[Side Panel Storage Listener] Fired - areaName:', areaName, 'changes:', Object.keys(changes));
        
        if (areaName === 'session') {
            console.log('[Side Panel] Session storage changed, checking for copyDetected...');
            console.log('[Side Panel] changes object:', changes);
            
            if (changes.copyDetected) {
                console.log('[Side Panel] ✓ Copy detected signal received!', changes.copyDetected);
                const copyDetectedMessage = document.getElementById('copyDetectedMessage');
                const magicRecipesSection = document.getElementById('magicRecipesSection');
                const placeholder = document.getElementById('contextPlaceholder');
                
                console.log('[Side Panel] Elements found:', {
                    copyDetectedMessage: !!copyDetectedMessage,
                    magicRecipesSection: !!magicRecipesSection,
                    placeholder: !!placeholder
                });
                
                if (changes.copyDetected.newValue === true) {
                    // Show the message and recipes section
                    if (placeholder) placeholder.style.display = 'none';
                    if (magicRecipesSection) magicRecipesSection.style.display = 'block';
                    if (copyDetectedMessage) copyDetectedMessage.style.display = 'block';
                    console.log('[Side Panel] ✓ Copy detected UI shown');
                } else if (changes.copyDetected.newValue === false) {
                    // Hide the message only, keep recipes section visible
                    if (copyDetectedMessage) copyDetectedMessage.style.display = 'none';
                    console.log('[Side Panel] ✓ Copy detected message hidden');
                }
            }
        } else {
            console.log('[Side Panel] Storage change in area:', areaName, '(not session)');
        }
    });
    console.log('[Side Panel] Storage listener attached');
    
    // Test: Check current session storage
    chrome.storage.session.get(['copyDetected'], (result) => {
        console.log('[Side Panel] Current session storage copyDetected:', result);
    });

    // Settings functionality
    const toggleFunctionality = document.getElementById('toggleFunctionality');
    const toggleRemoveLinks = document.getElementById('toggleRemoveLinks');
    const toggleVersionNotes = document.getElementById('toggleVersionNotes');
    const wordCount = document.getElementById('wordCount');
    const clearAnalyzerBtn = document.getElementById('clearAnalyzerBtn');
    const toggleAutoSelectTable = document.getElementById('toggleAutoSelectTable');

    // Load settings
    chrome.storage.local.get(['enabled', 'removeLinks', 'forceVersionNotes', 'minWords', 'autoSelectTable'], function(settings) {
        toggleFunctionality.checked = settings.enabled !== false; // default to true
        toggleRemoveLinks.checked = settings.removeLinks || false;
        toggleVersionNotes.checked = settings.forceVersionNotes || false;
        wordCount.value = settings.minWords || 5;
        toggleAutoSelectTable.checked = settings.autoSelectTable || false;
    });

    // Save settings when changed
    toggleFunctionality.addEventListener('change', function() {
        chrome.storage.local.set({ enabled: toggleFunctionality.checked }, function() {
            sendMessageToContentScript({ type: "settingsChanged", settings: { enabled: toggleFunctionality.checked } });
        });
    });

    toggleRemoveLinks.addEventListener('change', function() {
        chrome.storage.local.set({ removeLinks: toggleRemoveLinks.checked }, function() {
            sendMessageToContentScript({ type: "settingsChanged", settings: { removeLinks: toggleRemoveLinks.checked } });
        });
    });

    toggleVersionNotes.addEventListener('change', function() {
        chrome.storage.local.set({ forceVersionNotes: toggleVersionNotes.checked }, function() {
            sendMessageToContentScript({ type: "settingsChanged", settings: { forceVersionNotes: toggleVersionNotes.checked } });
        });
    });

    wordCount.addEventListener('input', function() {
        const minWords = parseInt(wordCount.value) || 5;
        chrome.storage.local.set({ minWords: minWords }, function() {
            sendMessageToContentScript({ type: "settingsChanged", settings: { minWords: minWords } });
        });
    });

    toggleAutoSelectTable.addEventListener('change', function() {
        chrome.storage.local.set({ autoSelectTable: toggleAutoSelectTable.checked }, function() {
            sendMessageToContentScript({ type: "settingsChanged", settings: { autoSelectTable: toggleAutoSelectTable.checked } });
        });
    });

    // Clear Analyzer functionality
    clearAnalyzerBtn.addEventListener('click', function() {
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (tabs.length > 0) {
                const currentUrl = tabs[0].url;
                
                // Check if on analyzer page
                if (currentUrl && currentUrl.includes('bcpequity.domo.com/analyzer')) {
                    clearAnalyzerBtn.disabled = true;
                    clearAnalyzerBtn.textContent = 'Clearing...';
                    
                    chrome.tabs.sendMessage(tabs[0].id, { type: "clearAnalyzerColumns", autoSelectTable: toggleAutoSelectTable.checked }, function(response) {
                        clearAnalyzerBtn.disabled = false;
                        clearAnalyzerBtn.textContent = 'Clear All Analyzer Columns';
                        
                        if (chrome.runtime.lastError) {
                            console.error('Clear Analyzer Error:', chrome.runtime.lastError.message);
                            alert('Error: ' + chrome.runtime.lastError.message + '\n\nMake sure:\n1. You are on the analyzer page\n2. The page is fully loaded\n3. There are columns to clear');
                        } else if (response && response.success) {
                            if (response.count > 0) {
                                alert(`Successfully cleared ${response.count} column${response.count !== 1 ? 's' : ''}!`);
                            } else {
                                alert('No columns found to clear. The analyzer may already be empty.');
                            }
                        } else {
                            alert('No response from page. Make sure you are on the analyzer page.');
                        }
                    });
                } else {
                    alert('This feature only works on https://bcpequity.domo.com/analyzer');
                    console.log('Current URL:', currentUrl);
                }
            }
        });
    });

    // Beast Mode Template
    const beastModeTemplate = document.getElementById('beastModeTemplate');
    const copyTemplateBtn = document.getElementById('copyTemplate');
    
    const templateText = `CASE
    WHEN LENGTH(\`Your_Column\`) > 20 THEN 
        CONCAT(
            '<span font-color="',\`Your_Column\`,'">',
            SUBSTRING(\`Your_Column\`, 1, 20),
            '...</span>'
        )
    ELSE CONCAT(
            '<span font-color="NOTEXT">',
            \`Your_Column\`,
            '</span>')
END`;

    beastModeTemplate.value = templateText;

    copyTemplateBtn.addEventListener('click', function() {
        beastModeTemplate.select();
        document.execCommand('copy');
        const originalText = copyTemplateBtn.textContent;
        copyTemplateBtn.textContent = 'Copied!';
        setTimeout(() => {
            copyTemplateBtn.textContent = originalText;
        }, 2000);
    });

    function sendMessageToContentScript(message) {
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (tabs.length > 0) {
                chrome.tabs.sendMessage(tabs[0].id, message, function(response) {
                    if (chrome.runtime.lastError) {
                        console.error(chrome.runtime.lastError.message);
                    }
                });
            }
        });
    }

    /**
     * Check if a URL is a Domo page (where content-main.js should be injected)
     */
    function isDomoDomain(url) {
        if (!url) return false;
        try {
            const urlObj = new URL(url);
            return urlObj.hostname.includes('domo.com');
        } catch (e) {
            return false;
        }
    }

    /**
     * Check if a URL matches Domo's relevant page patterns
     */
    function isRelevantDomoPage(url) {
        if (!isDomoDomain(url)) return false;
        return url.includes('/page/') || 
               url.includes('/datacenter/dataflows/') || 
               url.endsWith('graph') || 
               url.includes('author');
    }

    /**
     * Get page type from content script using GET_PAGE_TYPE message
     * Retries if content script not ready yet
     */
    function getPageTypeFromContentScript() {
        return new Promise((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                if (tabs.length === 0) {
                    console.warn('[Side Panel] No active tab found');
                    return resolve(null);
                }
                
                const tab = tabs[0];
                
                // Check if this is even a Domo page
                if (!isDomoDomain(tab.url)) {
                    console.log('[Side Panel] Not a Domo page:', tab.url?.substring(0, 50));
                    return resolve(null);
                }
                
                console.log('[Side Panel] Requesting page type from content script...');
                
                chrome.tabs.sendMessage(
                    tab.id,
                    { action: 'GET_PAGE_TYPE' },
                    (response) => {
                        if (chrome.runtime.lastError) {
                            console.log('[Side Panel] Content script not ready:', chrome.runtime.lastError.message);
                            resolve(null);
                        } else if (response?.pageType) {
                            console.log('[Side Panel] Page type received:', response.pageType);
                            resolve(response.pageType);
                        } else {
                            console.log('[Side Panel] Invalid page type response:', response);
                            resolve(null);
                        }
                    }
                );
            });
        });
    }
    
    /**
     * Initialize context-aware features based on current page type
     * Uses retries with exponential backoff if content script not immediately ready
     */
    async function initializeContextFeatures() {
        // First check if we're on a Domo page at all
        const tabs = await new Promise(resolve => 
            chrome.tabs.query({ active: true, currentWindow: true }, resolve)
        );

        if (tabs.length === 0) {
            console.log('[Side Panel] No active tab');
            return;
        }

        const currentUrl = tabs[0].url;
        
        // If not a Domo domain, show not available message immediately
        if (!isDomoDomain(currentUrl)) {
            console.log('[Side Panel] Not on a Domo page');
            const placeholder = document.getElementById('contextPlaceholder');
            if (placeholder) {
                placeholder.innerHTML = '<p style="color: #999; font-size: 0.9em;">Domo Helper only works on domo.com pages</p>';
            }
            return;
        }

        // On Domo page but not relevant (unexpected), show message
        if (!isRelevantDomoPage(currentUrl)) {
            console.log('[Side Panel] On Domo domain but not a relevant page');
            const placeholder = document.getElementById('contextPlaceholder');
            if (placeholder) {
                placeholder.innerHTML = '<p style="color: #999; font-size: 0.9em;">Domo Helper features not available on this page type</p>';
            }
            return;
        }

        // On relevant Domo page - try to get page type with retries
        let retries = 0;
        const maxRetries = 5;
        const retryDelay = 500; // ms
        
        while (retries < maxRetries) {
            const pageType = await getPageTypeFromContentScript();
            
            if (pageType) {
                console.log(`[Side Panel] ✓ Detected page type: ${pageType}`);
                
                // Initialize features based on page type
                if (pageType === 'MAGIC_ETL') {
                    initializeMagicRecipes();
                    initializeColumnSearch();
                } else if (pageType === 'PAGE') {
                    console.log('[Side Panel] PAGE detected (no features for dashboard pages yet)');
                } else if (pageType === 'SQL_AUTHOR') {
                    console.log('[Side Panel] SQL_AUTHOR detected (version notes handled by content script)');
                } else {
                    console.log('[Side Panel] Unknown page type:', pageType);
                }
                return; // Success, exit retry loop
            }
            
            // Content script not ready, retry
            retries++;
            if (retries < maxRetries) {
                console.log(`[Side Panel] Content script not ready, retrying (${retries}/${maxRetries})...`);
                await new Promise(r => setTimeout(r, retryDelay));
            }
        }
        
        console.warn('[Side Panel] Failed to determine page type after retries - content script may have crashed');
        const placeholder = document.getElementById('contextPlaceholder');
        if (placeholder) {
            placeholder.innerHTML = '<p style="color: #999; font-size: 0.9em;">Unable to initialize. Please refresh the page.</p>';
        }
    }

    /**
     * Initialize Magic Recipes Context
     */
    function initializeMagicRecipes() {
        const recipeSection = document.getElementById('magicRecipesSection');
        const placeholder = document.getElementById('contextPlaceholder');
        const recipesList = document.getElementById('recipesList');
        const saveRecipeBtn = document.getElementById('saveRecipeBtn');
        
        console.log('initializeMagicRecipes called');
        console.log('saveRecipeBtn element:', saveRecipeBtn);
        
        if (!recipeSection) return;
        
        // Keep recipes section hidden until copy is detected
        // The storage listener will show it when copyDetected flag is set
        
        // Load and display recipes initially (in background, they'll be visible after copy detected)
        loadMagicRecipes(recipesList);
        
        // Save recipe button handler
        saveRecipeBtn.addEventListener('click', function() {
            console.log('Save Recipe button clicked!');
            
            // Request clipboard data from content script
            chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                if (tabs.length > 0) {
                    chrome.tabs.sendMessage(tabs[0].id, { 
                        action: 'READ_RECIPE_CLIPBOARD' 
                    }, function(response) {
                        if (chrome.runtime.lastError) {
                            console.error('Error reading clipboard:', chrome.runtime.lastError.message);
                            alert('Could not read clipboard. Make sure you clicked Copy on the canvas first.');
                        } else if (response && response.success && response.clipboardData) {
                            try {
                                // Validate JSON
                                const jsonData = JSON.parse(response.clipboardData);
                                
                                // Store the recipe data for saving
                                window.currentRecipeData = jsonData;
                                
                                // Populate and show the form
                                const previewField = document.getElementById('recipeFormPreview');
                                const titleField = document.getElementById('recipeFormTitle');
                                const descField = document.getElementById('recipeFormDescription');
                                
                                if (previewField) {
                                    previewField.value = JSON.stringify(jsonData, null, 2);
                                }
                                if (titleField) titleField.value = '';
                                if (descField) descField.value = '';
                                
                                // Show the form section
                                const formSection = document.getElementById('recipeFormSection');
                                if (formSection) formSection.style.display = 'block';
                                
                                console.log('Recipe form displayed');
                            } catch (err) {
                                console.error('Invalid JSON in clipboard:', err);
                                alert('Clipboard does not contain valid recipe data.');
                            }
                        } else {
                            alert('Could not read clipboard. Make sure you clicked Copy on the canvas first.');
                        }
                    });
                }
            });
        });

        // Form save button
        document.getElementById('recipeFormSaveBtn').addEventListener('click', function() {
            const title = document.getElementById('recipeFormTitle').value.trim();
            const description = document.getElementById('recipeFormDescription').value.trim();
            
            if (!title || !description) {
                alert('Please provide both a title and description.');
                return;
            }
            
            if (!window.currentRecipeData) {
                alert('No recipe data available. Please click Copy again.');
                return;
            }
            
            // Save to storage
            chrome.storage.local.get(['MagicETLRecipes'], function(result) {
                const recipes = result.MagicETLRecipes || {};
                const recipeData = {
                    title,
                    description,
                    recipe: window.currentRecipeData,
                    timestamp: new Date().toISOString()
                };
                
                recipes[title] = recipeData;
                chrome.storage.local.set({ MagicETLRecipes: recipes }, function() {
                    if (chrome.runtime.lastError) {
                        console.error('Error saving:', chrome.runtime.lastError);
                        alert('Error saving recipe');
                    } else {
                        console.log('Recipe saved successfully!');
                        
                        // Hide form and reload recipes list
                        document.getElementById('recipeFormSection').style.display = 'none';
                        loadMagicRecipes(recipesList);
                        
                        // Reset current recipe data
                        window.currentRecipeData = null;
                        
                        alert('Recipe saved successfully!');
                    }
                });
            });
        });

        // Form cancel button
        document.getElementById('recipeFormCancelBtn').addEventListener('click', function() {
            document.getElementById('recipeFormSection').style.display = 'none';
            window.currentRecipeData = null;
        });
    }

    /**
     * Load and display Magic Recipes
     */
    function loadMagicRecipes(container) {
        chrome.storage.local.get(['MagicETLRecipes'], function(result) {
            const recipes = result.MagicETLRecipes || {};
            const recipeArray = Object.values(recipes).sort((a, b) => 
                new Date(b.timestamp) - new Date(a.timestamp)
            );
            
            if (container) {
                container.innerHTML = '';
                
                if (recipeArray.length === 0) {
                    const emptyMsg = document.createElement('p');
                    emptyMsg.style.cssText = 'margin: 0; color: var(--text-secondary); font-size: 12px; text-align: center; padding: 20px 10px;';
                    emptyMsg.textContent = 'No recipes saved yet. Create one from the ETL page.';
                    container.appendChild(emptyMsg);
                    return;
                }
                
                recipeArray.forEach(recipe => {
                    const item = document.createElement('div');
                    item.className = 'recipe-item';
                    item.innerHTML = `
                        <div class="recipe-info">
                            <h4 class="recipe-title">${escapeHtml(recipe.title)}</h4>
                            <p class="recipe-description">${escapeHtml(recipe.description)}</p>
                        </div>
                        <div class="recipe-actions">
                            <button class="recipe-btn recipe-insert" data-recipe-title="${escapeHtml(recipe.title)}" title="Insert recipe">Insert</button>
                            <button class="recipe-btn recipe-delete" data-recipe-title="${escapeHtml(recipe.title)}" title="Delete recipe">Delete</button>
                        </div>
                    `;
                    
                    // Insert button handler
                    item.querySelector('.recipe-insert').addEventListener('click', function() {
                        const title = this.getAttribute('data-recipe-title');
                        insertMagicRecipe(title);
                    });
                    
                    // Delete button handler
                    item.querySelector('.recipe-delete').addEventListener('click', function() {
                        const title = this.getAttribute('data-recipe-title');
                        if (confirm(`Delete recipe "${title}"?`)) {
                            deleteMagicRecipe(title, container);
                        }
                    });
                    
                    container.appendChild(item);
                });
            }
        });
    }

    /**
     * Insert a Magic Recipe
     */
    function insertMagicRecipe(title) {
        chrome.storage.local.get(['MagicETLRecipes'], function(result) {
            const recipes = result.MagicETLRecipes || {};
            const recipe = recipes[title];
            
            if (!recipe) {
                alert('Recipe not found');
                return;
            }
            
            // Send recipe to content script for insertion
            chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                if (tabs.length > 0) {
                    // Focus the tab to ensure clipboard access
                    chrome.tabs.update(tabs[0].id, { active: true }, function() {
                        // Delay to ensure focus settles before clipboard operations
                        // Need longer delay for browser to fully shift focus context
                        setTimeout(function() {
                            chrome.tabs.sendMessage(tabs[0].id, {
                                action: 'INSERT_MAGIC_RECIPE',
                                recipeData: recipe.recipe
                            }, function(response) {
                                if (chrome.runtime.lastError) {
                                    console.error('Error inserting recipe:', chrome.runtime.lastError.message);
                                    alert('Could not insert recipe. Are you on a Magic ETL page?');
                                } else if (response && response.success) {
                                    alert('Recipe inserted successfully!');
                                }
                            });
                        }, 500);
                    });
                }
            });
        });
    }

    /**
     * Delete a Magic Recipe
     */
    function deleteMagicRecipe(title, container) {
        chrome.storage.local.get(['MagicETLRecipes'], function(result) {
            const recipes = result.MagicETLRecipes || {};
            delete recipes[title];
            
            chrome.storage.local.set({ MagicETLRecipes: recipes }, function() {
                if (chrome.runtime.lastError) {
                    alert('Error deleting recipe');
                } else {
                    loadMagicRecipes(container);
                }
            });
        });
    }

    /**
     * Initialize Column Search Feature
     */
    function initializeColumnSearch() {
        const searchBtn = document.getElementById('columnSearchBtn');
        const searchInput = document.getElementById('columnSearchInput');
        const clearBtn = document.getElementById('columnSearchClearBtn');
        const columnSearchSection = document.getElementById('columnSearchSection');
        const columnSearchPlaceholder = document.getElementById('columnSearchPlaceholder');
        
        if (!searchBtn) {
            console.log('[Column Search] UI elements not found');
            return;
        }
        
        // Show column search UI (hide placeholder)
        if (columnSearchPlaceholder) columnSearchPlaceholder.style.display = 'none';
        if (columnSearchSection) columnSearchSection.style.display = 'block';
        
        console.log('[Column Search] ✓ UI initialized and visible');
        
        // Search button handler
        searchBtn.addEventListener('click', function() {
            performColumnSearch();
        });
        
        // Enter key handler
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                performColumnSearch();
            }
        });
        
        // Show/hide clear button based on input content
        searchInput.addEventListener('input', function() {
            if (clearBtn) {
                clearBtn.style.display = this.value.trim() ? 'block' : 'none';
            }
        });
        
        // Clear button handler
        if (clearBtn) {
            clearBtn.addEventListener('click', function() {
                console.log('[Column Search] Clear button clicked');
                searchInput.value = '';
                clearColumnSearchUI();
                clearBtn.style.display = 'none';
                searchInput.focus();
            });
        }
    }

    /**
     * Get filter preferences from user selections
     */
    function getFilterPreferences() {
        const caseSensitive = document.getElementById('filterCaseSensitive')?.checked ?? false;
        const exactMatch = document.getElementById('filterExactMatch')?.checked ?? false;
        const includeSelectColumns = document.getElementById('filterSelectColumns')?.checked ?? true;
        const includeInputOutput = document.getElementById('filterInputOutput')?.checked ?? true;
        
        return {
            caseSensitive,
            exactMatch,
            includeSelectColumns,
            includeInputOutput
        };
    }

    /**
     * Check if content script is ready and responsive
     */
    function checkContentScriptHealth() {
        return new Promise((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                if (tabs.length === 0) {
                    resolve(false);
                    return;
                }
                
                let responded = false;
                const timeout = setTimeout(() => {
                    if (!responded) {
                        console.warn('[Column Search] Health check timeout - content script not responding');
                        resolve(false);
                    }
                }, 3000); // 3 second timeout for health check
                
                try {
                    chrome.tabs.sendMessage(tabs[0].id, { action: 'PING' }, function(response) {
                        responded = true;
                        clearTimeout(timeout);
                        
                        if (chrome.runtime.lastError) {
                            console.warn('[Column Search] Health check failed:', chrome.runtime.lastError.message);
                            resolve(false);
                        } else if (response && response.pong) {
                            console.log('[Column Search] ✓ Content script is healthy', response);
                            resolve(true);
                        } else {
                            console.warn('[Column Search] Health check returned unexpected response:', response);
                            resolve(false);
                        }
                    });
                } catch (err) {
                    responded = true;
                    clearTimeout(timeout);
                    console.error('[Column Search] Health check exception:', err);
                    resolve(false);
                }
            });
        });
    }

    /**
     * Extract dataflow ID from the active tab's URL
     */
    function getActiveDataflowId() {
        return new Promise((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                if (tabs.length > 0) {
                    const url = tabs[0].url || '';
                    const flowMatch = url.match(/\/dataflows\/(\d+)/);
                    const dataflowId = flowMatch ? flowMatch[1] : null;
                    resolve(dataflowId);
                } else {
                    resolve(null);
                }
            });
        });
    }
    
    /**
     * Perform column search on the active tab with automatic retry
     */
    function performColumnSearch() {
        const searchInput = document.getElementById('columnSearchInput');
        const columnName = searchInput.value.trim();
        
        if (!columnName) {
            alert('Please enter a column name to search for.');
            return;
        }
        
        const searchBtn = document.getElementById('columnSearchBtn');
        const originalText = searchBtn.textContent;
        
        // First perform health check
        searchBtn.disabled = true;
        searchBtn.textContent = 'Checking...';
        showSearchStatus('Checking if content script is ready...', true);
        
        checkContentScriptHealth().then(isHealthy => {
            if (!isHealthy) {
                searchBtn.disabled = false;
                searchBtn.textContent = originalText;
                showSearchStatus('Error: Content script not responding. Try refreshing the page.', false);
                return;
            }
            
            // Health check passed, proceed with search
            getActiveDataflowId().then(dataflowId => {
                console.log('[Column Search] Searching on dataflow:', dataflowId);
                // Perform search with retry logic
                performSearchWithRetry(columnName, searchBtn, originalText, 0, dataflowId);
            });
        });
    }
    
    /**
     * Perform search with automatic retry for context-related errors
     * @param {string} columnName - Column to search for
     * @param {HTMLElement} searchBtn - Search button element
     * @param {string} originalText - Original button text
     * @param {number} retryCount - Current retry count
     * @param {string} dataflowId - Dataflow ID when search started
     */
    function performSearchWithRetry(columnName, searchBtn, originalText, retryCount, dataflowId) {
        searchBtn.disabled = true;
        searchBtn.textContent = retryCount > 0 ? `Retrying... (${retryCount})` : 'Searching...';
        
        // Show status
        const statusMsg = retryCount > 0 ? `Retrying search for "${columnName}"...` : `Searching for "${columnName}"...`;
        showSearchStatus(statusMsg, true);
        
        // Get filter preferences
        const filterPrefs = getFilterPreferences();
        
        // Send message to content script with timeout
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (tabs.length > 0) {
                // Check if we've switched dataflows since search started
                const url = tabs[0].url || '';
                const flowMatch = url.match(/\/dataflows\/(\d+)/);
                const currentDataflowId = flowMatch ? flowMatch[1] : null;
                
                if (currentDataflowId !== dataflowId) {
                    console.warn('[Column Search] Dataflow changed during search from', dataflowId, 'to', currentDataflowId);
                    searchBtn.disabled = false;
                    searchBtn.textContent = originalText;
                    showSearchStatus(`Dataflow changed. Please search again.`, false);
                    clearColumnSearchUI();
                    return;
                }
                
                // Create a promise-based timeout wrapper that handles port closure better
                let messageResolved = false;
                
                const messagePromise = new Promise((resolve) => {
                    try {
                        chrome.tabs.sendMessage(tabs[0].id, {
                            action: 'SEARCH_COLUMN',
                            columnName: columnName,
                            filters: filterPrefs
                        }, function(response) {
                            messageResolved = true;
                            
                            if (chrome.runtime.lastError) {
                                // Handle Chrome runtime errors
                                const errorMsg = chrome.runtime.lastError.message;
                                console.warn('[Column Search] Runtime error:', errorMsg);
                                resolve({ error: errorMsg, isContextError: true });
                            } else if (response === undefined) {
                                // Port closed before response received
                                resolve({ error: 'The message port closed before a response was received.', isContextError: true });
                            } else {
                                resolve(response);
                            }
                        });
                    } catch (err) {
                        messageResolved = true;
                        console.error('[Column Search] sendMessage exception:', err);
                        resolve({ error: err.message, isContextError: true });
                    }
                });
                
                // Add 20 second timeout (API call can take up to 10s, plus processing)
                const timeoutPromise = new Promise((resolve) => {
                    setTimeout(() => {
                        if (!messageResolved) {
                            resolve({ error: 'Search request timed out after 20 seconds.', isContextError: false });
                        }
                    }, 20000);
                });
                
                // Race the message against the timeout
                Promise.race([messagePromise, timeoutPromise]).then(result => {
                    searchBtn.disabled = false;
                    searchBtn.textContent = originalText;
                    
                    if (result && result.error) {
                        console.error('[Column Search] Error:', result.error);
                        const errorMsg = result.error;
                        
                        // Check if it's a feature not initialized error
                        if (errorMsg.includes('not initialized')) {
                            searchBtn.disabled = false;
                            searchBtn.textContent = originalText;
                            showSearchStatus('Column search feature not loaded. Try refreshing the page.', false);
                            hideSearchResults();
                            return;
                        }
                        
                        const isContextError = result.isContextError || 
                            errorMsg.includes('port closed') || 
                            errorMsg.includes('Receiving end does not exist') || 
                            errorMsg.includes('context may have invalidated') ||
                            errorMsg.includes('not connected');
                        
                        // Retry once if it's a context error AND we haven't changed dataflows
                        if (isContextError && retryCount < 1) {
                            console.log('[Column Search] Context error, checking dataflow before retry...');
                            // Check dataflow again before retrying
                            getActiveDataflowId().then(newDataflowId => {
                                if (newDataflowId !== dataflowId) {
                                    console.warn('[Column Search] Dataflow changed - not retrying. Was', dataflowId, 'now', newDataflowId);
                                    showSearchStatus(`Dataflow changed. Please search again.`, false);
                                    clearColumnSearchUI();
                                } else {
                                    console.log('[Column Search] Dataflow unchanged, retrying automatically...');
                                    // Wait 500ms before retrying
                                    setTimeout(() => {
                                        performSearchWithRetry(columnName, searchBtn, originalText, retryCount + 1, dataflowId);
                                    }, 500);
                                }
                            });
                        } else {
                            // Show error message
                            if (isContextError) {
                                showSearchStatus('Error: Connection lost. Retrying...', false);
                                // Try one more health check
                                setTimeout(() => {
                                    checkContentScriptHealth().then(isHealthy => {
                                        if (!isHealthy) {
                                            showSearchStatus('Error: Content script disconnected. Try refreshing the page.', false);
                                        }
                                    });
                                }, 1000);
                            } else if (errorMsg.includes('timed out')) {
                                showSearchStatus('Error: Search took too long. Try again.', false);
                            } else {
                                showSearchStatus(`Error: ${errorMsg}`, false);
                            }
                            hideSearchResults();
                        }
                    } else if (result && result.success) {
                        console.log('[Column Search] Results:', result);
                        showSearchStatus('', false); // Hide status on success
                        displaySearchResults(result);
                    } else if (result && !result.success) {
                        console.error('[Column Search] Search failed:', result.error);
                        showSearchStatus(`Error: ${result.error}`, false);
                        hideSearchResults();
                    } else {
                        console.error('[Column Search] Invalid response:', result);
                        showSearchStatus('Error: No response from page. Make sure you\'re on a Magic ETL canvas.', false);
                        hideSearchResults();
                    }
                });
            }
        });
    }

    /**
     * Display column search results
     */
    function displaySearchResults(response) {
        const resultsSection = document.getElementById('searchResultsSection');
        const noResultsMsg = document.getElementById('noResultsMessage');
        const tilesList = document.getElementById('tileResultsList');
        const resultsCount = document.getElementById('resultsCount');
        const statusDiv = document.getElementById('searchStatus');
        
        // Clear previous results
        if (tilesList) tilesList.innerHTML = '';
        
        if (response.count === 0) {
            // Show no results message
            if (noResultsMsg) noResultsMsg.style.display = 'block';
            if (resultsSection) resultsSection.style.display = 'none';
            showSearchStatus(`No tiles found containing "${response.columnName}"`);
            return;
        }
        
        // Hide no results message
        if (noResultsMsg) noResultsMsg.style.display = 'none';
        if (resultsSection) resultsSection.style.display = 'block';
        
        // Update count
        if (resultsCount) {
            resultsCount.textContent = `Found in ${response.count} tile${response.count !== 1 ? 's' : ''}:`;
        }
        
        // Populate results
        response.results.forEach(tileResult => {
            const tileItem = createTileResultElement(tileResult);
            if (tilesList) tilesList.appendChild(tileItem);
        });
        
        // Hide status
        if (statusDiv) statusDiv.style.display = 'none';
    }

    /**
     * Create a tile result element
     */
    function createTileResultElement(tileResult) {
        const item = document.createElement('div');
        item.className = 'dh-search-tile-item';
        
        const header = document.createElement('div');
        header.className = 'dh-search-tile-header';
        header.innerHTML = `
            <div class="dh-search-tile-name">${escapeHtml(tileResult.tileName)}</div>
            <div class="dh-search-tile-type">${escapeHtml(tileResult.tileDisplayType || tileResult.tileType)}</div>
        `;
        item.appendChild(header);
        
        const operationsDiv = document.createElement('div');
        operationsDiv.className = 'dh-search-tile-operations';
        
        tileResult.operations.forEach((op, index) => {
            const opElement = document.createElement('div');
            opElement.className = 'dh-search-operation';
            opElement.innerHTML = `
                <span class="dh-search-operation-icon">${op.icon}</span>
                <span class="dh-search-operation-label">${escapeHtml(op.operation)}:</span>
                <span class="dh-search-operation-detail">${escapeHtml(op.detail)}</span>
            `;
            operationsDiv.appendChild(opElement);
        });
        
        item.appendChild(operationsDiv);
        
        // Click handler to highlight tile
        item.addEventListener('click', function() {
            highlightTileOnCanvas(tileResult.tileId, item);
        });
        
        return item;
    }

    /**
     * Highlight a tile on the canvas
     */
    function highlightTileOnCanvas(tileId, element) {
        // Update active state
        document.querySelectorAll('.dh-search-tile-item').forEach(el => {
            el.classList.remove('active');
        });
        element.classList.add('active');
        
        // Send highlight message to content script
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (tabs.length > 0) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'HIGHLIGHT_TILE',
                    tileId: tileId
                }, function(response) {
                    if (chrome.runtime.lastError) {
                        console.error('[Column Search] Error highlighting:', chrome.runtime.lastError.message);
                    } else if (response && response.success) {
                        console.log('[Column Search] Tile highlighted:', tileId);
                    }
                });
            }
        });
    }

    /**
     * Show search status message
     */
    function showSearchStatus(message, isLoading = false) {
        const statusDiv = document.getElementById('searchStatus');
        const statusText = document.getElementById('searchStatusText');
        
        if (!statusDiv || !statusText) return;
        
        if (!message) {
            statusDiv.style.display = 'none';
            return;
        }
        
        statusText.textContent = message;
        statusDiv.style.display = 'block';
        
        // Change styling based on message type
        if (isLoading) {
            statusDiv.style.backgroundColor = 'var(--primary-color)';
            statusDiv.style.color = 'white';
        } else if (message.toLowerCase().startsWith('error')) {
            statusDiv.style.backgroundColor = 'var(--danger-color)';
            statusDiv.style.color = 'white';
        } else {
            statusDiv.style.backgroundColor = 'var(--surface-light)';
            statusDiv.style.color = 'var(--text-secondary)';
        }
    }

    /**
     * Hide search results
     */
    function hideSearchResults() {
        const resultsSection = document.getElementById('searchResultsSection');
        const noResultsMsg = document.getElementById('noResultsMessage');
        
        if (resultsSection) resultsSection.style.display = 'none';
        if (noResultsMsg) noResultsMsg.style.display = 'none';
    }

    /**
     * Escape HTML to prevent injection
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
});
