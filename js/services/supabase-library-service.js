/**
 * GROIC - Supabase Library Service (Cloud Storage & Migration Provider)
 * 
 * Provides:
 * - Cloud-persisted Saved Songs with Row Level Security
 * - Cloud-persisted Playlists with Row Level Security
 * - Safe migration/import from local browser storage to cloud account without duplicates
 * - Graceful fallback to local storage when unauthenticated or unconfigured
 */

window.GroicSupabaseLibrary = (function () {
  function isConfigured() {
    return window.GroicSupabase && window.GroicSupabase.isConfigured();
  }

  function getClient() {
    return window.GroicSupabase ? window.GroicSupabase.getClient() : null;
  }

  function isUserAuthenticated() {
    return Boolean(isConfigured() && window.GroicAuth && window.GroicAuth.isAuthenticated());
  }

  return {
    isConfigured,
    isUserAuthenticated,

    // ------------------------------------------------------------------------
    // Saved Songs
    // ------------------------------------------------------------------------

    async getSavedSongs() {
      if (!isUserAuthenticated()) {
        return GroicLocalLibrary.getSavedSongs();
      }

      const client = getClient();
      const user = GroicAuth.getCurrentUser();
      try {
        const { data, error } = await client
          .from('saved_songs')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (error) {
          console.warn('Supabase getSavedSongs error, using local fallback:', error);
          return GroicLocalLibrary.getSavedSongs();
        }

        return (data || []).map(item => ({
          id: item.video_id,
          title: item.title,
          channel: item.channel || 'Unknown Channel',
          thumbnail: item.thumbnail_url || './assets/images/default-cover.svg',
          addedAt: new Date(item.created_at).getTime()
        }));
      } catch (err) {
        return GroicLocalLibrary.getSavedSongs();
      }
    },

    async isSongSaved(trackId) {
      if (!isUserAuthenticated()) {
        return GroicLocalLibrary.isSongSaved(trackId);
      }

      const client = getClient();
      const user = GroicAuth.getCurrentUser();
      try {
        const { data } = await client
          .from('saved_songs')
          .select('id')
          .eq('user_id', user.id)
          .eq('video_id', trackId)
          .limit(1);

        return Boolean(data && data.length > 0);
      } catch (e) {
        return GroicLocalLibrary.isSongSaved(trackId);
      }
    },

    async saveSong(track) {
      if (!track || !track.id) {
        return { success: false, message: 'Invalid track data' };
      }

      if (!isUserAuthenticated()) {
        return GroicLocalLibrary.saveSong(track);
      }

      const client = getClient();
      const user = GroicAuth.getCurrentUser();

      try {
        const { data, error } = await client
          .from('saved_songs')
          .insert({
            user_id: user.id,
            video_id: track.id,
            title: track.title || 'Untitled Track',
            channel: track.channel || 'Unknown Channel',
            thumbnail_url: track.thumbnail || ''
          })
          .select()
          .single();

        if (error) {
          if (error.code === '23505') {
            return { success: false, message: 'Track is already saved in your cloud library' };
          }
          return { success: false, message: error.message };
        }

        return { success: true, message: 'Saved to cloud library', song: track };
      } catch (e) {
        return { success: false, message: e.message };
      }
    },

    async removeSavedSong(trackId) {
      if (!trackId) return { success: false, message: 'Track ID required' };

      if (!isUserAuthenticated()) {
        return GroicLocalLibrary.removeSavedSong(trackId);
      }

      const client = getClient();
      const user = GroicAuth.getCurrentUser();

      try {
        const { error } = await client
          .from('saved_songs')
          .delete()
          .eq('user_id', user.id)
          .eq('video_id', trackId);

        if (error) return { success: false, message: error.message };
        return { success: true, message: 'Removed from cloud library' };
      } catch (e) {
        return { success: false, message: e.message };
      }
    },

    // ------------------------------------------------------------------------
    // Playlists
    // ------------------------------------------------------------------------

    async getPlaylists() {
      if (!isUserAuthenticated()) {
        return GroicLocalLibrary.getPlaylists();
      }

      const client = getClient();
      const user = GroicAuth.getCurrentUser();

      try {
        const { data, error } = await client
          .from('playlists')
          .select(`
            *,
            items:playlist_items (*)
          `)
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false });

        if (error) {
          console.warn('Supabase getPlaylists error, using local fallback:', error);
          return GroicLocalLibrary.getPlaylists();
        }

        return (data || []).map(pl => ({
          id: pl.id,
          name: pl.name,
          description: pl.description || '',
          createdAt: new Date(pl.created_at).getTime(),
          updatedAt: new Date(pl.updated_at).getTime(),
          songs: (pl.items || [])
            .sort((a, b) => a.position - b.position)
            .map(s => ({
              id: s.video_id,
              title: s.title,
              channel: s.channel || 'Unknown Channel',
              thumbnail: s.thumbnail_url || './assets/images/default-cover.svg'
            }))
        }));
      } catch (err) {
        return GroicLocalLibrary.getPlaylists();
      }
    },

    async getPlaylistById(playlistId) {
      if (!isUserAuthenticated()) {
        return GroicLocalLibrary.getPlaylistById(playlistId);
      }

      const playlists = await this.getPlaylists();
      return playlists.find(p => p.id === playlistId) || null;
    },

    async createPlaylist(name, description = '') {
      const trimmed = (name || '').trim();
      if (!trimmed) return { success: false, message: 'Playlist name cannot be empty' };

      if (!isUserAuthenticated()) {
        return GroicLocalLibrary.createPlaylist(name, description);
      }

      const client = getClient();
      const user = GroicAuth.getCurrentUser();

      try {
        const { data, error } = await client
          .from('playlists')
          .insert({
            user_id: user.id,
            name: trimmed,
            description: (description || '').trim()
          })
          .select()
          .single();

        if (error) return { success: false, message: error.message };

        return {
          success: true,
          message: `Created cloud playlist "${trimmed}"`,
          playlist: { ...data, songs: [] }
        };
      } catch (e) {
        return { success: false, message: e.message };
      }
    },

    async renamePlaylist(id, newName) {
      const trimmed = (newName || '').trim();
      if (!trimmed) return { success: false, message: 'Playlist name cannot be empty' };

      if (!isUserAuthenticated()) {
        return GroicLocalLibrary.renamePlaylist(id, newName);
      }

      const client = getClient();
      const user = GroicAuth.getCurrentUser();

      try {
        const { data, error } = await client
          .from('playlists')
          .update({ name: trimmed, updated_at: new Date().toISOString() })
          .eq('id', id)
          .eq('user_id', user.id)
          .select()
          .single();

        if (error) return { success: false, message: error.message };
        return { success: true, message: 'Playlist renamed', playlist: data };
      } catch (e) {
        return { success: false, message: e.message };
      }
    },

    async deletePlaylist(id) {
      if (!isUserAuthenticated()) {
        return GroicLocalLibrary.deletePlaylist(id);
      }

      const client = getClient();
      const user = GroicAuth.getCurrentUser();

      try {
        const { error } = await client
          .from('playlists')
          .delete()
          .eq('id', id)
          .eq('user_id', user.id);

        if (error) return { success: false, message: error.message };
        return { success: true, message: 'Cloud playlist deleted' };
      } catch (e) {
        return { success: false, message: e.message };
      }
    },

    async addSongToPlaylist(playlistId, track) {
      if (!playlistId || !track || !track.id) {
        return { success: false, message: 'Missing playlist or track information' };
      }

      if (!isUserAuthenticated()) {
        return GroicLocalLibrary.addSongToPlaylist(playlistId, track);
      }

      const client = getClient();
      try {
        // Calculate position
        const { data: maxPos } = await client
          .from('playlist_items')
          .select('position')
          .eq('playlist_id', playlistId)
          .order('position', { ascending: false })
          .limit(1);

        const nextPosition = (maxPos && maxPos[0]) ? maxPos[0].position + 1 : 0;

        const { error } = await client
          .from('playlist_items')
          .insert({
            playlist_id: playlistId,
            video_id: track.id,
            title: track.title || 'Untitled Track',
            channel: track.channel || 'Unknown Channel',
            thumbnail_url: track.thumbnail || '',
            position: nextPosition
          });

        if (error) {
          if (error.code === '23505') {
            return { success: false, message: 'Track is already in this playlist' };
          }
          return { success: false, message: error.message };
        }

        // Update playlist updated_at
        await client.from('playlists')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', playlistId);

        return { success: true, message: 'Added to cloud playlist' };
      } catch (e) {
        return { success: false, message: e.message };
      }
    },

    async removeSongFromPlaylist(playlistId, trackId) {
      if (!isUserAuthenticated()) {
        return GroicLocalLibrary.removeSongFromPlaylist(playlistId, trackId);
      }

      const client = getClient();
      try {
        const { error } = await client
          .from('playlist_items')
          .delete()
          .eq('playlist_id', playlistId)
          .eq('video_id', trackId);

        if (error) return { success: false, message: error.message };
        return { success: true, message: 'Song removed from playlist' };
      } catch (e) {
        return { success: false, message: e.message };
      }
    },

    // ------------------------------------------------------------------------
    // Safe Migration: Import Local Storage to Cloud Account
    // ------------------------------------------------------------------------

    async importLocalLibraryToCloud() {
      if (!isUserAuthenticated()) {
        return {
          success: false,
          message: 'Please sign in to your Groic account before importing local library.'
        };
      }

      const client = getClient();
      const user = GroicAuth.getCurrentUser();
      const localSaved = GroicLocalLibrary.getSavedSongs();
      const localPlaylists = GroicLocalLibrary.getPlaylists();

      let importedSaved = 0;
      let importedPlaylists = 0;

      // 1. Import Saved Songs without duplicates
      for (const track of localSaved) {
        try {
          const { error } = await client.from('saved_songs').insert({
            user_id: user.id,
            video_id: track.id,
            title: track.title,
            channel: track.channel,
            thumbnail_url: track.thumbnail
          });
          if (!error) importedSaved++;
        } catch (e) {}
      }

      // 2. Import Playlists and items
      for (const pl of localPlaylists) {
        try {
          const { data: newPl, error: plErr } = await client.from('playlists').insert({
            user_id: user.id,
            name: pl.name,
            description: pl.description || 'Imported from browser storage'
          }).select().single();

          if (!plErr && newPl && Array.isArray(pl.songs)) {
            importedPlaylists++;
            let pos = 0;
            for (const song of pl.songs) {
              await client.from('playlist_items').insert({
                playlist_id: newPl.id,
                video_id: song.id,
                title: song.title,
                channel: song.channel,
                thumbnail_url: song.thumbnail,
                position: pos++
              });
            }
          }
        } catch (e) {}
      }

      return {
        success: true,
        message: `Import complete! Migrated ${importedSaved} saved songs and ${importedPlaylists} playlists to your cloud account.`,
        importedSaved,
        importedPlaylists
      };
    },

    getHistory() {
      return GroicLocalLibrary.getHistory();
    },

    addToHistory(track) {
      return GroicLocalLibrary.addToHistory(track);
    },

    clearHistory() {
      return GroicLocalLibrary.clearHistory();
    }
  };
})();
