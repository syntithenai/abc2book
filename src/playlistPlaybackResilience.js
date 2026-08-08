import {
  isQueueActive,
  getCurrentItem,
  advanceQueue,
  resolvePlaybackForItem,
  isExternalQueueItem,
} from './nowPlayingQueue'
import {
  isNavigatorOffline,
  isTuneOfflinePlayable,
} from './offlinePlayback'
import {
  isLinkMediaCached,
  isOwnedMediaLink,
  getRecording,
  parseRecordingIdFromLinkUri,
} from './linkRecording'
import { cancelPlaylistTitleAnnouncement } from './playlistTitleAnnouncement'
import { isBackgroundCapablePlayback } from './backgroundPlaybackCapability'
import { prefersNativeMediaPlayback } from './platformUtils'
import { getPlaybackSettings } from './pitchTempoUtils'
import { stopStandaloneMediaPlayback } from './standaloneMediaPlayback'

export function isQueueItemPlayable(tune, item, tunebook) {
  if (isExternalQueueItem(item)) return true
  return !!resolvePlaybackForItem(tune, item, tunebook)
}

export function isQueueItemBackgroundCapable(tune, item, tunebook, options) {
  const opts = options || {}
  if (!prefersNativeMediaPlayback()) return true
  if (isExternalQueueItem(item)) return true
  const target = resolvePlaybackForItem(tune, item, tunebook)
  if (!target) return false
  const routeMode = target.type === 'midi' ? 'midi' : 'media'
  const playback = getPlaybackSettings(tune)
  const settings = Object.assign({}, playback, {
    audioFilters: tune && tune.playbackAudioFilters ? tune.playbackAudioFilters : playback.audioFilters,
  })
  return isBackgroundCapablePlayback({
    routeMode: routeMode,
    srcType: target.srcType || '',
    settings: settings,
    hasNativeAbcCache: routeMode === 'midi',
    hasNativeMidiCache: target.srcType === 'midifile',
    pitchPathOptions: opts.pitchPathOptions || {},
    nativeActive: false,
    hasPreRenderedBlob: false,
  })
}

export async function isOwnedMediaLinkLocallyAvailable(tune, linkIndex) {
  if (!tune || !Array.isArray(tune.links)) return true
  const idx = parseInt(linkIndex, 10)
  if (isNaN(idx) || idx < 0 || idx >= tune.links.length) return true
  const link = tune.links[idx]
  if (!isOwnedMediaLink(link)) return true
  if (await isLinkMediaCached(tune, linkIndex)) return true
  const recordingId = link.recordingId || parseRecordingIdFromLinkUri(link.link)
  if (recordingId) {
    const recording = await getRecording(recordingId)
    if (recording) return true
  }
  if (link.googleId) return true
  return false
}

export async function isQueueItemFullyPlayable(tune, item, tunebook, options) {
  const opts = options || {}
  if (!isQueueItemPlayable(tune, item, tunebook)) return false
  const target = resolvePlaybackForItem(tune, item, tunebook)
  if (!isNavigatorOffline()) {
    if (target && target.type === 'media') {
      const linkIndex = target.linkNum != null ? target.linkNum : 0
      return isOwnedMediaLinkLocallyAvailable(tune, linkIndex)
    }
    return true
  }
  return isTuneOfflinePlayable(
    tune,
    target,
    tunebook,
    opts.isYoutubeLink,
    opts.playbackMode
  )
}

export function findFirstPlayableQueueIndex(queue, tunes, tunebook) {
  if (!isQueueActive(queue)) return -1
  for (let i = 0; i < queue.items.length; i++) {
    const item = queue.items[i]
    if (isExternalQueueItem(item)) return i
    const tune = item && item.tuneId && tunes ? tunes[item.tuneId] : null
    if (isQueueItemPlayable(tune, item, tunebook)) {
      return i
    }
  }
  return -1
}

/**
 * Walk the queue in the given direction until a playable item is found.
 * When offline, also requires cached/offline-ready media.
 */
export async function advanceQueueToNextPlayable(queue, tunes, tunebook, options) {
  const opts = options || {}
  const direction = opts.direction >= 0 ? 1 : -1
  const isYoutubeLink = opts.isYoutubeLink
  const playbackMode = opts.playbackMode || 'auto'
  const advanceFirst = opts.advanceFirst !== false
  const wrapManual = !!opts.wrapManualNavigation
  const advanceOpts = wrapManual ? { wrap: true } : undefined

  if (!isQueueActive(queue)) {
    return { queue: queue, tune: null, item: null, atEnd: true, skipped: 0 }
  }

  let workingQueue = queue
  let skipped = 0

  if (advanceFirst) {
    const stepped = advanceQueue(workingQueue, direction, advanceOpts)
    if (stepped.atEdge) {
      return { queue: workingQueue, tune: null, item: null, atEnd: true, skipped: 0 }
    }
    workingQueue = stepped.queue
  }

  const maxAttempts = queue.items.length

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const item = getCurrentItem(workingQueue)
    if (isExternalQueueItem(item)) {
      return { queue: workingQueue, tune: null, item: item, atEnd: false, skipped: skipped }
    }
    const tune = item && item.tuneId && tunes ? tunes[item.tuneId] : null
    if (!item) {
      return { queue: workingQueue, tune: null, item: null, atEnd: true, skipped: skipped }
    }

    const playable = await isQueueItemFullyPlayable(tune, item, tunebook, {
      isYoutubeLink: isYoutubeLink,
      playbackMode: playbackMode,
    })
    if (playable) {
      return { queue: workingQueue, tune: tune, item: item, atEnd: false, skipped: skipped }
    }

    skipped += 1
    const stepped = advanceQueue(workingQueue, direction, advanceOpts)
    if (stepped.atEdge) {
      return { queue: workingQueue, tune: null, item: null, atEnd: true, skipped: skipped }
    }
    workingQueue = stepped.queue
  }

  return { queue: workingQueue, tune: null, item: null, atEnd: true, skipped: skipped }
}

export function stopPlaylistPlayback(mediaController) {
  cancelPlaylistTitleAnnouncement()
  stopStandaloneMediaPlayback().catch(function() {})
  if (!mediaController) return
  if (mediaController.abortPlayingIntent) {
    mediaController.abortPlayingIntent()
  }
  if (mediaController.pause) {
    mediaController.pause()
  }
  if (mediaController.setIsLoading) {
    mediaController.setIsLoading(false)
  }
  if (mediaController.setIsPlaying) {
    mediaController.setIsPlaying(false)
  }
  if (mediaController.setIsReady) {
    mediaController.setIsReady(false)
  }
  if (mediaController.clearPlaylistStall) {
    mediaController.clearPlaylistStall()
  }
}
