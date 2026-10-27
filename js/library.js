/**
 * GROIC - Library Page Controller
 * 
 * Supports:
 * - Dynamic switching between Local Storage and Supabase Cloud Account
 * - Safe migration button ("Import to Cloud")
 * - Saved songs, playlists management, and listening history
 * - Reactive re-rendering on auth changes
 */

window.GroicLibrary = (function () {
  let activeTab = 'saved';
  let activePlaylistViewId = null;

  function getActiveLibraryProvider() {
    if (window.GroicSupabaseLibrary && GroicSupabaseLibrary.isUserAuthenticated()) {
      return GroicSupabaseLibrary;
    }
    return GroicLocalLibrary;
  }

  function init() {
    initTabs();
    initActionListeners();
    renderAll();

    // Listen for storage changes across components
    window.addEventListener('groic:storage-update', () => {
      renderAll();
    });

    // Listen for auth changes
    window.addEventListener('groic:auth-change', () => {
      renderAll();
      updateCloudStatusBanner();
    });

    updateCloudStatusBanner();
  }

  function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.dataset.tab;
        switchTab(targetTab);
      });
    });
  }

  function switchTab(tabName) {
    activeTab = tabName;
    activePlaylistViewId = null;

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    document.querySelectorAll('.tab-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === `tab-panel-${tabName}`);
    });

    renderAll();
  }

  function updateCloudStatusBanner() {
    const statusTextEl = document.getElementById('library-storage-status-text');
    const syncBtn = document.getElementById('btn-cloud-sync-info');
    const importBtn = document.getElementById('btn-import-to-cloud');

    const isAuthenticated = window.GroicAuth && GroicAuth.isAuthenticated();

    if (statusTextEl) {
      if (isAuthenticated) {
        const profile = GroicAuth.getCurrentProfile();
        statusTextEl.innerHTML = `
          <h4>Cloud Library Active (Supabase)</h4>
          <p>Connected as <strong>${escapeHtml(profile?.display_name || 'User')}</strong>. Your playlists and saved tracks sync across all devices.</p>
        `;
        if (syncBtn) syncBtn.style.display = 'none';
        if (importBtn) importBtn.style.display = 'inline-flex';
      } else {
        statusTextEl.innerHTML = `
          <h4>Local Browser Storage Active</h4>
          <p>Your library is saved on this device. Sign in to sync your playlists and saved songs across devices.</p>
        `;
        if (syncBtn) syncBtn.style.display = 'inline-flex';
        if (importBtn) importBtn.style.display = 'none';
      }
    }
  }

  function initActionListeners() {
    // Create Playlist button
    const createBtn = document.getElementById('btn-create-playlist');
    if (createBtn) {
      createBtn.addEventListener('click', openCreatePlaylistPrompt);
    }

    // Clear History button
    const clearHistoryBtn = document.getElementById('btn-clear-history');
    if (clearHistoryBtn) {
      clearHistoryBtn.addEventListener('click', () => {
        const history = GroicLocalLibrary.getHistory();
        if (history.length === 0) return;

        if (confirm('Are you sure you want to clear your listening history?')) {
          GroicLocalLibrary.clearHistory();
          window.GroicApp.showToast('Listening history cleared', 'info');
          renderHistory();
        }
      });
    }

    // Cloud Sync trigger
    const syncCloudBtn = document.getElementById('btn-cloud-sync-info');
    if (syncCloudBtn) {
      syncCloudBtn.addEventListener('click', () => {
        GroicAuth.openAuthModal('signin');
      });
    }

    // Import Local Library to Cloud trigger
    const importBtn = document.getElementById('btn-import-to-cloud');
    if (importBtn) {
      importBtn.addEventListener('click', async () => {
        if (!confirm('Import your local saved songs and playlists to your cloud account?')) return;
        importBtn.disabled = true;
        importBtn.textContent = 'Importing...';

        const res = await GroicSupabaseLibrary.importLocalLibraryToCloud();
        importBtn.disabled = false;
        importBtn.innerHTML = `<span>Import Local to Cloud</span>`;

        if (res.success) {
          window.GroicApp.showToast(res.message, 'success', 4000);
          renderAll();
        } else {
          window.GroicApp.showToast(res.message, 'error');
        }
      });
    }
  }

  async function renderAll() {
    await renderSavedSongs();
    await renderPlaylists();
    renderHistory();
    updateBadges();
  }

  async function updateBadges() {
    const provider = getActiveLibraryProvider();
    const saved = await provider.getSavedSongs();
    const playlists = await provider.getPlaylists();
    const history = GroicLocalLibrary.getHistory();

    const savedBadge = document.getElementById('badge-saved-count');
    const plBadge = document.getElementById('badge-playlists-count');
    const histBadge = document.getElementById('badge-history-count');

    if (savedBadge) savedBadge.textContent = saved.length;
    if (plBadge) plBadge.textContent = playlists.length;
    if (histBadge) histBadge.textContent = history.length;
  }

  // --------------------------------------------------------------------------
  // Tab 1: Saved Songs
  // --------------------------------------------------------------------------

  async function renderSavedSongs() {
    const container = document.getElementById('saved-songs-list');
    if (!container) return;

    const provider = getActiveLibraryProvider();
    const songs = await provider.getSavedSongs();
    container.innerHTML = '';

    if (songs.length === 0) {
      container.innerHTML = `
        <div class="state-box">
          <div class="state-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
          </div>
          <h3 class="state-title">No Saved Songs Yet</h3>
          <p class="state-desc">When you find tracks you love, tap the heart icon to save them to your personal collection.</p>
          <a href="./explore.html" class="btn btn-primary">Discover Music</a>
        </div>
      `;
      return;
    }

    songs.forEach((song, index) => {
      const row = document.createElement('div');
      row.className = 'song-row';

      row.innerHTML = `
        <div class="song-row-left">
          <span class="song-index">${index + 1}</span>
          <img src="${song.thumbnail || './assets/images/default-cover.svg'}" alt="" class="song-row-thumb" />
          <div class="song-row-info">
            <div class="song-row-title">${escapeHtml(song.title)}</div>
            <div class="song-row-channel">${escapeHtml(song.channel)}</div>
          </div>
        </div>
        <div class="song-row-actions">
          <button class="btn btn-primary btn-sm btn-play-song" aria-label="Play song">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            <span>Play</span>
          </button>
          <button class="btn-icon btn-add-pl" title="Add to playlist" aria-label="Add to playlist">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
          <button class="btn-icon btn-unsave" title="Remove from saved" aria-label="Remove from saved" style="color:var(--accent-magenta);">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
          </button>
        </div>
      `;

      row.querySelector('.btn-play-song').addEventListener('click', () => {
        playTrackWithQueue(song, songs, index);
      });

      row.querySelector('.btn-add-pl').addEventListener('click', () => {
        GroicPlaylists.openAddToPlaylistModal(song);
      });

      row.querySelector('.btn-unsave').addEventListener('click', async () => {
        await provider.removeSavedSong(song.id);
        window.GroicApp.showToast('Removed from saved songs', 'info');
        renderSavedSongs();
        updateBadges();
      });

      container.appendChild(row);
    });
  }

  // --------------------------------------------------------------------------
  // Tab 2: Playlists
  // --------------------------------------------------------------------------

  async function renderPlaylists() {
    const gridContainer = document.getElementById('playlists-grid');
    const detailContainer = document.getElementById('playlist-detail-view');
    if (!gridContainer || !detailContainer) return;

    if (activePlaylistViewId) {
      gridContainer.style.display = 'none';
      detailContainer.style.display = 'block';
      renderPlaylistDetail(activePlaylistViewId);
      return;
    }

    gridContainer.style.display = 'grid';
    detailContainer.style.display = 'none';
    gridContainer.innerHTML = '';

    // "Create New Playlist" card
    const createCard = document.createElement('div');
    createCard.className = 'playlist-card create-playlist-card';
    createCard.setAttribute('role', 'button');
    createCard.setAttribute('tabindex', '0');
    createCard.innerHTML = `
      <div class="create-playlist-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </div>
      <div style="font-weight:700; font-size:1.05rem; margin-bottom:4px;">New Playlist</div>
      <div style="font-size:0.82rem; color:var(--text-subtle);">Create a custom collection</div>
    `;

    createCard.addEventListener('click', openCreatePlaylistPrompt);
    gridContainer.appendChild(createCard);

    const provider = getActiveLibraryProvider();
    const playlists = await provider.getPlaylists();
    playlists.forEach(pl => {
      const card = document.createElement('div');
      card.className = 'playlist-card';

      const firstSongThumb = (pl.songs && pl.songs[0]) ? pl.songs[0].thumbnail : null;

      card.innerHTML = `
        <div class="playlist-cover-art">
          ${firstSongThumb 
            ? `<img src="${firstSongThumb}" alt="" class="playlist-cover-img" />`
            : `<svg class="cover-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M9 18V5l12-2v13"></path>
                <circle cx="6" cy="18" r="3"></circle>
                <circle cx="18" cy="16" r="3"></circle>
               </svg>`
          }
        </div>
        <div class="playlist-card-title">${escapeHtml(pl.name)}</div>
        <div class="playlist-card-meta">${pl.songs ? pl.songs.length : 0} tracks</div>
      `;

      card.addEventListener('click', () => {
        activePlaylistViewId = pl.id;
        renderPlaylists();
      });

      gridContainer.appendChild(card);
    });
  }

  async function renderPlaylistDetail(playlistId) {
    const detailContainer = document.getElementById('playlist-detail-view');
    const provider = getActiveLibraryProvider();
    const pl = await provider.getPlaylistById(playlistId);

    if (!pl) {
      activePlaylistViewId = null;
      renderPlaylists();
      return;
    }

    const firstThumb = (pl.songs && pl.songs[0]) ? pl.songs[0].thumbnail : null;

    detailContainer.innerHTML = `
      <div style="margin-bottom:1rem;">
        <button class="btn btn-ghost btn-sm" id="btn-back-to-playlists">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
          <span>Back to All Playlists</span>
        </button>
      </div>

      <div class="playlist-detail-header">
        <div class="playlist-detail-cover">
          ${firstThumb 
            ? `<img src="${firstThumb}" alt="" style="width:100%; height:100%; object-fit:cover; border-radius:inherit;" />`
            : `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.5">
                <path d="M9 18V5l12-2v13"></path>
                <circle cx="6" cy="18" r="3"></circle>
                <circle cx="18" cy="16" r="3"></circle>
               </svg>`
          }
        </div>
        <div class="playlist-detail-info">
          <div style="font-size:0.8rem; text-transform:uppercase; letter-spacing:0.1em; color:var(--accent-magenta); font-weight:700;">Playlist</div>
          <h2 class="playlist-detail-title">${escapeHtml(pl.name)}</h2>
          <p class="playlist-detail-desc">${escapeHtml(pl.description || 'Custom curated music collection')}</p>
          <div class="playlist-detail-actions">
            <button class="btn btn-primary btn-sm" id="btn-pl-play-all" ${(!pl.songs || pl.songs.length === 0) ? 'disabled' : ''}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
              <span>Play All</span>
            </button>
            <button class="btn btn-secondary btn-sm" id="btn-pl-rename">Rename</button>
            <button class="btn btn-ghost btn-sm" id="btn-pl-delete" style="color:var(--accent-coral);">Delete</button>
          </div>
        </div>
      </div>

      <div class="song-list" id="playlist-songs-list">
        <!-- Render playlist tracks -->
      </div>
    `;

    detailContainer.querySelector('#btn-back-to-playlists').addEventListener('click', () => {
      activePlaylistViewId = null;
      renderPlaylists();
    });

    const playAllBtn = detailContainer.querySelector('#btn-pl-play-all');
    if (playAllBtn && pl.songs && pl.songs.length > 0) {
      playAllBtn.addEventListener('click', () => {
        playTrackWithQueue(pl.songs[0], pl.songs, 0);
      });
    }

    detailContainer.querySelector('#btn-pl-rename').addEventListener('click', async () => {
      const newName = prompt('Enter new playlist name:', pl.name);
      if (newName && newName.trim()) {
        await provider.renamePlaylist(pl.id, newName.trim());
        window.GroicApp.showToast('Playlist renamed', 'success');
        renderPlaylistDetail(pl.id);
      }
    });

    detailContainer.querySelector('#btn-pl-delete').addEventListener('click', async () => {
      if (confirm(`Delete playlist "${pl.name}"? This cannot be undone.`)) {
        await provider.deletePlaylist(pl.id);
        window.GroicApp.showToast('Playlist deleted', 'info');
        activePlaylistViewId = null;
        renderPlaylists();
        updateBadges();
      }
    });

    const songsContainer = detailContainer.querySelector('#playlist-songs-list');
    if (!pl.songs || pl.songs.length === 0) {
      songsContainer.innerHTML = `
        <div class="state-box" style="padding:2rem 0;">
          <h4 style="margin-bottom:0.5rem;">This Playlist is Empty</h4>
          <p class="state-desc">Explore tracks and add them using the "+" icon on any song.</p>
          <a href="./explore.html" class="btn btn-secondary btn-sm">Find Music to Add</a>
        </div>
      `;
      return;
    }

    pl.songs.forEach((song, idx) => {
      const row = document.createElement('div');
      row.className = 'song-row';

      row.innerHTML = `
        <div class="song-row-left">
          <span class="song-index">${idx + 1}</span>
          <img src="${song.thumbnail || './assets/images/default-cover.svg'}" alt="" class="song-row-thumb" />
          <div class="song-row-info">
            <div class="song-row-title">${escapeHtml(song.title)}</div>
            <div class="song-row-channel">${escapeHtml(song.channel)}</div>
          </div>
        </div>
        <div class="song-row-actions">
          <button class="btn btn-primary btn-sm btn-play-song">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            <span>Play</span>
          </button>
          <button class="btn-icon btn-remove-from-pl" title="Remove from playlist" aria-label="Remove from playlist">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      `;

      row.querySelector('.btn-play-song').addEventListener('click', () => {
        playTrackWithQueue(song, pl.songs, idx);
      });

      row.querySelector('.btn-remove-from-pl').addEventListener('click', async () => {
        await provider.removeSongFromPlaylist(pl.id, song.id);
        window.GroicApp.showToast('Song removed from playlist', 'info');
        renderPlaylistDetail(pl.id);
      });

      songsContainer.appendChild(row);
    });
  }

  // --------------------------------------------------------------------------
  // Tab 3: History
  // --------------------------------------------------------------------------

  function renderHistory() {
    const container = document.getElementById('history-songs-list');
    if (!container) return;

    const history = GroicLocalLibrary.getHistory();
    container.innerHTML = '';

    if (history.length === 0) {
      container.innerHTML = `
        <div class="state-box">
          <div class="state-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          </div>
          <h3 class="state-title">No Recent Playback</h3>
          <p class="state-desc">Your recently played tracks will appear here as you listen.</p>
          <a href="./explore.html" class="btn btn-primary">Start Listening</a>
        </div>
      `;
      return;
    }

    history.forEach((song, idx) => {
      const row = document.createElement('div');
      row.className = 'song-row';

      const isSaved = GroicLocalLibrary.isSongSaved(song.id);

      row.innerHTML = `
        <div class="song-row-left">
          <span class="song-index">${idx + 1}</span>
          <img src="${song.thumbnail || './assets/images/default-cover.svg'}" alt="" class="song-row-thumb" />
          <div class="song-row-info">
            <div class="song-row-title">${escapeHtml(song.title)}</div>
            <div class="song-row-channel">${escapeHtml(song.channel)}</div>
          </div>
        </div>
        <div class="song-row-actions">
          <button class="btn btn-primary btn-sm btn-play-song">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            <span>Play</span>
          </button>
          <button class="btn-icon btn-save-hist" title="Save song" style="${isSaved ? 'color:var(--accent-magenta);' : ''}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="${isSaved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
          </button>
        </div>
      `;

      row.querySelector('.btn-play-song').addEventListener('click', () => {
        playTrackWithQueue(song, history, idx);
      });

      row.querySelector('.btn-save-hist').addEventListener('click', () => {
        if (isSaved) {
          GroicLocalLibrary.removeSavedSong(song.id);
          window.GroicApp.showToast('Removed from saved', 'info');
        } else {
          GroicLocalLibrary.saveSong(song);
          window.GroicApp.showToast('Saved to library', 'success');
        }
        renderHistory();
        renderSavedSongs();
        updateBadges();
      });

      container.appendChild(row);
    });
  }

  function playTrackWithQueue(track, list, index) {
    GroicMusicService.setQueue(list, index);
    const targetUrl = `./player.html?v=${track.id}&title=${encodeURIComponent(track.title)}&channel=${encodeURIComponent(track.channel)}&thumb=${encodeURIComponent(track.thumbnail)}`;
    window.location.href = targetUrl;
  }

  async function openCreatePlaylistPrompt() {
    const name = prompt('Enter a name for your new playlist:');
    if (name && name.trim()) {
      const provider = getActiveLibraryProvider();
      const res = await provider.createPlaylist(name.trim());
      if (res.success) {
        window.GroicApp.showToast(res.message, 'success');
        renderPlaylists();
        updateBadges();
      } else {
        window.GroicApp.showToast(res.message, 'error');
      }
    }
  }

  function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, function (m) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
    });
  }

  return {
    init
  };
})();
