/**
 * GROIC - Playlist Manager & Modal UI
 * 
 * Reusable modal for adding tracks to playlists, creating new playlists,
 * renaming, and deleting playlists across any page.
 */

window.GroicPlaylists = (function () {
  let pendingTrack = null;

  /**
   * Open the "Add Track to Playlist" modal for any given track object
   */
  function openAddToPlaylistModal(track) {
    if (!track || !track.id) return;
    pendingTrack = track;

    let modal = document.getElementById('add-to-playlist-modal');
    if (!modal) {
      modal = createAddToPlaylistModalDOM();
      document.body.appendChild(modal);
      bindModalEvents(modal);
    }

    renderPlaylistsList(modal);
    modal.classList.add('active');
  }

  function closeAddToPlaylistModal() {
    const modal = document.getElementById('add-to-playlist-modal');
    if (modal) {
      modal.classList.remove('active');
      pendingTrack = null;
    }
  }

  function createAddToPlaylistModalDOM() {
    const div = document.createElement('div');
    div.id = 'add-to-playlist-modal';
    div.className = 'modal-overlay';
    div.setAttribute('role', 'dialog');
    div.setAttribute('aria-modal', 'true');
    div.setAttribute('aria-labelledby', 'pl-modal-title');

    div.innerHTML = `
      <div class="modal-container">
        <div class="modal-header">
          <div>
            <h3 class="modal-title" id="pl-modal-title">Add to Playlist</h3>
            <p class="form-help" id="pl-modal-track-name">Select an existing playlist or create a new one</p>
          </div>
          <button class="btn-icon" id="pl-modal-close" aria-label="Close modal">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <div id="pl-existing-list" style="display:flex; flex-direction:column; gap:8px; max-height:220px; overflow-y:auto; margin-bottom:1.25rem;">
            <!-- Rendered dynamically -->
          </div>

          <div style="border-top:1px solid var(--border-subtle); padding-top:1rem;">
            <label class="form-label" for="pl-new-name">Create New Playlist</label>
            <div style="display:flex; gap:8px;">
              <input type="text" id="pl-new-name" class="form-input" placeholder="e.g. Midnight Drive" />
              <button type="button" class="btn btn-secondary btn-sm" id="pl-btn-create-add" style="flex-shrink:0;">
                Create & Add
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    return div;
  }

  function renderPlaylistsList(modal) {
    const listContainer = modal.querySelector('#pl-existing-list');
    const trackSubtitle = modal.querySelector('#pl-modal-track-name');
    if (!listContainer) return;

    if (trackSubtitle && pendingTrack) {
      trackSubtitle.textContent = `Adding: "${pendingTrack.title}"`;
    }

    const playlists = GroicLocalLibrary.getPlaylists();
    listContainer.innerHTML = '';

    if (playlists.length === 0) {
      listContainer.innerHTML = `
        <div style="text-align:center; padding:1.5rem; color:var(--text-muted); font-size:0.88rem;">
          You don't have any playlists yet. Create your first one below!
        </div>
      `;
      return;
    }

    playlists.forEach(pl => {
      const isAlreadyIn = (pl.songs || []).some(s => s.id === pendingTrack.id);
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'btn-ghost';
      row.style.cssText = `
        display:flex; align-items:center; justify-content:space-between;
        width:100%; padding:0.6rem 0.85rem; border-radius:var(--radius-md);
        background:var(--bg-card); border:1px solid var(--border-subtle);
        text-align:left; cursor:${isAlreadyIn ? 'default' : 'pointer'};
      `;

      row.innerHTML = `
        <div style="min-width:0; flex:1;">
          <div style="font-weight:600; color:var(--text-main); font-size:0.92rem; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">
            ${escapeHtml(pl.name)}
          </div>
          <div style="font-size:0.75rem; color:var(--text-subtle);">
            ${pl.songs ? pl.songs.length : 0} tracks
          </div>
        </div>
        <div>
          ${isAlreadyIn 
            ? `<span style="font-size:0.75rem; color:var(--accent-lime); font-weight:600;">✓ Added</span>`
            : `<span class="btn btn-primary btn-sm" style="padding:4px 10px; font-size:0.75rem;">+ Add</span>`
          }
        </div>
      `;

      if (!isAlreadyIn) {
        row.addEventListener('click', () => {
          const res = GroicLocalLibrary.addSongToPlaylist(pl.id, pendingTrack);
          if (res.success) {
            window.GroicApp.showToast(res.message, 'success');
            closeAddToPlaylistModal();
          } else {
            window.GroicApp.showToast(res.message, 'error');
          }
        });
      }

      listContainer.appendChild(row);
    });
  }

  function bindModalEvents(modal) {
    const closeBtn = modal.querySelector('#pl-modal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeAddToPlaylistModal);
    }

    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeAddToPlaylistModal();
    });

    const createBtn = modal.querySelector('#pl-btn-create-add');
    const input = modal.querySelector('#pl-new-name');

    if (createBtn && input) {
      createBtn.addEventListener('click', () => {
        const name = input.value.trim();
        if (!name) {
          window.GroicApp.showToast('Please enter a playlist name', 'error');
          return;
        }

        const createRes = GroicLocalLibrary.createPlaylist(name);
        if (createRes.success) {
          if (pendingTrack) {
            GroicLocalLibrary.addSongToPlaylist(createRes.playlist.id, pendingTrack);
            window.GroicApp.showToast(`Created "${name}" & added track`, 'success');
          } else {
            window.GroicApp.showToast(`Created playlist "${name}"`, 'success');
          }
          input.value = '';
          closeAddToPlaylistModal();
        } else {
          window.GroicApp.showToast(createRes.message, 'error');
        }
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          createBtn.click();
        }
      });
    }
  }

  function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, function (m) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
    });
  }

  return {
    openAddToPlaylistModal,
    closeAddToPlaylistModal
  };
})();
