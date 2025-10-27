// Function to check if the tab's URL matches the specified domains
function isDomoDomain(url) {
    const domoRegex = /^https:\/\/.*\.domo\.com\//;
    return domoRegex.test(url);
}

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
                chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    files: ['content.js']
                }, function() {
                    if (chrome.runtime.lastError) {
                        console.error(chrome.runtime.lastError.message);
                    } else {
                        console.log('Scripts injected successfully onUpdated');
                    }
                });
            }
        });
    }
});

// Listen for tab activation
chrome.tabs.onActivated.addListener(function(activeInfo) {
    chrome.tabs.get(activeInfo.tabId, function(tab) {
        if (isDomoDomain(tab.url)) {
            console.log('Injecting scripts onActivated:', tab.url);
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['jquery-3.7.1.min.js']
            }, function() {
                if (chrome.runtime.lastError) {
                    console.error(chrome.runtime.lastError.message);
                } else {
                    chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ['content.js']
                    }, function() {
                        if (chrome.runtime.lastError) {
                            console.error(chrome.runtime.lastError.message);
                        } else {
                            console.log('Scripts injected successfully onActivated');
                        }
                    });
                }
            });
        }
    });
});

// Optional: DevTools Protocol based drag (requires user gesture to attach debugger)
chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
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