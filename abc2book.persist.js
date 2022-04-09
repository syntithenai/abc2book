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
    var songSearchString = getTextFromSongline(line)
    var tuneCache = loadLocalObject('abc2book_tunes')
    var tune = tuneCache[songNumber]
    if (tune) {
      songlistParts[songNumber] = "[ID:" + tune.id + "][S:"+setting + "]"+songSearchString;
      $('#songlist').val(songlistParts.join("\n"))
      saveSongList()
      tune.useSetting = setting
      tuneCache[songNumber] = tune
      saveLocalObject('abc2book_tunes',tuneCache)
      generateAndRenderSingle(songNumber, tune)
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
    $('#waiting').show()
    $.get('https://thesession.org/tunes/'+tuneId+'?format=json&perpage=50').then(function(tune) {
        // find default setting (with chords), save to tunes db , 
        handleFoundTune(tune, [tune], songSearchString, null, songNumber, function(setting) {
          if (setting !== undefined) {
            tune.useSetting = setting > 0 ? setting : 0
            songlistParts[songNumber] = "[ID:" + tuneId + "][S:"+0 + "]"+songSearchString;
            $('#songlist').val(songlistParts.join("\n"))
            saveSongList()
            generateAndRenderSingle(songNumber, tune)
            $('#waiting').hide()
            $('#wrong_tune_selector_'+songNumber).hide()
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
    var line = songlistParts[songNumber]
    var songSetting = getMetaValueFromSongline("S",line)
    songSetting > 0 ? songSetting : 0
    $('#waiting').show()
    $.get('https://thesession.org/tunes/search?format=json&perpage=50&q='+newSearchText).then(function(searchRes) {
      // cache search results
      var searchCache = loadLocalObject('abc2book_search')
      searchCache[safeString(newSearchText)] = searchRes.tunes
      saveLocalObject('abc2book_search',searchCache)
      $('#wrong_tune_selector_'+songNumber+' .tune_selector_option').remove()
      
      if (searchRes && searchRes.tunes && searchRes.tunes.length > 0 && searchRes.tunes[0].id) {
        searchRes.tunes.map(function(tune) {
          $('#wrong_tune_selector_'+songNumber).append('<div><a  href="#" onClick="updateTuneId(' + songNumber + ', ' + tune.id + '); return false;" >'+tune.name+'</a></div>')
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



function removeTune(tuneNumber) {
   // tunes data
   var tunes = loadLocalObject('abc2book_tunes')
   tunes.splice(tuneNumber,1)
   saveLocalObject('abc2book_tunes', tunes)
   // indexes
   var tunes = loadLocalObject('abc2book_tunes')
   tunes.splice(tuneNumber,1)
   saveLocalObject('abc2book_tunes', tunes)
   generateAndRender()
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
