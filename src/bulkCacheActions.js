import { toast } from 'react-toastify'
import { isMediaCacheLocked } from './mediaCacheLock'

/**
 * Apply a bulk cache action for selected tunes.
 * action: 'save' | 'clear-audio' | 'clear-stems' | 'clear-midi' | 'clear-all'
 */
export function applyBulkCacheAction(options) {
  const opts = options || {}
  const action = opts.action
  const tunes = Array.isArray(opts.tunes) ? opts.tunes : []
  const tuneIds = Array.isArray(opts.tuneIds)
    ? opts.tuneIds
    : tunes.map(function(tune) { return tune && tune.id }).filter(Boolean)
  const tunebook = opts.tunebook
  const token = opts.token
  const mediaCacheQueue = opts.mediaCacheQueue

  if (!action || !tunebook || !tuneIds.length) {
    return Promise.resolve(null)
  }

  if (action === 'save') {
    if (!mediaCacheQueue || typeof mediaCacheQueue.enqueueTunesCacheJobs !== 'function') {
      toast.error('Cache save is not available.')
      return Promise.resolve(null)
    }
    mediaCacheQueue.enqueueTunesCacheJobs(tunes, {
      utils: tunebook.utils,
      accessToken: token && token.access_token ? token.access_token : token || null,
    })
    if (typeof mediaCacheQueue.start === 'function') mediaCacheQueue.start()
    toast.success(
      'Queued cache save for ' + tunes.length + ' tune' + (tunes.length === 1 ? '' : 's') + '.'
    )
    return Promise.resolve({ action: 'save', count: tunes.length })
  }

  const utils = tunebook.utils
  if (!utils) {
    toast.error('Cache clear is not available.')
    return Promise.resolve(null)
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

  let clearPromise
  if (action === 'clear-audio') {
    clearPromise = utils.clearDownloadedAudioCacheForTunes(tuneIds, clearOptions)
  } else if (action === 'clear-stems') {
    clearPromise = utils.clearStemsCacheForTunes(tuneIds, clearOptions)
  } else if (action === 'clear-midi') {
    clearPromise = utils.clearMidiCacheForTunes(tuneIds)
  } else if (action === 'clear-all') {
    clearPromise = Promise.all([
      utils.clearAudioAndStemsCacheForTunes(tuneIds, clearOptions),
      utils.clearMidiCacheForTunes(tuneIds),
    ]).then(function(results) {
      return {
        audioAndStems: results[0],
        midi: results[1],
      }
    })
  } else {
    return Promise.resolve(null)
  }

  return Promise.resolve(clearPromise).then(function(result) {
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
    toast.success(detail)
    return { action: action, result: result }
  }).catch(function() {
    toast.error('Could not clear cache for selected tunes.')
    return null
  })
}
