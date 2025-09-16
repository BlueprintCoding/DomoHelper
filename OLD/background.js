chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    if (changeInfo.status === 'complete' && /^https/.test(tab.url)) {
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

chrome.tabs.onActivated.addListener(function(activeInfo) {
    chrome.tabs.get(activeInfo.tabId, function(tab) {
        if (/^https/.test(tab.url)) {
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
