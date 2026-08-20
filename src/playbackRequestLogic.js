/** Normalize media link index for pending-play-request matching. */
export function normalizePendingLinkNum(linkNum) {
  return String(linkNum != null ? linkNum : '0')
}

/** True when a stored pending request targets the given route identity. */
export function pendingRequestMatchesRoute(pending, tuneId, playState, linkNum) {
  if (!pending || !pending.tuneId || !pending.playState) return false
  if (String(pending.tuneId) !== String(tuneId)) return false
  if (pending.playState !== playState) return false
  if (playState === 'playMedia') {
    return normalizePendingLinkNum(pending.linkNum) === normalizePendingLinkNum(linkNum)
  }
  return true
}

/**
 * True when the active playback route is ready and matches a pending request.
 * routeSnapshot: { routeReady, activeTuneId, routeMode, activeLinkNum }
 */
export function routeMatchesPendingRequest(pending, routeSnapshot) {
  if (!pending || !routeSnapshot) return false
  if (!routeSnapshot.routeReady) return false
  if (String(routeSnapshot.activeTuneId) !== String(pending.tuneId)) return false
  if (pending.playState === 'playMidi') {
    return routeSnapshot.routeMode === 'midi'
  }
  if (pending.playState === 'playMedia') {
    return routeSnapshot.routeMode === 'media'
      && normalizePendingLinkNum(routeSnapshot.activeLinkNum) === normalizePendingLinkNum(pending.linkNum)
  }
  return false
}

/** Keep intent/loading when play() runs before the route has mounted. */
export function shouldKeepIntentWhenRouteNotReady(pending, routeMode) {
  if (!pending) return false
  if (routeMode === 'none') return true
  return false
}

/**
 * True when MIDI start should wait because media is still the requested output.
 * Pass the synchronously committed requested play state (ref), not lagged React
 * state — after YouTube→MIDI queue advance, React can still say playMedia.
 */
export function shouldBlockMidiStartForMediaRequest(routeMode, requestedPlayState) {
  return routeMode === 'midi' && requestedPlayState === 'playMedia'
}
