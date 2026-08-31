import useUtils from './useUtils'
import {useState, useRef, useEffect} from 'react'
import { allAlbums, allArtists, allGenres } from './tuneBibliographicUtils'
import { isCapacitorNative } from './platformUtils'
import { yieldToMain } from './tuneListFilter'
import { rebuildIndexesFromTunes, buildIndexesFromTunes } from './tuneIndexRebuilder'
import { shouldAcceptIndexPersist } from './tuneIndexIntegrity'
import {
  INDEX_STORE_KEYS,
  loadAllIndexes,
  saveIndexSlice,
  saveAllIndexes,
  invalidateIndexCache,
} from './tuneIndexStore'

function indexSnapshotEqual(a, b) {
    if (a === b) return true
    const keysA = Object.keys(a || {})
    const keysB = Object.keys(b || {})
    if (keysA.length !== keysB.length) return false
    for (let i = 0; i < keysA.length; i += 1) {
        const key = keysA[i]
        const arrA = a[key]
        const arrB = b[key]
        if (!Array.isArray(arrA) || !Array.isArray(arrB) || arrA.length !== arrB.length) return false
    }
    return true
}

function addTuneIdToIndexKey(index, key, tuneId) {
    if (!key || !tuneId) return
    if (Array.isArray(index[key])) {
        if (index[key].indexOf(tuneId) === -1) index[key].push(tuneId)
    } else {
        index[key] = [tuneId]
    }
}

function removeTuneIdFromIndex(index, tune) {
    var final = {}
    if (tune && tune.id) {
        Object.keys(index || {}).forEach(function(bookName) {
            var indexVal = index[bookName]
            if (!Array.isArray(indexVal)) {
                final[bookName] = indexVal
                return
            }
            final[bookName] = indexVal.filter(function(val) {
                return val !== tune.id
            })
        })
    }
    return final
}

var useIndexes = () => {
        
    var utils = useUtils()
    var [indexesReady, setIndexesReady] = useState(false)
    var [bookIndex, setBookIndex] = useState(function() {
      if (isCapacitorNative()) return {}
      return utils.loadLocalObject('bookstorage_index_books')
    })
    var [tagIndex, setTagIndex] = useState(function() {
      if (isCapacitorNative()) return {}
      return utils.loadLocalObject('bookstorage_index_tags')
    })
    var [genreIndex, setGenreIndex] = useState(function() {
      if (isCapacitorNative()) return {}
      return utils.loadLocalObject('bookstorage_index_genres')
    })
    var [artistIndex, setArtistIndex] = useState(function() {
      if (isCapacitorNative()) return {}
      return utils.loadLocalObject('bookstorage_index_artists')
    })
    var [albumIndex, setAlbumIndex] = useState(function() {
      if (isCapacitorNative()) return {}
      return utils.loadLocalObject('bookstorage_index_albums')
    })
    var [tagGroups, setTagGroups] = useState(function() {
      if (isCapacitorNative()) return {}
      return utils.loadLocalObject('bookstorage_tag_groups')
    })
    var lastBookIndexRef = useRef(bookIndex)
    var lastTagIndexRef = useRef(tagIndex)
    var lastGenreIndexRef = useRef(genreIndex)
    var lastArtistIndexRef = useRef(artistIndex)
    var lastAlbumIndexRef = useRef(albumIndex)
    var indexGenerationRef = useRef(0)
    var reindexInProgressRef = useRef(false)

    useEffect(function() {
      let cancelled = false
      loadAllIndexes().then(function(data) {
        if (cancelled || !data) return
        setBookIndex(data.books || {})
        setTagIndex(data.tags || {})
        setGenreIndex(data.genres || {})
        setArtistIndex(data.artists || {})
        setAlbumIndex(data.albums || {})
        setTagGroups(data.tagGroups || {})
        lastBookIndexRef.current = data.books || {}
        lastTagIndexRef.current = data.tags || {}
        lastGenreIndexRef.current = data.genres || {}
        lastArtistIndexRef.current = data.artists || {}
        lastAlbumIndexRef.current = data.albums || {}
        setIndexesReady(true)
      })
      return function() { cancelled = true }
    }, [])

    function beginIndexWrite() {
      return indexGenerationRef.current
    }

    function canPersistWrite(writeGeneration) {
      return shouldAcceptIndexPersist({
        reindexInProgress: reindexInProgressRef.current,
        writeGeneration: writeGeneration,
        currentGeneration: indexGenerationRef.current,
      })
    }

    function persistBookIndex(next, writeGeneration) {
        if (!canPersistWrite(writeGeneration)) return false
        setBookIndex(next)
        lastBookIndexRef.current = next
        saveIndexSlice(INDEX_STORE_KEYS.books, next)
        return true
    }

    function persistTagIndex(next, writeGeneration) {
        if (!canPersistWrite(writeGeneration)) return false
        setTagIndex(next)
        lastTagIndexRef.current = next
        saveIndexSlice(INDEX_STORE_KEYS.tags, next)
        return true
    }

    function persistGenreIndex(next, writeGeneration) {
        if (!canPersistWrite(writeGeneration)) return false
        setGenreIndex(next)
        lastGenreIndexRef.current = next
        saveIndexSlice(INDEX_STORE_KEYS.genres, next)
        return true
    }

    function persistArtistIndex(next, writeGeneration) {
        if (!canPersistWrite(writeGeneration)) return false
        setArtistIndex(next)
        lastArtistIndexRef.current = next
        saveIndexSlice(INDEX_STORE_KEYS.artists, next)
        return true
    }

    function persistAlbumIndex(next, writeGeneration) {
        if (!canPersistWrite(writeGeneration)) return false
        setAlbumIndex(next)
        lastAlbumIndexRef.current = next
        saveIndexSlice(INDEX_STORE_KEYS.albums, next)
        return true
    }

    function applyTuneToMaps(tune, maps) {
        maps.books = removeTuneIdFromIndex(maps.books, tune)
        maps.tags = removeTuneIdFromIndex(maps.tags, tune)
        maps.genres = removeTuneIdFromIndex(maps.genres, tune)
        maps.artists = removeTuneIdFromIndex(maps.artists, tune)
        maps.albums = removeTuneIdFromIndex(maps.albums, tune)
        if (!tune || !tune.id) return maps
        if (Array.isArray(tune.books) && tune.books.length > 0) {
            tune.books.forEach(function(book) {
                addTuneIdToIndexKey(maps.books, book, tune.id)
            })
        }
        if (Array.isArray(tune.tags) && tune.tags.length > 0) {
            tune.tags.forEach(function(tag) {
                addTuneIdToIndexKey(maps.tags, tag, tune.id)
            })
        }
        allGenres(tune).forEach(function(genreName) {
            addTuneIdToIndexKey(maps.genres, genreName, tune.id)
        })
        allArtists(tune).forEach(function(artistName) {
            addTuneIdToIndexKey(maps.artists, artistName, tune.id)
        })
        allAlbums(tune).forEach(function(albumName) {
            addTuneIdToIndexKey(maps.albums, albumName, tune.id)
        })
        return maps
    }

    function snapshotMaps() {
        return {
            books: Object.assign({}, lastBookIndexRef.current || bookIndex),
            tags: Object.assign({}, lastTagIndexRef.current || tagIndex),
            genres: Object.assign({}, lastGenreIndexRef.current || genreIndex),
            artists: Object.assign({}, lastArtistIndexRef.current || artistIndex),
            albums: Object.assign({}, lastAlbumIndexRef.current || albumIndex),
        }
    }

    function persistMapsIfChanged(maps, writeGeneration, previous) {
        if (!canPersistWrite(writeGeneration)) return
        if (!indexSnapshotEqual(maps.books, previous.books)) {
            persistBookIndex(maps.books, writeGeneration)
        }
        if (!indexSnapshotEqual(maps.tags, previous.tags)) {
            persistTagIndex(maps.tags, writeGeneration)
        }
        if (!indexSnapshotEqual(maps.genres, previous.genres)) {
            persistGenreIndex(maps.genres, writeGeneration)
        }
        if (!indexSnapshotEqual(maps.artists, previous.artists)) {
            persistArtistIndex(maps.artists, writeGeneration)
        }
        if (!indexSnapshotEqual(maps.albums, previous.albums)) {
            persistAlbumIndex(maps.albums, writeGeneration)
        }
    }
    
    function indexTune(tune) {
        if (reindexInProgressRef.current) return
        const writeGeneration = beginIndexWrite()
        const previous = snapshotMaps()
        const maps = {
            books: Object.assign({}, previous.books),
            tags: Object.assign({}, previous.tags),
            genres: Object.assign({}, previous.genres),
            artists: Object.assign({}, previous.artists),
            albums: Object.assign({}, previous.albums),
        }
        applyTuneToMaps(tune, maps)
        persistMapsIfChanged(maps, writeGeneration, previous)
    }
    
    function removeTune(tune, indexMap) {
        return removeTuneIdFromIndex(indexMap, tune)
    }
    
    function resetBookIndex() {
        persistBookIndex({}, beginIndexWrite())
    }
    
    function resetTagIndex() {
        persistTagIndex({}, beginIndexWrite())
    }

    function resetGenreIndex() {
        persistGenreIndex({}, beginIndexWrite())
    }

    function resetArtistIndex() {
        persistArtistIndex({}, beginIndexWrite())
    }

    function resetAlbumIndex() {
        persistAlbumIndex({}, beginIndexWrite())
    }
    
    function addTagToIndex(tag) {
        if (!Array.isArray(tagIndex[tag])) {
            const newTagIndex = Object.assign({}, tagIndex, { [tag]: [] })
            lastTagIndexRef.current = newTagIndex
            setTagIndex(newTagIndex)
        }
    }

    function addBookToIndex(book) {
        if (!Array.isArray(bookIndex[book])) {
            const newBookIndex = Object.assign({}, bookIndex, { [book]: [] })
            lastBookIndexRef.current = newBookIndex
            setBookIndex(newBookIndex)
        }
    }
    
    function removeBookFromIndex(book) {
        if (reindexInProgressRef.current) return
        const writeGeneration = beginIndexWrite()
        const newBookIndex = Object.assign({}, lastBookIndexRef.current || bookIndex)
        delete newBookIndex[book]
        persistBookIndex(newBookIndex, writeGeneration)
    }

    function removeTagFromIndex(tag) {
        if (reindexInProgressRef.current) return
        const writeGeneration = beginIndexWrite()
        const newTagIndex = Object.assign({}, lastTagIndexRef.current || tagIndex)
        delete newTagIndex[tag]
        persistTagIndex(newTagIndex, writeGeneration)
    }

    /**
     * Drop tag index keys that have zero tune ids (and optionally keys with
     * empty arrays). Does not modify tune.tags.
     * @returns {{ removed: string[], kept: number }}
     */
    function pruneEmptyTagsFromIndex() {
        if (reindexInProgressRef.current) {
            return { removed: [], kept: 0 }
        }
        const writeGeneration = beginIndexWrite()
        const prev = lastTagIndexRef.current || tagIndex || {}
        const next = {}
        const removed = []
        Object.keys(prev).forEach(function(tag) {
            const ids = prev[tag]
            if (Array.isArray(ids) && ids.length > 0) {
                next[tag] = ids
            } else {
                removed.push(tag)
            }
        })
        persistTagIndex(next, writeGeneration)
        return { removed: removed, kept: Object.keys(next).length }
    }

    /** Apply many tunes in memory, then one persist per index slice. */
    function indexTunes(tunes) {
        if (reindexInProgressRef.current) return
        const writeGeneration = beginIndexWrite()
        const previous = snapshotMaps()
        const maps = {
            books: Object.assign({}, previous.books),
            tags: Object.assign({}, previous.tags),
            genres: Object.assign({}, previous.genres),
            artists: Object.assign({}, previous.artists),
            albums: Object.assign({}, previous.albums),
        }
        Object.values(tunes || {}).forEach(function(tune) {
            applyTuneToMaps(tune, maps)
        })
        persistMapsIfChanged(maps, writeGeneration, previous)
    }

    function applyBuiltIndexes(built) {
        const books = built.books || {}
        const tags = built.tags || {}
        const genres = built.genres || {}
        const artists = built.artists || {}
        const albums = built.albums || {}
        const groups = built.tagGroups || {}
        setBookIndex(books)
        setTagIndex(tags)
        setGenreIndex(genres)
        setArtistIndex(artists)
        setAlbumIndex(albums)
        setTagGroups(groups)
        lastBookIndexRef.current = books
        lastTagIndexRef.current = tags
        lastGenreIndexRef.current = genres
        lastArtistIndexRef.current = artists
        lastAlbumIndexRef.current = albums
    }

    /**
     * Full rebuild: bump generation (invalidate in-flight writes), build in memory,
     * single saveAllIndexes swap. Never persists an empty intermediate.
     */
    async function reindexTunesAsync(tunes) {
        reindexInProgressRef.current = true
        indexGenerationRef.current += 1
        const myGeneration = indexGenerationRef.current
        try {
            const built = await rebuildIndexesFromTunes(tunes, {
                yieldToMain: yieldToMain,
                chunkSize: isCapacitorNative() ? 75 : 500,
                persist: false,
            })
            if (indexGenerationRef.current !== myGeneration) {
                return built
            }
            applyBuiltIndexes(built)
            await saveAllIndexes({
                books: built.books || {},
                tags: built.tags || {},
                genres: built.genres || {},
                artists: built.artists || {},
                albums: built.albums || {},
                tagGroups: built.tagGroups || {},
                meta: {
                    revision: Date.now(),
                    builtAt: new Date().toISOString(),
                    tuneCount: Object.keys(tunes || {}).length,
                },
            })
            return built
        } finally {
            if (indexGenerationRef.current === myGeneration) {
                reindexInProgressRef.current = false
            }
        }
    }

    /** Sync atomic rebuild for callers without async (never reset-to-empty first). */
    function reindexTunesSync(tunes) {
        reindexInProgressRef.current = true
        indexGenerationRef.current += 1
        const myGeneration = indexGenerationRef.current
        try {
            const built = buildIndexesFromTunes(tunes)
            if (indexGenerationRef.current !== myGeneration) return built
            applyBuiltIndexes(built)
            saveAllIndexes({
                books: built.books || {},
                tags: built.tags || {},
                genres: built.genres || {},
                artists: built.artists || {},
                albums: built.albums || {},
                tagGroups: built.tagGroups || {},
                meta: {
                    revision: Date.now(),
                    builtAt: new Date().toISOString(),
                    tuneCount: Object.keys(tunes || {}).length,
                },
            })
            return built
        } finally {
            if (indexGenerationRef.current === myGeneration) {
                reindexInProgressRef.current = false
            }
        }
    }

    function unindexTune(tune) {
        if (!tune || !tune.id) return
        if (reindexInProgressRef.current) return
        const writeGeneration = beginIndexWrite()
        const previous = snapshotMaps()
        const maps = {
            books: removeTuneIdFromIndex(previous.books, tune),
            tags: removeTuneIdFromIndex(previous.tags, tune),
            genres: removeTuneIdFromIndex(previous.genres, tune),
            artists: removeTuneIdFromIndex(previous.artists, tune),
            albums: removeTuneIdFromIndex(previous.albums, tune),
        }
        persistMapsIfChanged(maps, writeGeneration, previous)
    }

    function indexChangedTunes(tunes, tuneIds) {
        if (reindexInProgressRef.current) return
        if (!Array.isArray(tuneIds) || tuneIds.length === 0) {
            indexTunes(tunes)
            return
        }
        const writeGeneration = beginIndexWrite()
        const previous = snapshotMaps()
        const maps = {
            books: Object.assign({}, previous.books),
            tags: Object.assign({}, previous.tags),
            genres: Object.assign({}, previous.genres),
            artists: Object.assign({}, previous.artists),
            albums: Object.assign({}, previous.albums),
        }
        tuneIds.forEach(function(tuneId) {
            if (tunes && tunes[tuneId]) applyTuneToMaps(tunes[tuneId], maps)
        })
        persistMapsIfChanged(maps, writeGeneration, previous)
    }

    function getIndexBundle() {
      return {
        bookIndex: lastBookIndexRef.current || bookIndex,
        tagIndex: lastTagIndexRef.current || tagIndex,
        genreIndex: lastGenreIndexRef.current || genreIndex,
        artistIndex: lastArtistIndexRef.current || artistIndex,
        albumIndex: lastAlbumIndexRef.current || albumIndex,
      }
    }

    async function reloadFromStore() {
      invalidateIndexCache()
      const data = await loadAllIndexes()
      setBookIndex(data.books || {})
      setTagIndex(data.tags || {})
      setGenreIndex(data.genres || {})
      setArtistIndex(data.artists || {})
      setAlbumIndex(data.albums || {})
      setTagGroups(data.tagGroups || {})
      lastBookIndexRef.current = data.books || {}
      lastTagIndexRef.current = data.tags || {}
      lastGenreIndexRef.current = data.genres || {}
      lastArtistIndexRef.current = data.artists || {}
      lastAlbumIndexRef.current = data.albums || {}
      setIndexesReady(true)
      return data
    }
    
    return {
      indexTune,
      indexTunes,
      reindexTunesAsync,
      reindexTunesSync,
      indexChangedTunes,
      unindexTune,
      resetBookIndex,
      bookIndex,
      addBookToIndex,
      removeBookFromIndex,
      removeTagFromIndex,
      pruneEmptyTagsFromIndex,
      removeTune,
      addTagToIndex,
      resetTagIndex,
      tagIndex,
      genreIndex,
      resetGenreIndex,
      artistIndex,
      resetArtistIndex,
      albumIndex,
      resetAlbumIndex,
      indexesReady,
      getIndexBundle,
      reloadFromStore,
    }
}
export default useIndexes;
