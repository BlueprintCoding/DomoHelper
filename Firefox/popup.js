document.addEventListener('DOMContentLoaded', function() {
    const toggleFunctionality = document.getElementById('toggleFunctionality');
    const wordCount = document.getElementById('wordCount');

    // Load saved settings and update the popup UI
    browser.storage.local.get(['enabled', 'minWords'], function(result) {
        toggleFunctionality.checked = result.enabled !== false; // default to true
        wordCount.value = result.minWords || 5;
    });

    toggleFunctionality.addEventListener('change', function() {
        const settings = {enabled: toggleFunctionality.checked};
        browser.storage.local.set(settings);
        sendMessageToContentScript(settings);
    });

    wordCount.addEventListener('input', function() {
        const settings = {minWords: parseInt(wordCount.value, 10)};
        browser.storage.local.set(settings);
        sendMessageToContentScript(settings);
    });

    function sendMessageToContentScript(settings) {
        browser.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if (tabs[0]) {
                browser.tabs.sendMessage(tabs[0].id, {type: "settingsChanged", settings: settings});
            }
        });
    }
});
