import localforage from 'localforage'

const metaStore = localforage.createInstance({ name: 'audioanalysis-meta' })
const blobStore = localforage.createInstance({ name: 'audioanalysis-blobs' })

const GROUPS_KEY = 'groups'
const SETS_KEY = 'sets'
const DELETED_SETS_KEY = 'deletedSets'
const DELETED_GROUPS_KEY = 'deletedGroups'

function nowIso() {
  return new Date().toISOString()
}

function makeId(prefix) {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9)
}

async function readJson(key, fallback) {
  const v = await metaStore.getItem(key)
  return v != null ? v : fallback
}

async function writeJson(key, value) {
  await metaStore.setItem(key, value)
  return value
}

export async function listDeletedSets() {
  return readJson(DELETED_SETS_KEY, [])
}

export async function listDeletedGroups() {
  return readJson(DELETED_GROUPS_KEY, [])
}

export async function replaceDeletedMeta(deletedSets, deletedGroups) {
  await writeJson(DELETED_SETS_KEY, Array.isArray(deletedSets) ? deletedSets : [])
  await writeJson(DELETED_GROUPS_KEY, Array.isArray(deletedGroups) ? deletedGroups : [])
}

export async function listGroups() {
  const groups = await readJson(GROUPS_KEY, [])
  const deleted = await listDeletedGroups()
  const deletedIds = {}
  deleted.forEach(function(d) { if (d && d.id) deletedIds[d.id] = true })
  return groups.filter(function(g) { return g && !deletedIds[g.id] }).slice().sort(function(a, b) {
    return String(a.label || '').localeCompare(String(b.label || ''))
  })
}

/** Find a group by label (case-insensitive) or create one. Empty label → null (ungrouped). */
export async function findOrCreateGroupByLabel(label) {
  const trimmed = String(label || '').trim()
  if (!trimmed) return null
  const groups = await listGroups()
  const needle = trimmed.toLowerCase()
  const existing = groups.find(function(g) {
    return String(g.label || '').trim().toLowerCase() === needle
  })
  if (existing) return existing
  return saveGroup({ label: trimmed })
}

export async function saveGroup(group) {
  const groups = await readJson(GROUPS_KEY, [])
  const now = nowIso()
  let next
  if (group && group.id) {
    const idx = groups.findIndex(function(g) { return g.id === group.id })
    next = Object.assign({}, groups[idx] || {}, group, { updatedAt: now, needsSync: true })
    if (!next.createdAt) next.createdAt = now
    if (idx >= 0) groups[idx] = next
    else groups.push(next)
  } else {
    next = {
      id: makeId('grp'),
      label: (group && group.label) || 'Untitled group',
      createdAt: now,
      updatedAt: now,
      needsSync: true
    }
    groups.push(next)
  }
  // Clear tombstone if re-creating same id
  const deleted = (await listDeletedGroups()).filter(function(d) { return d.id !== next.id })
  await writeJson(DELETED_GROUPS_KEY, deleted)
  await writeJson(GROUPS_KEY, groups)
  return next
}

/**
 * Delete group. If deleteSets is true, delete member sets; otherwise move to Ungrouped (groupId null).
 */
export async function deleteGroup(groupId, options) {
  const opts = options || {}
  const groups = await readJson(GROUPS_KEY, [])
  const target = groups.find(function(g) { return g.id === groupId })
  await writeJson(GROUPS_KEY, groups.filter(function(g) { return g.id !== groupId }))
  const tombstones = await listDeletedGroups()
  tombstones.push({
    id: groupId,
    deletedAt: nowIso(),
    label: target && target.label
  })
  await writeJson(DELETED_GROUPS_KEY, tombstones)

  const sets = await readJson(SETS_KEY, [])
  if (opts.deleteSets) {
    const toDelete = sets.filter(function(s) { return s.groupId === groupId })
    for (let i = 0; i < toDelete.length; i++) {
      await deleteSet(toDelete[i].id)
    }
  } else {
    const next = sets.map(function(s) {
      if (s.groupId !== groupId) return s
      return Object.assign({}, s, { groupId: null, updatedAt: nowIso(), needsSync: true })
    })
    await writeJson(SETS_KEY, next)
  }
}

export async function listSets() {
  const sets = await readJson(SETS_KEY, [])
  const deleted = await listDeletedSets()
  const deletedIds = {}
  deleted.forEach(function(d) { if (d && d.id) deletedIds[d.id] = true })
  return sets.filter(function(s) { return s && !deletedIds[s.id] }).slice().sort(function(a, b) {
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
  })
}

export async function listUnsyncedSets() {
  const sets = await listSets()
  return sets.filter(function(s) {
    return s.needsSync === true || !s.syncedAt || (s.updatedAt && s.syncedAt && s.updatedAt > s.syncedAt)
  })
}

export async function getSet(setId) {
  const sets = await listSets()
  return sets.find(function(s) { return s.id === setId }) || null
}

export async function saveSet(recordingSet) {
  const sets = await readJson(SETS_KEY, [])
  const now = nowIso()
  let next
  if (recordingSet && recordingSet.id) {
    const idx = sets.findIndex(function(s) { return s.id === recordingSet.id })
    next = Object.assign({}, sets[idx] || {}, recordingSet, {
      updatedAt: now,
      needsSync: recordingSet.needsSync === false ? false : true
    })
    if (!next.createdAt) next.createdAt = now
    if (idx >= 0) sets[idx] = next
    else sets.push(next)
  } else {
    next = Object.assign({
      id: makeId('set'),
      label: 'Untitled set',
      groupId: null,
      notes: [],
      measurementMode: 'bowed',
      createdAt: now,
      updatedAt: now,
      needsSync: true
    }, recordingSet || {})
    if (!next.id) next.id = makeId('set')
    if (next.needsSync == null) next.needsSync = true
    sets.push(next)
  }
  const deleted = (await listDeletedSets()).filter(function(d) { return d.id !== next.id })
  await writeJson(DELETED_SETS_KEY, deleted)
  await writeJson(SETS_KEY, sets)
  return next
}

export async function markSetsSynced(setIds) {
  const ids = {}
  ;(setIds || []).forEach(function(id) { ids[id] = true })
  const sets = await readJson(SETS_KEY, [])
  const now = nowIso()
  const next = sets.map(function(s) {
    if (!ids[s.id]) return s
    return Object.assign({}, s, { syncedAt: now, needsSync: false })
  })
  await writeJson(SETS_KEY, next)
}

export async function markGroupsSynced(groupIds) {
  const ids = {}
  ;(groupIds || []).forEach(function(id) { ids[id] = true })
  const groups = await readJson(GROUPS_KEY, [])
  const now = nowIso()
  const next = groups.map(function(g) {
    if (!ids[g.id]) return g
    return Object.assign({}, g, { syncedAt: now, needsSync: false })
  })
  await writeJson(GROUPS_KEY, next)
}

export async function moveSetToGroup(setId, groupId) {
  const set = await getSet(setId)
  if (!set) return null
  return saveSet(Object.assign({}, set, { groupId: groupId || null }))
}

export async function deleteSet(setId) {
  const sets = await readJson(SETS_KEY, [])
  const target = sets.find(function(s) { return s.id === setId })
  const driveFileIds = []
  if (target && target.notes) {
    for (let i = 0; i < target.notes.length; i++) {
      const note = target.notes[i]
      if (note && note.audioBlobKey) await blobStore.removeItem(note.audioBlobKey)
      if (note && note.driveFileId) driveFileIds.push(note.driveFileId)
    }
  }
  await writeJson(SETS_KEY, sets.filter(function(s) { return s.id !== setId }))
  const tombstones = await listDeletedSets()
  tombstones.push({
    id: setId,
    deletedAt: nowIso(),
    label: target && target.label,
    driveFileIds: driveFileIds,
    driveIndexTouched: true
  })
  await writeJson(DELETED_SETS_KEY, tombstones)
}

export async function saveNoteAudioBlob(blob) {
  const key = makeId('blob')
  await blobStore.setItem(key, blob)
  return key
}

export async function putNoteAudioBlob(key, blob) {
  if (!key || !blob) return
  await blobStore.setItem(key, blob)
}

export async function getNoteAudioBlob(key) {
  if (!key) return null
  return blobStore.getItem(key)
}

export async function deleteNoteAudioBlob(key) {
  if (!key) return
  await blobStore.removeItem(key)
}

/** Replace groups + sets metadata without touching blob store keys not referenced. */
export async function replaceAllMeta(groups, sets) {
  await writeJson(GROUPS_KEY, Array.isArray(groups) ? groups : [])
  await writeJson(SETS_KEY, Array.isArray(sets) ? sets : [])
}

/** Collect all audioBlobKeys referenced by current sets. */
export async function listReferencedBlobKeys() {
  const sets = await readJson(SETS_KEY, [])
  const keys = []
  sets.forEach(function(set) {
    ;(set.notes || []).forEach(function(note) {
      if (note && note.audioBlobKey) keys.push(note.audioBlobKey)
    })
  })
  return keys
}

/** Test helper — clear all audio-analysis storage. */
export async function __clearAudioAnalysisStoreForTests() {
  await metaStore.clear()
  await blobStore.clear()
}
