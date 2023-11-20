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
        var saveButton = document.querySelector('.modal-footer .df-save-footer button.done');
        if (saveButton) {
            saveButton.disabled = !hasMinimumWordCount(descriptionTextArea.value, minWords);
        }
    };
}

// Function to update the placeholder text, toggle save button state, and show required word count
function updateModal(descriptionTextArea, minWords) {
    // Change the placeholder text
    descriptionTextArea.placeholder = `Version Description (Required)`;

    // Add or update the word count message below the textarea
    let wordCountMessage = descriptionTextArea.nextElementSibling;
    const wordCountMessageId = 'word-count-message';
    if (!wordCountMessage || wordCountMessage.id !== wordCountMessageId) {
        // If the word count message doesn't exist or isn't the right element, create it
        wordCountMessage = document.createElement('div');
        wordCountMessage.id = wordCountMessageId;
        wordCountMessage.style.color = 'LightGray';
        wordCountMessage.style.marginTop = '-15px';
        descriptionTextArea.parentNode.insertBefore(wordCountMessage, descriptionTextArea.nextSibling);
    }
    wordCountMessage.textContent = `A minimum of ${minWords} words is required by the Domo Helper Extension.`;

    // Update the event listener
    if (currentToggleSaveButton) {
        descriptionTextArea.removeEventListener('input', currentToggleSaveButton);
    }
    currentToggleSaveButton = createToggleSaveButton(descriptionTextArea, minWords);
    descriptionTextArea.addEventListener('input', currentToggleSaveButton);

    // Call the toggle function immediately to set the initial state of the save button
    currentToggleSaveButton();
}

// Function to initialize or update the logic for the modal
function initOrUpdateModal() {
    var descriptionTextArea = document.querySelector('.modal .input.margin-vertical-medium');

    if (descriptionTextArea) {
        updateModal(descriptionTextArea, minWords);
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
    initOrUpdateModal();
}

// Listen for messages from the popup script
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    if (message.type === "settingsChanged") {
        applySettings(message.settings);
    }
});

// Load settings and initialize
chrome.storage.local.get(['enabled', 'minWords'], function(settings) {
    enabled = settings.enabled !== false; // default to true
    minWords = settings.minWords || 5;
});

// Initialize or update modal when either 'Save' or 'Save and Run' is clicked
var saveButtons = document.querySelectorAll('.db-split-button button.primary-button, .popover-wrapper .menu-list .db-dropdown-list-item');
saveButtons.forEach(button => {
    button.addEventListener('click', initOrUpdateModal);
});

// Function to hide or show the Buzz elements
function toggleBuzzVisibility(hideBuzz) {
    const buzzButton = document.getElementById('BuzzAnchor');
    const buzzContainer = document.querySelector('buzz-container');

    if (buzzButton) buzzButton.style.display = hideBuzz ? 'none' : '';
    if (buzzContainer) buzzContainer.style.display = hideBuzz ? 'none' : '';
}

// Listening for messages from the popup script and checking the initial state of the "Hide Buzz" setting
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.type === "settingsChanged") {
        toggleBuzzVisibility(request.settings.hideBuzz);
    }
});

chrome.storage.local.get('hideBuzz', function(result) {
    toggleBuzzVisibility(result.hideBuzz);
});

// Combined MutationObserver for both modal and Buzz elements
const combinedObserver = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
        if (mutation.addedNodes.length) {
            mutation.addedNodes.forEach((node) => {
                // Check for modal
                if (node.nodeType === Node.ELEMENT_NODE && 
                    (node.matches('.modal') || node.querySelector('.modal'))) {
                    console.log("Modal opened.");
                    initOrUpdateModal();
                }
            });

            // Check for Buzz elements
            chrome.storage.local.get('hideBuzz', function(result) {
                toggleBuzzVisibility(result.hideBuzz);
            });
        }
    });
});

// Start observing the document body for added nodes
combinedObserver.observe(document.body, { childList: true, subtree: true });