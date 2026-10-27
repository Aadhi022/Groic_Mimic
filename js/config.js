/**
 * GROIC - Active Runtime Configuration
 * 
 * Supports:
 * 1. Default static settings.
 * 2. In-browser user overrides stored in localStorage (allows easy testing on GitHub Pages).
 * 3. Graceful fallback to Demo Mode if no valid key is provided.
 */

(function () {
  // Check for in-browser user overrides stored in localStorage
  let storedApiKey = '';
  let storedSupabaseUrl = '';
  let storedSupabaseKey = '';
  let storedForceDemo = false;

  try {
    storedApiKey = localStorage.getItem('groic_custom_youtube_api_key') || '';
    storedSupabaseUrl = localStorage.getItem('groic_custom_supabase_url') || '';
    storedSupabaseKey = localStorage.getItem('groic_custom_supabase_key') || '';
    storedForceDemo = localStorage.getItem('groic_force_demo_mode') === 'true';
  } catch (e) {
    console.warn('GROIC: Local storage access limited or disabled.', e);
  }

  window.GROIC_CONFIG = {
    // YouTube Data API v3 Key (Leave empty to use Demo Mode)
    YOUTUBE_API_KEY: storedApiKey || '',

    // Force demo mode toggle
    FORCE_DEMO_MODE: storedForceDemo || false,

    // Default search topic
    DEFAULT_SEARCH_GENRE: 'trending sounds',

    // Results per batch
    MAX_RESULTS_PER_PAGE: 12,

    // Supabase Credentials (for Cloud Auth, Social Rooms & Library Sync)
    SUPABASE_URL: storedSupabaseUrl || '',
    SUPABASE_ANON_KEY: storedSupabaseKey || '',

    // App Branding
    APP_NAME: 'GROIC',
    APP_TAGLINE: 'Create a Room. Invite Your People. Listen Together.',
    VERSION: '2.0.0',

    // Helper functions
    isLiveMode: function () {
      return !this.FORCE_DEMO_MODE && Boolean(this.YOUTUBE_API_KEY && this.YOUTUBE_API_KEY.trim().length > 10);
    },

    isSupabaseConfigured: function () {
      return Boolean(
        this.SUPABASE_URL && 
        this.SUPABASE_URL.trim().startsWith('http') && 
        this.SUPABASE_ANON_KEY && 
        this.SUPABASE_ANON_KEY.trim().length > 15
      );
    },

    getApiKey: function () {
      return this.YOUTUBE_API_KEY ? this.YOUTUBE_API_KEY.trim() : '';
    },

    setApiKey: function (key) {
      this.YOUTUBE_API_KEY = key.trim();
      try {
        if (this.YOUTUBE_API_KEY) {
          localStorage.setItem('groic_custom_youtube_api_key', this.YOUTUBE_API_KEY);
        } else {
          localStorage.removeItem('groic_custom_youtube_api_key');
        }
      } catch (e) {
        console.error('Failed to save API key to localStorage', e);
      }
    },

    setSupabaseConfig: function (url, anonKey) {
      this.SUPABASE_URL = (url || '').trim();
      this.SUPABASE_ANON_KEY = (anonKey || '').trim();
      try {
        if (this.SUPABASE_URL) {
          localStorage.setItem('groic_custom_supabase_url', this.SUPABASE_URL);
        } else {
          localStorage.removeItem('groic_custom_supabase_url');
        }

        if (this.SUPABASE_ANON_KEY) {
          localStorage.setItem('groic_custom_supabase_key', this.SUPABASE_ANON_KEY);
        } else {
          localStorage.removeItem('groic_custom_supabase_key');
        }
      } catch (e) {
        console.error('Failed to save Supabase config to localStorage', e);
      }
    },

    setForceDemo: function (force) {
      this.FORCE_DEMO_MODE = Boolean(force);
      try {
        localStorage.setItem('groic_force_demo_mode', String(this.FORCE_DEMO_MODE));
      } catch (e) {}
    }
  };
})();
