import React from 'react'
import {useState, useEffect, useRef} from 'react'
import axios from 'axios'
import useUtils from './useUtils'
import useAbcTools from './useAbcTools'
import useIndexes from './useIndexes'
import {icons} from './Icons'
import curatedTuneBooks from './CuratedTuneBooks'

var useTuneBook = ({importResults, setImportResults, tunes, setTunes,  currentTune, setCurrentTune, currentTuneBook, setCurrentTuneBook,tagFilter, setTagFilter, filter, setFilter, groupBy, setGroupBy, forceRefresh, textSearchIndex, tunesHash, setTunesHash, updateSheet, indexes, updateTunesHash, buildTunesHash, pauseSheetUpdates, recordingsManager, mediaPlaylist, setMediaPlaylist, abcPlaylist, setAbcPlaylist}) => {
  //console.log('usetuneook',typeof tunes)
  const utils = useUtils()
  const abcTools = useAbcTools()
  // from old data
  var dbTunes = {}
  var saveOnlineTimeout = null
  //indexes.resetBookIndex()
  //var tunesFrom = Object.values(utils.loadLocalObject('abc2book_tunes')).map(function(tune) {
    //tune.id = utils.generateObjectId()
    //indexes.indexTune(tune)
    //dbTunes[tune.id] = tune
  //})
     
  function navigateToNextSong(currentSongId, navigate) {
        //console.log("NEXT", mediaPlaylist, abcPlaylist)
    if (abcPlaylist && abcPlaylist.tunes && abcPlaylist.tunes.length > 0) { 
        //console.log("NEXT abc")
        var newPL = abcPlaylist
        var currentTune = newPL.currentTune > 0 ? newPL.currentTune : 0
        newPL.currentTune = currentTune + 1 % abcPlaylist.tunes.length
        setAbcPlaylist(newPL)
        if (abcPlaylist.tunes && abcPlaylist.tunes[newPL.currentTune] && abcPlaylist.tunes[newPL.currentTune].id) {
            navigate("/tunes/"+abcPlaylist.tunes[newPL.currentTune].id+"/playMidi") 
        }
    } else if (mediaPlaylist && mediaPlaylist.tunes && mediaPlaylist.tunes.length > 0) { 
        //console.log("NEXT media")
        var newPL = mediaPlaylist
        var currentTune = newPL.currentTune > 0 ? newPL.currentTune : 0
        newPL.currentTune = currentTune + 1 % mediaPlaylist.tunes.length
        setMediaPlaylist(newPL)
        if (mediaPlaylist.tunes && mediaPlaylist.tunes[newPL.currentTune] && mediaPlaylist.tunes[newPL.currentTune].id) {
            navigate("/tunes/"+mediaPlaylist.tunes[newPL.currentTune].id+"/playMedia") 
        }
    } else {
        
        if (currentSongId) {
          var useTunes = fromSearch(filter, currentTuneBook, tagFilter)
          useTunes = useTunes.sort(function(a,b) { 
            return (a.name && b.name && a.name.toLowerCase().trim() < b.name.toLowerCase().trim()) ? -1 : 1
          })
          //groupBy='key'
          if (groupBy) {
               //console.log("NEXT aa group sort ", groupBy)
               useTunes = useTunes.sort(function(a,b) { 
                  var aa = a && a[groupBy] && a[groupBy].length > 0 ? (Array.isArray(a[groupBy]) ? a[groupBy].join(',') : a[groupBy]) : ''
                  var bb = b && b[groupBy] && b[groupBy].length > 0 ? (Array.isArray(b[groupBy]) ? b[groupBy].join(',') : b[groupBy]) : ''
                  if (aa < bb) {
                    return -1
                  } else if (aa > bb) {
                    return 1  
                  } else { 
                    return 0
                  } 
                  
              })
              //console.log("NEXT aa ", JSON.parse(JSON.stringify(useTunes.map(function(t) {return {name: t.name, key: t.key }} ))))
          }
          
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
          //console.log("NEXT found ",found)
          if (found) {
            setCurrentTune(found)
            navigate('/tunes/' + found)
          }
        } 
        
    }
  }
  
  function navigateToPreviousSong(currentSongId, navigate) {
    //console.log("PREV")
    if (abcPlaylist && abcPlaylist.tunes && abcPlaylist.tunes.length > 0) { 
        //console.log("NEXT")
        var newPL = abcPlaylist
        var currentTune = newPL.currentTune > 0 ? newPL.currentTune : 0
        newPL.currentTune = currentTune - 1 % abcPlaylist.tunes.length
        setAbcPlaylist(newPL)
        if (abcPlaylist.tunes && abcPlaylist.tunes[newPL.currentTune] && abcPlaylist.tunes[newPL.currentTune].id) {
            navigate("/tunes/"+abcPlaylist.tunes[newPL.currentTune].id+"/playMidi") 
        }
    } else if (mediaPlaylist && mediaPlaylist.tunes && mediaPlaylist.tunes.length > 0) { 
        //console.log("NEXT")
        var newPL = mediaPlaylist
        var currentTune = newPL.currentTune > 0 ? newPL.currentTune : 0
        newPL.currentTune = currentTune - 1 % mediaPlaylist.tunes.length
        setMediaPlaylist(newPL)
        if (mediaPlaylist.tunes && mediaPlaylist.tunes[newPL.currentTune] && mediaPlaylist.tunes[newPL.currentTune].id) {
            navigate("/tunes/"+mediaPlaylist.tunes[newPL.currentTune].id+"/playMedia") 
        }
    } else {
        //console.log("PREV aa")
        if (currentSongId) {
            
          var useTunes = fromSearch(filter, currentTuneBook, tagFilter)
          //console.log("PREVa aa ", useTunes)
          useTunes.sort(function(a,b) { 
            return (a.name && b.name && a.name.toLowerCase().trim() < b.name.toLowerCase().trim()) ? -1 : 1
          })
          if (groupBy) {
              useTunes = useTunes.sort(function(a,b) { 
                  var aa = a && a[groupBy] && a[groupBy].length > 0 ? (Array.isArray(a[groupBy]) ? a[groupBy].join(',') : a[groupBy]) : ''
                  var bb = b && b[groupBy] && b[groupBy].length > 0 ? (Array.isArray(b[groupBy]) ? b[groupBy].join(',') : b[groupBy]) : ''
                  if (aa < bb) {
                    return -1
                  } else if (aa > bb) {
                    return 1  
                  } else { 
                    return 0
                  } 
                  
              })
          }
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
          //console.log("PREV found ",found)
          if (found) {
            setCurrentTune(found)
            navigate('/tunes/' + found)
          }
        }
        
    }
  }
  
  function createTune(tune = null, skipTimestampUpdate = false) {
      if (!tune) tune = {} 
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
      return tune
  }
  
  function saveTune(tune, skipTimestampUpdate = false) {
      
    //console.log('save tune', tune, tunes)
    if (tune && tunes) {
      pauseSheetUpdates.current = true
      tune = createTune(tune) 
      //var cleanTune = JSON.parse(JSON.stringify(tune))
      //cleanTune.lastHash = null
      //tune.lastHash = utils.hash(JSON.stringify(cleanTune))
      //console.log('save tune id', tune.id)
      tune.links = Array.isArray(tune.links) ? tune.links.filter(function(link) {
          return (link && (link.title || link.link || link.startAt || link.endAt))
      }) : [] 
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
  
  // 5 seconds debounce on online save
  // allow 10 seconds after save before polling for more updates
  function saveTunesOnline() {
       return updateSheet(5000).then(function() {
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
  
  
  function addTunesToTag(tuneIds,tag) {
      //console.log()
    if (Array.isArray(tuneIds) && tag && tag.trim()) {
       pauseSheetUpdates.current = true
       tuneIds.forEach(function(id) {
        if (tunes[id]) {
          var tags = Array.isArray(tunes[id].tags) ? tunes[id].tags : []
          if (tags.indexOf(tag) === -1) {
            tags.push(tag.trim())
            tunes[id].tags = tags
          }
        }
      })
      setTunes(tunes)
      saveTunesOnline()
    }
  }
  
  function removeTunesFromTag(tuneIds,tag) {
    if (Array.isArray(tuneIds) && tag && tag.trim()) {
      pauseSheetUpdates.current = true
      tuneIds.forEach(function(id) {
        if (tunes[id]) {
          var tags = Array.isArray(tunes[id].tags) ? tunes[id].tags : []
          if (tags.indexOf(tag) !== -1) {
            tags.splice(tags.indexOf(tag),1)
            tunes[id].tags = tags
          }
        }
      })
      setTunes(tunes)
      saveTunesOnline()
    }
  }
  
  //props.tunebook.bulkChangeTunes(Object.keys(props.selected), key, value)
  function bulkChangeTunes(tuneIds,key, value) {
    if (Array.isArray(tuneIds)) {
      pauseSheetUpdates.current = true
      tuneIds.forEach(function(id) {
        if (tunes[id] && key) {
            if (Array.isArray(tunes[id][key]) && Array.isArray(value) ) {
                value.forEach(function(v) {
                    tunes[id][key].push(value)
                })
            } else {
                tunes[id][key] = value
            }
            
          //var books = Array.isArray(tunes[id].books) ? tunes[id].books : []
          //if (books.indexOf(book) !== -1) {
            //books.splice(books.indexOf(book),1)
            //tunes[id].books = books
          //}
        }
      })
      //console.log('bulk change',tuneIds)
      setTunes(tunes)
      
    }
    return saveTunesOnline()
  }
  
  
  function applyMergeData(data, forceDuplicates=false, discardLocalUpdates = false) {
    //console.log('apply merge',data)
    return new Promise(function(resolve,reject) {
        utils.loadLocalforageObject('bookstorage_tunes').then(function(tunes) {
            //console.log('havetunes',  tunes, tunesHash)
      
            var {inserts, updates, duplicates, localUpdates} = data
            //
            // save all inserts and updates
            // , delete all deletes
            //Object.keys(deletes).forEach(function(d) {
               //delete tunes[d]
            //})
            Object.keys(updates).map(function(u)  {
              if (updates[u] && updates[u].id) {
                // preserve boost
                //if (tunes[updates[u].id]) updates[u].boost = tunes[updates[u].id].boost
                tunes[updates[u].id] = updates[u]
              }
            })
            //console.log('done updates')
            
            
            Object.values(inserts).forEach(function(tune) {
              // keep timestamps on import
              //var lastUpdated = tunes[tune.id] ? tunes[tune.id].lastUpdated : null
              //if (lastUpdated) tune.lastUpdated = lastUpdated
              var newTune = createTune(tune,true)
              tunes[tune.id] = newTune
            })
            //console.log('done inserts')
            // any more recent changes locally get saved online
            if (discardLocalUpdates && localUpdates && Object.keys(localUpdates).length > 0) {
              Object.values(localUpdates).forEach(function(tune) {
                //tune.id = null
                //var newTune = saveTune(tune)
                tunes[tune.id] =tune
              })
              //updateSheet(0)
            } 
            //console.log('done local updates')
            // any more recent changes locally get saved online
            if (forceDuplicates && duplicates && Object.keys(duplicates).length > 0) {
              Object.values(duplicates).forEach(function(tune) {
                tune.id = null
                var newTune = createTune(tune)
                tunes[tune.id] = newTune
              })
              //updateSheet(0)
            } 
            //console.log('done dups')
            if ((discardLocalUpdates && localUpdates && Object.keys(localUpdates).length > 0) || (forceDuplicates &&  duplicates && Object.keys(duplicates).length > 0)|| (updates && Object.keys(updates).length > 0)|| (inserts && Object.keys(inserts).length > 0)) {
                //console.log('FINALLY SET ',tunes)
              setTunes(tunes)
              buildTunesHash()
              indexes.resetBookIndex()
              indexes.resetTagIndex()
              indexes.indexTunes(tunes)
              setImportResults(null)
              saveTunesOnline()
              resolve(tunes)
              //updateSheet(5000)
            } else {
                resolve(tunes)
            }
        })
    })
  }
  
  function applyImportData(data, forceDuplicates=false, discardLocalUpdates = false) {
    //console.log('apply',importResults)
    
    var {inserts, updates, duplicates, localUpdates} = data
    //
    // save all inserts and updates
    // , delete all deletes
    //Object.keys(deletes).forEach(function(d) {
       //delete tunes[d]
    //})
    Object.keys(updates).map(function(u)  {
      if (updates[u] && updates[u].id) {
        // preserve boost
        //if (tunes[updates[u].id]) updates[u].boost = tunes[updates[u].id].boost
        tunes[updates[u].id] = updates[u]
      }
    })
    //console.log('done updates')
    
    
    Object.values(inserts).forEach(function(tune) {
      // keep timestamps on import
      //var lastUpdated = tunes[tune.id] ? tunes[tune.id].lastUpdated : null
      //if (lastUpdated) tune.lastUpdated = lastUpdated
      var newTune = createTune(tune,true)
      tunes[tune.id] = newTune
    })
    //console.log('done inserts')
    // any more recent changes locally get saved online
    if (discardLocalUpdates && localUpdates && Object.keys(localUpdates).length > 0) {
      Object.values(localUpdates).forEach(function(tune) {
        //tune.id = null
        //var newTune = saveTune(tune)
        tunes[tune.id] =tune
      })
      //updateSheet(0)
    } 
    //console.log('done local updates')
    // any more recent changes locally get saved online
    if (forceDuplicates && duplicates && Object.keys(duplicates).length > 0) {
      Object.values(duplicates).forEach(function(tune) {
        tune.id = null
        var newTune = createTune(tune)
        tunes[tune.id] = newTune
      })
      //updateSheet(0)
    } 
    //console.log('done dups')
    if ((discardLocalUpdates && localUpdates && Object.keys(localUpdates).length > 0) || (forceDuplicates &&  duplicates && Object.keys(duplicates).length > 0)|| (updates && Object.keys(updates).length > 0)|| (inserts && Object.keys(inserts).length > 0)) {
        //console.log('FINALLY SET ',tunes)
      setTunes(tunes)
      buildTunesHash()
      indexes.resetBookIndex()
      indexes.resetTagIndex()
      indexes.indexTunes(tunes)
      setImportResults(null)
      saveTunesOnline()
      //updateSheet(5000)
    }
  }
  
  function applyImport(forceDuplicates=false, discardLocalUpdates = false) {
      return applyImportData(importResults, forceDuplicates=false, discardLocalUpdates = false)
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
    
    
     
    function hasNotes(tune) {
        var hasNotes = false
        if (tune.voices) {
            Object.values(tune.voices).forEach(function(voice) {
                if (Array.isArray(voice.notes)) {
                    for (var i=0 ; i < voice.notes.length; i++) {
                        //console.log("HASNOTES",removeQuotedSections(voice.notes[i]).replace("z",""),voice.notes[i])
                        if (utils.removeQuotedSections(voice.notes[i]).replaceAll("z","").replaceAll("|","").trim()) {
                            hasNotes = true
                            break;
                        }
                    }
                }
            })
        }
        
        return hasNotes
    }
  
  
  function showImportWarning() {
      return false
    //if (sheetUpdateResults) return true
    //return false 
    //console.log('showWarning')
    if (importResults !== null) {
        if (localStorage.getItem('bookstorage_mergewarnings') === "true")  {
          if (importResults.deletes && Object.keys(importResults.deletes).length > 0) {
            return true
          }
          if (importResults.updates && Object.keys(importResults.updates).length > 0) {
            return true
          }
          if (importResults.inserts && Object.keys(importResults.inserts).length > 0) {
            return true
          }
        }
        if (importResults.localUpdates && Object.keys(importResults.localUpdates).length > 0) {
          return true
        } 
    }
    return false
  }
  
  /** 
   * import songs to a tunebook from an abc file 
   * set results {updates, inserts, duplicates} into app scoped importResults
   */
  function importAbc(abc, forceBook = null, limitToTuneId=null, limitToBookName=null, limitToTagName=null) {
      //console.log('importabc', forceBook, limitToTuneId, limitToBookName, limitToTagName)
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
          if ((!limitToTuneId || tune.id === limitToTuneId) && (!limitToBookName || tune.books.indexOf(limitToBookName) !== -1) && (!limitToTagName || (Array.isArray(tune.tags) && tune.tags.indexOf(limitToTagName) !== -1)))  {
            var hasNotes = false
            var hasChords = false
            tune.boost = 0 // reset boost on import
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
              //tune.boost = tunes[tune.id].boost
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
                var hash = abcTools.getTuneImportHash(tune)
                //utils.hash(tune.notes.join("\n"))
                //console.log("tryhash",hash,tunesHash, tunesHash.hashes[hash]   )
                if (tunesHash && tunesHash.importhashes && tunesHash.importhashes[hash] ) {
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
      return final
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
  
  
  
    function getTuneTagOptions() {
      var final = {}
      Object.keys(indexes.tagIndex).forEach(function(tuneTagKey) {
          final[tuneTagKey] = tuneTagKey
      })
      //console.log("GET TUNEBOOKOPTIONS",indexes,final)
      return final
  }
  
  function getSearchTuneTagOptions(filter) {
      var opts = getTuneTagOptions()
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
    indexes.resetTagIndex()
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
          //console.log('update books lose '+book)
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
    //pauseSheetUpdates.current = true
    //const final = {}
    //Object.values(tunes).forEach(function(tune) {
      //tune.boost = 0
      //final[tune.id] = tune
    //})
    
    //setTunes(final)
    //buildTunesHash(final)
    //saveTunesOnline() 
    ////forceRefresh()
    
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
  
  function fromSearch(filter, bookFilter, tagFilter) {
    //console.log('from book',book, tunes)
    var res = Object.values(tunes).filter(function(tune) {
        return filterSearch(tune, filter, bookFilter, tagFilter)
    })
    //console.log('to abc res',res)
    return res
  }
  
  function fromSelection(selection) {
    //console.log('from book',book, tunes)
    var res = Object.values(tunes).filter(function(tune) {
        if (selection[tune.id]) {
          return true
        } else {
          return false
        }
    })
    //console.log('to abc res',res)
    return res
  }
  
  // create an index of list items collated by groupBy
    function groupTunes(items, groupBy) {
        console.log('gropu tunes',groupBy)
        var collated = {}
        if (groupBy) {
            items.forEach(function(item,itemKey) {
                var key = ''
                if (Array.isArray(item[groupBy])) {
                    //console.log('array',item[groupBy])
                    key = item[groupBy].sort().filter(function(a) {console.log(a); return (currentTuneBook && a != currentTuneBook)  }).join(", ")
                } else {
                    //console.log('no array',item[groupBy])
                    key = item[groupBy]
                    if (key > 0) {
                        key = parseInt(key)
                    } else if (key && key.trim && key.trim) {
                        key = key.trim()
                    } else {
                        key = ''
                    }
                }
                if (key) {
                    //console.log('key',key)
                    if (!collated.hasOwnProperty(key)) {
                        collated[key] = []
                        collated[key].push(itemKey)
                    } else {
                        collated[key].push(itemKey)
                    }
                } else {
                    //console.log('nokey')
                    if (!collated.hasOwnProperty('')) {
                        collated[''] = []
                    }
                    collated[''].push(itemKey)  
                }
            })
        }
        //console.log('gropu tunes coll',collated)
        
        return collated
    }
  
  
  function shuffle(array) {
      let currentIndex = array.length,  randomIndex;

      // While there remain elements to shuffle.
      while (currentIndex != 0) {

        // Pick a remaining element.
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;

        // And swap it with the current element.
        var tmp = array[randomIndex]
        array[randomIndex] = array[currentIndex]  
        array[currentIndex] = tmp
        //[array[currentIndex], array[randomIndex]] = [
          //array[randomIndex], array[currentIndex]];
      }

      return array;
    }
  function mediaFromBook(book, useTunes) {
    if (!useTunes) useTunes = tunes
    //console.log('from book',book, useTunes)
    var res = Object.values(useTunes).filter(function(tune) {
        if (book) {
          if (Array.isArray(tune.books) && tune.books.indexOf(book) !== -1) {
            if (tune.links && tune.links.length > 0) {
                var found = false
                tune.links.forEach(function(link) {
                  if (link.link && link.link.trim()) {
                      found = true
                  }
                })
                return found
            } else {
                return false
            }
          } else {
            return false
          }
        } else {
          if (tune.links && tune.links.length > 0) {
                var found = false
                tune.links.forEach(function(link) {
                  if (link.link && link.link.trim()) {
                      found = true
                  }
                })
                return found
            } else {
                return false
            }
        }
    })
    //console.log('to abc res',res)
    res = shuffle(res)
    return res
  }
  
  function filterSearch(tune, filter, bookFilter, tagFilter) {
       //console.log('filterSearch',props.currentTuneBook,props.filter, props.tagFilter)
        var filterOk = false
        var bookFilterOk = false
        var tagFilterOk = false
        // no filters means show tunes with NO book selected
        if (!bookFilter && (!filter) && (!tagFilter || tagFilter.length === 0)  ) {
            if (tune.books && tune.books.length > 0) {
                return false
            } else {
                return true
            }
        }  else {
            if (!filter || filter.trim().length === 0) {
                filterOk = true
            } else {
                if (tune && ((tune.name && tune.name.trim().length > 0  && utils.toSearchText(tune.name.trim()).indexOf(utils.toSearchText(filter.trim())) !== -1) || (tune.composer && tune.composer.trim().length > 0  && utils.toSearchText(tune.composer.trim()).indexOf(utils.toSearchText(filter.trim())) !== -1))) {
                    filterOk = true
                } 
            }
            if (!bookFilter || bookFilter.trim().length === 0) {
                bookFilterOk = true
            } else {
                if (tune && tune.books && tune.books.length > 0 && bookFilter.length > 0) {
                    tune.books.forEach(function(book) {
                        if (book && book.toLowerCase && bookFilter && bookFilter.toLowerCase &&  book.toLowerCase() === bookFilter.toLowerCase()) {
                            bookFilterOk = true
                        }
                    })
                } 
            }
            if (!Array.isArray(tagFilter) || tagFilter.length === 0) {
                 //console.log('skip tag filt')
                tagFilterOk = true
            } else {
                //console.log(' tag filt',tune.tags,tagFilter)
                if (tune && tune.tags && tune.tags.length > 0 && Array.isArray(tagFilter) && tagFilter.length > 0) {
                    tagFilterOk = true
                    tagFilter.forEach(function(tag) {
                        if (tune.tags.indexOf(tag.toLowerCase()) !== -1) {
                            //tagFilterOk = true
                        } else {
                            tagFilterOk = false
                        }
                    })
                } 
            }
            //console.log('FILTER',tune,props.filter, bookFilter,tune.name, tune.books,(filterOk && bookFilterOk))
            return (filterOk && bookFilterOk && tagFilterOk)
        }
    }
  
  function mediaFromSearch(filter, bookFilter, tagFilter, useTunes = null) {
    if (!useTunes) useTunes = tunes
    console.log('from sesarc','F',filter,'B' ,bookFilter,'T', tagFilter, useTunes)
    var res = Object.values(useTunes).filter(function(tune) {
        return filterSearch(tune, filter, bookFilter, tagFilter)
    })
    console.log('to abc res',res)
    res = shuffle(res)
    return res
  }
  
  function mediaFromSelection(selection) {
    console.log('m from sel',selection)
    var final = []
    if (selection && selection.split) {
        var res = selection.split(",").forEach(function(tuneId) {
            //console.log('m from sel',tuneId)
            if (tunes[tuneId]) {
                  var tune = tunes[tuneId]
                  //console.log('m from sel',tune)
                  if (tune.links && tune.links.length > 0) {
                        tune.links.forEach(function(link) {
                          if (link.link && link.link.trim()) {
                              final.push(tune)
                          }
                        })
                  }
            }
        })
    //res = shuffle(res)
    //console.log('m from sel res',final)
        
    }
    return final
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
  
  
  function fillMediaPlaylist(book, selectedIds = null) {
        console.log('fill media',book, selectedIds)
        var fillTunes = []
        if (selectedIds) {
            fillTunes=mediaFromSelection(selectedIds)
        } else if (book) {
            fillTunes=mediaFromBook(book)
        }
        //console.log('fill media tunes',fillTunes)
        shuffleArray(fillTunes)
        //console.log('shuffle media tunes',fillTunes)
        if (Array.isArray(fillTunes)) {
            fillTunes = fillTunes.sort(function(a,b) {
                return (a && b && a.boost && b.boost && a.boost > b.boost) ? 1 : -1
            })
            setMediaPlaylist({currentTune: 0, book:book, tunes:fillTunes.slice(0,20)})
        }
        setAbcPlaylist(null)
    }
    
    function fillMediaPlaylistFromTag(tag) {
        console.log('fill media by tag',tag)
        var fillTunes = mediaFromSearch('','',[tag])
        fillTunes = fillTunes.filter(function(tune) {
              var ret = false
              if (tune.links && tune.links.length > 0) {
                    tune.links.forEach(function(link) {
                      if (link.link && link.link.trim()) {
                          ret = true
                      }
                    })
              }
              return ret
        })
        console.log('fill media tunes',fillTunes)
        shuffleArray(fillTunes)
        //console.log('shuffle media tunes',fillTunes)
        if (Array.isArray(fillTunes)) {
            fillTunes = fillTunes.sort(function(a,b) {
                return (a && b && a.boost && b.boost && a.boost > b.boost) ? 1 : -1
            })
            setMediaPlaylist({currentTune: 0, book:'', tunes:fillTunes.slice(0,20)})
        }
        setAbcPlaylist(null)
    }
    
    
    
    function shuffleArray(array) {
        for (var i = array.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var temp = array[i];
            array[i] = array[j];
            array[j] = temp;
        }
    }

    function fillAbcPlaylist(book, selected, navigate) {
        var fillTunes = []
        var useBook = book
        var sel = []
        var selectedMess = selected && selected.split ? selected.split(",") : []
        selectedMess.forEach(function(val) {
          if (val && val.trim().length > 0 ) sel.push(val)
        })
            
        if (sel.length > 0) {
            sel.forEach(function(tuneKey) {
                if (tunes[tuneKey]) fillTunes.push(tunes[tuneKey])
            })
            shuffleArray(fillTunes)
            useBook = 'Selection'
        } else {
            fillTunes=fromBook(book)
            shuffleArray(fillTunes)
        }
        fillTunes = fillTunes.sort(function(a,b) {
            return (a && b && a.boost && b.boost && a.boost > b.boost) ? 1 : -1
        })
        fillTunes = fillTunes.filter(function(tune) {
            var hasNotes = false
            if (tune.voices) {
                Object.values(tune.voices).forEach(function(voice) {
                    if (Array.isArray(voice.notes)) {
                        for (var i=0 ; i < voice.notes.length; i++) {
                            if (voice.notes[i]) {
                               if (voice.notes[i].replaceAll('z','').replaceAll('|','').split('"').filter(function(a,ak) { 
                                   return (ak %2 ==0)
                                }).join('').trim().length > 0  ) {
                                    hasNotes = true
                                }
                            }
                        }
                    }
                })
            }  
            return hasNotes
        }).slice(0,30)
        
        
        
        
        console.log('fill abxz',useBook, fillTunes)
        setAbcPlaylist({currentTune: 0, book:useBook, tunes:fillTunes})
        setMediaPlaylist(null)
        if (fillTunes.length > 0 && fillTunes[0].id) {
            if (navigate) navigate("/tunes/"+fillTunes[0].id+"/playMidi") 
        }
    }
    

  return {deleteTunes,  removeTunesFromBook, addTunesToBook, addTunesToTag, removeTunesFromTag, clearBoost,applyImport, importAbc, toAbc, fromBook, fromSearch,fromSelection, mediaFromBook, mediaFromSearch, mediaFromSelection, deleteTuneBook, copyTuneBookAbc, downloadTuneBookAbc, resetTuneBook, saveTune, utils, abcTools, icons,  curatedTuneBooks, getTuneBookOptions, getSearchTuneBookOptions, deleteAll, deleteTune, buildTunesHash, updateTunesHash , setTunes, setCurrentTune, setCurrentTuneBook, setTunesHash, forceRefresh, indexes, textSearchIndex, recordingsManager: recordingsManager, navigateToPreviousSong,navigateToNextSong, hasLyrics, hasNotes, showImportWarning, applyImportData, applyMergeData, createTune, fillAbcPlaylist, fillMediaPlaylist,fillMediaPlaylistFromTag, bulkChangeTunes , getTuneTagOptions, getSearchTuneTagOptions,filterSearch ,groupTunes  };
}
export default useTuneBook
