/**
 * Clear all user library data locally and blank/delete Drive copies.
 * When offline or logged out, marks a pending Drive wipe for the next online login.
 */
import localforage from 'localforage'
import { isNavigatorOffline } from './offlineNetwork'
import { tombstoneAllTunes, mergeDeletedTuneMaps } from './tuneBookSync'
import {
  readPlaylistsMap,
  writePlaylistsMap,
  readDeletedPlaylists,
  writeDeletedPlaylists,
  notifyPlaylistsChanged,
} from './savedPlaylistsStore'
import { createPlaylistTombstone } from './playlistSync'
import {
  readPerformanceSetsMap,
  writePerformanceSetsMap,
  readDeletedPerformanceSets,
  writeDeletedPerformanceSets,
  notifyPerformanceSetsChanged,
} from './performanceSetStore'
import { createSetTombstone } from './performanceSetSync'
import {
  readPracticeListsMap,
  writePracticeListsMap,
  readDeletedPracticeLists,
  writeDeletedPracticeLists,
  notifyPracticeListsChanged,
} from './practiceListStore'
import { createPracticeListTombstone } from './practiceListSync'
import { writeSyncSources } from './syncSourcesStore'
import {
  listAllScratchpadItems,
  listAllWorkspacesRaw,
  deleteScratchpadItem,
  deleteWorkspace,
  ensureDefaultWorkspace,
} from './scratchpadStore'
import { enqueuePendingDriveDelete, flushPendingDriveDeletes } from './tuneFiles'
import { flushCachedMediaDriveDeletes } from './mediaCacheDriveDeletes'
import {
  getLocalCachedMediaIndex,
  enqueueCachedMediaDriveDeletesForTuneIds,
} from './mediaCacheDriveBackup'
import {
  enqueueScratchpadDriveDeletes,
  flushScratchpadDriveDeletes,
} from './scratchpadDriveDeletes'
import { syncScratchpadWithDrive } from './scratchpadCloudSync'

export const PENDING_CLEAR_USER_DATA_KEY = 'bookstorage_pending_clear_user_data'

export function hasPendingClearUserData(storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null)
  if (!store) return false
  try {
    return store.getItem(PENDING_CLEAR_USER_DATA_KEY) === '1'
  } catch (e) {
    return false
  }
}

export function setPendingClearUserData(storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null)
  if (!store) return
  try {
    store.setItem(PENDING_CLEAR_USER_DATA_KEY, '1')
  } catch (e) { /* ignore */ }
}

export function clearPendingClearUserData(storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null)
  if (!store) return
  try {
    store.removeItem(PENDING_CLEAR_USER_DATA_KEY)
  } catch (e) { /* ignore */ }
}

function uniqueIds(ids) {
  const out = []
  const seen = {}
  ;(ids || []).forEach(function(id) {
    const key = String(id || '')
    if (!key || seen[key]) return
    seen[key] = true
    out.push(key)
  })
  return out
}

export function tombstoneAndClearPlaylists() {
  const map = readPlaylistsMap()
  const deleted = Object.assign({}, readDeletedPlaylists())
  const now = Date.now()
  Object.keys(map || {}).forEach(function(id) {
    const rec = map[id]
    deleted[id] = createPlaylistTombstone(id, rec && rec.name, now)
  })
  writePlaylistsMap({})
  writeDeletedPlaylists(deleted)
  notifyPlaylistsChanged()
}

export function tombstoneAndClearPerformanceSets() {
  const map = readPerformanceSetsMap()
  const deleted = Object.assign({}, readDeletedPerformanceSets())
  const now = Date.now()
  Object.keys(map || {}).forEach(function(id) {
    const rec = map[id]
    deleted[id] = createSetTombstone(id, rec && rec.name, now)
  })
  writePerformanceSetsMap({})
  writeDeletedPerformanceSets(deleted)
  notifyPerformanceSetsChanged()
}

export function tombstoneAndClearPracticeLists() {
  const map = readPracticeListsMap()
  const deleted = Object.assign({}, readDeletedPracticeLists())
  const now = Date.now()
  Object.keys(map || {}).forEach(function(id) {
    const rec = map[id]
    deleted[id] = createPracticeListTombstone(id, rec && rec.name, now)
  })
  writePracticeListsMap({})
  writeDeletedPracticeLists(deleted)
  notifyPracticeListsChanged()
}

async function collectGoogleIdsFromLocalforageStore(storeName) {
  const store = localforage.createInstance({ name: storeName })
  const ids = []
  try {
    await store.iterate(function(value) {
      if (value && value.googleId) ids.push(String(value.googleId))
    })
  } catch (e) { /* ignore */ }
  return ids
}

async function clearLocalforageStore(storeName) {
  try {
    const store = localforage.createInstance({ name: storeName })
    await store.clear()
  } catch (e) { /* ignore */ }
}

async function collectTuneFileGoogleIds() {
  const store = localforage.createInstance({ name: 'tunefiles' })
  const ids = []
  try {
    await store.iterate(function(value) {
      if (value && value.googleId) ids.push(String(value.googleId))
    })
  } catch (e) { /* ignore */ }
  return ids
}

function collectScratchpadDriveIds() {
  const ids = []
  const items = listAllScratchpadItems() || []
  items.forEach(function(item) {
    if (!item) return
    if (item.type === 'image' && item.image && item.image.driveFileId) {
      ids.push(item.image.driveFileId)
    }
    if (item.type === 'text' && item.text && item.text.driveFileId) {
      ids.push(item.text.driveFileId)
    }
    if (item.type === 'notation' && item.notation && item.notation.driveFileId) {
      ids.push(item.notation.driveFileId)
    }
    if (item.type === 'composition' && item.composition) {
      if (item.composition.driveFileId) ids.push(item.composition.driveFileId)
      ;(item.composition.mediaAttachments || []).forEach(function(entry) {
        if (entry && entry.driveFileId) ids.push(entry.driveFileId)
      })
    }
    if (item.type === 'audio' && item.audio) {
      if (item.audio.projectDriveFileId) ids.push(item.audio.projectDriveFileId)
      if (item.audio.mixdownDriveFileId) ids.push(item.audio.mixdownDriveFileId)
      ;(item.audio.tracks || []).forEach(function(track) {
        ;(track.takes || []).forEach(function(take) {
          if (take && take.driveFileId) ids.push(take.driveFileId)
        })
      })
    }
  })
  return uniqueIds(ids)
}

function clearScratchpadLocally() {
  const workspaces = (listAllWorkspacesRaw() || []).slice()
  workspaces.forEach(function(ws) {
    if (ws && ws.id) deleteWorkspace(ws.id)
  })
  // Orphan items (not in a workspace order)
  ;(listAllScratchpadItems() || []).forEach(function(item) {
    if (item && item.id) deleteScratchpadItem(item.id)
  })
  try {
    ensureDefaultWorkspace()
  } catch (e) { /* ignore */ }
}

async function enqueueOwnedMediaDeletes() {
  const fileIds = await collectGoogleIdsFromLocalforageStore('files')
  const recordingIds = await collectGoogleIdsFromLocalforageStore('recordings')
  const tuneFileIds = await collectTuneFileGoogleIds()
  const allTuneFileStyle = uniqueIds(fileIds.concat(recordingIds).concat(tuneFileIds))
  for (let i = 0; i < allTuneFileStyle.length; i += 1) {
    await enqueuePendingDriveDelete(allTuneFileStyle[i])
  }

  const cacheIndex = await getLocalCachedMediaIndex()
  const cacheTuneIds = uniqueIds(
    (cacheIndex && cacheIndex.items ? cacheIndex.items : [])
      .map(function(item) { return item && item.tuneId })
  )
  let cacheIds = 0
  if (cacheTuneIds.length) {
    const removed = await enqueueCachedMediaDriveDeletesForTuneIds(cacheTuneIds)
    cacheIds = Array.isArray(removed) ? removed.length : 0
  }

  const scratchpadIds = collectScratchpadDriveIds()
  if (scratchpadIds.length) {
    await enqueueScratchpadDriveDeletes(scratchpadIds)
  }

  return {
    tuneFiles: allTuneFileStyle.length,
    cachedMedia: cacheIds.length,
    scratchpad: scratchpadIds.length,
  }
}

async function clearLocalMediaStores(utils) {
  await clearLocalforageStore('files')
  await clearLocalforageStore('recordings')
  await clearLocalforageStore('tunefiles')
  await clearLocalforageStore('tunefilecache')
  if (utils) {
    try {
      if (typeof utils.clearDownloadedAudioCache === 'function') {
        await Promise.resolve(utils.clearDownloadedAudioCache())
      }
      if (typeof utils.clearMidiCache === 'function') {
        await Promise.resolve(utils.clearMidiCache())
      }
      if (typeof utils.clearStemsCache === 'function') {
        await Promise.resolve(utils.clearStemsCache())
      }
    } catch (e) { /* ignore */ }
  }
}

/**
 * Blank Drive songbook + flush queued media deletes when online and signed in.
 */
export async function flushPendingClearUserData(options) {
  const opts = options || {}
  if (!hasPendingClearUserData(opts.storage)) {
    return { skipped: true }
  }
  if (isNavigatorOffline()) {
    return { pending: true, offline: true }
  }
  const token = opts.token
  const accessToken = token && token.access_token
  if (!accessToken) {
    return { pending: true, loggedOut: true }
  }
  const driveApi = opts.driveApi
  const updateSheet = opts.updateSheet

  if (typeof updateSheet === 'function') {
    if (typeof opts.flushTunesPersistence === 'function') {
      opts.flushTunesPersistence()
    }
    await updateSheet(0, { forceShrinkUpload: true })
  }

  if (driveApi) {
    await flushPendingDriveDeletes({ token: token, driveApi: driveApi })
    await flushCachedMediaDriveDeletes(driveApi, { token: token })
    await flushScratchpadDriveDeletes(driveApi, { token: token })
    try {
      await syncScratchpadWithDrive(driveApi, { token: token })
    } catch (e) { /* best-effort */ }
  }

  clearPendingClearUserData(opts.storage)
  return { cleared: true }
}

/**
 * Wipe local library data and Drive copies (or queue Drive wipe for next login).
 *
 * @param {object} options
 * @param {object} options.tunebook
 * @param {function} [options.updateSheet]
 * @param {object} [options.token]
 * @param {object} [options.driveApi]
 * @param {function} [options.flushTunesPersistence]
 * @param {boolean} [options.isLoggedIn]
 */
export async function clearUserData(options) {
  const opts = options || {}
  const tunebook = opts.tunebook
  const token = opts.token
  const driveApi = opts.driveApi
  const isLoggedIn = opts.isLoggedIn != null
    ? !!opts.isLoggedIn
    : !!(token && token.access_token)
  const online = !isNavigatorOffline()
  const canDriveNow = isLoggedIn && online && token && token.access_token

  // Mark pending first so wipe-recovery cannot re-pull Drive while we clear.
  setPendingClearUserData(opts.storage)

  // Always tombstone synced companions so the next Drive upload blanks those sections.
  tombstoneAndClearPlaylists()
  tombstoneAndClearPerformanceSets()
  tombstoneAndClearPracticeLists()
  try {
    writeSyncSources([])
  } catch (e) { /* ignore */ }

  const queued = await enqueueOwnedMediaDeletes()
  clearScratchpadLocally()
  await clearLocalMediaStores(tunebook && tunebook.utils)

  if (tunebook && typeof tunebook.deleteAll === 'function') {
    // Keep tombstones even when logged out so the next login can blank Drive.
    await Promise.resolve(tunebook.deleteAll({
      keepTombstonesForDriveWipe: true,
      skipOnlineSave: true,
    }))
  }

  if (typeof opts.flushTunesPersistence === 'function') {
    opts.flushTunesPersistence()
  }

  if (canDriveNow && typeof opts.updateSheet === 'function') {
    await opts.updateSheet(0, { forceShrinkUpload: true })
    if (driveApi) {
      await flushPendingDriveDeletes({ token: token, driveApi: driveApi })
      await flushCachedMediaDriveDeletes(driveApi, { token: token })
      await flushScratchpadDriveDeletes(driveApi, { token: token })
      try {
        await syncScratchpadWithDrive(driveApi, { token: token })
      } catch (e) { /* best-effort */ }
    }
    clearPendingClearUserData(opts.storage)
    return {
      localCleared: true,
      driveCleared: true,
      queued: queued,
    }
  }

  return {
    localCleared: true,
    driveCleared: false,
    pendingDriveClear: true,
    queued: queued,
  }
}
