/**
 * GROIC - Local Library Service
 * 
 * Manages saved songs, user playlists, and playback history using GroicStorage.
 * Designed with a clean interface that mimics a cloud database repository.
 */

window.GroicLocalLibrary = (function () {
  const KEYS = {
    SAVED_SONGS: 'library_saved_songs',
    PLAYLISTS: 'library_playlists',
    HISTORY: 'library_history',
    SEEDED: 'library_seeded_v1'
  };

  const MAX_HISTORY_ITEMS = 25;

  // Initial starter track list for first-time visitors
  const DEFAULT_STARTER_PLAYLIST = {
    id: 'starter_chill_01',
    name: 'Groic Chill Essentials',
    description: 'A curated mix of deep focus beats, lofi vibes, and modern synth grooves.',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    songs: [
      {
        id: 'jfKfPfyJRdk',
        title: 'lofi hip hop radio 📚 - beats to relax/study to',
        channel: 'Lofi Girl',
        thumbnail: 'https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg',
        addedAt: Date.now() - 3600000 * 3
      },
      {
        id: '4xDzrJKXOOY',
        title: 'synthwave radio 🌌 - chill synth / retro beats',
        channel: 'Lofi Girl',
        thumbnail: 'https://i.ytimg.com/vi/4xDzrJKXOOY/hqdefault.jpg',
        addedAt: Date.now() - 3600000 * 2
      },
      {
        id: '5qap5aO4i9A',
        title: 'Lofi Hip Hop Radio 24/7 🔴 Chill Study Beats',
        channel: 'ChilledCow / Lofi Record',
        thumbnail: 'https://i.ytimg.com/vi/5qap5aO4i9A/hqdefault.jpg',
        addedAt: Date.now() - 3600000
      }
    ]
  };

  /**
   * Check and initialize initial seed data on first visit
   */
  function initSeedData() {
    const isSeeded = GroicStorage.getItem(KEYS.SEEDED, false);
    if (!isSeeded) {
      const existingPlaylists = GroicStorage.getItem(KEYS.PLAYLISTS, null);
      if (!existingPlaylists || !Array.isArray(existingPlaylists) || existingPlaylists.length === 0) {
        GroicStorage.setItem(KEYS.PLAYLISTS, [DEFAULT_STARTER_PLAYLIST]);
      }

      const existingSaved = GroicStorage.getItem(KEYS.SAVED_SONGS, null);
      if (!existingSaved || !Array.isArray(existingSaved) || existingSaved.length === 0) {
        // Pre-save one track to demonstrate saved feature
        GroicStorage.setItem(KEYS.SAVED_SONGS, [DEFAULT_STARTER_PLAYLIST.songs[0]]);
      }

      GroicStorage.setItem(KEYS.SEEDED, true);
    }
  }

  // Run seed check immediately
  initSeedData();

  // --------------------------------------------------------------------------
  // Saved Songs Methods
  // --------------------------------------------------------------------------

  function getSavedSongs() {
    const songs = GroicStorage.getItem(KEYS.SAVED_SONGS, []);
    return Array.isArray(songs) ? songs : [];
  }

  function isSongSaved(trackId) {
    if (!trackId) return false;
    const songs = getSavedSongs();
    return songs.some(song => song.id === trackId);
  }

  function saveSong(track) {
    if (!track || !track.id) {
      return { success: false, message: 'Invalid track data' };
    }

    const songs = getSavedSongs();
    const existingIndex = songs.findIndex(s => s.id === track.id);

    if (existingIndex !== -1) {
      return { success: false, message: 'Track is already saved in your library' };
    }

    const newSong = {
      id: track.id,
      title: track.title || 'Untitled Track',
      channel: track.channel || 'Unknown Artist',
      thumbnail: track.thumbnail || './assets/images/default-cover.svg',
      addedAt: Date.now()
    };

    songs.unshift(newSong);
    GroicStorage.setItem(KEYS.SAVED_SONGS, songs);

    return { success: true, message: 'Track saved to your library', song: newSong };
  }

  function removeSavedSong(trackId) {
    if (!trackId) return { success: false, message: 'Track ID required' };
    const songs = getSavedSongs();
    const filtered = songs.filter(s => s.id !== trackId);
    GroicStorage.setItem(KEYS.SAVED_SONGS, filtered);
    return { success: true, message: 'Track removed from library' };
  }

  // --------------------------------------------------------------------------
  // Playlist Management Methods
  // --------------------------------------------------------------------------

  function getPlaylists() {
    const playlists = GroicStorage.getItem(KEYS.PLAYLISTS, []);
    return Array.isArray(playlists) ? playlists : [];
  }

  function getPlaylistById(id) {
    const playlists = getPlaylists();
    return playlists.find(p => p.id === id) || null;
  }

  function createPlaylist(name, description = '') {
    const trimmedName = (name || '').trim();
    if (!trimmedName) {
      return { success: false, message: 'Playlist name cannot be empty' };
    }

    const playlists = getPlaylists();
    const newPlaylist = {
      id: `pl_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      name: trimmedName,
      description: (description || '').trim(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      songs: []
    };

    playlists.unshift(newPlaylist);
    GroicStorage.setItem(KEYS.PLAYLISTS, playlists);

    return { success: true, message: `Created playlist "${trimmedName}"`, playlist: newPlaylist };
  }

  function renamePlaylist(id, newName) {
    const trimmed = (newName || '').trim();
    if (!trimmed) {
      return { success: false, message: 'Playlist name cannot be empty' };
    }

    const playlists = getPlaylists();
    const target = playlists.find(p => p.id === id);
    if (!target) {
      return { success: false, message: 'Playlist not found' };
    }

    target.name = trimmed;
    target.updatedAt = Date.now();
    GroicStorage.setItem(KEYS.PLAYLISTS, playlists);

    return { success: true, message: 'Playlist renamed', playlist: target };
  }

  function deletePlaylist(id) {
    const playlists = getPlaylists();
    const filtered = playlists.filter(p => p.id !== id);
    if (filtered.length === playlists.length) {
      return { success: false, message: 'Playlist not found' };
    }

    GroicStorage.setItem(KEYS.PLAYLISTS, filtered);
    return { success: true, message: 'Playlist deleted' };
  }

  function addSongToPlaylist(playlistId, track) {
    if (!playlistId || !track || !track.id) {
      return { success: false, message: 'Missing playlist or track information' };
    }

    const playlists = getPlaylists();
    const playlist = playlists.find(p => p.id === playlistId);

    if (!playlist) {
      return { success: false, message: 'Playlist not found' };
    }

    if (!Array.isArray(playlist.songs)) {
      playlist.songs = [];
    }

    // Check if track is already in playlist
    if (playlist.songs.some(s => s.id === track.id)) {
      return { success: false, message: `"${track.title}" is already in this playlist` };
    }

    const trackToAdd = {
      id: track.id,
      title: track.title || 'Untitled Track',
      channel: track.channel || 'Unknown Artist',
      thumbnail: track.thumbnail || './assets/images/default-cover.svg',
      addedAt: Date.now()
    };

    playlist.songs.push(trackToAdd);
    playlist.updatedAt = Date.now();
    GroicStorage.setItem(KEYS.PLAYLISTS, playlists);

    return { success: true, message: `Added to "${playlist.name}"`, playlist };
  }

  function removeSongFromPlaylist(playlistId, trackId) {
    const playlists = getPlaylists();
    const playlist = playlists.find(p => p.id === playlistId);

    if (!playlist) {
      return { success: false, message: 'Playlist not found' };
    }

    const prevLength = playlist.songs.length;
    playlist.songs = playlist.songs.filter(s => s.id !== trackId);

    if (playlist.songs.length === prevLength) {
      return { success: false, message: 'Track not found in this playlist' };
    }

    playlist.updatedAt = Date.now();
    GroicStorage.setItem(KEYS.PLAYLISTS, playlists);

    return { success: true, message: 'Song removed from playlist', playlist };
  }

  // --------------------------------------------------------------------------
  // Recently Played History Methods
  // --------------------------------------------------------------------------

  function getHistory() {
    const history = GroicStorage.getItem(KEYS.HISTORY, []);
    return Array.isArray(history) ? history : [];
  }

  function addToHistory(track) {
    if (!track || !track.id) return;

    let history = getHistory();
    // Remove if already exists to bring to the front
    history = history.filter(item => item.id !== track.id);

    const historyItem = {
      id: track.id,
      title: track.title || 'Untitled Track',
      channel: track.channel || 'Unknown Channel',
      thumbnail: track.thumbnail || './assets/images/default-cover.svg',
      playedAt: Date.now()
    };

    history.unshift(historyItem);

    // Maintain max limit
    if (history.length > MAX_HISTORY_ITEMS) {
      history = history.slice(0, MAX_HISTORY_ITEMS);
    }

    GroicStorage.setItem(KEYS.HISTORY, history);
  }

  function clearHistory() {
    GroicStorage.setItem(KEYS.HISTORY, []);
    return { success: true, message: 'Listening history cleared' };
  }

  return {
    getSavedSongs,
    isSongSaved,
    saveSong,
    removeSavedSong,
    getPlaylists,
    getPlaylistById,
    createPlaylist,
    renamePlaylist,
    deletePlaylist,
    addSongToPlaylist,
    removeSongFromPlaylist,
    getHistory,
    addToHistory,
    clearHistory
  };
})();
