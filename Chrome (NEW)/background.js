// Function to check if the tab's URL matches the specified domains
function isDomoDomain(url) {
    const domoRegex = /^https:\/\/.*\.domo\.com\//;
    return domoRegex.test(url);
}

// Handle extension icon click - open side panel
chrome.action.onClicked.addListener((tab) => {
    chrome.sidePanel.open({ tabId: tab.id });
});

// Listen for tab updates
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    if (changeInfo.status === 'complete' && isDomoDomain(tab.url)) {
        console.log('Injecting scripts onUpdated:', tab.url);
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['jquery-3.7.1.min.js']
        }, function() {
            if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError.message);
            } else {
                // content-main.js is already injected via manifest.json content_scripts
                // No need to manually inject here
                console.log('Domo page detected onUpdated, content script already injected');
            }
        });
    }
});

// Listen for tab activation
chrome.tabs.onActivated.addListener(function(activeInfo) {
    chrome.tabs.get(activeInfo.tabId, function(tab) {
        if (isDomoDomain(tab.url)) {
            console.log('Tab activated:', tab.url);
            // content-main.js is already injected via manifest.json content_scripts
            // jQuery is loaded by content-main.js, no separate injection needed
        }
    });
});

// Optional: DevTools Protocol based drag (requires user gesture to attach debugger)
chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
    console.log('[Background] Message received:', msg.action || msg.type);
    
    // Handle magic recipe copy detection
    if (msg?.action === 'magicRecipeCopyDetected') {
        console.log('[Background] Setting copyDetected flag in session storage');
        chrome.storage.session.set({ copyDetected: true }, () => {
            if (chrome.runtime.lastError) {
                console.error('[Background] Error setting session storage:', chrome.runtime.lastError);
            } else {
                console.log('[Background] copyDetected flag set successfully');
            }
            sendResponse({ ok: true });
        });
        return true; // keep channel open for async response
    }
    
    if (msg?.type === 'DH_DEBUGGER_DRAG' && sender.tab && sender.tab.id) {
        try {
            const tabId = sender.tab.id;
            // Promisified wrappers for chrome.debugger
            const dbgAttach = (target, version) => new Promise((res, rej) => {
                chrome.debugger.attach(target, version, () => {
                    if (chrome.runtime.lastError) return rej(new Error(chrome.runtime.lastError.message));
                    res();
                });
            });
            const dbgSend = (target, method, params) => new Promise((res, rej) => {
                chrome.debugger.sendCommand(target, method, params, (result) => {
                    if (chrome.runtime.lastError) return rej(new Error(chrome.runtime.lastError.message));
                    res(result);
                });
            });
            const dbgDetach = (target) => new Promise((res) => {
                chrome.debugger.detach(target, () => res());
            });

            // Attach debugger (needs user gesture context in some cases)
            await dbgAttach({ tabId }, '1.3');
            await dbgSend({ tabId }, 'Input.dispatchMouseEvent', { type: 'mousePressed', x: msg.startX, y: msg.startY, button: 'left', clickCount: 1 });
            const steps = msg.steps || 10;
            for (let i = 1; i <= steps; i++) {
                const t = i / steps;
                const x = Math.round(msg.startX + (msg.endX - msg.startX) * t);
                const y = Math.round(msg.startY + (msg.endY - msg.startY) * t);
                await dbgSend({ tabId }, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: 1 });
            }
            await dbgSend({ tabId }, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x: msg.endX, y: msg.endY, button: 'left', clickCount: 1 });
            await dbgDetach({ tabId });
            sendResponse({ ok: true });
        } catch (e) {
            try { await new Promise(res => chrome.debugger.detach({ tabId: sender.tab.id }, () => res())); } catch {}
            sendResponse({ ok: false, error: e?.message || String(e) || 'Unknown debugger error' });
        }
        return true; // keep channel open
    }
});