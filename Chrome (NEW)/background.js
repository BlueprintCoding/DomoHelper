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
