import { parseBlob } from 'music-metadata-browser'
import {
  getCachedExternalMediaBlob,
  getExternalMediaCacheKey,
} from './externalMediaAudioCache'
import {
  getRecording,
  isOwnedMediaLink,
  parseRecordingIdFromLinkUri,
  buildRecordingLinkUri,
} from './linkRecording'
import { linkUriString } from './tuneLinkUri'

const artworkCache = new Map()

function cacheKeyForLink(link, tuneId, linkIndex) {
  const linkUri = linkUriString(link) || buildRecordingLinkUri(link.recordingId)
  const recordingId = link.recordingId || parseRecordingIdFromLinkUri(linkUri) || ''
  return String(tuneId || '') + ':' + String(linkIndex != null ? linkIndex : '') + ':' + recordingId
}

function pictureToObjectUrl(picture) {
  if (!picture || !picture.data) return null
  const mime = picture.format || 'image/jpeg'
  const blob = new Blob([picture.data], { type: mime })
  if (!blob.size) return null
  return URL.createObjectURL(blob)
}

async function blobFromRecording(recording) {
  if (!recording) return null
  if (recording.mediaKind === 'midi' || recording.type === 'audio/midi') return null
  if (recording.mp3Blob instanceof Blob) return recording.mp3Blob
  if (recording.data) {
    const utils = require('./utilsFunctions').default()
    return utils.dataURItoBlob(recording.data, recording.type || 'audio/mpeg')
  }
  return null
}

async function loadOwnedRecordingBlob(link, tuneId, linkIndex) {
  const linkUri = linkUriString(link) || buildRecordingLinkUri(link.recordingId)
  const cacheKey = getExternalMediaCacheKey(tuneId, linkIndex, linkUri)
  const cached = await getCachedExternalMediaBlob(cacheKey)
  if (cached && cached.blob) return cached.blob

  const recordingId = link.recordingId || parseRecordingIdFromLinkUri(linkUri)
  const recording = recordingId ? await getRecording(recordingId) : null
  return blobFromRecording(recording)
}

export async function getOwnedRecordingArtworkUrl(link, tuneId, linkIndex) {
  if (!isOwnedMediaLink(link)) return null

  const key = cacheKeyForLink(link, tuneId, linkIndex)
  if (artworkCache.has(key)) {
    return artworkCache.get(key)
  }

  try {
    const blob = await loadOwnedRecordingBlob(link, tuneId, linkIndex)
    if (!blob) {
      artworkCache.set(key, null)
      return null
    }
    const metadata = await parseBlob(blob)
    const pictures = metadata && metadata.common && Array.isArray(metadata.common.picture)
      ? metadata.common.picture
      : []
    const objectUrl = pictures.length ? pictureToObjectUrl(pictures[0]) : null
    artworkCache.set(key, objectUrl)
    return objectUrl
  } catch (e) {
    artworkCache.set(key, null)
    return null
  }
}

export function clearOwnedRecordingArtworkCache() {
  artworkCache.forEach(function(url) {
    if (url) URL.revokeObjectURL(url)
  })
  artworkCache.clear()
}
