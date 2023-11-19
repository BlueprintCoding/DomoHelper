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

// Function to update the placeholder text and toggle save button state
function updateModal(descriptionTextArea, minWords) {
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
    // Run the observer continuously instead of disconnecting
    mutations.forEach((mutation) => {
        if (mutation.addedNodes.length) {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === Node.ELEMENT_NODE && 
                    (node.matches('.modal') || node.querySelector('.modal'))) {
                    // Modal has been added to the DOM
                    console.log("Modal opened.");
                    initOrUpdateModal();
                }
            });
        }
    });
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});


// Initialize or update modal when either 'Save' or 'Save and Run' is clicked
var saveButtons = document.querySelectorAll('.db-split-button button.primary-button, .popover-wrapper .menu-list .db-dropdown-list-item');
saveButtons.forEach(button => {
    button.addEventListener('click', initOrUpdateModal);
});