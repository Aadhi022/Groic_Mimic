/**
 * GROIC - Live Participant Presence Tracker
 * 
 * Uses Supabase Realtime Presence to track active online listeners in a room,
 * deduplicating multiple tabs per user and firing join/leave signals.
 */

window.GroicRoomPresence = (function () {
  let presenceChannel = null;
  let currentRoomId = null;
  let presenceState = {};
  let onPresenceChangeCallback = null;
  let previousUserIds = new Set();

  function init(roomId, onChangeCallback) {
    currentRoomId = roomId;
    onPresenceChangeCallback = onChangeCallback;

    if (!window.GroicSupabase || !window.GroicSupabase.isConfigured()) {
      // Offline / Demo presence simulation
      simulateDemoPresence();
      return;
    }

    const client = window.GroicSupabase.getClient();
    if (!client) return;

    const user = GroicAuth.getCurrentUser();
    const profile = GroicAuth.getCurrentProfile();

    const userData = {
      user_id: user ? user.id : `guest_${Math.random().toString(36).substr(2, 6)}`,
      display_name: profile?.display_name || user?.email?.split('@')[0] || 'Listener',
      avatar_url: profile?.avatar_url || null,
      online_at: new Date().toISOString()
    };

    presenceChannel = client.channel(`room_presence_${roomId}`, {
      config: {
        presence: {
          key: userData.user_id
        }
      }
    });

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        presenceState = presenceChannel.presenceState();
        notifyPresenceChange();
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        const joinedUser = newPresences?.[0];
        if (joinedUser && joinedUser.display_name && !previousUserIds.has(key)) {
          if (window.GroicApp && window.GroicApp.showToast) {
            window.GroicApp.showToast(`${joinedUser.display_name} joined the room`, 'info', 2500);
          }
        }
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        const leftUser = leftPresences?.[0];
        if (leftUser && leftUser.display_name) {
          if (window.GroicApp && window.GroicApp.showToast) {
            window.GroicApp.showToast(`${leftUser.display_name} left the room`, 'info', 2000);
          }
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track(userData);
        }
      });
  }

  function simulateDemoPresence() {
    const demoListeners = [
      { user_id: 'd1', display_name: 'You (Listener)', isSelf: true },
      { user_id: 'd2', display_name: 'Haruki (Host)', isHost: true },
      { user_id: 'd3', display_name: 'Maya', isHost: false },
      { user_id: 'd4', display_name: 'Liam', isHost: false }
    ];

    if (typeof onPresenceChangeCallback === 'function') {
      onPresenceChangeCallback(demoListeners);
    }
  }

  function notifyPresenceChange() {
    // Deduplicate participants by user_id
    const uniqueParticipants = [];
    const currentIds = new Set();
    const currentUserId = GroicAuth.getCurrentUser()?.id;

    Object.keys(presenceState).forEach(key => {
      const presences = presenceState[key];
      if (Array.isArray(presences) && presences.length > 0) {
        const p = presences[0];
        if (!currentIds.has(p.user_id)) {
          currentIds.add(p.user_id);
          uniqueParticipants.push({
            user_id: p.user_id,
            display_name: p.display_name || 'Listener',
            avatar_url: p.avatar_url,
            isSelf: p.user_id === currentUserId
          });
        }
      }
    });

    previousUserIds = currentIds;

    if (typeof onPresenceChangeCallback === 'function') {
      onPresenceChangeCallback(uniqueParticipants);
    }
  }

  function getOnlineCount() {
    return Object.keys(presenceState).length || 1;
  }

  function cleanup() {
    if (presenceChannel && window.GroicSupabase) {
      const client = window.GroicSupabase.getClient();
      if (client) {
        presenceChannel.untrack();
        client.removeChannel(presenceChannel);
      }
      presenceChannel = null;
    }
    presenceState = {};
    previousUserIds.clear();
  }

  return {
    init,
    getOnlineCount,
    cleanup
  };
})();
