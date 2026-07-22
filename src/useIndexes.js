import useUtils from './useUtils'
import useAbcTools from './useAbcTools'
import {useState, useRef} from 'react'
import { allArtists } from './tuneBibliographicUtils'

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
    var [bookIndex, setBookIndex] = useState(utils.loadLocalObject('bookstorage_index_books'))
    var [tagIndex, setTagIndex] = useState(utils.loadLocalObject('bookstorage_index_tags'))
    var [genreIndex, setGenreIndex] = useState(utils.loadLocalObject('bookstorage_index_genres'))
    var [artistIndex, setArtistIndex] = useState(utils.loadLocalObject('bookstorage_index_artists'))
    var [tagGroups, setTagGroups] = useState(utils.loadLocalObject('bookstorage_tag_groups'))
    var lastBookIndexRef = useRef(bookIndex)
    var lastTagIndexRef = useRef(tagIndex)
    var lastGenreIndexRef = useRef(genreIndex)
    var lastArtistIndexRef = useRef(artistIndex)
    
    function indexTune(tune) {
        var bookIndexNew = removeTune(tune, Object.assign({}, lastBookIndexRef.current || bookIndex))
        if (tune && tune.id && Array.isArray(tune.books) && tune.books.length > 0) {
            tune.books.forEach(function(book) {
                addTuneIdToIndexKey(bookIndexNew, book, tune.id)
            })
        }
        if (!indexSnapshotEqual(bookIndexNew, lastBookIndexRef.current)) {
            setBookIndex(bookIndexNew)
            lastBookIndexRef.current = bookIndexNew
            utils.saveLocalObject('bookstorage_index_books', bookIndexNew)
        }
        
        var tagIndexNew = removeTune(tune, Object.assign({}, lastTagIndexRef.current || tagIndex))
        if (tune && tune.id && Array.isArray(tune.tags) && tune.tags.length > 0) {
            tune.tags.forEach(function(tag) {
                addTuneIdToIndexKey(tagIndexNew, tag, tune.id)
            })
        }
        if (!indexSnapshotEqual(tagIndexNew, lastTagIndexRef.current)) {
            setTagIndex(tagIndexNew)
            lastTagIndexRef.current = tagIndexNew
            utils.saveLocalObject('bookstorage_index_tags', tagIndexNew)
        }

        var genreIndexNew = removeTune(tune, Object.assign({}, lastGenreIndexRef.current || genreIndex))
        if (tune && tune.id && tune.genre && String(tune.genre).trim()) {
            addTuneIdToIndexKey(genreIndexNew, String(tune.genre).trim(), tune.id)
        }
        if (!indexSnapshotEqual(genreIndexNew, lastGenreIndexRef.current)) {
            setGenreIndex(genreIndexNew)
            lastGenreIndexRef.current = genreIndexNew
            utils.saveLocalObject('bookstorage_index_genres', genreIndexNew)
        }

        var artistIndexNew = removeTune(tune, Object.assign({}, lastArtistIndexRef.current || artistIndex))
        if (tune && tune.id) {
            allArtists(tune).forEach(function(artistName) {
                addTuneIdToIndexKey(artistIndexNew, artistName, tune.id)
            })
        }
        if (!indexSnapshotEqual(artistIndexNew, lastArtistIndexRef.current)) {
            setArtistIndex(artistIndexNew)
            lastArtistIndexRef.current = artistIndexNew
            utils.saveLocalObject('bookstorage_index_artists', artistIndexNew)
        }
    }
    
    function removeTune(tune, bookIndex) {
        var final = {}
        if (tune && tune.id) {
            //console.log('remove index',bookIndex,tune)
            //return bookIndex
            
            Object.keys(bookIndex).forEach(function(bookName) {
                var indexVal = bookIndex[bookName]
                //console.log('filter remove index',bookName,indexVal)
                final[bookName] = indexVal.filter(function(val) {
                    //console.log('FF',val, tune.id, (val === tune.id) ? 'OK' : "FF")
                    return (val === tune.id) ? false : true
                })
            })
            //console.log('remove index',bookIndex,final)
        }
        return final
    }
    
    function resetBookIndex() {
        //console.log('reset index')
        utils.saveLocalObject('bookstorage_index_books',{})
        lastBookIndexRef.current = {}
        setBookIndex({})
    }
    
    function resetTagIndex() {
        //console.log('reset index')
        utils.saveLocalObject('bookstorage_index_tags',{})
        lastTagIndexRef.current = {}
        setTagIndex({})
    }

    function resetGenreIndex() {
        utils.saveLocalObject('bookstorage_index_genres', {})
        lastGenreIndexRef.current = {}
        setGenreIndex({})
    }

    function resetArtistIndex() {
        utils.saveLocalObject('bookstorage_index_artists', {})
        lastArtistIndexRef.current = {}
        setArtistIndex({})
    }
    
    function addTagToIndex(tag) {
        //console.log('add book to index', book)
        if (!Array.isArray(tagIndex[tag])) {
            const newTagIndex = Object.assign({}, tagIndex, { [tag]: [] })
            lastTagIndexRef.current = newTagIndex
            setTagIndex(newTagIndex)
        }
    }

    function addBookToIndex(book) {
        //console.log('add book to index', book)
        if (!Array.isArray(bookIndex[book])) {
            const newBookIndex = Object.assign({}, bookIndex, { [book]: [] })
            lastBookIndexRef.current = newBookIndex
            setBookIndex(newBookIndex)
        }
    }
    
    function removeBookFromIndex(book) {
        //console.log('remove book to index', book)
        const newBookIndex = Object.assign({}, bookIndex)
        delete newBookIndex[book]
        lastBookIndexRef.current = newBookIndex
        setBookIndex(newBookIndex)
    }
    
    function indexTunes(tunes) {
        Object.values(tunes || {}).forEach(function(tune) {
            indexTune(tune)
        })
    }

    function unindexTune(tune) {
        if (!tune || !tune.id) return

        var bookIndexNew = removeTune(tune, Object.assign({}, lastBookIndexRef.current || bookIndex))
        if (!indexSnapshotEqual(bookIndexNew, lastBookIndexRef.current)) {
            setBookIndex(bookIndexNew)
            lastBookIndexRef.current = bookIndexNew
            utils.saveLocalObject('bookstorage_index_books', bookIndexNew)
        }

        var tagIndexNew = removeTune(tune, Object.assign({}, lastTagIndexRef.current || tagIndex))
        if (!indexSnapshotEqual(tagIndexNew, lastTagIndexRef.current)) {
            setTagIndex(tagIndexNew)
            lastTagIndexRef.current = tagIndexNew
            utils.saveLocalObject('bookstorage_index_tags', tagIndexNew)
        }

        var genreIndexNew = removeTune(tune, Object.assign({}, lastGenreIndexRef.current || genreIndex))
        if (!indexSnapshotEqual(genreIndexNew, lastGenreIndexRef.current)) {
            setGenreIndex(genreIndexNew)
            lastGenreIndexRef.current = genreIndexNew
            utils.saveLocalObject('bookstorage_index_genres', genreIndexNew)
        }

        var artistIndexNew = removeTune(tune, Object.assign({}, lastArtistIndexRef.current || artistIndex))
        if (!indexSnapshotEqual(artistIndexNew, lastArtistIndexRef.current)) {
            setArtistIndex(artistIndexNew)
            lastArtistIndexRef.current = artistIndexNew
            utils.saveLocalObject('bookstorage_index_artists', artistIndexNew)
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
    
    return {indexTune ,indexTunes, indexChangedTunes, unindexTune, resetBookIndex, bookIndex, addBookToIndex, removeBookFromIndex, removeTune, addTagToIndex, resetTagIndex, tagIndex, genreIndex, resetGenreIndex, artistIndex, resetArtistIndex}
}
export default useIndexes;
