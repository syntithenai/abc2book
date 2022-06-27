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
     
  function navigateToNextSong(currentSongId, navigate) {
    //console.log("NEXT")
    var useTunes = tunes
    if (currentTuneBook) {
      useTunes = {}
      Object.values(tunes).forEach(function(val) {
        if (val && val.id && val.books && val.books.indexOf(currentTuneBook) !== -1) {
          //console.log(val, val.books)
          useTunes[val.id] = val
        }
      })
    } 
    function doFallback() {
      // fallback to first song
      if (Object.keys(useTunes).length > 0)  {
        var next = useTunes[Object.keys(useTunes)[0]]
        if (next && next.id) {
          navigate('/tunes/' + next.id)
        }
      }
    }
    if (currentSongId) {
      // find tune index allowing tunebook filter
      var i = 0
      var found = null
      while (i < Object.keys(useTunes).length) {
         var theTune = useTunes[Object.keys(useTunes)[i]]
          if (theTune && (theTune.id === currentSongId)) {
            var next = i + 1 % Object.keys(useTunes).length
            if (useTunes[Object.keys(useTunes)[next]] && useTunes[Object.keys(useTunes)[next]].id) {
              found = useTunes[Object.keys(useTunes)[next]].id
              break;
            }
          }
          i++
      }
      if (found) {
        navigate('/tunes/' + found)
      } else {
        doFallback()
      }
    // no current tunebook means only tunes with no books
    } else {
      doFallback()
    }
  }
  
  function navigateToPreviousSong(currentSongId, navigate) {
    //console.log("PREV")
    var useTunes = tunes
    if (currentTuneBook) {
      useTunes = {}
      Object.values(tunes).forEach(function(val) {
        if (val && val.id && val.books && val.books.indexOf(currentTuneBook) !== -1) {
          console.log(val, val.books)
          useTunes[val.id] = val
        }
      })
    } 
    function doFallback() {
      // fallback to first song
      if (Object.keys(useTunes).length > 0)  {
        var next = useTunes[Object.keys(useTunes)[0]]
        if (next && next.id) {
          navigate('/tunes/' + next.id)
        }
      }
    }
    if (currentSongId) {
      // find tune index allowing tunebook filter
      var i = 0
      var found = null
      while (i < Object.keys(useTunes).length) {
         var theTune = useTunes[Object.keys(useTunes)[i]]
          if (theTune && (theTune.id === currentSongId)) {
            var next = i - 1 % Object.keys(useTunes).length
            if (useTunes[Object.keys(useTunes)[next]] && useTunes[Object.keys(useTunes)[next]].id) {
              found = useTunes[Object.keys(useTunes)[next]].id
              break;
            }
          }
          i++
      }
      if (found) {
        navigate('/tunes/' + found)
      } else {
        doFallback()
      }
    // no current tunebook means only tunes with no books
    } else {
      doFallback()
    }
  }
  
  function saveTune(tune, skipTimestampUpdate = false) {
    //console.log('save tune', tune.id , tune, tunes)
    if (tune && tunes) {
      pauseSheetUpdates.current = true
      if (!tune.id) {
        //console.log('create id')
        tune.id = utils.generateObjectId()
      }
      if (skipTimestampUpdate) {
        // only if missing
        if (!tune.lastUpdated) tune.lastUpdated = new Date().getTime() 
      } else {
        tune.lastUpdated = new Date().getTime() 
      }
      //var cleanTune = JSON.parse(JSON.stringify(tune))
      //cleanTune.lastHash = null
      //tune.lastHash = utils.hash(JSON.stringify(cleanTune))
      tunes[tune.id] = tune
      indexes.indexTune(tune)
      updateTunesHash(tune)
      setTunes(tunes)
      //console.log('set tunes', tune, tunes)
      saveTunesOnline()
    }
    return tune
  }
  
  function deleteTune(tuneId) {
    pauseSheetUpdates.current = true
    indexes.removeTune(tunes[tuneId], indexes.bookIndex)
    
    delete tunes[tuneId]
    setTunes(tunes)
    saveTunesOnline()
  }
  
    
  function deleteTunes(tuneIds) {
    //console.log('delete tunes',tuneIds, tunes)
    if (Array.isArray(tuneIds)) {
      pauseSheetUpdates.current = true
      tuneIds.forEach(function(tuneId) {
        //console.log('deleting',tuneId,tunes[tuneId])
        //indexes.removeTune(tunes[tuneId], indexes.bookIndex)
        delete tunes[tuneId]
      })
      //console.log('deleted',tuneIds)
      setTunes(tunes)
      saveTunesOnline()
      //forceRefresh()
    }
  }
  
  // allow 10 seconds after save before polling for more updates
  function saveTunesOnline() {
    updateSheet(0).then(function() {
      setTimeout(function() {
        pauseSheetUpdates.current = false
      },10000)
    }) 
  }
  
  
  function addTunesToBook(tuneIds,book) {
    if (Array.isArray(tuneIds) && book && book.trim()) {
       pauseSheetUpdates.current = true
       tuneIds.forEach(function(id) {
        if (tunes[id]) {
          var books = Array.isArray(tunes[id].books) ? tunes[id].books : []
          if (books.indexOf(book) === -1) {
            books.push(book.trim())
            tunes[id].books = books
          }
        }
      })
      setTunes(tunes)
      saveTunesOnline()
    }
  }
  
  function removeTunesFromBook(tuneIds,book) {
    if (Array.isArray(tuneIds) && book && book.trim()) {
       pauseSheetUpdates.current = true
       tuneIds.forEach(function(id) {
        if (tunes[id]) {
          var books = Array.isArray(tunes[id].books) ? tunes[id].books : []
          if (books.indexOf(book) !== -1) {
            books.splice(books.indexOf(book),1)
            tunes[id].books = books
          }
        }
      })
      setTunes(tunes)
      saveTunesOnline()
    }
  }
  
  function applyImport( forceDuplicates=false, discardLocalUpdates = false) {
    var {inserts, updates, duplicates, localUpdates} = importResults
    //console.log('apply',importResults)
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
      // keep timestamps on import
      //var lastUpdated = tunes[tune.id] ? tunes[tune.id].lastUpdated : null
      //if (lastUpdated) tune.lastUpdated = lastUpdated
      var newTune = saveTune(tune,true)
      tunes[tune.id] = newTune
    })
    // any more recent changes locally get saved online
    if (discardLocalUpdates && localUpdates && Object.keys(localUpdates).length > 0) {
      Object.values(localUpdates).forEach(function(tune) {
        //tune.id = null
        //var newTune = saveTune(tune)
        tunes[tune.id] =tune
      })
      //updateSheet(0)
    } 
    // any more recent changes locally get saved online
    if (forceDuplicates && duplicates && Object.keys(duplicates).length > 0) {
      Object.values(duplicates).forEach(function(tune) {
        tune.id = null
        var newTune = saveTune(tune)
        tunes[tune.id] = newTune
      })
      //updateSheet(0)
    } 
    if ((discardLocalUpdates && localUpdates && Object.keys(localUpdates).length > 0) || (forceDuplicates &&  duplicates && Object.keys(duplicates).length > 0)|| (updates && Object.keys(updates).length > 0)|| (inserts && Object.keys(inserts).length > 0)) {
      setTunes(tunes)
      buildTunesHash()
      indexes.resetBookIndex()
      indexes.indexTunes(tunes)
      setImportResults(null)
      updateSheet(0)
    }
  }
  
  
  //useEffect(function() {
        //console.log("IL")
      //var filtered = Object.values(props.tunes).filter(filterSearch)
      //setFiltered(filtered)
      //var tuneStatus = {}
      ////setTimeout(function() {
          //filtered.forEach(function(tune) {
            //var hasNotes = false
            //var hasChords = false
            //if (tune.voices) {
                //Object.values(tune.voices).forEach(function(voice) {
                    //if (Array.isArray(voice.notes)) {
                        //for (var i=0 ; i < voice.notes.length; i++) {
                            //if (voice.notes[i]) {
                                //hasNotes = true
                                //if (voice.notes[i].indexOf('"' !== -1)) {
                                    //hasChords = true
                                //}
                                //if (hasNotes &&  hasChords) {
                                    //break;
                                //} 
                            //}
                        //}
                    //}
                //})
            //}
            //tuneStatus[tune.id] = {
              //hasLyrics:hasLyrics(tune),
              //hasNotes: hasNotes,
              //hasChords: hasChords
            //}
          //})
          //setTuneStatus(tuneStatus)
      ////},100)
    //},[filter,props.currentTuneBook])
    
    function hasLyrics(tune) {
        if (tune && tune.words) {
            //console.log("HL",tune)
            var found = false
            var wordList = Object.values(tune.words)
            for (var i = 0; i < wordList.length; i++) {
                var word =  wordList[i]
                if (word && word.trim()) {
                    found = true
                    break
                }
            }
        }
        return found
    }
  
  /** 
   * import songs to a tunebook from an abc file 
   * set results {updates, inserts, duplicates} into app scoped importResults
   */
  function importAbc(abc, forceBook = null, limitToTuneId=null, limitToBookName=null) {
      //console.log('importabc', forceBook)
      buildTunesHash(tunes)
      var duplicates=[]
      var inserts=[]
      var updates=[]
      var localUpdates=[]
      var skippedUpdates=[]
      var tuneStatus = {updates:[],inserts:[],localUpdates:[],skippedUpdates:[],duplicates:[]}
      if (abc) {
        //console.log('haveabc')
        var intunes = abcTools.abc2Tunebook(abc)
        //console.log('havetunes', intunes, "NOW",  tunes, tunesHash)
        intunes.forEach(function(tune) {
          if ((!limitToTuneId || tune.id === limitToTuneId) && (!limitToBookName || tune.books.indexOf(limitToBookName) !== -1))  {
            var hasNotes = false
            var hasChords = false
            if (tune.voices) {
                Object.values(tune.voices).forEach(function(voice) {
                    if (Array.isArray(voice.notes)) {
                        for (var i=0 ; i < voice.notes.length; i++) {
                            if (voice.notes[i]) {
                                hasNotes = true
                                if (voice.notes[i].indexOf('"' !== -1)) {
                                    hasChords = true
                                }
                                if (hasNotes &&  hasChords) {
                                    break;
                                } 
                            }
                        }
                    }
                })
            }
            
            
            
            
            // existing tunes are updated
            //console.log('haveabc',tune.id,tunes[tune.id])
            if (tune.id && tunes[tune.id]) {
              if (forceBook) {
                tune.books.push(forceBook)
                tune.books = utils.uniquifyArray(tune.books)
              }
              // preserve boost
              tune.boost = tunes[tune.id].boost
              if (tune.lastUpdated > tunes[tune.id].lastUpdated) {
                updates.push(tune)
                tuneStatus.updates.push({
                  hasLyrics:hasLyrics(tune),
                  hasNotes: hasNotes,
                  hasChords: hasChords
                })
                //console.log('update MORE RECENT')
              } else if (tune.lastUpdated < tunes[tune.id].lastUpdated) {
                localUpdates.push(tune)
                tuneStatus.localUpdates.push({
                  hasLyrics:hasLyrics(tune),
                  hasNotes: hasNotes,
                  hasChords: hasChords
                })
                //console.log('local update MORE RECENT')
              } else {
                skippedUpdates.push(tune)
                tuneStatus.skippedUpdates.push({
                  hasLyrics:hasLyrics(tune),
                  hasNotes: hasNotes,
                  hasChords: hasChords
                })
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
                var hash = abcTools.getTuneHash(tune)
                //utils.hash(tune.notes.join("\n"))
                //console.log("tryhash",hash,tunesHash, tunesHash.hashes[hash]   )
                if (tunesHash && tunesHash.hashes && tunesHash.hashes[hash] ) {
                  duplicates.push(tune)
                  tuneStatus.duplicates.push({
                    hasLyrics:hasLyrics(tune),
                    hasNotes: hasNotes,
                    hasChords: hasChords
                  })
                } else {
                  if (forceBook) {
                    tune.books.push(forceBook)
                    tune.books = utils.uniquifyArray(tune.books)
                  }
                  //var newTune = saveTune(tune)
                  inserts.push(tune) //newTune.id)
                  tuneStatus.inserts.push({
                    hasLyrics:hasLyrics(tune),
                    hasNotes: hasNotes,
                    hasChords: hasChords
                  })
                }
            }
          }
          
          
        })
      }
      saveTunesOnline()
      var final = {inserts, updates, duplicates, skippedUpdates, localUpdates, tuneStatus}
      //console.log('imported SABC',final)
      setImportResults(final)
      return {final}
  }
  
 
  
  //function importCollection(title) {
    ////console.log('impo col',title,curatedTuneBooks[title])
    //return importAbc(curatedTuneBooks[title], title)
  //}
  
  
  
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
    pauseSheetUpdates.current = true
    setTunes({})
    indexes.resetBookIndex()
    buildTunesHash()
    saveTunesOnline()
  }
    
  function deleteTuneBook(book) {
    //console.log('delete tune book',book)
    pauseSheetUpdates.current = true
    var final = {}
    Object.values(tunes).map(function(tune) {
      //console.log('delete tune book book',tune.books)
      if (Array.isArray(tune.books) && tune.books.indexOf(book) !== -1) {
        //console.log('delete tune book book MATCH',book,tune.books.length)
        if (tune.books.length > 1) {
          console.log('update books lose '+book)
          //,tune.books.indexOf(book),JSON.parse(JSON.stringify(tune.books)),JSON.parse(JSON.stringify(tune.books.splice(tune.books.indexOf(book),1))) )
          //console.log('before '+JSON.stringify(tune.books))
          tune.books.splice(tune.books.indexOf(book),1)
          //console.log('after '+JSON.stringify(tune.books))
          final[tune.id] = tune
        } else {
          //console.log('last book')
          // ignore it
        }
      } else {
        //console.log('no books for tune match')
        final[tune.id] = tune
      }
    })
    indexes.removeBookFromIndex(book)
    //console.log('DEL',Object.keys(tunes).length,Object.keys(final).length,final)
    setTunes(final)
    buildTunesHash(final)
    saveTunesOnline()
    setCurrentTuneBook(null)
    forceRefresh()
  }
  
  function deleteAll() {
    setTunes({})
    resetTuneBook()
    setCurrentTuneBook(null)
  }
  
  function copyTuneBookAbc(book) {
    utils.copyText(toAbc(book))
  }

  function downloadTuneBookAbc(book) {
    var name = book ? book+'.abc' : 'tunebook.abc'
    utils.download(name,toAbc(book))
  }
  
  function clearBoost() {
    pauseSheetUpdates.current = true
    const final = {}
    Object.values(tunes).forEach(function(tune) {
      tune.boost = 0
      final[tune.id] = tune
    })
    
    setTunes(final)
    buildTunesHash(final)
    saveTunesOnline() 
    //forceRefresh()
    
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

  return {deleteTunes,  removeTunesFromBook, addTunesToBook, clearBoost,applyImport, importAbc, toAbc, fromBook, deleteTuneBook, copyTuneBookAbc, downloadTuneBookAbc, resetTuneBook, saveTune, utils, abcTools, icons,  curatedTuneBooks, getTuneBookOptions, getSearchTuneBookOptions, deleteAll, deleteTune, buildTunesHash, updateTunesHash , setTunes, setCurrentTune, setCurrentTuneBook, setTunesHash, forceRefresh, indexes, textSearchIndex, recordingsManager: recordingsManager, navigateToPreviousSong,navigateToNextSong};
}
export default useTuneBook
