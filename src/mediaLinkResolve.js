import { isOwnedMediaLinkUri } from './linkRecording'

export function getLinkSrcType(src, isYoutubeLink) {
  if (!src || !String(src).trim()) return 'abc'
  const trimmed = String(src).trim()
  if (isOwnedMediaLinkUri(trimmed)) return 'recording'
  if (trimmed.startsWith('data:audio/')) return 'inline'
  if (trimmed.startsWith('data:')) return 'skip'
  if (typeof isYoutubeLink === 'function' && isYoutubeLink(trimmed)) return 'youtube'
  if (/^https?:\/\//i.test(trimmed)) return 'audio'
  return 'abc'
}

export function isCacheableLinkSrcType(srcType) {
  return srcType === 'audio' || srcType === 'youtube' || srcType === 'recording'
}

function linkAt(tune, index) {
  if (!tune || !Array.isArray(tune.links)) return null
  const link = tune.links[index]
  if (!link || !link.link || !String(link.link).trim()) return null
  return link
}

export function resolveActiveLinkForTune(tune, preferredLinkIndex, isYoutubeLink) {
  if (!tune || !Array.isArray(tune.links) || tune.links.length === 0) {
    return null
  }

  const preferred = preferredLinkIndex !== null && preferredLinkIndex !== undefined
    ? parseInt(preferredLinkIndex, 10)
    : NaN

  if (!isNaN(preferred) && preferred >= 0) {
    const preferredLink = linkAt(tune, preferred)
    if (preferredLink) {
      const srcType = getLinkSrcType(preferredLink.link, isYoutubeLink)
      if (isCacheableLinkSrcType(srcType)) {
        return {
          linkIndex: preferred,
          src: preferredLink.link,
          srcType: srcType,
          linkTitle: preferredLink.title || '',
        }
      }
    }
  }

  let recordingCandidate = null
  let youtubeCandidate = null
  for (let i = 0; i < tune.links.length; i += 1) {
    const link = linkAt(tune, i)
    if (!link) continue
    const srcType = getLinkSrcType(link.link, isYoutubeLink)
    if (srcType === 'recording' && !recordingCandidate) {
      recordingCandidate = {
        linkIndex: i,
        src: link.link,
        srcType: srcType,
        linkTitle: link.title || '',
      }
    }
    if (srcType === 'audio') {
      return {
        linkIndex: i,
        src: link.link,
        srcType: srcType,
        linkTitle: link.title || '',
      }
    }
    if (srcType === 'youtube' && !youtubeCandidate) {
      youtubeCandidate = {
        linkIndex: i,
        src: link.link,
        srcType: srcType,
        linkTitle: link.title || '',
      }
    }
  }

  if (recordingCandidate) {
    return recordingCandidate
  }

  return youtubeCandidate
}

export function countCacheableLinks(tunes, isYoutubeLink) {
  let count = 0
  if (!Array.isArray(tunes)) return 0
  tunes.forEach(function(tune) {
    if (resolveActiveLinkForTune(tune, null, isYoutubeLink)) count += 1
  })
  return count
}
