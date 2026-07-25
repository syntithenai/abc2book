import {
  resolveRecordingLinkMidi,
  isOwnedMediaLink,
} from './linkRecording'
import { resolveLinkPlaybackSrcType } from './mediaLinkSrcType'
import { isHttpMidiUrl } from './midiFileUtils'
import {
  fetchViaMediaProxy,
  isMediaProxyConfigured,
  normalizeAccessToken,
} from './mediaProxyClient'
import {
  getExternalMediaCacheKey,
  getCachedExternalMediaBlob,
  putExternalMediaCache,
} from './externalMediaAudioCache'
import { probeMidiDuration } from './midiFileUtils'

export async function fetchHttpMidiArrayBuffer(url, options) {
  const opts = options || {}
  const trimmed = String(url || '').trim()
  if (!isHttpMidiUrl(trimmed)) {
    throw new Error('Not a MIDI URL')
  }
  let response
  if (isMediaProxyConfigured()) {
    response = await fetchViaMediaProxy(
      '/proxy-audio?url=' + encodeURIComponent(trimmed),
      normalizeAccessToken(opts.accessToken)
    )
  } else {
    response = await fetch(trimmed)
  }
  if (!response || !response.ok) {
    throw new Error('Could not fetch MIDI file')
  }
  const blob = await response.blob()
  if (!blob || blob.size === 0) {
    throw new Error('MIDI file is empty')
  }
  return blob.arrayBuffer()
}

export async function resolveMidiLinkPlaybackData(link, tuneId, linkIndex, options) {
  const opts = options || {}
  const isYoutubeLink = opts.isYoutubeLink
  const srcType = resolveLinkPlaybackSrcType(link, isYoutubeLink)
  if (srcType !== 'midifile') {
    throw new Error('Not a MIDI media link')
  }

  const src = String(link.link || '').trim()
  const cacheKey = getExternalMediaCacheKey(tuneId, linkIndex, src)
  const cached = await getCachedExternalMediaBlob(cacheKey)
  if (cached && cached.blob) {
    return {
      arrayBuffer: await cached.blob.arrayBuffer(),
      duration: cached.duration,
      source: 'cache',
    }
  }

  if (isOwnedMediaLink(link)) {
    const resolved = await resolveRecordingLinkMidi(link, tuneId, linkIndex, opts)
    return {
      arrayBuffer: resolved.arrayBuffer,
      duration: resolved.duration,
      source: resolved.source,
    }
  }

  if (isHttpMidiUrl(src)) {
    const arrayBuffer = await fetchHttpMidiArrayBuffer(src, opts)
    const duration = await probeMidiDuration(arrayBuffer)
    const blob = new Blob([arrayBuffer], { type: 'audio/midi' })
    await putExternalMediaCache(cacheKey, blob, duration)
    return {
      arrayBuffer: arrayBuffer,
      duration: duration,
      source: 'remote',
    }
  }

  throw new Error('MIDI link is not available')
}
