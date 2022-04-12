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
  var songlistParts = $('#songlist').val().split("\n")
  if (songlistParts.length > songNumber) {
    var line = songlistParts[songNumber]
    var songId = getMetaValueFromSongline("ID",line)
    var boost = getMetaValueFromSongline("B",line)
    boost = boost > 0 ? boost : 0
    var songSearchString = getTextFromSongline(line)
    var tuneCache = loadLocalObject('abc2book_tunes')
    var tune = tuneCache[songNumber]
    if (tune) {
      songlistParts[songNumber] = "[ID:" + tune.id + "][S:"+setting + "][B:"+boost+"]"+songSearchString;
      $('#songlist').val(songlistParts.join("\n"))
      saveSongList()
      tune.useSetting = setting
      tuneCache[songNumber] = tune
      saveLocalObject('abc2book_tunes',tuneCache)
      //console.log('saved',setting,tuneCache[songNumber])
      generateAndRenderSingle(songNumber, tune)
      generateIndexesFromTunes()
      renderIndexes()

    }
  }
}
/**
 * Update the search text for a tune, renew web lookups and rerender
 */
function updateTuneId(songNumber, tuneId) {
  var songlistParts = $('#songlist').val().split("\n")
  if (songlistParts.length > songNumber) {
    var line = songlistParts[songNumber]
    var songSetting = getMetaValueFromSongline("S",line)
    songSetting > 0 ? songSetting : 0
    var songSearchString = getTextFromSongline(line)
    var boost = getMetaValueFromSongline("B",line)
    boost = boost > 0 ? boost : 0
    $('#waiting').show()
    $.get('https://thesession.org/tunes/'+tuneId+'?format=json&perpage=50').then(function(tune) {
        // find default setting (with chords), save to tunes db , 
        handleFoundTune(tune, [tune], songSearchString, null, songNumber, function(setting) {
          if (setting !== undefined) {
            tune.useSetting = setting > 0 ? setting : 0
            tune.forceTitle = songSearchString
            songlistParts[songNumber] = "[ID:" + tuneId + "][S:"+0 + "][B:0]"+songSearchString;
            $('#songlist').val(songlistParts.join("\n"))
            saveSongList()
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
/**
 * Update the search text for a tune, renew web lookups and rerender
 */
function updateTuneSearchText(songNumber, newSearchText) {
  $('#wrong_tune_input_'+songNumber+' .tune_selector_option').val(newSearchText)
      
  var songlistParts = $('#songlist').val().split("\n")
  if (songlistParts.length > songNumber) {
    songlistParts[songNumber] = newSearchText
    $('#songlist').val(songlistParts.join("\n"))
    saveSongList()
    //var songSetting = getMetaValueFromSongline("S",line)
    //songSetting > 0 ? songSetting : 0
    $('#waiting').show()
    $.get('https://thesession.org/tunes/search?format=json&perpage=50&q='+newSearchText).then(function(searchRes) {
      // cache search results
      var searchCache = loadLocalObject('abc2book_search')
      searchCache[safeString(newSearchText)] = searchRes.tunes
      saveLocalObject('abc2book_search',searchCache)
      $('#wrong_tune_selector_'+songNumber+' .tune_selector_option').hide()
      
      if (searchRes && searchRes.tunes && searchRes.tunes.length > 0 && searchRes.tunes[0].id) {
        searchRes.tunes.map(function(tune) {
          $('#wrong_tune_selector_'+songNumber).append('<div class="tune_selector_option" ><a  href="#" onClick="updateTuneId(' + songNumber + ', ' + tune.id + '); return false;" >'+tune.name+'</a></div>')
        })
      }
    })
  }
}


// use setTimeout to pause execution for 2 secs after last change to text
// search thesession.org with new text
var updateSearchResultsTimout = null
function delayedUpdateSearchResults(songNumber) {
  $('#waiting').show()
   clearTimeout(updateSearchResultsTimout)
   updateSearchResultsTimout = setTimeout(function() {
     updateTuneSearchText(songNumber, $('#wrong_tune_input_'+songNumber).val())
     $('#waiting').hide()
   },2)
}



function addNewTuneToStartOfList(searchText) {
   // from songlist
   var songlist = $('#songlist').val().split("\n")
   songlist.unshift(searchText)
   $('#songlist').val(songlist.join("\n"))
   saveSongList()
   // from html
   //$('#music_'+songNumber).remove()
   //$('#cheatsheet_music_'+songNumber).remove()
   //$('#controls_'+songNumber).remove()
   //// from controls_
   // tunes data
   //var tunes = loadLocalObject('abc2book_tunes')
   //var clean = {}
   //Object.keys(tunes).map(function(key, tuneIndex) {
     //if (tuneIndex !== songNumber) clean[key] = tunes[key] 
   //})
   //saveLocalObject('abc2book_tunes', clean)
   //// indexes
   //generateIndexesFromTunes()
   //console.log('TIMER gen index', (new Date().getTime() - start))
   //renderIndexes()
    
   generateMusic()
}

function removeTune(songNumber) {
   // from songlist
   var songlist = $('#songlist').val().split("\n")
   songlist.splice(songNumber,1)
   $('#songlist').val(songlist.join("\n"))
   saveSongList()
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
         var songlist = $('#songlist').val().split("\n")
         var id = getMetaValueFromSongline("ID",songlist[songNumber])
         var boost = getMetaValueFromSongline("B",songlist[songNumber])
         var text = getTextFromSongline(songlist[songNumber])
         boost = boost > 0 ? boost : 0
         var setting = tune.settings.length
         console.log('tune',tune, tune.settings.length)
         newLine = ''
         if (id) newLine += '[ID:'+id+']'
         newLine += '[S:'+setting+']'
         newLine += '[B:'+boost+']' + text
         songlist[songNumber] = newLine
         $('#songlist').val(songlist.join("\n"))
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
