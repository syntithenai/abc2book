import { isQueueActive, removeTunesFromQueue } from './nowPlayingQueue'
import { removeTunesFromAllSavedPlaylists } from './savedPlaylistsStore'

/** Drop deleted tune ids from the active queue and saved playlists. */
export function pruneDeletedTunesFromPlaylists(tuneIds, nowPlayingQueue, setNowPlayingQueue) {
  const ids = Array.isArray(tuneIds) ? tuneIds.filter(Boolean) : []
  if (!ids.length) return

  if (typeof setNowPlayingQueue === 'function' && isQueueActive(nowPlayingQueue)) {
    const next = removeTunesFromQueue(nowPlayingQueue, ids)
    if (next !== nowPlayingQueue) {
      setNowPlayingQueue(next)
    }
  }

  removeTunesFromAllSavedPlaylists(ids)
}
