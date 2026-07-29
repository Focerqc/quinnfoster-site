/**
 * Quinn Foster Personal Hub - Interactive Navigation & State Management
 */

document.addEventListener('DOMContentLoaded', () => {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');
  const mobileToggle = document.getElementById('mobileMenuToggle');
  const navTabsContainer = document.getElementById('navTabs');

  const tabToPath = {
    'bio-tab': '/',
    'exp1-tab': '/experience1',
    'exp2-tab': '/experience2'
  };

  const pathToTab = {
    '/': 'bio-tab',
    '/index.html': 'bio-tab',
    '/experience1': 'exp1-tab',
    '/experience1/': 'exp1-tab',
    '/experience1.html': 'exp1-tab',
    '/experience-1': 'exp1-tab',
    '/experience-1.html': 'exp1-tab',
    '/experience2': 'exp2-tab',
    '/experience2/': 'exp2-tab',
    '/experience2.html': 'exp2-tab',
    '/experience-2': 'exp2-tab',
    '/experience-2.html': 'exp2-tab'
  };

  function switchTab(targetTabId, updateHistory = true) {
    if (!targetTabId) return;

    // Update active tab buttons
    tabButtons.forEach(btn => {
      if (btn.getAttribute('data-tab') === targetTabId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Update active tab panels
    tabPanels.forEach(panel => {
      if (panel.id === targetTabId) {
        panel.classList.add('active');
      } else {
        panel.classList.remove('active');
      }
    });

    // Update URL history state if requested
    if (updateHistory && tabToPath[targetTabId]) {
      const targetPath = tabToPath[targetTabId];
      if (window.location.pathname !== targetPath) {
        try {
          history.pushState({ tab: targetTabId }, '', targetPath);
        } catch (e) {
          // Fallback for file:// protocol where pushState with root paths can be blocked by browser security
          console.warn('Could not update history state:', e);
        }
      }
    }
  }

  function initTabFromUrl() {
    const rawPath = window.location.pathname;
    let cleanPath = rawPath.toLowerCase();

    // Direct path mapping
    if (pathToTab[cleanPath]) {
      switchTab(pathToTab[cleanPath], false);
      return;
    }

    // Pattern matching fallback
    if (cleanPath.includes('experience1') || cleanPath.includes('experience-1')) {
      switchTab('exp1-tab', false);
    } else if (cleanPath.includes('experience2') || cleanPath.includes('experience-2')) {
      switchTab('exp2-tab', false);
    } else {
      switchTab('bio-tab', false);
    }
  }

  // Listen for browser back/forward buttons
  window.addEventListener('popstate', (e) => {
    if (e.state && e.state.tab) {
      switchTab(e.state.tab, false);
    } else {
      initTabFromUrl();
    }
  });

  // Tab button click handlers
  tabButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      const targetTab = button.getAttribute('data-tab');

      // Only handle if data-tab exists and tab panels exist on page
      if (targetTab && tabPanels.length > 0) {
        e.preventDefault();
        switchTab(targetTab, true);

        // Close mobile nav drawer if open
        if (navTabsContainer && navTabsContainer.classList.contains('open')) {
          navTabsContainer.classList.remove('open');
        }

        window.scrollTo({
          top: 0,
          behavior: 'smooth'
        });
      }
    });
  });

  // Init on load if tab panels exist
  if (tabPanels.length > 0) {
    initTabFromUrl();
  } else {
    // For standalone pages (experience1.html, experience2.html), highlight active nav link
    const currentPath = window.location.pathname.toLowerCase();
    if (currentPath.includes('experience1') || currentPath.includes('experience-1')) {
      setActiveNavLink('experience1');
    } else if (currentPath.includes('experience2') || currentPath.includes('experience-2')) {
      setActiveNavLink('experience2');
    } else {
      setActiveNavLink('bio');
    }
  }

  function setActiveNavLink(pageKey) {
    tabButtons.forEach(btn => {
      const href = btn.getAttribute('href') || '';
      const dataTab = btn.getAttribute('data-tab') || '';
      if (
        (pageKey === 'experience1' && (href.includes('experience1') || href.includes('experience-1') || dataTab === 'exp1-tab')) ||
        (pageKey === 'experience2' && (href.includes('experience2') || href.includes('experience-2') || dataTab === 'exp2-tab')) ||
        (pageKey === 'bio' && (href === '/' || href === 'index.html' || dataTab === 'bio-tab'))
      ) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  // Mobile menu toggle
  if (mobileToggle && navTabsContainer) {
    mobileToggle.addEventListener('click', () => {
      navTabsContainer.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
      if (!navTabsContainer.contains(e.target) && !mobileToggle.contains(e.target)) {
        navTabsContainer.classList.remove('open');
      }
    });
  }

  // -------------------------------------------------------------
  // Global Topbar URL Display & Copy URL Action
  // -------------------------------------------------------------
  const topbarUrlInput = document.getElementById('topbarUrlInput');
  const topbarCopyUrlBtn = document.getElementById('topbarCopyUrlBtn');

  function updateTopbarUrlDisplay(customUrl) {
    if (topbarUrlInput) {
      if (typeof customUrl === 'string' && customUrl.length > 0) {
        topbarUrlInput.value = customUrl;
      } else {
        topbarUrlInput.value = window.location.href;
      }
    }
  }

  window.updateGlobalTopbarUrl = updateTopbarUrlDisplay;
  
  // Initial population
  if (topbarUrlInput) {
    topbarUrlInput.value = window.location.href;
  }

  if (topbarCopyUrlBtn && topbarUrlInput) {
    topbarCopyUrlBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const targetUrl = topbarUrlInput.value || window.location.href;

      topbarUrlInput.focus();
      topbarUrlInput.select();

      const triggerSuccess = () => {
        topbarCopyUrlBtn.classList.add('copied');
        const span = topbarCopyUrlBtn.querySelector('span');
        const originalText = span ? span.textContent : 'Copy URL';
        if (span) span.textContent = 'Copied!';

        setTimeout(() => {
          topbarCopyUrlBtn.classList.remove('copied');
          if (span) span.textContent = originalText;
        }, 2000);
      };

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(targetUrl).then(() => {
          triggerSuccess();
        }).catch(() => {
          document.execCommand('copy');
          triggerSuccess();
        });
      } else {
        document.execCommand('copy');
        triggerSuccess();
      }
    });
  }
});

