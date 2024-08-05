
document.addEventListener('DOMContentLoaded', function() {
    const toggleFunctionality = document.getElementById('toggleFunctionality');
    const toggleRemoveLinks = document.getElementById('toggleRemoveLinks');
    const toggleVersionNotes = document.getElementById('toggleVersionNotes');
    const wordCount = document.getElementById('wordCount');

    // Load settings
    chrome.storage.local.get(['enabled', 'removeLinks', 'forceVersionNotes', 'minWords'], function(settings) {
        toggleFunctionality.checked = settings.enabled !== false; // default to true
        toggleRemoveLinks.checked = settings.removeLinks || false;
        toggleVersionNotes.checked = settings.forceVersionNotes || false;
        wordCount.value = settings.minWords || 5;
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
});