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
    console.log('UPDATE SET',line,songNumber,setting)
    
    var songId = getMetaValueFromSongline("ID",line)
    var songSetting = getMetaValueFromSongline("S",line)
    var last = line.lastIndexOf("]")
    console.log('UPDATE',line,songId,songSetting,last)
    var tuneCache = loadLocalObject('abc2book_tunes')
    var tune = tuneCache[songNumber + 1]
    if (tune) {
      console.log('UPDATE havetune')
      tune.useSetting = setting
      tuneCache[songNumber] = tune
      saveLocalObject('abc2book_tunes',tuneCache)
      //handleTunesListItem(searchText, songNumber, [])
      generateAndRender()
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
    var songId = getMetaValueFromSongline("ID",line)
    var songSetting = getMetaValueFromSongline("S",line)
    var last = line.lastIndexOf("]")
    //var searchText = 
    console.log('UPDATE',line,songId,songSetting,last, searchText)
    //handleTunesListItem(searchText, songNumber, [])
    //generateAndRender()
  }
}
/**
 * Update the search text for a tune, renew web lookups and rerender
 */
function updateTuneSearchText(songNumber, newSearchText) {
  var songlistParts = $('#songlist').val().split("\n")
  if (songlistParts.length > songNumber) {
    var line = songlistParts[songNumber]
    var songId = getMetaValueFromSongline("ID",line)
    var songSetting = getMetaValueFromSongline("S",line)
    var last = line.lastIndexOf("]")
    //var searchText = 
    console.log('UPDATE',line,songId,songSetting,last, searchText)
    //handleTunesListItem(searchText, songNumber, [])
    //generateAndRender()
  }
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
  //console.log('getsearch',songNumber)
  var tuneCache = loadLocalObject('abc2book_tunes')
  console.log('getsearch',songNumber, tuneCache)
  if (tuneCache && tuneCache[songNumber + 1]) {
    
    var tune = tuneCache[songNumber + 1];
    if (tune && tune.forceTitle) {
      //console.log('getsearch',tune.forceTitle, tune)
      var searchCache = loadLocalObject('abc2book_search')
      var key = safeString(tune.forceTitle)
      //console.log('getsearch',searchCache, tune.forceTitle, searchCache[key])
      if (searchCache) return searchCache[key]
    }
  }
  return []
          
}

function getSettings(songNumber) {
  var tuneCache = loadLocalObject('abc2book_tunes')
  //console.log('getset',songNumber, tuneCache,tuneCache[songNumber] )
  if (tuneCache && tuneCache[songNumber + 1]) return tuneCache[songNumber + 1].settings;
  return []
  
}

function getTuneFromCache(songNumber) {
  var tuneCache = loadLocalObject('abc2book_tunes')
  //console.log('getset',songNumber, tuneCache,tuneCache[songNumber] )
  if (tuneCache && tuneCache[songNumber]) return tuneCache[songNumber];
  return {}
  
}

function loadErrors() {
  return loadLocalObject('abc2book_errors')
}

function saveError(songNumber, message) {
  console.log(songNumber, message)
  $('#errors').css('display','block')
  $('#errors').append('<div style="color: red; ">' + message+'</div>')
  var errors = loadErrors()
  errors[songNumber - 1] = message
  localStorage.setItem('abc2book_errors',JSON.stringify(errors))
  //$('#tune_'+tuneId).remove()
}

function loadSongList() {
  $('#songlist').val(localStorage.getItem('abc2book_songlist'))
}

function saveSongList() {
  localStorage.setItem('abc2book_songlist',$('#songlist').val())
}
