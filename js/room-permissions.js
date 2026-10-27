/**
 * GROIC - Room Permissions Helper
 * 
 * Verifies host vs member permissions based on authoritative room settings.
 */

window.GroicRoomPermissions = (function () {
  function isHost(room, user) {
    if (!room || !user) return false;
    return room.host_id === user.id;
  }

  function canAddSongs(room, user) {
    if (!room || !user) return false;
    if (isHost(room, user)) return true;
    return room.settings?.member_can_add_songs !== false;
  }

  function canControlPlayback(room, user) {
    if (!room || !user) return false;
    if (isHost(room, user)) return true;
    return Boolean(room.settings?.member_can_control);
  }

  function canSkipTracks(room, user) {
    if (!room || !user) return false;
    if (isHost(room, user)) return true;
    return Boolean(room.settings?.member_can_skip || room.settings?.member_can_control);
  }

  function canInvite(room, user) {
    if (!room || !user) return false;
    if (isHost(room, user)) return true;
    return room.settings?.member_can_invite !== false;
  }

  function canRemoveSong(room, user, queueItem) {
    if (!room || !queueItem) return false;
    // Host can remove any song
    if (isHost(room, user)) return true;
    // User can remove their own added song if they have add permissions
    if (user && queueItem.added_by && user.id === queueItem.added_by) {
      return canAddSongs(room, user);
    }
    return false;
  }

  function canReorderQueue(room, user) {
    if (!room || !user) return false;
    if (isHost(room, user)) return true;
    return Boolean(room.settings?.member_can_control);
  }

  return {
    isHost,
    canAddSongs,
    canControlPlayback,
    canSkipTracks,
    canInvite,
    canRemoveSong,
    canReorderQueue
  };
})();
