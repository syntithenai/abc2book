/**
 *  Load a local storage key and parse it as JSON 
 *  @return {}
 */
function loadLocalObject(localStorageKey) {
  var dataText = localStorage.getItem(localStorageKey)
  var data = {}
  try {
    data = JSON.parse(dataText)
  } catch (e) {
    
  }
  if (!data) {
    data = {}
  }
  return data
}

/**
 * JSONify and save data to local storage
 */
function saveLocalObject(localStorageKey, data) {
  localStorage.setItem(localStorageKey,JSON.stringify(data))
}


/**
 * Update which setting a tune uses and rerender
 */
function updateTuneSetting(songNumber, setting) {
  //var songlistParts = $('#songlist').val().split("\n")
  //if (songlistParts.length > songNumber) {
    //var line = songlistParts[songNumber]
    var tuneCache = loadLocalObject('abc2book_tunes')
    var tune = tuneCache[songNumber]
    
    if (tune) {
      
      //var songId = tune.id
      //var boost = tune.boost
      //boost = boost > 0 ? boost : 0
      //var songSearchString = tune.forceTitle
      //songlistParts[songNumber] = "[ID:" + tune.id + "][S:"+setting + "][B:"+boost+"]"+songSearchString;
      //$('#songlist').val(songlistParts.join("\n"))
      //saveSongList()
      tune.useSetting = setting
      tuneCache[songNumber] = tune
      saveLocalObject('abc2book_tunes',tuneCache)
      console.log('saved satting',setting,tuneCache[songNumber])
      generateAndRenderSingle(songNumber, tune)
      generateIndexesFromTunes()
      renderIndexes()
    }
  //}
}
/**
 * Update the search text for a tune, renew web lookups and rerender
 */
function updateTuneId(songNumber, tuneId) {
  var oldTune = getTuneFromCache(songNumber)
  if (oldTune) {
    $('#waiting').show()
    $.get('https://thesession.org/tunes/'+tuneId+'?format=json&perpage=50').then(function(tune) {
        // find default setting (with chords), save to tunes db , 
        handleFoundTune(tune, [tune], oldTune.forceTitle, null, songNumber, function(setting) {
          if (setting !== undefined) {
            tune.useSetting = setting > 0 ? setting : 0
            //tune.forceTitle = oldTune.forceTitle
            tune.boost = 0
            // update tune cache
            var tunes = loadLocalObject('abc2book_tunes')
            tunes[songNumber] = tune
            saveLocalObject('abc2book_tunes',tunes)
            generateAndRenderSingle(songNumber, tune)
            generateIndexesFromTunes()
            renderIndexes()
            $('#wrong_tune_selector_'+songNumber).hide()
            $('#controls_'+songNumber+' .stopplayingbutton').hide()
            scrollTo('controls_'+songNumber)
          }
          $('#waiting').hide()
        })
    }).catch(function(e) {
      console.log(["ERR",e])
      $('#waiting').hide()
    })
  }
}

function updateTuneIdLink(songNumber, tuneId) {
  var oldTune = getTuneFromCache(songNumber)
  if (oldTune) {
    $('#waiting').show()
    $.get('https://thesession.org/tunes/'+tuneId+'?format=json&perpage=50').then(function(tune) {
        // find default setting (with chords), save to tunes db , 
        handleFoundTune(tune, [tune], oldTune.forceTitle, null, songNumber, function(setting) {
          if (setting !== undefined) {
            oldTune.id = tune.id
            // update tune cache
            var tunes = loadLocalObject('abc2book_tunes')
            tunes[songNumber] = oldTune
            saveLocalObject('abc2book_tunes',tunes)
            $('#wrong_tune_selector_'+songNumber).hide()
            scrollTo('controls_'+songNumber)
          }
          $('#waiting').hide()
        })
    }).catch(function(e) {
      console.log(["ERR",e])
      $('#waiting').hide()
    })
  }
}

function updateTuneAbc(songNumber, tuneIds) {
  var oldTune = getTuneFromCache(songNumber)
  //console.log('updateTussneAbc',songNumber, tuneIds, oldTune)
  $('#waiting').show()
  var promises = []
  if (Array.isArray(tuneIds)) {
    tuneIds.forEach(function(tuneId) {
      var p = '/abc2book/scrape/folktunefinder/abc_tune_folktunefinder_'+tuneId+'.txt'
      promises.push($.get(p))
      var tune = null
      Promise.all(promises).then(function(abcTexts) {
        var tunes = loadLocalObject('abc2book_tunes')
        abcTexts.forEach(function(abcText) {
          if (tune === null)  {
            tune = singleAbc2json(abcText) 
            tune.meta = cleanMetaData(tune.meta)
            tune.id = oldTune.id
          // collate settings
          } else {
            var settingTune = singleAbc2json(abcText) 
            tune.settings.push(settingTune.settings[0])
          }
          if (tune && tune.format)  {
            tunes[songNumber] = tune
          }
        })
        saveLocalObject('abc2book_tunes',tunes)
        generateAndRenderSingle(songNumber, tune)
        generateIndexesFromTunes()
        renderIndexes()
        
        $('#waiting').hide()
        $('#wrong_tune_selector_'+songNumber).hide()
        $('#controls_'+songNumber+' .stopplayingbutton').hide()
        preventClickThrough()
        scrollTo('controls_'+songNumber)
      }).catch(function(e) {
        $('#waiting').hide()
        console.log('ERR',e)
      })
    })
  }
}


//function updateTuneAbcGrab(songNumber, tuneId) {
  //var oldTune = getTuneFromCache(songNumber)
  ////console.log('updateTussneAbc',songNumber, tuneIds, oldTune)
  //$('#waiting').show()
  //var promises = []
  //if (Array.isArray(tuneIds)) {
    //tuneIds.forEach(function(tuneId) {
      //var p = '/abc2book/scrape/folktunefinder/abc_tune_folktunefinder_'+tuneId+'.txt'
      //promises.push($.get(p))
      //var tune = null
      //Promise.all(promises).then(function(abcTexts) {
        //var tunes = loadLocalObject('abc2book_tunes')
        //abcTexts.forEach(function(abcText) {
          //var key = ensureText(getMetaValueFromAbc("K",abcText).trim())
          ////var tune = abc2Tune(abcText)
          ////if (tune && tune.format)  {
          //oldTune.id = null
          //oldTune.setting_id = null
          //oldTune.boost = null
          //oldTune.useSetting = 0
          //oldTune.settings = [
            //{
                //"key": key,
                //"abc": getNotesFromAbc(abcText),
                //"member": {
                //},
                
            //}
          //]
        
          //if (oldTune && oldTune.format)  {
            //tunes[songNumber] = oldTune
          //}
        //})
        //saveLocalObject('abc2book_tunes',tunes)
        //generateAndRenderSingle(songNumber, tune)
        //generateIndexesFromTunes()
        //renderIndexes()
        
        //$('#waiting').hide()
        //$('#wrong_tune_selector_'+songNumber).hide()
        //$('#controls_'+songNumber+' .stopplayingbutton').hide()
        //preventClickThrough()
        //scrollTo('controls_'+songNumber)
      //}).catch(function(e) {
        //$('#waiting').hide()
        //console.log('ERR',e)
      //})
    //})
  //}
//}

//function updateTuneAbcGrab(songNumber, tuneId) {
  //var oldTune = getTuneFromCache(songNumber)
  ////console.log('updateTussneAbc',songNumber, tuneId, oldTune)
  ////if (oldTune && oldTune.format) {  
    //console.log('PATHsss')
    //$('#waiting').show()
    //var p = '/abc2book/scrape/folktunefinder/abc_tune_folktunefinder_'+tuneId+'.txt'
    //console.log('PATH',p)
    //$.get(p).then(function(abcText) {
        //console.log("RES",abcText)
        //var key = ensureText(getMetaValueFromAbc("K",abcText).trim())
        ////var tune = abc2Tune(abcText)
        ////if (tune && tune.format)  {
        //oldTune.useSetting = 0
        //oldTune.settings = [
          //{
              //"key": key,
              //"abc": getNotesFromAbc(abcText),
              //"member": {
              //},
              
          //}
        //]
        ////tune.setting_id = oldTune.setting_id
        ////tune.forceTitle = oldTune.forceTitle
        ////tune.boost = oldTune.boost

        //var tunes = loadLocalObject('abc2book_tunes')
        //tunes[songNumber] = oldTune
        //saveLocalObject('abc2book_tunes',tunes)
        //generateAndRenderSingle(songNumber, tune)
        //generateIndexesFromTunes()
        //renderIndexes()
        
        //$('#waiting').hide()
        //$('#wrong_tune_selector_'+songNumber).hide()
        //$('#controls_'+songNumber+' .stopplayingbutton').hide()
        //scrollTo('controls_'+songNumber)
        
    //}).catch(function(e) {
      //$('#waiting').hide()
      //console.log('ERR',e)
    //})
  ////} else {
    ////console.log('MISSING OLD TUNE')
  ////}
//}


/**
 * Update the search text for a tune, renew web lookups and rerender
 */
function updateTuneSearchText(songNumber, newSearchText) {
  saveSearchText(songNumber,newSearchText)
  //$('#waiting').show()
  $('#wrong_tune_input_'+songNumber+' .tune_selector_option').val(newSearchText)
  if ($('#wrong_tune_input_'+songNumber).val().trim()==='') {
    $('#wrong_tune_selector_'+songNumber+ ' .wrong_tune_selector_items').html('')
  } else {   
    var tune = getTuneFromCache(songNumber)
    if (tune) {
      var songSetting = tune.useSetting > 0 ? tune.useSetting : 0
      $('#waiting').show()
      $.get('https://thesession.org/tunes/search?format=json&perpage=50&q='+newSearchText).then(function(searchRes) {
        // cache search results
        //console.log(searchRes)
        var searchCache = loadLocalObject('abc2book_search')
        searchCache[safeString(newSearchText)] = searchRes.tunes
        saveLocalObject('abc2book_search',searchCache)
        $('#wrong_tune_selector_'+songNumber+ ' .wrong_tune_selector_items').html('')
        if (searchRes && searchRes.tunes && searchRes.tunes.length > 0 && searchRes.tunes[0].id) {
          searchRes.tunes.map(function(tune) {
              var loadButton = $('<a style="margin-right: 0.5em" ><span>'+tune.name+'</span></svg></a>')
              loadButton.click(function(e) {
                updateTuneId(songNumber, tune.id); 
                return false; 
              })
              var linkButton = $('<button style="margin-right: 0.5em"><svg role="image" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="button" ><title>Link to thesession.org</title><path fill="none" d="M0 0h24v24H0z"/><path d="M18.364 15.536L16.95 14.12l1.414-1.414a5 5 0 1 0-7.071-7.071L9.879 7.05 8.464 5.636 9.88 4.222a7 7 0 0 1 9.9 9.9l-1.415 1.414zm-2.828 2.828l-1.415 1.414a7 7 0 0 1-9.9-9.9l1.415-1.414L7.05 9.88l-1.414 1.414a5 5 0 1 0 7.071 7.071l1.414-1.414 1.415 1.414zm-.708-10.607l1.415 1.415-7.071 7.07-1.415-1.414 7.071-7.07z"/></svg></button>')
              linkButton.click(function(e) {
                updateTuneIdLink(songNumber, tune.id); 
                return false; 
              })
            var option = $('<li class="list-group-item tune_selector_option" ></li>')
            var buttonBlock=$('<div style="float: right"  ></div>')
            buttonBlock.append(linkButton)
            option.append(loadButton)
            option.append(buttonBlock)
            $('#wrong_tune_selector_'+songNumber+ ' .wrong_tune_selector_items').append(option)
          })
        }
        $('#waiting').hide()
      }).catch(function(e) {
        console.log(["ERR",e])
        $('#waiting').hide()
      })
      
    }
  }
}
/**
 * Update the search text for ABC
 */
function updateTuneSearchAbcText(songNumber, newSearchText) {
  saveAbcSearchText(songNumber,newSearchText)
  $('#wrong_abc_input_'+songNumber+' .abc_selector_option').val(newSearchText)
  if ($('#wrong_tune_input_'+songNumber).val().trim()==='') {
    $('#wrong_abc_selector_'+songNumber+ ' .wrong_abc_selector_items').html('')
  } else {   
    var tune = getTuneFromCache(songNumber)
    if (tune) {
      var songSetting = tune.useSetting > 0 ? tune.useSetting : 0
      $('#waiting').show()
      searchIndex(newSearchText, function(searchRes) {
        console.log('SEARCH RES', searchRes)
        
        if (searchRes) {
          $('#wrong_abc_selector_'+songNumber+ ' .wrong_abc_selector_items').html('')
          if (searchRes && searchRes.length > 0 && Array.isArray(searchRes[0].ids)) {
            searchRes.map(function(tune) {
              var loadButton = $('<a style="margin-right: 0.5em" ><span>'+tune.name+'</span></a>')
              loadButton.click(function(e) {
                updateTuneAbc(songNumber, tune.ids); 
                return false; 
              })
              var grabButton = $('<button style="margin-right: 0.5em"><svg role="image" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="button" ><title>Load the music</title><path fill="none" d="M0 0h24v24H0z"/><path d="M12 13.535V3h8v2h-6v12a4 4 0 1 1-2-3.465zM10 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/></svg></button>')
              grabButton.click(function(e) {
                updateTuneAbcGrab(songNumber, tune.ids); 
                return false; 
              })
              
              var option = $('<li class="list-group-item tune_selector_option" ></li>')
              var buttonBlock=$('<div  ></div>')
              //buttonBlock.append(grabButton)
              buttonBlock.append(loadButton)
              //buttonBlock.append(grabButton)
              option.append(buttonBlock)
              $('#wrong_abc_selector_'+songNumber+ ' .wrong_abc_selector_items').append(option)
            })
          }
        }
        $('#waiting').hide()
        
      })
    }
  }
}


function loadIndex(callback) {
  var index = loadLocalObject('abc2book_textsearch')
  console.log('load index',index)
  if (index.tokens && Object.keys(index.tokens).length > 0) {
    callback(index)
  } else {
    // load the index from online
    console.log('load index web')
      $.getJSON('/abc2book/textsearch_index.json',function(index) {
             if (callback) callback(index)
      }).catch(function(e) {
        console.log(["ERR",e])
      })
      
  }
}


function searchIndex(text, callback) {
  $('#waiting').show()
  //console.log('sesarch index',text)
  loadIndex(function(index) {
    //console.log('sesarch index loaded',index)
    var matches = {}
    var cleanText = stripText(text)
    var parts = cleanText.split(" ")
    //console.log('sesarch tokens',parts)
    parts.forEach(function(part) {
      //console.log('sesarch tokens P',part, index.tokens)
      if (index.tokens.hasOwnProperty(part) && Array.isArray(index.tokens[part])) {
        index.tokens[part].forEach(function(matchItem) {
          //console.log('handlepart',part,matchItem,matches,matches[matchItem])
          if (matches[matchItem] > 0) {
            matches[matchItem] = matches[matchItem] + 1
          } else {
            matches[matchItem] = 1
          }
        })
      }
    })
    var fullMatches = Object.keys(matches).map(function(match) {
      return {id: match, score: matches[match], name: index.lookups[match]}
    }).sort(function(a,b) {
      if (a.score < b.score) {
        return 1
      } else {
        return -1
      }
    })
    var seen = {}
    var final = []
    fullMatches.forEach(function(a) {
      var lowerName = a.name.toLowerCase()
      if (!seen[lowerName]) seen[lowerName] = {ids:[]}
      seen[lowerName].ids.push(a.id)
    })
    Object.keys(seen).forEach(function(seenName) {
      final.push({ids: seen[seenName].ids, name: seenName})
    })
    //final.push()
        
    //console.log('full matches', matches, final)
    $('#waiting').hide()
    callback(final)
  })
}


// use setTimeout to pause execution for 2 secs after last change to text
// search thesession.org with new text
var updateSearchResultsTimout = null

function delayedUpdateSearchResults(songNumber,delay=500) {
  
  $('#waiting').show()
   clearTimeout(updateSearchResultsTimout)
   updateSearchResultsTimout = setTimeout(function() {
     
     updateTuneSearchText(songNumber, $('#wrong_tune_input_'+songNumber).val())
     $('#waiting').hide()
   },delay)
   return false
}

// use setTimeout to pause execution for 2 secs after last change to text
// search thesession.org with new text
var updateSearchResultsAbcTimout = null

function delayedUpdateSearchAbcResults(songNumber,delay=500) {
  //console.log('delkaya bc serc',songNumber)
  $('#waiting').show()
   clearTimeout(updateSearchResultsAbcTimout)
   updateSearchResultsAbcTimout = setTimeout(function() {
     
     updateTuneSearchAbcText(songNumber, $('#wrong_abc_input_'+songNumber).val())
     $('#waiting').hide()
   },delay)
   return false
}

function addNewTuneToStartOfList(searchText) {
   // tunes data
   var tunes = loadLocalObject('abc2book_tunes')
   var clean = {}
   Object.keys(tunes).map(function(key, tuneIndex) {
     var tune = tunes[key] 
     tune.fo
     clean[parseInt(key)+1] = tune
   })
   var name = getTextFromSongline(searchText)
   clean[0] = {forceTitle: name, name: name, settings: []} 
   saveLocalObject('abc2book_tunes', clean)
   resetSearchTexts()
   generateAndRender()
}

function removeTune(songNumber) {
   // from songlist
   //var songlist = $('#songlist').val().split("\n")
   //songlist.splice(songNumber,1)
   //$('#songlist').val(songlist.join("\n"))
   //saveSongList()
   // from html
   $('#music_'+songNumber).remove()
   $('#cheatsheet_music_'+songNumber).remove()
   $('#controls_'+songNumber).remove()
   // from controls_
   // tunes data
   var tunes = loadLocalObject('abc2book_tunes')
   var clean = {}
   Object.keys(tunes).map(function(key, tuneIndex) {
     if (tuneIndex !== songNumber) clean[key] = tunes[key] 
   })
   saveLocalObject('abc2book_tunes', clean)
   // indexes
   generateIndexesFromTunes()
   //console.log('TIMER gen index', (new Date().getTime() - start))
   renderIndexes()
    
   //generateAndRender()
}


function getSearchResult(searchText) {
  var searches = loadLocalObject('abc2book_tunes')
   
}

//function getSearchCache(songNumber) {
  //var tuneCache = loadLocalObject('abc2book_tunes')
  //if (tuneCache && tuneCache[songNumber]) {
    //var tune = tuneCache[songNumber];
    //if (tune && tune.forceTitle) {
      //var searchCache = loadLocalObject('abc2book_search')
      //var key = safeString(tune.forceTitle)
      //if (searchCache) return searchCache[key]
    //}
  //}
  //return []
          
//}

function getSettings(songNumber) {
  var tuneCache = loadLocalObject('abc2book_tunes')
  if (tuneCache && tuneCache[songNumber]) return tuneCache[songNumber].settings;
  return []
  
}

function getTuneFromCache(songNumber) {
  var tuneCache = loadLocalObject('abc2book_tunes')
  if (tuneCache && tuneCache[songNumber]) return tuneCache[songNumber];
  return {}
  
}

function loadErrors() {
  return loadLocalObject('abc2book_errors')
}

function saveError(songNumber, message) {
  $('#errors').css('display','block')
  $('#errors').append('<div style="color: red; ">' + message+'</div>')
  var errors = loadErrors()
  errors[songNumber] = message
  localStorage.setItem('abc2book_errors',JSON.stringify(errors))
  //$('#tune_'+tuneId).remove()
}

function loadSongList() {
  $('#songlist').val(localStorage.getItem('abc2book_songlist'))
}

function saveSongList() {
  localStorage.setItem('abc2book_songlist',$('#songlist').val())
}

function selectSongList(listName) {
  if (confirm('Do you really want to discard your current song list and load a new one?')) {
    $('#songlist').val(getSongLists()[listName].trim())
    localStorage.setItem('abc2book_songlist',$('#songlist').val())
    generateMusic()
  }
}


function submitNewTune() {
  const cb = navigator.clipboard;
  var songNumber = $('#editorsongnumber').val()
  var text = $('#editor').val()
  var abc = getNotesFromAbc(text)
  var  tune = getTuneFromCache(songNumber)
  if (tune) {
    cb.writeText(abc).then(function() {
       if (confirm('ABC text Copied! Next a window will open where you can paste the ABC text, edit the music and submit a new tune.')) {
         var a = window.open('https://thesession.org/tunes/add','submitwindow')
         a.focus()
         alert('When you have submitted your tune to thesession.org, use the search tool to select your new tune.')
         showContentSection('music')
         scrollTo('controls_'+songNumber)
       }
    }).catch(function(e) {
        console.log(e)
    }); 
  }
}

function submitSaveSetting() {
  const cb = navigator.clipboard;
  var songNumber = $('#editorsongnumber').val()
  var text = $('#editor').val()
  var abc = getNotesFromAbc(text)
  var  tune = getTuneFromCache(songNumber)
  var setting = tune.settings[tune.useSetting]
  //console.log(songNumber,text,abc,tune,setting)
  if (tune && setting.id) {
    cb.writeText(abc).then(function() {
       if (confirm('ABC text Copied! Next a window will open where you can paste the ABC text, edit the music and update this setting.')) {
         var a = window.open('https://thesession.org/tunes/'+tune.id+"/edit/"+setting.id,'submitwindow')
         a.focus()
         alert('When you have submitted your tune to thesession.org, click OK to reload your tune.')
         updateTuneId (songNumber,tune.id)
         showContentSection('music')
         scrollTo('controls_'+songNumber)
       }
    }).catch(function(e) {
        console.log(e)
    });
  }
}

function submitNewSetting() {
  const cb = navigator.clipboard;
  var songNumber = $('#editorsongnumber').val()
  var text = $('#editor').val()
  var abc = getNotesFromAbc(text)
  var  tune = getTuneFromCache(songNumber)
  if (tune) {
    cb.writeText(abc).then(function() {
       if (confirm('ABC text Copied! Next a window will open where you can paste the ABC text, edit the music and submit a new setting for this tune.')) {
         var a = window.open('https://thesession.org/tunes/'+tune.id+"/add",'submitwindow')
         a.focus()
         alert('When you have submitted your setting to thesession.org, click OK to reload your tune.')
         a.focus()
         //var songlist = $('#songlist').val().split("\n")
         //var id = tune.id
         //var boost = tune.boost > 0 ? tune.boost : 0
         //var text = tune.forceTitle ? tune.forceTitle : ''
         tune.setting = tune.settings.length
         saveTuneAndSetting(tune,setting,songNumber,tune.forceTitle)
         //console.log('tune',tune, tune.settings.length)
         //newLine = ''
         //if (id) newLine += '[ID:'+id+']'
         //newLine += '[S:'+setting+']'
         //newLine += '[B:'+boost+']' + text
         //songlist[songNumber] = newLine
         //$('#songlist').val(songlist.join("\n"))
         updateTuneId (songNumber,tune.id)
         showContentSection('music')
         scrollTo('controls_'+songNumber)
       }
    }).catch(function(e) {
        console.log(e)
    })
  }
}

function saveLastPlayed(tuneId) {
  var lastPlayeds = loadLocalObject('abc2book_lastplayed')
  lastPlayeds[tuneId] = new Date().getTime()
  saveLocalObject('abc2book_lastplayed',lastPlayeds)
}

function loadLastPlayed(tuneId) {
  var lastPlayeds = loadLocalObject('abc2book_lastplayed')
  return lastPlayeds[tuneId]
}

function hasPlayedInLast24Hours(tuneId) {
  var lastPlayeds = loadLocalObject('abc2book_lastplayed')
  var now = new Date().getTime()
  if (lastPlayeds && lastPlayeds[tuneId] && now - lastPlayeds[tuneId] < 86400000) {
    return true
  } else {
    return false
  }
  
}

function filterMusicList(searchString) {
  $('#waiting').show()
  var tunes = loadLocalObject('abc2book_tunes')
  var showAll = searchString && searchString.trim().length > 0 ? false : true
  if (!searchString) searchString=''
  Object.keys(tunes).forEach(function(songNumber) {
    var tune = tunes[songNumber]
    console.log(showAll ? "SHOWALL" : "FILTER")
    if (showAll) {
      $('#controls_'+songNumber).show()
      $('#music_'+songNumber).show()
    } else {
      var l = searchString.trim().toLowerCase()
      var aliases = tune.aliases ? tune.aliases.join(",") : ''
      if ((getTuneName(tune).indexOf(l) !== -1) || (aliases.toLowerCase().indexOf(l) !== -1)) {
        console.log('show',songNumber)
        $('#controls_'+songNumber).show()
        $('#music_'+songNumber).show()
      } else {
        //console.log('hide',songNumber)
        $('#controls_'+songNumber).hide()
        $('#music_'+songNumber).hide()
      }
    }
  })
  $('#waiting').hide()
}


function loadSearchText(songNumber) {
  var texts = loadLocalObject('abc2book_searchtexts')
  var text = texts[songNumber]
  if (text && text != undefined && text.trim().length > 0) {
      return texts[songNumber]
  } else {
    var tune = getTuneFromCache(songNumber)
    return getTuneName(tune)
  }
}

function saveSearchText(songNumber,text) {
  var texts = loadLocalObject('abc2book_searchtexts')
  texts[songNumber] = text
  saveLocalObject('abc2book_searchtexts', texts)
}


function loadAbcSearchText(songNumber) {
  var texts = loadLocalObject('abc2book_abcsearchtexts')
  var text = texts[songNumber]
  if (text && text != undefined && text.trim().length > 0) {
      return texts[songNumber]
  } else {
    var tune = getTuneFromCache(songNumber)
    return getTuneName(tune)
  }
  
}
//saveLocalObject('abc2book_abcsearchtexts', {})
function saveAbcSearchText(songNumber,text) {
  var texts = loadLocalObject('abc2book_abcsearchtexts')
  texts[songNumber] = text
  saveLocalObject('abc2book_abcsearchtexts', texts)
}

function resetSearchTexts() {
 saveLocalObject('abc2book_searchtexts',{})
 saveLocalObject('abc2book_abcsearchtexts',{})
}
