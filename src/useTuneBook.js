import React from 'react'
import {useState, useEffect} from 'react'
import axios from 'axios'
import useUtils from './useUtils'
import useAbcTools from './useAbcTools'
import useIndexes from './useIndexes'
import {icons} from './Icons'
import curatedTuneBooks from './CuratedTuneBooks'



var useTuneBook = ({tunes, setTunes, tempo, setTempo, currentTune, setCurrentTune, currentTuneBook, setCurrentTuneBook, forceRefresh, textSearchIndex, tunesHash, setTunesHash, beatsPerBar, setBeatsPerBar}) => {
  //console.log(setTunesHash)
  const utils = useUtils()
  const abcTools = useAbcTools()
  const indexes = useIndexes()
  // from old data
  var dbTunes = {}
  //indexes.resetBookIndex()
  //var tunesFrom = Object.values(utils.loadLocalObject('abc2book_tunes')).map(function(tune) {
    //tune.id = utils.generateObjectId()
    //indexes.indexTune(tune)
    //dbTunes[tune.id] = tune
  //})
  
  
  function saveTune(tune) {
    if (tune) {
      if (!tune.id) tune.id = utils.generateObjectId()
      tunes[tune.id] = tune
      indexes.indexTune(tune)
      updateTunesHash(tune)
      setTunes(tunes)
      console.log('saved and indexed tune', tune.id, tune)
    }
    return tune
  }
  
  function deleteTune(tuneId) {
    delete tunes[tuneId]
    setTunes(tunes)
  }
  
  
  
  function buildTunesHash(forceTunes) {
    var hashes = {}
    var ids = {}
    var useTunes = forceTunes ? forceTunes : tunes;
    if (Array.isArray(useTunes) && useTunes.length > 0) {
      Object.values(useTunes).forEach(function(tune) {
        if (tune.id && tune.notes) {
          //console.log('BTHBB',tune.notes)
          var hash = utils.hash(tune.notes.join("\n"))
          if (!Array.isArray(hashes[hash])) hashes[hash] = []
          hashes[hash].push(tune.id)
          ids[tune.id] = hash
        }
      })
      console.log('BTH',{ids, hashes})
        setTunesHash({ids, hashes})
      }
    
  }
  
  function updateTunesHash(tune) {
    //console.log('update tune hash',tunesHash)
     if (tune.id ) {
        var oldHash = tunesHash && tunesHash.ids ? tunesHash.ids[tune.id] : null
        if (oldHash) {
          //console.log('update tune hash have old', oldHash, tunesHash.hashes[oldHash])
          if (Array.isArray(tunesHash.hashes[oldHash])) {
            tunesHash.hashes[oldHash] = tunesHash.hashes[oldHash].filter(function(ids) {
              if (Array.isArray(ids) && ids.indexOf(tune.id) === -1) {
                return true
              } else {
                return false
              }
            })
            if (tunesHash && tunesHash.hashes && tunesHash.hashes[oldHash].length === 0) {
              delete tunesHash.hashes[oldHash]
            }
          }
          if (tunesHash && tunesHash.ids ) delete tunesHash.ids[tune.id]
        }
        var hash = utils.hash(tune.notes.join("\n"))
        //console.log('update tune hash have new', hash)
        if (!tunesHash)  tunesHash = {}
        if (!tunesHash.hashes)  tunesHash.hashes = {}
        if (!tunesHash.ids)  tunesHash.ids = {}
        tunesHash.hashes[hash] = true
        tunesHash.ids[tune.id] = hash
        setTunesHash(tunesHash)
     }
  }
  
  /** 
   * import songs to a tunebook from an abc file 
   */
  function importAbc(abc, forceBook = null, forceDuplicates = false) {
      //console.log('importabc', abc)
      var duplicates=[]
      var inserts=[]
      var updates=[]
      if (abc) {
        //console.log('haveabc')
        var intunes = abcTools.abc2Tunebook(abc)
        //console.log('havetunes', tunes, tunesHash)
        intunes.forEach(function(tune) {
          // existing tunes are updated
          if (tune.id && intunes[tune.id]) {
            if (forceBook) {
              tune.books.push(forceBook)
              tune.books = utils.uniquifyArray(tune.books)
              saveTune(tune)
              updates.push(tune.id)
            }
            // preserve boost
            tune.boost = tunes[tune.id].boost
          // new tunes 
          } else {
            if (forceDuplicates) {
              if (forceBook) {
                tune.books.push(forceBook)
                tune.books = utils.uniquifyArray(tune.books)
              }
              var newTune = saveTune(tune)
              inserts.push(newTune.id)
            } else {
              var hash = utils.hash(tune.notes.join("\n"))
              //console.log("tryhash",hash,tunesHash.hashes[hash]   )
              if (tunesHash && tunesHash.hashes && tunesHash.hashes[hash] === true) {
                duplicates.push(tune)
              } else {
                if (forceBook) {
                  tune.books.push(forceBook)
                  tune.books = utils.uniquifyArray(tune.books)
                }
                var newTune = saveTune(tune)
                inserts.push(newTune.id)
              }
            }
          }
        })
      }
      return [inserts, updates, duplicates]
  }
  
  
  function importCollection(title) {
    console.log('impo col',title,curatedTuneBooks[title])
    return importAbc(curatedTuneBooks[title], title)
  }
  
  
  
  function getTuneBookOptions() {
      var final = {}
      Object.keys(indexes.bookIndex).forEach(function(tuneBookKey) {
          final[tuneBookKey] = tuneBookKey
      })
      //console.log("GET TUNEBOOKOPTIONS",final)
      return final
  }
  
  function getSearchTuneBookOptions(filter) {
      var opts = getTuneBookOptions()
      var filtered = {}
      Object.keys(opts).forEach(function(key) {
          var val = opts[key]
          if (val && val.indexOf(filter) !== -1) {
              filtered[key] = val
          }
      })
      return filtered
  }
    
  function resetTuneBook() {
    setTunes({})
    indexes.resetBookIndex()
    buildTunesHash()
  }
    
  function deleteTuneBook(book) {
    var final = {}
    Object.values(tunes).map(function(tune) {
      if (Array.isArray(tune.books) && tune.books.indexOf(book) !== -1) {
        if (tune.books.length > 1) {
          console.log('update books lose '+book,tune.books.indexOf(book),JSON.parse(JSON.stringify(tune.books)),JSON.parse(JSON.stringify(tune.books.splice(tune.books.indexOf(book),1))) )
          tune.books=tune.books.splice(tune.books.indexOf(book),1)
          final[tune.id] = tune
        } else {
          // ignore it
        }
      } else {
        final[tune.id] = tune
      }
    })
    indexes.removeBookFromIndex(book)
    console.log('DEL',Object.keys(tunes).length,Object.keys(final).length,final)
    setTunes(final)
    buildTunesHash(final)
    forceRefresh()
  }
  
  function deleteAll() {
    resetTuneBook()
    indexes.resetBookIndex()
    buildTunesHash()
  }
  
  function copyTuneBookAbc(book) {
    utils.copyText(toAbc(book))
  }

  function downloadTuneBookAbc(book) {
    var name = currentTuneBook ? currentTuneBook+'.abc' : 'tunebook.abc'
    utils.download(name,toAbc(book))
  }

  function fromBook(book) {
    //console.log('from book',book, tunes)
    var res = Object.values(tunes).filter(function(tune) {
        if (book) {
          if (Array.isArray(tune.books) && tune.books.indexOf(book) !== -1) {
            return true
          } else {
            return false
          }
        } else {
          return true
        }
    })
    //console.log('to abc res',res)
    return res
  }
  function toAbc(book) {
    //console.log('to abc',book, tunes)
    var res = Object.values(tunes).filter(function(tune) {
        if (book) {
          if (Array.isArray(tune.books) && tune.books.indexOf(book) !== -1) {
            return true
          } else {
            return false
          }
        } else {
          return true
        }
    }).map(function(tune, k) {
      //var newTune = tune
     // console.log(tune)
      if (tune && tune.meta) tune.meta.X = k
      return abcTools.json2abc(tune)
    }).join("\n")
    //console.log('to abc res',res)
    return res

  }

  return { importAbc, fromBook, deleteTuneBook, copyTuneBookAbc, downloadTuneBookAbc, resetTuneBook, importCollection, saveTune, utils, abcTools, icons,  curatedTuneBooks, getTuneBookOptions, getSearchTuneBookOptions, deleteAll, deleteTune, buildTunesHash, updateTunesHash , setTunes, setTempo, setCurrentTune, setCurrentTuneBook, setTunesHash, setBeatsPerBar, forceRefresh, indexes, textSearchIndex};
}
export default useTuneBook
