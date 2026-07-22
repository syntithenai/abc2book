import {
  isOwnedMediaLink,
  getOwnedMediaSyncStatus,
  uploadOwnedMediaLinksForTune,
} from './linkRecording'
import {
  collectTuneFilesForShareScope,
  uploadPendingTuneFilesInScope,
  getTuneFileSyncStatus,
  flushPendingDriveDeletes,
} from './tuneFiles'
import { tuneIdsForSet } from './shareTunebookUtils'
import { tuneIdsForPlaylistRecord } from './savedPlaylistsStore'
import { normalizePerformanceSetItems } from './performanceSetStore'

const AUDIO_PUBLIC_CONFIRM_PREFIX = 'bookstorage_audio_public_'
const FILE_PUBLIC_CONFIRM_PREFIX = 'bookstorage_file_public_'
const TUNEBOOK_PUBLIC_CONFIRM_KEY = 'bookstorage_tunebook_public'
const TUNEBOOK_PUBLIC_CACHE_MS = 5 * 60 * 1000
const AUTO_PUBLICIZE_DEBOUNCE_MS = 300

let tunebookPublicCache = { docId: null, at: 0, value: false }
let autoPublicizePendingItems = []
let autoPublicizePendingCtx = null
let autoPublicizeTimer = null

export function isAnyoneReadable(permissionsRes) {
  const permissions = permissionsRes && permissionsRes.data && Array.isArray(permissionsRes.data.permissions)
    ? permissionsRes.data.permissions
    : []
  return permissions.some(function(permission) {
    return permission && permission.type === 'anyone'
  })
}

function sameId(a, b) {
  return String(a) === String(b)
}

function tuneInBook(tune, bookName) {
  return !!(tune && bookName && Array.isArray(tune.books) && tune.books.indexOf(bookName) !== -1)
}

function collectTuneIdsInScope(tunes, scope) {
  const opts = scope || {}
  const shareKind = opts.shareKind || 'all'
  const allTunes = tunes || {}

  if (shareKind === 'tune' && opts.tuneId) {
    return allTunes[opts.tuneId] ? [String(opts.tuneId)] : []
  }

  if (shareKind === 'book' && opts.bookName) {
    return Object.keys(allTunes).filter(function(tuneId) {
      return tuneInBook(allTunes[tuneId], opts.bookName)
    })
  }

  if (shareKind === 'set' && opts.setId && opts.sets) {
    const setRecord = opts.sets[opts.setId]
    return tuneIdsForSet(setRecord)
  }

  if (shareKind === 'playlist' && opts.playlistId && opts.playlists) {
    const playlistRecord = opts.playlists[opts.playlistId]
    return tuneIdsForPlaylistRecord(playlistRecord)
  }

  return Object.keys(allTunes)
}

function linkIndexForTuneInScope(tunes, scope, tuneId) {
  const shareKind = scope && scope.shareKind
  if (shareKind === 'playlist' && scope.playlistId && scope.playlists) {
    const playlist = scope.playlists[scope.playlistId]
    if (!playlist || !Array.isArray(playlist.items)) return null
    const matches = playlist.items.filter(function(item) {
      return item && sameId(item.tuneId, tuneId) && item.linkIndex != null
    })
    if (matches.length === 1) return matches[0].linkIndex
    return null
  }
  if (shareKind === 'set' && scope.setId && scope.sets) {
    const setRecord = scope.sets[scope.setId]
    const items = normalizePerformanceSetItems(setRecord && setRecord.items)
    const matches = items.filter(function(item) {
      return item && item.tuneId && sameId(item.tuneId, tuneId) && item.linkIndex != null
    })
    if (matches.length === 1) return matches[0].linkIndex
  }
  return null
}

function ownedMediaEntryKey(tuneId, linkIndex, googleId, recordingId) {
  if (googleId) return 'gid:' + googleId
  if (recordingId) return 'rec:' + tuneId + ':' + linkIndex + ':' + recordingId
  return 'local:' + tuneId + ':' + linkIndex
}

function collectScopedOwnedMediaLinkIndices(tunes, scope, tuneId) {
  const tune = tunes && tunes[tuneId]
  if (!tune || !Array.isArray(tune.links)) return []

  const scopedLinkIndex = linkIndexForTuneInScope(tunes, scope, tuneId)
  if (scopedLinkIndex != null) {
    const link = tune.links[scopedLinkIndex]
    return isOwnedMediaLink(link) ? [scopedLinkIndex] : []
  }

  const indices = []
  tune.links.forEach(function(link, linkIndex) {
    if (isOwnedMediaLink(link)) indices.push(linkIndex)
  })
  return indices
}

export function collectOwnedMediaForShareScope(tunes, scope) {
  const tuneIds = collectTuneIdsInScope(tunes, scope)
  const entries = []
  const seen = {}

  tuneIds.forEach(function(tuneId) {
    const tune = tunes && tunes[tuneId]
    if (!tune || !Array.isArray(tune.links)) return

    const scopedLinkIndex = linkIndexForTuneInScope(tunes, scope, tuneId)
    tune.links.forEach(function(link, linkIndex) {
      if (!isOwnedMediaLink(link)) return
      if (scopedLinkIndex != null && scopedLinkIndex !== linkIndex) return

      const status = getOwnedMediaSyncStatus(link)
      const googleId = link.googleId || null
      const recordingId = link.recordingId || null
      const key = ownedMediaEntryKey(tuneId, linkIndex, googleId, recordingId)
      if (seen[key]) return
      seen[key] = true

      entries.push({
        tuneId: tuneId,
        tuneName: tune.name || tuneId,
        linkIndex: linkIndex,
        linkTitle: link.title || ('Link ' + (linkIndex + 1)),
        googleId: googleId,
        recordingId: recordingId,
        link: link,
        status: status,
        alreadyPublic: false,
      })
    })
  })

  return entries
}

export function audioPublicConfirmKey(googleId) {
  return AUDIO_PUBLIC_CONFIRM_PREFIX + googleId
}

export function hasAudioPublicConfirm(googleId) {
  if (!googleId) return false
  return localStorage.getItem(audioPublicConfirmKey(googleId)) === 'true'
}

export function setAudioPublicConfirm(googleId) {
  if (!googleId) return
  localStorage.setItem(audioPublicConfirmKey(googleId), 'true')
}

export function filePublicConfirmKey(googleId) {
  return FILE_PUBLIC_CONFIRM_PREFIX + googleId
}

export function hasFilePublicConfirm(googleId) {
  if (!googleId) return false
  return localStorage.getItem(filePublicConfirmKey(googleId)) === 'true'
}

export function setFilePublicConfirm(googleId) {
  if (!googleId) return
  localStorage.setItem(filePublicConfirmKey(googleId), 'true')
}

export function getTunebookPublicConfirmKey() {
  return TUNEBOOK_PUBLIC_CONFIRM_KEY
}

export function resetTunebookPublicSharedCache() {
  tunebookPublicCache = { docId: null, at: 0, value: false }
}

export async function isTunebookPublicShared(driveApi, googleDocumentId) {
  if (!googleDocumentId || !driveApi) return false

  const now = Date.now()
  if (
    tunebookPublicCache.docId === googleDocumentId
    && (now - tunebookPublicCache.at) < TUNEBOOK_PUBLIC_CACHE_MS
  ) {
    return tunebookPublicCache.value
  }

  if (typeof localStorage === 'undefined' || localStorage.getItem(TUNEBOOK_PUBLIC_CONFIRM_KEY) !== 'true') {
    tunebookPublicCache = { docId: googleDocumentId, at: now, value: false }
    return false
  }

  if (typeof driveApi.listPermissions !== 'function') {
    tunebookPublicCache = { docId: googleDocumentId, at: now, value: true }
    return true
  }

  try {
    const res = await driveApi.listPermissions(googleDocumentId)
    const value = isAnyoneReadable(res)
    tunebookPublicCache = { docId: googleDocumentId, at: now, value: value }
    return value
  } catch (e) {
    return false
  }
}

function dedupePublicizeItems(items) {
  const seen = {}
  const unique = []
  ;(items || []).forEach(function(item) {
    if (!item || !item.googleId) return
    const key = String(item.kind || 'audio') + ':' + String(item.googleId)
    if (seen[key]) return
    seen[key] = true
    unique.push(item)
  })
  return unique
}

export async function publicizeDriveFiles(driveApi, items, options) {
  const opts = options || {}
  const confirmFn = typeof opts.confirm === 'function' ? opts.confirm : null
  const autoConfirmPublic = opts.autoConfirmPublic === true
  const summary = {
    shared: 0,
    skipped: 0,
    failed: [],
    alreadyPublic: 0,
    cancelled: 0,
  }

  if (!driveApi || typeof driveApi.addPermission !== 'function') {
    summary.skipped = (items || []).length
    return summary
  }

  let tasks = dedupePublicizeItems(items)
  if (tasks.length === 0) return summary

  const needsPermissionCheck = typeof driveApi.listPermissions === 'function'
  const stillPrivate = []

  for (let i = 0; i < tasks.length; i += 1) {
    const item = tasks[i]
    const kind = item.kind === 'file' ? 'file' : 'audio'
    const hasConfirm = kind === 'file'
      ? hasFilePublicConfirm(item.googleId)
      : hasAudioPublicConfirm(item.googleId)
    if (hasConfirm) {
      summary.alreadyPublic += 1
      continue
    }

    if (needsPermissionCheck) {
      try {
        const res = await driveApi.listPermissions(item.googleId)
        if (isAnyoneReadable(res)) {
          if (kind === 'file') setFilePublicConfirm(item.googleId)
          else setAudioPublicConfirm(item.googleId)
          summary.alreadyPublic += 1
          continue
        }
      } catch (e) { /* treat as private */ }
    }

    stillPrivate.push(item)
  }

  tasks = stillPrivate
  const total = tasks.length

  for (let i = 0; i < tasks.length; i += 1) {
    const task = tasks[i]
    const label = task.label || task.googleId
    if (typeof opts.onProgress === 'function') {
      opts.onProgress({
        current: i + 1,
        total: total,
        message: 'Sharing "' + label + '"…',
        fileName: label,
      })
    }

    if (!autoConfirmPublic && confirmFn) {
      const ok = confirmFn('"' + label + '" will be readable by anyone with the link. Continue?')
      if (!ok) {
        summary.cancelled += 1
        summary.skipped += 1
        if (typeof opts.onEvent === 'function') {
          opts.onEvent({
            type: 'warning',
            message: 'Skipped sharing "' + label + '".',
          })
        }
        continue
      }
    }

    if (typeof opts.onEvent === 'function') {
      opts.onEvent({
        type: 'info',
        message: 'Making "' + label + '" publicly readable…',
      })
    }

    const permResult = await driveApi.addPermission(task.googleId, { type: 'anyone', role: 'reader' })
    if (permResult && permResult.error) {
      summary.failed.push(label)
      if (typeof opts.onEvent === 'function') {
        opts.onEvent({
          type: 'error',
          message: 'Could not share "' + label + '".',
        })
      }
      continue
    }

    if (task.kind === 'file') setFilePublicConfirm(task.googleId)
    else setAudioPublicConfirm(task.googleId)
    summary.shared += 1
    if (typeof opts.onEvent === 'function') {
      opts.onEvent({
        type: 'success',
        message: 'Shared "' + label + '" publicly.',
      })
    }
  }

  return summary
}

export async function autoPublicizeMediaIfTunebookShared(options) {
  const opts = options || {}
  const driveApi = opts.driveApi
  const googleDocumentId = opts.googleDocumentId
  const items = dedupePublicizeItems(opts.items)
  if (!driveApi || !googleDocumentId || items.length === 0) {
    return { shared: 0, failed: [], alreadyPublic: 0, skipped: items.length, cancelled: 0 }
  }

  const isPublic = await isTunebookPublicShared(driveApi, googleDocumentId)
  if (!isPublic) {
    return { shared: 0, failed: [], alreadyPublic: 0, skipped: items.length, cancelled: 0 }
  }

  const result = await publicizeDriveFiles(driveApi, items, { autoConfirmPublic: true })
  if (result.failed && result.failed.length > 0 && typeof opts.onFailureToast === 'function') {
    opts.onFailureToast(result.failed.length)
  }
  return result
}

export function queueAutoPublicizeMediaIfTunebookShared(options) {
  const opts = options || {}
  if (!opts.driveApi || !opts.googleDocumentId) return

  const incoming = dedupePublicizeItems(opts.items)
  if (incoming.length === 0) return

  autoPublicizePendingCtx = {
    driveApi: opts.driveApi,
    googleDocumentId: opts.googleDocumentId,
    onFailureToast: opts.onFailureToast,
  }

  incoming.forEach(function(item) {
    const key = String(item.kind || 'audio') + ':' + String(item.googleId)
    const exists = autoPublicizePendingItems.some(function(pending) {
      return String(pending.kind || 'audio') + ':' + String(pending.googleId) === key
    })
    if (!exists) autoPublicizePendingItems.push(item)
  })

  if (autoPublicizeTimer) clearTimeout(autoPublicizeTimer)
  autoPublicizeTimer = setTimeout(function() {
    const ctx = autoPublicizePendingCtx
    const items = autoPublicizePendingItems.slice()
    autoPublicizePendingItems = []
    autoPublicizePendingCtx = null
    autoPublicizeTimer = null
    if (!ctx || items.length === 0) return
    autoPublicizeMediaIfTunebookShared(Object.assign({}, ctx, { items: items })).catch(function() {})
  }, AUTO_PUBLICIZE_DEBOUNCE_MS)
}

export async function checkOwnedMediaPublicStatus(driveApi, googleDocumentId, entries) {
  const withGoogleId = (entries || []).filter(function(entry) {
    return entry && entry.googleId && entry.status === 'synced'
  })
  const results = await Promise.all(withGoogleId.map(function(entry) {
    return driveApi.listPermissions(entry.googleId).then(function(res) {
      return Object.assign({}, entry, {
        alreadyPublic: isAnyoneReadable(res),
      })
    }).catch(function() {
      return Object.assign({}, entry, { alreadyPublic: false })
    })
  }))
  const byKey = {}
  results.forEach(function(entry) {
    byKey[ownedMediaEntryKey(entry.tuneId, entry.linkIndex, entry.googleId, entry.recordingId)] = entry
  })
  return (entries || []).map(function(entry) {
    const key = ownedMediaEntryKey(entry.tuneId, entry.linkIndex, entry.googleId, entry.recordingId)
    return byKey[key] || entry
  })
}

function emitShareMediaEvent(opts, event) {
  if (typeof opts.onEvent === 'function') {
    opts.onEvent(Object.assign({ timestamp: Date.now() }, event))
  }
}

function emitShareMediaProgress(opts, progress) {
  if (typeof opts.onProgress === 'function') {
    opts.onProgress(progress)
  }
}

export function summarizeShareMediaWork(tunes, scope) {
  const entries = collectOwnedMediaForShareScope(tunes, scope)
  const tuneIds = collectTuneIdsInScope(tunes, scope)
  const fileEntries = collectTuneFilesForShareScope(tunes, tuneIds)
  let needsUpload = 0
  let needsPublic = 0

  entries.forEach(function(entry) {
    const status = entry.status || getOwnedMediaSyncStatus(entry.link)
    if (status === 'local' || status === 'pending' || !entry.googleId) {
      needsUpload += 1
    } else if (!entry.alreadyPublic && !hasAudioPublicConfirm(entry.googleId)) {
      needsPublic += 1
    }
  })

  fileEntries.forEach(function(entry) {
    const status = entry.status || getTuneFileSyncStatus(entry.meta)
    if (status === 'local' || status === 'pending' || !entry.googleId) {
      needsUpload += 1
    } else if (!entry.alreadyPublic && !hasFilePublicConfirm(entry.googleId)) {
      needsPublic += 1
    }
  })

  return {
    entries: entries,
    fileEntries: fileEntries,
    displayItems: entries.map(function(entry) {
      return {
        tuneName: entry.tuneName,
        label: entry.linkTitle,
      }
    }).concat(fileEntries.map(function(entry) {
      return {
        tuneName: entry.tuneName,
        label: entry.fileName,
      }
    })),
    totalItems: entries.length + fileEntries.length,
    needsUpload: needsUpload,
    needsPublic: needsPublic,
    hasWork: needsUpload > 0 || needsPublic > 0,
  }
}

export async function uploadPendingOwnedMediaInScope(tunes, scope, options) {
  const opts = options || {}
  const token = opts.token
  const driveApi = opts.driveApi
  const saveTune = opts.saveTune
  if (!token || !driveApi) {
    emitShareMediaEvent(opts, {
      type: 'error',
      message: 'Log in with Google to upload audio to Drive.',
    })
    return { tunes: tunes, uploaded: 0, errors: ['Log in with Google to upload audio to Drive.'] }
  }

  const tuneIds = collectTuneIdsInScope(tunes, scope)
  let uploaded = 0
  const errors = []
  const nextTunes = Object.assign({}, tunes || {})
  const uploadTasks = []

  tuneIds.forEach(function(tuneId) {
    const tune = nextTunes[tuneId]
    if (!tune) return
    const linkIndices = collectScopedOwnedMediaLinkIndices(nextTunes, scope, tuneId)
    if (linkIndices.length === 0) return
    linkIndices.forEach(function(linkIndex) {
      const link = tune.links && tune.links[linkIndex]
      if (!link || !isOwnedMediaLink(link)) return
      if (getOwnedMediaSyncStatus(link) === 'synced') return
      uploadTasks.push({
        tuneId: tuneId,
        tuneName: tune.name || tuneId,
        linkIndex: linkIndex,
        title: link.title || ('Link ' + (linkIndex + 1)),
      })
    })
  })

  const fileTuneIds = tuneIds.slice()
  let fileUploadTaskCount = 0
  fileTuneIds.forEach(function(tuneId) {
    const tune = nextTunes[tuneId]
    if (!tune || !Array.isArray(tune.tuneFiles)) return
    tune.tuneFiles.forEach(function(meta) {
      if (!meta || getTuneFileSyncStatus(meta) === 'synced') return
      fileUploadTaskCount += 1
    })
  })

  const totalUploadSteps = uploadTasks.length + fileUploadTaskCount
  let uploadStep = 0

  emitShareMediaProgress(opts, {
    phase: 'upload',
    current: 0,
    total: totalUploadSteps,
    message: totalUploadSteps > 0 ? 'Preparing audio uploads…' : 'Checking audio files…',
  })

  for (let i = 0; i < tuneIds.length; i += 1) {
    const tuneId = tuneIds[i]
    const tune = nextTunes[tuneId]
    if (!tune) continue
    const linkIndices = collectScopedOwnedMediaLinkIndices(nextTunes, scope, tuneId)
    if (linkIndices.length === 0) continue

    for (let j = 0; j < linkIndices.length; j += 1) {
      const linkIndex = linkIndices[j]
      const link = tune.links && tune.links[linkIndex]
      if (!link || !isOwnedMediaLink(link) || getOwnedMediaSyncStatus(link) === 'synced') continue
      uploadStep += 1
      emitShareMediaProgress(opts, {
        phase: 'upload',
        current: uploadStep,
        total: Math.max(totalUploadSteps, uploadStep),
        message: 'Uploading "' + (link.title || 'audio') + '" for ' + (tune.name || tuneId) + '…',
        fileName: link.title || '',
      })
      emitShareMediaEvent(opts, {
        type: 'info',
        message: 'Uploading "' + (link.title || 'audio') + '" (' + (tune.name || tuneId) + ')…',
      })
    }

    const result = await uploadOwnedMediaLinksForTune(tune, {
      token: token,
      driveApi: driveApi,
      linkIndices: linkIndices,
    })
    if (result.uploaded) {
      uploaded += result.uploaded
      emitShareMediaEvent(opts, {
        type: 'success',
        message: 'Uploaded ' + result.uploaded + ' audio file' + (result.uploaded === 1 ? '' : 's') + ' for ' + (tune.name || tuneId) + '.',
      })
    }
    if (result.errors && result.errors.length) {
      errors.push.apply(errors, result.errors)
      result.errors.forEach(function(error) {
        emitShareMediaEvent(opts, { type: 'error', message: error })
      })
    }
    if (result.tune) {
      nextTunes[tuneId] = result.tune
      if (typeof saveTune === 'function') saveTune(result.tune)
    }
  }

  if (fileUploadTaskCount > 0) {
    emitShareMediaEvent(opts, {
      type: 'info',
      message: 'Uploading attached files…',
    })
  }

  const fileUpload = await uploadPendingTuneFilesInScope(nextTunes, tuneIds, {
    token: token,
    driveApi: driveApi,
    saveTune: saveTune,
    googleDocumentId: opts.googleDocumentId,
    onFileStart: function(info) {
      uploadStep += 1
      emitShareMediaProgress(opts, {
        phase: 'upload',
        current: uploadStep,
        total: Math.max(totalUploadSteps, uploadStep),
        message: 'Uploading "' + (info.fileName || 'file') + '" for ' + (info.tuneName || '') + '…',
        fileName: info.fileName || '',
      })
      emitShareMediaEvent(opts, {
        type: 'info',
        message: 'Uploading file "' + (info.fileName || 'file') + '" (' + (info.tuneName || '') + ')…',
      })
    },
    onFileComplete: function(info) {
      if (info && info.uploaded) {
        emitShareMediaEvent(opts, {
          type: 'success',
          message: 'Uploaded "' + (info.fileName || 'file') + '".',
        })
      }
    },
  })
  uploaded += fileUpload.uploaded || 0
  if (fileUpload.errors && fileUpload.errors.length) {
    errors.push.apply(errors, fileUpload.errors)
    fileUpload.errors.forEach(function(error) {
      emitShareMediaEvent(opts, { type: 'error', message: error })
    })
  }

  try {
    await flushPendingDriveDeletes({ token: token, driveApi: driveApi })
  } catch (e) { /* ignore queued-delete flush failures */ }

  emitShareMediaProgress(opts, {
    phase: 'upload',
    current: totalUploadSteps,
    total: Math.max(totalUploadSteps, 1),
    message: uploaded > 0 ? 'Uploads complete.' : 'No uploads needed.',
  })

  return {
    tunes: fileUpload.tunes || nextTunes,
    uploaded: uploaded,
    errors: errors,
  }
}

export async function prepareOwnedMediaForShare(tunes, scope, options) {
  const opts = options || {}
  const driveApi = opts.driveApi
  const confirmFn = typeof opts.confirm === 'function' ? opts.confirm : window.confirm.bind(window)
  const autoConfirmPublic = opts.autoConfirmPublic === true

  emitShareMediaEvent(opts, {
    type: 'info',
    message: 'Checking attached audio in share scope…',
  })

  let workingTunes = Object.assign({}, tunes || {})
  const uploadResult = await uploadPendingOwnedMediaInScope(workingTunes, scope, {
    token: opts.token,
    driveApi: driveApi,
    saveTune: opts.saveTune,
    googleDocumentId: opts.googleDocumentId,
    onEvent: opts.onEvent,
    onProgress: opts.onProgress,
  })
  workingTunes = uploadResult.tunes

  let entries = collectOwnedMediaForShareScope(workingTunes, scope)
  if (driveApi && typeof driveApi.listPermissions === 'function') {
    emitShareMediaEvent(opts, {
      type: 'info',
      message: 'Checking which audio files are already public…',
    })
    entries = await checkOwnedMediaPublicStatus(driveApi, opts.googleDocumentId, entries)
  }

  const summary = {
    shared: 0,
    skipped: 0,
    failed: [],
    notUploadable: [],
    alreadyPublic: 0,
    cancelled: 0,
    uploaded: uploadResult.uploaded || 0,
    uploadErrors: uploadResult.errors || [],
  }

  const publicTasks = []
  entries.forEach(function(entry) {
    const tune = workingTunes[entry.tuneId]
    const link = tune && Array.isArray(tune.links) ? tune.links[entry.linkIndex] : entry.link
    const status = link ? getOwnedMediaSyncStatus(link) : entry.status
    const googleId = link && link.googleId ? link.googleId : entry.googleId
    if (status === 'local' || status === 'pending' || !googleId) {
      summary.notUploadable.push(entry.tuneName + ' — ' + entry.linkTitle + ' (could not upload)')
      return
    }
    if (entry.alreadyPublic || hasAudioPublicConfirm(googleId)) {
      summary.alreadyPublic += 1
      return
    }
    publicTasks.push({
      kind: 'audio',
      entry: entry,
      googleId: googleId,
      label: entry.tuneName + ' — ' + entry.linkTitle,
    })
  })

  const tuneIds = collectTuneIdsInScope(workingTunes, scope)
  let fileEntries = collectTuneFilesForShareScope(workingTunes, tuneIds)
  if (driveApi && typeof driveApi.listPermissions === 'function') {
    fileEntries = await Promise.all(fileEntries.map(function(entry) {
      if (!entry.googleId || entry.status !== 'synced') {
        return Promise.resolve(Object.assign({}, entry, { alreadyPublic: false }))
      }
      return driveApi.listPermissions(entry.googleId).then(function(res) {
        return Object.assign({}, entry, { alreadyPublic: isAnyoneReadable(res) })
      }).catch(function() {
        return Object.assign({}, entry, { alreadyPublic: false })
      })
    }))
  }

  fileEntries.forEach(function(entry) {
    const status = entry.status || getTuneFileSyncStatus(entry.meta)
    const googleId = entry.googleId
    if (status === 'local' || status === 'pending' || !googleId) {
      summary.notUploadable.push(entry.tuneName + ' — ' + entry.fileName + ' (could not upload)')
      return
    }
    if (entry.alreadyPublic || hasFilePublicConfirm(googleId)) {
      summary.alreadyPublic += 1
      return
    }
    publicTasks.push({
      kind: 'file',
      entry: entry,
      googleId: googleId,
      label: entry.tuneName + ' — ' + entry.fileName,
    })
  })

  emitShareMediaProgress(opts, {
    phase: 'permissions',
    current: 0,
    total: publicTasks.length,
    message: publicTasks.length > 0 ? 'Making audio files publicly readable…' : 'No public permission changes needed.',
  })

  const publicizeResult = await publicizeDriveFiles(driveApi, publicTasks.map(function(task) {
    return {
      googleId: task.googleId,
      kind: task.kind,
      label: task.label,
    }
  }), {
    autoConfirmPublic: autoConfirmPublic,
    confirm: autoConfirmPublic ? null : confirmFn,
    onProgress: function(progress) {
      emitShareMediaProgress(opts, Object.assign({ phase: 'permissions' }, progress))
    },
    onEvent: function(event) {
      emitShareMediaEvent(opts, event)
    },
  })

  summary.shared = publicizeResult.shared
  summary.skipped += publicizeResult.skipped
  summary.failed = publicizeResult.failed
  summary.alreadyPublic += publicizeResult.alreadyPublic
  summary.cancelled += publicizeResult.cancelled

  emitShareMediaProgress(opts, {
    phase: 'permissions',
    current: publicTasks.length,
    total: Math.max(publicTasks.length, 1),
    message: 'Audio sharing complete.',
  })

  emitShareMediaEvent(opts, {
    type: 'success',
    message: 'Finished preparing audio for sharing.',
  })

  return {
    summary: summary,
    tunes: workingTunes,
    entries: entries,
    fileEntries: fileEntries,
  }
}
