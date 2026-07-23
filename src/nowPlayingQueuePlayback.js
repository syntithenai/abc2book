import {
  isQueueActive,
  getCurrentItem,
  getCurrentTuneId,
  endPreviewOnce,
  resolvePlaybackForItem,
  buildPlaybackPath,
  shouldSuppressFollowNavigate,
} from './nowPlayingQueue'
import { isQueuePlaybackEngaged } from './playbackNavigationUtils'
import {
  advanceQueueToNextPlayable,
  isQueueItemPlayable,
  stopPlaylistPlayback,
} from './playlistPlaybackResilience'

export function playQueueItem(mediaController, tunebook, tune, item, options) {
  if (!mediaController || !tunebook || !tune || !item) return false
  const target = resolvePlaybackForItem(tune, item, tunebook)
  if (!target) return false

  mediaController.setTune(tune)
  if (target.type === 'midi') {
    mediaController.setMediaLinkNumber(null)
    if (mediaController.applyPlaybackRoute) {
      mediaController.applyPlaybackRoute('playMidi', null, tune, tunebook)
    }
  } else {
    mediaController.setMediaLinkNumber(target.linkNum)
    if (mediaController.applyPlaybackRoute) {
      mediaController.applyPlaybackRoute('playMedia', String(target.linkNum != null ? target.linkNum : 0), tune, tunebook)
    }
  }

  const opts = options || {}
  if (opts.deferPlaybackEngine) {
    if (mediaController.armPlaybackIntent) {
      mediaController.armPlaybackIntent({ fresh: true })
    } else {
      mediaController.play({ fresh: true })
    }
    return true
  }
  if (opts.fromUserGesture && mediaController.playFromUserGesture) {
    mediaController.playFromUserGesture({ fresh: true })
  } else if (mediaController.play) {
    mediaController.play({ fresh: true })
  }
  return true
}

export function playCurrentQueueItem(mediaController, tunebook, tunes, queue, options) {
  if (!isQueueActive(queue)) return false
  const item = getCurrentItem(queue)
  if (!item) return false
  const tune = tunes && item.tuneId ? tunes[item.tuneId] : null
  if (!tune) return false
  if (!isQueueItemPlayable(tune, item, tunebook)) return false
  return playQueueItem(mediaController, tunebook, tune, item, options)
}

export function navigateToQueueTune(navigate, tuneId, item, tunebook, tunes) {
  if (!navigate || !tuneId) return
  const tune = tunes && tunes[tuneId] ? tunes[tuneId] : null
  const target = tune && item ? resolvePlaybackForItem(tune, item, tunebook) : null
  const path = target ? buildPlaybackPath(tuneId, target) : '/tunes/' + tuneId
  navigate(path)
}

function syncQueueIndex(queue, currentPlayingTuneId) {
  let syncIndex = queue.currentIndex
  if (currentPlayingTuneId) {
    const found = queue.items.findIndex(function(item) {
      return item && item.tuneId === currentPlayingTuneId
    })
    if (found !== -1) syncIndex = found
  }
  return Object.assign({}, queue, { currentIndex: syncIndex })
}

function finishQueueAdvance(params, nextQueue, item, tune) {
  const {
    setQueue,
    tunes,
    tunebook,
    mediaController,
    navigate,
    location,
    setPlaylist,
    practiceSessionActive,
    failCallback,
    playbackOptions,
  } = params

  if (!tune || !item || !mediaController || !setQueue) {
    stopPlaylistPlayback(mediaController)
    if (failCallback) failCallback('end')
    return false
  }

  if (!isQueueItemPlayable(tune, item, tunebook)) {
    stopPlaylistPlayback(mediaController)
    if (failCallback) failCallback('end')
    return false
  }

  setQueue(nextQueue)
  const started = playQueueItem(mediaController, tunebook, tune, item, playbackOptions || { deferPlaybackEngine: true })
  if (!started) {
    stopPlaylistPlayback(mediaController)
    if (failCallback) failCallback('end')
    return false
  }

  const shouldFollow = nextQueue.followTune && navigate && !shouldSuppressFollowNavigate({
    pathname: location && location.pathname,
    setPlaylist: setPlaylist,
    practiceSessionActive: practiceSessionActive,
  })
  if (shouldFollow) {
    navigateToQueueTune(navigate, item.tuneId, item, tunebook, tunes)
  }
  return true
}

/**
 * Advance the queue to the next playable item and start playback.
 * Used by track-end, error skip, and manual next/prev (via options.direction).
 */
export async function advanceQueueToPlayableAndStart(params) {
  const {
    queue,
    setQueue,
    tunes,
    tunebook,
    mediaController,
    failCallback,
    currentPlayingTuneId,
    playbackMode,
    isYoutubeLink,
    direction,
    advanceFirst,
    playbackOptions,
  } = params || {}

  if (!isQueueActive(queue) || !setQueue) {
    if (failCallback) failCallback()
    return false
  }

  const synced = syncQueueIndex(queue, currentPlayingTuneId)
  const result = await advanceQueueToNextPlayable(synced, tunes, tunebook, {
    direction: direction != null ? direction : 1,
    advanceFirst: advanceFirst !== false,
    isYoutubeLink: isYoutubeLink,
    playbackMode: playbackMode,
  })

  if (result.atEnd || !result.tune || !result.item) {
    stopPlaylistPlayback(mediaController)
    if (failCallback) failCallback('end')
    return false
  }

  return finishQueueAdvance(params, result.queue, result.item, result.tune)
}

export function handleQueueAdvanceOnEnded(params) {
  const {
    queue,
    setQueue,
    tunes,
    tunebook,
    mediaController,
    navigate,
    location,
    setPlaylist,
    practiceSessionActive,
    failCallback,
  } = params || {}

  if (!isQueueActive(queue) || !setQueue) {
    if (failCallback) failCallback()
    return false
  }

  if (queue.previewOnce) {
    const restored = endPreviewOnce(queue)
    setQueue(restored)
    const item = getCurrentItem(restored)
    const tune = item && tunes ? tunes[item.tuneId] : null
    if (tune && mediaController && isQueueItemPlayable(tune, item, tunebook)) {
      playQueueItem(mediaController, tunebook, tune, item, {})
      if (restored.followTune && navigate && !shouldSuppressFollowNavigate({
        pathname: location && location.pathname,
        setPlaylist: setPlaylist,
        practiceSessionActive: practiceSessionActive,
      })) {
        navigateToQueueTune(navigate, item.tuneId, item, tunebook, tunes)
      }
    } else {
      stopPlaylistPlayback(mediaController)
    }
    return true
  }

  if (!queue.autoAdvance) {
    if (failCallback) failCallback()
    return false
  }

  advanceQueueToPlayableAndStart(params)
  return true
}

export function isViewingDifferentFromPlaying(viewedTuneId, queue) {
  if (!isQueueActive(queue)) return false
  const playingId = getCurrentTuneId(queue)
  return !!(playingId && viewedTuneId && playingId !== viewedTuneId)
}

/**
 * Whether MusicSingle should mount the media/midi engine.
 *
 * Playback engines live in NowPlayingHost (App-level) so list↔single navigation
 * does not unmount/remount them and restart the current tune. MusicSingle only
 * owns the engine for preview-once of a non-current queue item.
 */
export function shouldMusicSingleOwnPlayback(viewedTuneId, queue) {
  if (!viewedTuneId) return false
  if (isQueueActive(queue) && queue.previewOnce && queue.previewOnce.tuneId === viewedTuneId) {
    return true
  }
  return false
}

export function parseTunePagePlaybackFromUrl(pathname) {
  if (!pathname) return null
  if (pathname.indexOf('/playMidi') >= 0) {
    return { playState: 'playMidi', mediaLinkNumber: '0' }
  }
  if (pathname.indexOf('/playMedia') >= 0) {
    const parts = pathname.split('/playMedia/')
    const parsed = parts.length > 1 ? parseInt(parts[1], 10) : 0
    const linkNum = !isNaN(parsed) ? parsed : 0
    return { playState: 'playMedia', mediaLinkNumber: String(linkNum) }
  }
  return null
}

export function isMediaControllerPlaybackActive(mediaController) {
  if (!mediaController) return false
  return !!(
    (mediaController.hasActivePlaybackIntent && mediaController.hasActivePlaybackIntent())
    || (mediaController.canResumePlayback && mediaController.canResumePlayback())
    || mediaController.playbackRouteMode === 'media'
    || mediaController.playbackRouteMode === 'midi'
    || mediaController.requestedPlayState === 'playMedia'
    || mediaController.requestedPlayState === 'playMidi'
    || mediaController.isPlaying
    || mediaController.isLoading
  )
}

export function resolveHostPlayingTuneId({ queue, mediaController, viewedTuneId, pathname }) {
  if (isQueueActive(queue)) {
    return getCurrentTuneId(queue)
  }
  if (mediaController && mediaController.tune && mediaController.tune.id) {
    return mediaController.tune.id
  }
  const urlPlayback = parseTunePagePlaybackFromUrl(pathname)
  if (urlPlayback && viewedTuneId) {
    return viewedTuneId
  }
  return null
}

/**
 * Whether the app-level NowPlayingHost should mount the shared media/midi engine.
 */
export function shouldNowPlayingHostOwnPlayback(opts) {
  const {
    viewedTuneId,
    queue,
    mediaController,
    practiceSessionActive,
    gigModeActive,
    pathname,
    tunes,
  } = opts || {}

  if (practiceSessionActive || gigModeActive) return false
  if (shouldMusicSingleOwnPlayback(viewedTuneId, queue)) return false

  const playingTuneId = resolveHostPlayingTuneId({
    queue: queue,
    mediaController: mediaController,
    viewedTuneId: viewedTuneId,
    pathname: pathname,
  })
  if (!playingTuneId) return false
  if (tunes && !tunes[playingTuneId]) return false

  const urlPlayback = parseTunePagePlaybackFromUrl(pathname)
  if (urlPlayback) return true
  if (isQueueActive(queue)) {
    return isQueuePlaybackEngaged(mediaController)
  }
  return isMediaControllerPlaybackActive(mediaController)
}

/**
 * Whether MusicSingle's Abc notation view should own the shared MIDI engine.
 * Same rule as preview-once media ownership: normal playback uses NowPlayingHost.
 */
export function shouldMusicSingleOwnMidiEngine(viewedTuneId, queue) {
  return shouldMusicSingleOwnPlayback(viewedTuneId, queue)
}

/**
 * Whether MusicSingle should mount MediaPlayerMedia (only when no other host owns it).
 */
export function shouldMusicSingleMountMediaEngine(opts) {
  const o = opts || {}
  if (o.practiceSessionActive) return false
  if (shouldMusicSingleOwnPlayback(o.viewedTuneId, o.queue)) return true
  return !shouldNowPlayingHostOwnPlayback(o)
}
