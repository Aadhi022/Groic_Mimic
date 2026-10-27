/**
 * GROIC - Music Service
 * 
 * High-level music discovery & playback queue facade.
 * Shields the UI components from direct low-level API operations.
 */

window.GroicMusicService = (function () {
  const QUEUE_STORAGE_KEY = 'active_playback_queue';
  const CURRENT_INDEX_KEY = 'active_queue_index';

  /**
   * Search for music by query or category
   */
  async function search(query, pageToken = '', options = {}) {
    return GroicYouTube.searchVideos(query, pageToken, options);
  }

  /**
   * Get curated featured tracks for the landing page hero & discovery preview
   */
  async function getFeaturedTracks(limit = 6) {
    const isLive = window.GROIC_CONFIG && window.GROIC_CONFIG.isLiveMode();
    if (isLive) {
      try {
        const result = await GroicYouTube.searchVideos('trending electronic synthwave chill', '', { maxResults: limit });
        if (result.items && result.items.length > 0) {
          return result.items.slice(0, limit);
        }
      } catch (e) {
        console.warn('GROIC: Error fetching live featured tracks, using demo catalog.', e);
      }
    }
    return GroicYouTube.DEMO_CATALOG.slice(0, limit);
  }

  /**
   * Retrieve active playback queue
   */
  function getQueue() {
    return GroicStorage.getItem(QUEUE_STORAGE_KEY, []);
  }

  /**
   * Set active playback queue
   */
  function setQueue(tracks, startIndex = 0) {
    const validTracks = Array.isArray(tracks) ? tracks : [];
    GroicStorage.setItem(QUEUE_STORAGE_KEY, validTracks);
    GroicStorage.setItem(CURRENT_INDEX_KEY, startIndex);
  }

  /**
   * Add a single track to the end of the queue
   */
  function enqueue(track) {
    if (!track || !track.id) return;
    const queue = getQueue();
    // Prevent duplicate adjacent additions
    if (!queue.some(t => t.id === track.id)) {
      queue.push(track);
      GroicStorage.setItem(QUEUE_STORAGE_KEY, queue);
    }
  }

  /**
   * Get current queue index
   */
  function getCurrentQueueIndex() {
    return GroicStorage.getItem(CURRENT_INDEX_KEY, 0);
  }

  /**
   * Set current queue index
   */
  function setCurrentQueueIndex(index) {
    GroicStorage.setItem(CURRENT_INDEX_KEY, index);
  }

  return {
    search,
    getFeaturedTracks,
    getQueue,
    setQueue,
    enqueue,
    getCurrentQueueIndex,
    setCurrentQueueIndex
  };
})();
