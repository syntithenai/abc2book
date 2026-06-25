export function resolveMediaLinkIndex(mediaLinkNumberParam, tune) {
  const parsed = parseInt(mediaLinkNumberParam, 10)
  if (!isNaN(parsed) && parsed > 0 && tune && Array.isArray(tune.links) && tune.links.length > parsed) {
    return parsed
  }
  return 0
}

/**
 * Derive playback mode, media link index, and src from route params + tune.
 * Single source of truth for MediaPlayerMedia route handling.
 */
export function syncPlaybackRoute({ playState, mediaLinkNumberParam, tune, hasNotesOrChords, getSrc }) {
  if (!tune) {
    return { mode: 'none', mediaLinkNumber: null, src: null }
  }

  const hasMusic = hasNotesOrChords(tune)
  const hasLinks = Array.isArray(tune.links) && tune.links.length > 0

  let linkFromRoute = resolveMediaLinkIndex(mediaLinkNumberParam, tune)
  if (playState === 'playMidi' || !hasLinks) {
    linkFromRoute = null
  }

  if (playState === 'playMidi' || linkFromRoute === null) {
    if (hasMusic) {
      return { mode: 'midi', mediaLinkNumber: null, src: '' }
    }
    if (hasLinks) {
      const idx = resolveMediaLinkIndex(mediaLinkNumberParam, tune)
      return { mode: 'media', mediaLinkNumber: idx, src: getSrc(tune, idx) }
    }
    return { mode: 'none', mediaLinkNumber: null, src: null }
  }

  if (hasLinks) {
    return { mode: 'media', mediaLinkNumber: linkFromRoute, src: getSrc(tune, linkFromRoute) }
  }

  if (hasMusic) {
    return { mode: 'midi', mediaLinkNumber: null, src: '' }
  }

  return { mode: 'none', mediaLinkNumber: null, src: null }
}
