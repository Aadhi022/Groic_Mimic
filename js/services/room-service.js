/**
 * GROIC - Room Service
 * 
 * Manages social listening rooms, discovery, atomic capacity enforcement,
 * shared queue operations, and playback state persistence via Supabase.
 */

window.GroicRoomService = (function () {
  // Curated demo rooms shown ONLY when Supabase is not yet configured
  const DEMO_ROOMS = [
    {
      id: 'demo-room-lofi-01',
      name: 'Tokyo Lo-Fi Study Lounge ☕',
      description: 'Chill beats, warm coffee, and deep focus session. Feel free to queue your favorite lofi tracks.',
      privacy: 'public',
      host_name: 'Haruki (Demo)',
      max_capacity: 8,
      participant_count: 5,
      current_video_id: 'jfKfPfyJRdk',
      current_title: 'lofi hip hop radio 📚 - beats to relax/study to',
      current_channel: 'Lofi Girl',
      current_thumbnail: 'https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg',
      playback_state: 'playing',
      theme: 'lofi',
      trending_score: 94.5,
      isDemo: true
    },
    {
      id: 'demo-room-synth-02',
      name: 'Midnight Neon Synthwave 🌌',
      description: 'Cruising through the cyber grid. Retro synth, outrun, and cyberpunk audio streams.',
      privacy: 'public',
      host_name: 'NeoRider (Demo)',
      max_capacity: 6,
      participant_count: 4,
      current_video_id: '4xDzrJKXOOY',
      current_title: 'synthwave radio 🌌 - chill synth / retro beats to chill/game to',
      current_channel: 'Lofi Girl',
      current_thumbnail: 'https://i.ytimg.com/vi/4xDzrJKXOOY/hqdefault.jpg',
      playback_state: 'playing',
      theme: 'synthwave',
      trending_score: 88.2,
      isDemo: true
    },
    {
      id: 'demo-room-chill-03',
      name: 'Acoustic & Coffee Mornings 🌿',
      description: 'Warm indie acoustic covers, soft vocals, and gentle morning rhythms.',
      privacy: 'public',
      host_name: 'Elena (Demo)',
      max_capacity: 4,
      participant_count: 2,
      current_video_id: '2Vv-BfVoq4g',
      current_title: 'Ed Sheeran - Perfect (Official Music Video)',
      current_channel: 'Ed Sheeran',
      current_thumbnail: 'https://i.ytimg.com/vi/2Vv-BfVoq4g/hqdefault.jpg',
      playback_state: 'playing',
      theme: 'chill',
      trending_score: 72.0,
      isDemo: true
    }
  ];

  function isConfigured() {
    return window.GroicSupabase && window.GroicSupabase.isConfigured();
  }

  function getClient() {
    return window.GroicSupabase ? window.GroicSupabase.getClient() : null;
  }

  function generateInviteCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * Create a new social listening room
   */
  async function createRoom(options) {
    if (!isConfigured()) {
      return {
        success: false,
        message: 'Supabase configuration is required to create rooms. Please open Settings to configure.'
      };
    }

    const client = getClient();
    const user = GroicAuth.getCurrentUser();
    if (!user) {
      return { success: false, message: 'You must be signed in to create a room.' };
    }

    const name = (options.name || '').trim();
    if (!name) {
      return { success: false, message: 'Room name cannot be empty.' };
    }

    const privacy = options.privacy === 'private' ? 'private' : 'public';
    const capacity = [2, 4, 6, 8, 10].includes(Number(options.maxCapacity)) ? Number(options.maxCapacity) : 6;
    const inviteCode = privacy === 'private' ? generateInviteCode() : null;

    const initialVideo = options.initialTrack || {
      id: 'jfKfPfyJRdk',
      title: 'lofi hip hop radio 📚 - beats to relax/study to',
      channel: 'Lofi Girl',
      thumbnail: 'https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg'
    };

    const roomData = {
      name: name,
      description: (options.description || '').trim(),
      privacy: privacy,
      host_id: user.id,
      max_capacity: capacity,
      status: 'active',
      settings: {
        member_can_add_songs: options.memberCanAddSongs !== false,
        member_can_control: Boolean(options.memberCanControl),
        member_can_skip: Boolean(options.memberCanSkip),
        member_can_invite: options.memberCanInvite !== false
      },
      theme: options.theme || 'default',
      invite_code: inviteCode,
      current_video_id: initialVideo.id,
      current_title: initialVideo.title,
      current_channel: initialVideo.channel,
      current_thumbnail: initialVideo.thumbnail,
      playback_state: 'playing',
      playback_position: 0.0,
      playback_rate: 1.0,
      playback_updated_at: new Date().toISOString(),
      updated_by: user.id,
      state_version: 1
    };

    try {
      // 1. Insert room record
      const { data: newRoom, error: roomError } = await client
        .from('rooms')
        .insert(roomData)
        .select()
        .single();

      if (roomError) {
        console.error('Error creating room in Supabase:', roomError);
        return { success: false, message: roomError.message };
      }

      // 2. Insert host membership
      await client.from('room_memberships').insert({
        room_id: newRoom.id,
        user_id: user.id,
        role: 'host',
        status: 'active'
      });

      // 3. Insert initial queue item
      await client.from('room_queue').insert({
        room_id: newRoom.id,
        video_id: initialVideo.id,
        title: initialVideo.title,
        channel: initialVideo.channel,
        thumbnail: initialVideo.thumbnail,
        added_by: user.id,
        added_by_name: GroicAuth.getCurrentProfile()?.display_name || 'Host',
        position: 0,
        status: 'playing'
      });

      // 4. Log room creation activity
      await client.from('room_activity').insert({
        room_id: newRoom.id,
        user_id: user.id,
        activity_type: 'create'
      });

      return {
        success: true,
        room: newRoom,
        inviteCode: inviteCode
      };
    } catch (err) {
      console.error('createRoom exception:', err);
      return { success: false, message: err.message || 'Failed to create room' };
    }
  }

  /**
   * Fetch active public rooms with host names & participant counts
   */
  async function getPublicRooms(search = '', moodFilter = '') {
    if (!isConfigured()) {
      // Return filtered demo rooms
      return filterDemoRooms(search, moodFilter);
    }

    const client = getClient();
    try {
      let query = client
        .from('rooms')
        .select(`
          id,
          name,
          description,
          privacy,
          host_id,
          max_capacity,
          current_video_id,
          current_title,
          current_channel,
          current_thumbnail,
          playback_state,
          theme,
          created_at,
          profiles:host_id (display_name),
          memberships:room_memberships (count)
        `)
        .eq('status', 'active')
        .eq('privacy', 'public')
        .order('created_at', { ascending: false });

      if (search && search.trim()) {
        query = query.or(`name.ilike.%${search.trim()}%,description.ilike.%${search.trim()}%`);
      }

      if (moodFilter && moodFilter.toLowerCase() !== 'all') {
        query = query.eq('theme', moodFilter.toLowerCase());
      }

      const { data, error } = await query;
      if (error) {
        console.warn('Failed to fetch public rooms from Supabase, falling back to demo', error);
        return filterDemoRooms(search, moodFilter);
      }

      const rooms = (data || []).map(r => ({
        id: r.id,
        name: r.name,
        description: r.description || '',
        privacy: r.privacy,
        host_id: r.host_id,
        host_name: r.profiles?.display_name || 'Host',
        max_capacity: r.max_capacity,
        participant_count: r.memberships?.[0]?.count || 1,
        current_video_id: r.current_video_id,
        current_title: r.current_title,
        current_channel: r.current_channel,
        current_thumbnail: r.current_thumbnail,
        playback_state: r.playback_state,
        theme: r.theme || 'default',
        created_at: r.created_at,
        isDemo: false
      }));

      return rooms;
    } catch (err) {
      console.warn('Exception in getPublicRooms', err);
      return filterDemoRooms(search, moodFilter);
    }
  }

  /**
   * Fetch trending rooms ranked by real signals
   */
  async function getTrendingRooms(limit = 6) {
    if (!isConfigured()) {
      return DEMO_ROOMS.slice(0, limit);
    }

    const client = getClient();
    try {
      // 1. Try secure RPC function
      const { data, error } = await client.rpc('get_trending_rooms', { p_limit: limit });
      if (!error && data && data.length > 0) {
        return data.map(r => ({ ...r, isDemo: false }));
      }

      // 2. Fallback query if RPC isn't loaded yet
      const publicRooms = await getPublicRooms();
      return publicRooms.slice(0, limit);
    } catch (err) {
      console.warn('getTrendingRooms fallback', err);
      return DEMO_ROOMS.slice(0, limit);
    }
  }

  function filterDemoRooms(search = '', mood = '') {
    return DEMO_ROOMS.filter(r => {
      const matchSearch = !search || 
        r.name.toLowerCase().includes(search.toLowerCase()) || 
        r.description.toLowerCase().includes(search.toLowerCase());
      const matchMood = !mood || mood.toLowerCase() === 'all' || r.theme === mood.toLowerCase();
      return matchSearch && matchMood;
    });
  }

  /**
   * Retrieve single room details by ID
   */
  async function getRoomById(roomId) {
    if (!isConfigured()) {
      const demo = DEMO_ROOMS.find(r => r.id === roomId);
      if (demo) return demo;
      return null;
    }

    const client = getClient();
    try {
      const { data, error } = await client
        .from('rooms')
        .select(`
          *,
          profiles:host_id (display_name, avatar_url),
          memberships:room_memberships (count)
        `)
        .eq('id', roomId)
        .single();

      if (error || !data) return null;

      return {
        ...data,
        host_name: data.profiles?.display_name || 'Host',
        host_avatar: data.profiles?.avatar_url || null,
        participant_count: data.memberships?.[0]?.count || 1,
        isDemo: false
      };
    } catch (e) {
      console.error('getRoomById error', e);
      return null;
    }
  }

  /**
   * Retrieve room by 8-character invitation code
   */
  async function getRoomByInviteCode(inviteCode) {
    if (!inviteCode) return null;
    const cleanCode = inviteCode.trim().toUpperCase();

    if (!isConfigured()) {
      return DEMO_ROOMS.find(r => (r.invite_code && r.invite_code.toUpperCase() === cleanCode)) || DEMO_ROOMS[0];
    }

    const client = getClient();
    try {
      const { data, error } = await client
        .from('rooms')
        .select('*')
        .eq('invite_code', cleanCode)
        .eq('status', 'active')
        .single();

      if (error || !data) return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  /**
   * Join Room with Atomic Capacity & Invite Code Enforcement
   */
  async function joinRoom(roomId, inviteCode = null) {
    if (!isConfigured()) {
      const demo = DEMO_ROOMS.find(r => r.id === roomId);
      if (demo) {
        return {
          success: true,
          message: 'Joined demo room (Sample mode)',
          room: demo,
          is_host: false,
          isDemo: true
        };
      }
      return { success: false, message: 'Room not found' };
    }

    const client = getClient();
    const user = GroicAuth.getCurrentUser();
    if (!user) {
      return { success: false, message: 'Please sign in to join this room.' };
    }

    try {
      // Execute atomic join function
      const { data, error } = await client.rpc('join_room_atomic', {
        p_room_id: roomId,
        p_invite_code: inviteCode ? inviteCode.trim() : null
      });

      if (error) {
        return { success: false, message: error.message };
      }

      return data;
    } catch (err) {
      return { success: false, message: err.message || 'Failed to join room' };
    }
  }

  /**
   * Leave a room
   */
  async function leaveRoom(roomId) {
    if (!isConfigured()) return { success: true };

    const client = getClient();
    try {
      const { data, error } = await client.rpc('leave_room_atomic', { p_room_id: roomId });
      if (error) {
        // Fallback update
        const user = GroicAuth.getCurrentUser();
        if (user) {
          await client.from('room_memberships')
            .update({ status: 'left' })
            .eq('room_id', roomId)
            .eq('user_id', user.id);
        }
      }
      return { success: true };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  /**
   * Host ends the room
   */
  async function endRoom(roomId) {
    if (!isConfigured()) return { success: true };

    const client = getClient();
    const user = GroicAuth.getCurrentUser();

    try {
      const { error } = await client
        .from('rooms')
        .update({
          status: 'ended',
          ended_at: new Date().toISOString(),
          playback_state: 'ended',
          updated_at: new Date().toISOString()
        })
        .eq('id', roomId)
        .eq('host_id', user.id);

      if (error) return { success: false, message: error.message };
      return { success: true };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  /**
   * Update Room Shared Playback State (Authoritative)
   */
  async function updatePlaybackState(roomId, stateUpdate) {
    if (!isConfigured()) return { success: true };

    const client = getClient();
    const user = GroicAuth.getCurrentUser();
    if (!user) return { success: false, message: 'Unauthenticated' };

    const payload = {
      playback_state: stateUpdate.playback_state,
      playback_position: Number(stateUpdate.playback_position || 0),
      playback_rate: Number(stateUpdate.playback_rate || 1.0),
      playback_updated_at: new Date().toISOString(),
      updated_by: user.id,
      updated_at: new Date().toISOString()
    };

    if (stateUpdate.current_video_id) {
      payload.current_video_id = stateUpdate.current_video_id;
    }
    if (stateUpdate.current_title) {
      payload.current_title = stateUpdate.current_title;
    }
    if (stateUpdate.current_channel) {
      payload.current_channel = stateUpdate.current_channel;
    }
    if (stateUpdate.current_thumbnail) {
      payload.current_thumbnail = stateUpdate.current_thumbnail;
    }
    if (stateUpdate.current_queue_id !== undefined) {
      payload.current_queue_id = stateUpdate.current_queue_id;
    }

    try {
      const { data, error } = await client
        .from('rooms')
        .update(payload)
        .eq('id', roomId)
        .select()
        .single();

      if (error) return { success: false, message: error.message };
      return { success: true, room: data };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  // --------------------------------------------------------------------------
  // Shared Room Queue Operations (Persistent in Supabase & Local Demo Mode)
  // --------------------------------------------------------------------------

  // Cross-tab broadcast channel for local demo mode synchronization
  let localQueueSyncChannel = null;
  try {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      localQueueSyncChannel = new BroadcastChannel('groic_room_queue_channel');
    }
  } catch (e) {
    // BroadcastChannel unsupported or restricted
  }

  function broadcastLocalQueueUpdate(roomId) {
    if (localQueueSyncChannel) {
      try {
        localQueueSyncChannel.postMessage({ type: 'QUEUE_UPDATED', roomId: roomId, timestamp: Date.now() });
      } catch (err) {}
    }
    // Also trigger storage event for listeners
    try {
      localStorage.setItem('groic_last_queue_ping', `${roomId}:${Date.now()}`);
    } catch (err) {}
  }

  function getDemoQueueKey(roomId) {
    return `groic_demo_queue_${roomId}`;
  }

  function getDemoQueueStorage(roomId) {
    const key = getDemoQueueKey(roomId);
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Error reading demo queue from storage:', e);
    }

    // Default seed catalog for demo rooms
    const defaultTracks = [
      {
        id: 'q-demo-1',
        video_id: 'jfKfPfyJRdk',
        title: 'lofi hip hop radio 📚 - beats to relax/study to',
        channel: 'Lofi Girl',
        thumbnail: 'https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg',
        added_by: 'demo-host',
        added_by_name: 'Host',
        status: 'playing',
        position: 0,
        created_at: new Date(Date.now() - 3600000).toISOString()
      },
      {
        id: 'q-demo-2',
        video_id: '4xDzrJKXOOY',
        title: 'synthwave radio 🌌 - chill synth / retro beats to chill/game to',
        channel: 'Lofi Girl',
        thumbnail: 'https://i.ytimg.com/vi/4xDzrJKXOOY/hqdefault.jpg',
        added_by: 'demo-user-1',
        added_by_name: 'Alex',
        status: 'queued',
        position: 1,
        created_at: new Date(Date.now() - 1800000).toISOString()
      },
      {
        id: 'q-demo-3',
        video_id: '2Vv-BfVoq4g',
        title: 'Ed Sheeran - Perfect (Official Music Video)',
        channel: 'Ed Sheeran',
        thumbnail: 'https://i.ytimg.com/vi/2Vv-BfVoq4g/hqdefault.jpg',
        added_by: 'demo-user-2',
        added_by_name: 'Elena',
        status: 'queued',
        position: 2,
        created_at: new Date(Date.now() - 900000).toISOString()
      }
    ];

    saveDemoQueueStorage(roomId, defaultTracks);
    return defaultTracks;
  }

  function saveDemoQueueStorage(roomId, queue) {
    const key = getDemoQueueKey(roomId);
    try {
      localStorage.setItem(key, JSON.stringify(queue));
      broadcastLocalQueueUpdate(roomId);
    } catch (e) {
      console.warn('Error saving demo queue to storage:', e);
    }
  }

  /**
   * Extract and sanitize YouTube video ID
   */
  function sanitizeVideoId(idOrUrl) {
    if (!idOrUrl || typeof idOrUrl !== 'string') return '';
    const trimmed = idOrUrl.trim();
    // Direct 11-char ID
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
      return trimmed;
    }
    // Extract from youtube.com or youtu.be URL
    const match = trimmed.match(/(?:v=|\/embed\/|youtu\.be\/|\/v\/|^)([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : '';
  }

  async function getQueue(roomId) {
    if (!roomId) return [];

    if (!isConfigured()) {
      const allItems = getDemoQueueStorage(roomId);
      // Return only active items (queued or playing), sorted by position asc
      return allItems
        .filter(item => item.status === 'queued' || item.status === 'playing')
        .sort((a, b) => a.position - b.position);
    }

    const client = getClient();
    try {
      const { data, error } = await client
        .from('room_queue')
        .select('*')
        .eq('room_id', roomId)
        .in('status', ['queued', 'playing'])
        .order('position', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) {
        console.error('getQueue Supabase error:', error);
        return [];
      }
      return data || [];
    } catch (e) {
      console.error('getQueue exception:', e);
      return [];
    }
  }

  async function addToQueue(roomId, track) {
    if (!track) return { success: false, message: 'Invalid track payload.' };

    const validVideoId = sanitizeVideoId(track.id || track.video_id);
    if (!validVideoId) {
      return { success: false, message: 'Invalid or missing YouTube Video ID.' };
    }

    const title = track.title || 'Untitled Track';
    const channel = track.channel || 'YouTube Audio';
    const thumbnail = track.thumbnail || `https://i.ytimg.com/vi/${validVideoId}/hqdefault.jpg`;

    // Local Demo / Offline Fallback
    if (!isConfigured()) {
      const queue = getDemoQueueStorage(roomId);
      const activeUpcoming = queue.filter(item => item.status === 'queued');
      const maxPos = activeUpcoming.reduce((max, item) => Math.max(max, item.position || 0), 0);

      const profile = window.GroicAuth ? GroicAuth.getCurrentProfile() : null;
      const user = window.GroicAuth ? GroicAuth.getCurrentUser() : null;
      const adderName = profile?.display_name || user?.email?.split('@')[0] || 'You (Listener)';
      const adderId = user?.id || 'local-user';

      const newItem = {
        id: `q-demo-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        room_id: roomId,
        video_id: validVideoId,
        title: title,
        channel: channel,
        thumbnail: thumbnail,
        added_by: adderId,
        added_by_name: adderName,
        status: 'queued',
        position: maxPos + 1,
        created_at: new Date().toISOString()
      };

      queue.push(newItem);
      saveDemoQueueStorage(roomId, queue);

      return {
        success: true,
        message: `Queued "${title}"`,
        queueItem: newItem
      };
    }

    // Cloud / Supabase Mode
    const client = getClient();
    const user = GroicAuth.getCurrentUser();
    if (!user) return { success: false, message: 'Please sign in to add songs to room.' };

    try {
      // Find current max position among upcoming items
      const { data: maxPosData } = await client
        .from('room_queue')
        .select('position')
        .eq('room_id', roomId)
        .order('position', { ascending: false })
        .limit(1);

      const nextPos = (maxPosData && maxPosData[0] && maxPosData[0].position !== undefined) 
        ? maxPosData[0].position + 1 
        : 0;

      const profile = GroicAuth.getCurrentProfile();
      const adderName = profile?.display_name || user.email?.split('@')[0] || 'Listener';

      const { data, error } = await client
        .from('room_queue')
        .insert({
          room_id: roomId,
          video_id: validVideoId,
          title: title,
          channel: channel,
          thumbnail: thumbnail,
          added_by: user.id,
          added_by_name: adderName,
          position: nextPos,
          status: 'queued'
        })
        .select()
        .single();

      if (error) {
        return { success: false, message: error.message };
      }

      // Record room activity log
      await client.from('room_activity').insert({
        room_id: roomId,
        user_id: user.id,
        activity_type: 'queue_add'
      });

      return { success: true, message: `Queued "${title}"`, queueItem: data };
    } catch (e) {
      return { success: false, message: e.message || 'Failed to add song.' };
    }
  }

  async function removeFromQueue(roomId, queueItemId) {
    if (!roomId || !queueItemId) return { success: false, message: 'Invalid identifiers.' };

    if (!isConfigured()) {
      const queue = getDemoQueueStorage(roomId);
      const idx = queue.findIndex(item => item.id === queueItemId);
      if (idx !== -1) {
        queue[idx].status = 'removed';
        saveDemoQueueStorage(roomId, queue);
      }
      return { success: true, message: 'Song removed from queue.' };
    }

    const client = getClient();
    try {
      const { error } = await client
        .from('room_queue')
        .update({ status: 'removed' })
        .eq('id', queueItemId)
        .eq('room_id', roomId);

      if (error) return { success: false, message: error.message };
      return { success: true, message: 'Song removed from queue.' };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  /**
   * Reorder an upcoming queue item (Move Up or Move Down)
   */
  async function reorderQueue(roomId, queueItemId, direction) {
    if (!roomId || !queueItemId || (direction !== 'up' && direction !== 'down')) {
      return { success: false, message: 'Invalid reorder parameters.' };
    }

    if (!isConfigured()) {
      const queue = getDemoQueueStorage(roomId);
      const upcoming = queue.filter(item => item.status === 'queued').sort((a, b) => a.position - b.position);
      const currentIndex = upcoming.findIndex(item => item.id === queueItemId);

      if (currentIndex === -1) return { success: false, message: 'Song not found in upcoming queue.' };

      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= upcoming.length) {
        return { success: false, message: 'Cannot move further in that direction.' };
      }

      // Swap positions
      const currentItem = upcoming[currentIndex];
      const targetItem = upcoming[targetIndex];
      const tempPos = currentItem.position;
      currentItem.position = targetItem.position;
      targetItem.position = tempPos;

      saveDemoQueueStorage(roomId, queue);
      return { success: true };
    }

    const client = getClient();
    try {
      const { data: upcomingItems, error: fetchErr } = await client
        .from('room_queue')
        .select('id, position')
        .eq('room_id', roomId)
        .eq('status', 'queued')
        .order('position', { ascending: true });

      if (fetchErr || !upcomingItems) return { success: false, message: 'Failed to fetch queue for reordering.' };

      const currentIndex = upcomingItems.findIndex(i => i.id === queueItemId);
      if (currentIndex === -1) return { success: false, message: 'Item not found in upcoming list.' };

      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= upcomingItems.length) {
        return { success: false, message: 'Cannot move further in that direction.' };
      }

      const itemA = upcomingItems[currentIndex];
      const itemB = upcomingItems[targetIndex];

      // Update positions
      await client.from('room_queue').update({ position: itemB.position }).eq('id', itemA.id);
      await client.from('room_queue').update({ position: itemA.position }).eq('id', itemB.id);

      return { success: true };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  /**
   * Move an upcoming song to play immediately after the current track
   */
  async function playNextInQueue(roomId, queueItemId) {
    if (!roomId || !queueItemId) return { success: false, message: 'Invalid identifiers.' };

    if (!isConfigured()) {
      const queue = getDemoQueueStorage(roomId);
      const upcoming = queue.filter(item => item.status === 'queued').sort((a, b) => a.position - b.position);
      const targetItem = upcoming.find(item => item.id === queueItemId);

      if (!targetItem) return { success: false, message: 'Item not found in upcoming queue.' };

      const minPos = upcoming.reduce((min, it) => Math.min(min, it.position), 0);
      targetItem.position = minPos - 1;

      // Normalize positions
      const sorted = queue.filter(i => i.status === 'queued').sort((a, b) => a.position - b.position);
      sorted.forEach((item, idx) => { item.position = idx; });

      saveDemoQueueStorage(roomId, queue);
      return { success: true, message: `"${targetItem.title}" will play next!` };
    }

    const client = getClient();
    try {
      const { data: upcoming, error } = await client
        .from('room_queue')
        .select('id, position')
        .eq('room_id', roomId)
        .eq('status', 'queued')
        .order('position', { ascending: true });

      if (error || !upcoming || upcoming.length === 0) return { success: false, message: 'Queue is empty.' };

      const minPos = upcoming[0].position || 0;
      await client.from('room_queue').update({ position: minPos - 1 }).eq('id', queueItemId);

      return { success: true, message: 'Song set to play next!' };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  async function advanceQueue(roomId, currentQueueId = null) {
    if (!roomId) return { success: false, message: 'Missing room ID.' };

    if (!isConfigured()) {
      const queue = getDemoQueueStorage(roomId);
      // Mark current item as played
      if (currentQueueId) {
        const curr = queue.find(i => i.id === currentQueueId);
        if (curr) curr.status = 'played';
      } else {
        const playingItem = queue.find(i => i.status === 'playing');
        if (playingItem) playingItem.status = 'played';
      }

      // Find next queued track
      const upcoming = queue.filter(i => i.status === 'queued').sort((a, b) => a.position - b.position);
      if (upcoming.length === 0) {
        saveDemoQueueStorage(roomId, queue);
        return { success: true, queue_empty: true };
      }

      const nextTrack = upcoming[0];
      nextTrack.status = 'playing';
      saveDemoQueueStorage(roomId, queue);

      return {
        success: true,
        next_track: nextTrack
      };
    }

    const client = getClient();
    try {
      const { data, error } = await client.rpc('advance_room_queue_atomic', {
        p_room_id: roomId,
        p_current_queue_id: currentQueueId
      });

      if (error) return { success: false, message: error.message };
      return data;
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  return {
    isConfigured,
    createRoom,
    getPublicRooms,
    getTrendingRooms,
    getRoomById,
    getRoomByInviteCode,
    joinRoom,
    leaveRoom,
    endRoom,
    updatePlaybackState,
    getQueue,
    addToQueue,
    advanceQueue,
    removeFromQueue,
    reorderQueue,
    playNextInQueue,
    sanitizeVideoId,
    DEMO_ROOMS
  };
})();
