// content/content-main.js

// Simple shared helpers
const DH = {
    sleep: (ms) => new Promise(r => setTimeout(r, ms)),
    showNotification(message, color) {
      const notification = document.createElement('div');
      notification.innerText = message;
      Object.assign(notification.style, {
        position: 'fixed',
        top: '100px',
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: color || '#333',
        color: '#fff',
        fontSize: '2em',
        padding: '10px',
        borderRadius: '5px',
        zIndex: 9999
      });
      document.body.appendChild(notification);
      setTimeout(() => document.body.removeChild(notification), 4000);
    }
  };
  
  // Page-type detection (kept mutable so we can refresh on URL changes)
  let url = window.location.href;
  let isPage = url.includes('/page/');
  let isGraph = url.endsWith('graph');
  let isAuthor = url.includes('author');
  
  const featureModules = {
    pageFullText: null,
    pageJumpTo: null,
    magicRecipes: null,
    graphMenu: null,
    versionNotes: null
  };
  
  let loadedForThisUrl = false;
  
  // Load features for the current page
  async function loadFeaturesForPage() {
    if (loadedForThisUrl) return;
    loadedForThisUrl = true;
  
    // Shared settings defaults
    let currentSettings = {
      enabled: true,
      removeLinks: false,
      forceVersionNotes: true,
      minWords: 5
    };
  
    // Fetch stored settings and then init features
    chrome.storage.local.get(['enabled', 'removeLinks', 'forceVersionNotes', 'minWords'], async (settings) => {
      currentSettings = {
        enabled: settings.enabled !== undefined ? settings.enabled : currentSettings.enabled,
        removeLinks: settings.removeLinks || currentSettings.removeLinks,
        forceVersionNotes: settings.forceVersionNotes || currentSettings.forceVersionNotes,
        minWords: settings.minWords || currentSettings.minWords
      };
  
      // PAGE features
      if (isPage) {
        // Inject page CSS
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.type = 'text/css';
        css.href = chrome.runtime.getURL('css/dh-page-style.css');
        document.head.appendChild(css);
  
        // Full text modal feature
        featureModules.pageFullText = (await import(chrome.runtime.getURL('content/features/feature-page-fulltext.js'))).default;
        featureModules.pageFullText.init({ DH, settings: currentSettings });
  
        // "Jump to:" body navigation
        featureModules.pageJumpTo = (await import(chrome.runtime.getURL('content/features/feature-page-jump-to.js'))).default;
        featureModules.pageJumpTo.init({ DH });
      }
  
      // GRAPH features (Magic ETL)
      if (isGraph) {
        // Inject graph CSS
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.type = 'text/css';
        css.href = chrome.runtime.getURL('css/dh-graph-style.css');
        document.head.appendChild(css);
  
        // Magic ETL recipes (UI + storage + insertion)
        featureModules.magicRecipes = (await import(chrome.runtime.getURL('content/features/feature-magic-recipes.js'))).default;
        featureModules.magicRecipes.init({ DH });
  
        // Domo Helper menu in sidebar
        featureModules.graphMenu = (await import(chrome.runtime.getURL('content/features/feature-graph-menu.js'))).default;
        featureModules.graphMenu.init({ DH });
      }
  
      // Version Notes enforcement (applies to SQL Author + Magic ETL Graph)
      if (isAuthor || isGraph) {
        featureModules.versionNotes = (await import(chrome.runtime.getURL('content/features/feature-version-notes.js'))).default;
        featureModules.versionNotes.init({ DH, isAuthor, isGraph, settings: currentSettings });
      }
    });
  
    // React to settings changes
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'settingsChanged') {
        const { settings } = message;
        // Forward to live features if loaded
        if (featureModules.pageFullText?.applySettings) featureModules.pageFullText.applySettings(settings);
        if (featureModules.versionNotes?.applySettings) featureModules.versionNotes.applySettings(settings);
        if (featureModules.magicRecipes?.applySettings) featureModules.magicRecipes.applySettings?.(settings);
        if (featureModules.graphMenu?.applySettings) featureModules.graphMenu.applySettings?.(settings);
        if (featureModules.pageJumpTo?.applySettings) featureModules.pageJumpTo.applySettings?.(settings);
      }
    });
  }
  
  // Cleanup when leaving relevant pages
  function cleanupAll() {
    featureModules.pageFullText?.cleanup?.();
    featureModules.pageJumpTo?.cleanup?.();
    featureModules.magicRecipes?.cleanup?.();
    featureModules.graphMenu?.cleanup?.();
    featureModules.versionNotes?.cleanup?.();
  
    // Remove injected CSS
    document.querySelectorAll("link[href*='dh-page-style.css'], link[href*='dh-graph-style.css']").forEach(l => l.remove());
    loadedForThisUrl = false;
  }
  
  // Watch for SPA URL changes (Domo is SPA-like)
  let previousUrl = window.location.href;
  const urlChangeObserver = new MutationObserver(() => {
    const currentUrl = window.location.href;
    if (currentUrl !== previousUrl) {
      previousUrl = currentUrl;
  
      // recompute flags
      url = currentUrl;
      isPage = url.includes('/page/');
      isGraph = url.endsWith('graph');
      isAuthor = url.includes('author');
  
      // clean up if no longer relevant
      if (!isPage && !isGraph && !isAuthor) {
        cleanupAll();
        return;
      }
  
      // reload features for new context
      cleanupAll();
      loadFeaturesForPage();
    }
  });
  urlChangeObserver.observe(document.body, { childList: true, subtree: true });
  
  // Initial boot
  document.onreadystatechange = function () {
    if (document.readyState === 'complete') {
      console.log('Page Loaded & Domo Helper Active');
    }
  };
  
  // If relevant at load, start features
  if (isPage || isGraph || isAuthor) {
    loadFeaturesForPage();
  } else {
    cleanupAll();
  }
  