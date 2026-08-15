/**
 * Back up eligible local media-cache audio to this Google account's
 * ABC Tune Book/CachedMedia folder. Restore a single file on demand.
 */
import localforage from 'localforage'
import { toast } from 'react-toastify'
import {
  getCachedExternalMediaBlob,
} from './externalMediaAudioCache'
import {
  parseExternalMediaCacheKey,
} from './mediaCacheStorage'
import {
  isMediaCacheDriveBackupEnabled,
} from './mediaCacheDriveBackupSettings'
import { isYoutubePlaybackUri } from './youtubePlaybackUri'
import { resolveUriPlaybackSrcType } from './mediaLinkSrcType'
import { isHttpMidiUrl } from './midiFileUtils'
import {
  enqueueCachedMediaDriveDeletes,
  flushCachedMediaDriveDeletes,
  registerCachedMediaDriveApi,
} from './mediaCacheDriveDeletes'

export const CACHED_MEDIA_INDEX_NAME = 'cached-media-index.json'
export const CACHED_MEDIA_BACKUP_CHANGED_EVENT = 'mediaCacheDriveBackupChanged'

const INDEX_KEY = 'cached_media_index'
const PENDING_UPLOAD_KEY = 'cached_media_pending_uploads'

const backupStore = localforage.createInstance({
  name: 'abc2book',
  storeName: 'media_cache_drive_backup',
})

let registeredDriveApi = null
let registeredToken = null
let inFlight = null
let uploadPaused = false
let quotaToastShown = false
let memoryIndex = null
let syncing = false
let lastError = null
let memoryPendingCount = 0
let pendingHydrated = false
let progressCurrent = 0
let progressTotal = 0
let currentKey = null
let lastResult = null
const listeners = new Set()

function nowIso() {
  return new Date().toISOString()
}

function notifyBackupChanged() {
  const snapshot = getMediaCacheDriveBackupStatus()
  listeners.forEach(function(listener) {
    try { listener(snapshot) } catch (e) {}
  })
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent(CACHED_MEDIA_BACKUP_CHANGED_EVENT))
    }
  } catch (e) {}
}

function hydratePendingCount() {
  if (pendingHydrated) return
  pendingHydrated = true
  readPendingUploads().then(function(list) {
    memoryPendingCount = list.length
    notifyBackupChanged()
  }).catch(function() {})
}

export function subscribeMediaCacheDriveBackup(listener) {
  if (typeof listener !== 'function') return function() {}
  listeners.add(listener)
  hydratePendingCount()
  return function() { listeners.delete(listener) }
}

export function getMediaCacheDriveBackupStatus() {
  const items = memoryIndex && Array.isArray(memoryIndex.items) ? memoryIndex.items : []
  return {
    enabled: isMediaCacheDriveBackupEnabled(),
    syncing: syncing,
    lastError: lastError,
    backedUpCount: items.length,
    pendingCount: memoryPendingCount,
    progressCurrent: progressCurrent,
    progressTotal: progressTotal,
    currentKey: currentKey,
    lastResult: lastResult,
  }
}

export function registerCachedMediaDriveBackupContext(options) {
  const opts = options || {}
  registeredDriveApi = opts.driveApi || null
  registeredToken = opts.token || null
  registerCachedMediaDriveApi(registeredDriveApi)
}

function getAccessToken(options) {
  const opts = options || {}
  if (opts.accessToken) return opts.accessToken
  if (opts.token && opts.token.access_token) return opts.token.access_token
  if (registeredToken && registeredToken.access_token) return registeredToken.access_token
  return null
}

function getDriveApi(options) {
  const opts = options || {}
  return opts.driveApi || registeredDriveApi
}

export function hashCacheSrc(src) {
  const s = String(src || '')
  let h = 2166136261
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16)
}

export function getCachedMediaBackupId(tuneId, src) {
  return String(tuneId || '') + '_' + hashCacheSrc(src)
}

function safeDriveNamePart(value) {
  return String(value || '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'file'
}

export function extensionFromAudioFormat(format, blob) {
  const mime = String(format || (blob && blob.type) || '').toLowerCase()
  if (mime.indexOf('mpeg') >= 0 || mime.indexOf('mp3') >= 0) return 'mp3'
  if (mime.indexOf('mp4') >= 0 || mime.indexOf('m4a') >= 0 || mime.indexOf('aac') >= 0) return 'm4a'
  if (mime.indexOf('ogg') >= 0 || mime.indexOf('opus') >= 0) return 'ogg'
  if (mime.indexOf('wav') >= 0) return 'wav'
  if (mime.indexOf('webm') >= 0) return 'webm'
  return 'bin'
}

export function cachedMediaDriveFilename(tuneId, src, audioFormat, blob) {
  const id = safeDriveNamePart(getCachedMediaBackupId(tuneId, src))
  return id + '.' + extensionFromAudioFormat(audioFormat, blob)
}

export function isEligibleCachedMediaBackupParsed(parsed) {
  if (!parsed || parsed.standalone) return false
  if (!parsed.tuneId || !parsed.src) return false
  const src = String(parsed.src)
  if (isYoutubePlaybackUri(src)) return false
  if (isHttpMidiUrl(src)) return false
  if (isRecordingCacheSrc(src)) return true
  const srcType = resolveUriPlaybackSrcType(src)
  if (srcType === 'midifile' || srcType === 'youtube' || srcType === 'skip' || srcType === 'empty' || srcType === 'abc') {
    return false
  }
  return srcType === 'audio' || srcType === 'recording' || srcType === 'inline'
}

const RECORDING_LINK_PREFIX = 'abcbook-recording:'

function isRecordingCacheSrc(src) {
  return String(src || '').indexOf(RECORDING_LINK_PREFIX) === 0
}

function recordingIdFromCacheSrc(src) {
  if (!isRecordingCacheSrc(src)) return null
  return String(src).slice(RECORDING_LINK_PREFIX.length) || null
}

async function loadGetRecording() {
  try {
    const mod = require('./linkRecording')
    return typeof mod.getRecording === 'function' ? mod.getRecording : null
  } catch (e) {
    return null
  }
}

export async function isEligibleCachedMediaBackupKey(key, options) {
  const parsed = parseExternalMediaCacheKey(key)
  if (!isEligibleCachedMediaBackupParsed(parsed)) return false
  if (!isRecordingCacheSrc(parsed.src)) return true
  const recordingId = recordingIdFromCacheSrc(parsed.src)
  if (!recordingId) return true
  const getRecording = options && options.getRecording
    ? options.getRecording
    : await loadGetRecording()
  if (typeof getRecording !== 'function') return true
  try {
    const recording = await getRecording(recordingId)
    return !recording
  } catch (e) {
    return true
  }
}

export function normalizeCachedMediaIndex(data) {
  const items = data && Array.isArray(data.items)
    ? data.items.filter(function(item) {
      return item && item.tuneId && item.src && item.driveFileId
    }).map(function(item) {
      return {
        id: item.id || getCachedMediaBackupId(item.tuneId, item.src),
        tuneId: String(item.tuneId),
        src: String(item.src),
        driveFileId: String(item.driveFileId),
        audioFormat: item.audioFormat || null,
        duration: item.duration == null ? null : item.duration,
        size: item.size || null,
        uploadedAt: item.uploadedAt || null,
      }
    })
    : []
  return {
    version: 1,
    updatedAt: (data && data.updatedAt) || nowIso(),
    items: items,
  }
}

export function findIndexItem(index, tuneId, src) {
  if (!index || !Array.isArray(index.items) || !tuneId || !src) return null
  const id = getCachedMediaBackupId(tuneId, src)
  for (let i = 0; i < index.items.length; i += 1) {
    const item = index.items[i]
    if (!item) continue
    if (item.id === id) return item
    if (String(item.tuneId) === String(tuneId) && String(item.src) === String(src)) return item
  }
  return null
}

export function upsertIndexItem(index, item) {
  const next = normalizeCachedMediaIndex(index)
  const id = item.id || getCachedMediaBackupId(item.tuneId, item.src)
  let found = false
  next.items = next.items.map(function(existing) {
    if (existing.id === id || (existing.tuneId === String(item.tuneId) && existing.src === String(item.src))) {
      found = true
      return Object.assign({}, existing, item, { id: id })
    }
    return existing
  })
  if (!found) {
    next.items.push(Object.assign({ id: id }, item))
  }
  next.updatedAt = nowIso()
  return next
}

export function removeIndexItemsForTuneIds(index, tuneIds) {
  const idSet = {}
  ;(tuneIds || []).forEach(function(id) {
    if (id != null && id !== '') idSet[String(id)] = true
  })
  const next = normalizeCachedMediaIndex(index)
  const removed = []
  next.items = next.items.filter(function(item) {
    if (item && idSet[String(item.tuneId)]) {
      removed.push(item)
      return false
    }
    return true
  })
  next.updatedAt = nowIso()
  return { index: next, removed: removed }
}

export function removeIndexItemsForSrcs(index, tuneId, srcs) {
  const srcSet = {}
  ;(srcs || []).forEach(function(src) {
    if (src) srcSet[String(src)] = true
  })
  const next = normalizeCachedMediaIndex(index)
  const removed = []
  next.items = next.items.filter(function(item) {
    if (item && String(item.tuneId) === String(tuneId) && srcSet[String(item.src)]) {
      removed.push(item)
      return false
    }
    return true
  })
  next.updatedAt = nowIso()
  return { index: next, removed: removed }
}

export async function getLocalCachedMediaIndex() {
  if (memoryIndex) return memoryIndex
  const raw = await backupStore.getItem(INDEX_KEY)
  memoryIndex = normalizeCachedMediaIndex(raw)
  return memoryIndex
}

async function setLocalCachedMediaIndex(index) {
  memoryIndex = normalizeCachedMediaIndex(index)
  await backupStore.setItem(INDEX_KEY, memoryIndex)
  notifyBackupChanged()
  return memoryIndex
}

async function readPendingUploads() {
  const list = await backupStore.getItem(PENDING_UPLOAD_KEY)
  return Array.isArray(list) ? list.filter(Boolean).map(String) : []
}

async function writePendingUploads(keys) {
  const unique = []
  const seen = {}
  ;(keys || []).forEach(function(key) {
    const k = String(key || '')
    if (!k || seen[k]) return
    seen[k] = true
    unique.push(k)
  })
  memoryPendingCount = unique.length
  pendingHydrated = true
  await backupStore.setItem(PENDING_UPLOAD_KEY, unique)
  notifyBackupChanged()
  return unique
}

export function collectRemovedLinkCacheSrcs(beforeLinks, afterLinks) {
  function linkSrc(link) {
    if (!link) return ''
    const direct = link.link != null ? String(link.link).trim() : ''
    if (direct) return direct
    if (link.recordingId && String(link.recordingId).trim()) {
      return 'abcbook-recording:' + String(link.recordingId).trim()
    }
    return ''
  }
  const afterSet = {}
  ;(afterLinks || []).forEach(function(link) {
    const src = linkSrc(link)
    if (src) afterSet[src] = true
  })
  const removed = []
  ;(beforeLinks || []).forEach(function(link) {
    const src = linkSrc(link)
    if (src && !afterSet[src] && removed.indexOf(src) < 0) removed.push(src)
  })
  return removed
}

async function findChildByName(driveApi, parentId, name) {
  if (!driveApi || !parentId || !name) return null
  if (typeof driveApi.findFileInFolder === 'function') {
    return driveApi.findFileInFolder(parentId, name)
  }
  return null
}

async function ensureCachedMediaFolder(driveApi) {
  if (!driveApi || typeof driveApi.findTuneBookFolderInDrive !== 'function') return null
  const parentId = await driveApi.findTuneBookFolderInDrive()
  if (!parentId) return null
  if (typeof driveApi.findOrCreateCachedMediaFolderInDrive !== 'function') return null
  return driveApi.findOrCreateCachedMediaFolderInDrive(parentId)
}

async function loadRemoteIndex(driveApi, folderId) {
  const indexId = await findChildByName(driveApi, folderId, CACHED_MEDIA_INDEX_NAME)
  if (!indexId) return { indexId: null, data: normalizeCachedMediaIndex(null) }
  const blob = await driveApi.getDocumentBlob(indexId)
  if (!blob || blob.error) return { indexId: indexId, data: normalizeCachedMediaIndex(null) }
  try {
    const text = await blob.text()
    return { indexId: indexId, data: normalizeCachedMediaIndex(JSON.parse(text)) }
  } catch (e) {
    return { indexId: indexId, data: normalizeCachedMediaIndex(null) }
  }
}

async function saveRemoteIndex(driveApi, folderId, indexId, index) {
  const body = new Blob([JSON.stringify(index, null, 2)], { type: 'application/json' })
  if (indexId) {
    await driveApi.updateDocumentData(indexId, body)
    return indexId
  }
  const created = await driveApi.createDocument(
    CACHED_MEDIA_INDEX_NAME,
    body,
    'application/json',
    'Cached media backup index',
    folderId
  )
  return created && !created.error ? created : null
}

function mergeIndexes(localIndex, remoteIndex) {
  const merged = normalizeCachedMediaIndex(remoteIndex)
  const local = normalizeCachedMediaIndex(localIndex)
  local.items.forEach(function(item) {
    if (!findIndexItem(merged, item.tuneId, item.src)) {
      merged.items.push(item)
    }
  })
  merged.updatedAt = nowIso()
  return merged
}

function isQuotaError(err) {
  const blob = JSON.stringify(err || '')
  if (/storageQuotaExceeded|quotaExceeded/i.test(blob)) return true
  const status = err && err.response && err.response.status
  return status === 403 && /quota|storage/i.test(blob)
}

function pauseForQuota() {
  uploadPaused = true
  lastError = 'Google Drive storage quota exceeded'
  if (!quotaToastShown) {
    quotaToastShown = true
    try {
      toast.error('Google Drive is out of storage. Cached media backup paused.')
    } catch (e) {}
  }
  notifyBackupChanged()
}

async function uploadCacheEntry(driveApi, folderId, cacheKey, cached, index) {
  const parsed = parseExternalMediaCacheKey(cacheKey)
  if (!parsed || !cached || !cached.blob) return { index: index, uploaded: false }
  const existing = findIndexItem(index, parsed.tuneId, parsed.src)
  if (existing && existing.driveFileId) {
    return { index: index, uploaded: false, skipped: true }
  }
  const filename = cachedMediaDriveFilename(parsed.tuneId, parsed.src, cached.audioFormat, cached.blob)
  let driveFileId = await findChildByName(driveApi, folderId, filename)
  if (!driveFileId) {
    const mime = cached.audioFormat || (cached.blob && cached.blob.type) || 'application/octet-stream'
    const created = await driveApi.createDocument(
      filename,
      cached.blob,
      mime,
      'Cached media backup',
      folderId
    )
    if (!created || created.error) {
      if (isQuotaError(created && created.error)) pauseForQuota()
      return { index: index, uploaded: false, error: created && created.error }
    }
    driveFileId = created
  }
  const next = upsertIndexItem(index, {
    tuneId: parsed.tuneId,
    src: parsed.src,
    driveFileId: driveFileId,
    audioFormat: cached.audioFormat || null,
    duration: cached.duration || null,
    size: cached.blob && cached.blob.size ? cached.blob.size : null,
    uploadedAt: nowIso(),
  })
  return { index: next, uploaded: true, driveFileId: driveFileId }
}

export async function enqueueCachedMediaDriveUpload(cacheKey) {
  if (!cacheKey) return
  if (!isMediaCacheDriveBackupEnabled()) return
  const eligible = await isEligibleCachedMediaBackupKey(cacheKey)
  if (!eligible) return
  const parsed = parseExternalMediaCacheKey(cacheKey)
  if (parsed) {
    const index = await getLocalCachedMediaIndex()
    if (findIndexItem(index, parsed.tuneId, parsed.src)) return
  }
  const pending = await readPendingUploads()
  if (pending.indexOf(cacheKey) < 0) {
    pending.push(cacheKey)
    await writePendingUploads(pending)
  }
  if (registeredDriveApi && getAccessToken()) {
    syncOutstandingCachedMediaBackup({ driveApi: registeredDriveApi, token: registeredToken }).catch(function() {})
  }
}

export async function tryRestoreCachedMediaFromThisAccount(tuneId, src, cacheKey, options) {
  if (!isMediaCacheDriveBackupEnabled()) return null
  if (!tuneId || !src) return null
  const driveApi = getDriveApi(options)
  const accessToken = getAccessToken(options)
  if (!driveApi || !accessToken || typeof driveApi.getDocumentBlob !== 'function') return null
  const index = await getLocalCachedMediaIndex()
  const item = findIndexItem(index, tuneId, src)
  if (!item || !item.driveFileId) return null
  try {
    const blob = await driveApi.getDocumentBlob(item.driveFileId)
    if (!blob || blob.error) return null
    if (typeof blob.size === 'number' && blob.size === 0) return null
    if (blob.type && String(blob.type).indexOf('text/html') !== -1) return null
    const key = cacheKey || ('extmedia:' + tuneId + ':0:' + src)
    const cacheApi = require('./externalMediaAudioCache')
    await cacheApi.putExternalMediaCache(key, blob, item.duration, item.audioFormat || blob.type)
    return {
      blob: blob,
      duration: item.duration,
      audioFormat: item.audioFormat || blob.type || null,
      cached: false,
      source: 'drive-backup',
    }
  } catch (e) {
    return null
  }
}

export async function enqueueCachedMediaDriveDeletesForTuneIds(tuneIds) {
  const index = await getLocalCachedMediaIndex()
  const result = removeIndexItemsForTuneIds(index, tuneIds)
  await setLocalCachedMediaIndex(result.index)
  const ids = result.removed.map(function(item) { return item.driveFileId }).filter(Boolean)
  if (ids.length) await enqueueCachedMediaDriveDeletes(ids)
  return result.removed
}

export async function enqueueCachedMediaDriveDeletesForSrcs(tuneId, srcs) {
  const index = await getLocalCachedMediaIndex()
  const result = removeIndexItemsForSrcs(index, tuneId, srcs)
  await setLocalCachedMediaIndex(result.index)
  const ids = result.removed.map(function(item) { return item.driveFileId }).filter(Boolean)
  if (ids.length) await enqueueCachedMediaDriveDeletes(ids)
  return result.removed
}

export async function syncOutstandingCachedMediaBackup(options) {
  const opts = options || {}
  if (!isMediaCacheDriveBackupEnabled() && !opts.force) {
    return { ok: true, skipped: true, uploaded: 0 }
  }
  const driveApi = getDriveApi(opts)
  const accessToken = getAccessToken(opts)
  if (!driveApi || !accessToken) {
    return { ok: false, error: 'Not signed in', uploaded: 0 }
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ok: false, error: 'Offline', uploaded: 0 }
  }
  if (inFlight) return inFlight

  inFlight = (async function() {
    syncing = true
    lastError = null
    lastResult = null
    progressCurrent = 0
    progressTotal = 0
    currentKey = null
    notifyBackupChanged()
    try {
      await flushCachedMediaDriveDeletes(driveApi, opts)
      if (uploadPaused && !opts.force) {
        lastResult = { ok: false, error: lastError || 'Paused', uploaded: 0 }
        return lastResult
      }
      const folderId = await ensureCachedMediaFolder(driveApi)
      if (!folderId) {
        lastError = 'CachedMedia folder not found'
        lastResult = { ok: false, error: lastError, uploaded: 0 }
        return lastResult
      }
      const remote = await loadRemoteIndex(driveApi, folderId)
      const local = await getLocalCachedMediaIndex()
      let index = mergeIndexes(local, remote.data)
      await setLocalCachedMediaIndex(index)

      const cacheApi = require('./externalMediaAudioCache')
      const pending = await readPendingUploads()
      const seen = {}
      const toUpload = []
      pending.forEach(function(key) {
        if (!key || seen[key]) return
        seen[key] = true
        toUpload.push(key)
      })
      if (cacheApi && typeof cacheApi.iterateExternalMediaCache === 'function') {
        await cacheApi.iterateExternalMediaCache(function(_value, key) {
          if (!key || seen[key]) return
          seen[key] = true
          toUpload.push(key)
        })
      }

      progressTotal = toUpload.length
      notifyBackupChanged()

      let uploaded = 0
      const stillPending = []
      for (let i = 0; i < toUpload.length; i += 1) {
        if (uploadPaused) {
          stillPending.push(toUpload[i])
          continue
        }
        const cacheKey = toUpload[i]
        progressCurrent = i + 1
        currentKey = cacheKey
        notifyBackupChanged()
        const eligible = await isEligibleCachedMediaBackupKey(cacheKey, opts)
        if (!eligible) continue
        const parsed = parseExternalMediaCacheKey(cacheKey)
        if (findIndexItem(index, parsed.tuneId, parsed.src)) continue
        const cached = cacheApi && typeof cacheApi.getCachedExternalMediaBlob === 'function'
          ? await cacheApi.getCachedExternalMediaBlob(cacheKey)
          : await getCachedExternalMediaBlob(cacheKey)
        if (!cached || !cached.blob) {
          stillPending.push(cacheKey)
          continue
        }
        const result = await uploadCacheEntry(driveApi, folderId, cacheKey, cached, index)
        index = result.index
        if (result.uploaded) uploaded += 1
        else if (result.error && !result.skipped) stillPending.push(cacheKey)
      }

      await setLocalCachedMediaIndex(index)
      await saveRemoteIndex(driveApi, folderId, remote.indexId, index)
      await writePendingUploads(stillPending)
      lastResult = { ok: !uploadPaused, uploaded: uploaded, remaining: stillPending.length, scanned: toUpload.length }
      return lastResult
    } catch (err) {
      const message = (err && err.message) ? err.message : String(err)
      lastError = message
      if (isQuotaError(err)) pauseForQuota()
      lastResult = { ok: false, error: message, uploaded: 0 }
      return lastResult
    } finally {
      syncing = false
      inFlight = null
      progressCurrent = 0
      progressTotal = 0
      currentKey = null
      notifyBackupChanged()
    }
  })()

  return inFlight
}

export async function __resetCachedMediaDriveBackupForTests() {
  inFlight = null
  uploadPaused = false
  quotaToastShown = false
  memoryIndex = null
  syncing = false
  lastError = null
  memoryPendingCount = 0
  pendingHydrated = false
  progressCurrent = 0
  progressTotal = 0
  currentKey = null
  lastResult = null
  registeredDriveApi = null
  registeredToken = null
  await backupStore.removeItem(INDEX_KEY)
  await backupStore.removeItem(PENDING_UPLOAD_KEY)
}
