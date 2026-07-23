import {
  isQueueActive,
  getCurrentItem,
  advanceQueue,
  resolvePlaybackForItem,
} from './nowPlayingQueue'
import {
  isNavigatorOffline,
  isTuneOfflinePlayable,
} from './offlinePlayback'

export function isQueueItemPlayable(tune, item, tunebook) {
  return !!resolvePlaybackForItem(tune, item, tunebook)
}

export async function isQueueItemFullyPlayable(tune, item, tunebook, options) {
  const opts = options || {}
  if (!isQueueItemPlayable(tune, item, tunebook)) return false
  if (!isNavigatorOffline()) return true
  const target = resolvePlaybackForItem(tune, item, tunebook)
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

  if (!isQueueActive(queue)) {
    return { queue: queue, tune: null, item: null, atEnd: true, skipped: 0 }
  }

  let workingQueue = queue
  let skipped = 0

  if (advanceFirst) {
    const stepped = advanceQueue(workingQueue, direction)
    if (stepped.atEdge) {
      return { queue: workingQueue, tune: null, item: null, atEnd: true, skipped: 0 }
    }
    workingQueue = stepped.queue
  }

  const maxAttempts = queue.items.length

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const item = getCurrentItem(workingQueue)
    const tune = item && item.tuneId && tunes ? tunes[item.tuneId] : null
    if (!tune || !item) {
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
    const stepped = advanceQueue(workingQueue, direction)
    if (stepped.atEdge) {
      return { queue: workingQueue, tune: null, item: null, atEnd: true, skipped: skipped }
    }
    workingQueue = stepped.queue
  }

  return { queue: workingQueue, tune: null, item: null, atEnd: true, skipped: skipped }
}

export function stopPlaylistPlayback(mediaController) {
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
