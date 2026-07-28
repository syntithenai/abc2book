/**
 * Single access API for tunes (monolith or catalog-backed).
 */
import { isCatalogStorageEnabled } from './tuneStorageFlags'
import {
  loadTuneBody,
  loadCatalogRow,
  saveTuneBody,
  queryCatalogRows,
  getCatalogCount,
  buildCatalogRowFromTune,
} from './tuneCatalogStore'
import { BODY_LRU_CACHE_SIZE } from './tuneScaleConstants'

let monolithTunesRef = {}
let bodyCache = new Map()
let bodyCacheOrder = []

function touchBodyCache(id, tune) {
  const key = String(id)
  if (bodyCache.has(key)) {
    bodyCacheOrder = bodyCacheOrder.filter(function(k) { return k !== key })
  }
  bodyCache.set(key, tune)
  bodyCacheOrder.push(key)
  while (bodyCacheOrder.length > BODY_LRU_CACHE_SIZE) {
    const evict = bodyCacheOrder.shift()
    bodyCache.delete(evict)
  }
}

export function configureTuneRepository(options) {
  const opts = options || {}
  if (opts.tunes && typeof opts.tunes === 'object') {
    monolithTunesRef = opts.tunes
  }
}

export function invalidateBodyCache(tuneId) {
  if (tuneId != null) {
    bodyCache.delete(String(tuneId))
    bodyCacheOrder = bodyCacheOrder.filter(function(k) { return k !== String(tuneId) })
  } else {
    bodyCache.clear()
    bodyCacheOrder = []
  }
}

export async function getTune(tuneId) {
  if (tuneId == null) return null
  const key = String(tuneId)
  if (bodyCache.has(key)) return bodyCache.get(key)
  if (isCatalogStorageEnabled()) {
    const body = await loadTuneBody(key)
    if (body) touchBodyCache(key, body)
    return body
  }
  return monolithTunesRef[key] || monolithTunesRef[tuneId] || null
}

export function getTuneSync(tuneId) {
  if (tuneId == null) return null
  const key = String(tuneId)
  if (bodyCache.has(key)) return bodyCache.get(key)
  return monolithTunesRef[key] || monolithTunesRef[tuneId] || null
}

export async function getCatalogRow(tuneId) {
  if (isCatalogStorageEnabled()) {
    return loadCatalogRow(tuneId)
  }
  const tune = getTuneSync(tuneId)
  return tune ? buildCatalogRowFromTune(tune) : null
}

export async function saveTuneToRepository(tune) {
  if (!tune || tune.id == null) return tune
  const key = String(tune.id)
  if (isCatalogStorageEnabled()) {
    await saveTuneBody(tune)
    touchBodyCache(key, tune)
  } else {
    monolithTunesRef[key] = tune
    touchBodyCache(key, tune)
  }
  return tune
}

export async function listCatalogPage(filters, options) {
  if (isCatalogStorageEnabled()) {
    return queryCatalogRows(filters, options)
  }
  const opts = options || {}
  const offset = Math.max(parseInt(opts.offset, 10) || 0, 0)
  const limit = Math.max(parseInt(opts.limit, 10) || 200, 1)
  const all = Object.values(monolithTunesRef || {}).filter(function(tune) {
    if (!tune || tune.id == null) return false
    const row = buildCatalogRowFromTune(tune)
    const f = filters || {}
    const book = f.currentTuneBook || ''
    if (book && Array.isArray(row.books) && row.books.indexOf(book) === -1) return false
    const query = String(f.textFilter || f.filter || '').trim().toLowerCase()
    if (query && String(row.name || '').toLowerCase().indexOf(query) === -1) return false
    return true
  })
  all.sort(function(a, b) {
    return String(a.name || '').toLowerCase() < String(b.name || '').toLowerCase() ? -1 : 1
  })
  const slice = all.slice(offset, offset + limit)
  return {
    total: all.length,
    offset: offset,
    limit: limit,
    rows: slice.map(buildCatalogRowFromTune).filter(Boolean),
    ids: slice.map(function(t) { return String(t.id) }),
    tunes: slice,
  }
}

export async function getRepositoryTuneCount() {
  if (isCatalogStorageEnabled()) {
    return getCatalogCount()
  }
  return Object.keys(monolithTunesRef || {}).length
}

export function getMonolithTunesRef() {
  return monolithTunesRef
}

export function setMonolithTunesRef(tunes) {
  monolithTunesRef = tunes || {}
}
