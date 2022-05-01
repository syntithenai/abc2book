import useUtils from './useUtils'
import useAbcTools from './useAbcTools'


var useIndexes = () => {
        
    var utils = useUtils()
    var abcTools = useAbcTools()
    
    function indexTune(tune) {
        //console.log('index', tune, tune.id, tune.meta)
        // book index
        var bookIndex = utils.loadLocalObject('bookstorage_index_books')
        bookIndex = removeTune(tune,bookIndex)
        if (tune && tune.id && tune.meta && tune.meta['B']) {
            if (Array.isArray(bookIndex[tune.meta['B']])) {
                bookIndex[tune.meta['B']].push(tune.id)
            } else {
                bookIndex[tune.meta['B']] = [tune.id]
            }
        }
        utils.saveLocalObject('bookstorage_index_books', bookIndex)
    }
    
    function removeTune(tune, bookIndex) {
        var final = {}
        //console.log('remove index',bookIndex,final)
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

    
    return {indexTune , resetBookIndex}
}
export default useIndexes;
