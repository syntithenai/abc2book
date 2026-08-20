import { isOwnedMediaLinkUri } from './linkRecording'
import { isHttpMidiUrl, isMidiFileName, isMidiMimeType, isMidiOwnedMediaLink } from './midiFileUtils'
import { isMusicCollectionLinkUri } from './musicCollectionLinkUtils'
import { linkUriString } from './tuneLinkUri'
import { isYoutubePlaybackUri } from './youtubePlaybackUri'

const PLAY_RANGE_SRC_TYPES = {
  audio: true,
  recording: true,
  youtube: true,
  inline: true,
}

function dataAudioMimeType(src) {
  const comma = String(src || '').indexOf(',')
  const header = comma >= 0 ? src.slice(5, comma) : String(src || '').slice(5)
  return header.split(';')[0].trim().toLowerCase()
}

/**
 * Resolve playback source type for a tune link.
 * @returns {'empty'|'recording'|'midifile'|'youtube'|'audio'|'inline'|'skip'|'abc'}
 */
export function resolveLinkPlaybackSrcType(link, isYoutubeLink) {
  const src = linkUriString(link).trim()
  if (!src) {
    return 'empty'
  }
  if (isMidiOwnedMediaLink(link) || (isOwnedMediaLinkUri(src) && isMidiFileName(link.title))) {
    return 'midifile'
  }
  if (isOwnedMediaLinkUri(src)) {
    return 'recording'
  }
  if (src.startsWith('data:audio/')) {
    return isMidiMimeType(dataAudioMimeType(src)) ? 'midifile' : 'inline'
  }
  if (src.startsWith('data:')) {
    return 'skip'
  }
  if (typeof isYoutubeLink === 'function' && isYoutubeLink(src)) {
    return 'youtube'
  }
  if (isYoutubePlaybackUri(src)) {
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
  if (trimmed.startsWith('data:audio/')) {
    return isMidiMimeType(dataAudioMimeType(trimmed)) ? 'midifile' : 'inline'
  }
  if (trimmed.startsWith('data:')) return 'skip'
  if (typeof isYoutubeLink === 'function' && isYoutubeLink(trimmed)) return 'youtube'
  if (isHttpMidiUrl(trimmed)) return 'midifile'
  if (isMusicCollectionLinkUri(trimmed)) return 'audio'
  if (/^https?:\/\//i.test(trimmed)) return 'audio'
  return 'abc'
}

export function isCacheablePlaybackSrcType(srcType) {
  return srcType === 'audio'
    || srcType === 'youtube'
    || srcType === 'recording'
    || srcType === 'midifile'
}

/** True when a tune link can be attempted as a playlist media source. */
export function isMediaLinkPlaybackCandidate(link, isYoutubeLink) {
  if (!link) return false
  const srcType = resolveLinkPlaybackSrcType(link, isYoutubeLink)
  return srcType !== 'empty' && srcType !== 'skip'
}

/** Play range (startAt/endAt) applies to audio/video, not MIDI files. Practice loops still can. */
export function linkSupportsPlayRange(link, isYoutubeLink) {
  return !!PLAY_RANGE_SRC_TYPES[resolveLinkPlaybackSrcType(link, isYoutubeLink)]
}
