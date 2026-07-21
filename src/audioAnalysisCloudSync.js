/**
 * Sync Audio Analysis groups/sets/blobs with Google Drive under TuneBook/AudioAnalysis/.
 * Supports create/update and delete (tombstones) including offline deletes then sync.
 */
import {
  listGroups,
  listSets,
  listDeletedSets,
  listDeletedGroups,
  replaceAllMeta,
  replaceDeletedMeta,
  getNoteAudioBlob,
  putNoteAudioBlob,
  markSetsSynced,
  markGroupsSynced
} from './soundpostSetStore'

export const AUDIO_ANALYSIS_INDEX_NAME = 'audio-analysis-index.json'
export const AUDIO_ANALYSIS_BLOBS_FOLDER = 'blobs'

function nowIso() {
  return new Date().toISOString()
}

function isNewer(a, b) {
  return String((a && a.updatedAt) || '') >= String((b && b.updatedAt) || '')
}

export function mergeById(localList, remoteList) {
  const map = {}
  ;(remoteList || []).forEach(function(item) {
    if (item && item.id) map[item.id] = item
  })
  ;(localList || []).forEach(function(item) {
    if (!item || !item.id) return
    if (!map[item.id] || isNewer(item, map[item.id])) {
      map[item.id] = item
    }
  })
  return Object.keys(map).map(function(id) { return map[id] })
}

export function mergeTombstones(localList, remoteList) {
  const map = {}
  function add(list) {
    ;(list || []).forEach(function(t) {
      if (!t || !t.id) return
      const prev = map[t.id]
      if (!prev || String(t.deletedAt || '') >= String(prev.deletedAt || '')) {
        map[t.id] = Object.assign({}, prev || {}, t)
      }
    })
  }
  add(remoteList)
  add(localList)
  return Object.keys(map).map(function(id) { return map[id] })
}

/** Drop live items that have a tombstone newer than the item's updatedAt. */
export function applyTombstones(items, tombstones) {
  const byId = {}
  ;(tombstones || []).forEach(function(t) {
    if (t && t.id) byId[t.id] = t
  })
  return (items || []).filter(function(item) {
    if (!item || !item.id) return false
    const t = byId[item.id]
    if (!t) return true
    return String(item.updatedAt || '') > String(t.deletedAt || '')
  })
}

async function findChildByName(driveApi, parentId, name) {
  if (!driveApi || !parentId || !name) return null
  if (typeof driveApi.findFileInFolder === 'function') {
    return driveApi.findFileInFolder(parentId, name)
  }
  return null
}

async function ensureBlobsFolder(driveApi, analysisFolderId) {
  let id = await findChildByName(driveApi, analysisFolderId, AUDIO_ANALYSIS_BLOBS_FOLDER)
  if (id) return id
  const created = await driveApi.createDocument(
    AUDIO_ANALYSIS_BLOBS_FOLDER,
    null,
    'application/vnd.google-apps.folder',
    'Audio Analysis note audio blobs',
    analysisFolderId
  )
  return created && !created.error ? created : null
}

async function loadRemoteIndex(driveApi, analysisFolderId) {
  const indexId = await findChildByName(driveApi, analysisFolderId, AUDIO_ANALYSIS_INDEX_NAME)
  if (!indexId) return { indexId: null, data: null }
  const blob = await driveApi.getDocumentBlob(indexId)
  if (!blob || blob.error) return { indexId: indexId, data: null }
  try {
    const text = await blob.text()
    const data = JSON.parse(text)
    return { indexId: indexId, data: data }
  } catch (e) {
    return { indexId: indexId, data: null }
  }
}

async function uploadOrUpdateJson(driveApi, folderId, fileId, name, obj) {
  const body = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })
  if (fileId) {
    await driveApi.updateDocumentData(fileId, body)
    return fileId
  }
  const created = await driveApi.createDocument(
    name,
    body,
    'application/json',
    'Audio Analysis sync index',
    folderId
  )
  return created && !created.error ? created : null
}

async function ensureBlobOnDrive(driveApi, blobsFolderId, note) {
  if (!note || !note.audioBlobKey) return note
  const localBlob = await getNoteAudioBlob(note.audioBlobKey)
  if (!localBlob) {
    if (note.driveFileId) {
      const remote = await driveApi.getDocumentBlob(note.driveFileId)
      if (remote && !remote.error) {
        await putNoteAudioBlob(note.audioBlobKey, remote)
      }
    }
    return note
  }
  if (note.driveFileId) {
    await driveApi.updateDocumentData(note.driveFileId, localBlob)
    return note
  }
  const filename = note.audioBlobKey + '.wav'
  const created = await driveApi.createDocument(
    filename,
    localBlob,
    'audio/wav',
    'Audio Analysis note recording',
    blobsFolderId
  )
  if (created && !created.error) {
    return Object.assign({}, note, { driveFileId: created })
  }
  return note
}

async function ensureBlobLocal(driveApi, note) {
  if (!note || !note.audioBlobKey) return
  const existing = await getNoteAudioBlob(note.audioBlobKey)
  if (existing) return
  if (!note.driveFileId) return
  const remote = await driveApi.getDocumentBlob(note.driveFileId)
  if (remote && !remote.error) {
    await putNoteAudioBlob(note.audioBlobKey, remote)
  }
}

async function deleteDriveFiles(driveApi, fileIds) {
  let deleted = 0
  for (let i = 0; i < (fileIds || []).length; i++) {
    const id = fileIds[i]
    if (!id || typeof driveApi.deleteDocument !== 'function') continue
    try {
      await driveApi.deleteDocument(id)
      deleted++
    } catch (e) {
      /* ignore missing remote files */
    }
  }
  return deleted
}

/**
 * Two-way sync including deletes.
 */
export async function syncAudioAnalysisWithDrive(driveApi, options) {
  const opts = options || {}
  if (!driveApi) {
    return { ok: false, error: 'Not signed in' }
  }
  if (typeof driveApi.findTuneBookFolderInDrive !== 'function') {
    return { ok: false, error: 'Drive API unavailable' }
  }

  const parentId = await driveApi.findTuneBookFolderInDrive()
  if (!parentId) {
    return { ok: false, error: 'TuneBook folder not found — open or create your tunebook folder first' }
  }
  const analysisFolderId = await driveApi.findOrCreateAudioAnalysisFolderInDrive(parentId)
  if (!analysisFolderId) {
    return { ok: false, error: 'Could not create AudioAnalysis folder' }
  }
  const blobsFolderId = await ensureBlobsFolder(driveApi, analysisFolderId)
  if (!blobsFolderId) {
    return { ok: false, error: 'Could not create blobs folder' }
  }

  const localGroups = await listGroups()
  const localSets = await listSets()
  const localDeletedSets = await listDeletedSets()
  const localDeletedGroups = await listDeletedGroups()

  const remote = await loadRemoteIndex(driveApi, analysisFolderId)
  const remoteGroups = remote.data && remote.data.groups ? remote.data.groups : []
  const remoteSets = remote.data && remote.data.sets ? remote.data.sets : []
  const remoteDeletedSets = remote.data && remote.data.deletedSets ? remote.data.deletedSets : []
  const remoteDeletedGroups = remote.data && remote.data.deletedGroups ? remote.data.deletedGroups : []

  const mergedDeletedSets = mergeTombstones(localDeletedSets, remoteDeletedSets)
  const mergedDeletedGroups = mergeTombstones(localDeletedGroups, remoteDeletedGroups)

  // Collect drive file ids to delete for tombstoned sets (from remote or local tombstone)
  const remoteSetById = {}
  remoteSets.forEach(function(s) { if (s && s.id) remoteSetById[s.id] = s })
  const blobIdsToDelete = []
  mergedDeletedSets.forEach(function(t) {
    ;(t.driveFileIds || []).forEach(function(id) { blobIdsToDelete.push(id) })
    const remoteSet = remoteSetById[t.id]
    if (remoteSet && remoteSet.notes) {
      remoteSet.notes.forEach(function(n) {
        if (n && n.driveFileId) blobIdsToDelete.push(n.driveFileId)
      })
    }
  })
  const uniqueBlobDeletes = Array.from(new Set(blobIdsToDelete))
  const deletedBlobs = await deleteDriveFiles(driveApi, uniqueBlobDeletes)

  let mergedGroups = applyTombstones(mergeById(localGroups, remoteGroups), mergedDeletedGroups)
  let mergedSets = applyTombstones(mergeById(localSets, remoteSets), mergedDeletedSets)

  let uploaded = 0
  let downloaded = 0

  for (let i = 0; i < mergedSets.length; i++) {
    const notes = mergedSets[i].notes || []
    for (let j = 0; j < notes.length; j++) {
      const before = await getNoteAudioBlob(notes[j].audioBlobKey)
      await ensureBlobLocal(driveApi, notes[j])
      const after = await getNoteAudioBlob(notes[j].audioBlobKey)
      if (!before && after) downloaded++
    }
  }

  const remoteNoteDriveIds = {}
  remoteSets.forEach(function(set) {
    ;(set.notes || []).forEach(function(n) {
      if (n && n.audioBlobKey && n.driveFileId) {
        remoteNoteDriveIds[n.audioBlobKey] = n.driveFileId
      }
    })
  })

  const nextSets = []
  for (let i = 0; i < mergedSets.length; i++) {
    const set = mergedSets[i]
    const notes = set.notes || []
    const nextNotes = []
    for (let j = 0; j < notes.length; j++) {
      let note = notes[j]
      if (!note.driveFileId && remoteNoteDriveIds[note.audioBlobKey]) {
        note = Object.assign({}, note, { driveFileId: remoteNoteDriveIds[note.audioBlobKey] })
      }
      const hadDrive = !!note.driveFileId
      const updated = await ensureBlobOnDrive(driveApi, blobsFolderId, note)
      if (updated.driveFileId && !hadDrive) uploaded++
      nextNotes.push(updated)
    }
    nextSets.push(Object.assign({}, set, { notes: nextNotes, needsSync: false }))
  }
  mergedSets = nextSets

  await replaceAllMeta(mergedGroups, mergedSets)
  await replaceDeletedMeta(mergedDeletedSets, mergedDeletedGroups)
  await markSetsSynced(mergedSets.map(function(s) { return s.id }))
  await markGroupsSynced(mergedGroups.map(function(g) { return g.id }))

  const indexPayload = {
    version: 2,
    updatedAt: nowIso(),
    groups: mergedGroups,
    sets: mergedSets,
    deletedSets: mergedDeletedSets,
    deletedGroups: mergedDeletedGroups
  }
  await uploadOrUpdateJson(
    driveApi,
    analysisFolderId,
    remote.indexId,
    AUDIO_ANALYSIS_INDEX_NAME,
    indexPayload
  )

  if (typeof opts.onProgress === 'function') {
    opts.onProgress({
      uploaded: uploaded,
      downloaded: downloaded,
      deleted: deletedBlobs,
      sets: mergedSets.length
    })
  }

  return {
    ok: true,
    uploaded: uploaded,
    downloaded: downloaded,
    deleted: deletedBlobs,
    deletedSets: mergedDeletedSets.length,
    sets: mergedSets.length,
    groups: mergedGroups.length
  }
}
