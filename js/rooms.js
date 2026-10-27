/**
 * GROIC - Rooms Discovery Page Controller
 * 
 * Manages:
 * - Public rooms browsing & searching
 * - 🔥 Trending rooms ranking
 * - Create Room modal workflow
 * - Private room invitation code validation & joining
 */

window.GroicRooms = (function () {
  let activeSearch = '';
  let activeMood = 'all';

  function init() {
    initCreateRoomModal();
    initJoinCodeForm();
    initFilters();
    loadRooms();

    // Re-load rooms when auth state changes
    window.addEventListener('groic:auth-change', () => {
      loadRooms();
    });
  }

  function initFilters() {
    const chips = document.querySelectorAll('.room-filter-chip');
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        chips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        activeMood = chip.dataset.mood || 'all';
        loadRooms();
      });
    });

    const searchInput = document.getElementById('rooms-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        activeSearch = e.target.value.trim();
        loadRooms();
      });
    }
  }

  function initJoinCodeForm() {
    const form = document.getElementById('join-code-form');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('join-code-input');
        const rawVal = input ? input.value.trim() : '';

        if (!rawVal) {
          window.GroicApp.showToast('Please enter an invitation code or room link', 'error');
          return;
        }

        // Parse either raw code (e.g. "8K3M9XPQ") or URL (e.g. ".../room.html?id=...&invite=8K3M9XPQ")
        let roomId = '';
        let inviteCode = rawVal;

        if (rawVal.includes('id=')) {
          try {
            const url = new URL(rawVal, window.location.origin);
            roomId = url.searchParams.get('id') || '';
            inviteCode = url.searchParams.get('invite') || '';
          } catch (e) {}
        }

        if (roomId) {
          window.location.href = `./room.html?id=${roomId}&invite=${encodeURIComponent(inviteCode)}`;
        } else {
          // If only code is entered, navigate with invite query
          window.location.href = `./room.html?invite=${encodeURIComponent(inviteCode)}`;
        }
      });
    }
  }

  async function loadRooms() {
    renderTrendingRooms();
    renderPublicRooms();
  }

  async function renderTrendingRooms() {
    const container = document.getElementById('trending-rooms-container');
    if (!container) return;

    try {
      const trending = await GroicRoomService.getTrendingRooms(4);
      container.innerHTML = '';

      if (trending.length === 0) {
        container.innerHTML = `
          <div style="grid-column:1 / -1; text-align:center; padding:2rem; color:var(--text-muted); font-size:0.9rem;">
            No trending rooms right now. Be the first to create one!
          </div>
        `;
        return;
      }

      trending.forEach(room => {
        const card = document.createElement('div');
        card.className = 'trending-room-card';

        const percent = Math.min(100, Math.round(((room.participant_count || 1) / (room.max_capacity || 6)) * 100));

        card.innerHTML = `
          <div class="trending-badge">
            <span style="font-size:1rem;">🔥</span>
            <span>Trending</span>
          </div>

          <div style="display:flex; gap:var(--space-md); align-items:center; margin-bottom:var(--space-md);">
            <img src="${room.current_thumbnail || './assets/images/default-cover.svg'}" alt="" style="width:72px; height:72px; border-radius:var(--radius-md); object-fit:cover; flex-shrink:0; border:1px solid var(--border-subtle);" />
            <div style="flex:1; min-width:0;">
              <h3 style="font-size:1.15rem; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:4px;">
                ${escapeHtml(room.name)}
              </h3>
              <div style="font-size:0.82rem; color:var(--text-muted); margin-bottom:4px;">
                Hosted by <strong style="color:var(--text-main);">${escapeHtml(room.host_name || 'Host')}</strong>
              </div>
              <div style="font-size:0.78rem; color:var(--accent-cyan); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                🎵 ${escapeHtml(room.current_title || 'Music Stream')}
              </div>
            </div>
          </div>

          <div style="margin-bottom:var(--space-md);">
            <div style="display:flex; justify-content:space-between; font-size:0.78rem; color:var(--text-muted); margin-bottom:4px;">
              <span>Occupancy</span>
              <span><strong>${room.participant_count || 1}</strong> / ${room.max_capacity} listeners</span>
            </div>
            <div style="width:100%; height:6px; background:rgba(255,255,255,0.08); border-radius:var(--radius-full); overflow:hidden;">
              <div style="width:${percent}%; height:100%; background:var(--grad-coral-pink); border-radius:inherit;"></div>
            </div>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span class="brand-tag" style="text-transform:capitalize;">${escapeHtml(room.theme || 'Social')}</span>
            <button class="btn btn-primary btn-sm btn-join-room" data-room-id="${room.id}">
              Join Room &rarr;
            </button>
          </div>
        `;

        card.querySelector('.btn-join-room').addEventListener('click', () => {
          attemptJoinRoom(room);
        });

        container.appendChild(card);
      });
    } catch (e) {
      console.warn('renderTrendingRooms error', e);
    }
  }

  async function renderPublicRooms() {
    const container = document.getElementById('public-rooms-grid');
    const emptyState = document.getElementById('public-rooms-empty');
    if (!container) return;

    try {
      const rooms = await GroicRoomService.getPublicRooms(activeSearch, activeMood);
      container.innerHTML = '';

      if (rooms.length === 0) {
        if (emptyState) emptyState.style.display = 'block';
        return;
      }

      if (emptyState) emptyState.style.display = 'none';

      rooms.forEach(room => {
        const card = document.createElement('div');
        card.className = 'room-card';

        const isFull = (room.participant_count || 1) >= (room.max_capacity || 6);

        card.innerHTML = `
          <div class="room-card-head">
            <div style="flex:1; min-width:0;">
              <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
                <span class="room-privacy-tag ${room.privacy}">${room.privacy}</span>
                ${room.isDemo ? `<span class="room-demo-tag">Sample Room</span>` : ''}
              </div>
              <h3 class="room-card-title">${escapeHtml(room.name)}</h3>
            </div>
            <div class="room-capacity-badge ${isFull ? 'full' : ''}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
              <span>${room.participant_count || 1}/${room.max_capacity}</span>
            </div>
          </div>

          <p class="room-card-desc">
            ${escapeHtml(room.description || 'Join in to listen and explore tracks together with others.')}
          </p>

          <div class="room-playing-bar">
            <img src="${room.current_thumbnail || './assets/images/default-cover.svg'}" alt="" class="room-playing-thumb" />
            <div style="flex:1; min-width:0;">
              <div class="room-playing-title">${escapeHtml(room.current_title || 'Groic Stream')}</div>
              <div style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(room.current_channel || 'YouTube Audio')}</div>
            </div>
          </div>

          <div class="room-card-footer">
            <div style="font-size:0.8rem; color:var(--text-subtle);">
              Host: <strong style="color:var(--text-main);">${escapeHtml(room.host_name || 'Host')}</strong>
            </div>

            <button class="btn btn-primary btn-sm btn-join-room" ${isFull ? 'disabled' : ''}>
              ${isFull ? 'Room Full' : 'Join Room'}
            </button>
          </div>
        `;

        const joinBtn = card.querySelector('.btn-join-room');
        if (joinBtn && !isFull) {
          joinBtn.addEventListener('click', () => {
            attemptJoinRoom(room);
          });
        }

        container.appendChild(card);
      });
    } catch (e) {
      console.warn('renderPublicRooms error', e);
    }
  }

  function attemptJoinRoom(room) {
    if (!GroicAuth.isAuthenticated() && !room.isDemo) {
      window.GroicApp.showToast('Please sign in to join this listening room', 'info');
      GroicAuth.openAuthModal('signin');
      return;
    }

    window.location.href = `./room.html?id=${room.id}`;
  }

  /**
   * Create Room Modal
   */
  function initCreateRoomModal() {
    let modal = document.getElementById('create-room-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'create-room-modal';
      modal.className = 'modal-overlay';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');

      modal.innerHTML = `
        <div class="modal-container" style="max-width:560px;">
          <div class="modal-header">
            <div>
              <h3 class="modal-title">Create a Social Room</h3>
              <p class="form-help">Listen to music together in real time with friends or the community</p>
            </div>
            <button class="btn-icon" id="btn-close-create-room" aria-label="Close modal">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          <div class="modal-body">
            <form id="create-room-form">
              <div class="form-group">
                <label class="form-label" for="cr-name">Room Name *</label>
                <input type="text" id="cr-name" class="form-input" placeholder="e.g. Midnight Beats & Code 🎧" required maxlength="60" />
              </div>

              <div class="form-group">
                <label class="form-label" for="cr-desc">Description (Optional)</label>
                <textarea id="cr-desc" class="form-input" rows="2" placeholder="What kind of vibes are you streaming?..." maxlength="200"></textarea>
              </div>

              <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-md); margin-bottom:var(--space-md);">
                <div>
                  <label class="form-label" for="cr-privacy">Privacy</label>
                  <select id="cr-privacy" class="form-input" style="cursor:pointer;">
                    <option value="public">Public (Discoverable)</option>
                    <option value="private">Private (Invite Link Only)</option>
                  </select>
                </div>

                <div>
                  <label class="form-label" for="cr-capacity">Capacity Limit</label>
                  <select id="cr-capacity" class="form-input" style="cursor:pointer;">
                    <option value="2">2 People (Duo / Partner)</option>
                    <option value="4">4 People (Small Group)</option>
                    <option value="6" selected>6 People (Recommended)</option>
                    <option value="8">8 People (Party)</option>
                    <option value="10">10 People (Maximum)</option>
                  </select>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label" for="cr-theme">Room Mood / Theme</label>
                <select id="cr-theme" class="form-input" style="cursor:pointer;">
                  <option value="chill">Chill & Focus</option>
                  <option value="synthwave">Synthwave & Neon</option>
                  <option value="lofi">Lo-Fi Study</option>
                  <option value="electronic">High-Energy Electronic</option>
                  <option value="rock">Rock & Indie</option>
                  <option value="pop">Pop & Trending</option>
                </select>
              </div>

              <div style="background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:var(--space-md); margin-bottom:var(--space-md);">
                <div style="font-weight:700; font-size:0.88rem; margin-bottom:8px; color:var(--text-main);">Member Permissions</div>
                
                <label style="display:flex; align-items:center; gap:8px; font-size:0.85rem; color:var(--text-muted); margin-bottom:6px; cursor:pointer;">
                  <input type="checkbox" id="cr-perm-add" checked style="accent-color:var(--accent-magenta);" />
                  <span>Members can add songs to shared queue</span>
                </label>

                <label style="display:flex; align-items:center; gap:8px; font-size:0.85rem; color:var(--text-muted); margin-bottom:6px; cursor:pointer;">
                  <input type="checkbox" id="cr-perm-skip" style="accent-color:var(--accent-magenta);" />
                  <span>Members can skip to next track</span>
                </label>

                <label style="display:flex; align-items:center; gap:8px; font-size:0.85rem; color:var(--text-muted); cursor:pointer;">
                  <input type="checkbox" id="cr-perm-control" style="accent-color:var(--accent-magenta);" />
                  <span>Members can pause / resume playback</span>
                </label>
              </div>

              <div id="create-room-error" style="color:var(--accent-coral); font-size:0.85rem; margin-bottom:1rem; display:none;"></div>

              <div class="modal-footer" style="padding:0;">
                <button type="button" class="btn btn-secondary btn-sm" id="btn-cancel-create-room">Cancel</button>
                <button type="submit" class="btn btn-primary btn-sm" id="btn-submit-create-room">
                  Launch Room
                </button>
              </div>
            </form>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      const closeBtn = modal.querySelector('#btn-close-create-room');
      const cancelBtn = modal.querySelector('#btn-cancel-create-room');
      const closeModal = () => modal.classList.remove('active');

      if (closeBtn) closeBtn.addEventListener('click', closeModal);
      if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });

      const form = modal.querySelector('#create-room-form');
      if (form) {
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const errorEl = modal.querySelector('#create-room-error');
          const submitBtn = modal.querySelector('#btn-submit-create-room');

          if (!GroicAuth.isAuthenticated()) {
            if (errorEl) {
              errorEl.style.display = 'block';
              errorEl.textContent = 'Please sign in or create an account to launch a room.';
            }
            GroicAuth.openAuthModal('signin');
            return;
          }

          submitBtn.disabled = true;
          submitBtn.textContent = 'Creating room...';
          if (errorEl) errorEl.style.display = 'none';

          const name = modal.querySelector('#cr-name').value;
          const desc = modal.querySelector('#cr-desc').value;
          const privacy = modal.querySelector('#cr-privacy').value;
          const capacity = modal.querySelector('#cr-capacity').value;
          const theme = modal.querySelector('#cr-theme').value;
          const canAdd = modal.querySelector('#cr-perm-add').checked;
          const canSkip = modal.querySelector('#cr-perm-skip').checked;
          const canControl = modal.querySelector('#cr-perm-control').checked;

          const res = await GroicRoomService.createRoom({
            name,
            description: desc,
            privacy,
            maxCapacity: capacity,
            theme,
            memberCanAddSongs: canAdd,
            memberCanSkip: canSkip,
            memberCanControl: canControl
          });

          submitBtn.disabled = false;
          submitBtn.textContent = 'Launch Room';

          if (res.success && res.room) {
            window.GroicApp.showToast(`Room "${name}" created!`, 'success');
            closeModal();
            window.location.href = `./room.html?id=${res.room.id}`;
          } else {
            if (errorEl) {
              errorEl.style.display = 'block';
              errorEl.textContent = res.message || 'Failed to create room';
            }
          }
        });
      }
    }

    // Bind triggers
    document.querySelectorAll('[data-action="open-create-room"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (!GroicAuth.isAuthenticated()) {
          window.GroicApp.showToast('Please sign in to create a social room', 'info');
          GroicAuth.openAuthModal('signin');
          return;
        }
        modal.classList.add('active');
      });
    });
  }

  function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, function (m) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
    });
  }

  return {
    init,
    loadRooms
  };
})();
