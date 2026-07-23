import { isQueueActive, getCurrentTuneId } from './nowPlayingQueue'

/** Only an active now-playing queue with auto-advance should continue past track end. */
export function shouldAdvancePlaybackOnEnd(queue, canUpdateQueue) {
  return isQueueActive(queue) && queue.autoAdvance !== false && !!canUpdateQueue
}

/** Tune index routes (not a single-tune page). */
export function isTuneListPath(pathname) {
  if (!pathname) return false
  return pathname === '/tunes'
    || pathname === '/tunes/'
    || pathname === '/tunes/practice'
}

export function getAppPathname() {
  if (typeof window === 'undefined') return ''
  const hash = window.location.hash || ''
  if (hash.indexOf('#') === 0 && hash.length > 1) {
    return hash.slice(1).split('?')[0]
  }
  return window.location.pathname || ''
}

/**
 * True when the media controller is audibly playing, starting up, or paused
 * mid-tune — i.e. the now-playing queue's playback is genuinely in use, as
 * opposed to a queue merely restored from storage with nothing happening.
 */
export function isQueuePlaybackEngaged(mediaController) {
  if (!mediaController) return false
  if (mediaController.isPlaying || mediaController.isLoading) return true
  if (mediaController.hasActivePlaybackIntent && mediaController.hasActivePlaybackIntent()) {
    return true
  }
  if (mediaController.canResumePlayback && mediaController.canResumePlayback()) {
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
 * Header skip / keyboard arrows walk search results by default.
 * Only the playlist transport bar opts into queue stepping.
 */
export function shouldUseQueueNavigationForAdjacent(options) {
  const opts = options || {}
  if (opts.forceSearchList) return false
  return !!opts.useQueueNavigation
}

/** Keep playlist audio running while browsing search results in the header. */
export function shouldPreservePlaylistAudioDuringSearchBrowse(options, queue, mediaController) {
  if (shouldUseQueueNavigationForAdjacent(options)) return false
  return isQueueActive(queue) && isQueuePlaybackEngaged(mediaController)
}

export function shouldShowPlaylistTransportBar(pathname, nowPlayingQueue, gigModeActive) {
  if (gigModeActive) return false
  if (pathname && pathname.startsWith('/gig/')) return false
  if (pathname && pathname.startsWith('/print')) return false
  return isQueueActive(nowPlayingQueue)
}
