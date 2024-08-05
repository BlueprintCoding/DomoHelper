console.log("Content script loaded");

$(document).ready(function() {
    const url = window.location.href;
    const isPage = url.includes('/page/');
    const isGraph = url.endsWith('graph');
    const isAuthor = url.includes('author');
    console.log(isAuthor);
    if (isPage) {
        // Append the modal HTML to the body
        $('head').append(`
            <style>
                .modal-dialog-centered {
                    align-items: center;
                    justify-content: center;
                    position: absolute;
                    z-index: 99999;
                    top: 40%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: white;
                    width: 50%;
                    margin: 0 auto;                    
                    box-shadow: 0 4px 12px rgba(0, 0, 0, .1);
                    border-radius: 3px 3px 3px 3px;
                }
                .modal-custom {
                    display: none;
                    font-family: Open Sans, Helvetica Neue, Arial, Helvetica, sans-serif;
                }
                .modal-fade {
                    z-index: 2000; 
                    display: none;
                    align-items: center;
                    background-color: rgba(51, 51, 51, .5);
                    background-color: rgba(var(--colorGray1_raw), .5);
                    height: 100%;
                    justify-content: center;
                    left: 0;
                    position: fixed;
                    top: 0;
                    width: 100%;
                }
                .modal-header {
                    border-bottom: 1px solid rgba(0, 0, 0, .1);
                    border-top: 8px solid rgb(153 204 238);
                    border-radius: 3px 3px 0 0;
                }
                .modal-title {
                    font-size: 20px;
                    font-weight: 600;
                    color: rgba(0, 0, 0, .8);
                    padding: 22px 52px 16px 24px;
                    margin-top:0px
                }
                .authorNote {
                    text-align: left;
                    font-size: .7em;
                    margin: 0;
                    padding-top: 5px;
                    opacity: 70%;
                }
                .modal-footer {
                    align-items: center;
                    box-sizing: border-box;
                    display: flex;
                    flex-shrink: 0;
                    height: 40px;
                    justify-content: flex-end;
                    padding-right: 24px;
                    padding-bottom: 24px;
                    padding-top: 50px;
                }
                .footnote {
                    text-align: left;
                }
                .modal-body {
                    padding: 24px 24px 2px 24px;
                    min-height: 50px;
                }
                .details-landing {
                    resize: none;
                }
            </style>
        `);

        $('body').append(`
            <div class="modal fade modal-custom" id="fontColorModal" tabindex="-1" role="dialog" aria-labelledby="fontColorModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-dialog-centered" role="document">
                    <div class="modal-content">
                        <button id="bits-modal-close-button" class="db-text-button Modal-module_closeX__UCijY Button-module_button__7BLGt Button-module_default__utLb- Button-module_text__unL1r" type="button" aria-label="Close dialog">
                            <span class="Button-module_content__b7-cz">
                                <i role="presentation" class="db-icon icon-x md"></i>
                            </span>
                        </button>
                        <div class="modal-header">
                            <h5 class="modal-title" id="fontColorModalLabel">Full Text Value</h5>
                        </div>
                        <div class="modal-body">
                            <textarea readonly id="fontColorValue" class="details-landing DfSaveModalContentsWithTriggering_textarea_Sp86n Textarea-module_textarea__Etl2x"></textarea>
                            <p class="authorNote footnote">Full Text Modal created by Domo Helper Browser Extension.</p>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="db-text-button Button-module_button__7BLGt Button-module_default__utLb- Button-module_raised__IpSHu copy-button" id="copyToClipboardButton">Copy to Clipboard</button>
                            <button type="button" class="db-text-button Button-module_button__7BLGt Button-module_primary__TrzCx Button-module_raised__IpSHu" id="closeModalButton">Close</button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="modal-fade" id="modalBackground" role="presentation"></div>
        `);

        // Copy to Clipboard functionality
        $(document).on("click", "#copyToClipboardButton", function() {
            const fullText = $("#fontColorValue").val();
            navigator.clipboard.writeText(fullText).then(function() {
                console.log('Text copied to clipboard');
            }).catch(function(err) {
                console.error('Could not copy text: ', err);
            });
        });

        // Close the modal when the new close button is clicked
        $(document).on("click", "#bits-modal-close-button", function() {
            if (isPage) {
                $('#fontColorModal').hide();
                $('#modalBackground').hide();
                $('.modal-backdrop').remove();
            }
        });

        // Close the modal when the close button is clicked
        $(document).on("click", "#closeModalButton", function() {
            if (isPage) {
                $('#fontColorModal').hide();
                $('#modalBackground').hide();
                $('.modal-backdrop').remove();
            }
        });

        // Close the modal when clicking outside of it
        $(document).on("click", function(event) {
            if (isPage) {
                if (!$(event.target).closest(".modal-dialog, .kpi-details .kpi-content .kpiimage table tr td a, .kpi-details .kpicontent .kpiimage table tr td a").length) {
                    $('#fontColorModal').hide();
                    $('#modalBackground').hide();
                    $('.modal-backdrop').remove();
                }
            }
        });

        // Close the modal when pressing the ESC key
        $(document).on("keydown", function(event) {
            if (isPage) {
                if (event.key === "Escape") {
                    $('#fontColorModal').hide();
                    $('#modalBackground').hide();
                    $('.modal-backdrop').remove();
                }
            }
        });

        // Remove the modal-backdrop when the modal is hidden
        $('#fontColorModal').on('hidden.bs.modal', function () {
            if (isPage) {
                $('#modalBackground').hide();
                $('.modal-backdrop').remove();
            }
        });
    }

    // Default settings
    let enabled = true;
    let removeLinks = false;
    let forceVersionNotes = true;
    let minWords = 5;

    // Function to remove invalid links
    function removeInvalidLinks() {
        if (!removeLinks) return;

        $("td a[data-drill]").each(function() {
            var dataDrill = $(this).attr('data-drill');
            if (dataDrill) {
                var drillData = JSON.parse(dataDrill.replace(/&quot;/g, '"'));
                if (drillData.filters && drillData.filters.length > 0) {
                    var values = drillData.filters[0].values;
                    if (values && values.length > 0) {
                        var spanElement = $('<div>').html(values[0]).find('span');
                        var fontColorValue = spanElement.attr('font-color');
                        if (fontColorValue === 'NOTEXT') {
                            $(this).replaceWith(spanElement);
                        }
                    }
                }
            }
        });
    }

    // Function to initialize or update the logic for the modal
    function initOrUpdateModal() {
        if (!forceVersionNotes) return;

        var descriptionTextArea;
        if (isAuthor) {
            console.log('is author textarea');
            descriptionTextArea = document.querySelector('textarea');
        } else if (isGraph) {
            console.log('is graph textarea');
            descriptionTextArea = document.querySelector('textarea');
        } else if (isPage) {

        }
        if (descriptionTextArea) {
            updateModal(descriptionTextArea, minWords);
        } else {
            console.log("Required elements not found");
        }
    }

    // Function to update the placeholder text, toggle save button state, and show required word count
    function updateModal(descriptionTextArea, minWords) {
        descriptionTextArea.placeholder = `Version Description (Required)`;

        let wordCountMessage = descriptionTextArea.nextElementSibling;
        const wordCountMessageId = 'word-count-message';
        if (!wordCountMessage || wordCountMessage.id !== wordCountMessageId) {
            wordCountMessage = document.createElement('div');
            wordCountMessage.id = wordCountMessageId;
            wordCountMessage.style.color = 'LightGray';
            descriptionTextArea.parentNode.insertBefore(wordCountMessage, descriptionTextArea.nextSibling);
        }
        wordCountMessage.textContent = `A minimum of ${minWords} words is required by the Domo Helper Extension.`;

        if (currentToggleSaveButton) {
            descriptionTextArea.removeEventListener('input', currentToggleSaveButton);
        }
        currentToggleSaveButton = createToggleSaveButton(descriptionTextArea, minWords);
        descriptionTextArea.addEventListener('input', currentToggleSaveButton);
        currentToggleSaveButton();
    }

    // Function to create a toggle save button function
    function createToggleSaveButton(descriptionTextArea, minWords) {
        return function() {
            var saveButtons;
            if (isGraph) {
                saveButtons = document.querySelectorAll('footer > button:nth-child(2)');
            } else if (isAuthor) {
                saveButtons = document.querySelectorAll('body > div.df-save-modal.modal-backdrop.trans-fade-1.centered-container.ng-isolate-scope.visible > div > div.modal-footer.ng-scope.ng-isolate-scope > div > div:nth-child(2) > button.done.float-right.db-button');
            }

            saveButtons.forEach(button => {
                button.disabled = !hasMinimumWordCount(descriptionTextArea.value, minWords);
                if (button.disabled) {
                    button.setAttribute('disabled', 'true');
                } else {
                    button.removeAttribute('disabled');
                }
            });
        };
    }

    // Function to check if the text area has at least a certain number of words
    function hasMinimumWordCount(text, minWords) {
        return text.split(/\s+/).filter(word => word.length > 0).length >= minWords;
    }

    let currentToggleSaveButton;

    function applySettings(settings) {
        if (settings.enabled !== undefined) {
            enabled = settings.enabled;
        }
        if (settings.removeLinks !== undefined) {
            removeLinks = settings.removeLinks;
        }
        if (settings.forceVersionNotes !== undefined) {
            forceVersionNotes = settings.forceVersionNotes;
        }
        if (settings.minWords !== undefined) {
            minWords = settings.minWords;
        }

        initOrUpdateModal();

        if (removeLinks) {
            removeInvalidLinks();
        } else {
            resetInvalidLinks();
        }

        if (enabled) {
            modifyDataDrillAttributes();
        } else {
            resetDataDrillAttributes();
        }
    }

    function modifyDataDrillAttributes() {
        $("td a[data-drill]").each(function() {
            var dataDrill = $(this).attr('data-drill');
            if (dataDrill) {
                $(this).attr('data-drill-none', dataDrill).removeAttr('data-drill');
            }
        });
    }

    function resetDataDrillAttributes() {
        $("td a[data-drill-none]").each(function() {
            var dataDrillNone = $(this).attr('data-drill-none');
            if (dataDrillNone) {
                $(this).attr('data-drill', dataDrillNone).removeAttr('data-drill-none');
            }
        });
    }

    function resetInvalidLinks() {
        $("td span[font-color='NOTEXT']").each(function() {
            var spanElement = $(this);
            var originalAnchor = spanElement.parent('a');
            if (originalAnchor.length > 0) {
                var originalDataDrill = originalAnchor.attr('data-drill-none');
                if (originalDataDrill) {
                    originalAnchor.attr('data-drill', originalDataDrill).removeAttr('data-drill-none');
                }
                originalAnchor.replaceWith(spanElement);
            }
        });
    }

    chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
        if (message.type === "settingsChanged") {
            applySettings(message.settings);
        }
    });

    chrome.storage.local.get(['enabled', 'removeLinks', 'forceVersionNotes', 'minWords'], function(settings) {
        applySettings(settings);
    });

    const observer = new MutationObserver((mutationsList, observer) => {
        mutationsList.forEach((mutation) => {
            if (mutation.addedNodes.length) {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE && 
                        (node.matches('.modal') || node.querySelector('.modal'))) {
                        console.log("SQL Save or Save and Run modal detected.");
                        setTimeout(initOrUpdateModal, 100);
                    }
                    if (node.nodeType === Node.ELEMENT_NODE && node.matches('.kpi_chart, .kpi_chart *')) {
                        console.log("KPI chart added.");
                        if (removeLinks) {
                            removeInvalidLinks();
                        }
                        if (enabled) {
                            modifyDataDrillAttributes();
                        } else {
                            resetDataDrillAttributes();
                        }
                    }
                    if (node.nodeType === Node.ELEMENT_NODE && 
                        (node.matches('header.db-text-display-4.ModalHeader-module_container__DzXPX') ||
                        node.querySelector('header.db-text-display-4.ModalHeader-module_container__DzXPX'))) {
                        console.log("ETL Save or Save and Run modal detected.");
                        setTimeout(initOrUpdateModal, 100);
                    }
                });
            }
        });
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    if (isPage) {
        $(document).on("click", ".kpi-details .kpi-content .kpiimage table tr td a, .kpi-details .kpicontent .kpiimage table tr td a", function(event) {
            if (!enabled) {
                return;
            }
            event.preventDefault();

            var dataDrillNone = $(this).attr('data-drill-none');
            
            if (dataDrillNone) {
                var drillData = JSON.parse(dataDrillNone.replace(/&quot;/g, '"'));
                
                var fontColorValue = '';
                if (drillData.filters && drillData.filters.length > 0) {
                    var values = drillData.filters[0].values;
                    if (values && values.length > 0) {
                        var spanElement = $('<div>').html(values[0]).find('span');
                        fontColorValue = spanElement.attr('font-color');
                    }
                }

                $('#fontColorValue').val(fontColorValue ? fontColorValue : 'No full text value found');

                $('#fontColorModal').show();
                $('#modalBackground').show(); // Show the background blur
                $('#modalBackground').css('display', 'block !important');
            } else {
                $('#fontColorValue').val('No data-drill-none attribute found');
                $('#fontColorModal').show();
                $('#modalBackground').show(); // Show the background blur
                $('#modalBackground').css('display', 'block !important');
            }
        });
    }

    // Close the modal when the close button is clicked
    $(document).on("click", "#closeModalButton", function() {
        if (isPage) {
            $('#fontColorModal').hide();
            $('#modalBackground').hide();
            $('#modalBackground').css('display', 'none !important');
            $('.modal-backdrop').remove();
        }
    });

    // Close the modal when the new close button is clicked
    $(document).on("click", "#bits-modal-close-button", function() {
        if (isPage) {
            $('#fontColorModal').hide();
            $('#modalBackground').hide();
            $('#modalBackground').css('display', 'none !important');
            $('.modal-backdrop').remove();
        }
    });

    // Close the modal when clicking outside of it
    $(document).on("click", function(event) {
        if (isPage) {
            if (!$(event.target).closest(".modal-dialog, .kpi-details .kpi-content .kpiimage table tr td a, .kpi-details .kpicontent .kpiimage table tr td a").length) {
                $('#fontColorModal').hide();
                $('#modalBackground').hide();
                $('#modalBackground').css('display', 'none !important');
                $('.modal-backdrop').remove();
            }
        }
    });

    // Close the modal when pressing the ESC key
    $(document).on("keydown", function(event) {
        if (isPage) {
            if (event.key === "Escape") {
                $('#fontColorModal').hide();
                $('#modalBackground').hide();
                $('#modalBackground').css('display', 'none !important');
                $('.modal-backdrop').remove();
            }
        }
    });

    // Remove the modal-backdrop when the modal is hidden
    $('#fontColorModal').on('hidden.bs.modal', function () {
        if (isPage) {
            $('#modalBackground').hide();
            $('#modalBackground').css('display', 'none !important');
            $('.modal-backdrop').remove();
        }
    });
});