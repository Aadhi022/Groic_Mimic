/**
 * GROIC - Supabase Client Factory
 * 
 * Provides a shared, robust singleton client instance for Supabase Auth,
 * PostgreSQL Database, and Realtime Channels.
 */

window.GroicSupabase = (function () {
  let clientInstance = null;
  let cachedUrl = '';
  let cachedKey = '';

  function isConfigured() {
    return Boolean(
      window.GROIC_CONFIG &&
      typeof window.GROIC_CONFIG.isSupabaseConfigured === 'function' &&
      window.GROIC_CONFIG.isSupabaseConfigured()
    );
  }

  function getClient() {
    if (!isConfigured()) {
      return null;
    }

    const currentUrl = window.GROIC_CONFIG.SUPABASE_URL.trim();
    const currentKey = window.GROIC_CONFIG.SUPABASE_ANON_KEY.trim();

    // Recreate client if credentials changed
    if (clientInstance && (cachedUrl !== currentUrl || cachedKey !== currentKey)) {
      clientInstance = null;
    }

    if (clientInstance) {
      return clientInstance;
    }

    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      console.warn('GROIC: Supabase JS SDK not loaded yet. Check internet connection or CDN script tag.');
      return null;
    }

    try {
      clientInstance = window.supabase.createClient(currentUrl, currentKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        },
        realtime: {
          params: {
            eventsPerSecond: 10
          }
        }
      });

      cachedUrl = currentUrl;
      cachedKey = currentKey;
      return clientInstance;
    } catch (err) {
      console.error('GROIC: Failed to create Supabase client:', err);
      return null;
    }
  }

  function resetClient() {
    clientInstance = null;
    cachedUrl = '';
    cachedKey = '';
  }

  return {
    isConfigured,
    getClient,
    resetClient
  };
})();
