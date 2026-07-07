import useUtils from './useUtils'
import useAbcTools from './useAbcTools'
import {useState, useRef} from 'react'

function indexSnapshotEqual(a, b) {
    try {
        return JSON.stringify(a || {}) === JSON.stringify(b || {})
    } catch (e) {
        return false
    }
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
        //console.log('index single', tune, tune.id, tune.meta)
        // book index
        var bookIndexNew = utils.loadLocalObject('bookstorage_index_books')
        bookIndexNew = removeTune(tune,bookIndexNew)
        if (tune && tune.id && Array.isArray(tune.books) && tune.books.length > 0) {
            tune.books.forEach(function(book) {
                addTuneIdToIndexKey(bookIndexNew, book, tune.id)
            })
        }
        if (!indexSnapshotEqual(bookIndexNew, lastBookIndexRef.current)) {
            setBookIndex(bookIndexNew)
            lastBookIndexRef.current = bookIndexNew
        }
        
        var tagIndexNew = utils.loadLocalObject('bookstorage_index_tags')
        var tagGroupsNew = utils.loadLocalObject('bookstorage_tag_groups')
        tagIndexNew = removeTune(tune,tagIndexNew)
        if (tune && tune.id && Array.isArray(tune.tags) && tune.tags.length > 0) {
            tune.tags.forEach(function(tag) {
                addTuneIdToIndexKey(tagIndexNew, tag, tune.id)
            })
        }
        if (!indexSnapshotEqual(tagIndexNew, lastTagIndexRef.current)) {
            setTagIndex(tagIndexNew)
            lastTagIndexRef.current = tagIndexNew
        }

        var genreIndexNew = utils.loadLocalObject('bookstorage_index_genres')
        genreIndexNew = removeTune(tune, genreIndexNew)
        if (tune && tune.id && tune.genre && String(tune.genre).trim()) {
            addTuneIdToIndexKey(genreIndexNew, String(tune.genre).trim(), tune.id)
        }
        if (!indexSnapshotEqual(genreIndexNew, lastGenreIndexRef.current)) {
            setGenreIndex(genreIndexNew)
            lastGenreIndexRef.current = genreIndexNew
        }

        var artistIndexNew = utils.loadLocalObject('bookstorage_index_artists')
        artistIndexNew = removeTune(tune, artistIndexNew)
        if (tune && tune.id && tune.composer && String(tune.composer).trim()) {
            addTuneIdToIndexKey(artistIndexNew, String(tune.composer).trim(), tune.id)
        }
        if (!indexSnapshotEqual(artistIndexNew, lastArtistIndexRef.current)) {
            setArtistIndex(artistIndexNew)
            lastArtistIndexRef.current = artistIndexNew
        }

        utils.saveLocalObject('bookstorage_index_books', bookIndexNew)
        utils.saveLocalObject('bookstorage_index_tags', tagIndexNew)
        utils.saveLocalObject('bookstorage_index_genres', genreIndexNew)
        utils.saveLocalObject('bookstorage_index_artists', artistIndexNew)
        utils.saveLocalObject('bookstorage_tag_groups', tagGroupsNew)
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
        //console.log('index tunes',tunes)
        var bookIndexNew = utils.loadLocalObject('bookstorage_index_books')
        var tagIndexNew = utils.loadLocalObject('bookstorage_index_tags')
        var genreIndexNew = utils.loadLocalObject('bookstorage_index_genres')
        var artistIndexNew = utils.loadLocalObject('bookstorage_index_artists')
        
        
        Object.values(tunes).forEach(function(tune) {
            bookIndexNew = removeTune(tune,bookIndexNew)
            if (tune && tune.id && Array.isArray(tune.books) && tune.books.length > 0) {
                tune.books.forEach(function(book) {
                    addTuneIdToIndexKey(bookIndexNew, book, tune.id)
                })
            }
            
            tagIndexNew = removeTune(tune,tagIndexNew)
            if (tune && tune.id && Array.isArray(tune.tags) && tune.tags.length > 0) {
                tune.tags.forEach(function(tags) {
                    addTuneIdToIndexKey(tagIndexNew, tags, tune.id)
                })
            }

            genreIndexNew = removeTune(tune, genreIndexNew)
            if (tune && tune.id && tune.genre && String(tune.genre).trim()) {
                addTuneIdToIndexKey(genreIndexNew, String(tune.genre).trim(), tune.id)
            }

            artistIndexNew = removeTune(tune, artistIndexNew)
            if (tune && tune.id && tune.composer && String(tune.composer).trim()) {
                addTuneIdToIndexKey(artistIndexNew, String(tune.composer).trim(), tune.id)
            }
        })
        if (!indexSnapshotEqual(bookIndexNew, lastBookIndexRef.current)) {
            setBookIndex(bookIndexNew)
            lastBookIndexRef.current = bookIndexNew
        }
        if (!indexSnapshotEqual(tagIndexNew, lastTagIndexRef.current)) {
            setTagIndex(tagIndexNew)
            lastTagIndexRef.current = tagIndexNew
        }
        if (!indexSnapshotEqual(genreIndexNew, lastGenreIndexRef.current)) {
            setGenreIndex(genreIndexNew)
            lastGenreIndexRef.current = genreIndexNew
        }
        if (!indexSnapshotEqual(artistIndexNew, lastArtistIndexRef.current)) {
            setArtistIndex(artistIndexNew)
            lastArtistIndexRef.current = artistIndexNew
        }
        utils.saveLocalObject('bookstorage_index_books', bookIndexNew)
        utils.saveLocalObject('bookstorage_index_tags', tagIndexNew)
        utils.saveLocalObject('bookstorage_index_genres', genreIndexNew)
        utils.saveLocalObject('bookstorage_index_artists', artistIndexNew)
        //resetBookIndex()
    }
    
    return {indexTune ,indexTunes, resetBookIndex, bookIndex, addBookToIndex, removeBookFromIndex, removeTune, addTagToIndex, resetTagIndex, tagIndex, genreIndex, resetGenreIndex, artistIndex, resetArtistIndex}
}
export default useIndexes;
