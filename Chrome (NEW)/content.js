// Log Content Script only after the page is fully loaded
document.onreadystatechange = function () {
    if (document.readyState == "complete") {
        console.log("Page Loaded & Domo Helper Active");
    }
}

$(document).ready(function () {

    const url = window.location.href;
    const isPage = url.includes('/page/');
    const isGraph = url.endsWith('graph');
    const isAuthor = url.includes('author');

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // DOMO HELPER / GENERAL / SETTINGS //
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////

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
        if (isPage) {
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
    }

    if (isPage) {
        console.log("Domo Helper - Is Card Page");
    } else if (isGraph) {
        console.log("Domo Helper - Is MagicETL Page");
    } else if (isAuthor) {
        console.log("Domo Helper - Is SQL Page");
    } else {
        console.log("Domo Helper - Non-Relevant Page");
    }

    if (isPage || isGraph || isAuthor) {

        function sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        ////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // IS PAGE / CARD PAGES //
        ////////////////////////////////////////////////////////////////////////////////////////////////////////////////

        if (isPage) {
            // Existing modal for Full Text Value
            // Append the MAGIC ETL RECIPE modal HTML to the body
            const CSSPageLink = document.createElement('link');
            CSSPageLink.rel = 'stylesheet';
            CSSPageLink.type = 'text/css';
            CSSPageLink.href = chrome.runtime.getURL('css/dh-page-style.css');
            document.head.appendChild(CSSPageLink);

            let removeLinks = false;
            function removeInvalidLinks() {
                if (!removeLinks) return;

                $("td a[data-drill]").each(function () {
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

            function modifyDataDrillAttributes() {
                $("td a[data-drill]").each(function () {
                    var dataDrill = $(this).attr('data-drill');
                    if (dataDrill) {
                        $(this).attr('data-drill-none', dataDrill).removeAttr('data-drill');
                    }
                });
            }

            function resetDataDrillAttributes() {
                $("td a[data-drill-none]").each(function () {
                    var dataDrillNone = $(this).attr('data-drill-none');
                    if (dataDrillNone) {
                        $(this).attr('data-drill', dataDrillNone).removeAttr('data-drill-none');
                    }
                });
            }

            function resetInvalidLinks() {
                $("td span[font-color='NOTEXT']").each(function () {
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
            $(document).on("click", "#copyToClipboardButton", function () {
                const fullText = $("#fontColorValue").val();
                navigator.clipboard.writeText(fullText).then(function () {
                    console.log('Text copied to clipboard');
                }).catch(function (err) {
                    console.error('Could not copy text: ', err);
                });
            });

            // Close the modal when the new close button is clicked
            $(document).on("click", "#bits-modal-close-button", function () {
                if (isPage) {
                    $('#fontColorModal').hide();
                    $('#modalBackground').hide();
                    $('.modal-backdrop').remove();
                }
            });

            // Close the modal when the close button is clicked
            $(document).on("click", "#closeModalButton", function () {
                if (isPage) {
                    $('#fontColorModal').hide();
                    $('#modalBackground').hide();
                    $('.modal-backdrop').remove();
                }
            });

            // Close the modal when clicking outside of it
            $(document).on("click", function (event) {
                if (isPage) {
                    if (!$(event.target).closest(".modal-dialog, .kpi-details .kpi-content .kpiimage table tr td a, .kpi-details .kpicontent .kpiimage table tr td a").length) {
                        $('#fontColorModal').hide();
                        $('#modalBackground').hide();
                        $('.modal-backdrop').remove();
                    }
                }
            });

            // Close the modal when pressing the ESC key
            $(document).on("keydown", function (event) {
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


        ////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // IS GRAPH / MAGIC ETL PAGES //
        ////////////////////////////////////////////////////////////////////////////////////////////////////////////////    

        // Append Magic ETL Recipes button and modal for Graph
        if (isGraph) {
            // Append the MAGIC ETL RECIPE modal HTML to the body
            const CSSGraphLink = document.createElement('link');
            CSSGraphLink.rel = 'stylesheet';
            CSSGraphLink.type = 'text/css';
            CSSGraphLink.href = chrome.runtime.getURL('css/dh-graph-style.css');
            document.head.appendChild(CSSGraphLink);

            $('body').append(`
            <div class="modal fade modal-custom" id="saveRecipeModal" tabindex="-1" role="dialog" aria-labelledby="saveRecipeModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-dialog-centered" role="document">
                    <div class="modal-content">
                        <button id="save-recipe-modal-close-button" class="db-text-button Modal-module_closeX__UCijY Button-module_button__7BLGt Button-module_default__utLb- Button-module_text__unL1r" type="button" aria-label="Close dialog">
                            <span class="Button-module_content__b7-cz">
                                <i role="presentation" class="db-icon icon-x md"></i>
                            </span>
                        </button>
                        <div class="modal-header">
                            <h5 class="modal-title" id="saveRecipeModalLabel">Save Magic ETL Recipe</h5>
                        </div>
                        <div class="modal-body">
                            <label for="recipeTitle">Title:</label>
                            <input type="text" id="recipeTitle" class="Textarea-module_textarea__Etl2x">
                            <label for="recipeDescription">Description:</label>
                            <textarea id="recipeDescription" class="Textarea-module_textarea__Etl2x"></textarea>
                            <label for="recipePreview">Recipe Preview:</label>
                            <textarea readonly id="recipePreview" class="Textarea-module_textarea__Etl2x"></textarea>
                            <p class="authorNote footnote">Magic ETL Recipes added by Domo Helper Browser Extension.</p>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="db-text-button Button-module_button__7BLGt Button-module_default__utLb- Button-module_raised__IpSHu" id="closeSaveRecipeModalButton">Close</button>
                            <button type="button" class="db-text-button Button-module_button__7BLGt Button-module_primary__TrzCx  Button-module_raised__IpSHu" id="saveRecipeButton">Save</button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="modal-fade" id="modalBackground" role="presentation"></div>
        `);

            // Append Magic ETL Recipes button and modal
            $('body').append(`
    <div class="modal fade modal-custom" id="viewRecipesModal" tabindex="-1" role="dialog" aria-labelledby="viewRecipesModalLabel" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered-recipes" role="document">
            <div class="modal-content">
                <button id="view-recipes-modal-close-button" class="db-text-button Modal-module_closeX__UCijY Button-module_button__7BLGt Button-module_default__utLb- Button-module_text__unL1r" type="button" aria-label="Close dialog">
                    <span class="Button-module_content__b7-cz">
                        <i role="presentation" class="db-icon icon-x md"></i>
                    </span>
                </button>
                <div class="modal-header">
                    <h5 class="modal-title" id="viewRecipesModalLabel">Magic ETL Recipes</h5>
                    <p class="modal-title-desc">When you click insert, Domo Helper will attempt to scroll to the newly added tiles, Domo usually adds them to the very bottom of the screen inline vertically of where they originally copied from. If your ETL is very large you may need to scroll down a little.</p>
                </div>
                <div class="modal-body modal-body-scrollable" id="recipesList">
                    <!-- Recipes will be listed here -->
                </div>
                <div class="modal-footer">
                    <button type="button" class="db-text-button Button-module_button__7BLGt Button-module_primary__TrzCx Button-module_raised__IpSHu" id="closeViewRecipesModalButton">Close</button>
                </div>
                <p class="authorNote footnote">Magic ETL Recipes created by Domo Helper Browser Extension.</p>

            </div>
        </div>
    </div>
    <div class="modal-fade" id="modalBackgroundViewRecipes" role="presentation"></div>
`);


            // Event listener to open Magic ETL Recipes modal
            $(document).off("click", "#openMagicETLRecipes"); // Remove any existing event listener
            $(document).on("click", "#openMagicETLRecipes", function () {
                console.log('Opening Magic ETL Recipe List');
                $('#recipesList').empty(); // Clear previous list
                chrome.storage.local.get(['MagicETLRecipes'], function (result) {
                    const recipes = result.MagicETLRecipes || {};

                    // Convert recipes object to an array and sort by timestamp
                    const sortedRecipes = Object.values(recipes).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

                    sortedRecipes.forEach(recipe => {
                        // Check if the recipe is already appended
                        if ($(`#recipesList .recipe-item[data-title="${recipe.title}"]`).length === 0) {
                            $('#recipesList').append(`
                    <div class="recipe-item" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;" data-title="${recipe.title}">
                        <div style="display: flex; align-items: center;">
                            <button class="db-text-button Button-module_button__7BLGt Button-module_primary__TrzCx Button-module_raised__IpSHu insert-recipe-button" data-title="${recipe.title}">Insert</button>
                            <div style="margin-left: 10px;">
                                <h5 style="margin: 0;">${recipe.title}</h5>
                                <p style="margin: 0;">${recipe.description}</p>
                            </div>
                        </div>
                        <div>
                            <button class="db-text-button Button-module_button__7BLGt Button-module_default__utLb- Button-module_raised__IpSHu delete-recipe-button" data-title="${recipe.title}">Delete</button>
                        </div>
                    </div>
                `);
                        }
                    });

                    // Ensure the "Delete All Recipes" button is only appended once
                    if ($('#recipesList').find('.delete-all-recipes-button').length === 0) {
                        $('#recipesList').append(`
                <div style="display: flex; justify-content: flex-end; margin-top: 20px;">
                    <button class="db-text-button Button-module_button__7BLGt Button-module_default__utLb- Button-module_raised__IpSHu delete-all-recipes-button">Delete All Recipes</button>
                </div>
            `);
                    }
                    $('#viewRecipesModal').show();
                    $('#modalBackgroundViewRecipes').show();
                });
            });

            // Event listener to insert recipe and copy JSON to clipboard
            $(document).off("click", ".insert-recipe-button"); // Remove any existing event listener
            $(document).on("click", ".insert-recipe-button", async function (event) {
                event.stopImmediatePropagation(); // Prevent the event from bubbling up
                const recipeTitle = $(this).data("title");

                chrome.storage.local.get(['MagicETLRecipes'], async function (result) {
                    const recipes = result.MagicETLRecipes || {};
                    const recipeData = recipes[recipeTitle];

                    if (recipeData && recipeData.recipe) {
                        let jsonData = JSON.parse(JSON.stringify(recipeData.recipe));
                        if (jsonData.data && jsonData.data.length > 0 && jsonData.data[0].name) {
                            jsonData.data[0].name += " - AB-DH";
                        }
                        const recipeJSON = JSON.stringify(jsonData, null, 2);

                        try {
                            await navigator.clipboard.writeText(recipeJSON);
                            console.log('Recipe JSON copied to clipboard');

                            $('#viewRecipesModal').hide();
                            $('#modalBackgroundViewRecipes').hide();

                            // Wait for the paste command to execute
                            setTimeout(() => {
                                document.execCommand('paste');
                                // console.log('Executed paste command');

                                // Mutation observer to find the newly added node
                                const observer2 = new MutationObserver((mutations) => {
                                    mutations.forEach((mutation) => {
                                        mutation.addedNodes.forEach((node) => {
                                            // console.log('Node added:', node);
                                            if (node.querySelector && node.querySelector(".DfNode_canvasNodeContainer_QeMZJ")) {
                                                const newNode = node.querySelector(".DfNode_actionName_JU0bL");
                                                if (newNode && newNode.textContent.includes(" - AB-DH")) {
                                                    // console.log('FOUND NODE:', newNode.textContent);
                                                    const nodeRect = newNode.getBoundingClientRect();
                                                    const container = document.querySelector(".DfScroller_container_BrOZc");
                                                    const containerRect = container.getBoundingClientRect();

                                                    // Scroll the container to the position of the new node
                                                    container.scrollTop += (nodeRect.top - containerRect.top) - container.clientHeight / 2 + newNode.clientHeight / 2 + 25;
                                                    container.scrollLeft += (nodeRect.left - containerRect.left) - container.clientWidth / 2 + newNode.clientWidth / 2;

                                                    newNode.click();

                                                    async function addMenuSleep() {
                                                        await sleep(0);
                                                        addDomoHelperMenu();
                                                    }

                                                    addMenuSleep();

                                                    // Disconnect observer once we find the new node
                                                    observer2.disconnect();
                                                } else {
                                                    // console.log('Node not found yet or does not match:', newNode ? newNode.textContent : 'No newNode');
                                                }
                                            }
                                        });
                                    });
                                });

                                // Start observing the document body for new nodes
                                observer2.observe(document.body, {
                                    childList: true,
                                    subtree: true
                                });
                            }, 50); // Increased timeout to ensure paste operation completes

                        } catch (err) {
                            console.error('Could not copy text: ', err);
                        }
                    }
                });
            });

            // Event listener for deleting a recipe
            $(document).off("click", ".delete-recipe-button"); // Remove any existing event listener
            $(document).on("click", ".delete-recipe-button", function (event) {
                event.stopImmediatePropagation(); // Prevent the event from bubbling up
                const recipeTitle = $(this).data("title");
                if (confirm("Are you sure you want to delete this recipe? This is permanent.")) {
                    chrome.storage.local.get(['MagicETLRecipes'], function (result) {
                        const recipes = result.MagicETLRecipes || {};
                        delete recipes[recipeTitle];
                        chrome.storage.local.set({ MagicETLRecipes: recipes }, function () {
                            if (chrome.runtime.lastError) {
                                console.error('Error deleting from local storage:', chrome.runtime.lastError);
                            } else {
                                console.log('Magic ETL Recipe deleted successfully!', recipes);
                                $(`button[data-title="${recipeTitle}"]`).closest('.recipe-item').remove();
                            }
                        });
                    });
                }
            });

            // Event listener for deleting all recipes
            $(document).off("click", ".delete-all-recipes-button"); // Remove any existing event listener
            $(document).on("click", ".delete-all-recipes-button", function (event) {
                event.stopImmediatePropagation(); // Prevent the event from bubbling up
                if (confirm("Are you sure you want to delete all recipes? This is permanent.")) {
                    chrome.storage.local.set({ MagicETLRecipes: {} }, function () {
                        if (chrome.runtime.lastError) {
                            console.error('Error deleting all recipes from local storage:', chrome.runtime.lastError);
                        } else {
                            console.log('All Magic ETL Recipes deleted successfully!');
                            $('#recipesList').empty();
                        }
                    });
                }
            });


            // Event listener for closing the Magic ETL Recipes modal
            $(document).on("click", "#closeViewRecipesModalButton, #view-recipes-modal-close-button", function () {
                $('#viewRecipesModal').hide();
                $('#modalBackgroundViewRecipes').hide();
            });

            // Event listener for closing the modal when clicking outside of it
            $(document).on("click", function (event) {
                if (!$(event.target).closest(".modal-dialog").length) {
                    $('#viewRecipesModal').hide();
                    $('#modalBackgroundViewRecipes').hide();
                }
            });

            // Close the modal when pressing the ESC key
            $(document).on("keydown", function (event) {
                if (event.key === "Escape") {
                    $('#viewRecipesModal').hide();
                    $('#modalBackgroundViewRecipes').hide();
                }
            });
        }

        async function saveMagicETLRecipe(copyButton) {
            // Simulate a click on the "Copy to Clipboard" button
            copyButton.click();
            // Wait for the clipboard data to be available
            setTimeout(async () => {
                try {
                    const text = await navigator.clipboard.readText();
                    let jsonData = JSON.parse(text);

                    // Remove the "data" key within the main object
                    const clearDataValues = (obj) => {
                        if (Array.isArray(obj)) {
                            obj.forEach(item => clearDataValues(item));
                        } else if (typeof obj === "object" && obj !== null) {
                            for (const key in obj) {
                                if (key === "data" && Array.isArray(obj[key])) {
                                    obj[key].forEach(subItem => {
                                        if (subItem.hasOwnProperty("data")) {
                                            delete subItem.data; // Remove the data key
                                        }
                                    });
                                } else if (typeof obj[key] === "object") {
                                    clearDataValues(obj[key]);
                                }
                            }
                        }
                    };
                    clearDataValues(jsonData);

                    // Show the modal and populate the preview
                    $('#recipePreview').val(JSON.stringify(jsonData, null, 2));
                    $('#saveRecipeModal').show();
                    $('#modalBackground').show();
                } catch (err) {
                    console.error('Failed to read clipboard contents: ', err);
                }
            }, 1000); // Adjust the timeout as necessary
        }

        
            // Clear the clipboard
            function clearClipboard() {
                navigator.clipboard.writeText('');
            }


        function showNotification(message, color) {
            const notification = document.createElement('div');
            notification.innerText = message;
            notification.style.position = 'fixed';
            notification.style.top = '100px';
            notification.style.left = '50%';
            notification.style.transform = 'translateX(-50%)';
            notification.style.backgroundColor = color;
            notification.style.color = 'white';
            notification.style.fontSize = '2em';
            notification.style.padding = '10px';
            notification.style.borderRadius = '5px';
            notification.style.zIndex = '9999';
            document.body.appendChild(notification);

            setTimeout(() => {
                document.body.removeChild(notification);
            }, 4000);
        }

        $(document).off("click", "#saveRecipeButton"); // Remove any existing event listener
        $(document).on("click", "#saveRecipeButton", function () {
            const recipeTitle = $('#recipeTitle').val().trim();
            const recipeDescription = $('#recipeDescription').val().trim();
            const recipePreview = $('#recipePreview').val();

            if (recipeTitle && recipeDescription && recipePreview) {
                const jsonData = JSON.parse(recipePreview);
                const recipeData = {
                    title: recipeTitle,
                    description: recipeDescription,
                    recipe: jsonData,
                    timestamp: new Date().toISOString() // Add timestamp here
                };

                // Save to local storage of the extension under "MagicETLRecipes" key
                chrome.storage.local.get(['MagicETLRecipes'], function (result) {
                    const recipes = result.MagicETLRecipes || {};
                    recipes[recipeTitle] = recipeData;
                    chrome.storage.local.set({ MagicETLRecipes: recipes }, function () {
                        if (chrome.runtime.lastError) {
                            console.error('Error saving to local storage:', chrome.runtime.lastError);
                        } else {
                            console.log('Magic ETL Recipe saved successfully!', recipes);
                            showNotification('Magic ETL Recipe saved successfully!', '#4CAF50');
                            $('#saveRecipeModal').hide();
                            $('#modalBackground').hide();
                            clearModalContent();
                            clearClipboard();
                        }
                    });
                });
            } else {
                showNotification('Please provide a title and description', '#ed3737');
            }
        });


        function clearModalContent() {
            $('#recipeTitle').val('');
            $('#recipeDescription').val('');
            $('#recipePreview').val('');
        }

        // Event listener for closing the modal
        $(document).off("click", "#closeSaveRecipeModalButton, #save-recipe-modal-close-button"); // Remove any existing event listener
        $(document).on("click", "#closeSaveRecipeModalButton, #save-recipe-modal-close-button", function () {
            $('#saveRecipeModal').hide();
            $('#modalBackground').hide();
            clearModalContent();
        });

        // Event listener for closing the modal when clicking outside of it
        $(document).on("click", function (event) {
            if (!$(event.target).closest(".modal-dialog").length) {
                $('#saveRecipeModal').hide();
                $('#modalBackground').hide();
            }
        });

    ///////////////////////////////////
    // MAGIC ETL RECIPES MENU ITEMS //
    ///////////////////////////////////
        const newMenuItem = `
    <div data-testid="domo-helper-menu">
    <div class="DfCategorySlideOut_titleContainer_iMZJF"><div class="display-flex">
        <span class="DfCategorySlideOut_title_oQl50">Domo Helper</span>
        </div>
        <i role="presentation" class="db-icon icon-caret-right md DfCategorySlideOut_arrow_ngvGU DfCategorySlideOut_arrowOpen_UEMpn"></i>
    </div>
    <div class="DfCategories_nodePosition_Fs0hR">
        <div aria-describedby="useUniqueIdMagicETLRecipes">
            <div id="openMagicETLRecipes" class="DfSidebarNode_container_WZeya">
                <div class="DfNode_node_LOlFy DfSidebarNode_sidebarNode_CxHrg">
                    <i role="presentation"  class="db-icon icon-magic lg DfNode_actionIcon_CtVo9 DfNode_iconSize_oxwhR"></i>
                </div>
                <div class="DfNode_actionName_JU0bL DfSidebarNode_sidebarActionName_bWCLl">
                    <span class="position-relative" >Magic ETL Recipes</span>
                </div>
            </div>
        </div>
        <div role="tooltip" class="Tooltip-module_srOnly__V-ZI0" id="useUniqueIdMagicETLRecipes">
            <div><div>View and insert Magic ETL Recipes.</div></div>
        </div>
    </div>
    </div>
`;

let isMenuItemAdded = false;

function addDomoHelperMenu() {
    if (!isMenuItemAdded && $('.DfSidebar_sidebar_hiBmc').last().find("[data-testid='domo-helper-menu']").length === 0) {
        isMenuItemAdded = true;
        $('.DfSidebar_sidebar_hiBmc').last().find("[data-testid='performance']").append(newMenuItem);
    }
}

function removeDomoHelperMenu() {
    isMenuItemAdded = false;
    $('.DfSidebar_sidebar_hiBmc').last().find("[data-testid='domo-helper-menu']").remove();
    $('.DfSidebar_sidebar_hiBmc').last().find("[data-testid='performance']").append(newMenuItem);
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// IS GRAPH / MAGIC ETL PAGES / VERSION FORCING //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////       

        let enabled = true;
        let forceVersionNotes = true;
        let minWords = 5;

        function initOrUpdateModal() {
            if (!forceVersionNotes) return;

            var descriptionTextArea;
            if (isAuthor) {
                descriptionTextArea = document.querySelector('textarea');
            } else if (isGraph) {
                descriptionTextArea = document.querySelector('.DfSaveModalContentsWithTriggering_textarea_Sp86n');
            } else if (isPage) {
                // handle page specific logic here
            }
            if (descriptionTextArea) {
                updateModal(descriptionTextArea, minWords);
            } else {
                // console.log("Required elements not found");
            }
        }

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

        function createToggleSaveButton(descriptionTextArea, minWords) {
            return function () {
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

        function hasMinimumWordCount(text, minWords) {
            return text.split(/\s+/).filter(word => word.length > 0).length >= minWords;
        }

        let currentToggleSaveButton;

        chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
            if (message.type === "settingsChanged") {
                applySettings(message.settings);
            }
        });

        chrome.storage.local.get(['enabled', 'removeLinks', 'forceVersionNotes', 'minWords'], function (settings) {
            applySettings(settings);
        });

////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// IS PAGE / CARD PAGE / TEXT EXPANSION POPUP //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////

        if (isPage) {
            $(document).on("click", ".kpi-details .kpi-content .kpiimage table tr td a, .kpi-details .kpicontent .kpiimage table tr td a", function (event) {
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
       
        // Close the modal when the close button is clicked
        $(document).on("click", "#closeModalButton", function () {
            if (isPage) {
                $('#fontColorModal').hide();
                $('#modalBackground').hide();
                $('#modalBackground').css('display', 'none !important');
                $('.modal-backdrop').remove();
            }
        });

        // Close the modal when the new close button is clicked
        $(document).on("click", "#bits-modal-close-button", function () {
            if (isPage) {
                $('#fontColorModal').hide();
                $('#modalBackground').hide();
                $('#modalBackground').css('display', 'none !important');
                $('.modal-backdrop').remove();
            }
        });

        // Close the modal when clicking outside of it
        $(document).on("click", function (event) {
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
        $(document).on("keydown", function (event) {
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
    }



////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// DOMO HELPER PRIMARY MUTATION OBSERVER //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////

let modalProcessed = false;

const observer = new MutationObserver((mutationsList) => {
    let mainElementFound = document.querySelector('main.app-body.ng-scope[ng-if="!showSaasaasZeroState"][ng-class="{\'app-body-reduced-min-width\': useReducedMinWidth}"]');

    if (!mainElementFound) {
        mutationsList.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === Node.ELEMENT_NODE && node.matches('main.app-body.ng-scope[ng-if="!showSaasaasZeroState"][ng-class="{\'app-body-reduced-min-width\': useReducedMinWidth}"]')) {
                    mainElementFound = node;

                    observer.disconnect(); // Stop observing once the main element is found
                }
            });
        });
    }

    if (mainElementFound) {
        mutationsList.forEach((mutation) => {
            if (mutation.addedNodes.length || mutation.removedNodes.length) {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // Check for modals
                        if ((node.matches('.modal') || node.querySelector('.modal')) && !modalProcessed && isAuthor) {
                            modalProcessed = true; // Set the flag to true to prevent further processing
                            console.log("SQL Save or Save and Run modal detected.");
                            setTimeout(() => {
                                initOrUpdateModal();
                                modalProcessed = false; // Reset the flag after processing
                            }, 100);
                        }
                        // Check for KPI chart
                        if (node.matches('.kpi_chart, .kpi_chart *')) {
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
                        if (node.matches('.DfCategorySlideOut_title_oQl50') || node.querySelector('.DfCategorySlideOut_title_oQl50')) {
                            async function addMenuSleep() {
                                await sleep(250);
                                addDomoHelperMenu();
                            }

                            addMenuSleep();
                        }

                        mutation.removedNodes.forEach((node) => {
                            if (node.nodeType === Node.ELEMENT_NODE) {
                                // Check for sidebar removal
                                if (node.matches('.DfSidebar_sidebar_hiBmc') || node.querySelector('.DfSidebar_sidebar_hiBmc')) {
                                    if (!node.matches('.DfCategorySlideOut_title_oQl50') || !node.querySelector('.DfCategorySlideOut_title_oQl50')) {
                                        async function addMenuSleep() {
                                            await sleep(250);
                                            removeDomoHelperMenu();
                                        }

                                        addMenuSleep();
                                    }
                                }
                            }
                        });

                        // Check for ETL Save or Save and Run modal
                        if (node.matches('header.db-text-display-4.ModalHeader-module_container__DzXPX') ||
                            node.querySelector('header.db-text-display-4.ModalHeader-module_container__DzXPX')) {
                            console.log("ETL Save or Save and Run modal detected.");
                            setTimeout(initOrUpdateModal, 100);
                        }
                        // Add "Save Magic ETL Recipe" button below "Copy to Clipboard" button
                        if (node.matches('.DfSidebar_multiSelectButtonContainer_IzWd7') || node.querySelector('.DfSidebar_multiSelectButtonContainer_IzWd7')) {
                            const copyButton = Array.from(document.querySelectorAll('.DfSidebar_buttonLabel_aNXwP')).find(el => el.textContent.includes('Copy to Clipboard'));
                            removeDomoHelperMenu();
                            if (copyButton && !document.getElementById('DH-Magic-Recipe-cont')) {
                                // Create the new button
                                const saveButton = document.createElement('button');
                                saveButton.className = 'db-text-button DfSidebar_multiSelectButton_zC_oK Button-module_button__7BLGt Button-module_default__utLb- Button-module_flat__aBcd9';
                                saveButton.id = 'DH-Magic-Recipe-cont';
                                saveButton.type = 'button';

                                // Create the inner HTML of the button
                                saveButton.innerHTML = `
                            <span id="DH-Magic-Recipe" class="Button-module_content__b7-cz DfSidebar_content_BdbcF">
                                <i role="presentation" class="icon-magic lg DfSidebar_icon_qq7Vz"></i>
                                <div class="DfSidebar_buttonLabel_aNXwP">Save Magic ETL Recipe</div>
                            </span>
                        `;

                                // Append the button below the "Copy to Clipboard" button
                                copyButton.closest('.DfSidebar_multiSelectButtonContainer_IzWd7').insertAdjacentElement('afterend', saveButton);

                                // Add a click event listener to the new button
                                saveButton.addEventListener('click', function () {
                                    saveMagicETLRecipe(copyButton);
                                });
                            }
                        }
                    }
                });

                mutation.removedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // Remove "Save Magic ETL Recipe" button if "Copy to Clipboard" button is removed
                        const copyButton = Array.from(document.querySelectorAll('.DfSidebar_buttonLabel_aNXwP')).find(el => el.textContent.includes('Copy to Clipboard'));
                        if (!copyButton) {
                            const saveButtonmg = document.getElementById('DH-Magic-Recipe-cont');
                            if (saveButtonmg) {
                                saveButtonmg.remove();
                            }
                        }
                    }
                });
            }
        });
    }
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});

//////////////////////////////////////////////////////////////////////////////////
// CLOSING DOMO HELPER PAGE DETECTOR TAGS
//////////////////////////////////////////////////////////////////////////////////
}
});