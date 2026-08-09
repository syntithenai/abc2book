import { toast } from 'react-toastify'
import { isMediaCacheLocked } from './mediaCacheLock'
import { shouldShowBulkOperationProgress } from './bulkOperationProgress'

function buildClearDetail(action, result, skippedLocked) {
  let detail
  if (action === 'clear-all') {
    const audioRemoved = result && result.audioAndStems && result.audioAndStems.audio
      ? (result.audioAndStems.audio.removed || 0)
      : 0
    const stemsRemoved = result && result.audioAndStems && result.audioAndStems.stems
      ? (result.audioAndStems.stems.removed || 0)
      : 0
    const midiRemoved = result && result.midi && result.midi.removed != null
      ? result.midi.removed
      : 0
    detail = 'Removed ' + audioRemoved + ' audio, ' + stemsRemoved + ' stem, and '
      + midiRemoved + ' MIDI cache entr'
      + ((audioRemoved + stemsRemoved + midiRemoved) === 1 ? 'y' : 'ies')
      + ' for selected tunes.'
  } else {
    const removed = result && result.removed != null ? result.removed : 0
    const label = action === 'clear-stems' ? 'stem' : (action === 'clear-midi' ? 'MIDI' : 'audio')
    detail = 'Removed ' + removed + ' ' + label + ' cache entr' + (removed === 1 ? 'y' : 'ies')
      + ' for selected tunes.'
  }
  if (skippedLocked > 0 && action !== 'clear-midi') {
    detail += ' Skipped ' + skippedLocked + ' locked tune' + (skippedLocked === 1 ? '' : 's') + '.'
  }
  return detail
}

async function clearCacheChunk(utils, action, chunkIds, clearOptions) {
  if (action === 'clear-audio') {
    return utils.clearDownloadedAudioCacheForTunes(chunkIds, clearOptions)
  }
  if (action === 'clear-stems') {
    return utils.clearStemsCacheForTunes(chunkIds, clearOptions)
  }
  if (action === 'clear-midi') {
    return utils.clearMidiCacheForTunes(chunkIds)
  }
  if (action === 'clear-all') {
    const results = await Promise.all([
      utils.clearAudioAndStemsCacheForTunes(chunkIds, clearOptions),
      utils.clearMidiCacheForTunes(chunkIds),
    ])
    return {
      audioAndStems: results[0],
      midi: results[1],
    }
  }
  return null
}

function mergeClearResults(action, left, right) {
  if (!left) return right
  if (!right) return left
  if (action === 'clear-all') {
    return {
      audioAndStems: {
        audio: {
          removed: (left.audioAndStems && left.audioAndStems.audio ? left.audioAndStems.audio.removed || 0 : 0)
            + (right.audioAndStems && right.audioAndStems.audio ? right.audioAndStems.audio.removed || 0 : 0),
        },
        stems: {
          removed: (left.audioAndStems && left.audioAndStems.stems ? left.audioAndStems.stems.removed || 0 : 0)
            + (right.audioAndStems && right.audioAndStems.stems ? right.audioAndStems.stems.removed || 0 : 0),
        },
      },
      midi: {
        removed: (left.midi && left.midi.removed != null ? left.midi.removed : 0)
          + (right.midi && right.midi.removed != null ? right.midi.removed : 0),
      },
    }
  }
  return {
    removed: (left.removed != null ? left.removed : 0) + (right.removed != null ? right.removed : 0),
  }
}

/**
 * Apply a bulk cache action for selected tunes.
 * action: 'save' | 'clear-audio' | 'clear-stems' | 'clear-midi' | 'clear-all'
 */
export async function applyBulkCacheAction(options) {
  const opts = options || {}
  const action = opts.action
  const tunes = Array.isArray(opts.tunes) ? opts.tunes : []
  const tuneIds = Array.isArray(opts.tuneIds)
    ? opts.tuneIds
    : tunes.map(function(tune) { return tune && tune.id }).filter(Boolean)
  const tunebook = opts.tunebook
  const token = opts.token
  const mediaCacheQueue = opts.mediaCacheQueue
  const bulkProgress = opts.bulkProgress
  const onOpenMediaCacheQueue = opts.onOpenMediaCacheQueue

  if (!action || !tunebook || !tuneIds.length) {
    return null
  }

  if (action === 'save') {
    if (!mediaCacheQueue || typeof mediaCacheQueue.enqueueTunesCacheJobs !== 'function') {
      toast.error('Cache save is not available.')
      return null
    }
    mediaCacheQueue.enqueueTunesCacheJobs(tunes, {
      utils: tunebook.utils,
      accessToken: token && token.access_token ? token.access_token : token || null,
    })
    if (typeof mediaCacheQueue.start === 'function') mediaCacheQueue.start()
    if (typeof onOpenMediaCacheQueue === 'function') {
      onOpenMediaCacheQueue()
    }
    toast.success(
      'Queued cache save for ' + tunes.length + ' tune' + (tunes.length === 1 ? '' : 's') + '.'
    )
    return { action: 'save', count: tunes.length }
  }

  const utils = tunebook.utils
  if (!utils) {
    toast.error('Cache clear is not available.')
    return null
  }

  const lockedTuneIds = {}
  tunes.forEach(function(tune) {
    if (isMediaCacheLocked(tune)) lockedTuneIds[tune.id] = true
  })
  const clearOptions = {
    respectLock: true,
    lockedTuneIds: lockedTuneIds,
  }
  const skippedLocked = tuneIds.filter(function(tuneId) {
    return lockedTuneIds[tuneId]
  }).length

  async function runClear(ids) {
    let merged = null
    if (shouldShowBulkOperationProgress(ids.length) && bulkProgress && typeof bulkProgress.run === 'function') {
      await bulkProgress.run({
        items: ids,
        title: 'Clearing cache',
        messageForIndex: function(current, total) {
          return 'Clearing cache for tune ' + current + ' of ' + total
        },
        processChunk: async function(chunk) {
          const chunkResult = await clearCacheChunk(utils, action, chunk, clearOptions)
          merged = mergeClearResults(action, merged, chunkResult)
        },
      })
    } else {
      merged = await clearCacheChunk(utils, action, ids, clearOptions)
    }
    return merged
  }

  try {
    const result = await runClear(tuneIds)
    const detail = buildClearDetail(action, result, skippedLocked)
    toast.success(detail)
    return { action: action, result: result }
  } catch (err) {
    toast.error('Could not clear cache for selected tunes.')
    return null
  }
}
