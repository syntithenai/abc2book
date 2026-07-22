import { enforceMonotonicPageRanges } from './pdfSegmentPageRanges'
import localforage from 'localforage'
import utilsFunctions from './utilsFunctions'
import {
  normalizeAccessToken,
  fetchViaMediaProxy,
  isMediaProxyConfigured,
} from './mediaProxyClient'
import { buildPublicDriveDownloadUrl } from './linkRecording'

const tuneFilesStore = localforage.createInstance({ name: 'tunefiles' })
const tuneFileBlobCache = localforage.createInstance({ name: 'tunefilecache' })
const tuneFilePendingDeletesStore = localforage.createInstance({ name: 'tunefilependingdeletes' })
const PENDING_DELETE_KEY = 'googleIds'
const utils = utilsFunctions()

function getAccessToken(token) {
  return normalizeAccessToken(token)
}

function sanitizeFilename(name) {
  return String(name || 'File')
    .replace(/[<>:"/\\|?*]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'File'
}

function extensionForMime(type) {
  const t = String(type || '').toLowerCase()
  if (t === 'application/pdf') return '.pdf'
  if (t === 'image/jpeg' || t === 'image/jpg') return '.jpg'
  if (t === 'image/webp') return '.webp'
  if (t === 'image/gif') return '.gif'
  return '.png'
}

export function isImageTuneFileType(type) {
  return String(type || '').toLowerCase().indexOf('image/') === 0
}

export function isPdfTuneFileType(type) {
  return String(type || '').toLowerCase() === 'application/pdf'
}

export function getTuneFiles(tune) {
  return Array.isArray(tune && tune.tuneFiles) ? tune.tuneFiles : []
}

export function findTuneFileMeta(tune, fileId) {
  if (!fileId) return null
  const list = getTuneFiles(tune)
  for (let i = 0; i < list.length; i += 1) {
    if (list[i] && list[i].id === fileId) return list[i]
  }
  return null
}

export function getTuneFileSyncStatus(meta) {
  if (!meta) return null
  if (meta.googleId) return 'synced'
  if (meta.uploadPending) return 'pending'
  return 'local'
}

export function normalizePdfSegments(raw) {
  if (!Array.isArray(raw)) return []
  const segments = []
  raw.forEach(function(entry) {
    if (!entry || typeof entry !== 'object') return
    const title = String(entry.title || '').trim().replace(/[\x00-\x1f\x7f]/g, '').trim()
    const page = parseInt(entry.page, 10)
    if (!title || !page || page < 1) return
    const endPage = parseInt(entry.endPage, 10)
    const composer = String(entry.composer || entry.artist || '').trim()
    segments.push({
      title: title,
      page: page,
      endPage: endPage > 0 ? endPage : page,
      composer: composer,
    })
  })
  return enforceMonotonicPageRanges(segments)
}

export function normalizeTuneFileMeta(raw) {
  if (!raw || typeof raw !== 'object') return null
  const id = raw.id ? String(raw.id).trim() : ''
  if (!id) return null
  const pdfSegments = normalizePdfSegments(raw.pdfSegments)
  return {
    id: id,
    name: raw.name ? String(raw.name) : 'File',
    type: raw.type ? String(raw.type) : 'image/png',
    googleId: raw.googleId ? String(raw.googleId) : null,
    source: raw.source ? String(raw.source) : 'file',
    pdfPage: raw.pdfPage > 0 ? parseInt(raw.pdfPage, 10) : 1,
    pdfSegments: pdfSegments.length > 0 ? pdfSegments : undefined,
    uploadPending: !!raw.uploadPending,
  }
}

export function setActiveTuneFile(tune, fileId) {
  const next = Object.assign({}, tune || {})
  next.activeFile = fileId ? String(fileId) : ''
  return next
}

export function updateTuneFileMeta(tune, fileId, patch) {
  const list = getTuneFiles(tune).slice()
  let found = false
  for (let i = 0; i < list.length; i += 1) {
    if (list[i] && list[i].id === fileId) {
      list[i] = Object.assign({}, list[i], patch || {})
      found = true
      break
    }
  }
  if (!found) return tune
  return Object.assign({}, tune, { tuneFiles: list })
}

export function removeTuneFileMeta(tune, fileId) {
  const list = getTuneFiles(tune).filter(function(f) {
    return f && f.id !== fileId
  })
  const next = Object.assign({}, tune, { tuneFiles: list })
  if (next.activeFile === fileId) next.activeFile = ''
  return next
}

function cacheKey(tuneId, fileId) {
  return 'tunefile:' + String(tuneId || '') + ':' + String(fileId || '')
}

export async function getStoredTuneFile(fileId) {
  if (!fileId) return null
  return tuneFilesStore.getItem(fileId)
}

export async function saveStoredTuneFile(record) {
  if (!record || !record.id) throw new Error('Missing tune file record')
  await tuneFilesStore.setItem(record.id, record)
  return record
}

export async function deleteStoredTuneFile(fileId, tuneId) {
  if (!fileId) return
  await tuneFilesStore.removeItem(fileId)
  try {
    await tuneFileBlobCache.removeItem(cacheKey(tuneId || '', fileId))
  } catch (e) { /* ignore */ }
}

async function putBlobCache(tuneId, fileId, blob) {
  if (!fileId || !blob) return
  await tuneFileBlobCache.setItem(cacheKey(tuneId, fileId), {
    blob: blob,
    cachedAt: Date.now(),
  })
}

async function getBlobCache(tuneId, fileId) {
  if (!fileId) return null
  const hit = await tuneFileBlobCache.getItem(cacheKey(tuneId, fileId))
  return hit && hit.blob ? hit.blob : null
}

function recordToBlob(record) {
  if (!record) return null
  if (record.blob instanceof Blob) return record.blob
  if (record.data) {
    return utils.dataURItoBlob(record.data, record.type || 'application/octet-stream')
  }
  return null
}

export async function createTuneFileFromBlob(options) {
  const opts = options || {}
  const tune = opts.tune
  const blob = opts.blob
  const name = opts.name || 'File'
  const type = opts.type || (blob && blob.type) || 'image/png'
  const source = opts.source || 'file'
  const token = opts.token
  const driveApi = opts.driveApi
  const uploadToDrive = opts.uploadToDrive !== false
  const setActive = opts.setActive !== false
  const pdfPage = opts.pdfPage > 0 ? parseInt(opts.pdfPage, 10) : 1

  if (!tune || !tune.id || !blob) {
    throw new Error('Missing tune or file data')
  }

  const fileId = utils.generateObjectId()
  const b64 = await utils.blobToBase64(blob)
  if (!b64) {
    throw new Error('Could not encode file data')
  }
  const shouldUpload = !!(uploadToDrive && token && driveApi)
  const record = {
    id: fileId,
    tuneId: tune.id,
    tuneName: tune.name || '',
    name: name,
    type: type,
    data: b64,
    // Keep the Blob alongside base64 so OCR/resolve can use it even if
    // localforage drops or fails to revive the data URL for large screenshots.
    blob: blob,
    source: source,
    googleId: null,
    uploadPending: shouldUpload,
    createdTimestamp: new Date(),
    updatedTimestamp: new Date(),
  }
  await saveStoredTuneFile(record)
  await putBlobCache(tune.id, fileId, blob)

  const meta = {
    id: fileId,
    name: name,
    type: type,
    googleId: null,
    source: source,
    pdfPage: pdfPage,
    uploadPending: shouldUpload,
  }

  let nextTune = Object.assign({}, tune, {
    tuneFiles: getTuneFiles(tune).concat([meta]),
  })
  if (setActive) nextTune.activeFile = fileId

  if (shouldUpload) {
    const uploadResult = await uploadTuneFileToDrive({
      record: record,
      token: token,
      driveApi: driveApi,
    })
    if (uploadResult && uploadResult.googleId) {
      meta.googleId = uploadResult.googleId
      meta.uploadPending = false
      nextTune = updateTuneFileMeta(nextTune, fileId, {
        googleId: uploadResult.googleId,
        uploadPending: false,
      })
    }
  }

  return { tune: nextTune, meta: findTuneFileMeta(nextTune, fileId), record: record }
}

export async function updateTuneFileBlob(options) {
  const opts = options || {}
  const tune = opts.tune
  const fileId = opts.fileId
  const blob = opts.blob
  const token = opts.token
  const driveApi = opts.driveApi
  const uploadToDrive = opts.uploadToDrive !== false
  if (!tune || !fileId || !blob) throw new Error('Missing tune, file id, or blob')

  const existing = await getStoredTuneFile(fileId)
  const type = opts.type || (blob && blob.type) || (existing && existing.type) || 'image/png'
  const name = opts.name || (existing && existing.name) || 'File'
  const b64 = await utils.blobToBase64(blob)
  if (!b64) throw new Error('Could not encode file data')
  const shouldUpload = !!(uploadToDrive && token && driveApi)
  const record = Object.assign({}, existing || {}, {
    id: fileId,
    tuneId: tune.id,
    tuneName: tune.name || '',
    name: name,
    type: type,
    data: b64,
    blob: blob,
    googleId: existing && existing.googleId ? existing.googleId : null,
    uploadPending: shouldUpload || !(existing && existing.googleId),
    updatedTimestamp: new Date(),
    createdTimestamp: (existing && existing.createdTimestamp) || new Date(),
    source: (existing && existing.source) || opts.source || 'file',
  })
  // Replacing content: clear old Drive id so a fresh upload runs (simpler than update-in-place)
  if (shouldUpload) {
    record.googleId = null
    record.uploadPending = true
  }
  await saveStoredTuneFile(record)
  await putBlobCache(tune.id, fileId, blob)

  let nextTune = updateTuneFileMeta(tune, fileId, {
    name: name,
    type: type,
    googleId: shouldUpload ? null : (existing && existing.googleId) || null,
    uploadPending: shouldUpload || !(existing && existing.googleId),
  })

  if (shouldUpload) {
    const uploadResult = await uploadTuneFileToDrive({
      record: record,
      token: token,
      driveApi: driveApi,
    })
    if (uploadResult && uploadResult.googleId) {
      nextTune = updateTuneFileMeta(nextTune, fileId, {
        googleId: uploadResult.googleId,
        uploadPending: false,
      })
    }
  }
  return { tune: nextTune, record: record }
}

export async function uploadTuneFileToDrive(options) {
  const opts = options || {}
  const record = opts.record
  const driveApi = opts.driveApi
  const token = getAccessToken(opts.token)
  if (!record || !driveApi || !token) {
    return { error: 'missing file, drive API, or token' }
  }
  const blob = recordToBlob(record)
  if (!blob) return { error: 'missing file data' }

  const parentId = await driveApi.findTuneBookFolderInDrive()
  if (!parentId) return { error: 'TuneBook folder not found' }
  const filesFolderId = await driveApi.findOrCreateFilesFolderInDrive(parentId)
  if (!filesFolderId) return { error: 'Files folder not found' }

  const filename = sanitizeFilename(record.tuneName || 'Tune')
    + ' - '
    + sanitizeFilename(record.name || 'File')
    + extensionForMime(record.type)

  const newId = await driveApi.createDocument(
    filename,
    blob,
    record.type || blob.type || 'application/octet-stream',
    'File from TuneBook',
    filesFolderId
  )
  if (!newId || newId.error) {
    return { error: newId && newId.error ? newId.error : 'upload failed' }
  }

  record.googleId = newId
  record.uploadPending = false
  record.updatedTimestamp = new Date()
  await saveStoredTuneFile(record)
  return { googleId: newId, record: record }
}

export function patchTunesWithTuneFileUpload(tunes, fileId, googleId) {
  if (!tunes || !fileId || !googleId) return []
  const updated = []
  Object.keys(tunes).forEach(function(tuneId) {
    const tune = tunes[tuneId]
    if (!tune || !Array.isArray(tune.tuneFiles)) return
    let changed = false
    const tuneFiles = tune.tuneFiles.map(function(meta) {
      if (!meta || meta.id !== fileId) return meta
      changed = true
      return Object.assign({}, meta, { googleId: googleId, uploadPending: false })
    })
    if (changed) updated.push(Object.assign({}, tune, { tuneFiles: tuneFiles }))
  })
  return updated
}

export async function listPendingTuneFileUploads() {
  const pending = []
  await tuneFilesStore.iterate(function(value) {
    if (value && value.uploadPending && !value.googleId) {
      pending.push(value)
    }
  })
  return pending
}

export async function syncPendingTuneFileUploads(options) {
  const opts = options || {}
  const token = getAccessToken(opts.token)
  const driveApi = opts.driveApi
  const saveTune = opts.saveTune
  const tunes = opts.tunes || {}
  if (!token || !driveApi) return { uploaded: 0 }

  const pending = await listPendingTuneFileUploads()
  let uploaded = 0
  const tunesCopy = Object.assign({}, tunes)

  for (let i = 0; i < pending.length; i += 1) {
    const record = pending[i]
    const result = await uploadTuneFileToDrive({ record: record, token: token, driveApi: driveApi })
    if (result && result.googleId) {
      uploaded += 1
      const patched = patchTunesWithTuneFileUpload(tunesCopy, record.id, result.googleId)
      patched.forEach(function(tune) {
        tunesCopy[tune.id] = tune
        if (typeof saveTune === 'function') saveTune(tune)
      })
    }
  }
  return { uploaded: uploaded, tunes: tunesCopy }
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

async function fetchTuneFileFromDrive(googleId, accessToken, driveApi) {
  if (!googleId || !driveApi) return null
  if (accessToken && typeof driveApi.getDocumentBlob === 'function') {
    const driveBlob = await driveApi.getDocumentBlob(googleId, accessToken)
    if (driveBlob && !driveBlob.error && driveBlob.size > 0) return driveBlob
  }
  if (typeof driveApi.getPublicDocumentBlob === 'function') {
    const publicBlob = await driveApi.getPublicDocumentBlob(googleId)
    if (publicBlob && !publicBlob.error && publicBlob.size > 0) return publicBlob
  }
  return fetchPublicDriveBlobViaProxy(googleId, accessToken)
}

export async function resolveTuneFileBlob(meta, tuneId, options) {
  const opts = options || {}
  const accessToken = getAccessToken(opts.accessToken || opts.token)
  const driveApi = opts.driveApi
  if (!meta || !meta.id) throw new Error('Missing file metadata')

  const cached = await getBlobCache(tuneId, meta.id)
  if (cached) return { blob: cached, source: 'cache' }

  const record = await getStoredTuneFile(meta.id)
  const localBlob = recordToBlob(record)
  if (localBlob) {
    await putBlobCache(tuneId, meta.id, localBlob)
    return { blob: localBlob, source: 'local' }
  }

  const googleId = meta.googleId || (record && record.googleId)
  if (googleId && driveApi) {
    const remote = await fetchTuneFileFromDrive(googleId, accessToken, driveApi)
    if (remote) {
      await putBlobCache(tuneId, meta.id, remote)
      return { blob: remote, source: 'drive' }
    }
  }

  if (googleId) {
    throw new Error('File could not be downloaded from Google Drive')
  }
  throw new Error('File is not available offline')
}

async function getPendingDriveDeletes() {
  const list = await tuneFilePendingDeletesStore.getItem(PENDING_DELETE_KEY)
  return Array.isArray(list) ? list.filter(Boolean).map(String) : []
}

async function setPendingDriveDeletes(ids) {
  const unique = []
  const seen = {}
  ;(ids || []).forEach(function(id) {
    const key = String(id || '')
    if (!key || seen[key]) return
    seen[key] = true
    unique.push(key)
  })
  await tuneFilePendingDeletesStore.setItem(PENDING_DELETE_KEY, unique)
  return unique
}

export async function enqueuePendingDriveDelete(googleId) {
  if (!googleId) return
  const list = await getPendingDriveDeletes()
  if (list.indexOf(String(googleId)) >= 0) return list
  list.push(String(googleId))
  return setPendingDriveDeletes(list)
}

/**
 * Attempt Drive deletes for queued googleIds. Removes ids that succeed or are gone.
 * Safe to call when offline — failures stay queued.
 */
export async function flushPendingDriveDeletes(options) {
  const opts = options || {}
  const driveApi = opts.driveApi
  if (!driveApi || typeof driveApi.deleteDocument !== 'function') {
    return { deleted: 0, remaining: await getPendingDriveDeletes() }
  }
  const accessToken = getAccessToken(opts.token || opts.accessToken)
  if (!accessToken) {
    return { deleted: 0, remaining: await getPendingDriveDeletes() }
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { deleted: 0, remaining: await getPendingDriveDeletes() }
  }

  const pending = await getPendingDriveDeletes()
  if (!pending.length) return { deleted: 0, remaining: [] }

  const remaining = []
  let deleted = 0
  for (let i = 0; i < pending.length; i += 1) {
    const googleId = pending[i]
    try {
      const result = await driveApi.deleteDocument(googleId)
      if (result && result.error) {
        const status = result.error.response && result.error.response.status
        // Already gone (404) — drop from queue.
        if (status === 404) {
          deleted += 1
        } else {
          remaining.push(googleId)
        }
      } else {
        deleted += 1
      }
    } catch (e) {
      remaining.push(googleId)
    }
  }
  await setPendingDriveDeletes(remaining)
  return { deleted: deleted, remaining: remaining }
}

async function tryDeleteFromDrive(googleId, options) {
  const opts = options || {}
  if (!googleId) return true
  const driveApi = opts.driveApi
  const accessToken = getAccessToken(opts.token || opts.accessToken)
  if (!driveApi || typeof driveApi.deleteDocument !== 'function' || !accessToken) {
    await enqueuePendingDriveDelete(googleId)
    return false
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    await enqueuePendingDriveDelete(googleId)
    return false
  }
  try {
    const result = await driveApi.deleteDocument(googleId)
    if (result && result.error) {
      const status = result.error.response && result.error.response.status
      if (status === 404) return true
      await enqueuePendingDriveDelete(googleId)
      return false
    }
    return true
  } catch (e) {
    await enqueuePendingDriveDelete(googleId)
    return false
  }
}

export async function deleteTuneFile(tune, fileId, options) {
  const opts = options || {}
  const meta = findTuneFileMeta(tune, fileId)
  const nextTune = removeTuneFileMeta(tune, fileId)
  await deleteStoredTuneFile(fileId, tune && tune.id)
  // Local metadata/blob are gone immediately. Drive cleanup is best-effort and
  // queued when offline / unsigned-in so it can flush later.
  if (meta && meta.googleId) {
    tryDeleteFromDrive(meta.googleId, opts).catch(function() {
      enqueuePendingDriveDelete(meta.googleId)
    })
  }
  return nextTune
}

export function collectTuneFilesForShareScope(tunes, tuneIds) {
  const entries = []
  const idList = Array.isArray(tuneIds) ? tuneIds : []
  idList.forEach(function(tuneId) {
    const tune = tunes && tunes[tuneId]
    if (!tune) return
    getTuneFiles(tune).forEach(function(meta) {
      if (!meta || !meta.id) return
      entries.push({
        tuneId: tuneId,
        tuneName: tune.name || 'Untitled',
        fileId: meta.id,
        fileName: meta.name || 'File',
        googleId: meta.googleId || null,
        status: getTuneFileSyncStatus(meta),
        meta: meta,
      })
    })
  })
  return entries
}

export async function uploadPendingTuneFilesInScope(tunes, tuneIds, options) {
  const opts = options || {}
  const token = getAccessToken(opts.token)
  const driveApi = opts.driveApi
  const saveTune = opts.saveTune
  if (!token || !driveApi) {
    return { tunes: tunes, uploaded: 0, errors: ['Log in with Google to upload files.'] }
  }

  let uploaded = 0
  const errors = []
  const nextTunes = Object.assign({}, tunes || {})

  for (let t = 0; t < tuneIds.length; t += 1) {
    const tuneId = tuneIds[t]
    let tune = nextTunes[tuneId]
    if (!tune) continue
    const list = getTuneFiles(tune)
    for (let i = 0; i < list.length; i += 1) {
      const meta = list[i]
      if (!meta || getTuneFileSyncStatus(meta) === 'synced') continue
      const record = await getStoredTuneFile(meta.id)
      if (!record) {
        errors.push('File data missing for "' + (meta.name || meta.id) + '".')
        continue
      }
      if (record.googleId) {
        tune = updateTuneFileMeta(tune, meta.id, { googleId: record.googleId, uploadPending: false })
        nextTunes[tuneId] = tune
        continue
      }
      if (typeof opts.onFileStart === 'function') {
        opts.onFileStart({
          tuneId: tuneId,
          tuneName: tune.name || tuneId,
          fileName: meta.name || meta.id,
        })
      }
      const result = await uploadTuneFileToDrive({ record: record, token: token, driveApi: driveApi })
      if (result && result.googleId) {
        uploaded += 1
        tune = updateTuneFileMeta(tune, meta.id, { googleId: result.googleId, uploadPending: false })
        nextTunes[tuneId] = tune
        if (typeof saveTune === 'function') saveTune(tune)
        if (typeof opts.onFileComplete === 'function') {
          opts.onFileComplete({
            tuneId: tuneId,
            tuneName: tune.name || tuneId,
            fileName: meta.name || meta.id,
            uploaded: true,
          })
        }
      } else {
        errors.push(result && result.error
          ? result.error
          : 'Upload failed for "' + (meta.name || meta.id) + '".')
        if (typeof opts.onFileComplete === 'function') {
          opts.onFileComplete({
            tuneId: tuneId,
            tuneName: tune.name || tuneId,
            fileName: meta.name || meta.id,
            uploaded: false,
          })
        }
      }
    }
  }

  return { tunes: nextTunes, uploaded: uploaded, errors: errors }
}
