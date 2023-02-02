import useUtils from './useUtils'
import useAbcTools from './useAbcTools'
import {useState} from 'react'

var useIndexes = () => {
        
    var utils = useUtils()
    var abcTools = useAbcTools()
    var [bookIndex, setBookIndex] = useState(utils.loadLocalObject('bookstorage_index_books'))
    var [tagIndex, setTagIndex] = useState(utils.loadLocalObject('bookstorage_index_tags'))
    var [tagGroups, setTagGroups] = useState(utils.loadLocalObject('bookstorage_tag_groups'))
    
    function indexTune(tune) {
        //console.log('index single', tune, tune.id, tune.meta)
        // book index
        var bookIndexNew = utils.loadLocalObject('bookstorage_index_books')
        bookIndexNew = removeTune(tune,bookIndexNew)
        if (tune && tune.id && Array.isArray(tune.books) && tune.books.length > 0) {
            tune.books.forEach(function(book) {
                if (Array.isArray(bookIndexNew[book])) {
                    bookIndexNew[book].push(tune.id)
                } else {
                    bookIndexNew[book] = [tune.id]
                }
            })
        }
        setBookIndex(bookIndexNew)
        
        var tagIndexNew = utils.loadLocalObject('bookstorage_index_tags')
        var tagGroupsNew = utils.loadLocalObject('bookstorage_tag_groups')
        tagIndexNew = removeTune(tune,tagIndexNew)
        if (tune && tune.id && Array.isArray(tune.tags) && tune.tags.length > 0) {
            tune.tags.forEach(function(tag) {
                if (Array.isArray(tagIndexNew[tag])) {
                    tagIndexNew[tag].push(tune.id)
                } else {
                    tagIndexNew[tag] = [tune.id]
                }
            })
        }
        setTagIndex(tagIndexNew)
        utils.saveLocalObject('bookstorage_index_books', bookIndexNew)
        utils.saveLocalObject('bookstorage_index_tags', tagIndexNew)
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
        setBookIndex({})
    }
    
    function resetTagIndex() {
        //console.log('reset index')
        utils.saveLocalObject('bookstorage_index_tags',{})
        setTagIndex({})
    }
    
    function addTagToIndex(tag) {
        //console.log('add book to index', book)
        if (!Array.isArray(tagIndex[tag])) {
            let newTagIndex = tagIndex
            newTagIndex[tag] = []
            setTagIndex(newTagIndex)
        }
    }

    function addBookToIndex(book) {
        //console.log('add book to index', book)
        if (!Array.isArray(bookIndex[book])) {
            let newBookIndex = bookIndex
            newBookIndex[book] = []
            setBookIndex(newBookIndex)
        }
    }
    
    function removeBookFromIndex(book) {
        //console.log('remove book to index', book)
        let newBookIndex = bookIndex
        delete newBookIndex[book] 
        setBookIndex(newBookIndex)
    }
    
    function indexTunes(tunes) {
        //console.log('index tunes',tunes)
        var bookIndexNew = utils.loadLocalObject('bookstorage_index_books')
        var tagIndexNew = utils.loadLocalObject('bookstorage_index_tags')
        
        
        Object.values(tunes).forEach(function(tune) {
            bookIndexNew = removeTune(tune,bookIndexNew)
            if (tune && tune.id && Array.isArray(tune.books) && tune.books.length > 0) {
                tune.books.forEach(function(book) {
                    if (Array.isArray(bookIndexNew[book])) {
                        bookIndexNew[book].push(tune.id)
                    } else {
                        bookIndexNew[book] = [tune.id]
                    }
                })
            }
            setBookIndex(bookIndexNew)
            
            tagIndexNew = removeTune(tune,tagIndexNew)
            if (tune && tune.id && Array.isArray(tune.tags) && tune.tags.length > 0) {
                tune.tags.forEach(function(tags) {
                    if (Array.isArray(tagIndexNew[tags])) {
                        tagIndexNew[tags].push(tune.id)
                    } else {
                        tagIndexNew[tags] = [tune.id]
                    }
                })
            }
            setTagIndex(tagIndexNew)
        })
        utils.saveLocalObject('bookstorage_index_books', bookIndexNew)
        utils.saveLocalObject('bookstorage_index_tags', tagIndexNew)
        //resetBookIndex()
    }
    
    return {indexTune ,indexTunes, resetBookIndex, bookIndex, addBookToIndex, removeBookFromIndex, removeTune, addTagToIndex, resetTagIndex, tagIndex}
}
export default useIndexes;
