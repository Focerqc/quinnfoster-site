/**
 * Quinn Foster Personal Hub - Interactive Navigation & State Management
 */

document.addEventListener('DOMContentLoaded', () => {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const mobileToggle = document.getElementById('mobileMenuToggle');
  const navTabsContainer = document.getElementById('navTabs');

  function updateActiveTabFromUrl() {
    const rawPath = window.location.pathname.toLowerCase();
    const href = window.location.href.toLowerCase();

    let pageKey = 'bio';
    if (rawPath.includes('experience6') || href.includes('experience6')) {
      pageKey = 'experience6';
    } else if (rawPath.includes('experience4') || href.includes('experience4')) {
      pageKey = 'experience4';
    } else if (rawPath.includes('experience3') || href.includes('experience3')) {
      pageKey = 'experience3';
    } else if (rawPath.includes('experience2') || href.includes('experience2')) {
      pageKey = 'experience2';
    } else if (rawPath.includes('experience1') || href.includes('experience1')) {
      pageKey = 'experience1';
    }

    tabButtons.forEach(btn => {
      const btnHref = (btn.getAttribute('href') || '').toLowerCase();
      const isMatch = (
        (pageKey === 'experience6' && btnHref.includes('experience6')) ||
        (pageKey === 'experience4' && btnHref.includes('experience4')) ||
        (pageKey === 'experience3' && btnHref.includes('experience3')) ||
        (pageKey === 'experience2' && btnHref.includes('experience2')) ||
        (pageKey === 'experience1' && btnHref.includes('experience1')) ||
        (pageKey === 'bio' && (btnHref === '/' || btnHref.includes('index.html') || btnHref === ''))
      );

      if (isMatch) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  // Set active tab highlight on page load
  updateActiveTabFromUrl();

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
