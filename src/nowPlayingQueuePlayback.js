import {
  isQueueActive,
  getCurrentItem,
  getCurrentTuneId,
  endPreviewOnce,
  resolvePlaybackForItem,
  buildPlaybackPath,
  shouldSuppressFollowNavigate,
  isExternalQueueItem,
  isLessonExternalMedia,
  isRepeatTrack,
} from './nowPlayingQueue'
import {
  isQueuePlaybackEngaged,
  getViewedTuneIdFromPath,
  isTuneListPath,
  isPlaybackBrowsePath,
} from './playbackNavigationUtils'
import {
  advanceQueueToNextPlayable,
  isQueueItemPlayable,
  stopPlaylistPlayback,
} from './playlistPlaybackResilience'
import { advanceQueueAfterPlaybackFailure } from './playlistPlaybackSkip'
import { playLessonYoutube } from './lessonYoutubePlayer'
import { playExternalMediaItem } from './standaloneMediaPlayback'
import { announcePlaylistTrack } from './playlistTitleAnnouncement'

/** Merge persisted tunes with any in-memory tunebook map (e.g. freshly materialized mymedia). */
export function resolveQueueTunesMap(tunes, tunebook) {
  const bookTunes = tunebook && tunebook.tunes ? tunebook.tunes : null
  if (!bookTunes) return tunes || {}
  return Object.assign({}, bookTunes, tunes || {})
}

export function resolveQueueTune(tunes, tunebook, tuneId) {
  if (!tuneId) return null
  const map = resolveQueueTunesMap(tunes, tunebook)
  return map[tuneId] || map[String(tuneId)] || null
}

export function playQueueItem(mediaController, tunebook, tune, item, options) {
  if (!mediaController || !item) return false
  if (isExternalQueueItem(item)) {
    return false
  }
  if (!tunebook || !tune) return false
  const target = resolvePlaybackForItem(tune, item, tunebook)
  if (!target) return false

  const opts = options || {}
  // Arm kickoff before route/tune commits so MediaPlayerMedia does not replay the
  // previous track while the next queue item is still loading.
  if (opts.deferPlaybackEngine && mediaController.armPlaybackIntent) {
    mediaController.armPlaybackIntent({ fresh: true })
  }

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

  if (opts.deferPlaybackEngine) {
    if (!mediaController.armPlaybackIntent) {
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
  if (isExternalQueueItem(item)) return true
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

function retryQueueAdvanceAfterFailure(params, reason) {
  const queue = params && params.queue
  if (!isQueueActive(queue) || !queue.autoAdvance) {
    stopPlaylistPlayback(params.mediaController)
    if (params.failCallback) params.failCallback(reason || 'end')
    return false
  }
  advanceQueueToPlayableAndStart(Object.assign({}, params, {
    advanceFirst: true,
    failCallback: params.failCallback,
  }))
  return false
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

  if (!item || !mediaController || !setQueue) {
    stopPlaylistPlayback(mediaController)
    if (failCallback) failCallback('end')
    return false
  }

  if (isExternalQueueItem(item)) {
    setQueue(nextQueue)
    const externalMedia = item.externalMedia
    if (isLessonExternalMedia(externalMedia)) {
      playLessonYoutube({ fromUserGesture: true })
      return true
    }
    playExternalMediaItem(externalMedia, mediaController, {
      play: true,
      fromUserGesture: !!(playbackOptions && playbackOptions.fromUserGesture),
    }).catch(function() {
      retryQueueAdvanceAfterFailure(Object.assign({}, params, { queue: nextQueue }), 'end')
    })
    return true
  }

  if (!tune || !tunebook) {
    return retryQueueAdvanceAfterFailure(Object.assign({}, params, { queue: nextQueue }), 'end')
  }

  if (!isQueueItemPlayable(tune, item, tunebook)) {
    return retryQueueAdvanceAfterFailure(Object.assign({}, params, { queue: nextQueue }), 'end')
  }

  setQueue(nextQueue)
  const started = playQueueItem(mediaController, tunebook, tune, item, playbackOptions || { deferPlaybackEngine: true })
  if (!started) {
    return retryQueueAdvanceAfterFailure(Object.assign({}, params, { queue: nextQueue }), 'end')
  }

  announcePlaylistTrack(tune)

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

  const tunesMap = resolveQueueTunesMap(tunes, tunebook)
  const synced = syncQueueIndex(queue, currentPlayingTuneId)
  const result = await advanceQueueToNextPlayable(synced, tunesMap, tunebook, {
    direction: direction != null ? direction : 1,
    advanceFirst: advanceFirst !== false,
    isYoutubeLink: isYoutubeLink,
    playbackMode: playbackMode,
  })

  if (result.atEnd || !result.item) {
    if (queue && queue.autoAdvance) {
      const skipResult = await advanceQueueAfterPlaybackFailure(queue, tunesMap, tunebook, {
        isYoutubeLink: isYoutubeLink,
        playbackMode: playbackMode,
      })
      if (!skipResult.atEnd && skipResult.item) {
        if (isExternalQueueItem(skipResult.item)) {
          return finishQueueAdvance(params, skipResult.queue, skipResult.item, null)
        }
        if (!skipResult.tune) {
          stopPlaylistPlayback(mediaController)
          if (failCallback) failCallback('end')
          return false
        }
        return finishQueueAdvance(params, skipResult.queue, skipResult.item, skipResult.tune)
      }
    }
    stopPlaylistPlayback(mediaController)
    if (failCallback) failCallback('end')
    return false
  }

  if (isExternalQueueItem(result.item)) {
    return finishQueueAdvance(params, result.queue, result.item, null)
  }

  if (!result.tune) {
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

  if (isRepeatTrack(queue)) {
    const item = getCurrentItem(queue)
    if (!item) {
      if (failCallback) failCallback()
      return false
    }
    const tune = item.tuneId && tunes ? tunes[item.tuneId] : null
    if (isExternalQueueItem(item)) {
      return finishQueueAdvance(params, queue, item, null)
    }
    if (!tune || !tunebook || !isQueueItemPlayable(tune, item, tunebook)) {
      stopPlaylistPlayback(mediaController)
      if (failCallback) failCallback('end')
      return false
    }
    return finishQueueAdvance(params, queue, item, tune)
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
  if (mediaController.isPlaying || mediaController.isLoading) return true
  if (mediaController.hasActivePlaybackIntent && mediaController.hasActivePlaybackIntent()) {
    return true
  }
  if (mediaController.canResumePlayback && mediaController.canResumePlayback()) {
    return true
  }
  if (mediaController.requestedPlayState === 'playMedia'
    || mediaController.requestedPlayState === 'playMidi') {
    return true
  }
  return false
}

function isQueueOutputting(mediaController) {
  if (!mediaController) return false
  return !!(
    mediaController.isPlaying
    || mediaController.isLoading
    || (mediaController.hasActivePlaybackIntent && mediaController.hasActivePlaybackIntent())
  )
}

/** Prefer mediaController.tune when it matches the active host tune (fresher links). */
export function resolveHostPlayingTune(hostPlayingTuneId, tunes, mediaController) {
  if (!hostPlayingTuneId) return null
  const storeTune = tunes && tunes[hostPlayingTuneId] ? tunes[hostPlayingTuneId] : null
  const controllerTune = mediaController && mediaController.tune
    && String(mediaController.tune.id) === String(hostPlayingTuneId)
    ? mediaController.tune
    : null
  if (controllerTune) return controllerTune
  return storeTune
}

export function resolveHostPlayingTuneId({ queue, mediaController, viewedTuneId, pathname }) {
  const urlPlayback = parseTunePagePlaybackFromUrl(pathname)
  const pathTuneId = viewedTuneId || getViewedTuneIdFromPath(pathname)

  const controllerTuneId = mediaController && mediaController.tune && mediaController.tune.id
    ? mediaController.tune.id
    : null

  if (isQueueActive(queue)) {
    const item = getCurrentItem(queue)
    if (isExternalQueueItem(item) && !isLessonExternalMedia(item.externalMedia)) {
      return null
    }
    const queueTuneId = getCurrentTuneId(queue)
    if (queue.previewOnce && queue.previewOnce.tuneId) {
      const previewId = queue.previewOnce.tuneId
      if (isTuneListPath(pathname) || isPlaybackBrowsePath(pathname)) {
        return previewId
      }
      if (viewedTuneId && String(viewedTuneId) === String(previewId)) {
        return previewId
      }
    }
    if (isViewingDifferentFromPlaying(viewedTuneId, queue) && viewedTuneId) {
      // User explicitly started playback on the tune they are viewing.
      if (controllerTuneId === viewedTuneId
        && String(controllerTuneId) !== String(queueTuneId)) {
        return viewedTuneId
      }
      // Keep the queue item while the controller already committed to it, even if
      // output briefly paused between tracks (prevents snapping back to viewed tune).
      const explicitViewedPlaybackUrl = urlPlayback && pathTuneId && viewedTuneId
        && String(pathTuneId) === String(viewedTuneId)
        && String(viewedTuneId) !== String(queueTuneId)
      if (controllerTuneId && String(controllerTuneId) === String(queueTuneId)
        && !explicitViewedPlaybackUrl) {
        return queueTuneId
      }
      if (!isQueueOutputting(mediaController)) {
        return viewedTuneId
      }
    }
    return queueTuneId
  }

  // Non-queue playback from an explicit /playMedia or /playMidi URL.
  if (urlPlayback && pathTuneId) {
    return pathTuneId
  }

  if (controllerTuneId) {
    return controllerTuneId
  }
  if (viewedTuneId) {
    return viewedTuneId
  }
  return null
}

function isViewedTunePagePath(pathname) {
  if (!pathname || pathname.indexOf('/tunes/') < 0) return false
  return pathname.indexOf('/playMidi') < 0 && pathname.indexOf('/playMedia') < 0
}

/** True when the user has armed playback (not merely can-resume a prior session). */
function isPlaybackArmed(mediaController) {
  if (!mediaController) return false
  if (mediaController.isPlaying || mediaController.isLoading) return true
  if (mediaController.hasActivePlaybackIntent && mediaController.hasActivePlaybackIntent()) {
    return true
  }
  return false
}

/** Mount the shared engine when playback starts from a plain tune page (no /playMidi URL). */
function shouldHostViewedTunePlayback(viewedTuneId, pathname, queue, mediaController, tunes) {
  if (!viewedTuneId || !isViewedTunePagePath(pathname)) return false
  if (!isPlaybackArmed(mediaController)) return false
  const hostTuneId = resolveHostPlayingTuneId({
    queue: queue,
    mediaController: mediaController,
    viewedTuneId: viewedTuneId,
    pathname: pathname,
  })
  if (hostTuneId !== viewedTuneId) return false
  return !!resolveHostPlayingTune(hostTuneId, tunes, mediaController)
}

/** True when playback is starting or running and the host must stay mounted. */
function isPlaybackHostLocked(mediaController) {
  if (!mediaController) return false
  if (mediaController.isPlaying || mediaController.isLoading) return true
  if (mediaController.hasActivePlaybackIntent && mediaController.hasActivePlaybackIntent()) {
    return true
  }
  if (mediaController.requestedPlayState === 'playMidi'
    || mediaController.requestedPlayState === 'playMedia') {
    return true
  }
  return false
}

/** Mount the shared engine while the fullscreen mini player is open on a tune page. */
function shouldHostExpandedMiniPlayer(viewedTuneId, pathname, queue, mediaController, tunes, nowPlayingExpanded) {
  if (!nowPlayingExpanded) return false
  if (!viewedTuneId || !isViewedTunePagePath(pathname)) return false
  if (isQueueActive(queue) && isQueueOutputting(mediaController)) {
    const controllerId = mediaController && mediaController.tune && mediaController.tune.id
    if (!controllerId || String(controllerId) !== String(viewedTuneId)) {
      return false
    }
  }
  const hostTuneId = resolveHostPlayingTuneId({
    queue: queue,
    mediaController: mediaController,
    viewedTuneId: viewedTuneId,
    pathname: pathname,
  })
  if (hostTuneId !== viewedTuneId) return false
  return !!resolveHostPlayingTune(hostTuneId, tunes, mediaController)
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
    nowPlayingExpanded,
  } = opts || {}

  if (practiceSessionActive || gigModeActive) return false
  if (shouldMusicSingleOwnPlayback(viewedTuneId, queue)) return false

  if (isQueueActive(queue)) {
    const item = getCurrentItem(queue)
    if (isExternalQueueItem(item) && !isLessonExternalMedia(item.externalMedia)) {
      return false
    }
  }

  // Keep the engine mounted while MIDI/media is starting or playing so a route
  // or queue mismatch does not unmount Abc mid count-in (silent progress bar).
  if (isPlaybackHostLocked(mediaController)) {
    const controllerTune = mediaController.tune
    if (controllerTune && controllerTune.id
      && resolveHostPlayingTune(controllerTune.id, tunes, mediaController)) {
      return true
    }
    const lockedTuneId = resolveHostPlayingTuneId({
      queue: queue,
      mediaController: mediaController,
      viewedTuneId: viewedTuneId,
      pathname: pathname,
    })
    if (lockedTuneId && resolveHostPlayingTune(lockedTuneId, tunes, mediaController)) {
      return true
    }
  }

  if (mediaController && mediaController.notationMidiOwner) return false

  const playingTuneId = resolveHostPlayingTuneId({
    queue: queue,
    mediaController: mediaController,
    viewedTuneId: viewedTuneId,
    pathname: pathname,
  })
  if (!playingTuneId) return false
  if (!resolveHostPlayingTune(playingTuneId, tunes, mediaController)) return false

  const urlPlayback = parseTunePagePlaybackFromUrl(pathname)
  if (urlPlayback) return true
  if (shouldHostViewedTunePlayback(viewedTuneId, pathname, queue, mediaController, tunes)) {
    return true
  }
  if (shouldHostExpandedMiniPlayer(
    viewedTuneId, pathname, queue, mediaController, tunes, nowPlayingExpanded
  )) {
    return true
  }
  if (isQueueActive(queue)) {
    if (isQueuePlaybackEngaged(mediaController, {
      queue: queue,
      viewedTuneId: viewedTuneId,
    })) {
      return true
    }
    return false
  }
  return isMediaControllerPlaybackActive(mediaController)
}

/**
 * Whether MusicSingle's Abc notation view should own the shared MIDI engine.
 * Only preview-once uses a page-local engine; normal tune playback always
 * mounts in NowPlayingHost so play() never hands off mid-start.
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
