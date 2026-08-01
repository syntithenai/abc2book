/**
 * Saved playlists — localStorage cache synced to tunebook ABC via playlistSync.
 */

import { createQueue, createQueueId, isQueueActive } from './nowPlayingQueue'
import { createPlaylistTombstone } from './playlistSync'
import { normalizePlaylistItems } from './playlistMergeUtils'
import { PLAYLIST_MAX_ITEMS } from './tuneScaleConstants'

const STORAGE_KEY = 'bookstorage_saved_playlists'
const DELETED_STORAGE_KEY = 'bookstorage_deleted_playlists'

const changeListeners = []
let onPlaylistsChangedHandler = null

export function setPlaylistsChangeHandler(handler) {
  onPlaylistsChangedHandler = typeof handler === 'function' ? handler : null
}

export function subscribePlaylists(listener) {
  if (typeof listener !== 'function') return function() {}
  changeListeners.push(listener)
  return function() {
    const idx = changeListeners.indexOf(listener)
    if (idx !== -1) changeListeners.splice(idx, 1)
  }
}

export function notifyPlaylistsChanged() {
  changeListeners.forEach(function(listener) {
    try { listener() } catch (e) { /* ignore */ }
  })
  if (typeof onPlaylistsChangedHandler === 'function') {
    try { onPlaylistsChangedHandler() } catch (e) { /* ignore */ }
  }
}

function readMap() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (e) {
    return {}
  }
}

function writeMap(map) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map || {}))
}

export function readPlaylistsMap() {
  return readMap()
}

export function writePlaylistsMap(map) {
  writeMap(map)
}

export function readDeletedPlaylists() {
  try {
    const raw = localStorage.getItem(DELETED_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (e) {
    return {}
  }
}

export function writeDeletedPlaylists(deleted) {
  localStorage.setItem(DELETED_STORAGE_KEY, JSON.stringify(deleted || {}))
}

function normalizeRecord(record, id) {
  if (!record || typeof record !== 'object') return null
  const items = normalizePlaylistItems(record.items).slice(0, PLAYLIST_MAX_ITEMS)
  return {
    id: id || record.id,
    name: record.name || 'Playlist',
    items: items,
    followTune: !!record.followTune,
    loop: !!record.loop,
    repeatTrack: !!record.repeatTrack,
    repeatMode: record.repeatMode || (record.repeatTrack ? 'track' : (record.loop ? 'playlist' : 'off')),
    shuffle: !!record.shuffle,
    autoAdvance: record.autoAdvance !== false,
    updatedAt: typeof record.updatedAt === 'number' ? record.updatedAt : 0,
  }
}

export function listSavedPlaylists() {
  const map = readMap()
  return Object.keys(map)
    .map(function(id) {
      return normalizeRecord(map[id], id)
    })
    .filter(Boolean)
    .sort(function(a, b) {
      if (a.updatedAt && b.updatedAt && a.updatedAt !== b.updatedAt) {
        return b.updatedAt - a.updatedAt
      }
      return String(a.name || '').localeCompare(String(b.name || ''))
    })
}

export function getSavedPlaylist(id) {
  if (!id) return null
  const map = readMap()
  if (!map[id]) return null
  return normalizeRecord(map[id], id)
}

export function savePlaylist(record, options) {
  const opts = options || {}
  const map = readMap()
  const id = opts.id || (record && record.id) || createQueueId()
  const normalized = normalizeRecord(record, id)
  if (!normalized || !normalized.items.length) return null
  const next = Object.assign({}, normalized, { updatedAt: Date.now() })
  delete next.id
  map[id] = next

  const deleted = readDeletedPlaylists()
  if (deleted[id]) {
    delete deleted[id]
    writeDeletedPlaylists(deleted)
  }

  writeMap(map)
  notifyPlaylistsChanged()
  return Object.assign({ id: id }, next)
}

export function appendTunesToPlaylist(playlistId, tuneIds) {
  const ids = Array.isArray(tuneIds) ? tuneIds.filter(Boolean) : []
  if (!playlistId || !ids.length) return null
  const existing = getSavedPlaylist(playlistId)
  if (!existing) return null
  const nextItems = (existing.items || []).concat(ids.map(function(tuneId) {
    return { tuneId: tuneId }
  })).slice(0, PLAYLIST_MAX_ITEMS)
  return savePlaylist(Object.assign({}, existing, { items: nextItems }), { id: playlistId })
}

export function savePlaylistFromQueue(queue, options) {
  if (!isQueueActive(queue)) return null
  if (queue.source === 'lesson') return null
  const opts = options || {}
  const items = queue.items.map(function(item) {
    if (!item || !item.tuneId) return null
    const next = { tuneId: item.tuneId }
    if (item.prefer && item.prefer !== 'auto') next.prefer = item.prefer
    if (item.linkIndex != null) next.linkIndex = item.linkIndex
    return next
  }).filter(Boolean)
  if (!items.length) return null

  const name = (opts.name != null ? String(opts.name) : queue.name || 'Playlist').trim() || 'Playlist'
  return savePlaylist({
    id: opts.id || queue.savedPlaylistId,
    name: name,
    items: items,
    followTune: !!queue.followTune,
    loop: !!queue.loop,
    repeatTrack: !!queue.repeatTrack,
    repeatMode: queue.repeatMode,
    shuffle: !!queue.shuffle,
    autoAdvance: queue.autoAdvance !== false,
  }, { id: opts.id || queue.savedPlaylistId })
}

export function deleteSavedPlaylist(id) {
  if (!id) return
  const map = readMap()
  const existing = map[id]
  delete map[id]
  writeMap(map)

  const deleted = readDeletedPlaylists()
  deleted[id] = createPlaylistTombstone(
    id,
    existing && existing.name ? existing.name : undefined,
    Date.now()
  )
  writeDeletedPlaylists(deleted)
  notifyPlaylistsChanged()
}

/**
 * Build an active now-playing queue from a saved playlist.
 * Drops items whose tunes are missing from the tunebook.
 */
export function queueFromSavedPlaylist(saved, tunesMap) {
  const record = normalizeRecord(saved, saved && saved.id)
  if (!record || !record.items.length) return null

  const items = record.items.filter(function(item) {
    return tunesMap && item.tuneId && tunesMap[item.tuneId]
  })
  if (!items.length) return null

  const queue = createQueue({
    name: record.name,
    source: 'saved',
    followTune: record.followTune,
    loop: record.loop,
    shuffle: record.shuffle,
    autoAdvance: record.autoAdvance,
    repeatMode: record.repeatMode,
    repeatTrack: record.repeatTrack,
  })
  queue.items = items.map(function(item) {
    const next = { tuneId: item.tuneId, prefer: item.prefer || 'auto' }
    if (item.linkIndex != null) next.linkIndex = item.linkIndex
    return next
  })
  queue.savedPlaylistId = record.id
  queue.currentIndex = 0
  return queue
}

export function tuneIdsForPlaylistRecord(playlistRecord) {
  if (!playlistRecord || !Array.isArray(playlistRecord.items)) return []
  const ids = []
  const seen = {}
  playlistRecord.items.forEach(function(item) {
    if (!item || !item.tuneId) return
    const id = String(item.tuneId)
    if (seen[id]) return
    seen[id] = true
    ids.push(id)
  })
  return ids
}

export { normalizePlaylistItems } from './playlistMergeUtils'
