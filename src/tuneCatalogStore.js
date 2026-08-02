/**
 * Lightweight catalog rows + per-tune bodies in IndexedDB.
 */
import localforage from 'localforage'
import { allArtists, allGenres, allTitles } from './tuneBibliographicUtils'
import { matchesMainSearchText } from './searchTextUtils'
import { MIGRATION_BATCH_SIZE } from './tuneScaleConstants'

const catalogStore = localforage.createInstance({ name: 'tunecatalog', storeName: 'catalog' })
const bodyStore = localforage.createInstance({ name: 'tunecatalog', storeName: 'bodies' })
const metaStore = localforage.createInstance({ name: 'tunecatalog', storeName: 'meta' })

const META_CATALOG_COUNT = 'catalogCount'
const META_MIGRATION_STATUS = 'migrationStatus'
const META_CATALOG_REVISION = 'catalogRevision'

let catalogCountCache = null

export function catalogRowSearchHaystack(row) {
  if (!row) return []
  return allTitles({ name: row.name, aliases: row.aliases }).concat(row.artists || [])
}

export function catalogRowMatchesTextFilter(row, filterText) {
  const query = String(filterText || '').trim()
  if (!query) return true
  return matchesMainSearchText(catalogRowSearchHaystack(row), query)
}

export function buildCatalogRowFromTune(tune) {
  if (!tune || tune.id == null) return null
  const voices = tune.voices || {}
  let hasNotes = false
  let hasChords = false
  Object.values(voices).forEach(function(voice) {
    if (!Array.isArray(voice && voice.notes)) return
    voice.notes.forEach(function(line) {
      if (!line) return
      if (line.replaceAll('z', '').replaceAll('|', '').trim().length > 0) hasNotes = true
      if (line.indexOf('"') !== -1) hasChords = true
    })
  })
  const hasLinks = Array.isArray(tune.links) && tune.links.some(function(l) { return l && l.link })
  const hasLyrics = !!(tune.lyrics && String(tune.lyrics).trim())
  const name = String(tune.name || '').trim()
  return {
    id: String(tune.id),
    name: name,
    aliases: Array.isArray(tune.aliases) ? tune.aliases.slice() : [],
    sortName: name.toLowerCase(),
    books: Array.isArray(tune.books) ? tune.books.slice() : [],
    tags: Array.isArray(tune.tags) ? tune.tags.slice() : [],
    genres: allGenres(tune),
    artists: allArtists(tune),
    starred: !!tune.starred,
    boost: tune.boost || 0,
    hasNotes: hasNotes,
    hasChords: hasChords,
    hasLinks: hasLinks,
    hasLyrics: hasLyrics,
    bodyBytes: 0,
    lastUpdated: tune.lastUpdated || 0,
  }
}

export async function saveCatalogRow(row) {
  if (!row || !row.id) return
  await catalogStore.setItem(String(row.id), row)
  catalogCountCache = null
}

export async function saveTuneBody(tune) {
  if (!tune || tune.id == null) return
  const id = String(tune.id)
  await bodyStore.setItem(id, tune)
  const row = buildCatalogRowFromTune(tune)
  if (row) {
    try {
      row.bodyBytes = JSON.stringify(tune).length
    } catch (e) {
      row.bodyBytes = 0
    }
    await saveCatalogRow(row)
  }
}

export async function loadTuneBody(tuneId) {
  if (tuneId == null) return null
  return bodyStore.getItem(String(tuneId))
}

export async function loadCatalogRow(tuneId) {
  if (tuneId == null) return null
  return catalogStore.getItem(String(tuneId))
}

export async function deleteTuneFromCatalog(tuneId) {
  if (tuneId == null) return
  const id = String(tuneId)
  await catalogStore.removeItem(id)
  await bodyStore.removeItem(id)
  catalogCountCache = null
}

export async function getCatalogCount() {
  if (catalogCountCache != null) return catalogCountCache
  const stored = await metaStore.getItem(META_CATALOG_COUNT)
  if (typeof stored === 'number') {
    catalogCountCache = stored
    return stored
  }
  let count = 0
  await catalogStore.iterate(function() { count += 1 })
  catalogCountCache = count
  await metaStore.setItem(META_CATALOG_COUNT, count)
  return count
}

export async function setCatalogCount(count) {
  catalogCountCache = count
  await metaStore.setItem(META_CATALOG_COUNT, count)
}

export async function getMigrationStatus() {
  return (await metaStore.getItem(META_MIGRATION_STATUS)) || 'none'
}

export async function setMigrationStatus(status) {
  await metaStore.setItem(META_MIGRATION_STATUS, status)
}

export async function bumpCatalogRevision() {
  const rev = (await metaStore.getItem(META_CATALOG_REVISION)) || 0
  const next = rev + 1
  await metaStore.setItem(META_CATALOG_REVISION, next)
  return next
}

export async function getCatalogRevision() {
  return (await metaStore.getItem(META_CATALOG_REVISION)) || 0
}

function rowMatchesFilters(row, filters) {
  if (!row) return false
  const f = filters || {}
  const book = f.currentTuneBook || f.bookFilter || ''
  if (book && String(book).trim()) {
    const books = row.books || []
    if (books.indexOf(String(book).trim()) === -1) return false
  }
  const tags = Array.isArray(f.tagFilter) ? f.tagFilter.filter(Boolean) : []
  if (tags.length > 0) {
    const rowTags = row.tags || []
    for (let i = 0; i < tags.length; i += 1) {
      if (rowTags.indexOf(tags[i]) === -1) return false
    }
  }
  if (f.starredFilter && !row.starred) return false
  if (!catalogRowMatchesTextFilter(row, f.textFilter || f.filter)) return false
  return true
}

/**
 * Iterate catalog rows matching filters; optional offset/limit on sorted results.
 */
export async function queryCatalogRows(filters, options) {
  const opts = options || {}
  const offset = Math.max(parseInt(opts.offset, 10) || 0, 0)
  const limit = Math.max(parseInt(opts.limit, 10) || 200, 1)
  const matches = []
  await catalogStore.iterate(function(row) {
    if (rowMatchesFilters(row, filters)) matches.push(row)
  })
  matches.sort(function(a, b) {
    const na = (a && a.sortName) || ''
    const nb = (b && b.sortName) || ''
    return na < nb ? -1 : na > nb ? 1 : 0
  })
  return {
    total: matches.length,
    offset: offset,
    limit: limit,
    rows: matches.slice(offset, offset + limit),
    ids: matches.slice(offset, offset + limit).map(function(r) { return r.id }),
  }
}

/**
 * Stream migration from monolithic tunes object into catalog + bodies stores.
 */
export async function migrateMonolithToCatalog(tunes, options) {
  const opts = options || {}
  const list = tunes && typeof tunes === 'object' ? Object.values(tunes) : []
  const batchSize = opts.batchSize > 0 ? opts.batchSize : MIGRATION_BATCH_SIZE
  let processed = 0
  await setMigrationStatus('pending')
  for (let i = 0; i < list.length; i += batchSize) {
    const slice = list.slice(i, i + batchSize)
    await Promise.all(slice.map(function(tune) {
      if (!tune || tune.id == null) return Promise.resolve()
      return saveTuneBody(tune)
    }))
    processed += slice.length
    if (typeof opts.onProgress === 'function') {
      opts.onProgress(processed, list.length)
    }
    if (opts.yieldToMain) await opts.yieldToMain()
  }
  await setCatalogCount(list.length)
  await bumpCatalogRevision()
  await setMigrationStatus('verified')
  return { count: list.length }
}

export async function clearCatalogStore() {
  await catalogStore.clear()
  await bodyStore.clear()
  catalogCountCache = 0
  await metaStore.setItem(META_CATALOG_COUNT, 0)
}
