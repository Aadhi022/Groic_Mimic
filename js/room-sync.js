/**
 * GROIC - Room Playback Synchronization Engine
 * 
 * Implements best-effort real-time synchronization across multiple clients:
 * - Drift calculation accounting for elapsed time since authoritative update
 * - Throttled state broadcasts to avoid feedback loops
 * - Browser autoplay blocker detection & tap-to-sync overlay
 * - Automatic queue advancement
 */

window.GroicRoomSync = (function () {
  const DRIFT_THRESHOLD_SECONDS = 2.5; // Drift tolerance before applying seek correction
  const SYNC_INTERVAL_MS = 2500;       // Periodic drift verification interval

  let activeRoom = null;
  let isHost = false;
  let ytPlayer = null;
  let realtimeChannel = null;
  let isLocalAction = false;
  let lastReceivedStateVersion = 0;
  let syncTimer = null;
  let onTrackChangeCallback = null;
  let onStateChangeCallback = null;

  function init(options) {
    activeRoom = options.room;
    isHost = Boolean(options.isHost);
    ytPlayer = options.player;
    onTrackChangeCallback = options.onTrackChange || null;
    onStateChangeCallback = options.onStateChange || null;

    lastReceivedStateVersion = activeRoom.state_version || 1;

    // Start Realtime channel listener if Supabase is configured
    if (window.GroicSupabase && window.GroicSupabase.isConfigured()) {
      subscribeToRoomRealtime();
    }

    // Start periodic drift checker for members
    if (!isHost) {
      startDriftChecker();
    }
  }

  function subscribeToRoomRealtime() {
    const client = window.GroicSupabase.getClient();
    if (!client || !activeRoom || !activeRoom.id) return;

    // Listen to changes on this specific room's row in Supabase
    realtimeChannel = client
      .channel(`room_playback_${activeRoom.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rooms',
          filter: `id=eq.${activeRoom.id}`
        },
        (payload) => {
          handleRemoteRoomUpdate(payload.new);
        }
      )
      .on('broadcast', { event: 'playback_command' }, (payload) => {
        if (payload && payload.state) {
          handleRemoteRoomUpdate(payload.state);
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Immediately apply initial synchronization
          applyAuthoritativeState(activeRoom);
        }
      });
  }

  /**
   * Handle incoming remote state from Supabase Realtime
   */
  function handleRemoteRoomUpdate(newRoomState) {
    if (!newRoomState || !ytPlayer) return;

    // Ignore if this client generated this command locally
    if (isLocalAction && newRoomState.updated_by === GroicAuth.getCurrentUser()?.id) {
      return;
    }

    // Version check: only process newer or equal states
    if (newRoomState.state_version && newRoomState.state_version < lastReceivedStateVersion) {
      return;
    }
    lastReceivedStateVersion = newRoomState.state_version || (lastReceivedStateVersion + 1);
    activeRoom = { ...activeRoom, ...newRoomState };

    applyAuthoritativeState(newRoomState);

    if (typeof onStateChangeCallback === 'function') {
      onStateChangeCallback(newRoomState);
    }
  }

  /**
   * Apply authoritative playback state to YouTube player instance
   */
  function applyAuthoritativeState(state) {
    if (!ytPlayer || !state) return;

    // 1. Calculate expected playback position
    let expectedPos = Number(state.playback_position || 0);
    if (state.playback_state === 'playing') {
      const updatedAt = new Date(state.playback_updated_at || Date.now()).getTime();
      const elapsedSeconds = Math.max(0, (Date.now() - updatedAt) / 1000);
      const rate = Number(state.playback_rate || 1.0);
      expectedPos += elapsedSeconds * rate;
    }

    // 2. Check if video changed
    const safeVideoId = window.GroicRoomService ? GroicRoomService.sanitizeVideoId(state.current_video_id) : state.current_video_id;
    const currentVideoId = getCurrentPlayerVideoId();
    const isNewVideo = safeVideoId && (currentVideoId !== safeVideoId);

    if (isNewVideo) {
      isLocalAction = true;
      if (typeof ytPlayer.loadVideoById === 'function') {
        ytPlayer.loadVideoById({
          videoId: safeVideoId,
          startSeconds: expectedPos
        });
      }
      setTimeout(() => { isLocalAction = false; }, 800);

      if (typeof onTrackChangeCallback === 'function') {
        onTrackChangeCallback(state);
      }
    } else {
      // 3. Same video: check play/pause and drift
      if (typeof ytPlayer.getPlayerState === 'function' && typeof ytPlayer.getCurrentTime === 'function') {
        const localState = ytPlayer.getPlayerState();
        const localTime = ytPlayer.getCurrentTime();
        const drift = Math.abs(localTime - expectedPos);

        // Apply drift seek if > 2.5s
        if (drift > DRIFT_THRESHOLD_SECONDS && expectedPos >= 0) {
          isLocalAction = true;
          ytPlayer.seekTo(expectedPos, true);
          setTimeout(() => { isLocalAction = false; }, 600);
        }

        // Apply play/pause state
        if (state.playback_state === 'playing' && localState !== YT.PlayerState.PLAYING) {
          attemptPlay();
        } else if (state.playback_state === 'paused' && localState === YT.PlayerState.PLAYING) {
          isLocalAction = true;
          ytPlayer.pauseVideo();
          setTimeout(() => { isLocalAction = false; }, 600);
        }
      }
    }
  }

  function attemptPlay() {
    if (!ytPlayer || typeof ytPlayer.playVideo !== 'function') return;

    isLocalAction = true;
    const playPromise = ytPlayer.playVideo();
    setTimeout(() => { isLocalAction = false; }, 600);

    // Check for browser autoplay block
    setTimeout(() => {
      if (ytPlayer && ytPlayer.getPlayerState) {
        const state = ytPlayer.getPlayerState();
        if (state !== YT.PlayerState.PLAYING && activeRoom.playback_state === 'playing') {
          showAutoplayPrompt();
        } else {
          hideAutoplayPrompt();
        }
      }
    }, 1200);
  }

  function showAutoplayPrompt() {
    let overlay = document.getElementById('room-autoplay-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'room-autoplay-overlay';
      overlay.style.cssText = `
        position:absolute; inset:0; background:rgba(8, 9, 14, 0.88);
        backdrop-filter:blur(8px); display:flex; flex-direction:column;
        align-items:center; justify-content:center; gap:14px; z-index:50;
        text-align:center; padding:1.5rem; border-radius:inherit;
      `;
      overlay.innerHTML = `
        <div style="width:56px; height:56px; border-radius:50%; background:var(--grad-primary); display:flex; align-items:center; justify-content:center; box-shadow:0 0 25px var(--accent-magenta);">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="#fff"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        </div>
        <div style="font-weight:700; font-size:1.15rem; color:#fff;">Tap to Sync and Listen Together</div>
        <p style="font-size:0.85rem; color:var(--text-muted); max-width:320px;">
          Browser audio autoplay is currently paused until you interact. Click below to synchronize with the room stream!
        </p>
        <button class="btn btn-primary" id="btn-unblock-autoplay" style="margin-top:4px;">
          Sync with Stream Now
        </button>
      `;

      const videoContainer = document.querySelector('.video-container');
      if (videoContainer) {
        videoContainer.appendChild(overlay);
        overlay.querySelector('#btn-unblock-autoplay').addEventListener('click', () => {
          overlay.remove();
          if (ytPlayer && typeof ytPlayer.playVideo === 'function') {
            ytPlayer.playVideo();
            applyAuthoritativeState(activeRoom);
          }
        });
      }
    }
  }

  function hideAutoplayPrompt() {
    const overlay = document.getElementById('room-autoplay-overlay');
    if (overlay) overlay.remove();
  }

  /**
   * Host actions to broadcast state changes to the room
   */
  async function broadcastHostState(playbackState, position = null) {
    if (!activeRoom || !activeRoom.id) return;

    const currentPos = position !== null 
      ? position 
      : (ytPlayer && ytPlayer.getCurrentTime ? ytPlayer.getCurrentTime() : 0);

    const updatePayload = {
      playback_state: playbackState,
      playback_position: currentPos,
      playback_rate: 1.0
    };

    // 1. Optimistic broadcast for fast Realtime latency
    if (realtimeChannel) {
      realtimeChannel.send({
        type: 'broadcast',
        event: 'playback_command',
        state: {
          ...activeRoom,
          ...updatePayload,
          playback_updated_at: new Date().toISOString()
        }
      });
    }

    // 2. Persist to Supabase Database
    await GroicRoomService.updatePlaybackState(activeRoom.id, updatePayload);
  }

  async function broadcastTrackChange(newTrack) {
    if (!activeRoom || !activeRoom.id || !newTrack) return;

    const updatePayload = {
      current_video_id: newTrack.id || newTrack.video_id,
      current_title: newTrack.title,
      current_channel: newTrack.channel,
      current_thumbnail: newTrack.thumbnail,
      playback_state: 'playing',
      playback_position: 0.0,
      playback_rate: 1.0
    };

    if (realtimeChannel) {
      realtimeChannel.send({
        type: 'broadcast',
        event: 'playback_command',
        state: {
          ...activeRoom,
          ...updatePayload,
          playback_updated_at: new Date().toISOString()
        }
      });
    }

    await GroicRoomService.updatePlaybackState(activeRoom.id, updatePayload);
  }

  function startDriftChecker() {
    stopDriftChecker();
    syncTimer = setInterval(() => {
      if (activeRoom && activeRoom.playback_state === 'playing') {
        applyAuthoritativeState(activeRoom);
      }
    }, SYNC_INTERVAL_MS);
  }

  function stopDriftChecker() {
    if (syncTimer) {
      clearInterval(syncTimer);
      syncTimer = null;
    }
  }

  function getCurrentPlayerVideoId() {
    if (!ytPlayer || typeof ytPlayer.getVideoData !== 'function') return null;
    const data = ytPlayer.getVideoData();
    return data ? data.video_id : null;
  }

  function cleanup() {
    stopDriftChecker();
    hideAutoplayPrompt();
    if (realtimeChannel && window.GroicSupabase) {
      const client = window.GroicSupabase.getClient();
      if (client) {
        client.removeChannel(realtimeChannel);
      }
      realtimeChannel = null;
    }
  }

  return {
    init,
    broadcastHostState,
    broadcastTrackChange,
    applyAuthoritativeState,
    cleanup
  };
})();
