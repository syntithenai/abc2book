
$.fn.sortChildren = function(sortCb){
    this.children().detach().sort(sortCb).appendTo(this);
};

function emptyABC(number, name) {
  return "\nX:"+number+"\n" + 'T:' + number +". "+name +  '' + "\n"
}


/**
 * Append metadata for song title,.. to abc string
 * for rendering complete tunes
 * @return multiline abc string starting with \nX:<tuneid>\n suitable for tune book 
 */
function tweakABC(abc, songNumber, name, key, type, aliases) {
  if (!abc) {
    return emptyABC(songNumber,name)
  }
  var aliasText = ''
  if (Array.isArray(aliases) && aliases.length > 0) {
    aliasText = 'C: AKA ' +aliases.slice(0,6).join(", ")+"\n"
  }
  return  "\nX: "+songNumber + "\n" + "K:"+key+ "\n"+ "M:"+timeSignatureFromTuneType(type)+ "\n" + aliasText + removeAbcInnerStrings(abc)  + " \n" + "T: " + songNumber + ". "  + name + " \nR: "+ key.slice(0,1) + ' ' + key.slice(1) +' - ' + type + "\n"
}


function tweakShortABC(abc, songTitle, keySig, tuneType, songNumber) {
  if (!abc) {
    return emptyABC(songNumber,songTitle)
  }
  if (abc) { 
      abc = abc.trim()
      // remove strings from abc
      var next = abc.indexOf('"')
      while (next !== -1) {
        nextClose = abc.indexOf('"', next+1)
        if ((nextClose !== -1) && (nextClose > next)) {
          abc = abc.slice(0,next) + abc.slice(nextClose+1)
        } else {
          abc = abc.slice(0,next) + abc.slice(next + 1)
        }
        next = abc.indexOf('"')
      }
      // strip start repeats
      abc = abc.replace("|:","|")
      // first three bars
      var shortAbcParts = []
      // tweak key signature
      keySig = keySig.replace("major","").replace("minor","min");
       
      shortAbcParts = abc.split("|").slice(0,4)
      var shortAbc = ''
      // handle placement of text(song title)
      if (shortAbcParts.length > 3) {
        // tune starts at first bar
        if (shortAbcParts[0].trim() === '') {
          var ts = timeSignatureFromTuneType(tuneType)
          if (ts !== '') {
            shortAbc = shortAbc + "[M:"+ts+ "] "
          } 
          shortAbc = shortAbc + "[K:"+keySig+ "] "
          // tune title 
          shortAbc = shortAbc  + '"'+songTitle+ '"' +  shortAbcParts.slice(1).join("|") 
        // lead in note
        } else {
          var ts = timeSignatureFromTuneType(tuneType)
          if (ts !== '') {
            shortAbc = shortAbc + "[M:"+ts+ "] "
          } 
          shortAbc = shortAbc + "[K:"+keySig+ "] "
          shortAbc = shortAbc  + '"'+songTitle+ '"' +  shortAbcParts.join("|") 
        }
      }
      shortAbc = "\nX: "+songNumber + "\n" + shortAbc + "\n"
      return shortAbc
      
    } 
}


      
function getMainRendererSettings() {
  return  {
    wrap: {
      minSpacing: 1.8,
      maxSpacing: 2.8,
      preferredMeasuresPerLine: 8,
    },
    responsive: "resize",
    add_classes: true,
    staffwidth: 900,
    //tablature: [
      //// first and only staff
      //{
          //instrument: 'guitar',
          //label: 'Guitar (%T)',
          //tuning: ['D,', 'A,', 'D', 'G', 'A', 'd'],
          //capo: 2
      //}
    //]
  }
}

function getCheatSheetRendererSettings() {
  return {
      staffwidth: 300,
      wrap: { minSpacing: 1.0, maxSpacing: 1.4, preferredMeasuresPerLine: 4 },
      scale: 0.5,
      paddingLeft: 1,
      paddingRight: 1,
      //showDebug: ['grid','box']
  }
}


/**
 * Refresh display from list. Reload all songs.
 */
function generateMusic() {
  resetIndexes()
  $("#stopbuttonvalue").val("")
  $('#downloadlongabc').css('display','none')
  $('#downloadshortabc').css('display','none')
  $("#shortabc").val("")
  $("#longabc").val("")
  $("#stopbutton").show()
  $("#generatebutton").hide()
  $('#cheatsheet_music').html('')
  $('#music').html('')
  $('#errors').html('')
  localStorage.setItem('abc2book_errors', null)
  localStorage.setItem('abc2book_tunes', null)
  
  
  var tunesList = []
  // strip empty list items
  $('#songlist').val().split("\n").map(function(v) {if (v && v.trim().length > 0) { tunesList.push(v.trim())} ; return})
  // ensure unique items
  let tunesListUnique = tunesList.filter((item, i, ar) => ar.indexOf(item) === i);
  // save clean list of song names 
  $('#songlist').val(tunesListUnique.join("\n"))
  iterateTunes(tunesListUnique, 1)
  
  
}


function generateAndRender() {
  generateAbcFromTunes()
  generateShortAbcFromTunes()
  renderCheetsheetFromShortAbc()
  renderMusicFromLongAbc()
  generateIndexesFromTunes()
  renderIndexes()
}

/**
 * Once all songs are rendered
 * - restore buttons
 * - sort the song index
 */
function finishLoadTunes() {
    $("#stopbutton").hide()
    $("#generatebutton").show()
    $('#downloadlongabc').css('display','block')
    $('#downloadshortabc').css('display','block')
    $('#printbutton').css('display','block')
    generateAndRender()
}



/** 
 * Render cheatsheet from complete abcshort
 */
function renderCheetsheetFromShortAbc() {
  
  var tuneBook = new window.ABCJS.TuneBook($('#shortabc').val())
  var targetArray = []
  
  var row = null;
  // collate into rows
  tuneBook.tunes.map(function(v,k) {
    if (k%3 === 0) {
       if (row === null) {
         row = $('<div class="row" ></div>')
       } else {
         $('#cheatsheet_music').append(row)
         row = $('<div class="row" ></div>')
       }
    }
    row.append('<div id="cheatsheet_music_'+k+'" ></div>')
    targetArray.push('cheatsheet_music_'+k)
  })
  $('#cheatsheet_music').append(row)
  
  var renderResult = window.ABCJS.renderAbc(targetArray, $('#shortabc').val() , getCheatSheetRendererSettings());
  
}

/** 
 * Render all tunes from complete abclong
 */
function renderMusicFromLongAbc() {
  var errors = loadErrors()  
  //console.log(errors)
  var tuneBook = new window.ABCJS.TuneBook($('#longabc').val())
  var targetArray = []
  var row = null;  
  tuneBook.tunes.map(function(v,k) {
    $('#music').append('<div id="music_'+k+'" ></div>')
    targetArray.push('music_'+k)
  })
  
  var renderResult = window.ABCJS.renderAbc(targetArray, $('#longabc').val() , getMainRendererSettings());
  renderResult.map(function(rr,rk) {
    //console.log(rr)
    if (errors.hasOwnProperty(rk)) {
      addErrorControls('#music_'+rk, errors[rk])
    } else { 
      addAudioControls('#music_'+rk, rr, rk)
    }
  })
  
  $('.abcjs-rhythm tspan').attr('y','20')
  $('#downloadlongabc').css('display','block')
  $('#downloadshortabc').css('display','block')
  $('#printbutton').css('display','block')
}

function generateAbcFromTunes() {
  var tunes = loadLocalObject('abc2book_tunes')
  var abc = ''
  Object.keys(tunes).map(function(tuneKey) {
    var tune = tunes[tuneKey]
    if (tune) {
      var setting = tune && tune.settings && tune.settings.length > tune.useSetting ? tune.settings[tune.useSetting] : {}
      if (setting) {
        abc +=  tweakABC(setting.abc, tuneKey, tune.name, setting.key, tune.type, tune.aliases) + "\n"
      } else {
        abc +=   emptyABC(tuneKey,tune.name)
      }
    } else {
      abc +=   emptyABC(tuneKey,'')
    }
  })
  $('#longabc').val( abc)
}

function generateShortAbcFromTunes() {
  var tunes = loadLocalObject('abc2book_tunes')
  var abc = ''
  Object.keys(tunes).map(function(tuneKey) {
    var tune = tunes[tuneKey]
    if (tune) {
      var setting = tune && tune.settings && tune.settings.length > tune.useSetting ? tune.settings[tune.useSetting] : {}
      if (setting) {
        abc +=  tweakShortABC(setting.abc, tune.name, setting.key, tune.type, tuneKey)
        
        //tweakABC(setting.abc, tuneKey, tune.forceTitle, setting.key, tune.type, tune.aliases) + "\n"
      } else {
        abc +=   emptyABC(tuneKey,tune.name)
      }
    } else {
      abc +=   emptyABC(tuneKey,'')
    }
  })
  $('#shortabc').val( abc)
}


/**
 * Save tune to storage and indexes
 * Ensure that tune renders by creating the DOM for the music rendering in the page
 */
function saveTuneAndSetting(tune,useSetting,songNumber,searchText, callback) {
  if (tune) {
    var tunes = loadLocalObject('abc2book_tunes')
    tune.forceTitle = searchText
    tune.useSetting = useSetting
    tunes[songNumber] = tune
    saveLocalObject('abc2book_tunes', tunes)
    var setting = tune && tune.settings && tune.settings.length > tune.useSetting ? tune.settings[tune.useSetting] : {}
    //addTuneToIndexes(songNumber, tune, setting, searchText)
  }
  console.log('saved tune and set',tune,useSetting,songNumber,searchText)
  callback()
}  

function handleTunesListItem(tunesListItem, songNumber, tunesList) {
    var searchResults = {}
    // current tune has non empty name ?
    if (tunesListItem.length > 0) {
      // hack to force search result/setting using [] with ID for session.org tuneid and S for setting number
      // if present, ID must be first
      // eg [ID:33][S:2]cooley's
      var forceTuneId = null
      var forceSetting = null
      var searchText = tunesListItem
      var trimlist = tunesListItem.trim();
      if (trimlist.indexOf('[ID:') !== -1) {
        var start = trimlist.indexOf('[ID:')
        var end = trimlist.indexOf(']', start)
        searchText = trimlist.slice(end + 1)
        forceTuneId = trimlist.slice(start + 4,end)
      }
      if (trimlist.indexOf('[S:') !== -1) {
        var start = trimlist.indexOf('[S:')
        var end = trimlist.indexOf(']', start)
        searchText = trimlist.slice(end + 1)
        forceSetting = trimlist.slice(start + 3,end)
      }
      
      if (forceTuneId !== null) {
        $.get('https://thesession.org/tunes/'+forceTuneId+'?format=json&perpage=50').then(function(tune) {
          handleFoundTune(tune, tunesList, searchText, null, songNumber)
        })
      } else {
        $.get('https://thesession.org/tunes/search?format=json&q='+searchText).then(function(searchRes) {
          // cache search results
          //console.log(searchRes)
          //searchResults[searchText] = searchRes.tunes
          var searchCache = loadLocalObject('abc2book_search')
          searchCache[safeString(searchText)] = searchRes.tunes
          saveLocalObject('abc2book_search',searchCache)
          if (searchRes && searchRes.tunes && searchRes.tunes.length > 0 && searchRes.tunes[0].id) {
            $.get('https://thesession.org/tunes/' + searchRes.tunes[0].id+'?format=json&perpage=50').then(function(tune) {
              handleFoundTune(tune, tunesList, searchText, forceSetting, songNumber)
            })
          } else {
            handleFoundTune(null, tunesList, searchText, null, songNumber)
          }
        })
      } 
    // empty tune title, try next tune (should not happen as input is filtered)
    } else {
      saveError(songNumber, 'Empty tune title')
      handleFoundTune(null, tunesList, searchText, null, songNumber)
    }
}


function handleFoundTune(tune, tunesList, searchText, forceSetting, songNumber) {
  // tune search has results
  if (tune && tune.id && Array.isArray(tune.settings)) {
      // if using hack to force setting, ensure that the setting is available or fall back to other strategy
      if (forceSetting !== null && tune.settings.length > forceSetting) {
         useSetting = forceSetting
         saveTuneAndSetting(tune,useSetting,songNumber,searchText, function() {
          iterateTunes(tunesList.slice(1), songNumber + 1)
         })
      // try to use a setting with chords, or fallback....
      } else {
        // search for settings that have chords
        var useSetting = 0
        var usableSettings = []
        for (var setting in tune.settings) {
            if (tune.settings[setting] && tune.settings[setting].abc && tune.settings[setting].abc.indexOf('"') !== -1) {
              usableSettings.push(setting)
            }
        }
        if (usableSettings.length > 0) {
           useSetting = (usableSettings[0] >= 0) ? usableSettings[0] : 0 
        } 
        //console.log('found setting',usableSettings, useSetting)
        // if we can use a setting with chords
        saveTuneAndSetting(tune,useSetting,songNumber,searchText, function() {
          iterateTunes(tunesList.slice(1), songNumber + 1)
        })
      }
  // no tune matches, try next tune
  } else {
    saveError(songNumber, 'No matches for '+searchText)
    saveTuneAndSetting(null,null,songNumber,searchText, function() {
      iterateTunes(tunesList.slice(1), songNumber + 1)
    })
  }
}

/**
 * Use thesession.org api to recursively lookup and save list of tunes 
 * Errors loading or rendering are cached to localStorage as an object
 * @param songNumber used internally to recursively pass the tune number
 */
function iterateTunes(tunesList, songNumber) {
  
  // allow for stop button
  if (tunesList.length > 0 && $('#stopbuttonvalue').val() !== "true") {
      handleTunesListItem(tunesList[0].trim(), songNumber, tunesList)
  // no more in list
  } else {
    finishLoadTunes()
  }
  
  
  
  
  
}
