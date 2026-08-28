/**
 * Rebuild book/tag/genre/artist/album indexes from tune objects.
 */
import { allAlbums, allArtists, allGenres } from './tuneBibliographicUtils'
import { saveAllIndexes, invalidateIndexCache } from './tuneIndexStore'

function addId(index, key, tuneId) {
  if (!key || !tuneId) return
  if (!Array.isArray(index[key])) index[key] = []
  if (index[key].indexOf(tuneId) === -1) index[key].push(tuneId)
}

/**
 * Build fresh index maps from a tunes object or iterable.
 */
export function buildIndexesFromTunes(tunes) {
  const books = {}
  const tags = {}
  const genres = {}
  const artists = {}
  const albums = {}
  const list = tunes && typeof tunes === 'object'
    ? (Array.isArray(tunes) ? tunes : Object.values(tunes))
    : []

  list.forEach(function(tune) {
    if (!tune || tune.id == null) return
    const tuneId = tune.id
    if (Array.isArray(tune.books)) {
      tune.books.forEach(function(book) { addId(books, book, tuneId) })
    }
    if (Array.isArray(tune.tags)) {
      tune.tags.forEach(function(tag) { addId(tags, tag, tuneId) })
    }
    allGenres(tune).forEach(function(genre) { addId(genres, genre, tuneId) })
    allArtists(tune).forEach(function(artist) { addId(artists, artist, tuneId) })
    allAlbums(tune).forEach(function(album) { addId(albums, album, tuneId) })
  })

  return { books: books, tags: tags, genres: genres, artists: artists, albums: albums, tagGroups: {} }
}

/**
 * Rebuild and persist indexes. Optional onProgress(processed, total).
 */
export async function rebuildIndexesFromTunes(tunes, options) {
  const opts = options || {}
  const list = tunes && typeof tunes === 'object'
    ? Object.values(tunes)
    : []
  const total = list.length
  const chunkSize = opts.chunkSize > 0 ? opts.chunkSize : 500
  const built = { books: {}, tags: {}, genres: {}, artists: {}, albums: {}, tagGroups: {} }

  for (let start = 0; start < list.length; start += chunkSize) {
    const slice = list.slice(start, start + chunkSize)
    const partial = buildIndexesFromTunes(slice)
    ;['books', 'tags', 'genres', 'artists', 'albums'].forEach(function(field) {
      Object.keys(partial[field] || {}).forEach(function(key) {
        if (!Array.isArray(built[field][key])) built[field][key] = []
        partial[field][key].forEach(function(id) {
          if (built[field][key].indexOf(id) === -1) built[field][key].push(id)
        })
      })
    })
    if (typeof opts.onProgress === 'function') {
      opts.onProgress(Math.min(start + chunkSize, total), total)
    }
    if (opts.yieldToMain) {
      await opts.yieldToMain()
    }
  }

  invalidateIndexCache()
  if (opts.persist !== false) {
    await saveAllIndexes({
      books: built.books,
      tags: built.tags,
      genres: built.genres,
      artists: built.artists,
      albums: built.albums,
      tagGroups: built.tagGroups,
      meta: { revision: Date.now(), builtAt: new Date().toISOString(), tuneCount: total },
    })
  }
  return built
}
