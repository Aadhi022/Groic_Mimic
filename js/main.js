/**
 * GROIC - Main Application Runtime & Global UI Manager
 * 
 * Manages responsive navigation, header mode indicator, toast alerts,
 * and API key & Supabase runtime configuration modal.
 */

window.GroicApp = (function () {
  /**
   * Initialize common components when DOM is ready
   */
  function init() {
    initNavigation();
    initModeBadge();
    initSettingsModal();
    initGlobalEventListeners();
  }

  /**
   * Set active navigation link based on current URL path
   */
  function initNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';

    navLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (href) {
        const linkPath = href.split('/').pop().split('?')[0];
        if (
          linkPath === currentPath ||
          (currentPath === '' && linkPath === 'index.html') ||
          (currentPath === 'index.html' && linkPath === './index.html') ||
          (currentPath === 'room.html' && linkPath === './rooms.html')
        ) {
          link.classList.add('active');
        } else {
          link.classList.remove('active');
        }
      }
    });

    // Mobile menu toggle
    const toggleBtn = document.querySelector('.mobile-menu-toggle');
    const navMenu = document.querySelector('.nav-links');

    if (toggleBtn && navMenu) {
      toggleBtn.addEventListener('click', () => {
        const isOpen = navMenu.classList.toggle('active');
        toggleBtn.setAttribute('aria-expanded', String(isOpen));
      });

      // Close menu when clicking outside
      document.addEventListener('click', (e) => {
        if (!navMenu.contains(e.target) && !toggleBtn.contains(e.target)) {
          navMenu.classList.remove('active');
          toggleBtn.setAttribute('aria-expanded', 'false');
        }
      });
    }
  }

  /**
   * Update header mode badge (Live vs Demo Mode)
   */
  function initModeBadge() {
    const badge = document.getElementById('header-mode-badge');
    if (!badge) return;

    const isLive = window.GROIC_CONFIG && window.GROIC_CONFIG.isLiveMode();
    const isCloud = window.GroicSupabase && window.GroicSupabase.isConfigured();

    if (isLive && isCloud) {
      badge.className = 'mode-badge live';
      badge.innerHTML = `<span class="mode-dot"></span><span>Live & Cloud</span>`;
      badge.setAttribute('title', 'YouTube API & Supabase Cloud active. Click to manage settings.');
    } else if (isLive) {
      badge.className = 'mode-badge live';
      badge.innerHTML = `<span class="mode-dot"></span><span>Live Search</span>`;
      badge.setAttribute('title', 'YouTube API active, Supabase offline. Click to configure cloud.');
    } else if (isCloud) {
      badge.className = 'mode-badge live';
      badge.innerHTML = `<span class="mode-dot" style="background:var(--accent-cyan); box-shadow:0 0 8px var(--accent-cyan);"></span><span>Cloud Active</span>`;
      badge.setAttribute('title', 'Supabase Cloud connected, demo YouTube search. Click to configure YouTube API.');
    } else {
      badge.className = 'mode-badge demo';
      badge.innerHTML = `<span class="mode-dot"></span><span>Demo Mode</span>`;
      badge.setAttribute('title', 'Using local demo catalog. Click to configure YouTube API & Supabase.');
    }

    badge.addEventListener('click', openSettingsModal);
  }

  /**
   * Runtime Settings / API Key & Supabase Modal
   */
  function initSettingsModal() {
    let modal = document.getElementById('groic-settings-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'groic-settings-modal';
      modal.className = 'modal-overlay';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-labelledby', 'settings-modal-title');

      modal.innerHTML = `
        <div class="modal-container" style="max-width:540px;">
          <div class="modal-header">
            <div>
              <h3 class="modal-title" id="settings-modal-title">API & Cloud Settings</h3>
              <p class="form-help">Configure YouTube Search and Supabase Realtime Social Rooms</p>
            </div>
            <button class="btn-icon" id="settings-modal-close" aria-label="Close modal">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <div class="storage-status-banner" style="margin-top:0; margin-bottom:1.25rem;">
              <div class="storage-status-content">
                <div class="storage-status-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="16" x2="12" y2="12"></line>
                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                  </svg>
                </div>
                <div class="storage-status-text">
                  <h4 id="settings-current-mode-label">Current Environment</h4>
                  <p id="settings-current-mode-desc">Checking environment configuration...</p>
                </div>
              </div>
            </div>

            <form id="groic-settings-form">
              <!-- Section 1: YouTube Search -->
              <div style="font-weight:700; font-size:0.95rem; margin-bottom:6px; color:var(--text-main);">
                1. YouTube Data API v3 (Search)
              </div>
              <div class="form-group">
                <label class="form-label" for="settings-api-key">Browser API Key (Optional)</label>
                <input type="password" id="settings-api-key" class="form-input" placeholder="AIzaSy..." autocomplete="off" />
                <p class="form-help">
                  Paste a restricted browser key to query live YouTube search. Leave empty to use curated demo catalog.
                </p>
              </div>

              <!-- Section 2: Supabase Cloud -->
              <div style="font-weight:700; font-size:0.95rem; margin-top:1.25rem; margin-bottom:6px; color:var(--text-main);">
                2. Supabase Cloud (Social Rooms & Auth)
              </div>
              <div class="form-group">
                <label class="form-label" for="settings-supabase-url">Project URL</label>
                <input type="text" id="settings-supabase-url" class="form-input" placeholder="https://xyzcompany.supabase.co" autocomplete="off" />
              </div>
              <div class="form-group">
                <label class="form-label" for="settings-supabase-key">Project Anon / Public Key</label>
                <input type="password" id="settings-supabase-key" class="form-input" placeholder="eyJhbGciOi..." autocomplete="off" />
                <p class="form-help">
                  Find these in your Supabase Dashboard under Project Settings &rarr; API. Never use service_role keys.
                </p>
              </div>

              <!-- Section 3: Force Demo Toggle -->
              <div class="form-group" style="display:flex; align-items:center; justify-content:space-between; margin-top:1rem; padding:0.75rem 1rem; background:var(--bg-card); border-radius:var(--radius-md); border:1px solid var(--border-subtle);">
                <div>
                  <div style="font-weight:600; font-size:0.92rem;">Force Offline / Demo Mode</div>
                  <div style="font-size:0.78rem; color:var(--text-subtle);">Always use local storage & demo catalog</div>
                </div>
                <input type="checkbox" id="settings-force-demo" style="width:18px; height:18px; accent-color:var(--accent-magenta); cursor:pointer;" />
              </div>

              <div class="modal-footer" style="padding:1.25rem 0 0 0;">
                <button type="button" class="btn btn-secondary btn-sm" id="settings-btn-clear-all">Reset to Defaults</button>
                <button type="submit" class="btn btn-primary btn-sm">Save & Apply</button>
              </div>
            </form>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      const closeBtn = modal.querySelector('#settings-modal-close');
      closeBtn.addEventListener('click', closeSettingsModal);
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeSettingsModal();
      });

      const form = modal.querySelector('#groic-settings-form');
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const inputKey = modal.querySelector('#settings-api-key').value;
        const inputSupabaseUrl = modal.querySelector('#settings-supabase-url').value;
        const inputSupabaseKey = modal.querySelector('#settings-supabase-key').value;
        const forceDemo = modal.querySelector('#settings-force-demo').checked;

        window.GROIC_CONFIG.setApiKey(inputKey);
        window.GROIC_CONFIG.setSupabaseConfig(inputSupabaseUrl, inputSupabaseKey);
        window.GROIC_CONFIG.setForceDemo(forceDemo);

        if (window.GroicSupabase) {
          window.GroicSupabase.resetClient();
        }

        showToast('Settings saved successfully', 'success');
        closeSettingsModal();
        initModeBadge();

        setTimeout(() => window.location.reload(), 400);
      });

      const clearBtn = modal.querySelector('#settings-btn-clear-all');
      clearBtn.addEventListener('click', () => {
        window.GROIC_CONFIG.setApiKey('');
        window.GROIC_CONFIG.setSupabaseConfig('', '');
        window.GROIC_CONFIG.setForceDemo(false);
        if (window.GroicSupabase) {
          window.GroicSupabase.resetClient();
        }
        modal.querySelector('#settings-api-key').value = '';
        modal.querySelector('#settings-supabase-url').value = '';
        modal.querySelector('#settings-supabase-key').value = '';
        modal.querySelector('#settings-force-demo').checked = false;
        showToast('Configuration reset to defaults.', 'info');
        initModeBadge();
      });
    }
  }

  function openSettingsModal() {
    const modal = document.getElementById('groic-settings-modal');
    if (!modal) return;

    const isLive = window.GROIC_CONFIG.isLiveMode();
    const isCloud = window.GroicSupabase && window.GroicSupabase.isConfigured();
    const modeLabel = modal.querySelector('#settings-current-mode-label');
    const modeDesc = modal.querySelector('#settings-current-mode-desc');
    const keyInput = modal.querySelector('#settings-api-key');
    const urlInput = modal.querySelector('#settings-supabase-url');
    const supKeyInput = modal.querySelector('#settings-supabase-key');
    const demoCheckbox = modal.querySelector('#settings-force-demo');

    if (modeLabel && modeDesc) {
      if (isLive && isCloud) {
        modeLabel.textContent = 'Full Live & Cloud Mode';
        modeDesc.textContent = 'YouTube Data API v3 and Supabase Realtime are fully active.';
      } else if (isLive) {
        modeLabel.textContent = 'Live YouTube Search Active';
        modeDesc.textContent = 'YouTube API active; configure Supabase to enable Social Rooms.';
      } else if (isCloud) {
        modeLabel.textContent = 'Supabase Cloud Active';
        modeDesc.textContent = 'Supabase connected for Social Rooms & Library Sync; using demo music search.';
      } else {
        modeLabel.textContent = 'Local Demo Mode Active';
        modeDesc.textContent = 'Running with browser localStorage & curated catalog. Add keys below to activate live cloud features.';
      }
    }

    if (keyInput) keyInput.value = window.GROIC_CONFIG.getApiKey();
    if (urlInput) urlInput.value = window.GROIC_CONFIG.SUPABASE_URL || '';
    if (supKeyInput) supKeyInput.value = window.GROIC_CONFIG.SUPABASE_ANON_KEY || '';
    if (demoCheckbox) demoCheckbox.checked = window.GROIC_CONFIG.FORCE_DEMO_MODE;

    modal.classList.add('active');
  }

  function closeSettingsModal() {
    const modal = document.getElementById('groic-settings-modal');
    if (modal) modal.classList.remove('active');
  }

  /**
   * Toast notification dispatch
   */
  function showToast(message, type = 'info', duration = 3000) {
    let container = document.getElementById('groic-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'groic-toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-lime)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    } else if (type === 'error') {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-coral)" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    } else {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-cyan)" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }

    toast.innerHTML = `
      <span style="display:flex; align-items:center;">${iconSvg}</span>
      <span style="flex:1;">${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px) scale(0.95)';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  function initGlobalEventListeners() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const openModals = document.querySelectorAll('.modal-overlay.active');
        openModals.forEach(m => m.classList.remove('active'));
      }
    });

    document.querySelectorAll('[data-action="open-settings"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        openSettingsModal();
      });
    });
  }

  function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, function (m) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return {
    init,
    showToast,
    openSettingsModal,
    closeSettingsModal
  };
})();
