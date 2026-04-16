// content/features/feature-page-jump-to.js

let observerNB = null;

function processNotebookBody(notebookBody) {
  const spanElement = notebookBody.querySelector('span');
  if (!spanElement) return;
  const textContent = spanElement.textContent.trim();
  if (!textContent.startsWith('Jump to:')) return;

  const sectionName = textContent.replace('Jump to:', '').trim().toUpperCase();

  const parentSection = notebookBody.closest('section.dm-badge');
  const shieldDiv = parentSection?.querySelector('div.badge-content-shield');
  if (shieldDiv) shieldDiv.remove();

  notebookBody.addEventListener('click', () => {
    const targetSection = Array.from(document.querySelectorAll('notebook-shim span'))
      .find(span => span.textContent.trim().endsWith('SECTION') && span.textContent.trim().toUpperCase().includes(sectionName));
    if (targetSection) targetSection.scrollIntoView({ behavior: 'smooth' });
  });
}

export default {
  init({ PageDetector } = {}) {
    // Support both old (PageDetector) and new (context subscription) systems
    if (window.subscribeToContextUpdates) {
      window.subscribeToContextUpdates((context) => {
        const isPageContext = context?.domoObject?.typeId === 'PAGE';
        if (!isPageContext) {
          console.log('[Page Jump To] Non-PAGE context detected');
        } else {
          console.log('[Page Jump To] PAGE context detected, feature active');
        }
      });
    } else if (PageDetector && !PageDetector.isPage()) {
      console.warn('[Page Jump To] Warning: Feature initialized on non-PAGE context');
    }
    
    // Initial scan
    document.querySelectorAll('div.notebookBody').forEach(processNotebookBody);

    // Observe dynamically-added notebook bodies
    observerNB = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1 && node.matches('div.notebookBody')) {
            processNotebookBody(node);
          } else if (node.nodeType === 1) {
            node.querySelectorAll?.('div.notebookBody').forEach(processNotebookBody);
          }
        });
      });
    });
    observerNB.observe(document.body, { childList: true, subtree: true });
  },
  cleanup() {
    observerNB?.disconnect();
    observerNB = null;
  }
};
