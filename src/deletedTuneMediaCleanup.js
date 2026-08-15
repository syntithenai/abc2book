/**
 * Clear per-tune cached media when tunes are deleted.
 * Does not respect mediaCacheLocked — the tune is gone, so orphans must go too.
 */
import {
  clearAudioCacheForTuneIds,
  clearStemCacheForTuneIds,
  clearMidiCacheForTuneIds,
  clearExternalMediaCacheForTuneIdAndSrcs,
} from './mediaCacheStorage'
import { clearTimedMediaDraft } from './timedMediaCache'
import { removeJobsForTuneIds, removeJobsForTuneIdAndSrcs } from './mediaCacheQueue'

function normalizeTuneIds(tuneIds) {
  const ids = []
  const seen = {}
  ;(tuneIds || []).forEach(function(id) {
    if (id == null || id === '') return
    const key = String(id)
    if (seen[key]) return
    seen[key] = true
    ids.push(key)
  })
  return ids
}

/**
 * Cancel pending cache jobs and remove audio, stem, MIDI, and timed-media
 * draft cache entries for the given tune ids.
 */
export function clearCachedMediaForDeletedTuneIds(tuneIds) {
  const ids = normalizeTuneIds(tuneIds)
  if (!ids.length) {
    return Promise.resolve({
      audio: { removed: 0 },
      stems: { removed: 0 },
      midi: { removed: 0 },
    })
  }

  removeJobsForTuneIds(ids)

  try {
    const backup = require('./mediaCacheDriveBackup')
    if (backup && typeof backup.enqueueCachedMediaDriveDeletesForTuneIds === 'function') {
      Promise.resolve(backup.enqueueCachedMediaDriveDeletesForTuneIds(ids)).catch(function() {})
    }
  } catch (e) {}

  return Promise.all([
    clearAudioCacheForTuneIds(ids),
    clearStemCacheForTuneIds(ids),
    clearMidiCacheForTuneIds(ids),
    Promise.all(ids.map(function(id) {
      return Promise.resolve(clearTimedMediaDraft(id)).catch(function() {})
    })),
  ]).then(function(results) {
    return {
      audio: results[0] || { removed: 0 },
      stems: results[1] || { removed: 0 },
      midi: results[2] || { removed: 0 },
    }
  })
}

/**
 * Clear local cache and this account's CachedMedia Drive copies for removed link URIs.
 */
export function clearCachedMediaForRemovedLinkSrcs(tuneId, srcs) {
  const id = tuneId == null ? '' : String(tuneId)
  const list = []
  const seen = {}
  ;(srcs || []).forEach(function(src) {
    if (!src) return
    const key = String(src)
    if (seen[key]) return
    seen[key] = true
    list.push(key)
  })
  if (!id || !list.length) {
    return Promise.resolve({ removed: 0 })
  }

  removeJobsForTuneIdAndSrcs(id, list)

  try {
    const backup = require('./mediaCacheDriveBackup')
    if (backup && typeof backup.enqueueCachedMediaDriveDeletesForSrcs === 'function') {
      Promise.resolve(backup.enqueueCachedMediaDriveDeletesForSrcs(id, list)).catch(function() {})
    }
  } catch (e) {}

  return clearExternalMediaCacheForTuneIdAndSrcs(id, list)
}
