/**
 * GROIC - Social Room Controller (room.html)
 * 
 * Orchestrates:
 * - Room initialization and membership authorization
 * - YouTube IFrame player integration & Realtime synchronization (GroicRoomSync)
 * - Error 153 mitigation (HTTP origin enforcement, safe playerVars, video ID validation)
 * - In-player error fallback overlay with "Open on YouTube" button
 * - Live participant presence (GroicRoomPresence)
 * - Separated Now Playing vs Upcoming Queue management (reorder, play next, remove)
 * - Add Music modal with YouTube search, debounce, and duplicate prevention
 * - Real-time queue synchronization across all room members (Supabase + local cross-tab)
 */

window.GroicRoom = (function () {
  let roomId = null;
  let inviteCode = null;
  let currentRoom = null;
  let isHost = false;
  let ytPlayer = null;
  let queueItems = [];
  let queueChannel = null;
  let localSyncChannel = null;
  let isSearchInProgress = false;

  async function init() {
    const params = new URLSearchParams(window.location.search);
    roomId = params.get('id');
    inviteCode = params.get('invite');

    if (!roomId && inviteCode) {
      const room = await GroicRoomService.getRoomByInviteCode(inviteCode);
      if (room && room.id) {
        roomId = room.id;
      }
    }

    if (!roomId) {
      showErrorState('No room ID specified. Please select a room from the Rooms Discovery page.');
      return;
    }

    // Check protocol and display local file warning banner if opened via file:///
    checkLocalProtocolAdvisory();

    // Check Supabase authentication
    if (window.GroicAuth) {
      await GroicAuth.init();
    }

    // Join room / check access
    const joinResult = await GroicRoomService.joinRoom(roomId, inviteCode);
    if (!joinResult.success) {
      showErrorState(joinResult.message || 'Unable to join room.');
      return;
    }

    currentRoom = joinResult.room || (await GroicRoomService.getRoomById(roomId));
    if (!currentRoom) {
      showErrorState('Room details could not be retrieved.');
      return;
    }

    const currentUser = GroicAuth.getCurrentUser();
    isHost = (currentRoom.host_id === currentUser?.id) || Boolean(joinResult.is_host);

    renderRoomHeader();
    renderPermissionsUI();
    initActionListeners();
    initAddMusicModal();
    initQueueRealtime();
    loadRoomQueue();

    // Load YouTube Player with Error 153 hardening
    loadYouTubePlayer();

    // Start Live Participant Presence
    GroicRoomPresence.init(roomId, renderParticipants);

    // Track in browser window title
    document.title = `${currentRoom.name} — GROIC Room`;
  }

  /**
   * Detect direct file:/// execution and notify user of YouTube embed origin requirements
   */
  function checkLocalProtocolAdvisory() {
    const banner = document.getElementById('local-file-warning-banner');
    const dismissBtn = document.getElementById('btn-dismiss-file-warning');

    if (window.location.protocol === 'file:' && banner) {
      banner.style.display = 'flex';
      if (dismissBtn) {
        dismissBtn.addEventListener('click', () => {
          banner.style.display = 'none';
        });
      }
    }
  }

  function renderRoomHeader() {
    const titleEl = document.getElementById('room-title-text');
    const descEl = document.getElementById('room-desc-text');
    const privacyBadge = document.getElementById('room-privacy-badge');
    const hostNameEl = document.getElementById('room-host-name');
    const capacityEl = document.getElementById('room-capacity-counter');

    if (titleEl) titleEl.textContent = currentRoom.name;
    if (descEl) descEl.textContent = currentRoom.description || 'Live social music room';
    if (privacyBadge) {
      privacyBadge.textContent = currentRoom.privacy;
      privacyBadge.className = `room-privacy-tag ${currentRoom.privacy}`;
    }
    if (hostNameEl) hostNameEl.textContent = currentRoom.host_name || (isHost ? 'You (Host)' : 'Host');
    if (capacityEl) capacityEl.textContent = `Max ${currentRoom.max_capacity}`;

    // If private room, show invite button prominently
    const inviteBtn = document.getElementById('btn-room-invite');
    if (inviteBtn) {
      inviteBtn.style.display = (currentRoom.privacy === 'private' || currentRoom.settings?.member_can_invite !== false) 
        ? 'inline-flex' 
        : 'none';
    }
  }

  function renderPermissionsUI() {
    const currentUser = GroicAuth.getCurrentUser();
    const canControl = GroicRoomPermissions.canControlPlayback(currentRoom, currentUser);
    const canSkip = GroicRoomPermissions.canSkipTracks(currentRoom, currentUser);
    const canAdd = GroicRoomPermissions.canAddSongs(currentRoom, currentUser);

    const skipBtn = document.getElementById('btn-room-next');
    const playPauseBtn = document.getElementById('btn-room-playpause');
    const addSongBtn = document.getElementById('btn-open-add-song');
    const endRoomBtn = document.getElementById('btn-end-room');

    if (playPauseBtn) playPauseBtn.style.display = canControl ? 'inline-flex' : 'none';
    if (skipBtn) skipBtn.style.display = canSkip ? 'inline-flex' : 'none';
    if (addSongBtn) addSongBtn.style.display = canAdd ? 'inline-flex' : 'none';
    if (endRoomBtn) endRoomBtn.style.display = isHost ? 'inline-flex' : 'none';
  }

  // --------------------------------------------------------------------------
  // YouTube IFrame Player & Error 153 Hardening
  // --------------------------------------------------------------------------

  function loadYouTubePlayer() {
    // If API is already fully loaded
    if (window.YT && window.YT.Player) {
      initPlayerInstance();
      return;
    }

    // Check if script tag is already in DOM
    const existingScript = document.querySelector('script[src*="youtube.com/iframe_api"]');
    if (existingScript) {
      // Poll until YT is ready
      const pollTimer = setInterval(() => {
        if (window.YT && window.YT.Player) {
          clearInterval(pollTimer);
          initPlayerInstance();
        }
      }, 100);
      return;
    }

    // Inject YouTube IFrame API script tag once
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.async = true;
    const firstScript = document.getElementsByTagName('script')[0];
    if (firstScript && firstScript.parentNode) {
      firstScript.parentNode.insertBefore(tag, firstScript);
    } else {
      document.head.appendChild(tag);
    }

    window.onYouTubeIframeAPIReady = function () {
      initPlayerInstance();
    };
  }

  function initPlayerInstance() {
    // Extract & sanitize YouTube Video ID (must be valid 11-char string)
    const rawId = currentRoom.current_video_id || 'jfKfPfyJRdk';
    const videoId = GroicRoomService.sanitizeVideoId(rawId) || 'jfKfPfyJRdk';
    currentRoom.current_video_id = videoId;

    const overlay = document.getElementById('player-loading-overlay');
    hidePlayerErrorOverlay();

    // YouTube playerVars configuration:
    // Only pass origin when hosted on http: or https:.
    // When on file:///, passing window.location.origin (which is string "null") triggers Error 153.
    const isHttp = window.location.protocol.startsWith('http');
    const playerVars = {
      autoplay: 1,
      controls: 1, // Keep standard controls active so user can unmute or interact if browser blocks autoplay
      rel: 0,
      modestbranding: 1,
      playsinline: 1,
      enablejsapi: 1
    };

    if (isHttp && window.location.origin && window.location.origin !== 'null') {
      playerVars.origin = window.location.origin;
      playerVars.host = 'https://www.youtube.com';
    }

    try {
      ytPlayer = new YT.Player('yt-player-target', {
        videoId: videoId,
        playerVars: playerVars,
        events: {
          onReady: (event) => {
            if (overlay) overlay.classList.add('hidden');
            hidePlayerErrorOverlay();
            
            // Initialize Synchronization Engine
            GroicRoomSync.init({
              room: currentRoom,
              isHost: isHost,
              player: ytPlayer,
              onTrackChange: (newTrackState) => {
                renderCurrentTrackInfo(newTrackState);
                loadRoomQueue();
              },
              onStateChange: (newState) => {
                currentRoom = { ...currentRoom, ...newState };
                updatePlayPauseIcon(currentRoom.playback_state === 'playing');
              }
            });

            renderCurrentTrackInfo(currentRoom);
          },
          onStateChange: onPlayerStateChange,
          onError: onPlayerError
        }
      });
    } catch (e) {
      console.error('Room YT.Player init error:', e);
      if (overlay) overlay.classList.add('hidden');
      showPlayerErrorOverlay(153, videoId);
    }
  }

  function onPlayerStateChange(event) {
    if (isHost) {
      if (event.data === YT.PlayerState.PLAYING) {
        GroicRoomSync.broadcastHostState('playing');
        updatePlayPauseIcon(true);
      } else if (event.data === YT.PlayerState.PAUSED) {
        GroicRoomSync.broadcastHostState('paused');
        updatePlayPauseIcon(false);
      } else if (event.data === YT.PlayerState.ENDED) {
        // Host advances queue automatically when video ends
        advanceNextTrack();
      }
    }
  }

  function onPlayerError(event) {
    const errorCode = event.data;
    console.warn('Room YouTube Player Error Code:', errorCode);
    const overlay = document.getElementById('player-loading-overlay');
    if (overlay) overlay.classList.add('hidden');

    const videoId = currentRoom.current_video_id || 'jfKfPfyJRdk';
    showPlayerErrorOverlay(errorCode, videoId);
  }

  function showPlayerErrorOverlay(errorCode, videoId) {
    const errorOverlay = document.getElementById('player-error-overlay');
    const titleEl = document.getElementById('player-error-title');
    const descEl = document.getElementById('player-error-desc');
    const watchLink = document.getElementById('btn-error-watch-youtube');
    const skipBtn = document.getElementById('btn-error-skip-track');
    const retryBtn = document.getElementById('btn-error-retry');

    if (!errorOverlay) return;

    let title = 'Playback Notice';
    let desc = 'Encountered an issue loading this YouTube video.';

    if (errorCode === 153) {
      title = 'Player Configuration Notice (Error 153)';
      desc = window.location.protocol === 'file:'
        ? 'YouTube restricts embedded playback when opened directly from disk as a local file (file:///). To listen without interruption, run a local HTTP server (e.g. npx serve or python -m http.server 8000) or host on GitHub Pages.'
        : 'YouTube player configuration error (153). The video embed request was rejected by YouTube. You can watch directly on YouTube or skip to the next track.';
    } else if (errorCode === 101 || errorCode === 150) {
      title = 'Embedding Restricted by Video Owner';
      desc = 'The copyright owner of this video restricts playback inside third-party embeds. Click below to open directly on YouTube, or skip to the next track in queue.';
    } else if (errorCode === 100) {
      title = 'Video Unavailable';
      desc = 'This video has been removed, marked private, or is unavailable in your region.';
    } else if (errorCode === 2) {
      title = 'Invalid Video Identifier';
      desc = 'The video ID provided was malformed or could not be recognized by YouTube.';
    }

    if (titleEl) titleEl.textContent = title;
    if (descEl) descEl.textContent = desc;

    if (watchLink) {
      watchLink.href = `https://www.youtube.com/watch?v=${videoId}`;
      watchLink.style.display = 'inline-flex';
    }

    if (skipBtn) {
      skipBtn.onclick = () => {
        hidePlayerErrorOverlay();
        advanceNextTrack();
      };
    }

    if (retryBtn) {
      retryBtn.onclick = () => {
        hidePlayerErrorOverlay();
        if (ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
          ytPlayer.loadVideoById(videoId);
        } else {
          initPlayerInstance();
        }
      };
    }

    errorOverlay.style.display = 'flex';
  }

  function hidePlayerErrorOverlay() {
    const errorOverlay = document.getElementById('player-error-overlay');
    if (errorOverlay) errorOverlay.style.display = 'none';
  }

  async function advanceNextTrack() {
    const res = await GroicRoomService.advanceQueue(roomId, currentRoom.current_queue_id);
    if (res && res.next_track) {
      currentRoom.current_video_id = res.next_track.video_id;
      currentRoom.current_title = res.next_track.title;
      currentRoom.current_channel = res.next_track.channel;
      currentRoom.current_thumbnail = res.next_track.thumbnail;
      currentRoom.current_queue_id = res.next_track.id;
      currentRoom.playback_state = 'playing';

      hidePlayerErrorOverlay();
      GroicRoomSync.broadcastTrackChange(res.next_track);
      renderCurrentTrackInfo(currentRoom);
      loadRoomQueue();

      if (ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
        ytPlayer.loadVideoById(res.next_track.video_id);
      }
    } else {
      window.GroicApp.showToast('Room queue finished.', 'info');
    }
  }

  function renderCurrentTrackInfo(state) {
    const titleEl = document.getElementById('now-playing-title');
    const channelEl = document.getElementById('now-playing-channel');
    if (titleEl) titleEl.textContent = state.current_title || 'Music Stream';
    if (channelEl) channelEl.textContent = state.current_channel || 'YouTube Video';
  }

  function updatePlayPauseIcon(isPlaying) {
    const btn = document.getElementById('btn-room-playpause');
    if (!btn) return;

    if (isPlaying) {
      btn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
      btn.setAttribute('title', 'Pause Stream');
    } else {
      btn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
      btn.setAttribute('title', 'Play Stream');
    }
  }

  // --------------------------------------------------------------------------
  // Queue & In-Room Song Discovery (Separated Now Playing vs Upcoming)
  // --------------------------------------------------------------------------

  async function loadRoomQueue() {
    queueItems = await GroicRoomService.getQueue(roomId);
    renderQueueSeparated();
  }

  /**
   * Renders Now Playing card and Upcoming songs list separately
   */
  function renderQueueSeparated() {
    const nowPlayingContainer = document.getElementById('room-now-playing-container');
    const upcomingList = document.getElementById('room-upcoming-list');
    const upcomingEmpty = document.getElementById('room-upcoming-empty');
    const upcomingCount = document.getElementById('room-upcoming-count');
    const totalCountBadge = document.getElementById('room-queue-count');

    if (!upcomingList) return;

    const currentUser = GroicAuth.getCurrentUser();
    const canControl = GroicRoomPermissions.canControlPlayback(currentRoom, currentUser);

    // Identify currently playing song vs upcoming songs
    let playingItem = queueItems.find(item => item.status === 'playing') || null;
    if (!playingItem && currentRoom.current_video_id) {
      playingItem = queueItems.find(item => item.video_id === currentRoom.current_video_id) || {
        video_id: currentRoom.current_video_id,
        title: currentRoom.current_title || 'Current Song',
        channel: currentRoom.current_channel || 'YouTube Audio',
        thumbnail: currentRoom.current_thumbnail || `https://i.ytimg.com/vi/${currentRoom.current_video_id}/hqdefault.jpg`,
        added_by_name: 'Room Stream',
        status: 'playing'
      };
    }

    const upcomingItems = queueItems.filter(item => {
      if (item.status !== 'queued') return false;
      if (playingItem && item.id && item.id === playingItem.id) return false;
      return true;
    });

    // Update count badges
    if (upcomingCount) upcomingCount.textContent = upcomingItems.length;
    if (totalCountBadge) totalCountBadge.textContent = upcomingItems.length + (playingItem ? 1 : 0);

    // 1. Render Now Playing Card
    if (nowPlayingContainer) {
      if (playingItem) {
        nowPlayingContainer.innerHTML = `
          <div class="room-now-playing-box">
            <div class="room-now-playing-tag">
              <div style="display:flex; align-items:center; gap:6px; font-size:0.72rem; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:var(--accent-magenta);">
                <div class="equalizer-mini"><span></span><span></span><span></span></div>
                <span>Now Playing</span>
              </div>
              <span style="font-size:0.72rem; color:var(--text-subtle);">Active Stream</span>
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
              <img src="${playingItem.thumbnail || './assets/images/default-cover.svg'}" alt="" class="now-playing-thumb" />
              <div style="flex:1; min-width:0;">
                <div style="font-weight:700; font-size:0.88rem; color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(playingItem.title)}">
                  ${escapeHtml(playingItem.title)}
                </div>
                <div style="font-size:0.75rem; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                  ${escapeHtml(playingItem.channel || 'YouTube')} &bull; Added by ${escapeHtml(playingItem.added_by_name || 'Listener')}
                </div>
              </div>
            </div>
          </div>
        `;
      } else {
        nowPlayingContainer.innerHTML = '';
      }
    }

    // 2. Render Upcoming Queue
    upcomingList.innerHTML = '';

    if (upcomingItems.length === 0) {
      if (upcomingEmpty) upcomingEmpty.style.display = 'block';
      return;
    }

    if (upcomingEmpty) upcomingEmpty.style.display = 'none';

    upcomingItems.forEach((item, index) => {
      const isFirst = index === 0;
      const isLast = index === upcomingItems.length - 1;
      const canRemove = GroicRoomPermissions.canRemoveSong(currentRoom, currentUser, item);
      const canReorder = GroicRoomPermissions.canReorderQueue(currentRoom, currentUser);

      const li = document.createElement('li');
      li.className = 'upcoming-item';
      li.setAttribute('data-id', item.id);

      li.innerHTML = `
        <span class="upcoming-index">${index + 1}</span>
        <img src="${item.thumbnail || './assets/images/default-cover.svg'}" alt="" class="upcoming-thumb" />
        <div class="upcoming-info">
          <div class="upcoming-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
          <div class="upcoming-meta">
            <span>${escapeHtml(item.channel || 'YouTube')}</span>
            <span>&bull;</span>
            <span style="color:var(--accent-purple); font-weight:600;">Added by ${escapeHtml(item.added_by_name || 'Listener')}</span>
          </div>
        </div>
        <div class="upcoming-actions">
          ${canReorder ? `
            <button class="btn-queue-action btn-move-up" title="Move Up in queue" ${isFirst ? 'disabled' : ''} aria-label="Move Up">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"></polyline></svg>
            </button>
            <button class="btn-queue-action btn-move-down" title="Move Down in queue" ${isLast ? 'disabled' : ''} aria-label="Move Down">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </button>
            ${!isFirst ? `
              <button class="btn-queue-action action-playnext btn-play-next" title="Play Next after current song" aria-label="Play Next">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg>
              </button>
            ` : ''}
          ` : ''}

          ${canRemove ? `
            <button class="btn-queue-action action-remove btn-remove-item" title="Remove song from queue" aria-label="Remove">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          ` : ''}
        </div>
      `;

      // Wire action listeners
      const upBtn = li.querySelector('.btn-move-up');
      if (upBtn) {
        upBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await GroicRoomService.reorderQueue(roomId, item.id, 'up');
          loadRoomQueue();
        });
      }

      const downBtn = li.querySelector('.btn-move-down');
      if (downBtn) {
        downBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await GroicRoomService.reorderQueue(roomId, item.id, 'down');
          loadRoomQueue();
        });
      }

      const playNextBtn = li.querySelector('.btn-play-next');
      if (playNextBtn) {
        playNextBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const res = await GroicRoomService.playNextInQueue(roomId, item.id);
          window.GroicApp.showToast(res.message || `Set "${item.title}" to play next`, 'info');
          loadRoomQueue();
        });
      }

      const removeBtn = li.querySelector('.btn-remove-item');
      if (removeBtn) {
        removeBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          // Removing an upcoming song does NOT stop or interrupt the current track!
          await GroicRoomService.removeFromQueue(roomId, item.id);
          window.GroicApp.showToast(`Removed "${item.title}" from queue`, 'info');
          loadRoomQueue();
        });
      }

      upcomingList.appendChild(li);
    });
  }

  /**
   * Realtime queue sync (Supabase Postgres Changes + Local Cross-tab broadcast)
   */
  function initQueueRealtime() {
    // 1. Supabase Realtime Subscription
    if (window.GroicSupabase && window.GroicSupabase.isConfigured()) {
      const client = window.GroicSupabase.getClient();
      if (client) {
        queueChannel = client
          .channel(`room_queue_realtime_${roomId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'room_queue',
              filter: `room_id=eq.${roomId}`
            },
            () => {
              loadRoomQueue();
            }
          )
          .subscribe();
      }
    }

    // 2. Local Demo Cross-Tab Sync via BroadcastChannel
    try {
      if ('BroadcastChannel' in window) {
        localSyncChannel = new BroadcastChannel('groic_room_queue_channel');
        localSyncChannel.onmessage = (event) => {
          if (event && event.data && event.data.roomId === roomId) {
            loadRoomQueue();
          }
        };
      }
    } catch (e) {}

    // 3. Fallback Storage event listener for cross-tab sync
    window.addEventListener('storage', (e) => {
      if (e.key === `groic_demo_queue_${roomId}` || e.key === 'groic_last_queue_ping') {
        loadRoomQueue();
      }
    });
  }

  // --------------------------------------------------------------------------
  // Add Music Modal & YouTube Search
  // --------------------------------------------------------------------------

  function initAddMusicModal() {
    const modal = document.getElementById('add-music-modal');
    const openBtn = document.getElementById('btn-open-add-song');
    const closeBtn = document.getElementById('btn-close-add-music-modal');
    const form = document.getElementById('add-music-search-form');
    const input = document.getElementById('add-music-search-input');
    const genreChips = document.getElementById('add-music-genre-chips');

    if (!modal) return;

    function openModal() {
      modal.classList.add('active');
      if (input) {
        setTimeout(() => input.focus(), 150);
      }
    }

    function closeModal() {
      modal.classList.remove('active');
    }

    if (openBtn) openBtn.addEventListener('click', openModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('active')) {
        closeModal();
      }
    });

    // Wire genre quick-filter chips
    if (genreChips) {
      genreChips.querySelectorAll('.genre-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          const q = chip.getAttribute('data-query');
          if (input && q) {
            input.value = q;
            executeSearch(q);
          }
        });
      });
    }

    // Wire search form
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const q = (input ? input.value : '').trim();
        if (q) executeSearch(q);
      });
    }
  }

  async function executeSearch(query) {
    if (isSearchInProgress) return;
    const resultsContainer = document.getElementById('add-music-search-results');
    const submitBtn = document.getElementById('btn-add-music-submit');
    if (!resultsContainer) return;

    isSearchInProgress = true;
    if (submitBtn) submitBtn.disabled = true;

    resultsContainer.innerHTML = `
      <div style="text-align:center; padding:2.5rem 1rem;">
        <div class="spinner" style="margin:0 auto 12px; width:36px; height:36px;"></div>
        <div style="font-size:0.9rem; font-weight:600; color:var(--text-muted);">
          Searching YouTube for "${escapeHtml(query)}"...
        </div>
      </div>
    `;

    try {
      const searchRes = await GroicMusicService.search(query);
      resultsContainer.innerHTML = '';

      if (!searchRes || !searchRes.items || searchRes.items.length === 0) {
        resultsContainer.innerHTML = `
          <div style="text-align:center; padding:2.5rem 1rem; color:var(--text-muted);">
            <div style="font-size:1.8rem; margin-bottom:8px;">🔍</div>
            <div style="font-weight:700; color:var(--text-main); margin-bottom:4px;">No tracks found</div>
            <div style="font-size:0.85rem;">Try another title, artist name, or select a genre chip above.</div>
          </div>
        `;
        return;
      }

      searchRes.items.forEach(track => {
        const card = document.createElement('div');
        card.className = 'search-result-card';

        card.innerHTML = `
          <img src="${track.thumbnail || './assets/images/default-cover.svg'}" alt="" class="search-result-thumb" />
          <div style="flex:1; min-width:0;">
            <div style="font-weight:600; font-size:0.88rem; color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(track.title)}">
              ${escapeHtml(track.title)}
            </div>
            <div style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(track.channel || 'YouTube')}</div>
          </div>
          <button type="button" class="btn btn-primary btn-sm btn-queue-add" style="padding:5px 12px; font-size:0.78rem; flex-shrink:0;">
            + Add to Queue
          </button>
        `;

        const addBtn = card.querySelector('.btn-queue-add');
        addBtn.addEventListener('click', async () => {
          if (addBtn.disabled) return;
          addBtn.disabled = true;
          addBtn.classList.add('btn-adding');
          addBtn.textContent = 'Adding...';

          const addRes = await GroicRoomService.addToQueue(roomId, track);

          if (addRes.success) {
            addBtn.classList.remove('btn-adding');
            addBtn.classList.add('btn-added');
            addBtn.innerHTML = `✓ Added`;
            window.GroicApp.showToast(`Queued "${track.title}"`, 'success');
            // Immediately update room queue without interrupting current playback
            loadRoomQueue();
          } else {
            addBtn.disabled = false;
            addBtn.classList.remove('btn-adding');
            addBtn.textContent = '+ Add to Queue';
            window.GroicApp.showToast(addRes.message || 'Failed to add song.', 'error');
          }
        });

        resultsContainer.appendChild(card);
      });
    } catch (err) {
      console.error('Song search error:', err);
      resultsContainer.innerHTML = `
        <div style="text-align:center; padding:2rem 1rem; color:var(--accent-coral);">
          Failed to fetch search results. Please check your internet connection or API settings.
        </div>
      `;
    } finally {
      isSearchInProgress = false;
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  // --------------------------------------------------------------------------
  // Participants Presence Rendering
  // --------------------------------------------------------------------------

  function renderParticipants(participants) {
    const container = document.getElementById('room-participants-list');
    const onlineBadge = document.getElementById('room-online-count');
    if (!container) return;

    container.innerHTML = '';
    const count = participants ? participants.length : 1;
    if (onlineBadge) onlineBadge.textContent = `${count} Online`;

    if (!participants || participants.length === 0) {
      container.innerHTML = `<div style="color:var(--text-muted); font-size:0.85rem; padding:1rem;">1 participant connected</div>`;
      return;
    }

    participants.forEach(p => {
      const isRoomHost = (p.user_id === currentRoom.host_id) || Boolean(p.isHost);
      const initials = (p.display_name || 'L').substring(0, 2).toUpperCase();

      const item = document.createElement('div');
      item.className = 'participant-item';
      item.innerHTML = `
        <div style="position:relative;">
          <div class="participant-avatar">${initials}</div>
          <div class="participant-online-dot"></div>
        </div>
        <div style="flex:1; min-width:0;">
          <div class="participant-name">
            ${escapeHtml(p.display_name)} ${p.isSelf ? '<span style="color:var(--text-subtle); font-size:0.75rem;">(You)</span>' : ''}
          </div>
          <div style="font-size:0.75rem; color:var(--text-muted);">
            ${isRoomHost ? '<span style="color:var(--accent-coral); font-weight:700;">👑 Host</span>' : 'Listener'}
          </div>
        </div>
      `;

      container.appendChild(item);
    });
  }

  // --------------------------------------------------------------------------
  // Action Listeners & Invite Modal
  // --------------------------------------------------------------------------

  function initActionListeners() {
    // Play/Pause button
    const playPauseBtn = document.getElementById('btn-room-playpause');
    if (playPauseBtn) {
      playPauseBtn.addEventListener('click', () => {
        if (!ytPlayer || !ytPlayer.getPlayerState) return;
        const state = ytPlayer.getPlayerState();
        if (state === YT.PlayerState.PLAYING) {
          ytPlayer.pauseVideo();
        } else {
          ytPlayer.playVideo();
        }
      });
    }

    // Skip button
    const skipBtn = document.getElementById('btn-room-next');
    if (skipBtn) {
      skipBtn.addEventListener('click', () => {
        advanceNextTrack();
      });
    }

    // Leave Room button
    const leaveBtn = document.getElementById('btn-leave-room');
    if (leaveBtn) {
      leaveBtn.addEventListener('click', async () => {
        if (confirm('Leave this social listening room?')) {
          cleanup();
          await GroicRoomService.leaveRoom(roomId);
          window.location.href = './rooms.html';
        }
      });
    }

    // End Room button (Host only)
    const endBtn = document.getElementById('btn-end-room');
    if (endBtn) {
      endBtn.addEventListener('click', async () => {
        if (confirm('Are you sure you want to end this room for all participants?')) {
          await GroicRoomService.endRoom(roomId);
          window.GroicApp.showToast('Room has been closed.', 'info');
          cleanup();
          window.location.href = './rooms.html';
        }
      });
    }

    // Invite Modal Trigger
    const inviteBtn = document.getElementById('btn-room-invite');
    if (inviteBtn) {
      inviteBtn.addEventListener('click', openInviteModal);
    }

    // Sync button (Forces immediate drift check)
    const syncBtn = document.getElementById('btn-force-sync');
    if (syncBtn) {
      syncBtn.addEventListener('click', () => {
        GroicRoomSync.applyAuthoritativeState(currentRoom);
        window.GroicApp.showToast('Synchronized with room stream', 'success', 2000);
      });
    }
  }

  function openInviteModal() {
    let modal = document.getElementById('room-invite-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'room-invite-modal';
      modal.className = 'modal-overlay';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');

      const fullUrl = `${window.location.origin}${window.location.pathname}?id=${currentRoom.id}${currentRoom.invite_code ? `&invite=${currentRoom.invite_code}` : ''}`;

      modal.innerHTML = `
        <div class="modal-container" style="max-width:480px;">
          <div class="modal-header">
            <div>
              <h3 class="modal-title">Invite to "${escapeHtml(currentRoom.name)}"</h3>
              <p class="form-help">Share this room with friends, family, or partners</p>
            </div>
            <button class="btn-icon" id="btn-close-invite-modal" aria-label="Close modal">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          <div class="modal-body">
            ${currentRoom.invite_code ? `
              <div style="background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:var(--radius-lg); padding:var(--space-md); text-align:center; margin-bottom:var(--space-md);">
                <div style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.1em; color:var(--text-muted); margin-bottom:4px;">
                  Secret Room Code
                </div>
                <div style="font-size:1.85rem; font-weight:800; letter-spacing:0.15em; color:var(--accent-magenta); font-family:monospace;" id="invite-code-display">
                  ${currentRoom.invite_code}
                </div>
                <button class="btn btn-secondary btn-sm" id="btn-copy-code" style="margin-top:8px;">
                  Copy 8-Digit Code
                </button>
              </div>
            ` : ''}

            <div class="form-group">
              <label class="form-label">Direct Room Link</label>
              <div style="display:flex; gap:8px;">
                <input type="text" class="form-input" id="invite-url-input" value="${fullUrl}" readonly />
                <button class="btn btn-primary btn-sm" id="btn-copy-link" style="flex-shrink:0;">
                  Copy Link
                </button>
              </div>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      const closeBtn = modal.querySelector('#btn-close-invite-modal');
      closeBtn.addEventListener('click', () => modal.classList.remove('active'));
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
      });

      const copyLinkBtn = modal.querySelector('#btn-copy-link');
      copyLinkBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(fullUrl).then(() => {
          window.GroicApp.showToast('Room link copied to clipboard!', 'success');
        });
      });

      const copyCodeBtn = modal.querySelector('#btn-copy-code');
      if (copyCodeBtn && currentRoom.invite_code) {
        copyCodeBtn.addEventListener('click', () => {
          navigator.clipboard.writeText(currentRoom.invite_code).then(() => {
            window.GroicApp.showToast('Invitation code copied!', 'success');
          });
        });
      }
    }

    modal.classList.add('active');
  }

  function showErrorState(message) {
    const stage = document.querySelector('.room-stage');
    if (stage) {
      stage.innerHTML = `
        <div class="state-box" style="padding:4rem 1rem;">
          <div class="state-icon" style="color:var(--accent-coral);">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
          </div>
          <h2 style="font-size:1.6rem; font-weight:800; margin-bottom:8px;">Cannot Enter Room</h2>
          <p style="color:var(--text-muted); max-width:480px; margin:0 auto 1.5rem;">${escapeHtml(message)}</p>
          <a href="./rooms.html" class="btn btn-primary">Back to Rooms Discovery</a>
        </div>
      `;
    }
  }

  function cleanup() {
    GroicRoomSync.cleanup();
    GroicRoomPresence.cleanup();

    if (queueChannel && window.GroicSupabase) {
      const client = window.GroicSupabase.getClient();
      if (client) client.removeChannel(queueChannel);
      queueChannel = null;
    }

    if (localSyncChannel) {
      try { localSyncChannel.close(); } catch (e) {}
      localSyncChannel = null;
    }
  }

  window.addEventListener('beforeunload', cleanup);

  function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, function (m) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
    });
  }

  return {
    init,
    cleanup,
    loadRoomQueue,
    advanceNextTrack
  };
})();
