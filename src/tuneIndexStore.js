/**
 * Persist tune book/tag/genre/artist/album indexes in IndexedDB (replaces localStorage).
 */
import localforage from 'localforage'

const store = localforage.createInstance({ name: 'tuneindexes' })

export const INDEX_STORE_KEYS = {
  books: 'bookstorage_index_books',
  tags: 'bookstorage_index_tags',
  genres: 'bookstorage_index_genres',
  artists: 'bookstorage_index_artists',
  albums: 'bookstorage_index_albums',
  tagGroups: 'bookstorage_tag_groups',
  meta: 'bookstorage_index_meta',
}

const LEGACY_LOCAL_KEYS = [
  INDEX_STORE_KEYS.books,
  INDEX_STORE_KEYS.tags,
  INDEX_STORE_KEYS.genres,
  INDEX_STORE_KEYS.artists,
  INDEX_STORE_KEYS.albums,
  'bookstorage_tag_groups',
]

let cache = null
let loadPromise = null

function emptyIndexes() {
  return {
    books: {},
    tags: {},
    genres: {},
    artists: {},
    albums: {},
    tagGroups: {},
    meta: { revision: 0, builtAt: null },
  }
}

function readLegacyLocal(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (e) {
    return {}
  }
}

function clearLegacyLocal(key) {
  try {
    localStorage.removeItem(key)
  } catch (e) {
    // ignore
  }
}

export function hasLegacyLocalIndexes() {
  return LEGACY_LOCAL_KEYS.some(function(key) {
    try {
      return !!localStorage.getItem(key)
    } catch (e) {
      return false
    }
  })
}

/**
 * Migrate localStorage indexes to IndexedDB if present.
 */
export async function migrateLegacyIndexesToStore() {
  if (!hasLegacyLocalIndexes()) return false
  const migrated = emptyIndexes()
  migrated.books = readLegacyLocal(INDEX_STORE_KEYS.books)
  migrated.tags = readLegacyLocal(INDEX_STORE_KEYS.tags)
  migrated.genres = readLegacyLocal(INDEX_STORE_KEYS.genres)
  migrated.artists = readLegacyLocal(INDEX_STORE_KEYS.artists)
  migrated.albums = readLegacyLocal(INDEX_STORE_KEYS.albums)
  migrated.tagGroups = readLegacyLocal('bookstorage_tag_groups')
  migrated.meta = { revision: Date.now(), builtAt: new Date().toISOString(), source: 'legacy-migration' }
  await saveAllIndexes(migrated)
  LEGACY_LOCAL_KEYS.forEach(clearLegacyLocal)
  cache = migrated
  return true
}

export async function loadAllIndexes() {
  if (cache) return cache
  if (loadPromise) return loadPromise
  loadPromise = (async function() {
    await migrateLegacyIndexesToStore()
    const books = (await store.getItem(INDEX_STORE_KEYS.books)) || {}
    const tags = (await store.getItem(INDEX_STORE_KEYS.tags)) || {}
    const genres = (await store.getItem(INDEX_STORE_KEYS.genres)) || {}
    const artists = (await store.getItem(INDEX_STORE_KEYS.artists)) || {}
    const albums = (await store.getItem(INDEX_STORE_KEYS.albums)) || {}
    const tagGroups = (await store.getItem(INDEX_STORE_KEYS.tagGroups)) || {}
    const meta = (await store.getItem(INDEX_STORE_KEYS.meta)) || { revision: 0 }
    const hasAny = Object.keys(books).length > 0
      || Object.keys(tags).length > 0
      || Object.keys(genres).length > 0
      || Object.keys(artists).length > 0
      || Object.keys(albums).length > 0
    if (!hasAny && hasLegacyLocalIndexes()) {
      await migrateLegacyIndexesToStore()
      return loadAllIndexes()
    }
    cache = {
      books: books,
      tags: tags,
      genres: genres,
      artists: artists,
      albums: albums,
      tagGroups: tagGroups,
      meta: meta,
    }
    return cache
  })()
  return loadPromise
}

export function getCachedIndexes() {
  return cache || emptyIndexes()
}

export async function saveIndexSlice(key, data) {
  const payload = data && typeof data === 'object' ? data : {}
  await store.setItem(key, payload)
  if (cache) {
    if (key === INDEX_STORE_KEYS.books) cache.books = payload
    else if (key === INDEX_STORE_KEYS.tags) cache.tags = payload
    else if (key === INDEX_STORE_KEYS.genres) cache.genres = payload
    else if (key === INDEX_STORE_KEYS.artists) cache.artists = payload
    else if (key === INDEX_STORE_KEYS.albums) cache.albums = payload
    else if (key === INDEX_STORE_KEYS.tagGroups) cache.tagGroups = payload
    else if (key === INDEX_STORE_KEYS.meta) cache.meta = payload
  }
}

export async function saveAllIndexes(indexes) {
  const data = indexes || emptyIndexes()
  await Promise.all([
    saveIndexSlice(INDEX_STORE_KEYS.books, data.books || {}),
    saveIndexSlice(INDEX_STORE_KEYS.tags, data.tags || {}),
    saveIndexSlice(INDEX_STORE_KEYS.genres, data.genres || {}),
    saveIndexSlice(INDEX_STORE_KEYS.artists, data.artists || {}),
    saveIndexSlice(INDEX_STORE_KEYS.albums, data.albums || {}),
    saveIndexSlice(INDEX_STORE_KEYS.tagGroups, data.tagGroups || {}),
    saveIndexSlice(INDEX_STORE_KEYS.meta, Object.assign({}, data.meta || {}, {
      revision: Date.now(),
      builtAt: new Date().toISOString(),
    })),
  ])
}

export function invalidateIndexCache() {
  cache = null
  loadPromise = null
}
