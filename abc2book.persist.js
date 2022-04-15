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
  //var songlistParts = $('#songlist').val().split("\n")
  //if (songlistParts.length > songNumber) {
    //var line = songlistParts[songNumber]
    //var songSetting = getMetaValueFromSongline("S",line)
    //songSetting > 0 ? songSetting : 0
    //var songSearchString = getTextFromSongline(line)
    //var boost = getMetaValueFromSongline("B",line)
    //boost = boost > 0 ? boost : 0
  var oldTune = getTuneFromCache(songNumber)
  if (oldTune) {
    $('#waiting').show()
    $.get('https://thesession.org/tunes/'+tuneId+'?format=json&perpage=50').then(function(tune) {
        // find default setting (with chords), save to tunes db , 
        handleFoundTune(tune, [tune], oldTune.forceTitle, null, songNumber, function(setting) {
          if (setting !== undefined) {
            tune.useSetting = setting > 0 ? setting : 0
            tune.forceTitle = oldTune.forceTitle
            tune.boost = oldTune.boost
            //songlistParts[songNumber] = "[ID:" + tuneId + "][S:"+0 + "][B:0]"+songSearchString;
            //$('#songlist').val(songlistParts.join("\n"))
            //saveSongList()
            // update tune cache
            var tunes = loadLocalObject('abc2book_tunes')
            tunes[songNumber] = tune
            saveLocalObject('abc2book_tunes',tunes)
            generateAndRenderSingle(songNumber, tune)
            generateIndexesFromTunes()
            renderIndexes()
            
            $('#waiting').hide()
            $('#wrong_tune_selector_'+songNumber).hide()
            scrollTo('controls_'+songNumber)
          }
        })
    })
  }
}


function updateTuneAbc(songNumber, tuneId) {
  var oldTune = getTuneFromCache(songNumber)
  //console.log('updateTussneAbc',songNumber, tuneId, oldTune)
  //if (oldTune && oldTune.format) {
    console.log('PATHsss')
    $('#waiting').show()
    var p = '/scrape/folktunefinder/abc_tune_folktunefinder_'+tuneId+'.txt'
    console.log('PATH',p)
    $.get(p).then(function(abcText) {
        console.log("RES",abcText)
        var tune = abc2Tune(abcText)
        if (tune && tune.format)  {
          tune.id = oldTune.id
          tune.setting_id = oldTune.setting_id
          tune.forceTitle = oldTune.forceTitle
          tune.boost = oldTune.boost

          var tunes = loadLocalObject('abc2book_tunes')
          tunes[songNumber] = tune
          saveLocalObject('abc2book_tunes',tunes)
          generateAndRenderSingle(songNumber, tune)
          generateIndexesFromTunes()
          renderIndexes()
          
          $('#waiting').hide()
          $('#wrong_tune_selector_'+songNumber).hide()
          scrollTo('controls_'+songNumber)
        }
    }).catch(function(e) {
      console.log('ERR',e)
    })
  //} else {
    //console.log('MISSING OLD TUNE')
  //}
}


/**
 * Update the search text for a tune, renew web lookups and rerender
 */
function updateTuneSearchText(songNumber, newSearchText) {
  $('#wrong_tune_input_'+songNumber+' .tune_selector_option').val(newSearchText)
  if ($('#wrong_tune_input_'+songNumber).val().trim()==='') {
    $('#wrong_tune_selector_'+songNumber+ ' .wrong_tune_selector_items').html('')
  } else {   
    //var songlistParts = $('#songlist').val().split("\n")
    //if (songlistParts.length > songNumber) {
      //songlistParts[songNumber] = newSearchText
      //$('#songlist').val(songlistParts.join("\n"))
      //saveSongList()
    var tune = getTuneFromCache(songNumber)
    if (tune) {
      var songSetting = tune.useSetting > 0 ? tune.useSetting : 0
      //songSetting > 0 ? songSetting : 0
      $('#waiting').show()
      $.get('https://thesession.org/tunes/search?format=json&perpage=50&q='+newSearchText).then(function(searchRes) {
        // cache search results
        console.log(searchRes)
        var searchCache = loadLocalObject('abc2book_search')
        searchCache[safeString(newSearchText)] = searchRes.tunes
        saveLocalObject('abc2book_search',searchCache)

        $('#wrong_tune_selector_'+songNumber+ ' .wrong_tune_selector_items').html('')
        
        if (searchRes && searchRes.tunes && searchRes.tunes.length > 0 && searchRes.tunes[0].id) {
          searchRes.tunes.map(function(tune) {
            $('#wrong_tune_selector_'+songNumber+ ' .wrong_tune_selector_items').append('<li class="list-group-item tune_selector_option" ><a  href="#" onClick="updateTuneId(' + songNumber + ', ' + tune.id + '); return false;" >'+tune.name+'</a></li>')
          })
        }
      })
    }
  }
}
/**
 * Update the search text for ABC
 */
function updateTuneSearchAbcText(songNumber, newSearchText) {
  //console.log('ABC srch',songNumber, newSearchText)
  $('#wrong_abc_input_'+songNumber+' .abc_selector_option').val(newSearchText)
  if ($('#wrong_tune_input_'+songNumber).val().trim()==='') {
    $('#wrong_abc_selector_'+songNumber+ ' .wrong_abc_selector_items').html('')
  } else {   
    //var songlistParts = $('#songlist').val().split("\n")
    //if (songlistParts.length > songNumber) {
      //songlistParts[songNumber] = newSearchText
      //$('#songlist').val(songlistParts.join("\n"))
      //saveSongList()
    var tune = getTuneFromCache(songNumber)
    if (tune) {
      var songSetting = tune.useSetting > 0 ? tune.useSetting : 0
      //songSetting > 0 ? songSetting : 0
      $('#waiting').show()
      
      searchIndex(newSearchText, function(searchRes) {
      //$.get('https://thesession.org/tunes/search?format=json&perpage=50&q='+newSearchText).then(function(searchRes) {
        // cache search results
        //searchRes = searchIndex(newSearchText)
        //console.log('SEARCH RES',searchRes)
        if (searchRes) {
          //var searchCache = loadLocalObject('abc2book_search')
          //searchCache[safeString(newSearchText)] = searchRes.tunes
          //saveLocalObject('abc2book_search',searchCache)

          $('#wrong_abc_selector_'+songNumber+ ' .wrong_abc_selector_items').html('')
          //console.log('render abc wront items',searchRes)
          if (searchRes && searchRes.length > 0 && searchRes[0].id) {
            searchRes.map(function(tune) {
              var button = $('<a>'+tune.name+'</a>')
              button.click(function(e) {
                //console.log('clickkjlakjlkj')
                updateTuneAbc(songNumber, tune.id); 
                return false; 
              })
              var li = $('<li class="list-group-item abc_selector_option" ></li>')
              li.append(button)
              $('#wrong_abc_selector_'+songNumber+ ' .wrong_abc_selector_items').append(li)
              //console.log('create abc up button')
            })
          }
        }
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
      $.getJSON('/textsearch_index.json',function(index) {
             if (callback) callback(index)
      })
      
  }
}


function searchIndex(text, callback) {
  $('#waiting').show()
  console.log('sesarch index',text)
  loadIndex(function(index) {
    console.log('sesarch index loaded',index)
    var matches = {}
    var cleanText = stripText(text)
    var parts = cleanText.split(" ")
    console.log('sesarch tokens',parts)
    parts.forEach(function(part) {
      console.log('sesarch tokens P',part, index.tokens)
      if (index.tokens.hasOwnProperty(part) && Array.isArray(index.tokens[part])) {
        index.tokens[part].forEach(function(matchItem) {
          console.log('handlepart',part,matchItem,matches,matches[matchItem])
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
    console.log('full matches', matches, fullMatches)
    $('#waiting').hide()
    callback(fullMatches.map(function(a) {return {id: a.id, name: a.name}}))
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
   // from songlist
   //var songlist = $('#songlist').val().split("\n")
   //songlist.unshift(searchText)
   //$('#songlist').val(songlist.join("\n"))
   //saveSongList()
   // from html
   //$('#music_'+songNumber).remove()
   //$('#cheatsheet_music_'+songNumber).remove()
   //$('#controls_'+songNumber).remove()
   //// from controls_
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
   //// indexes
   //generateIndexesFromTunes()
   //console.log('TIMER gen index', (new Date().getTime() - start))
   //renderIndexes()
    
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

function getSearchCache(songNumber) {
  var tuneCache = loadLocalObject('abc2book_tunes')
  if (tuneCache && tuneCache[songNumber]) {
    var tune = tuneCache[songNumber];
    if (tune && tune.forceTitle) {
      var searchCache = loadLocalObject('abc2book_search')
      var key = safeString(tune.forceTitle)
      if (searchCache) return searchCache[key]
    }
  }
  return []
          
}

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
  var abc = extractAbcMeta(text).cleanAbc
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
  var abc = extractAbcMeta(text).cleanAbc
  var  tune = getTuneFromCache(songNumber)
  var setting = tune.settings[tune.useSetting]
  //console.log(songNumber,text,abc,tune,setting)
  if (tune && setting.id) {
    cb.writeText(abc).then(function() {
       if (confirm('ABC text Copied! Next a window will open where you can paste the ABC text, edit the music and update this setting.')) {
         var a = window.open('https://thesession.org/tunes/'+tune.id+"/edit/"+setting.id,'submitwindow')
         alert('When you have submitted your tune to thesession.org, click OK to reload your tune.')
         a.focus()
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
  var abc = extractAbcMeta(text).cleanAbc
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
      if ((tune.name && tune.name.toLowerCase().indexOf(l) !== -1) || (tune.forceTitle && tune.forceTitle.toLowerCase().indexOf(l) !== -1)|| (aliases.toLowerCase().indexOf(l) !== -1)) {
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


