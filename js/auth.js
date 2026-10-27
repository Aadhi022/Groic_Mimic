/**
 * GROIC - Functional Supabase Authentication Service
 * 
 * Provides:
 * - Email & Password Sign Up (with custom display name)
 * - Email & Password Sign In
 * - Session restoration on page load
 * - Realtime auth state listener
 * - User profile retrieval & update
 * - Sign Out
 * - Clear, honest UI indicators for unconfigured vs connected state
 */

window.GroicAuth = (function () {
  let currentUser = null;
  let currentProfile = null;
  let isInitialized = false;

  function isCloudConfigured() {
    return window.GroicSupabase && window.GroicSupabase.isConfigured();
  }

  /**
   * Initialize session and auth listeners
   */
  async function init() {
    if (isInitialized) return;
    isInitialized = true;

    if (!isCloudConfigured()) {
      updateAuthUI(null);
      return;
    }

    const client = window.GroicSupabase.getClient();
    if (!client) {
      updateAuthUI(null);
      return;
    }

    try {
      // 1. Restore active session
      const { data: { session }, error } = await client.auth.getSession();
      if (session && session.user) {
        currentUser = session.user;
        await fetchUserProfile(currentUser.id);
      } else {
        currentUser = null;
        currentProfile = null;
      }
      updateAuthUI(currentUser);

      // 2. Listen for auth state changes (SIGN_IN, SIGN_OUT, TOKEN_REFRESHED)
      client.auth.onAuthStateChange(async (event, session) => {
        if (session && session.user) {
          currentUser = session.user;
          await fetchUserProfile(currentUser.id);
        } else {
          currentUser = null;
          currentProfile = null;
        }
        updateAuthUI(currentUser);
        window.dispatchEvent(new CustomEvent('groic:auth-change', {
          detail: { event, user: currentUser, profile: currentProfile }
        }));
      });
    } catch (err) {
      console.warn('GROIC Auth: Session restoration error', err);
      updateAuthUI(null);
    }
  }

  async function fetchUserProfile(userId) {
    if (!userId || !isCloudConfigured()) return;
    try {
      const client = window.GroicSupabase.getClient();
      if (!client) return;

      const { data, error } = await client
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (data) {
        currentProfile = data;
      } else {
        // Fallback profile if profile trigger had slight latency
        currentProfile = {
          id: userId,
          display_name: currentUser.user_metadata?.display_name || currentUser.email.split('@')[0],
          avatar_url: currentUser.user_metadata?.avatar_url || null
        };
      }
    } catch (e) {
      console.warn('Failed to fetch profile', e);
    }
  }

  function getCurrentUser() {
    return currentUser;
  }

  function getCurrentProfile() {
    if (currentProfile) return currentProfile;
    if (currentUser) {
      return {
        id: currentUser.id,
        display_name: currentUser.user_metadata?.display_name || currentUser.email.split('@')[0],
        avatar_url: null
      };
    }
    return null;
  }

  function isAuthenticated() {
    return Boolean(currentUser && currentUser.id);
  }

  /**
   * User Registration
   */
  async function signUp(email, password, displayName) {
    if (!isCloudConfigured()) {
      return {
        success: false,
        message: 'Supabase is not configured. Please add your SUPABASE_URL and SUPABASE_ANON_KEY in settings.'
      };
    }

    const client = window.GroicSupabase.getClient();
    if (!client) return { success: false, message: 'Supabase client unavailable' };

    try {
      const cleanEmail = email.trim();
      const cleanName = (displayName || cleanEmail.split('@')[0]).trim();

      const { data, error } = await client.auth.signUp({
        email: cleanEmail,
        password: password,
        options: {
          data: {
            display_name: cleanName
          }
        }
      });

      if (error) {
        return { success: false, message: error.message };
      }

      if (data.user) {
        currentUser = data.user;
        await fetchUserProfile(currentUser.id);
        updateAuthUI(currentUser);

        // If email confirmation is enabled on Supabase project, notify user
        if (data.session === null) {
          return {
            success: true,
            requiresConfirmation: true,
            message: 'Account created! Please check your email to confirm registration before logging in.',
            user: data.user
          };
        }

        return {
          success: true,
          message: `Welcome to GROIC, ${cleanName}!`,
          user: data.user
        };
      }

      return { success: false, message: 'Registration could not be completed.' };
    } catch (err) {
      return { success: false, message: err.message || 'Registration failed' };
    }
  }

  /**
   * User Sign In
   */
  async function signIn(email, password) {
    if (!isCloudConfigured()) {
      return {
        success: false,
        message: 'Supabase is not configured. Please add your credentials in Settings.'
      };
    }

    const client = window.GroicSupabase.getClient();
    if (!client) return { success: false, message: 'Supabase client unavailable' };

    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: email.trim(),
        password: password
      });

      if (error) {
        return { success: false, message: error.message };
      }

      currentUser = data.user;
      await fetchUserProfile(currentUser.id);
      updateAuthUI(currentUser);

      const name = currentProfile?.display_name || currentUser.email.split('@')[0];
      return {
        success: true,
        message: `Welcome back, ${name}!`,
        user: data.user
      };
    } catch (err) {
      return { success: false, message: err.message || 'Sign in failed' };
    }
  }

  /**
   * User Sign Out
   */
  async function signOut() {
    if (!isCloudConfigured()) {
      currentUser = null;
      currentProfile = null;
      updateAuthUI(null);
      return { success: true };
    }

    const client = window.GroicSupabase.getClient();
    if (client) {
      await client.auth.signOut();
    }

    currentUser = null;
    currentProfile = null;
    updateAuthUI(null);

    if (window.GroicApp && window.GroicApp.showToast) {
      window.GroicApp.showToast('You have been signed out.', 'info');
    }

    window.dispatchEvent(new CustomEvent('groic:auth-change', {
      detail: { event: 'SIGNED_OUT', user: null, profile: null }
    }));

    return { success: true };
  }

  /**
   * Update all header navigation auth elements
   */
  function updateAuthUI(user) {
    const authContainers = document.querySelectorAll('.header-user-slot');
    const isCloud = isCloudConfigured();

    authContainers.forEach(container => {
      if (!isCloud) {
        container.innerHTML = `
          <button class="btn btn-secondary btn-sm" data-action="open-auth" title="Cloud Sync & Auth">
            <span>Sign In</span>
          </button>
        `;
        return;
      }

      if (user) {
        const profile = getCurrentProfile();
        const displayName = profile?.display_name || user.email.split('@')[0];
        const initials = displayName.substring(0, 2).toUpperCase();

        container.innerHTML = `
          <div class="user-header-menu" style="display:flex; align-items:center; gap:8px;">
            <div class="user-avatar-pill" title="${escapeHtml(displayName)} (${escapeHtml(user.email)})" style="display:inline-flex; align-items:center; gap:6px; background:var(--bg-card); border:1px solid var(--border-subtle); padding:4px 10px; border-radius:var(--radius-full); font-size:0.82rem; font-weight:600;">
              <span style="width:24px; height:24px; border-radius:50%; background:var(--grad-primary); color:#fff; display:inline-flex; align-items:center; justify-content:center; font-size:0.75rem; font-weight:700;">
                ${initials}
              </span>
              <span class="user-display-name" style="max-width:110px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                ${escapeHtml(displayName)}
              </span>
            </div>
            <button class="btn btn-ghost btn-sm btn-logout" title="Sign Out" aria-label="Sign Out" style="padding:4px 8px; color:var(--text-muted);">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
            </button>
          </div>
        `;

        const logoutBtn = container.querySelector('.btn-logout');
        if (logoutBtn) {
          logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            signOut();
          });
        }
      } else {
        container.innerHTML = `
          <button class="btn btn-secondary btn-sm" data-action="open-auth">
            <span>Sign In</span>
          </button>
        `;
      }
    });

    // Re-bind click handlers for any new auth buttons
    document.querySelectorAll('[data-action="open-auth"]').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        openAuthModal('signin');
      };
    });
  }

  /**
   * Render or open the Authentication modal
   */
  function openAuthModal(initialMode = 'signin') {
    let modal = document.getElementById('groic-auth-modal');
    if (!modal) {
      modal = createAuthModalDOM();
      document.body.appendChild(modal);
      bindAuthModalEvents(modal);
    }

    setAuthMode(initialMode);
    modal.classList.add('active');
  }

  function closeAuthModal() {
    const modal = document.getElementById('groic-auth-modal');
    if (modal) modal.classList.remove('active');
  }

  function setAuthMode(mode) {
    const title = document.getElementById('auth-modal-title');
    const subtitle = document.getElementById('auth-modal-subtitle');
    const submitBtn = document.getElementById('auth-submit-btn');
    const switchText = document.getElementById('auth-switch-text');
    const switchBtn = document.getElementById('auth-switch-btn');
    const nameField = document.getElementById('auth-name-group');
    const errorEl = document.getElementById('auth-error-msg');

    if (errorEl) {
      errorEl.style.display = 'none';
      errorEl.textContent = '';
    }

    if (mode === 'signup') {
      if (title) title.textContent = 'Create Groic Account';
      if (subtitle) subtitle.textContent = 'Listen together in rooms and sync your library';
      if (submitBtn) submitBtn.textContent = 'Create Account';
      if (nameField) nameField.style.display = 'block';
      if (switchText) switchText.textContent = 'Already have an account?';
      if (switchBtn) {
        switchBtn.textContent = 'Sign In';
        switchBtn.dataset.target = 'signin';
      }
    } else {
      if (title) title.textContent = 'Welcome Back to Groic';
      if (subtitle) subtitle.textContent = 'Sign in to join social rooms and access your cloud library';
      if (submitBtn) submitBtn.textContent = 'Sign In';
      if (nameField) nameField.style.display = 'none';
      if (switchText) switchText.textContent = "Don't have an account yet?";
      if (switchBtn) {
        switchBtn.textContent = 'Sign Up';
        switchBtn.dataset.target = 'signup';
      }
    }
  }

  function createAuthModalDOM() {
    const div = document.createElement('div');
    div.id = 'groic-auth-modal';
    div.className = 'modal-overlay';
    div.setAttribute('role', 'dialog');
    div.setAttribute('aria-modal', 'true');
    div.setAttribute('aria-labelledby', 'auth-modal-title');

    const isCloud = isCloudConfigured();

    div.innerHTML = `
      <div class="modal-container">
        <div class="modal-header">
          <div>
            <h3 class="modal-title" id="auth-modal-title">Sign In to Groic</h3>
            <p class="form-help" id="auth-modal-subtitle">Access your social rooms & cloud music</p>
          </div>
          <button class="btn-icon" id="auth-modal-close" aria-label="Close modal">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          ${!isCloud ? `
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
                  <h4>Supabase Configuration Required</h4>
                  <p>Realtime Social Rooms and Cloud Accounts require your Supabase URL & Anon Key. Configure them in Settings or js/config.js.</p>
                </div>
              </div>
              <button type="button" class="btn btn-secondary btn-sm" id="btn-open-settings-from-auth">Configure Settings</button>
            </div>
          ` : ''}

          <form id="groic-auth-form">
            <div class="form-group" id="auth-name-group" style="display:none;">
              <label class="form-label" for="auth-name">Your Display Name</label>
              <input type="text" id="auth-name" class="form-input" placeholder="e.g. Alex Rivera" autocomplete="name" />
            </div>

            <div class="form-group">
              <label class="form-label" for="auth-email">Email Address</label>
              <input type="email" id="auth-email" class="form-input" placeholder="you@example.com" required autocomplete="email" />
            </div>

            <div class="form-group">
              <label class="form-label" for="auth-password">Password</label>
              <input type="password" id="auth-password" class="form-input" placeholder="••••••••" required minlength="6" autocomplete="current-password" />
            </div>

            <div id="auth-error-msg" style="color:var(--accent-coral); font-size:0.85rem; margin-bottom:1rem; display:none;"></div>

            <button type="submit" class="btn btn-primary" id="auth-submit-btn" style="width:100%; margin-top:0.5rem;" ${!isCloud ? 'disabled' : ''}>
              Sign In
            </button>
          </form>

          <div style="margin-top:1.25rem; text-align:center; font-size:0.88rem; color:var(--text-muted);">
            <span id="auth-switch-text">Don't have an account yet?</span>
            <button type="button" id="auth-switch-btn" data-target="signup" style="color:var(--accent-magenta); font-weight:600; text-decoration:underline; margin-left:4px;">
              Sign Up
            </button>
          </div>
        </div>
      </div>
    `;

    return div;
  }

  function bindAuthModalEvents(modal) {
    const closeBtn = modal.querySelector('#auth-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', closeAuthModal);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeAuthModal();
    });

    const settingsBtn = modal.querySelector('#btn-open-settings-from-auth');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        closeAuthModal();
        if (window.GroicApp && window.GroicApp.openSettingsModal) {
          window.GroicApp.openSettingsModal();
        }
      });
    }

    const switchBtn = modal.querySelector('#auth-switch-btn');
    if (switchBtn) {
      switchBtn.addEventListener('click', () => {
        setAuthMode(switchBtn.dataset.target);
      });
    }

    const form = modal.querySelector('#groic-auth-form');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('auth-email').value.trim();
        const password = document.getElementById('auth-password').value;
        const nameField = document.getElementById('auth-name');
        const displayName = nameField ? nameField.value.trim() : '';
        const submitBtn = document.getElementById('auth-submit-btn');
        const errorEl = document.getElementById('auth-error-msg');
        const isSignUpMode = (submitBtn.textContent.trim() === 'Create Account');

        if (!isCloudConfigured()) {
          if (errorEl) {
            errorEl.style.display = 'block';
            errorEl.textContent = 'Please configure your Supabase URL & Anon Key in Settings before signing in.';
          }
          return;
        }

        submitBtn.disabled = true;
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Processing...';
        if (errorEl) errorEl.style.display = 'none';

        let res;
        if (isSignUpMode) {
          res = await signUp(email, password, displayName);
        } else {
          res = await signIn(email, password);
        }

        submitBtn.disabled = false;
        submitBtn.textContent = originalText;

        if (res.success) {
          if (window.GroicApp && window.GroicApp.showToast) {
            window.GroicApp.showToast(res.message, 'success');
          }
          closeAuthModal();
        } else {
          if (errorEl) {
            errorEl.style.display = 'block';
            errorEl.textContent = res.message || 'Authentication failed. Please verify credentials.';
          }
        }
      });
    }
  }

  function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, function (m) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
    });
  }

  // Auto initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return {
    init,
    openAuthModal,
    closeAuthModal,
    getCurrentUser,
    getCurrentProfile,
    isAuthenticated,
    isCloudConfigured,
    signUp,
    signIn,
    signOut
  };
})();
