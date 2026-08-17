import {
  isQueueActive,
  getCurrentTuneId,
  getCurrentItem,
  isExternalQueueItem,
  isLessonExternalMedia,
  isRepeatTrack,
  findQueueIndexForTuneId,
} from './nowPlayingQueue'
import { isPlaybackInterruptPath } from './toolPlaybackInterrupt'
import { isStandaloneExternalPlaybackEngaged } from './standaloneMediaPlayback'

/** Tune id for list-row now-playing highlight (stable while a playlist is engaged). */
export function getListHighlightTuneId(mediaController, queue) {
  if (isQueueActive(queue)) {
    const item = getCurrentItem(queue)
    if (isExternalQueueItem(item) && !isLessonExternalMedia(item.externalMedia)) {
      return null
    }
    if (queue.previewOnce && queue.previewOnce.tuneId) {
      return queue.previewOnce.tuneId
    }
    const queueTuneId = getCurrentTuneId(queue)
    if (queueTuneId && isQueuePlaybackEngaged(mediaController, { queue })) {
      return queueTuneId
    }
  }
  const controllerTuneId = mediaController && mediaController.tune && mediaController.tune.id
    ? mediaController.tune.id
    : null
  if (controllerTuneId && isPlaybackActivelyPlaying(mediaController)) {
    return controllerTuneId
  }
  return null
}

/** Tune id for the transport bar / now-playing UI (queue item or active engine tune). */
export function getActivePlaybackTuneId(mediaController, queue) {
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
      return queue.previewOnce.tuneId
    }

    if (controllerTuneId && queueTuneId && controllerTuneId !== queueTuneId
      && isPlaybackActivelyPlaying(mediaController)) {
      return controllerTuneId
    }

    if (queueTuneId) return queueTuneId
  }

  if (controllerTuneId) return controllerTuneId
  return null
}

/** Tune id shown in the expanded now-playing overlay for a given focus mode. */
export function resolveNowPlayingDisplayTuneId(opts) {
  const focus = opts && opts.focus
  const viewedTuneId = opts && opts.viewedTuneId
  if (focus === 'viewed' && viewedTuneId) {
    return viewedTuneId
  }
  return getActivePlaybackTuneId(opts && opts.mediaController, opts && opts.queue)
}

function isViewingDifferentFromQueue(viewedTuneId, queue) {
  if (!isQueueActive(queue)) return false
  const playingId = getCurrentTuneId(queue)
  return !!(playingId && viewedTuneId && playingId !== viewedTuneId)
}

/**
 * Only an active now-playing queue with auto-advance should continue past track end.
 * Pass playingTuneId so audition / non-queue tunes do not advance the playlist.
 */
export function shouldAdvancePlaybackOnEnd(queue, canUpdateQueue, playingTuneId) {
  if (!isQueueActive(queue) || !canUpdateQueue) return false
  if (queue.stopAfterCurrent) return false
  if (isRepeatTrack(queue)) return true
  if (queue.previewOnce) {
    return true
  }
  if (playingTuneId) {
    const currentId = getCurrentTuneId(queue)
    if (currentId && String(playingTuneId) !== String(currentId)) {
      return false
    }
    if (findQueueIndexForTuneId(queue, playingTuneId) === -1) {
      return false
    }
  }
  return queue.autoAdvance !== false
}

/** Whether a tune page should update the shared media controller tune while a playlist plays. */
export function shouldSyncViewedTuneToMediaController(mediaController, queue, tuneId) {
  if (!tuneId) return false
  if (!isQueueActive(queue)) return true
  if (queue.previewOnce && queue.previewOnce.tuneId
    && String(queue.previewOnce.tuneId) === String(tuneId)) {
    return true
  }
  const queueId = getCurrentTuneId(queue)
  if (queueId && String(queueId) === String(tuneId)) return true
  if (isQueuePlaybackEngaged(mediaController, { queue })) return false
  return true
}

/** Tune index routes (not a single-tune page). */
export function isTuneListPath(pathname) {
  if (!pathname) return false
  return pathname === '/tunes'
    || pathname === '/tunes/'
    || pathname === '/tunes/practice'
}

/** Single tune view under /tunes (not list, editor, or gig). */
export function isTuneSingleViewPath(pathname) {
  if (!pathname || !pathname.startsWith('/tunes/')) return false
  if (isTuneListPath(pathname)) return false
  return !!getViewedTuneIdFromPath(pathname)
}

/** Routes where foot-pedal scroll-then-song bindings are active. */
export function isFootPedalEnabledPath(pathname) {
  if (!pathname) return false
  if (pathname.startsWith('/gig/')) return false
  if (pathname.startsWith('/editor/')) return false
  if (isTuneListPath(pathname)) return true
  return isTuneSingleViewPath(pathname)
}

/** Home / books / tags hub — not a playback-focused route. */
export function isPlaybackBrowsePath(pathname) {
  if (!pathname) return false
  const normalized = pathname.replace(/\/$/, '') || '/'
  return normalized === '/'
    || normalized === '/books'
    || normalized === '/tags'
}

/** Settings and similar admin routes — not a playback-focused route. */
export function isPlaybackAdministrativePath(pathname) {
  if (!pathname) return false
  const normalized = pathname.replace(/\/$/, '') || '/'
  return normalized === '/settings' || normalized.startsWith('/settings/')
}

export function getAppPathname() {
  if (typeof window === 'undefined') return ''
  const hash = window.location.hash || ''
  if (hash.indexOf('#') === 0 && hash.length > 1) {
    return hash.slice(1).split('?')[0]
  }
  return window.location.pathname || ''
}

/** True when playback is running or armed to continue (not user-paused). */
export function isPlaybackActivelyPlaying(mediaController) {
  if (!mediaController) return false
  if (mediaController.isPlaying || mediaController.isLoading) return true
  if (mediaController.hasActivePlaybackIntent && mediaController.hasActivePlaybackIntent()) {
    return true
  }
  return false
}

/**
 * Whether next/prev should start the next tune. Callers may pass startPlayback
 * to mean "keep a playing session going", but paused playback must stay paused.
 */
export function shouldStartPlaybackWhenAdvancing(mediaController, lessonYoutubePlaying) {
  if (isPlaybackActivelyPlaying(mediaController)) return true
  if (lessonYoutubePlaying) return true
  return false
}

/**
 * True when the media controller is audibly playing, starting up, or paused
 * mid-tune — i.e. the now-playing queue's playback is genuinely in use, as
 * opposed to a queue merely restored from storage with nothing happening.
 */
export function isQueuePlaybackEngaged(mediaController, context) {
  if (!mediaController) return false
  const ctx = context || {}
  if (isQueueActive(ctx.queue)) {
    const item = getCurrentItem(ctx.queue)
    if (isExternalQueueItem(item) && !isLessonExternalMedia(item.externalMedia)
        && isStandaloneExternalPlaybackEngaged()) {
      return true
    }
  }
  if (mediaController.isPlaying || mediaController.isLoading) return true
  if (mediaController.hasActivePlaybackIntent && mediaController.hasActivePlaybackIntent()) {
    return true
  }
  if (mediaController.canResumePlayback && mediaController.canResumePlayback()) {
    const ctx = context || {}
    if (isViewingDifferentFromQueue(ctx.viewedTuneId, ctx.queue)) {
      return false
    }
    return true
  }
  return false
}

/**
 * Whether the app-level playback host should suppress autostart for the current route.
 * On the tune list, only continue playback that is already running — do not start
 * (or restart) the playlist just because the user returned to the list view.
 */
export function shouldSuppressHostAutostart(pathname, mediaController, resumePlaybackOnHost, urlPlayback) {
  if (isTuneListPath(pathname)) {
    return !(mediaController && mediaController.isPlaying)
  }
  return !resumePlaybackOnHost && !urlPlayback
}

export function getViewedTuneIdFromPath(pathname) {
  if (!pathname) return null
  const match = pathname.match(/\/(?:tunes|editor)\/([^/]+)/)
  return match ? decodeURIComponent(match[1]) : null
}

export function getSkipNavigationTuneId(pathname, nowPlayingQueue) {
  const viewedId = getViewedTuneIdFromPath(pathname)
  if (viewedId) return viewedId
  return null
}

/**
 * Header skip / keyboard arrows walk the queue when playlist playback is engaged;
 * otherwise they walk search results (unless forceSearchList is false and queue nav requested).
 */
export function shouldUseQueueNavigationForAdjacent(options, mediaController, queue) {
  const opts = options || {}
  if (opts.forceSearchList) return false
  if (opts.useQueueNavigation) return true
  if (isQueueActive(queue) && isQueuePlaybackEngaged(mediaController, { queue: queue })) {
    return true
  }
  return false
}

/** True when header arrows should step the audible queue instead of search results. */
export function shouldPreferQueueNavigation(mediaController, queue) {
  return isQueueActive(queue) && isQueuePlaybackEngaged(mediaController, { queue: queue })
}

/** Keep playlist audio running while browsing search results in the header. */
export function shouldPreservePlaylistAudioDuringSearchBrowse(options, queue, mediaController) {
  if (shouldUseQueueNavigationForAdjacent(options)) return false
  return isQueueActive(queue) && isQueuePlaybackEngaged(mediaController)
}

export function shouldShowPlaylistTransportBar(pathname, nowPlayingQueue, gigModeActive, mediaController) {
  if (gigModeActive) return false
  if (pathname && pathname.startsWith('/gig/')) return false
  if (pathname && pathname.startsWith('/print')) return false
  if (isQueueActive(nowPlayingQueue)) return true
  return isQueuePlaybackEngaged(mediaController)
}

/** True when the bottom now-playing transport bar is visible. */
export function isMiniPlayerTransportVisible(pathname, nowPlayingQueue, gigModeActive, mediaController) {
  if (gigModeActive) return false
  if (pathname && isPlaybackInterruptPath(pathname)) return false
  if (isQueueActive(nowPlayingQueue)) return true
  return isQueuePlaybackEngaged(mediaController)
}
