/**
 * GROIC - Official YouTube IFrame Player & Queue Controller
 * 
 * Complies strictly with YouTube API terms: uses official iframe player API,
 * preserves video display and player controls, does not attempt audio extraction,
 * and maintains playback queue, history, and user interactions.
 */

window.GroicPlayer = (function () {
  let ytPlayer = null;
  let isApiReady = false;
  let currentTrack = null;
  let activeQueue = [];
  let currentQueueIndex = 0;

  // Fallback demo track if URL has no video specified
  const DEFAULT_TRACK = {
    id: 'jfKfPfyJRdk',
    title: 'lofi hip hop radio 📚 - beats to relax/study to',
    channel: 'Lofi Girl',
    thumbnail: 'https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg'
  };

  function init() {
    // 1. Parse URL parameters for video metadata
    const params = new URLSearchParams(window.location.search);
    const videoId = params.get('v') || params.get('videoId');
    const title = params.get('title') || '';
    const channel = params.get('channel') || '';
    const thumbnail = params.get('thumb') || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '');

    // 2. Load active queue from storage or generate fallback
    activeQueue = GroicMusicService.getQueue();
    currentQueueIndex = GroicMusicService.getCurrentQueueIndex() || 0;

    if (videoId) {
      currentTrack = {
        id: videoId,
        title: title ? decodeURIComponent(title) : 'YouTube Music Video',
        channel: channel ? decodeURIComponent(channel) : 'YouTube Creator',
        thumbnail: thumbnail ? decodeURIComponent(thumbnail) : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
      };

      // Ensure current track is in queue
      const existingIdx = activeQueue.findIndex(t => t.id === videoId);
      if (existingIdx !== -1) {
        currentQueueIndex = existingIdx;
      } else {
        activeQueue.unshift(currentTrack);
        currentQueueIndex = 0;
        GroicMusicService.setQueue(activeQueue, 0);
      }
    } else if (activeQueue.length > 0 && activeQueue[currentQueueIndex]) {
      currentTrack = activeQueue[currentQueueIndex];
    } else {
      // Check recently played
      const history = GroicLocalLibrary.getHistory();
      if (history.length > 0) {
        currentTrack = history[0];
        activeQueue = [...history];
      } else {
        currentTrack = DEFAULT_TRACK;
        activeQueue = GroicYouTube.DEMO_CATALOG.slice(0, 10);
      }
      GroicMusicService.setQueue(activeQueue, 0);
    }

    renderTrackInfo();
    renderQueue();
    initActionButtons();
    loadYouTubeIframeAPI();
  }

  function sanitizeVideoId(idOrUrl) {
    if (!idOrUrl || typeof idOrUrl !== 'string') return 'jfKfPfyJRdk';
    const trimmed = idOrUrl.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
    const match = trimmed.match(/(?:v=|\/embed\/|youtu\.be\/|\/v\/|^)([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : 'jfKfPfyJRdk';
  }

  /**
   * Inject YouTube IFrame API script tag safely (single initialization)
   */
  function loadYouTubeIframeAPI() {
    if (window.YT && window.YT.Player) {
      isApiReady = true;
      initPlayerInstance();
      return;
    }

    if (document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const checkTimer = setInterval(() => {
        if (window.YT && window.YT.Player) {
          clearInterval(checkTimer);
          isApiReady = true;
          initPlayerInstance();
        }
      }, 100);
      return;
    }

    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.async = true;
    const firstScriptTag = document.getElementsByTagName('script')[0];
    if (firstScriptTag && firstScriptTag.parentNode) {
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    } else {
      document.head.appendChild(tag);
    }

    window.onYouTubeIframeAPIReady = function () {
      isApiReady = true;
      initPlayerInstance();
    };
  }

  function initPlayerInstance() {
    if (!currentTrack || !currentTrack.id) return;

    const overlay = document.getElementById('player-loading-overlay');
    const validVideoId = sanitizeVideoId(currentTrack.id);
    currentTrack.id = validVideoId;

    const isHttp = window.location.protocol.startsWith('http');
    const playerVars = {
      autoplay: 1,
      controls: 1,
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
        videoId: validVideoId,
        playerVars: playerVars,
        events: {
          onReady: (event) => {
            if (overlay) overlay.classList.add('hidden');
            updatePlaybackStatus('Playing');
            recordPlayHistory();
          },
          onStateChange: onPlayerStateChange,
          onError: onPlayerError
        }
      });
    } catch (e) {
      console.error('GROIC: Error initializing YT.Player instance:', e);
      if (overlay) overlay.classList.add('hidden');
    }
  }

  function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.PLAYING) {
      updatePlaybackStatus('Playing');
      recordPlayHistory();
    } else if (event.data === YT.PlayerState.PAUSED) {
      updatePlaybackStatus('Paused');
    } else if (event.data === YT.PlayerState.BUFFERING) {
      updatePlaybackStatus('Buffering...');
    } else if (event.data === YT.PlayerState.ENDED) {
      updatePlaybackStatus('Ended');
      // Auto-advance to next track in queue
      playNext();
    }
  }

  function onPlayerError(event) {
    console.warn('GROIC YouTube Player Error Code:', event.data);
    let msg = 'Playback error encountered.';

    if (event.data === 153) {
      msg = window.location.protocol === 'file:'
        ? 'Error 153: Direct file:/// access restricts YouTube embeds. Run a local HTTP server or view on GitHub Pages.'
        : 'Error 153: YouTube player configuration error. Skipping to next song...';
    } else if (event.data === 101 || event.data === 150) {
      msg = 'This video does not permit external embedding. Skipping to next song...';
    } else if (event.data === 100) {
      msg = 'This video is unavailable. Skipping to next song...';
    } else if (event.data === 2) {
      msg = 'Invalid YouTube video parameter. Skipping...';
    }

    window.GroicApp.showToast(msg, 'error', 4500);
    setTimeout(() => {
      playNext();
    }, 2500);
  }

  function recordPlayHistory() {
    if (currentTrack && currentTrack.id) {
      GroicLocalLibrary.addToHistory(currentTrack);
    }
  }

  function updatePlaybackStatus(status) {
    const statusEl = document.getElementById('player-status-badge');
    if (statusEl) {
      statusEl.textContent = status;
    }
  }

  function renderTrackInfo() {
    if (!currentTrack) return;

    const titleEl = document.getElementById('now-playing-title');
    const channelEl = document.getElementById('now-playing-channel');
    const saveBtn = document.getElementById('btn-player-save');

    if (titleEl) titleEl.textContent = currentTrack.title || 'Unknown Track';
    if (channelEl) channelEl.textContent = currentTrack.channel || 'Unknown Channel';

    // Update Save button state (Heart)
    if (saveBtn) {
      const isSaved = GroicLocalLibrary.isSongSaved(currentTrack.id);
      saveBtn.classList.toggle('saved', isSaved);
      saveBtn.setAttribute('title', isSaved ? 'Remove from Saved Songs' : 'Save to Library');
      saveBtn.style.color = isSaved ? 'var(--accent-magenta)' : '';
    }

    // Update browser tab title
    document.title = `${currentTrack.title} — GROIC Player`;
  }

  function renderQueue() {
    const listEl = document.getElementById('queue-list-container');
    const countEl = document.getElementById('queue-total-count');
    if (!listEl) return;

    listEl.innerHTML = '';
    if (countEl) countEl.textContent = activeQueue.length;

    if (activeQueue.length === 0) {
      listEl.innerHTML = `<li class="queue-empty-msg">Queue is empty. Discover songs on the Explore page!</li>`;
      return;
    }

    activeQueue.forEach((track, idx) => {
      const isActive = idx === currentQueueIndex;
      const li = document.createElement('li');
      li.className = `queue-item ${isActive ? 'active' : ''}`;
      li.setAttribute('role', 'button');
      li.setAttribute('tabindex', '0');

      li.innerHTML = `
        <img src="${track.thumbnail || './assets/images/default-cover.svg'}" alt="" class="queue-thumb" />
        <div class="queue-details">
          <div class="queue-item-title">${escapeHtml(track.title)}</div>
          <div class="queue-item-channel">${escapeHtml(track.channel)}</div>
        </div>
        ${isActive ? `
          <div style="font-size:0.7rem; color:var(--accent-purple); font-weight:700; text-transform:uppercase;">Playing</div>
        ` : ''}
      `;

      const playTrack = () => {
        jumpToQueueIndex(idx);
      };

      li.addEventListener('click', playTrack);
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          playTrack();
        }
      });

      listEl.appendChild(li);
    });
  }

  function jumpToQueueIndex(index) {
    if (index < 0 || index >= activeQueue.length) return;
    currentQueueIndex = index;
    currentTrack = activeQueue[currentQueueIndex];
    GroicMusicService.setCurrentQueueIndex(currentQueueIndex);

    renderTrackInfo();
    renderQueue();

    if (ytPlayer && ytPlayer.loadVideoById) {
      ytPlayer.loadVideoById(currentTrack.id);
    } else {
      initPlayerInstance();
    }
  }

  function playNext() {
    if (activeQueue.length === 0) return;
    if (currentQueueIndex + 1 < activeQueue.length) {
      jumpToQueueIndex(currentQueueIndex + 1);
    } else {
      // Loop back to start
      jumpToQueueIndex(0);
      window.GroicApp.showToast('Restarted queue from beginning', 'info');
    }
  }

  function playPrev() {
    if (activeQueue.length === 0) return;
    if (currentQueueIndex > 0) {
      jumpToQueueIndex(currentQueueIndex - 1);
    } else {
      jumpToQueueIndex(activeQueue.length - 1);
    }
  }

  function initActionButtons() {
    const prevBtn = document.getElementById('btn-player-prev');
    const nextBtn = document.getElementById('btn-player-next');
    const playPauseBtn = document.getElementById('btn-player-playpause');
    const saveBtn = document.getElementById('btn-player-save');
    const addPlBtn = document.getElementById('btn-player-add-playlist');
    const shareBtn = document.getElementById('btn-player-share');

    if (prevBtn) prevBtn.addEventListener('click', playPrev);
    if (nextBtn) nextBtn.addEventListener('click', playNext);

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

    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        if (!currentTrack) return;
        const isSaved = GroicLocalLibrary.isSongSaved(currentTrack.id);
        if (isSaved) {
          const res = GroicLocalLibrary.removeSavedSong(currentTrack.id);
          window.GroicApp.showToast(res.message, 'info');
        } else {
          const res = GroicLocalLibrary.saveSong(currentTrack);
          window.GroicApp.showToast(res.message, 'success');
        }
        renderTrackInfo();
      });
    }

    if (addPlBtn) {
      addPlBtn.addEventListener('click', () => {
        if (currentTrack) {
          GroicPlaylists.openAddToPlaylistModal(currentTrack);
        }
      });
    }

    if (shareBtn) {
      shareBtn.addEventListener('click', () => {
        if (!currentTrack) return;
        const shareUrl = `${window.location.origin}${window.location.pathname}?v=${currentTrack.id}&title=${encodeURIComponent(currentTrack.title)}`;
        navigator.clipboard.writeText(shareUrl).then(() => {
          window.GroicApp.showToast('Shareable link copied to clipboard!', 'success');
        }).catch(() => {
          window.prompt('Copy link to share track:', shareUrl);
        });
      });
    }
  }

  function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, function (m) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
    });
  }

  return {
    init,
    playNext,
    playPrev,
    jumpToQueueIndex
  };
})();
