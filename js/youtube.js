/**
 * GROIC - YouTube API & Demo Catalog Provider
 * 
 * Handles search requests via the YouTube Data API v3 when an API key is available,
 * or serves a rich curated catalog of real YouTube music videos when in Demo Mode.
 */

window.GroicYouTube = (function () {
  const API_ENDPOINT = 'https://www.googleapis.com/youtube/v3/search';

  // Curated demo catalog of genuine, playable YouTube music videos
  const DEMO_CATALOG = [
    {
      id: 'jfKfPfyJRdk',
      title: 'lofi hip hop radio 📚 - beats to relax/study to',
      channel: 'Lofi Girl',
      thumbnail: 'https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg',
      category: 'lo-fi',
      duration: 'LIVE'
    },
    {
      id: '4xDzrJKXOOY',
      title: 'synthwave radio 🌌 - chill synth / retro beats to chill/game to',
      channel: 'Lofi Girl',
      thumbnail: 'https://i.ytimg.com/vi/4xDzrJKXOOY/hqdefault.jpg',
      category: 'electronic',
      duration: 'LIVE'
    },
    {
      id: '5qap5aO4i9A',
      title: 'Lofi Hip Hop Radio 24/7 🔴 Chill Study Beats',
      channel: 'Lofi Records',
      thumbnail: 'https://i.ytimg.com/vi/5qap5aO4i9A/hqdefault.jpg',
      category: 'chill',
      duration: 'LIVE'
    },
    {
      id: 'kJQP7kiw5Fk',
      title: 'Luis Fonsi - Despacito ft. Daddy Yankee',
      channel: 'Luis Fonsi',
      thumbnail: 'https://i.ytimg.com/vi/kJQP7kiw5Fk/hqdefault.jpg',
      category: 'pop',
      duration: '4:42'
    },
    {
      id: 'fJ9rUzIMcZQ',
      title: 'Queen – Bohemian Rhapsody (Official Video Remastered)',
      channel: 'Queen Official',
      thumbnail: 'https://i.ytimg.com/vi/fJ9rUzIMcZQ/hqdefault.jpg',
      category: 'rock',
      duration: '5:59'
    },
    {
      id: 'JGwWNGJdvx8',
      title: 'Ed Sheeran - Shape of You (Official Music Video)',
      channel: 'Ed Sheeran',
      thumbnail: 'https://i.ytimg.com/vi/JGwWNGJdvx8/hqdefault.jpg',
      category: 'pop',
      duration: '4:23'
    },
    {
      id: 'hTWKbfoikeg',
      title: 'Nirvana - Smells Like Teen Spirit (Official Music Video)',
      channel: 'Nirvana',
      thumbnail: 'https://i.ytimg.com/vi/hTWKbfoikeg/hqdefault.jpg',
      category: 'rock',
      duration: '4:38'
    },
    {
      id: 'k4V3Mo61fJM',
      title: 'Imagine Dragons - Believer (Official Music Video)',
      channel: 'ImagineDragons',
      thumbnail: 'https://i.ytimg.com/vi/k4V3Mo61fJM/hqdefault.jpg',
      category: 'workout',
      duration: '3:36'
    },
    {
      id: 'DkeiKbqa02g',
      title: 'Calvin Harris - Summer (Official Video)',
      channel: 'Calvin Harris',
      thumbnail: 'https://i.ytimg.com/vi/DkeiKbqa02g/hqdefault.jpg',
      category: 'electronic',
      duration: '3:53'
    },
    {
      id: '09R8_2nJtjg',
      title: 'Maroon 5 - Sugar (Official Music Video)',
      channel: 'Maroon 5',
      thumbnail: 'https://i.ytimg.com/vi/09R8_2nJtjg/hqdefault.jpg',
      category: 'pop',
      duration: '5:01'
    },
    {
      id: 'RgKAFK5djSk',
      title: 'Wiz Khalifa - See You Again ft. Charlie Puth [Official Video] Furious 7 Soundtrack',
      channel: 'Wiz Khalifa',
      thumbnail: 'https://i.ytimg.com/vi/RgKAFK5djSk/hqdefault.jpg',
      category: 'hip-hop',
      duration: '3:57'
    },
    {
      id: 'CevxZvSJLk8',
      title: 'Katy Perry - Roar (Official)',
      channel: 'Katy Perry',
      thumbnail: 'https://i.ytimg.com/vi/CevxZvSJLk8/hqdefault.jpg',
      category: 'pop',
      duration: '4:30'
    },
    {
      id: 'OPf0YbXqDm0',
      title: 'Mark Ronson - Uptown Funk ft. Bruno Mars',
      channel: 'Mark Ronson',
      thumbnail: 'https://i.ytimg.com/vi/OPf0YbXqDm0/hqdefault.jpg',
      category: 'trending sounds',
      duration: '4:30'
    },
    {
      id: '2Vv-BfVoq4g',
      title: 'Ed Sheeran - Perfect (Official Music Video)',
      channel: 'Ed Sheeran',
      thumbnail: 'https://i.ytimg.com/vi/2Vv-BfVoq4g/hqdefault.jpg',
      category: 'chill',
      duration: '4:39'
    },
    {
      id: 'nfWlot6h_JM',
      title: 'Taylor Swift - Shake It Off',
      channel: 'Taylor Swift',
      thumbnail: 'https://i.ytimg.com/vi/nfWlot6h_JM/hqdefault.jpg',
      category: 'pop',
      duration: '4:01'
    },
    {
      id: 'YQHsXMglC9A',
      title: 'Adele - Hello (Official Music Video)',
      channel: 'Adele',
      thumbnail: 'https://i.ytimg.com/vi/YQHsXMglC9A/hqdefault.jpg',
      category: 'indie',
      duration: '6:06'
    },
    {
      id: 'SlPhMPnQ58k',
      title: 'Maroon 5 - Memories (Official Video)',
      channel: 'Maroon 5',
      thumbnail: 'https://i.ytimg.com/vi/SlPhMPnQ58k/hqdefault.jpg',
      category: 'chill',
      duration: '3:15'
    },
    {
      id: '7wtfhZwyrcc',
      title: 'Imagine Dragons - Bones (Official Music Video)',
      channel: 'ImagineDragons',
      thumbnail: 'https://i.ytimg.com/vi/7wtfhZwyrcc/hqdefault.jpg',
      category: 'workout',
      duration: '3:05'
    },
    {
      id: 'L0MK7qz13bU',
      title: 'Frozen 2 - Into the Unknown (From "Frozen 2")',
      channel: 'DisneyMusicVEVO',
      thumbnail: 'https://i.ytimg.com/vi/L0MK7qz13bU/hqdefault.jpg',
      category: 'classical',
      duration: '3:15'
    },
    {
      id: 'pB-5XG-DbAA',
      title: 'Chopin - Nocturne op.9 No.2 (Arthur Rubinstein)',
      channel: 'Classical Masterpieces',
      thumbnail: 'https://i.ytimg.com/vi/pB-5XG-DbAA/hqdefault.jpg',
      category: 'classical',
      duration: '4:31'
    }
  ];

  /**
   * Safely decode HTML entities returned by the YouTube API
   * without using innerHTML on unsanitized elements.
   */
  function decodeHtmlEntities(str) {
    if (!str) return '';
    const txt = document.createElement('textarea');
    txt.innerHTML = str;
    return txt.value;
  }

  /**
   * Search videos using YouTube Data API v3
   * @param {string} query Search terms or genre
   * @param {string} pageToken Optional pagination token
   * @param {object} options Optional parameters
   */
  async function searchVideos(query, pageToken = '', options = {}) {
    const isLive = window.GROIC_CONFIG && window.GROIC_CONFIG.isLiveMode();

    // If live mode is not enabled, return demo catalog results
    if (!isLive) {
      return getDemoResults(query, pageToken);
    }

    const apiKey = window.GROIC_CONFIG.getApiKey();
    const maxResults = options.maxResults || window.GROIC_CONFIG.MAX_RESULTS_PER_PAGE || 12;

    // Enhance music search query
    let musicQuery = (query || '').trim();
    if (!musicQuery) {
      musicQuery = window.GROIC_CONFIG.DEFAULT_SEARCH_GENRE || 'trending music';
    }

    const url = new URL(API_ENDPOINT);
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('type', 'video');
    url.searchParams.set('videoCategoryId', '10'); // YouTube Music category
    url.searchParams.set('maxResults', String(maxResults));
    url.searchParams.set('q', `${musicQuery} music`);
    url.searchParams.set('key', apiKey);

    if (pageToken) {
      url.searchParams.set('pageToken', pageToken);
    }

    try {
      const response = await fetch(url.toString());

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || `HTTP ${response.status} ${response.statusText}`;
        console.warn('GROIC YouTube API error:', response.status, errorMessage);

        // If quota exceeded or key invalid, fall back to Demo Mode with informative notice
        const isQuota = response.status === 403 && (errorMessage.includes('quota') || errorMessage.includes('limit'));
        return {
          items: filterDemoCatalog(query),
          nextPageToken: null,
          isLive: false,
          fallbackFromError: true,
          error: errorMessage,
          isQuotaExceeded: isQuota
        };
      }

      const data = await response.json();
      const items = (data.items || []).map(item => {
        const snippet = item.snippet || {};
        const thumbnails = snippet.thumbnails || {};
        const thumbnail = (
          thumbnails.high?.url ||
          thumbnails.medium?.url ||
          thumbnails.default?.url ||
          `https://i.ytimg.com/vi/${item.id.videoId}/hqdefault.jpg`
        );

        return {
          id: item.id.videoId,
          title: decodeHtmlEntities(snippet.title || 'Untitled Video'),
          channel: decodeHtmlEntities(snippet.channelTitle || 'Unknown Artist'),
          description: decodeHtmlEntities(snippet.description || ''),
          thumbnail: thumbnail,
          publishedAt: snippet.publishedAt || null,
          isDemo: false
        };
      });

      return {
        items,
        nextPageToken: data.nextPageToken || null,
        totalResults: data.pageInfo?.totalResults || items.length,
        isLive: true
      };
    } catch (networkError) {
      console.error('GROIC: YouTube network fetch error', networkError);
      return {
        items: filterDemoCatalog(query),
        nextPageToken: null,
        isLive: false,
        fallbackFromError: true,
        error: networkError.message || 'Network connection failed'
      };
    }
  }

  /**
   * Filter the local demo catalog for queries / categories
   */
  function filterDemoCatalog(query = '') {
    const q = (query || '').toLowerCase().trim();
    if (!q || q === 'all' || q === 'trending sounds') {
      return [...DEMO_CATALOG];
    }

    const matches = DEMO_CATALOG.filter(track => {
      return (
        track.category.toLowerCase().includes(q) ||
        track.title.toLowerCase().includes(q) ||
        track.channel.toLowerCase().includes(q)
      );
    });

    // If specific search had zero matches, return full catalog shuffled
    return matches.length > 0 ? matches : [...DEMO_CATALOG];
  }

  function getDemoResults(query, pageToken = '') {
    const filtered = filterDemoCatalog(query);
    // Simulate pagination for demo
    const pageSize = window.GROIC_CONFIG ? window.GROIC_CONFIG.MAX_RESULTS_PER_PAGE : 12;
    const startIndex = pageToken ? parseInt(pageToken, 10) || 0 : 0;
    const endIndex = startIndex + pageSize;
    const pageItems = filtered.slice(startIndex, endIndex);
    const nextToken = endIndex < filtered.length ? String(endIndex) : null;

    return {
      items: pageItems.map(item => ({ ...item, isDemo: true })),
      nextPageToken: nextToken,
      totalResults: filtered.length,
      isLive: false,
      isDemo: true
    };
  }

  /**
   * Get single track metadata by video ID
   */
  function getDemoTrackById(id) {
    return DEMO_CATALOG.find(t => t.id === id) || {
      id: id,
      title: 'YouTube Music Track',
      channel: 'YouTube Video',
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      isDemo: true
    };
  }

  return {
    searchVideos,
    getDemoResults,
    getDemoTrackById,
    DEMO_CATALOG,
    decodeHtmlEntities
  };
})();
