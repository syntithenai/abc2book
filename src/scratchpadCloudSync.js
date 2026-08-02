/**
 * Sync scratchpad workspaces/items/blobs with Google Drive under TuneBook/Scratchpad/.
 */
import {
  listAllScratchpadItems,
  listAllWorkspacesRaw,
  listWorkspaces,
  replaceAllScratchpadData,
  notifyScratchpadChanged,
  listScratchpadTombstones,
  clearScratchpadTombstones,
} from './scratchpadStore'
import { normalizeAudioProject } from './scratchpadAudioProject'
import { getScratchpadBlob as getBlob, putScratchpadBlob as putBlob } from './scratchpadBlobs'
import { mergeById, mergeTombstones, applyTombstones } from './audioAnalysisCloudSync'
import {
  enqueueScratchpadDriveDeletes,
  flushScratchpadDriveDeletes,
} from './scratchpadDriveDeletes'

export const SCRATCHPAD_INDEX_NAME = 'scratchpad-index.json'
export const SCRATCHPAD_ITEMS_FOLDER = 'items'
export const SCRATCHPAD_AUDIO_FOLDER = 'audio'

function nowIso() {
  return new Date().toISOString()
}

async function findChildByName(driveApi, parentId, name) {
  if (!driveApi || !parentId || !name) return null
  if (typeof driveApi.findFileInFolder === 'function') {
    return driveApi.findFileInFolder(parentId, name)
  }
  return null
}

async function ensureFolder(driveApi, parentId, name, description) {
  const existing = await findChildByName(driveApi, parentId, name)
  if (existing) return existing
  const created = await driveApi.createDocument(
    name,
    null,
    'application/vnd.google-apps.folder',
    description || name,
    parentId
  )
  return created && !created.error ? created : null
}

async function loadRemoteIndex(driveApi, scratchpadFolderId) {
  const indexId = await findChildByName(driveApi, scratchpadFolderId, SCRATCHPAD_INDEX_NAME)
  if (!indexId) return { indexId: null, data: null }
  const blob = await driveApi.getDocumentBlob(indexId)
  if (!blob || blob.error) return { indexId: indexId, data: null }
  try {
    const text = await blob.text()
    return { indexId: indexId, data: JSON.parse(text) }
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
  const created = await driveApi.createDocument(name, body, 'application/json', 'Scratchpad sync index', folderId)
  return created && !created.error ? created : null
}

function stripItemForIndex(item) {
  if (!item) return null
  const copy = JSON.parse(JSON.stringify(item))
  return copy
}

function collectDriveIdsFromItem(item) {
  const refs = collectItemBlobRefs(item)
  const ids = refs.map(function(ref) { return ref.driveFileId }).filter(Boolean)
  if (item && item.type === 'audio' && item.audio && item.audio.projectDriveFileId) {
    ids.push(item.audio.projectDriveFileId)
  }
  if (item && item.type === 'text' && item.text && item.text.driveFileId) {
    ids.push(item.text.driveFileId)
  }
  if (item && item.type === 'notation' && item.notation && item.notation.driveFileId) {
    ids.push(item.notation.driveFileId)
  }
  if (item && item.type === 'composition' && item.composition && item.composition.driveFileId) {
    ids.push(item.composition.driveFileId)
  }
  if (item && item.type === 'image' && item.image && item.image.driveFileId) {
    ids.push(item.image.driveFileId)
  }
  return Array.from(new Set(ids.map(String)))
}

function findOrphanedDriveIds(remoteItem, localItem) {
  if (!remoteItem) return []
  const remoteIds = collectDriveIdsFromItem(remoteItem)
  const localSet = {}
  collectDriveIdsFromItem(localItem).forEach(function(id) {
    localSet[id] = true
  })
  return remoteIds.filter(function(id) {
    return id && !localSet[id]
  })
}

function collectItemBlobRefs(item) {
  const refs = []
  if (!item) return refs
  if (item.type === 'image' && item.image && item.image.blobKey) {
    refs.push({ blobKey: item.image.blobKey, driveFileId: item.image.driveFileId || null, fileName: 'image' })
  }
  if (item.type === 'audio' && item.audio) {
    const audio = normalizeAudioProject(item)
    ;(audio.tracks || []).forEach(function(track) {
      ;(track.takes || []).forEach(function(take) {
        if (track.type === 'midi') {
          if (take.midiBlobKey) {
            refs.push({
              blobKey: take.midiBlobKey,
              driveFileId: take.driveFileId || null,
              fileName: 'midi-' + track.id + '-' + take.id + '.mid',
              subfolder: SCRATCHPAD_AUDIO_FOLDER,
            })
          }
          if (take.previewBlobKey) {
            refs.push({
              blobKey: take.previewBlobKey,
              driveFileId: null,
              fileName: 'midi-preview-' + track.id + '-' + take.id + '.wav',
              subfolder: SCRATCHPAD_AUDIO_FOLDER,
            })
          }
        } else if (take.blobKey) {
          refs.push({
            blobKey: take.blobKey,
            driveFileId: take.driveFileId || null,
            fileName: 'track-' + track.id + '-take-' + take.id + '.wav',
            subfolder: SCRATCHPAD_AUDIO_FOLDER,
          })
        }
      })
    })
    if (audio.mixdownBlobKey) {
      refs.push({
        blobKey: audio.mixdownBlobKey,
        driveFileId: audio.mixdownDriveFileId || null,
        fileName: 'mixdown.wav',
        subfolder: SCRATCHPAD_AUDIO_FOLDER,
      })
    }
  }
  return refs
}

async function ensureItemFolder(driveApi, itemsFolderId, item) {
  const folderName = item.id
  let folderId = item.sync && item.sync.driveFolderId
  if (folderId) return folderId
  folderId = await ensureFolder(driveApi, itemsFolderId, folderName, 'Scratchpad item ' + (item.title || item.id))
  return folderId
}

async function ensureAudioSubfolder(driveApi, itemFolderId) {
  return ensureFolder(driveApi, itemFolderId, SCRATCHPAD_AUDIO_FOLDER, 'Scratchpad audio project files')
}

async function uploadBlobRef(driveApi, parentFolderId, ref) {
  const localBlob = await getBlob(ref.blobKey)
  if (!localBlob) {
    if (ref.driveFileId) {
      const remote = await driveApi.getDocumentBlob(ref.driveFileId)
      if (remote && !remote.error) {
        await putBlob(ref.blobKey, remote)
      }
    }
    return ref
  }
  const folderId = ref.subfolder
    ? await ensureAudioSubfolder(driveApi, parentFolderId)
    : parentFolderId
  if (ref.driveFileId) {
    await driveApi.updateDocumentData(ref.driveFileId, localBlob)
    return ref
  }
  const created = await driveApi.createDocument(
    ref.fileName || 'blob',
    localBlob,
    localBlob.type || 'application/octet-stream',
    'Scratchpad blob',
    folderId
  )
  if (created && !created.error) {
    return Object.assign({}, ref, { driveFileId: created })
  }
  return ref
}

async function uploadTextItem(driveApi, itemFolderId, item) {
  if (item.type !== 'text' || !item.text) return item
  const body = new Blob([String(item.text.body || '')], { type: 'text/markdown' })
  const fileId = item.text.driveFileId || null
  if (fileId) {
    await driveApi.updateDocumentData(fileId, body)
    return item
  }
  const created = await driveApi.createDocument('text.md', body, 'text/markdown', 'Scratchpad text', itemFolderId)
  if (created && !created.error) {
    return Object.assign({}, item, {
      text: Object.assign({}, item.text, { driveFileId: created }),
    })
  }
  return item
}

async function uploadCompositionItem(driveApi, itemFolderId, item) {
  if (item.type !== 'composition' || !item.composition) return item
  const payload = {
    tuneSnapshot: item.composition.tuneSnapshot || {},
    lyricsChunks: item.composition.lyricsChunks || [],
    notationChunks: item.composition.notationChunks || [],
    pairings: item.composition.pairings || [],
    assemblyStale: item.composition.assemblyStale || false,
  }
  const body = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const fileId = item.composition.driveFileId || null
  if (fileId) {
    await driveApi.updateDocumentData(fileId, body)
    return item
  }
  const created = await driveApi.createDocument('composition.json', body, 'application/json', 'Scratchpad composition', itemFolderId)
  if (created && !created.error) {
    return Object.assign({}, item, {
      composition: Object.assign({}, item.composition, { driveFileId: created }),
    })
  }
  return item
}

async function uploadNotationItem(driveApi, itemFolderId, item) {
  if (item.type !== 'notation' || !item.notation) return item
  const tune = item.notation.tuneSnapshot || {}
  const body = new Blob([JSON.stringify(tune, null, 2)], { type: 'application/json' })
  const fileId = item.notation.driveFileId || null
  if (fileId) {
    await driveApi.updateDocumentData(fileId, body)
    return item
  }
  const created = await driveApi.createDocument('notation.json', body, 'application/json', 'Scratchpad notation', itemFolderId)
  if (created && !created.error) {
    return Object.assign({}, item, {
      notation: Object.assign({}, item.notation, { driveFileId: created }),
    })
  }
  return item
}

async function uploadAudioProjectJson(driveApi, audioFolderId, item) {
  const audio = normalizeAudioProject(item)
  const body = new Blob([JSON.stringify(audio, null, 2)], { type: 'application/json' })
  const fileId = audio.projectDriveFileId || null
  if (fileId) {
    await driveApi.updateDocumentData(fileId, body)
    return audio
  }
  const created = await driveApi.createDocument('project.json', body, 'application/json', 'Scratchpad audio project', audioFolderId)
  if (created && !created.error) {
    return Object.assign({}, audio, { projectDriveFileId: created })
  }
  return audio
}

function applyBlobRefsToItem(item, refs) {
  const refByKey = {}
  refs.forEach(function(r) { refByKey[r.blobKey] = r })
  if (item.type === 'image' && item.image && refByKey[item.image.blobKey]) {
    item.image = Object.assign({}, item.image, { driveFileId: refByKey[item.image.blobKey].driveFileId })
  }
  if (item.type === 'audio' && item.audio) {
    const audio = normalizeAudioProject(item)
  audio.tracks = (audio.tracks || []).map(function(track) {
      return Object.assign({}, track, {
        takes: (track.takes || []).map(function(take) {
          const next = Object.assign({}, take)
          if (take.blobKey && refByKey[take.blobKey]) {
            next.driveFileId = refByKey[take.blobKey].driveFileId
          }
          if (take.midiBlobKey && refByKey[take.midiBlobKey]) {
            next.driveFileId = refByKey[take.midiBlobKey].driveFileId
          }
          return next
        }),
      })
    })
    if (audio.mixdownBlobKey && refByKey[audio.mixdownBlobKey]) {
      audio.mixdownDriveFileId = refByKey[audio.mixdownBlobKey].driveFileId
    }
    item.audio = audio
  }
  return item
}

export async function syncScratchpadWithDrive(driveApi, options) {
  const opts = options || {}
  if (!driveApi || typeof driveApi.findTuneBookFolderInDrive !== 'function') {
    return { ok: false, error: 'Drive API unavailable' }
  }
  const parentId = await driveApi.findTuneBookFolderInDrive()
  if (!parentId) {
    return { ok: false, error: 'TuneBook folder not found' }
  }
  const scratchpadFolderId = await driveApi.findOrCreateScratchpadFolderInDrive(parentId)
  if (!scratchpadFolderId) {
    return { ok: false, error: 'Could not create Scratchpad folder' }
  }
  const itemsFolderId = await ensureFolder(
    driveApi,
    scratchpadFolderId,
    SCRATCHPAD_ITEMS_FOLDER,
    'Scratchpad items'
  )
  if (!itemsFolderId) {
    return { ok: false, error: 'Could not create items folder' }
  }

  await flushScratchpadDriveDeletes(driveApi, opts)

  const localWorkspaces = listAllWorkspacesRaw().map(function(ws) {
    return Object.assign({}, ws, { id: ws.id })
  })
  const localItems = listAllScratchpadItems()
  const remote = await loadRemoteIndex(driveApi, scratchpadFolderId)
  const remoteWorkspaces = remote.data && remote.data.workspaces ? remote.data.workspaces : []
  const remoteItems = remote.data && remote.data.items ? remote.data.items : []
  const remoteTombstones = remote.data && remote.data.tombstones ? remote.data.tombstones : []
  const localTombstones = listScratchpadTombstones()
  const remoteItemById = {}
  remoteItems.forEach(function(remoteItem) {
    if (remoteItem && remoteItem.id) remoteItemById[remoteItem.id] = remoteItem
  })

  const mergedTombstones = mergeTombstones(localTombstones, remoteTombstones)
  let mergedWorkspaces = applyTombstones(mergeById(localWorkspaces, remoteWorkspaces), mergedTombstones.filter(function(t) {
    return t.kind === 'workspace'
  }))
  let mergedItems = applyTombstones(mergeById(localItems, remoteItems), mergedTombstones.filter(function(t) {
    return t.kind === 'item'
  }))

  let uploaded = 0
  let downloaded = 0
  const nextItems = []

  for (let i = 0; i < mergedItems.length; i += 1) {
    let item = mergedItems[i]
    const remoteItem = remoteItemById[item.id]
    const orphanedRemoteIds = findOrphanedDriveIds(remoteItem, item)
    if (orphanedRemoteIds.length) {
      await enqueueScratchpadDriveDeletes(orphanedRemoteIds)
    }
    const itemFolderId = await ensureItemFolder(driveApi, itemsFolderId, item)
    if (itemFolderId && (!item.sync || !item.sync.driveFolderId)) {
      item = Object.assign({}, item, {
        sync: Object.assign({}, item.sync || {}, { driveFolderId: itemFolderId }),
      })
    }

    if (item.type === 'text') {
      item = await uploadTextItem(driveApi, itemFolderId, item)
    } else if (item.type === 'notation') {
      item = await uploadNotationItem(driveApi, itemFolderId, item)
    } else if (item.type === 'composition') {
      item = await uploadCompositionItem(driveApi, itemFolderId, item)
    } else if (item.type === 'audio') {
      const audioFolderId = await ensureAudioSubfolder(driveApi, itemFolderId)
      const audio = await uploadAudioProjectJson(driveApi, audioFolderId, item)
      item = Object.assign({}, item, { audio: audio })
    }

    const refs = collectItemBlobRefs(item)
    const nextRefs = []
    for (let j = 0; j < refs.length; j += 1) {
      const before = await getBlob(refs[j].blobKey)
      const updated = await uploadBlobRef(driveApi, itemFolderId, refs[j])
      if (!before && await getBlob(refs[j].blobKey)) downloaded += 1
      if (updated.driveFileId && !refs[j].driveFileId) uploaded += 1
      nextRefs.push(updated)
    }
    item = applyBlobRefsToItem(item, nextRefs)
    item = Object.assign({}, item, {
      sync: Object.assign({}, item.sync || {}, { uploadPending: false, updatedAt: nowIso() }),
    })
    nextItems.push(item)
  }

  replaceAllScratchpadData(
    mergedWorkspaces.map(function(ws) {
      return Object.assign({}, ws, { updatedAt: Date.now() })
    }),
    nextItems
  )
  notifyScratchpadChanged()

  const indexPayload = {
    version: 1,
    updatedAt: nowIso(),
    workspaces: mergedWorkspaces,
    items: nextItems.map(stripItemForIndex),
    tombstones: mergedTombstones,
  }
  await uploadOrUpdateJson(driveApi, scratchpadFolderId, remote.indexId, SCRATCHPAD_INDEX_NAME, indexPayload)
  await flushScratchpadDriveDeletes(driveApi, opts)
  clearScratchpadTombstones()

  if (typeof opts.onProgress === 'function') {
    opts.onProgress({ uploaded: uploaded, downloaded: downloaded, items: nextItems.length })
  }

  return { ok: true, uploaded: uploaded, downloaded: downloaded, items: nextItems.length }
}

export { mergeById, mergeTombstones, applyTombstones }
