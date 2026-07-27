import localforage from 'localforage'
import decode from 'audio-decode'
import MP3Converter from './MP3Converter'
import utilsFunctions from './utilsFunctions'
import {
  normalizeAccessToken,
  fetchViaMediaProxy,
  isMediaProxyConfigured,
} from './mediaProxyClient'
import { loadOfflineMediaSettings } from './offlineMediaSettings'
import { triggerAutoPublicizeIfShared } from './ownedMediaAutoPublicizeTrigger'
import {
  getExternalMediaCacheKey,
  getCachedExternalMediaBlob,
  putExternalMediaCache,
  isExternalMediaCached,
} from './externalMediaAudioCache'
import { probeMidiDuration, isMidiOwnedMediaLink } from './midiFileUtils'

export { isMidiOwnedMediaLink } from './midiFileUtils'

export const RECORDING_LINK_PREFIX = 'abcbook-recording:'

const recordingsStore = localforage.createInstance({ name: 'recordings' })
const utils = utilsFunctions()

export function isOwnedMediaLinkUri(uri) {
  return !!(uri && String(uri).trim().startsWith(RECORDING_LINK_PREFIX))
}

export function parseRecordingIdFromLinkUri(uri) {
  if (!isOwnedMediaLinkUri(uri)) return null
  const id = String(uri).trim().slice(RECORDING_LINK_PREFIX.length)
  return id || null
}

export function buildRecordingLinkUri(recordingId) {
  return RECORDING_LINK_PREFIX + recordingId
}

export function isOwnedMediaLink(link) {
  if (!link) return false
  if (isOwnedMediaLinkUri(link.link)) return true
  return !!(link.recordingId && String(link.recordingId).trim())
}

export function getOwnedMediaSyncStatus(link) {
  if (!isOwnedMediaLink(link)) return null
  if (link.googleId) return 'synced'
  if (link.uploadPending) return 'pending'
  return 'local'
}

export function ownedMediaDriveStatusLabel(status) {
  if (status === 'synced') return 'Synced to Drive'
  if (status === 'pending') return 'Pending upload'
  if (status === 'partial') return 'Partially synced'
  return 'Local only'
}

export function ownedMediaDriveStatusVariant(status) {
  if (status === 'synced') return 'success'
  if (status === 'pending' || status === 'partial') return 'warning'
  return 'info'
}

export function summarizeOwnedMediaLinks(links) {
  const summary = {
    total: 0,
    synced: 0,
    pending: 0,
    local: 0,
    uploadable: 0,
  }
  if (!Array.isArray(links)) return summary
  links.forEach(function(link) {
    if (!isOwnedMediaLink(link)) return
    summary.total += 1
    const status = getOwnedMediaSyncStatus(link)
    if (status === 'synced') summary.synced += 1
    else if (status === 'pending') summary.pending += 1
    else summary.local += 1
    if (status !== 'synced') summary.uploadable += 1
  })
  return summary
}

export function getTuneOwnedMediaDriveSummary(tune) {
  const summary = summarizeOwnedMediaLinks(tune && tune.links)
  if (summary.total === 0) return null
  let status = 'local'
  if (summary.synced === summary.total) {
    status = 'synced'
  } else if (summary.pending > 0 && summary.uploadable === summary.pending) {
    status = 'pending'
  } else if (summary.synced > 0 && summary.uploadable > 0) {
    status = 'partial'
  }
  return Object.assign({ status: status }, summary)
}

export async function uploadOwnedMediaLinksForTune(tune, options) {
  const opts = options || {}
  const token = getAccessToken(opts.token)
  const driveApi = opts.driveApi
  if (!token || !driveApi) {
    return { uploaded: 0, errors: ['Log in with Google to upload to Drive.'], tune: tune }
  }
  if (!tune || !Array.isArray(tune.links) || tune.links.length === 0) {
    return { uploaded: 0, errors: [], tune: tune }
  }

  let uploaded = 0
  const errors = []
  const updatedLinks = tune.links.slice()

  for (let i = 0; i < updatedLinks.length; i += 1) {
    const link = updatedLinks[i]
    if (!isOwnedMediaLink(link)) continue
    if (Array.isArray(opts.linkIndices) && opts.linkIndices.indexOf(i) === -1) continue
    if (getOwnedMediaSyncStatus(link) === 'synced') continue

    const recordingId = link.recordingId || parseRecordingIdFromLinkUri(link.link)
    if (!recordingId) {
      errors.push('Missing recording id for "' + (link.title || 'link ' + (i + 1)) + '".')
      continue
    }

    const recording = await getRecording(recordingId)
    if (!recording) {
      errors.push('Recording not found for "' + (link.title || recordingId) + '".')
      continue
    }

    if (recording.googleId) {
      updatedLinks[i] = Object.assign({}, link, {
        googleId: recording.googleId,
        uploadPending: false,
      })
      continue
    }

    if (tune.name && recording.tuneName !== tune.name) {
      recording.tuneName = tune.name
    }

    const result = await uploadRecordingToDrive({
      recording: recording,
      token: token,
      driveApi: driveApi,
    })
    if (result && result.googleId) {
      uploaded += 1
      updatedLinks[i] = Object.assign({}, link, {
        googleId: result.googleId,
        uploadPending: false,
      })
    } else {
      errors.push(result && result.error
        ? result.error
        : 'Upload failed for "' + (link.title || recording.name || recordingId) + '".')
    }
  }

  return {
    uploaded: uploaded,
    errors: errors,
    tune: Object.assign({}, tune, { links: updatedLinks }),
  }
}

function sanitizeFilename(name) {
  return String(name || 'Recording')
    .replace(/[<>:"/\\|?*]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'Recording'
}

async function blobToMp3Blob(blob) {
  const arrayBuffer = await blob.arrayBuffer()
  const audioBuffer = await decode(arrayBuffer)
  const converter = new MP3Converter()
  const mp3Blob = await converter.convertAudioBuffer(audioBuffer, { bitRate: 96 })
  return {
    blob: mp3Blob,
    duration: audioBuffer.duration,
  }
}

async function recordingDataToMp3(recording) {
  if (!recording) return null
  if (recording.mediaKind === 'midi' || recording.type === 'audio/midi') {
    return null
  }
  if (recording.mp3Blob && recording.mp3Blob.type === 'audio/mpeg') {
    return { blob: recording.mp3Blob, duration: recording.duration || null }
  }
  if (recording.mp3Blob instanceof Blob) {
    return { blob: recording.mp3Blob, duration: recording.duration || null }
  }
  if (recording.data) {
    const blob = utils.dataURItoBlob(recording.data, recording.type || 'audio/mpeg')
    if (recording.type === 'audio/mpeg') {
      return { blob: blob, duration: recording.duration || null }
    }
    return blobToMp3Blob(blob)
  }
  return null
}

export async function getRecording(recordingId) {
  if (!recordingId) return null
  return recordingsStore.getItem(recordingId)
}

export async function saveRecording(recording) {
  await recordingsStore.setItem(recording.id, recording)
  return recording
}

async function writeRecordingCache(tuneId, linkIndex, linkUri, mp3Blob, duration) {
  const cacheKey = getExternalMediaCacheKey(tuneId, linkIndex, linkUri)
  await putExternalMediaCache(cacheKey, mp3Blob, duration)
}

function getAccessToken(token) {
  return normalizeAccessToken(token)
}

function normalizeMediaKind(kind) {
  if (kind === 'video') return 'video'
  if (kind === 'midi') return 'midi'
  return 'audio'
}

function buildDriveFilename(tune, title, mediaKind) {
  const tunePart = tune && tune.name ? sanitizeFilename(tune.name) : 'Tune'
  const titlePart = sanitizeFilename(title)
  if (mediaKind === 'video') {
    return tunePart + ' - ' + titlePart + '.mp4'
  }
  if (mediaKind === 'midi') {
    return tunePart + ' - ' + titlePart + '.mid'
  }
  return tunePart + ' - ' + titlePart + '.mp3'
}

function buildDriveMimeType(mediaKind) {
  if (mediaKind === 'video') return 'video/mp4'
  if (mediaKind === 'midi') return 'audio/midi'
  return 'audio/mpeg'
}

async function recordingDataToBlob(recording) {
  if (!recording) return null
  if (recording.mediaKind === 'midi' || recording.type === 'audio/midi') {
    if (!recording.data) return null
    const blob = utils.dataURItoBlob(recording.data, recording.type || 'audio/midi')
    return {
      blob: blob,
      duration: recording.duration || null,
    }
  }
  if (recording.mediaKind === 'video' && recording.data) {
    const blob = utils.dataURItoBlob(recording.data, recording.type || 'video/mp4')
    return {
      blob: blob,
      duration: recording.duration || null,
    }
  }
  return recordingDataToMp3(recording)
}

export async function uploadRecordingToDrive(options) {
  const opts = options || {}
  const recording = opts.recording
  const driveApi = opts.driveApi
  const token = getAccessToken(opts.token)
  if (!recording || !driveApi || !token) {
    return { error: 'missing recording, drive API, or token' }
  }

  const mediaKind = normalizeMediaKind(recording.mediaKind)
  const stored = await recordingDataToBlob(recording)
  if (!stored || !stored.blob) {
    return { error: 'missing audio data' }
  }

  const parentId = await driveApi.findTuneBookFolderInDrive()
  if (!parentId) {
    return { error: 'TuneBook folder not found' }
  }
  const recordingsFolderId = await driveApi.findOrCreateRecordingsFolderInDrive(parentId)
  if (!recordingsFolderId) {
    return { error: 'Recordings folder not found' }
  }

  const filename = buildDriveFilename(
    { name: recording.tuneName },
    recording.name || 'Recording',
    mediaKind
  )
  const newId = await driveApi.createDocument(
    filename,
    stored.blob,
    buildDriveMimeType(mediaKind),
    'Recording from TuneBook',
    recordingsFolderId
  )
  if (!newId || newId.error) {
    return { error: newId && newId.error ? newId.error : 'upload failed' }
  }

  recording.googleId = newId
  recording.uploadPending = false
  recording.updatedTimestamp = new Date()
  if (driveApi.getDocumentMeta) {
    const meta = await driveApi.getDocumentMeta(newId)
    if (meta && meta.modifiedTime) {
      recording.googleModifiedTime = meta.modifiedTime
    }
  }
  await saveRecording(recording)
  return { googleId: newId, recording: recording }
}

export function patchTunesWithRecordingUpload(tunes, recordingId, googleId) {
  if (!tunes || !recordingId || !googleId) return []
  const updated = []
  Object.keys(tunes).forEach(function(tuneId) {
    const tune = tunes[tuneId]
    if (!tune || !Array.isArray(tune.links)) return
    let changed = false
    const links = tune.links.map(function(link) {
      if (!link) return link
      const matches = link.recordingId === recordingId
        || parseRecordingIdFromLinkUri(link.link) === recordingId
      if (!matches) return link
      changed = true
      return Object.assign({}, link, {
        googleId: googleId,
        uploadPending: false,
      })
    })
    if (changed) {
      updated.push(Object.assign({}, tune, { links: links }))
    }
  })
  return updated
}

export async function createOwnedMediaLink(options) {
  const opts = options || {}
  const tune = opts.tune
  const audioBlob = opts.audioBlob
  const title = opts.title || 'Recording ' + new Date().toLocaleString()
  const source = opts.source || 'mic'
  const linkIndex = opts.linkIndex !== undefined && opts.linkIndex !== null ? opts.linkIndex : 0
  const token = opts.token
  const driveApi = opts.driveApi
  const uploadToDrive = opts.uploadToDrive === true
  const mediaKind = normalizeMediaKind(opts.mediaKind)

  if (!tune || !tune.id || !audioBlob) {
    throw new Error('Missing tune or audio data')
  }

  const recordingId = utils.generateObjectId()
  const linkUri = buildRecordingLinkUri(recordingId)

  let storedBlob
  let duration = null
  let mimeType = 'audio/mpeg'
  if (mediaKind === 'video') {
    storedBlob = audioBlob
    mimeType = audioBlob.type || 'video/mp4'
  } else if (mediaKind === 'midi') {
    storedBlob = audioBlob
    mimeType = audioBlob.type || 'audio/midi'
    duration = await probeMidiDuration(audioBlob)
  } else {
    const mp3 = await blobToMp3Blob(audioBlob)
    storedBlob = mp3.blob
    duration = mp3.duration
  }

  const b64 = await utils.blobToBase64(storedBlob)

  const recording = {
    id: recordingId,
    tuneId: tune.id,
    tuneName: tune.name || '',
    name: title,
    type: mimeType,
    mediaKind: mediaKind,
    data: b64,
    duration: duration,
    source: source,
    googleId: null,
    uploadPending: uploadToDrive,
    createdTimestamp: new Date(),
    updatedTimestamp: new Date(),
  }

  await saveRecording(recording)
  await writeRecordingCache(tune.id, linkIndex, linkUri, storedBlob, duration)

  const link = {
    title: title,
    link: linkUri,
    recordingId: recordingId,
    googleId: null,
    uploadPending: uploadToDrive,
    source: source,
    mediaKind: mediaKind,
    startAt: '',
    endAt: '',
  }

  if (uploadToDrive && token && driveApi) {
    const uploadResult = await uploadRecordingToDrive({ recording: recording, token: token, driveApi: driveApi })
    if (uploadResult && uploadResult.googleId) {
      link.googleId = uploadResult.googleId
      link.uploadPending = false
      recording.googleId = uploadResult.googleId
      recording.uploadPending = false
      await saveRecording(recording)
      triggerAutoPublicizeIfShared(opts, [{
        googleId: uploadResult.googleId,
        kind: 'audio',
        label: title,
      }])
    }
  }

  return { link: link, recording: recording }
}

export async function createRecordingLink(options) {
  const opts = options || {}
  return createOwnedMediaLink(Object.assign({}, opts, {
    audioBlob: opts.blob,
    source: 'mic',
    uploadToDrive: opts.uploadToDrive !== false,
  }))
}

export async function createAttachedAudioLink(options) {
  const opts = options || {}
  const file = opts.file
  if (!file) {
    throw new Error('Missing audio file')
  }
  const title = opts.title || file.name || 'Attached audio'
  return createOwnedMediaLink(Object.assign({}, opts, {
    audioBlob: file,
    title: title,
    source: 'file',
    uploadToDrive: opts.uploadToDrive !== false,
  }))
}

/**
 * Attach a video file as owned media (same storage path as audio; MIME preserved when possible).
 */
export async function createAttachedVideoLink(options) {
  const opts = options || {}
  const file = opts.file
  if (!file) {
    throw new Error('Missing video file')
  }
  const title = opts.title || file.name || 'Attached video'
  return createOwnedMediaLink(Object.assign({}, opts, {
    audioBlob: file,
    title: title,
    source: 'video-file',
    uploadToDrive: opts.uploadToDrive !== false,
    mediaKind: 'video',
  }))
}

export async function createAttachedMidiLink(options) {
  const opts = options || {}
  const file = opts.file
  if (!file) {
    throw new Error('Missing MIDI file')
  }
  const title = opts.title || file.name || 'Attached MIDI'
  return createOwnedMediaLink(Object.assign({}, opts, {
    audioBlob: file,
    title: title,
    source: 'file',
    uploadToDrive: opts.uploadToDrive !== false,
    mediaKind: 'midi',
  }))
}

export async function listPendingRecordingUploads() {
  const pending = []
  await recordingsStore.iterate(function(value) {
    if (value && value.uploadPending && !value.googleId && !value.deleted) {
      pending.push(value)
    }
  })
  return pending
}

export async function syncPendingRecordingUploads(options) {
  const opts = options || {}
  const token = getAccessToken(opts.token)
  const driveApi = opts.driveApi
  const saveTune = opts.saveTune
  const tunes = opts.tunes || {}
  if (!token || !driveApi) {
    return { uploaded: 0 }
  }

  const pending = await listPendingRecordingUploads()

  let uploaded = 0
  const tunesCopy = Object.assign({}, tunes)
  const publicizeItems = []

  for (let i = 0; i < pending.length; i += 1) {
    const recording = pending[i]
    const result = await uploadRecordingToDrive({ recording: recording, token: token, driveApi: driveApi })
    if (result && result.googleId) {
      uploaded += 1
      publicizeItems.push({
        googleId: result.googleId,
        kind: 'audio',
        label: recording.name || 'Recording',
      })
      const patched = patchTunesWithRecordingUpload(tunesCopy, recording.id, result.googleId)
      patched.forEach(function(tune) {
        tunesCopy[tune.id] = tune
        if (typeof saveTune === 'function') {
          saveTune(tune)
        }
      })
    }
  }

  if (publicizeItems.length > 0) {
    triggerAutoPublicizeIfShared(opts, publicizeItems)
  }

  return { uploaded: uploaded, tunes: tunesCopy }
}

async function blobToCachedMediaResult(blob, mediaKind) {
  if (!blob || blob.error) return null
  if (mediaKind === 'midi' || mediaKind === 'video') {
    return { blob: blob, duration: null }
  }
  if (blob.type === 'audio/mpeg') {
    return { blob: blob, duration: null }
  }
  if (typeof blob.arrayBuffer === 'function') {
    return blobToMp3Blob(blob)
  }
  return null
}

async function blobToCachedMp3Result(blob) {
  return blobToCachedMediaResult(blob, 'audio')
}

export function buildPublicDriveDownloadUrl(googleId) {
  return 'https://drive.google.com/u/0/uc?id=' + encodeURIComponent(googleId) + '&export=download'
}

async function fetchPublicDriveBlobViaProxy(googleId, accessToken) {
  if (!googleId || !isMediaProxyConfigured()) return null
  try {
    const driveUrl = buildPublicDriveDownloadUrl(googleId)
    const response = await fetchViaMediaProxy(
      '/proxy-audio?url=' + encodeURIComponent(driveUrl),
      normalizeAccessToken(accessToken)
    )
    const blob = await response.blob()
    if (!blob || blob.size === 0) return null
    if (blob.type && String(blob.type).indexOf('text/html') !== -1) return null
    return blob
  } catch (e) {
    return null
  }
}

async function fetchOwnedMediaFromDrive(googleId, accessToken, driveApi, mediaKind) {
  if (!googleId || !driveApi) return null
  const kind = normalizeMediaKind(mediaKind)

  if (accessToken && typeof driveApi.getDocumentBlob === 'function') {
    const driveBlob = await driveApi.getDocumentBlob(googleId, accessToken)
    const media = await blobToCachedMediaResult(driveBlob, kind)
    if (media && media.blob) {
      return { media: media, source: 'drive' }
    }
  }

  if (typeof driveApi.getPublicDocumentBlob === 'function') {
    const publicBlob = await driveApi.getPublicDocumentBlob(googleId)
    const media = await blobToCachedMediaResult(publicBlob, kind)
    if (media && media.blob) {
      return { media: media, source: 'public' }
    }
  }

  const proxyBlob = await fetchPublicDriveBlobViaProxy(googleId, accessToken)
  const proxyMedia = await blobToCachedMediaResult(proxyBlob, kind)
  if (proxyMedia && proxyMedia.blob) {
    return { media: proxyMedia, source: 'proxy' }
  }

  return null
}

export async function resolveRecordingLinkAudio(link, tuneId, linkIndex, options) {
  const opts = options || {}
  const accessToken = getAccessToken(opts.accessToken)
  const driveApi = opts.driveApi
  const forPlayback = opts.forPlayback !== false

  if (!link || !isOwnedMediaLink(link)) {
    throw new Error('Not an owned media link')
  }
  if (isMidiOwnedMediaLink(link)) {
    throw new Error('Use resolveRecordingLinkMidi for MIDI links')
  }

  const linkUri = link.link || buildRecordingLinkUri(link.recordingId)
  const recordingId = link.recordingId || parseRecordingIdFromLinkUri(linkUri)
  const cacheKey = getExternalMediaCacheKey(tuneId, linkIndex, linkUri)

  const cached = await getCachedExternalMediaBlob(cacheKey)
  if (cached && cached.blob) {
    return { blob: cached.blob, duration: cached.duration, source: 'cache' }
  }

  const recording = recordingId ? await getRecording(recordingId) : null
  if (recording) {
    const mp3 = await recordingDataToMp3(recording)
    if (mp3 && mp3.blob) {
      if (forPlayback || loadOfflineMediaSettings().autocacheOnPlay) {
        await putExternalMediaCache(cacheKey, mp3.blob, mp3.duration)
      }
      return { blob: mp3.blob, duration: mp3.duration, source: 'local' }
    }
  }

  const googleId = link.googleId || (recording && recording.googleId)
  if (googleId && driveApi) {
    const remote = await fetchOwnedMediaFromDrive(googleId, accessToken, driveApi, 'audio')
    if (remote && remote.media && remote.media.blob) {
      await putExternalMediaCache(cacheKey, remote.media.blob, remote.media.duration)
      return { blob: remote.media.blob, duration: remote.media.duration, source: remote.source }
    }
  }

  if (googleId && !recording) {
    if (!accessToken) {
      throw new Error('Recording not shared publicly — owner may need to log in and save again.')
    }
    throw new Error('Recording not shared publicly — owner may need to log in and save again.')
  }

  const online = typeof navigator !== 'undefined' && navigator.onLine
  throw new Error(online
    ? 'Recording audio is not available — sign in and try again, or use MIDI playback.'
    : 'Recording audio is not available offline')
}

async function blobToArrayBuffer(blob) {
  if (!blob) return null
  if (blob instanceof ArrayBuffer) return blob
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer()
  }
  // Prefer FileReader before Response: jsdom Blobs often lack arrayBuffer(), and
  // some Response polyfills cannot read those Blobs either.
  if (typeof FileReader !== 'undefined') {
    return new Promise(function(resolve, reject) {
      const reader = new FileReader()
      reader.onload = function() { resolve(reader.result) }
      reader.onerror = function() { reject(reader.error || new Error('Failed to read blob')) }
      reader.readAsArrayBuffer(blob)
    })
  }
  if (typeof Response !== 'undefined') {
    return new Response(blob).arrayBuffer()
  }
  return null
}

export async function resolveRecordingLinkMidi(link, tuneId, linkIndex, options) {
  const opts = options || {}
  const accessToken = getAccessToken(opts.accessToken)
  const driveApi = opts.driveApi
  const forPlayback = opts.forPlayback !== false

  if (!link || !isOwnedMediaLink(link)) {
    throw new Error('Not an owned media link')
  }

  const linkUri = link.link || buildRecordingLinkUri(link.recordingId)
  const recordingId = link.recordingId || parseRecordingIdFromLinkUri(linkUri)
  const cacheKey = getExternalMediaCacheKey(tuneId, linkIndex, linkUri)

  const cached = await getCachedExternalMediaBlob(cacheKey)
  if (cached && cached.blob) {
    const arrayBuffer = await blobToArrayBuffer(cached.blob)
    if (arrayBuffer) {
      return { arrayBuffer: arrayBuffer, duration: cached.duration, source: 'cache' }
    }
  }

  const recording = recordingId ? await getRecording(recordingId) : null
  if (recording) {
    const stored = await recordingDataToBlob(recording)
    if (stored && stored.blob) {
      if (forPlayback || loadOfflineMediaSettings().autocacheOnPlay) {
        await putExternalMediaCache(cacheKey, stored.blob, stored.duration)
      }
      const arrayBuffer = await blobToArrayBuffer(stored.blob)
      if (arrayBuffer) {
        return { arrayBuffer: arrayBuffer, duration: stored.duration, source: 'local' }
      }
    }
  }

  const googleId = link.googleId || (recording && recording.googleId)
  if (googleId && driveApi) {
    const remote = await fetchOwnedMediaFromDrive(googleId, accessToken, driveApi, 'midi')
    if (remote && remote.media && remote.media.blob) {
      await putExternalMediaCache(cacheKey, remote.media.blob, remote.media.duration)
      const arrayBuffer = await blobToArrayBuffer(remote.media.blob)
      if (arrayBuffer) {
        return { arrayBuffer: arrayBuffer, duration: remote.media.duration, source: remote.source }
      }
    }
  }

  if (googleId && !recording) {
    if (!accessToken) {
      throw new Error('Shared MIDI is not available. The owner may need to share the file, or log in to Google Drive.')
    }
    throw new Error('Shared MIDI could not be downloaded from Google Drive')
  }

  throw new Error('MIDI recording is not available offline')
}

export async function isOwnedMediaLinkCached(tuneId, linkIndex, link) {
  if (!link || !isOwnedMediaLink(link)) return false
  const linkUri = link.link || buildRecordingLinkUri(link.recordingId)
  return isExternalMediaCached(tuneId, linkIndex, linkUri)
}

export async function cacheOwnedMediaLinkIfNeeded(tuneId, linkIndex, link, options) {
  const opts = options || {}
  if (!link || !isOwnedMediaLink(link)) return false
  const cached = await isOwnedMediaLinkCached(tuneId, linkIndex, link)
  if (cached) return true
  if (!loadOfflineMediaSettings().autocacheOnPlay && !opts.force) {
    return false
  }
  try {
    if (isMidiOwnedMediaLink(link)) {
      await resolveRecordingLinkMidi(link, tuneId, linkIndex, Object.assign({}, opts, { forPlayback: false }))
    } else {
      await resolveRecordingLinkAudio(link, tuneId, linkIndex, Object.assign({}, opts, { forPlayback: false }))
    }
    return true
  } catch (e) {
    return false
  }
}
