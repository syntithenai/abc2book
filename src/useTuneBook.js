import React from 'react'
import {useState, useEffect, useRef} from 'react'
import axios from 'axios'
import useUtils from './useUtils'
import useAbcTools from './useAbcTools'
import useIndexes from './useIndexes'
import {icons} from './Icons'
import curatedTuneBooks from './CuratedTuneBooks'


var useTuneBook = ({importResults, setImportResults, tunes, setTunes,  currentTune, setCurrentTune, currentTuneBook, setCurrentTuneBook, forceRefresh, textSearchIndex, tunesHash, setTunesHash, updateSheet, indexes, updateTunesHash, buildTunesHash, pauseSheetUpdates, recordingsManager}) => {
  //console.log('usetuneook',typeof tunes)
  const utils = useUtils()
  const abcTools = useAbcTools()
  
  // from old data
  var dbTunes = {}
  //indexes.resetBookIndex()
  //var tunesFrom = Object.values(utils.loadLocalObject('abc2book_tunes')).map(function(tune) {
    //tune.id = utils.generateObjectId()
    //indexes.indexTune(tune)
    //dbTunes[tune.id] = tune
  //})
    
  
  function saveTune(tune) {
    //console.log('save tune', tune, tunes)
    if (tune && tunes) {
      pauseSheetUpdates.current = true
      if (!tune.id) tune.id = utils.generateObjectId()
      tune.lastUpdated = new Date().getTime() 
      //var cleanTune = JSON.parse(JSON.stringify(tune))
      //cleanTune.lastHash = null
      //tune.lastHash = utils.hash(JSON.stringify(cleanTune))
      tunes[tune.id] = tune
      indexes.indexTune(tune)
      updateTunesHash(tune)
      setTunes(tunes)
      //console.log('set tunes', tune, tunes)
      updateSheet().then(function() {
        pauseSheetUpdates.current = false
        //console.log('saved and indexed tune', tune.id, tune)
      }) // to google
      //
    }
    return tune
  }
  
  function deleteTune(tuneId) {
    indexes.removeTune(tunes[tuneId], indexes.bookIndex)
    
    delete tunes[tuneId]
    setTunes(tunes)
    updateSheet(0).then(function() {
      pauseSheetUpdates.current = false
    }) 
  }
  
  
  
  function applyImport( forceDuplicates=false) {
    var {inserts, updates, duplicates} = importResults
    console.log('apply',importResults)
    // save all inserts and updates
    // , delete all deletes
    //Object.keys(deletes).forEach(function(d) {
       //delete tunes[d]
    //})
    Object.keys(updates).map(function(u)  {
      if (updates[u] && updates[u].id) {
        // preserve boost
        if (tunes[updates[u].id]) updates[u].boost = tunes[updates[u].id].boost
        tunes[updates[u].id] = updates[u]
      }
    })
    Object.values(inserts).forEach(function(tune) {
      var newTune = saveTune(tune)
      tunes[tune.id] = newTune
    })
    // any more recent changes locally get saved online
    if (forceDuplicates && duplicates && Object.keys(duplicates).length > 0) {
      Object.values(duplicates).forEach(function(tune) {
        tune.id = null
        var newTune = saveTune(tune)
        tunes[tune.id] = newTune
      })
      //updateSheet(0)
    } 
    if ((forceDuplicates &&  duplicates && Object.keys(duplicates).length > 0)|| (updates && Object.keys(updates).length > 0)|| (inserts && Object.keys(inserts).length > 0)) {
      setTunes(tunes)
      buildTunesHash()
      indexes.resetBookIndex()
      indexes.indexTunes(tunes)
      setImportResults(null)
      updateSheet(0)
    }
  }
  
  /** 
   * import songs to a tunebook from an abc file 
   * set results {updates, inserts, duplicates} into app scoped importResults
   */
  function importAbc(abc, forceBook = null) {
      console.log('importabc', forceBook)
      buildTunesHash(tunes)
      var duplicates=[]
      var inserts=[]
      var updates=[]
      var localUpdates=[]
      var skippedUpdates=[]
      if (abc) {
        //console.log('haveabc')
        var intunes = abcTools.abc2Tunebook(abc)
        //console.log('havetunes', intunes, "NOW",  tunes, tunesHash)
        intunes.forEach(function(tune) {
          // existing tunes are updated
          console.log('haveabc',tune.id,tunes[tune.id])
          if (tune.id && tunes[tune.id]) {
            if (forceBook) {
              tune.books.push(forceBook)
              tune.books = utils.uniquifyArray(tune.books)
            }
            // preserve boost
            tune.boost = tunes[tune.id].boost
            if (tune.lastUpdated > tunes[tune.id].lastUpdated) {
              updates.push(tune)
              //console.log('update MORE RECENT')
            } else if (tune.lastUpdated < tunes[tune.id].lastUpdated) {
              localUpdates.push(tune)
              //console.log('local update MORE RECENT')
            } else {
              skippedUpdates.push(tune)
              //console.log('skip update NOT MORE RECENT')
            }
            
            //saveTune(tune)
            //updates.push(tune.id)
          // new tunes 
          } else {
            //if (forceDuplicates) {
              //if (forceBook) {
                //tune.books.push(forceBook)
                //tune.books = utils.uniquifyArray(tune.books)
              //}
              ////var newTune = saveTune(tune)
              //inserts.push(tune)
            //} else {
              var hash = hash = abcTools.getTuneHash(tune)
              //utils.hash(tune.notes.join("\n"))
              //console.log("tryhash",hash,tunesHash, tunesHash.hashes[hash]   )
              if (tunesHash && tunesHash.hashes && tunesHash.hashes[hash] ) {
                duplicates.push(tune)
              } else {
                if (forceBook) {
                  tune.books.push(forceBook)
                  tune.books = utils.uniquifyArray(tune.books)
                }
                //var newTune = saveTune(tune)
                inserts.push(tune) //newTune.id)
              }
            //}
          }
        })
      }
      updateSheet(0).then(function() {
        pauseSheetUpdates.current = false
      }) 
      var final = {inserts, updates, duplicates, skippedUpdates, localUpdates}
      console.log('imported SABC',final)
      setImportResults(final)
      return {final}
  }
  
 
  
  function importCollection(title) {
    //console.log('impo col',title,curatedTuneBooks[title])
    return importAbc(curatedTuneBooks[title], title)
  }
  
  
  
  function getTuneBookOptions() {
      var final = {}
      Object.keys(indexes.bookIndex).forEach(function(tuneBookKey) {
          final[tuneBookKey] = tuneBookKey
      })
      //console.log("GET TUNEBOOKOPTIONS",indexes,final)
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
    //console.log("search TUNEBOOKOPTIONS",filter,opts,filtered)
      return filtered
  }
    
  function resetTuneBook() {
    setTunes({})
    indexes.resetBookIndex()
    buildTunesHash()
    updateSheet(0).then(function() {
      pauseSheetUpdates.current = false
    }) 
  }
    
  function deleteTuneBook(book) {
    var final = {}
    Object.values(tunes).map(function(tune) {
      if (Array.isArray(tune.books) && tune.books.indexOf(book) !== -1) {
        if (tune.books.length > 1) {
          //console.log('update books lose '+book,tune.books.indexOf(book),JSON.parse(JSON.stringify(tune.books)),JSON.parse(JSON.stringify(tune.books.splice(tune.books.indexOf(book),1))) )
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
    //console.log('DEL',Object.keys(tunes).length,Object.keys(final).length,final)
    setTunes(final)
    buildTunesHash(final)
    updateSheet(0).then(function() {
      pauseSheetUpdates.current = false
    }) 
    setCurrentTuneBook(null)
    forceRefresh()
  }
  
  function deleteAll() {
    resetTuneBook()
    indexes.resetBookIndex()
    buildTunesHash()
    updateSheet(0).then(function() {
      pauseSheetUpdates.current = false
    }) 
    setCurrentTuneBook(null)
    
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

  return { applyImport, importAbc, toAbc, fromBook, deleteTuneBook, copyTuneBookAbc, downloadTuneBookAbc, resetTuneBook, importCollection, saveTune, utils, abcTools, icons,  curatedTuneBooks, getTuneBookOptions, getSearchTuneBookOptions, deleteAll, deleteTune, buildTunesHash, updateTunesHash , setTunes, setCurrentTune, setCurrentTuneBook, setTunesHash, forceRefresh, indexes, textSearchIndex, recordingsManager: recordingsManager};
}
export default useTuneBook
