import useUtils from './useUtils'
import useAbcTools from './useAbcTools'
import {useState, useRef, useEffect} from 'react'
import { allAlbums, allArtists, allGenres } from './tuneBibliographicUtils'
import { isCapacitorNative } from './platformUtils'
import { yieldToMain } from './tuneListFilter'
import { rebuildIndexesFromTunes } from './tuneIndexRebuilder'
import {
  INDEX_STORE_KEYS,
  loadAllIndexes,
  saveIndexSlice,
  getCachedIndexes,
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
        index[key].push(tuneId)
    } else {
        index[key] = [tuneId]
    }
}

var useIndexes = () => {
        
    var utils = useUtils()
    var abcTools = useAbcTools()
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

    function persistBookIndex(next) {
        setBookIndex(next)
        lastBookIndexRef.current = next
        saveIndexSlice(INDEX_STORE_KEYS.books, next)
    }

    function persistTagIndex(next) {
        setTagIndex(next)
        lastTagIndexRef.current = next
        saveIndexSlice(INDEX_STORE_KEYS.tags, next)
    }

    function persistGenreIndex(next) {
        setGenreIndex(next)
        lastGenreIndexRef.current = next
        saveIndexSlice(INDEX_STORE_KEYS.genres, next)
    }

    function persistArtistIndex(next) {
        setArtistIndex(next)
        lastArtistIndexRef.current = next
        saveIndexSlice(INDEX_STORE_KEYS.artists, next)
    }

    function persistAlbumIndex(next) {
        setAlbumIndex(next)
        lastAlbumIndexRef.current = next
        saveIndexSlice(INDEX_STORE_KEYS.albums, next)
    }
    
    function indexTune(tune) {
        var bookIndexNew = removeTune(tune, Object.assign({}, lastBookIndexRef.current || bookIndex))
        if (tune && tune.id && Array.isArray(tune.books) && tune.books.length > 0) {
            tune.books.forEach(function(book) {
                addTuneIdToIndexKey(bookIndexNew, book, tune.id)
            })
        }
        if (!indexSnapshotEqual(bookIndexNew, lastBookIndexRef.current)) {
            persistBookIndex(bookIndexNew)
        }
        
        var tagIndexNew = removeTune(tune, Object.assign({}, lastTagIndexRef.current || tagIndex))
        if (tune && tune.id && Array.isArray(tune.tags) && tune.tags.length > 0) {
            tune.tags.forEach(function(tag) {
                addTuneIdToIndexKey(tagIndexNew, tag, tune.id)
            })
        }
        if (!indexSnapshotEqual(tagIndexNew, lastTagIndexRef.current)) {
            persistTagIndex(tagIndexNew)
        }

        var genreIndexNew = removeTune(tune, Object.assign({}, lastGenreIndexRef.current || genreIndex))
        if (tune && tune.id) {
            allGenres(tune).forEach(function(genreName) {
                addTuneIdToIndexKey(genreIndexNew, genreName, tune.id)
            })
        }
        if (!indexSnapshotEqual(genreIndexNew, lastGenreIndexRef.current)) {
            persistGenreIndex(genreIndexNew)
        }

        var artistIndexNew = removeTune(tune, Object.assign({}, lastArtistIndexRef.current || artistIndex))
        if (tune && tune.id) {
            allArtists(tune).forEach(function(artistName) {
                addTuneIdToIndexKey(artistIndexNew, artistName, tune.id)
            })
        }
        if (!indexSnapshotEqual(artistIndexNew, lastArtistIndexRef.current)) {
            persistArtistIndex(artistIndexNew)
        }

        var albumIndexNew = removeTune(tune, Object.assign({}, lastAlbumIndexRef.current || albumIndex))
        if (tune && tune.id) {
            allAlbums(tune).forEach(function(albumName) {
                addTuneIdToIndexKey(albumIndexNew, albumName, tune.id)
            })
        }
        if (!indexSnapshotEqual(albumIndexNew, lastAlbumIndexRef.current)) {
            persistAlbumIndex(albumIndexNew)
        }
    }
    
    function removeTune(tune, bookIndex) {
        var final = {}
        if (tune && tune.id) {
            Object.keys(bookIndex).forEach(function(bookName) {
                var indexVal = bookIndex[bookName]
                final[bookName] = indexVal.filter(function(val) {
                    return (val === tune.id) ? false : true
                })
            })
        }
        return final
    }
    
    function resetBookIndex() {
        persistBookIndex({})
    }
    
    function resetTagIndex() {
        persistTagIndex({})
    }

    function resetGenreIndex() {
        persistGenreIndex({})
    }

    function resetArtistIndex() {
        persistArtistIndex({})
    }

    function resetAlbumIndex() {
        persistAlbumIndex({})
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
        const newBookIndex = Object.assign({}, bookIndex)
        delete newBookIndex[book]
        lastBookIndexRef.current = newBookIndex
        setBookIndex(newBookIndex)
        saveIndexSlice(INDEX_STORE_KEYS.books, newBookIndex)
    }
    
    function indexTunes(tunes) {
        Object.values(tunes || {}).forEach(function(tune) {
            indexTune(tune)
        })
    }

    async function reindexTunesAsync(tunes) {
        const built = await rebuildIndexesFromTunes(tunes, {
            yieldToMain: yieldToMain,
            chunkSize: isCapacitorNative() ? 75 : 500,
        })
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
        return built
    }

    function unindexTune(tune) {
        if (!tune || !tune.id) return

        var bookIndexNew = removeTune(tune, Object.assign({}, lastBookIndexRef.current || bookIndex))
        if (!indexSnapshotEqual(bookIndexNew, lastBookIndexRef.current)) {
            persistBookIndex(bookIndexNew)
        }

        var tagIndexNew = removeTune(tune, Object.assign({}, lastTagIndexRef.current || tagIndex))
        if (!indexSnapshotEqual(tagIndexNew, lastTagIndexRef.current)) {
            persistTagIndex(tagIndexNew)
        }

        var genreIndexNew = removeTune(tune, Object.assign({}, lastGenreIndexRef.current || genreIndex))
        if (!indexSnapshotEqual(genreIndexNew, lastGenreIndexRef.current)) {
            persistGenreIndex(genreIndexNew)
        }

        var artistIndexNew = removeTune(tune, Object.assign({}, lastArtistIndexRef.current || artistIndex))
        if (!indexSnapshotEqual(artistIndexNew, lastArtistIndexRef.current)) {
            persistArtistIndex(artistIndexNew)
        }

        var albumIndexNew = removeTune(tune, Object.assign({}, lastAlbumIndexRef.current || albumIndex))
        if (!indexSnapshotEqual(albumIndexNew, lastAlbumIndexRef.current)) {
            persistAlbumIndex(albumIndexNew)
        }
    }

    function indexChangedTunes(tunes, tuneIds) {
        if (!Array.isArray(tuneIds) || tuneIds.length === 0) {
            indexTunes(tunes)
            return
        }
        tuneIds.forEach(function(tuneId) {
            if (tunes && tunes[tuneId]) indexTune(tunes[tuneId])
        })
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
      indexChangedTunes,
      unindexTune,
      resetBookIndex,
      bookIndex,
      addBookToIndex,
      removeBookFromIndex,
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
