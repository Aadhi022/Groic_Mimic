/**
 * GROIC - Storage Service
 * 
 * Safe, robust browser storage abstraction.
 * Provides fallback in-memory storage if localStorage is blocked (e.g. strict incognito),
 * data validation, schema stability, and storage mutation events.
 */

window.GroicStorage = (function () {
  const PREFIX = 'groic_';
  const memoryStore = new Map();

  // Test whether localStorage is available and functional
  const isLocalStorageAvailable = (function () {
    try {
      const testKey = '__groic_storage_test__';
      localStorage.setItem(testKey, testKey);
      localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      console.warn('GROIC: localStorage unavailable. Using in-memory fallback session store.', e);
      return false;
    }
  })();

  function formatKey(key) {
    return key.startsWith(PREFIX) ? key : `${PREFIX}${key}`;
  }

  /**
   * Get an item from storage and parse as JSON.
   * If parsing fails or key is missing, returns defaultValue.
   */
  function getItem(key, defaultValue = null) {
    const fullKey = formatKey(key);
    try {
      let rawValue = null;
      if (isLocalStorageAvailable) {
        rawValue = localStorage.getItem(fullKey);
      } else {
        rawValue = memoryStore.get(fullKey) || null;
      }

      if (rawValue === null || rawValue === undefined) {
        return defaultValue;
      }

      return JSON.parse(rawValue);
    } catch (err) {
      console.error(`GROIC: Error reading or parsing storage key "${key}":`, err);
      return defaultValue;
    }
  }

  /**
   * Save an item to storage as serialized JSON.
   */
  function setItem(key, value) {
    const fullKey = formatKey(key);
    try {
      const serialized = JSON.stringify(value);
      if (isLocalStorageAvailable) {
        localStorage.setItem(fullKey, serialized);
      } else {
        memoryStore.set(fullKey, serialized);
      }

      // Notify window listeners
      window.dispatchEvent(new CustomEvent('groic:storage-update', {
        detail: { key, fullKey, value }
      }));

      return true;
    } catch (err) {
      console.error(`GROIC: Error writing storage key "${key}":`, err);
      return false;
    }
  }

  /**
   * Remove an item from storage.
   */
  function removeItem(key) {
    const fullKey = formatKey(key);
    try {
      if (isLocalStorageAvailable) {
        localStorage.removeItem(fullKey);
      } else {
        memoryStore.delete(fullKey);
      }

      window.dispatchEvent(new CustomEvent('groic:storage-update', {
        detail: { key, fullKey, value: null }
      }));

      return true;
    } catch (err) {
      console.error(`GROIC: Error removing storage key "${key}":`, err);
      return false;
    }
  }

  /**
   * Clear all Groic items from storage without touching other site data.
   */
  function clearAllGroicData() {
    try {
      if (isLocalStorageAvailable) {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(PREFIX)) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
      }
      memoryStore.clear();

      window.dispatchEvent(new CustomEvent('groic:storage-update', {
        detail: { action: 'clear' }
      }));
      return true;
    } catch (err) {
      console.error('GROIC: Error clearing storage data:', err);
      return false;
    }
  }

  return {
    isAvailable: isLocalStorageAvailable,
    getItem,
    setItem,
    removeItem,
    clearAll: clearAllGroicData
  };
})();
