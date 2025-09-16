
document.addEventListener('DOMContentLoaded', function() {
    // Existing popup.js logic here
document.addEventListener('DOMContentLoaded', function() {
    const toggleFunctionality = document.getElementById('toggleFunctionality');
    const wordCount = document.getElementById('wordCount');

    // Load saved settings and update the popup UI
    chrome.storage.local.get(['enabled', 'minWords'], function(result) {
        toggleFunctionality.checked = result.enabled !== false; // default to true
        wordCount.value = result.minWords || 5;
    });

    toggleFunctionality.addEventListener('change', function() {
        const settings = {enabled: toggleFunctionality.checked};
        chrome.storage.local.set(settings);
        sendMessageToContentScript(settings);
    });

    wordCount.addEventListener('input', function() {
        const settings = {minWords: parseInt(wordCount.value, 10)};
        chrome.storage.local.set(settings);
        sendMessageToContentScript(settings);
    });

    function sendMessageToContentScript(settings) {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {type: "settingsChanged", settings: settings});
            }
        });
    }
});

    const hideBuzz = document.getElementById('hideBuzz');

    // Load the saved state for "Hide Buzz" and update the checkbox
    chrome.storage.local.get('hideBuzz', function(result) {
        hideBuzz.checked = result.hideBuzz || false;
    });

    // Event listener for the "Hide Buzz" checkbox
    hideBuzz.addEventListener('change', function() {
        const settings = {hideBuzz: hideBuzz.checked};
        chrome.storage.local.set(settings);
        sendMessageToContentScript(settings);
    });

    // Function to send a message to the content script
    function sendMessageToContentScript(settings) {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {type: "settingsChanged", settings: settings});
            }
        });
    }

});
