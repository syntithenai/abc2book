import { isQueueActive, getCurrentTuneId } from './nowPlayingQueue'

export function getViewedTuneIdFromPath(pathname) {
  if (!pathname) return null
  const match = pathname.match(/\/(?:tunes|editor)\/([^/]+)/)
  return match ? decodeURIComponent(match[1]) : null
}

export function getSkipNavigationTuneId(pathname, nowPlayingQueue) {
  const viewedId = getViewedTuneIdFromPath(pathname)
  const queueTuneId = getCurrentTuneId(nowPlayingQueue)
  return viewedId || queueTuneId || null
}

/** Header list skip context when the bottom playlist bar is not active. */
export function resolveListNavigationContext(pathname, nowPlayingQueue, setPlaylist) {
  if (isQueueActive(nowPlayingQueue)) {
    return null
  }
  if (setPlaylist && Array.isArray(setPlaylist.tunes) && setPlaylist.tunes.length > 0) {
    return 'set'
  }
  return 'list'
}

export function listNavigationContextLabel(context) {
  if (context === 'set') return 'Set'
  if (context === 'list') return 'List'
  return ''
}

export function shouldShowPlaylistTransportBar(pathname, nowPlayingQueue, gigModeActive) {
  if (gigModeActive) return false
  if (pathname && pathname.startsWith('/gig/')) return false
  if (pathname && pathname.startsWith('/print')) return false
  return isQueueActive(nowPlayingQueue)
}
