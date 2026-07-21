import { isOwnedMediaLinkUri } from './linkRecording'
import { isHttpMidiUrl, isMidiOwnedMediaLink } from './midiFileUtils'

/**
 * Resolve playback source type for a tune link.
 * @returns {'empty'|'recording'|'midifile'|'youtube'|'audio'|'inline'|'skip'|'abc'}
 */
export function resolveLinkPlaybackSrcType(link, isYoutubeLink) {
  if (!link || !link.link || !String(link.link).trim()) {
    return 'empty'
  }
  const src = String(link.link).trim()
  if (isMidiOwnedMediaLink(link)) {
    return 'midifile'
  }
  if (isOwnedMediaLinkUri(src)) {
    return 'recording'
  }
  if (src.startsWith('data:audio/')) {
    return 'inline'
  }
  if (src.startsWith('data:')) {
    return 'skip'
  }
  if (typeof isYoutubeLink === 'function' && isYoutubeLink(src)) {
    return 'youtube'
  }
  if (isHttpMidiUrl(src)) {
    return 'midifile'
  }
  if (/^https?:\/\//i.test(src)) {
    return 'audio'
  }
  return 'audio'
}

/**
 * Resolve playback source type from a bare URI (no link metadata).
 */
export function resolveUriPlaybackSrcType(src, isYoutubeLink) {
  if (!src || !String(src).trim()) return 'abc'
  const trimmed = String(src).trim()
  if (isOwnedMediaLinkUri(trimmed)) return 'recording'
  if (trimmed.startsWith('data:audio/')) return 'inline'
  if (trimmed.startsWith('data:')) return 'skip'
  if (typeof isYoutubeLink === 'function' && isYoutubeLink(trimmed)) return 'youtube'
  if (isHttpMidiUrl(trimmed)) return 'midifile'
  if (/^https?:\/\//i.test(trimmed)) return 'audio'
  return 'abc'
}

export function isCacheablePlaybackSrcType(srcType) {
  return srcType === 'audio'
    || srcType === 'youtube'
    || srcType === 'recording'
    || srcType === 'midifile'
}
