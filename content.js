console.log("Content script loaded");

// Function to check if the text area has at least a certain number of words
function hasMinimumWordCount(text, minWords) {
    return text.split(/\s+/).filter(word => word.length > 0).length >= minWords;
}

// Global variable to keep track of the current toggle function
let currentToggleSaveButton;

// Function to create toggle save button function
function createToggleSaveButton(descriptionTextArea, minWords) {
    return function() {
        var saveButton = document.querySelector('button.done.float-right.db-button');
        if (saveButton) {
            saveButton.disabled = !hasMinimumWordCount(descriptionTextArea.value, minWords);
        }
    };
}

// Function to initialize the logic for the modal
function initModal() {
    var descriptionTextArea = document.querySelector('textarea.input.margin-vertical-medium');

    if (descriptionTextArea) {
        // Change the placeholder text
        descriptionTextArea.placeholder = `Version Description (Minimum of ${minWords} words Required by Domo Helper Extension)`;
        
        // Update the event listener
        if (currentToggleSaveButton) {
            descriptionTextArea.removeEventListener('input', currentToggleSaveButton);
        }
        currentToggleSaveButton = createToggleSaveButton(descriptionTextArea, minWords);
        descriptionTextArea.addEventListener('input', currentToggleSaveButton);

        // Call the toggle function immediately to set the initial state of the save button
        currentToggleSaveButton();
    } else {
        console.log("Required elements not found");
    }
}

// Default settings
let enabled = true;
let minWords = 5;

// Apply settings
function applySettings(settings) {
    if (settings.enabled !== undefined) {
        enabled = settings.enabled;
    }
    if (settings.minWords !== undefined) {
        minWords = settings.minWords;
    }

    // Reinitialize modal if it's open
    var descriptionTextArea = document.querySelector('textarea.input.margin-vertical-medium');
    if (descriptionTextArea) {
        descriptionTextArea.placeholder = `Version Description (Minimum of ${minWords} words Required by Domo Helper Extension)`;
        initModal(); // Reinitialize to update event listener
    }
}

// Listen for messages from the popup script
browser.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    if (message.type === "settingsChanged") {
        applySettings(message.settings);
    }
});

// Load settings and initialize
browser.storage.local.get(['enabled', 'minWords'], function(settings) {
    enabled = settings.enabled !== false; // default to true
    minWords = settings.minWords || 5;
    // Optionally initialize the modal here if needed
});

// MutationObserver setup
const observer = new MutationObserver((mutations, obs) => {
    const descriptionTextArea = document.querySelector('textarea.input.margin-vertical-medium');
    if (descriptionTextArea) {
        console.log("Found necessary elements. Initializing...");
        initModal();
        obs.disconnect(); // Stop observing after initialization
    }
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});