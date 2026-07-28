/**
 * Resolve which engine (midi vs media link) the app-level NowPlayingHost should mount.
 * Ref-based route checks take precedence over React state to avoid stale MIDI wins.
 */
import { hasFilteredPlaybackVoices } from './abcVoiceViewSettings'

export function resolveHostPlaybackTarget(mediaController, playingTune, tunebook, queue, currentItem, urlPlayback, helpers) {
  const h = helpers || {}
  const isQueueActiveFn = h.isQueueActive || function() { return false }
  const resolvePlaybackForItemFn = h.resolvePlaybackForItem || function() { return null }

  if (!playingTune || !tunebook || !mediaController) return null

  if (isQueueActiveFn(queue) && currentItem
    && playingTune && currentItem.tuneId === playingTune.id) {
    return resolvePlaybackForItemFn(playingTune, currentItem, tunebook)
  }

  const hasMusic = tunebook.hasNotesOrChords && tunebook.hasNotesOrChords(playingTune)
  const hasLinks = Array.isArray(playingTune.links) && playingTune.links.length > 0

  if (urlPlayback) {
    if (urlPlayback.playState === 'playMedia' && hasLinks) {
      const linkNum = parseInt(urlPlayback.mediaLinkNumber, 10) || 0
      return { type: 'media', linkNum: linkNum }
    }
    if (urlPlayback.playState === 'playMidi' && hasMusic) {
      return { type: 'midi' }
    }
  }

  if (mediaController.requestedPlayState === 'playMedia' && hasLinks) {
    const linkNum = mediaController.mediaLinkNumber != null ? mediaController.mediaLinkNumber : 0
    return { type: 'media', linkNum: linkNum }
  }
  if (mediaController.requestedPlayState === 'playMidi' && hasMusic) {
    return { type: 'midi' }
  }

  if (mediaController.isMediaPlaybackRoute && mediaController.isMediaPlaybackRoute() && hasLinks) {
    const linkNum = mediaController.mediaLinkNumber != null ? mediaController.mediaLinkNumber : 0
    return { type: 'media', linkNum: linkNum }
  }
  if (mediaController.isMidiPlaybackRoute && mediaController.isMidiPlaybackRoute() && hasMusic) {
    return { type: 'midi' }
  }

  if (hasMusic && hasLinks && hasFilteredPlaybackVoices(playingTune)
    && mediaController.requestedPlayState !== 'playMedia'
    && !(mediaController.isMediaPlaybackRoute && mediaController.isMediaPlaybackRoute())) {
    return { type: 'midi' }
  }

  if (mediaController.playbackRouteMode === 'media' && hasLinks) {
    const linkNum = mediaController.mediaLinkNumber != null ? mediaController.mediaLinkNumber : 0
    return { type: 'media', linkNum: linkNum }
  }
  if (mediaController.playbackRouteMode === 'midi' && hasMusic) {
    return { type: 'midi' }
  }

  if (mediaController.hasActivePlaybackIntent && mediaController.hasActivePlaybackIntent()) {
    if (mediaController.isMidiPlaybackRoute && mediaController.isMidiPlaybackRoute() && hasMusic) {
      return { type: 'midi' }
    }
    if (mediaController.requestedPlayState === 'playMidi' && hasMusic) {
      return { type: 'midi' }
    }
    if (hasLinks) {
      const linkNum = mediaController.mediaLinkNumber != null ? mediaController.mediaLinkNumber : 0
      return { type: 'media', linkNum: linkNum }
    }
    if (hasMusic) {
      return { type: 'midi' }
    }
  }

  return null
}

/** True when the host should avoid forcing a MIDI route (user chose media). */
export function shouldSkipHostMidiRouteApply(mediaController) {
  if (!mediaController) return true
  if (mediaController.notationMidiOwner) return true
  if (mediaController.requestedPlayState === 'playMedia') return true
  if (mediaController.isMediaPlaybackRoute && mediaController.isMediaPlaybackRoute()) return true
  return false
}
