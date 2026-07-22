import utilsFunctions from './utilsFunctions'
import {
  copyScratchpadBlob,
  deleteScratchpadBlobsForItem,
  putScratchpadBlob,
  scratchpadBlobKey,
} from './scratchpadBlobs'
import {
  createDefaultAudioProject,
  createDefaultSyncMeta,
  migrateLegacyAudioItem,
  normalizeAudioProject,
  collectProjectBlobKeys,
  nowIso,
  generateTrackId,
  generateTakeId,
} from './scratchpadAudioProject'

const utils = utilsFunctions()

const WORKSPACES_KEY = 'bookstorage_scratchpad_workspaces'
const ITEMS_KEY = 'bookstorage_scratchpad_items'
const ACTIVE_WORKSPACE_KEY = 'bookstorage_scratchpad_active_workspace'

const changeListeners = []

export const SCRATCHPAD_ITEM_TYPES = ['text', 'image', 'notation', 'audio']

export function subscribeScratchpad(listener) {
  if (typeof listener !== 'function') return function() {}
  changeListeners.push(listener)
  return function() {
    const idx = changeListeners.indexOf(listener)
    if (idx !== -1) changeListeners.splice(idx, 1)
  }
}

export function notifyScratchpadChanged() {
  changeListeners.forEach(function(listener) {
    try { listener() } catch (e) { /* ignore */ }
  })
}

function readJson(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (e) {
    return {}
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value || {}))
}

function readWorkspacesMap() {
  return readJson(WORKSPACES_KEY)
}

function writeWorkspacesMap(map) {
  writeJson(WORKSPACES_KEY, map)
}

function readItemsMap() {
  return readJson(ITEMS_KEY)
}

function writeItemsMap(map) {
  writeJson(ITEMS_KEY, map)
}

export function markScratchpadUploadPending(itemId) {
  const item = getScratchpadItem(itemId)
  if (!item) return null
  return saveScratchpadItem(Object.assign({}, item, {
    sync: Object.assign({}, item.sync || createDefaultSyncMeta(), {
      uploadPending: true,
      updatedAt: nowIso(),
    }),
  }))
}

export function markScratchpadSynced(itemId, patch) {
  const item = getScratchpadItem(itemId)
  if (!item) return null
  return saveScratchpadItem(Object.assign({}, item, {
    sync: Object.assign({}, item.sync || createDefaultSyncMeta(), patch || {}, {
      uploadPending: false,
      updatedAt: nowIso(),
    }),
  }))
}

export function listAllScratchpadItems() {
  const map = readItemsMap()
  return Object.keys(map).map(function(id) {
    return normalizeItem(map[id], id)
  })
}

export function listAllWorkspacesRaw() {
  const map = readWorkspacesMap()
  return Object.keys(map).map(function(id) {
    return normalizeWorkspace(map[id], id)
  })
}

export function replaceAllScratchpadData(workspaces, items) {
  const wsMap = {}
  ;(workspaces || []).forEach(function(ws) {
    if (!ws || !ws.id) return
    const copy = Object.assign({}, ws)
    delete copy.id
    wsMap[ws.id] = copy
  })
  const itemsMap = {}
  ;(items || []).forEach(function(item) {
    if (!item || !item.id) return
    const copy = Object.assign({}, item)
    delete copy.id
    itemsMap[item.id] = copy
  })
  writeWorkspacesMap(wsMap)
  writeItemsMap(itemsMap)
  notifyScratchpadChanged()
}

export function buildPreviewText(body, maxLines) {
  const lines = String(body || '').split('\n')
  return lines.slice(0, maxLines || 5).join('\n')
}

function normalizeWorkspace(record, workspaceId) {
  const next = Object.assign({}, record || {})
  if (workspaceId) next.id = workspaceId
  next.name = String(next.name || 'Workspace').trim() || 'Workspace'
  next.itemOrder = Array.isArray(next.itemOrder) ? next.itemOrder.slice() : []
  next.createdAt = next.createdAt || Date.now()
  next.updatedAt = next.updatedAt || next.createdAt
  return next
}

function migrateLegacyMidiItem(record, itemId) {
  if (!record || record.type !== 'midi') return record
  const id = itemId || record.id
  const snapshot = record.midi && record.midi.tuneSnapshot
    ? Object.assign({}, record.midi.tuneSnapshot, { id: id || record.midi.tuneSnapshot.id })
    : blankNotationTune(id, record.title)
  const next = Object.assign({}, record, {
    type: 'notation',
    notation: { tuneSnapshot: snapshot },
  })
  delete next.midi
  return next
}

function normalizeItem(record, itemId) {
  let next = Object.assign({}, record || {})
  if (itemId) next.id = itemId
  next = migrateLegacyMidiItem(next, itemId)
  if (next.type === 'audio') {
    next = migrateLegacyAudioItem(next)
  }
  if (!next.sync) {
    next.sync = createDefaultSyncMeta()
  } else {
    next.sync = Object.assign(createDefaultSyncMeta(), next.sync)
  }
  next.title = String(next.title || 'Untitled').trim() || 'Untitled'
  next.type = SCRATCHPAD_ITEM_TYPES.indexOf(next.type) >= 0 ? next.type : 'text'
  next.workspaceId = String(next.workspaceId || '')
  next.createdAt = next.createdAt || Date.now()
  next.updatedAt = next.updatedAt || next.createdAt
  if (next.type === 'text' && next.text) {
    next.previewText = buildPreviewText(next.text.body)
  }
  return next
}

export function getActiveWorkspaceId() {
  try {
    return localStorage.getItem(ACTIVE_WORKSPACE_KEY) || ''
  } catch (e) {
    return ''
  }
}

export function setActiveWorkspaceId(workspaceId) {
  if (!workspaceId) {
    localStorage.removeItem(ACTIVE_WORKSPACE_KEY)
  } else {
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, workspaceId)
  }
  notifyScratchpadChanged()
}

export function listWorkspaces() {
  const map = readWorkspacesMap()
  return Object.keys(map).map(function(id) {
    return normalizeWorkspace(map[id], id)
  }).sort(function(a, b) {
    return String(a.name || '').localeCompare(String(b.name || ''))
  })
}

export function getWorkspace(workspaceId) {
  if (!workspaceId) return null
  const map = readWorkspacesMap()
  if (!map[workspaceId]) return null
  return normalizeWorkspace(map[workspaceId], workspaceId)
}

export function ensureDefaultWorkspace() {
  const workspaces = listWorkspaces()
  if (workspaces.length > 0) {
    const active = getActiveWorkspaceId()
    if (!active || !getWorkspace(active)) {
      setActiveWorkspaceId(workspaces[0].id)
    }
    return getWorkspace(getActiveWorkspaceId()) || workspaces[0]
  }
  return createWorkspace('Default')
}

export function createWorkspace(name) {
  const id = utils.generateObjectId()
  const now = Date.now()
  const workspace = {
    name: String(name || 'Workspace').trim() || 'Workspace',
    createdAt: now,
    updatedAt: now,
    itemOrder: [],
    syncVersion: 0,
  }
  const map = readWorkspacesMap()
  map[id] = workspace
  writeWorkspacesMap(map)
  setActiveWorkspaceId(id)
  notifyScratchpadChanged()
  return normalizeWorkspace(workspace, id)
}

export function renameWorkspace(workspaceId, name) {
  const map = readWorkspacesMap()
  if (!map[workspaceId]) return null
  map[workspaceId] = Object.assign({}, map[workspaceId], {
    name: String(name || 'Workspace').trim() || 'Workspace',
    updatedAt: Date.now(),
  })
  writeWorkspacesMap(map)
  notifyScratchpadChanged()
  return normalizeWorkspace(map[workspaceId], workspaceId)
}

export function deleteWorkspace(workspaceId) {
  const map = readWorkspacesMap()
  if (!map[workspaceId]) return false
  const workspace = normalizeWorkspace(map[workspaceId], workspaceId)
  workspace.itemOrder.forEach(function(itemId) {
    deleteScratchpadItem(itemId)
  })
  delete map[workspaceId]
  writeWorkspacesMap(map)
  if (getActiveWorkspaceId() === workspaceId) {
    const remaining = listWorkspaces()
    if (remaining.length > 0) {
      setActiveWorkspaceId(remaining[0].id)
    } else {
      setActiveWorkspaceId('')
    }
  }
  notifyScratchpadChanged()
  return true
}

export function listItems(workspaceId) {
  const ws = workspaceId ? getWorkspace(workspaceId) : null
  if (!ws) return []
  const itemsMap = readItemsMap()
  return (ws.itemOrder || []).map(function(itemId) {
    if (!itemsMap[itemId]) return null
    return normalizeItem(itemsMap[itemId], itemId)
  }).filter(Boolean)
}

export function getScratchpadItem(itemId) {
  if (!itemId) return null
  const map = readItemsMap()
  if (!map[itemId]) return null
  const wasLegacyMidi = map[itemId].type === 'midi'
  const wasLegacyAudio = map[itemId].type === 'audio' && map[itemId].audio && map[itemId].audio.blobKey && !map[itemId].audio.tracks
  let item = normalizeItem(map[itemId], itemId)
  if (wasLegacyMidi && item.type === 'notation') {
    saveScratchpadItem(item)
  }
  if (wasLegacyAudio) {
    saveScratchpadItem(item)
  }
  return item
}

function addItemToWorkspaceOrder(workspaceId, itemId) {
  const map = readWorkspacesMap()
  if (!map[workspaceId]) return
  const order = Array.isArray(map[workspaceId].itemOrder) ? map[workspaceId].itemOrder.slice() : []
  if (order.indexOf(itemId) === -1) order.unshift(itemId)
  map[workspaceId] = Object.assign({}, map[workspaceId], {
    itemOrder: order,
    updatedAt: Date.now(),
  })
  writeWorkspacesMap(map)
}

function removeItemFromWorkspaceOrder(workspaceId, itemId) {
  const map = readWorkspacesMap()
  if (!map[workspaceId]) return
  const order = (map[workspaceId].itemOrder || []).filter(function(id) { return id !== itemId })
  map[workspaceId] = Object.assign({}, map[workspaceId], {
    itemOrder: order,
    updatedAt: Date.now(),
  })
  writeWorkspacesMap(map)
}

export function saveScratchpadItem(item) {
  const itemsMap = readItemsMap()
  const id = item.id || utils.generateObjectId()
  const existing = itemsMap[id] || {}
  const workspaceId = item.workspaceId || existing.workspaceId
  if (!workspaceId) throw new Error('Scratchpad item requires workspaceId')

  const next = normalizeItem(Object.assign({}, existing, item, {
    id: id,
    workspaceId: workspaceId,
    updatedAt: Date.now(),
    createdAt: existing.createdAt || item.createdAt || Date.now(),
    sync: Object.assign(createDefaultSyncMeta(), existing.sync || {}, item.sync || {}, {
      uploadPending: true,
      updatedAt: nowIso(),
    }),
  }), id)

  if (next.type === 'notation') delete next.midi

  if (next.type === 'text' && next.text) {
    next.previewText = buildPreviewText(next.text.body)
  }

  delete next.id
  itemsMap[id] = next
  writeItemsMap(itemsMap)
  addItemToWorkspaceOrder(workspaceId, id)
  notifyScratchpadChanged()
  return normalizeItem(next, id)
}

export async function createScratchpadItem(options) {
  const opts = options || {}
  const workspaceId = opts.workspaceId || getActiveWorkspaceId() || ensureDefaultWorkspace().id
  const type = SCRATCHPAD_ITEM_TYPES.indexOf(opts.type) >= 0 ? opts.type : 'text'
  const id = utils.generateObjectId()
  const now = Date.now()
  const title = String(opts.title || '').trim() || defaultTitleForType(type)

  const item = {
    id: id,
    workspaceId: workspaceId,
    type: type,
    title: title,
    createdAt: now,
    updatedAt: now,
    sync: createDefaultSyncMeta(),
  }

  if (type === 'text') {
    item.text = {
      body: opts.textBody || '',
      chordProSource: opts.chordProSource || '',
    }
    item.previewText = buildPreviewText(item.text.body)
  } else if (type === 'image') {
    const blobKey = scratchpadBlobKey(id, 'image')
    if (opts.blob) {
      await putScratchpadBlob(blobKey, opts.blob)
    }
    item.image = {
      blobKey: blobKey,
      strokes: [],
      textBlocks: [],
    }
  } else if (type === 'notation') {
    item.notation = {
      tuneSnapshot: opts.tuneSnapshot || blankNotationTune(id, title),
    }
  } else if (type === 'audio') {
    item.audio = createDefaultAudioProject(id)
    if (opts.blob) {
      const track = item.audio.tracks[0]
      const take = track.takes[0]
      await putScratchpadBlob(take.blobKey, opts.blob)
      take.recordedAt = Date.now()
    }
  }

  return saveScratchpadItem(item)
}

function defaultTitleForType(type) {
  if (type === 'text') return 'Text note'
  if (type === 'image') return 'Image'
  if (type === 'notation') return 'Notation'
  if (type === 'audio') return 'Audio'
  return 'Scratchpad item'
}

export function blankNotationTune(id, title) {
  return {
    id: id || utils.generateObjectId(),
    name: title || 'Notation',
    composer: '',
    key: 'C',
    meter: '4/4',
    noteLength: '1/8',
    rhythm: '',
    voices: {
      V: { notes: ['z4'], meta: { clef: 'treble' } },
    },
    words: [],
    wLines: [],
    links: [],
    tuneFiles: [],
  }
}

export function updateScratchpadItem(itemId, patch) {
  const existing = getScratchpadItem(itemId)
  if (!existing) return null
  return saveScratchpadItem(Object.assign({}, existing, patch, { id: itemId }))
}

export function moveScratchpadItem(itemId, targetWorkspaceId) {
  const item = getScratchpadItem(itemId)
  if (!item || !targetWorkspaceId) return null
  if (item.workspaceId === targetWorkspaceId) return item
  removeItemFromWorkspaceOrder(item.workspaceId, itemId)
  return saveScratchpadItem(Object.assign({}, item, { workspaceId: targetWorkspaceId }))
}

export async function copyScratchpadItem(itemId, targetWorkspaceId, options) {
  const item = getScratchpadItem(itemId)
  if (!item) return null
  const newId = utils.generateObjectId()
  const workspaceId = targetWorkspaceId || item.workspaceId
  const customTitle = options && options.title ? String(options.title).trim() : ''
  const copy = Object.assign({}, item, {
    id: newId,
    workspaceId: workspaceId,
    title: customTitle || (item.title || 'Untitled') + ' copy',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    linkedTuneId: undefined,
  })

  if (item.type === 'image' && item.image && item.image.blobKey) {
    const newKey = scratchpadBlobKey(newId, 'image')
    await copyScratchpadBlob(item.image.blobKey, newKey)
    copy.image = Object.assign({}, item.image, { blobKey: newKey })
  } else if (item.type === 'audio' && item.audio) {
    const audio = normalizeAudioProject(item)
    const keyMap = {}
    const tracks = (audio.tracks || []).map(function(track) {
      const nextTrackId = generateTrackId()
      const nextTrack = Object.assign({}, track, { id: nextTrackId })
      nextTrack.takes = (track.takes || []).map(function(take) {
        const nextTakeId = generateTakeId()
        const nextTake = Object.assign({}, take, { id: nextTakeId })
        if (track.type === 'midi') {
          if (take.midiBlobKey) {
            const newKey = take.midiBlobKey.replace(item.id, newId)
            keyMap[take.midiBlobKey] = newKey
            nextTake.midiBlobKey = newKey
          }
          if (take.previewBlobKey) {
            const newKey = take.previewBlobKey.replace(item.id, newId)
            keyMap[take.previewBlobKey] = newKey
            nextTake.previewBlobKey = newKey
          }
        } else if (take.blobKey) {
          const newKey = take.blobKey.replace(item.id, newId)
          keyMap[take.blobKey] = newKey
          nextTake.blobKey = newKey
        }
        nextTake.driveFileId = null
        return nextTake
      })
      nextTrack.activeTakeId = nextTrack.takes[0] ? nextTrack.takes[0].id : null
      return nextTrack
    })
    copy.audio = Object.assign({}, audio, { tracks: tracks, mixdownBlobKey: null, mixdownDriveFileId: null })
    copy.sync = createDefaultSyncMeta()
    const blobKeys = collectProjectBlobKeys(item.audio)
    for (let i = 0; i < blobKeys.length; i += 1) {
      const srcKey = blobKeys[i]
      const destKey = keyMap[srcKey] || srcKey.replace(item.id, newId)
      await copyScratchpadBlob(srcKey, destKey)
    }
  } else if (item.type === 'notation' && item.notation) {
    copy.notation = {
      tuneSnapshot: JSON.parse(JSON.stringify(item.notation.tuneSnapshot || blankNotationTune(newId, copy.title))),
    }
    if (copy.notation.tuneSnapshot) copy.notation.tuneSnapshot.id = newId
  }

  return saveScratchpadItem(copy)
}

export function deleteScratchpadItem(itemId) {
  const item = getScratchpadItem(itemId)
  if (!item) return false
  removeItemFromWorkspaceOrder(item.workspaceId, itemId)
  const map = readItemsMap()
  delete map[itemId]
  writeItemsMap(map)
  deleteScratchpadBlobsForItem(itemId)
  notifyScratchpadChanged()
  return true
}

export function getNotationPreviewAbc(item) {
  if (!item) return ''
  const tune = item.type === 'notation' && item.notation ? item.notation.tuneSnapshot : null
  if (!tune) return ''
  const voice = tune.voices && Object.keys(tune.voices).length > 0
    ? tune.voices[Object.keys(tune.voices)[0]]
    : null
  const notes = voice && Array.isArray(voice.notes) ? voice.notes.join(' ') : 'z4'
  return [
    'X:1',
    'T:' + (tune.name || 'Tune'),
    'M:' + (tune.meter || '4/4'),
    'L:' + (tune.noteLength || '1/8'),
    'K:' + (tune.key || 'C'),
    notes,
  ].join('\n')
}
