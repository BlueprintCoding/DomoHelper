/**
 * Side Panel Script - Migrated from Popup
 * 
 * All functionality from the popup has been migrated to the side panel.
 * Implements domo-toolkit's reactive event-driven architecture:
 * - Initial GET_TAB_CONTEXT on mount for current tab
 * - Message listener for broadcasts from background
 * - Tab activation listener for tab switches
 * - Dependency on currentTabId ensures latest context in all listeners
 */

document.addEventListener('DOMContentLoaded', function() {
    // Track active tab (CORE STATE - all listeners depend on this)
    let currentTabId = null;
    let currentDataflowId = null;
    let messageListenerAttached = false;
    let tabActivatedListenerAttached = false;
    let handleContextBroadcast = null; // Store listener reference for removal
    let contextWaitTimeout = null; // Track timeout for waiting on context
    
    // ========================================================================
    // MESSAGE DISPLAY FUNCTION
    // ========================================================================
    
    /**
     * Display a message in the message area at the top of the context tab
     * Replaces all alert() calls with in-panel notifications
     */
    function showMessage(text, type = 'info') {
      const messageArea = document.getElementById('messageArea');
      const messageContent = document.getElementById('messageContent');
      
      if (!messageArea || !messageContent) return;
      
      // Set message text
      messageContent.textContent = text;
      
      // Set color based on type
      const colorMap = {
        'success': { bg: '#e8f5e9', border: '#4caf50', text: '#2e7d32' },
        'error': { bg: '#ffebee', border: '#f44336', text: '#c62828' },
        'warning': { bg: '#fff3e0', border: '#ff9800', text: '#e65100' },
        'info': { bg: '#e3f2fd', border: '#2196f3', text: '#1565c0' }
      };
      
      const colors = colorMap[type] || colorMap['info'];
      messageArea.style.backgroundColor = colors.bg;
      messageArea.style.borderLeftColor = colors.border;
      messageContent.style.color = colors.text;
      
      // Show message
      messageArea.style.display = 'block';
      
      // Auto-hide after 5 seconds (unless it's an error)
      if (type !== 'error') {
        setTimeout(() => {
          messageArea.style.display = 'none';
        }, 5000);
      }
    }
    
    /**
     * Display a confirmation dialog in a modal
     * Returns a Promise that resolves to true (OK) or false (Cancel)
     */
    function showConfirmation(title, message) {
      return new Promise((resolve) => {
        const modal = document.getElementById('confirmationModal');
        const titleEl = document.getElementById('confirmationTitle');
        const messageEl = document.getElementById('confirmationMessage');
        const okBtn = document.getElementById('confirmationOkBtn');
        const cancelBtn = document.getElementById('confirmationCancelBtn');
        
        if (!modal || !titleEl || !messageEl) return resolve(false);
        
        // Set content
        titleEl.textContent = title;
        messageEl.textContent = message;
        
        // Show modal
        modal.style.display = 'flex';
        
        // Create handler functions with closure
        const handleOk = () => {
          cleanup();
          resolve(true);
        };
        
        const handleCancel = () => {
          cleanup();
          resolve(false);
        };
        
        const cleanup = () => {
          modal.style.display = 'none';
          okBtn.removeEventListener('click', handleOk);
          cancelBtn.removeEventListener('click', handleCancel);
          document.removeEventListener('keydown', handleEsc);
        };
        
        const handleEsc = (e) => {
          if (e.key === 'Escape') {
            handleCancel();
          }
        };
        
        // Add event listeners
        okBtn.addEventListener('click', handleOk);
        cancelBtn.addEventListener('click', handleCancel);
        document.addEventListener('keydown', handleEsc);
      });
    }
    
    // ========================================================================
    
    /**
     * Register message listener for context broadcasts
     * IMPORTANT: Re-register when currentTabId changes to avoid stale closures
     */
    function registerMessageListener() {
        // Remove old listener if attached
        if (messageListenerAttached && handleContextBroadcast) {
            chrome.runtime.onMessage.removeListener(handleContextBroadcast);
            console.log('[Side Panel] Removed old message listener');
        }
        
        // Create new listener with fresh currentTabId
        handleContextBroadcast = (message, sender, sendResponse) => {
            // Listen for TAB_CONTEXT_UPDATED from new background system
            if (message.type === 'TAB_CONTEXT_UPDATED') {
                console.log(`[Side Panel] TAB_CONTEXT_UPDATED received for tab ${message.tabId}, current tab: ${currentTabId}`);
                
                // Only update if broadcast is for our current tab
                if (message.tabId === currentTabId) {
                    console.log('[Side Panel] Context matches current tab, updating');
                    // Clear any pending wait timeout since we got the broadcast
                    if (contextWaitTimeout) {
                        clearTimeout(contextWaitTimeout);
                        contextWaitTimeout = null;
                    }
                    handleContextUpdate(message.context);
                } else {
                    console.log(`[Side Panel] Broadcast ignored (different tab)`);
                }
                sendResponse({ received: true });
                return true;
            }

            // FALLBACK: Also support old message format for backward compatibility
            if (message.type === 'TAB_CONTEXT_UPDATED_OLD' || !message.type) {
                console.log(`[Side Panel] Fallback broadcast received for tab ${message.tabId}, current tab: ${currentTabId}`);
                
                if (message.tabId === currentTabId) {
                    if (contextWaitTimeout) {
                        clearTimeout(contextWaitTimeout);
                        contextWaitTimeout = null;
                    }
                    handleContextUpdate(message.context);
                }
                sendResponse({ received: true });
                return true;
            }

            // Don't respond to other message types
            return false;
        };
        
        chrome.runtime.onMessage.addListener(handleContextBroadcast);
        messageListenerAttached = true;
        console.log(`[Side Panel] Registered message listener for tab ${currentTabId}`);
    }
    
    /**
     * Register tab activation listener for tab switches
     * (Only register once, not dependent on currentTabId changing)
     */
    function registerTabActivationListener() {
        if (tabActivatedListenerAttached) {
            return; // Already registered
        }
        
        const handleTabActivated = async (activeInfo) => {
            console.log(`[Side Panel] Tab activated: ${activeInfo.tabId}`);
            
            try {
                // Request context for newly activated tab
                const response = await chrome.runtime.sendMessage({
                    type: 'GET_TAB_CONTEXT',
                    tabId: activeInfo.tabId
                });
                
                if (response.success) {
                    // Update our tracked tab ID
                    currentTabId = activeInfo.tabId;
                    
                    // Re-register message listener with new tab ID
                    registerMessageListener();
                    
                    // Clear UI state for new tab
                    clearColumnSearchUI();
                    
                    // Check if context has valid object
                    const context = response.context;
                    if (context && (context.domoObject || context.pageType)) {
                        // Valid context - update immediately
                        const objectType = context.domoObject?.typeId || context.pageType;
                        console.log(`[Side Panel] Tab has context: ${objectType}`);
                        handleContextUpdate(context);
                    } else {
                        // No valid context yet - wait for broadcast
                        const placeholder = document.getElementById('contextPlaceholder');
                        if (placeholder) {
                            placeholder.style.display = 'none';
                        }
                        
                        // Set timeout to retry if no broadcast comes
                        if (contextWaitTimeout) clearTimeout(contextWaitTimeout);
                        contextWaitTimeout = setTimeout(() => {
                            console.log('[Side Panel] Context wait timeout, retrying...');
                            contextWaitTimeout = null;
                            
                            chrome.runtime.sendMessage({
                                type: 'GET_TAB_CONTEXT',
                                tabId: currentTabId
                            }).then(response => {
                                if (response?.context?.domoObject || response?.context?.pageType) {
                                    console.log('[Side Panel] Got context on retry');
                                    handleContextUpdate(response.context);
                                } else {
                                    console.log('[Side Panel] Still no valid context after retry');
                                    const placeholder2 = document.getElementById('contextPlaceholder');
                                    if (placeholder2) {
                                        placeholder2.innerHTML = '<p style="color: #999; font-size: 0.9em; text-align: center; padding: 20px 10px;">Unable to load page features. Try refreshing the page.</p>';
                                    }
                                }
                            }).catch(err => {
                                console.error('[Side Panel] Error retrying context:', err.message);
                            });
                        }, 5000);
                    }
                } else {
                    console.log('[Side Panel] Failed to get context for activated tab');
                }
            } catch (error) {
                console.error('[Side Panel] Error handling tab activation:', error);
            }
        };
        
        chrome.tabs.onActivated.addListener(handleTabActivated);
        tabActivatedListenerAttached = true;
        console.log('[Side Panel] Registered tab activation listener');
    }
    
    // ========================================================================
    // INITIAL LOAD - Get Context for Current Tab
    // ========================================================================
    
    /**
     * On mount: fetch context for the current active tab
     */
    async function initializeOnMount() {
        console.log('[Side Panel] Initializing on mount');
        
        try {
            // Get info about current tab
            const tabs = await new Promise((resolve) => {
                chrome.tabs.query({ active: true, currentWindow: true }, resolve);
            });
            
            if (tabs.length === 0) {
                console.log('[Side Panel] No active tab found');
                return;
            }
            
            const tab = tabs[0];
            currentTabId = tab.id;
            
            console.log(`[Side Panel] Current tab: ${currentTabId}, url: ${tab.url}`);
            
            // Register listeners now that we have a tab ID
            registerMessageListener();
            registerTabActivationListener();
            
            // Request context for current tab from background
            const response = await chrome.runtime.sendMessage({
                type: 'GET_TAB_CONTEXT',
                tabId: currentTabId
            });
            
            console.log('[Side Panel] Initial context response:', response?.context ? `${response.context.domoObject?.typeId || response.context.pageType}` : 'none');
            
            if (response.success && response.context) {
                handleContextUpdate(response.context);
            } else {
                handleContextUpdate(null);
            }
            
            // Fallback: Check for analyzer page by URL (in case background detection hasn't completed yet)
            checkAnalyzerPageContext();
            
        } catch (error) {
            console.error('[Side Panel] Error during initialization:', error);
        }
    }
    
    // ========================================================================
    // TAB SWITCHING FUNCTIONALITY
    // ========================================================================
    
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
    
    // ========================================================================
    // INITIALIZE ON MOUNT
    // ========================================================================
    
    // Call initialization on page load
    initializeOnMount();
    
    // ========================================================================
    // FEATURE INITIALIZATION
    // ========================================================================
    
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
                    clearColumnSearchUI();
                    // Background worker will detect the new page type and broadcast result
                    // Wait for detection from background worker
                    const placeholder = document.getElementById('contextPlaceholder');
                    if (placeholder) {
                        placeholder.style.display = 'none';
                    }
                }
                // Also check when page finish loading (handles refreshes)
                else if (changeInfo.status === 'complete') {
                    console.log('[Side Panel] Active tab page loading complete');
                    // Background worker will detect/update page type and broadcast
                    const placeholder = document.getElementById('contextPlaceholder');
                    if (placeholder) {
                        placeholder.style.display = 'none';
                    }
                }
            }
        });
    });

    // Listen for copy detected signal from content script
    console.log('[Side Panel] Attaching storage listener...');
    
    // Track timer for auto-hiding suggestion actions
    let suggestionActionsHideTimer = null;
    
    // Helper function to hide suggestion actions and message
    function hideSuggestionActions() {
        const copyDetectedMessage = document.getElementById('copyDetectedMessage');
        const suggestionActions = document.getElementById('suggestionActionsSection');
        
        if (copyDetectedMessage) copyDetectedMessage.style.display = 'none';
        if (suggestionActions) suggestionActions.style.display = 'none';
        
        // Clear the auto-hide timer if it exists
        if (suggestionActionsHideTimer) {
            clearTimeout(suggestionActionsHideTimer);
            suggestionActionsHideTimer = null;
        }
        
        console.log('[Side Panel] Suggestion actions hidden');
    }
    
    // Attach dismiss button handler
    const dismissBtn = document.getElementById('dismissSuggestionActionsBtn');
    if (dismissBtn) {
        dismissBtn.addEventListener('click', () => {
            console.log('[Side Panel] Dismiss button clicked');
            hideSuggestionActions();
        });
    }
    
    chrome.storage.onChanged.addListener((changes, areaName) => {
        console.log('[Side Panel Storage Listener] Fired - areaName:', areaName, 'changes:', Object.keys(changes));
        
        if (areaName === 'session') {
            console.log('[Side Panel] Session storage changed, checking for copyDetected...');
            console.log('[Side Panel] changes object:', changes);
            
            if (changes.copyDetected) {
                console.log('[Side Panel] ✓ Copy detected signal received!', changes.copyDetected);
                const copyDetectedMessage = document.getElementById('copyDetectedMessage');
                const magicRecipesSection = document.getElementById('magicRecipesSection');
                const suggestionActions = document.getElementById('suggestionActionsSection');
                const placeholder = document.getElementById('contextPlaceholder');
                
                console.log('[Side Panel] Elements found:', {
                    copyDetectedMessage: !!copyDetectedMessage,
                    magicRecipesSection: !!magicRecipesSection,
                    suggestionActions: !!suggestionActions,
                    placeholder: !!placeholder
                });
                
                // newValue is a timestamp (number) when copy detected, undefined when removed
                const isDetected = typeof changes.copyDetected.newValue === 'number';
                
                if (isDetected) {
                    // Show the message and suggestion actions
                    if (placeholder) placeholder.style.display = 'none';
                    if (magicRecipesSection) magicRecipesSection.style.display = 'block';
                    if (copyDetectedMessage) copyDetectedMessage.style.display = 'block';
                    if (suggestionActions) suggestionActions.style.display = 'block';
                    console.log('[Side Panel] ✓ Copy detected UI shown');
                    
                    // Auto-hide after 20 seconds
                    if (suggestionActionsHideTimer) {
                        clearTimeout(suggestionActionsHideTimer);
                    }
                    suggestionActionsHideTimer = setTimeout(() => {
                        console.log('[Side Panel] Auto-hiding suggestion actions after 20 seconds');
                        hideSuggestionActions();
                    }, 20000);
                    
                } else {
                    // Hide when explicitly set to false OR when removed (newValue === undefined)
                    hideSuggestionActions();
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

    // Load and save tab title settings
    const toggleUpdateTabTitle = document.getElementById('toggleUpdateTabTitle');
    const tabTitleStripPatterns = document.getElementById('tabTitleStripPatterns');
    
    if (toggleUpdateTabTitle && tabTitleStripPatterns) {
        // Load settings from storage
        chrome.storage.local.get(['updateTabTitle', 'tabTitleStripPatterns'], function(settings) {
            toggleUpdateTabTitle.checked = settings.updateTabTitle !== false;
            tabTitleStripPatterns.value = settings.tabTitleStripPatterns || '';
        });

        // Save when checkbox changes
        toggleUpdateTabTitle.addEventListener('change', function() {
            chrome.storage.local.set({ updateTabTitle: toggleUpdateTabTitle.checked });
        });

        // Save when patterns textarea changes
        tabTitleStripPatterns.addEventListener('change', function() {
            chrome.storage.local.set({ tabTitleStripPatterns: tabTitleStripPatterns.value }, function() {
                // Reapply tab title with new patterns to active tab
                chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                    if (tabs.length > 0) {
                        chrome.runtime.sendMessage({
                            type: 'REAPPLY_TAB_TITLE',
                            tabId: tabs[0].id
                        }).catch(() => {
                            // Ignore errors
                        });
                    }
                });
            });
        });
    }

    // Clear Analyzer functionality
    clearAnalyzerBtn.addEventListener('click', async function() {
        chrome.tabs.query({ active: true, currentWindow: true }, async function(tabs) {
            if (tabs.length > 0) {
                const currentUrl = tabs[0].url;
                
                // Check if on analyzer page
                if (currentUrl && currentUrl.includes('/analyzer')) {
                    clearAnalyzerBtn.disabled = true;
                    clearAnalyzerBtn.textContent = 'Clearing...';
                    
                    try {
                        // Import the analyzer tools feature
                        const analyzerToolsFeature = await import('../content/features/feature-analyzer-tools.js');
                        const clearScript = analyzerToolsFeature.default.getClearColumnsScript();
                        
                        // Inject and execute the script
                        chrome.scripting.executeScript({
                            target: { tabId: tabs[0].id },
                            func: clearScript,
                            args: [toggleAutoSelectTable.checked]
                        }, function() {
                            if (chrome.runtime.lastError) {
                                console.error('[Side Panel] Execute error:', chrome.runtime.lastError);
                                clearAnalyzerBtn.disabled = false;
                                clearAnalyzerBtn.textContent = 'Clear All Analyzer Columns';
                                showMessage('Error executing clear command: ' + chrome.runtime.lastError.message, 'error');
                            } else {
                                console.log('[Side Panel] Clear script executed successfully');
                                showMessage('Clearing analyzer columns...', 'success');
                                setTimeout(() => {
                                    clearAnalyzerBtn.disabled = false;
                                    clearAnalyzerBtn.textContent = 'Clear All Analyzer Columns';
                                }, 3000);
                            }
                        });
                    } catch (err) {
                        console.error('[Side Panel] Error importing analyzer tools feature:', err);
                        clearAnalyzerBtn.disabled = false;
                        clearAnalyzerBtn.textContent = 'Clear All Analyzer Columns';
                        showMessage('Error loading analyzer tools: ' + err.message, 'error');
                    }
                } else {
                    showMessage('This feature only works on analyzer pages', 'warning');
                    console.log('Current URL:', currentUrl);
                }
            }
        });
    });

    // Analyzer Tools Section Toggle Handler
    const analyzerToolsSection = document.getElementById('analyzerToolsSection');
    const analyzerToolsHeader = document.getElementById('analyzerToolsHeader');
    const analyzerToolsToggleBtn = document.getElementById('analyzerToolsToggleBtn');
    const analyzerToolsContentWrapper = document.getElementById('analyzerToolsContentWrapper');

    // Toggle analyzer tools on header click
    analyzerToolsHeader.addEventListener('click', function() {
        const isExpanded = analyzerToolsContentWrapper.style.display !== 'none';
        analyzerToolsContentWrapper.style.display = isExpanded ? 'none' : 'block';
        analyzerToolsToggleBtn.textContent = isExpanded ? '+' : '−';
        
        // Save preference
        chrome.storage.local.set({ analyzerToolsExpanded: !isExpanded });
    });

    // Check current tab to show/hide analyzer tools section
    function checkAnalyzerPageContext() {
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (tabs.length > 0) {
                const currentUrl = tabs[0].url || '';
                // More precise check: must contain /analyzer AND be a domo domain
                const isAnalyzerPage = currentUrl.includes('.domo.com/') && currentUrl.includes('/analyzer');
                
                console.log('[Side Panel] Checking analyzer context. URL:', currentUrl, 'Is analyzer:', isAnalyzerPage);
                
                if (isAnalyzerPage) {
                    // Hide and clear placeholder for analyzer pages
                    const placeholder = document.getElementById('contextPlaceholder');
                    if (placeholder) {
                        placeholder.style.display = 'none';
                        placeholder.innerHTML = ''; // Clear any pending messages
                    }
                    
                    analyzerToolsSection.style.display = 'block';
                    
                    // Show analyzer tools content by default
                    analyzerToolsContentWrapper.style.display = 'block';
                    analyzerToolsToggleBtn.textContent = '−';
                } else {
                    analyzerToolsSection.style.display = 'none';
                }
            }
        });
    }

    // Check on initial load
    checkAnalyzerPageContext();

    // Listen for tab updates to show/hide based on current page
    chrome.tabs.onActivated.addListener(function(activeInfo) {
        // Small delay to ensure tab info is ready
        setTimeout(checkAnalyzerPageContext, 100);
    });

    // Also check when URL changes
    chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
        if (changeInfo.url) {
            // URL changed - recheck visibility
            checkAnalyzerPageContext();
        }
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
                
                console.log('[Side Panel] Requesting page type from content script (tab', tab.id + ')...');
                
                // Add timeout to handle cases where content script is completely broken
                const timeoutId = setTimeout(() => {
                    console.log('[Side Panel] Message send timeout');
                    resolve(null);
                }, 3000);
                
                chrome.tabs.sendMessage(
                    tab.id,
                    { action: 'GET_PAGE_TYPE' },
                    (response) => {
                        clearTimeout(timeoutId);
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
     * Update the context display in the header
     * Shows instance, page type, and object name/id
     */
    function updateContextDisplay(context) {
        const contextDisplay = document.getElementById('contextInfoDisplay');
        if (!contextDisplay) return;

        if (!context || !context.url) {
            contextDisplay.classList.add('context-hidden');
            return;
        }

        // Extract pageType from either format
        let pageType = context.pageType;
        if (!pageType && context.domoObject?.typeId) {
            const typeIdMap = {
                'DATAFLOW': 'MAGIC_ETL',
                'DATAFLOW_TYPE': 'MAGIC_ETL',
                'UNPUBLISHED_DATAFLOW': 'MAGIC_ETL',
                'MAGIC_ETL': 'MAGIC_ETL',
                'PAGE': 'PAGE',
                'CARD': 'CARD',
                'DATA_APP_VIEW': 'DATA_APP',
                'DATA_APP': 'DATA_APP',
                'WORKSHEET_VIEW': 'WORKSHEET',
                'USER': 'USER',
                'GROUP': 'GROUP',
                'WORKFLOW_MODEL': 'WORKFLOW'
            };
            pageType = typeIdMap[context.domoObject.typeId] || context.domoObject.typeId;
        }

        if (!pageType) {
            contextDisplay.classList.add('context-hidden');
            return;
        }

        // Extract instance from URL
        const instanceMatch = context.url.match(/https:\/\/([^.]+)\.domo\.com/);
        const instance = instanceMatch ? instanceMatch[1] : 'unknown';

        // Map page types to display names
        const pageTypeDisplay = {
            'MAGIC_ETL': '🔗 Magic ETL',
            'SQL_AUTHOR': '📊 SQL Author',
            'PAGE': '📄 Dashboard',
            'ANALYZER': '📈 Analyzer',
            'DATA_SOURCE': '💾 Data Source',
            'CARD': '📊 Card'
        };

        // Update chips
        const instanceChip = document.getElementById('instanceChip');
        const pageTypeChip = document.getElementById('pageTypeChip');
        
        if (instanceChip) {
            instanceChip.textContent = instance.toUpperCase();
            instanceChip.title = `Instance: ${instance}.domo.com`;
        }
        
        if (pageTypeChip) {
            pageTypeChip.textContent = pageTypeDisplay[pageType] || pageType;
            pageTypeChip.title = `Page Type: ${pageType}`;
        }

        // Update object info if available (from DomoObject metadata - now enriched by background)
        const contextName = document.getElementById('contextObjectName');
        const contextId = document.getElementById('contextObjectId');
        
        let displayName = null;
        let displayId = null;
        
        // Get name from DomoObject metadata (enriched by background via API)
        if (context.domoObject?.metadata?.name) {
          displayName = context.domoObject.metadata.name;
          displayId = context.domoObject.id;
          console.log('[Side Panel] ✓ Using enriched DomoObject name:', displayName);
        } else {
          console.log('[Side Panel] No enriched name available, metadata:', JSON.stringify(context.domoObject?.metadata));
        }
        
        // Fallback to type display
        if (!displayName && context.description) {
          const typeDisplay = context.description.isPage ? 'Dashboard Page' 
                            : context.description.isMagicETL ? 'Magic ETL Flow'
                            : context.description.isSQLAuthor ? 'SQL Query'
                            : 'Domo Page';
          displayName = typeDisplay;
          console.log('[Side Panel] Using type display fallback:', displayName);
        }
        
        // Final fallback
        if (!displayName) {
          displayName = pageType || 'Domo Page';
          console.log('[Side Panel] Using final fallback:', displayName);
        }
        
        if (contextName) {
          contextName.textContent = displayName;
        }
        if (contextId) {
          // Show the object ID if available
          if (displayId) {
            contextId.textContent = `ID: ${displayId}`;
          } else {
            // Try to extract ID from URL as fallback
            const idMatch = context.url?.match(/\/(\d+)/);
            if (idMatch) {
              contextId.textContent = `ID: ${idMatch[1]}`;
            } else {
              contextId.textContent = '';
            }
          }
        }

        // Show the context display
        contextDisplay.classList.remove('context-hidden');
    }
    
    /**
     * Handle context updates from background service worker
     * This is called when the page type is detected or changed
     */
    function handleContextUpdate(context) {
        if (!context) {
            console.log('[Side Panel] No context available');
            updateContextDisplay(null);
            return;
        }

        // Extract card ID for cache management - works for both CARD and ANALYZER contexts
        let cardId = null;
        
        // Support both old and new context formats
        let pageType = null;
        let objectInfo = null;

        // Old format: { pageType: 'MAGIC_ETL' }
        if (context.pageType) {
            pageType = context.pageType;
        }
        // New format: DomoContext with domoObject.typeId
        else if (context.domoObject?.typeId) {
            objectInfo = context.domoObject;
            const typeIdMap = {
                'DATAFLOW': 'MAGIC_ETL',
                'DATAFLOW_TYPE': 'MAGIC_ETL',
                'UNPUBLISHED_DATAFLOW': 'MAGIC_ETL',
                'MAGIC_ETL': 'MAGIC_ETL',
                'PAGE': 'PAGE',
                'CARD': 'CARD',
                'DATA_APP_VIEW': 'DATA_APP',
                'DATA_APP': 'DATA_APP',
                'WORKSHEET_VIEW': 'WORKSHEET',
                'USER': 'USER',
                'GROUP': 'GROUP',
                'WORKFLOW_MODEL': 'WORKFLOW'
            };
            pageType = typeIdMap[objectInfo.typeId] || objectInfo.typeId;
        }

        if (!pageType) {
            console.log('[Side Panel] No valid page type in context:', context);
            updateContextDisplay(null);
            return;
        }

        console.log(`[Side Panel] ✓ Detected: ${pageType}${objectInfo ? ` (${objectInfo.typeName} "${objectInfo.metadata?.name || objectInfo.id}")` : ''}`);
        
        // Update context display at top of panel
        updateContextDisplay(context);
        
        // Clear old UI
        clearColumnSearchUI();
        
        // Clear all sections and reset placeholder to default state
        const recipeSection = document.getElementById('magicRecipesSection');
        const placeholder = document.getElementById('contextPlaceholder');
        const analyzerSection = document.getElementById('analyzerToolsSection');
        
        if (recipeSection) recipeSection.style.display = 'none';
        if (analyzerSection) analyzerSection.style.display = 'none';
        
        // Reset placeholder to default state
        if (placeholder) {
            placeholder.style.display = 'none'; // Start hidden by default - CSS already hides it
            // Clear any previous error messages
            placeholder.innerHTML = '';
        }
        
        // Check if this is an analyzer page using the context URL - CHECK FIRST!
        const contextUrl = context?.url || '';
        console.log('[Side Panel] Checking analyzer context. URL:', contextUrl);
        const isAnalyzer = contextUrl.includes('/analyzer');
        console.log('[Side Panel] Is analyzer:', isAnalyzer);
        
        // ANALYZER PAGES FIRST - regardless of detected pageType
        if (isAnalyzer) {
            // Hide placeholder for analyzer pages
            if (placeholder) placeholder.style.display = 'none';
            
            // Show analyzer tools section
            if (analyzerSection) {
                analyzerSection.style.display = 'block';
                console.log('[Side Panel] Analyzer section displayed');
                
                // Directly show analyzer tools content
                const analyzerToolsContentWrapper = document.getElementById('analyzerToolsContentWrapper');
                const analyzerToolsToggleBtn = document.getElementById('analyzerToolsToggleBtn');
                if (analyzerToolsContentWrapper) {
                    analyzerToolsContentWrapper.style.display = 'block';
                    if (analyzerToolsToggleBtn) {
                        analyzerToolsToggleBtn.textContent = '−';
                    }
                    console.log('[Side Panel] Analyzer tools content wrapper shown');
                }
            }
            
            console.log('[Side Panel] Analyzer page detected');
        }
        // NOT an analyzer page - check page type for other features
        else if (pageType === 'MAGIC_ETL') {
            // Hide placeholder and show recipes for Magic ETL/Dataflow
            if (placeholder) placeholder.style.display = 'none';
            initializeMagicRecipes();
            initializeColumnSearch();
        } else if (pageType === 'SQL_AUTHOR' || pageType === 'SQL_DATAFLOW' || pageType === 'MYSQL_DATAFLOW' || pageType === 'DATAFLOW_TYPE') {
            // SQL/MySQL/other dataflow pages - same features as Magic ETL
            if (placeholder) placeholder.style.display = 'none';
            initializeMagicRecipes();
            initializeColumnSearch();
            console.log('[Side Panel] Dataflow page detected:', pageType);
        } else if (pageType === 'PAGE') {
            // Regular dashboard page - show placeholder
            if (placeholder) placeholder.style.display = 'block';
            console.log('[Side Panel] Dashboard page detected');
        } else if (pageType === 'CARD') {
            // Show placeholder for card pages
            if (placeholder) placeholder.style.display = 'block';
            console.log('[Side Panel] Card detected');
        } else if (pageType === 'DATA_APP' || pageType === 'WORKSHEET') {
            // Show placeholder for app studio
            if (placeholder) placeholder.style.display = 'block';
            console.log('[Side Panel] App Studio page detected');
        } else {
            // Show placeholder for unknown types
            if (placeholder) {
                placeholder.style.display = 'block';
                placeholder.innerHTML = `<p style="color: #999; font-size: 0.9em; text-align: center; padding: 20px 10px;">Domo Helper features not available on ${pageType} pages</p>`;
            }
            console.log('[Side Panel] Unknown page type:', pageType);
        }
    }
    
    /**
     * Initialize context-aware features based on current page type
     * Uses background service worker cached context (new domo-toolkit pattern)
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

        // Try to get cached context from background service worker first
        try {
            const tabId = tabs[0].id;
            const response = await chrome.runtime.sendMessage({ type: 'GET_TAB_CONTEXT', tabId });
            if (response?.context?.pageType) {
                console.log('[Side Panel] Using cached context from background:', response.context.pageType);
                handleContextUpdate(response.context);
                return;
            }
        } catch (error) {
            console.log('[Side Panel] Could not get cached context:', error.message);
        }

        // Fallback: Direct polling from content script if cache miss or empty
        // This handles fast init before background detection completes
        let retries = 0;
        const maxRetries = 5;
        const retryDelay = 500; // ms
        const initialDelay = 500; // ms - shorter since we have background detection helping now
        
        // Wait initial delay before first attempt
        await new Promise(r => setTimeout(r, initialDelay));
        
        while (retries < maxRetries) {
            const pageType = await getPageTypeFromContentScript();
            
            if (pageType) {
                console.log(`[Side Panel] ✓ Direct detection of page type: ${pageType}`);
                handleContextUpdate({ pageType });
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
        const suggestionActions = document.getElementById('suggestionActionsSection');
        
        console.log('initializeMagicRecipes called');
        console.log('saveRecipeBtn element:', saveRecipeBtn);
        
        if (!recipeSection) return;
        
        // Show the magic recipes section and hide the placeholder
        recipeSection.style.display = 'block';
        if (placeholder) {
            placeholder.style.display = 'none';
        }
        
        // Keep suggestion actions hidden initially - only show when user copies to clipboard
        if (suggestionActions) {
            suggestionActions.style.display = 'none';
        }
        
        // Load and display recipes initially
        loadMagicRecipes(recipesList);
        setupRecipeToggle();
        setupColumnSearchToggle();
        
        // Initialize node alignment (only visible on Magic ETL pages)
        initializeNodeAlignmentFeature();
        
        // Save recipe button handler
        saveRecipeBtn.addEventListener('click', function() {
            console.log('Save Recipe button clicked!');
            
            // Hide suggestion actions
            const suggestionActions = document.getElementById('suggestionActionsSection');
            if (suggestionActions) {
                suggestionActions.style.display = 'none';
            }
            
            // Request clipboard data from content script
            chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                if (tabs.length > 0) {
                    chrome.tabs.sendMessage(tabs[0].id, { 
                        action: 'READ_RECIPE_CLIPBOARD' 
                    }, function(response) {
                        if (chrome.runtime.lastError) {
                            console.error('Error reading clipboard:', chrome.runtime.lastError.message);
                            showMessage('Could not read clipboard. Make sure you clicked Copy on the canvas first.', 'error');
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
                                showMessage('Clipboard does not contain valid recipe data.', 'error');
                            }
                        } else {
                            showMessage('Could not read clipboard. Make sure you clicked Copy on the canvas first.', 'error');
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
                showMessage('Please provide both a title and description.', 'warning');
                return;
            }
            
            if (!window.currentRecipeData) {
                showMessage('No recipe data available. Please click Copy again.', 'error');
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
                        showMessage('Error saving recipe: ' + chrome.runtime.lastError.message, 'error');
                    } else {
                        console.log('Recipe saved successfully!');
                        
                        // Hide form and reload recipes list
                        document.getElementById('recipeFormSection').style.display = 'none';
                        loadMagicRecipes(recipesList);
                        
                        // Reset current recipe data
                        window.currentRecipeData = null;
                        
                        showMessage('Recipe saved successfully!', 'success');
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
     * Setup column search toggle
     */
    function setupColumnSearchToggle() {
        const toggleBtn = document.getElementById('columnSearchToggleBtn');
        const contentWrapper = document.getElementById('columnSearchContentWrapper');
        const header = document.getElementById('columnSearchHeader');
        
        if (toggleBtn && contentWrapper && header) {
            // Header click: expand if collapsed
            header.addEventListener('click', function(e) {
                if (e.target === toggleBtn) return; // Ignore button clicks
                if (contentWrapper.style.display === 'none') {
                    contentWrapper.style.display = 'block';
                    toggleBtn.textContent = '−';
                }
            });
            
            // Button click: collapse if expanded
            toggleBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (contentWrapper.style.display !== 'none') {
                    contentWrapper.style.display = 'none';
                    toggleBtn.textContent = '+';
                }
            });
        }
    }

    /**
     * Setup recipe section toggle
     */
    function setupRecipeToggle() {
        const toggleBtn = document.getElementById('recipeToggleBtn');
        const contentWrapper = document.getElementById('recipeContentWrapper');
        const header = document.getElementById('recipeHeader');
        
        if (toggleBtn && contentWrapper && header) {
            // Header click: expand if collapsed
            header.addEventListener('click', function(e) {
                if (e.target === toggleBtn) return; // Ignore button clicks
                if (contentWrapper.style.display === 'none') {
                    contentWrapper.style.display = 'block';
                    toggleBtn.textContent = '−';
                }
            });
            
            // Button click: collapse if expanded
            toggleBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (contentWrapper.style.display !== 'none') {
                    contentWrapper.style.display = 'none';
                    toggleBtn.textContent = '+';
                }
            });
        }
    }

    /**
     * Setup node alignment toggle
     */
    function setupNodeAlignmentToggle() {
        const toggleBtn = document.getElementById('nodeAlignToggleBtn');
        const contentWrapper = document.getElementById('nodeAlignContentWrapper');
        const header = document.getElementById('nodeAlignHeader');
        
        if (toggleBtn && contentWrapper && header) {
            // Header click: expand if collapsed
            header.addEventListener('click', function(e) {
                if (e.target === toggleBtn) return; // Ignore button clicks
                if (contentWrapper.style.display === 'none') {
                    contentWrapper.style.display = 'block';
                    toggleBtn.textContent = '−';
                }
            });
            
            // Button click: collapse if expanded
            toggleBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (contentWrapper.style.display !== 'none') {
                    contentWrapper.style.display = 'none';
                    toggleBtn.textContent = '+';
                }
            });
        }
    }

    /**
     * Initialize Node Alignment feature
     */
    function initializeNodeAlignment() {
        const section = document.getElementById('nodeAlignmentSection');
        if (!section) return;

        // Buttons
        const centerVerticalBtn = document.getElementById('centerVerticalBtn');
        const centerHorizontalBtn = document.getElementById('centerHorizontalBtn');
        const statusDiv = document.getElementById('nodeAlignStatus');

        if (!centerVerticalBtn || !centerHorizontalBtn) return;

        // Helper to show status message
        const showStatus = (message, type = 'info') => {
            if (statusDiv) {
                statusDiv.textContent = message;
                statusDiv.style.display = 'block';
                if (type === 'success') {
                    statusDiv.style.color = 'var(--accent-color)';
                } else if (type === 'error') {
                    statusDiv.style.color = '#f44336';
                } else {
                    statusDiv.style.color = 'var(--text-secondary)';
                }
                setTimeout(() => {
                    statusDiv.style.display = 'none';
                }, 3000);
            }
        };

        // helper to send message to content script
        const sendAlignmentMessage = (action) => {
            chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                if (tabs.length > 0) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: 'NODE_ALIGN',
                        alignAction: action
                    }, function(response) {
                        if (chrome.runtime.lastError) {
                            showStatus('Error: Content script not responding', 'error');
                        } else if (response && response.success) {
                            showStatus(response.message, 'success');
                        } else if (response && response.error) {
                            showStatus(response.error, 'error');
                        }
                    });
                }
            });
        };

        // Button event listeners
        if (centerVerticalBtn) {
            centerVerticalBtn.addEventListener('click', function() {
                sendAlignmentMessage('centerVertically');
            });
        }

        if (centerHorizontalBtn) {
            centerHorizontalBtn.addEventListener('click', function() {
                sendAlignmentMessage('centerHorizontally');
            });
        }
    }

    /**
     * Initialize and setup node alignment feature
     * Shows section only on Magic ETL pages
     */
    function initializeNodeAlignmentFeature() {
        const section = document.getElementById('nodeAlignmentSection');
        if (!section) return;

        // Check if we're on a Magic ETL page
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (tabs.length > 0) {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'GET_PAGE_TYPE' }, function(response) {
                    if (chrome.runtime.lastError) {
                        // Content script not available
                        section.style.display = 'none';
                        return;
                    }
                    
                    // Show section only on Magic ETL pages
                    if (response && response.pageType === 'MAGIC_ETL') {
                        section.style.display = 'block';
                        setupNodeAlignmentToggle();
                        initializeNodeAlignment();
                    } else {
                        section.style.display = 'none';
                    }
                });
            }
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
                            <button class="recipe-btn recipe-edit" data-recipe-title="${escapeHtml(recipe.title)}" title="Edit recipe">✏️</button>
                            <button class="recipe-btn recipe-delete" data-recipe-title="${escapeHtml(recipe.title)}" title="Delete recipe">🗑️</button>
                        </div>
                    `;
                    
                    // Insert button handler
                    item.querySelector('.recipe-insert').addEventListener('click', function() {
                        const title = this.getAttribute('data-recipe-title');
                        insertMagicRecipe(title);
                    });
                    
                    // Edit button handler
                    item.querySelector('.recipe-edit').addEventListener('click', function() {
                        const title = this.getAttribute('data-recipe-title');
                        editMagicRecipe(title, container);
                    });
                    
                    // Delete button handler
                    item.querySelector('.recipe-delete').addEventListener('click', async function() {
                        const title = this.getAttribute('data-recipe-title');
                        const confirmed = await showConfirmation('Delete Recipe', `Delete recipe "${title}"?`);
                        if (confirmed) {
                            deleteMagicRecipe(title, container);
                        }
                    });
                    
                    container.appendChild(item);
                });
                
                // Setup search functionality
                const searchInput = document.querySelector('#recipeSearchInput');
                const searchClearBtn = document.querySelector('#recipeSearchClearBtn');
                
                if (searchInput && !searchInput.hasAttribute('data-listener-attached')) {
                    searchInput.setAttribute('data-listener-attached', 'true');
                    
                    searchInput.addEventListener('input', function() {
                        const searchTerm = this.value.toLowerCase();
                        searchClearBtn.style.display = searchTerm ? 'block' : 'none';
                        
                        const recipeItems = container.querySelectorAll('.recipe-item');
                        recipeItems.forEach(item => {
                            const title = item.querySelector('.recipe-title').textContent.toLowerCase();
                            const description = item.querySelector('.recipe-description').textContent.toLowerCase();
                            
                            const matches = searchTerm === '' || title.includes(searchTerm) || description.includes(searchTerm);
                            item.style.display = matches ? 'flex' : 'none';
                        });
                    });
                    
                    if (searchClearBtn) {
                        searchClearBtn.addEventListener('click', function() {
                            searchInput.value = '';
                            searchInput.dispatchEvent(new Event('input'));
                            searchInput.focus();
                        });
                    }
                }
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
                showMessage('Recipe not found', 'error');
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
                                recipeData: recipe.recipe,
                                recipeTitle: title
                            }, function(response) {
                                if (chrome.runtime.lastError) {
                                    console.error('Error inserting recipe:', chrome.runtime.lastError.message);
                                    showMessage('Could not insert recipe. Are you on a Magic ETL page?', 'error');
                                } else if (response && response.success) {
                                    showMessage('Recipe inserted successfully!', 'success');
                                }
                            });
                        }, 500);
                    });
                }
            });
        });
    }

    /**
     * Edit a Magic Recipe
     */
    function editMagicRecipe(title, container) {
        chrome.storage.local.get(['MagicETLRecipes'], function(result) {
            const recipes = result.MagicETLRecipes || {};
            const recipe = recipes[title];
            
            if (!recipe) {
                showMessage('Recipe not found', 'error');
                return;
            }
            
            // Create edit modal
            const modalOverlay = document.createElement('div');
            modalOverlay.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(0, 0, 0, 0.7); z-index: 10000; display: flex; align-items: center; justify-content: center;';
            
            const modalContent = document.createElement('div');
            modalContent.style.cssText = 'background-color: var(--surface-dark); border-radius: 8px; padding: 24px; max-width: 500px; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5); width: 90%;';
            
            modalContent.innerHTML = `
                <h3 style="margin-top: 0; color: var(--text-primary);">Edit Recipe</h3>
                <div style="margin-bottom: 16px;">
                    <label for="editRecipeTitle" style="display: block; color: var(--text-primary); margin-bottom: 6px; font-weight: 500;">Title:</label>
                    <input type="text" id="editRecipeTitle" style="width: 100%; padding: 8px; background-color: var(--surface-light); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; font-size: 13px; box-sizing: border-box;" value="${escapeHtml(recipe.title)}">
                </div>
                <div style="margin-bottom: 20px;">
                    <label for="editRecipeDescription" style="display: block; color: var(--text-primary); margin-bottom: 6px; font-weight: 500;">Description:</label>
                    <textarea id="editRecipeDescription" style="width: 100%; padding: 8px; background-color: var(--surface-light); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; font-size: 13px; box-sizing: border-box; min-height: 80px; resize: vertical;" placeholder="Enter recipe description">${escapeHtml(recipe.description)}</textarea>
                </div>
                <div style="display: flex; gap: 12px; justify-content: flex-end;">
                    <button id="editCancel" style="padding: 8px 16px; background-color: var(--surface-light); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; cursor: pointer; font-size: 13px;">Cancel</button>
                    <button id="editSave" style="padding: 8px 16px; background-color: var(--primary-color); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;">Save</button>
                </div>
            `;
            
            modalOverlay.appendChild(modalContent);
            document.body.appendChild(modalOverlay);
            
            const titleInput = document.getElementById('editRecipeTitle');
            const descInput = document.getElementById('editRecipeDescription');
            const cancelBtn = document.getElementById('editCancel');
            const saveBtn = document.getElementById('editSave');
            
            // Focus on title input
            titleInput.focus();
            titleInput.select();
            
            // Cancel handler
            cancelBtn.addEventListener('click', () => {
                document.body.removeChild(modalOverlay);
            });
            
            // Save handler
            saveBtn.addEventListener('click', () => {
                const newTitle = titleInput.value.trim();
                const newDescription = descInput.value.trim();
                
                if (!newTitle) {
                    showMessage('Title cannot be empty', 'warning');
                    return;
                }
                
                if (!newDescription) {
                    showMessage('Description cannot be empty', 'warning');
                    return;
                }
                
                // If title changed, we need to delete old and create new
                if (newTitle !== title) {
                    delete recipes[title];
                }
                
                // Save the updated recipe
                recipes[newTitle] = {
                    title: newTitle,
                    description: newDescription,
                    recipe: recipe.recipe,
                    timestamp: recipe.timestamp
                };
                
                chrome.storage.local.set({ MagicETLRecipes: recipes }, function() {
                    if (chrome.runtime.lastError) {
                        showMessage('Error saving recipe: ' + chrome.runtime.lastError.message, 'error');
                    } else {
                        showMessage('Recipe updated successfully!', 'success');
                        document.body.removeChild(modalOverlay);
                        loadMagicRecipes(container);
                    }
                });
            });
            
            // Allow pressing Escape to close
            const handleKeyDown = (e) => {
                if (e.key === 'Escape') {
                    document.removeEventListener('keydown', handleKeyDown);
                    document.body.removeChild(modalOverlay);
                }
            };
            document.addEventListener('keydown', handleKeyDown);
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
                    showMessage('Error deleting recipe: ' + chrome.runtime.lastError.message, 'error');
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
        const searchTileNames = document.getElementById('filterTileNames')?.checked ?? false;
        const includeSelectColumns = document.getElementById('filterSelectColumns')?.checked ?? true;
        const includeInputOutput = document.getElementById('filterInputOutput')?.checked ?? true;
        
        return {
            caseSensitive,
            exactMatch,
            searchTileNames,
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
            showMessage('Please enter a column name to search for.', 'warning');
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
