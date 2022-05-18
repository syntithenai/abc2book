import useUtils from './useUtils'
import useAbcTools from './useAbcTools'
import {useState} from 'react'

 
var useIndexes = () => {
        
    var utils = useUtils()
    var abcTools = useAbcTools()
    var [bookIndex, setBookIndex] = useState(utils.loadLocalObject('bookstorage_index_books'))
    
    
    function indexTune(tune) {
        //console.log('index', tune, tune.id, tune.meta)
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
        utils.saveLocalObject('bookstorage_index_books', bookIndexNew)
    }
    
    function removeTune(tune, bookIndex) {
        var final = {}
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
        return final
    }
    
    function resetBookIndex() {
        utils.saveLocalObject('bookstorage_index_books',{})
    }

    function addBookToIndex(book) {
        if (!Array.isArray(bookIndex[book])) {
            let newBookIndex = bookIndex
            newBookIndex[book] = []
            setBookIndex(newBookIndex)
        }
    }
    
    function removeBookFromIndex(book) {
        let newBookIndex = bookIndex
        delete newBookIndex[book] 
        setBookIndex(newBookIndex)
    }
    
    function indexTunes(tunes) {
        var bookIndexNew = utils.loadLocalObject('bookstorage_index_books')
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
        })
        utils.saveLocalObject('bookstorage_index_books', bookIndexNew)
        resetBookIndex()
    }
    
    return {indexTune ,indexTunes, resetBookIndex, bookIndex, addBookToIndex, removeBookFromIndex, removeTune}
}
export default useIndexes;
