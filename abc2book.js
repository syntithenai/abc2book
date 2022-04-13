var renderResult = null

$.fn.sortChildren = function(sortCb){
    this.children().detach().sort(sortCb).appendTo(this);
};

function emptyABC(number, name) {
  return "\nX:"+number+"\n" + 'T:' + (number + 1) +". "+name +  '' + "\n"
}

function songNumberForDisplay(songNumber) {
  if (parseInt(songNumber) > 0) {
    return  parseInt(songNumber) + 1
  }
  return 1
}


function sliceIntoChunks(arr, chunkSize) {
    const res = [];
    for (let i = 0; i < arr.length; i += chunkSize) {
        const chunk = arr.slice(i, i + chunkSize);
        res.push(chunk);
    }
    return res;
}

/**
 * Append metadata for song title,.. to abc string
 * for rendering complete tunes
 * @return multiline abc string starting with \nX:<tuneid>\n suitable for tune book 
 */
function tweakABC(songNumber, tune) { //abc, songNumber, name, forceTitle, key, type, aliases) {
  
  if (tune) {
    var abc = null
    var setting = {}
    if (tune.settings && tune.settings.length > tune.useSetting) {
      abc = tune.settings[tune.useSetting].abc
      setting = tune.settings[tune.useSetting]
    }
    if (!abc) {
      return emptyABC(songNumber,tune.name, tune.forceTitle)
    }
    var titleText = getTextFromSongline(tune.forceTitle)
    const capitalize = (str, lower = false) =>
    (lower ? str.toLowerCase() : str).replace(/(?:^|\s|["'([{])+\S/g, match => match.toUpperCase());
  ;

    var useName = titleText && titleText.trim().length > 0 ? capitalize(titleText,true) : capitalize(tune.name,true)
    var aliasText = ''
    if (tune.forceTitle.trim().length > 0) {
      aliasText += 'N: Primary name on thesession.org : ' + tune.name +"\n"
    }
    if (setting.key) aliasText = 'N: Key ' +setting.key.slice(0,1) + " " + setting.key.slice(1) + "\n"
       
    if (Array.isArray(tune.aliases) && tune.aliases.length > 0) {
       var aliasChunks = sliceIntoChunks(tune.aliases,5)
       aliasChunks.forEach(function(chunk) {
        aliasText += 'N: AKA: '  +chunk.join(", ")+"\n"
      })
    }
    
    var tweaked = "\nX: "+songNumber + "\n" 
                + "K:"+setting.key+ "\n"+ 
                "M:"+timeSignatureFromTuneType(tune.type)+ "\n" + aliasText + abc  + " \n" + 
                "T: " + songNumberForDisplay(songNumber) + ". "  + useName + 
                " \nR: "+  tune.type + "\n" 
                //+
                //"[U:sessionorg_id=" + tune.id + "]\n" + 
                //"[U:sessionorg_setting=" + tune.useSetting + "]\n" + 
                //"[U:force_title=" + tune.forceTitle + "]\n" 
    
    
    
    return tweaked
  } else {
    return ''
  }
}


function tweakShortABC(songNumber, tune) { //abc, songTitle, forceTitle, keySig, tuneType, songNumber) {
  if (tune) {
    var abc = null
    var setting = {}
    if (tune.settings && tune.settings.length > tune.useSetting) {
      abc = tune.settings[tune.useSetting].abc
      setting = tune.settings[tune.useSetting]
    }
    if (!abc) {
      return emptyABC(songNumber,tune.name, tune.forceTitle)
    }
    var titleText = getTextFromSongline(tune.forceTitle)
    const capitalize = (str, lower = false) =>
    (lower ? str.toLowerCase() : str).replace(/(?:^|\s|["'([{])+\S/g, match => match.toUpperCase());
  ;

    var useName = titleText && titleText.trim().length > 0 ? capitalize(titleText,true) : capitalize(tune.name,true)
    
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
      shortAbcParts = abc.split("|").slice(0,4)
      var shortAbc = ''
      // handle placement of text(song title)
      if (shortAbcParts.length > 3) {
        // tune starts at first bar
        if (shortAbcParts[0].trim() === '') {
          var ts = timeSignatureFromTuneType(tune.type)
          if (ts !== '') {
            shortAbc = shortAbc + "[M:"+ts+ "] "
          } 
          shortAbc = shortAbc + "[K:"+setting.key+ "] "
          // tune title 
          shortAbc = shortAbc  + '"' + songNumberForDisplay(songNumber) + '. '+useName+ '"' +  shortAbcParts.slice(1).join("|") 
        // lead in note
        } else {
          var ts = timeSignatureFromTuneType(tune.type)
          if (ts !== '') {
            shortAbc = shortAbc + "[M:"+ts+ "] "
          } 
          shortAbc = shortAbc + "[K:"+setting.key+ "] "
          shortAbc = shortAbc  + '"' + songNumberForDisplay(songNumber) + '. ' +useName+ '"' +  shortAbcParts.join("|") 
        }
      }
      shortAbc = "\nX: "+songNumber + "\n" + shortAbc + "\n"
    
    
    return shortAbc
  } else {
    return ''
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
      scale: 0.45,
      paddingLeft: 1,
      paddingRight: 1,
      //showDebug: ['grid','box']
  }
}


/**
 * Refresh display from list. Reload all songs.
 */
function generateMusic() {
  $('#waiting').show()
  resetIndexes()
  $("#stopbuttonvalue").val("")
  $("#shortabc").val("")
  $("#longabc").val("")
  
  hideTuneControls()
  $("#stopbutton").show()
  
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
  iterateTunes(tunesListUnique,0)
  
  
}


function generateAndRender() {
  $("#stopbutton").show()
  
  var start = new Date().getTime()
  generateAbcFromTunes()
  console.log('TIMER gen abc', (new Date().getTime() - start))
  generateShortAbcFromTunes()
  console.log('TIMER gen short abc', (new Date().getTime() - start))
  renderCheetsheetFromShortAbc()
  console.log('TIMER gen cheetsheet', (new Date().getTime() - start))
  renderMusicFromLongAbc()
  console.log('TIMER gen music', (new Date().getTime() - start))
  generateIndexesFromTunes()
  console.log('TIMER gen index', (new Date().getTime() - start))
  renderIndexes()
  console.log('TIMER render abc', (new Date().getTime() - start))
  $('#cheatsheet_music_container').hide()
}


/**
 * Once all songs are rendered
 * - restore buttons
 * - sort the song index
 */
function finishLoadTunes() {
    showTuneControls()
    generateAndRender()
    $('#waiting').hide()
    $('#stopbutton').hide()
    showContentSection('music')
}


function generateAndRenderSingle(songNumber, tune) {
  //console.log('generateAndRenderSingle', songNumber, tune)
  // update abc short
  if (tune && tune.settings.length > tune.useSetting) {
    
    var shortParts = $('#shortabc').val().trim().split("X:").slice(1)
    var shortabc = tweakShortABC(songNumber, tune)
    //tune.settings[tune.useSetting].abc, tune.name, tune.forceTitle, tune.settings[tune.useSetting].key, tune.type, songNumber)
    // cut off X:
    shortParts[songNumber] =  shortabc.slice(3) + "\n"
    $('#shortabc').val("X:" + shortParts.join(("X:")))
    //// update abc long
    var longParts = $('#longabc').val().trim().split("X:").slice(1)
    var longabc = tweakABC(tune.settings[tune.useSetting].abc, songNumber, tune.name, tune.forceTitle, tune.settings[tune.useSetting].key, tune.type, tune.aliases)
    //console.log('gen abc ',longabc)
    // cut off X:
    longParts[songNumber] = longabc.slice(3) + "\n"
    $('#longabc').val("X:" + longParts.join(("X:")))
    
    // render cheetsheet
    var shortkey = 'cheatsheet_music_'+songNumber
    $('#'+shortkey).html('')
    var renderResultCheat = window.ABCJS.renderAbc([shortkey], shortabc , getCheatSheetRendererSettings());
    // render song
    var longkey = 'music_'+songNumber
    //console.log('render into  ',longkey)
    $('#'+longkey).html('')
    var searchStrings = $('#songlist').val().split("\n")
    var renderResultSingle = window.ABCJS.renderAbc([longkey], longabc , getMainRendererSettings());
    renderResultSingle.map(function(rr,rk) {
      // update cache 
      renderResult[songNumber] = rr
      var searchString = searchStrings.length > rk && searchStrings[rk] ? searchStrings[rk] : ''
      //if (errors.hasOwnProperty(rk)) {
        //addErrorControls('#music_'+rk, errors[rk])
      //} else { 
        addAudioControls('#music_'+rk, rr, rk, searchString)
      //}
      $('.abcjs-rhythm tspan').attr('y','20')
    })
  }
  // indexes TODO
  generateIndexesFromTunes()
  renderIndexes()
  
}

/** 
 * Render cheatsheet from complete abcshort
 */
function renderCheetsheetFromShortAbc() {
  $('#cheatsheet_music').html('')
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
  if ($('#longabc').val().trim().length === 0) return
  var errors = loadErrors()  
  var tuneBook = new window.ABCJS.TuneBook($('#longabc').val())
  
  var targetArray = []
  var row = null;  
  tuneBook.tunes.map(function(v,k) {
    $('#music').append('<div id="music_'+k+'" ></div>')
    targetArray.push('music_'+k)
  })
  //var p = new Promise()
  renderResult = window.ABCJS.renderAbc(targetArray, $('#longabc').val() , getMainRendererSettings());
  var searchStrings = $('#songlist').val().split("\n")
  renderResult.map(function(rr,rk) {
    //console.log('RR',rr,rk)
    var searchString = searchStrings.length > rk && searchStrings[rk] ? searchStrings[rk] : ''
    //if (errors.hasOwnProperty(rk)) {
      //addErrorControls('#music_'+rk, errors[rk])
    //} else { 
      addAudioControls('#music_'+rk, rr, rk, searchString)
      
      //}
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
    //console.log('UPDATE ALL tune ',tuneKey,tunes[tuneKey])
    var tune = tunes[tuneKey]
    if (tune) {
      var setting = tune && tune.settings && tune.settings.length > tune.useSetting ? tune.settings[tune.useSetting] : {}
      if (setting) {
        abc +=  tweakABC(tuneKey, tune)
        //setting.abc, tuneKey, tune.name, tune.forceTitle, setting.key, tune.type, tune.aliases) + "\n"
      } else {
        abc +=   emptyABC(tuneKey,tune.name, tune.forceTitle)
      }
    } else {
      abc +=   emptyABC(tuneKey,'', tune.forceTitle)
    }
  })
  $('#longabc').val( abc)
}

function updateSingleTune(songNumber, ) {
  var tunes = loadLocalObject('abc2book_tunes')
  var abc = ''
  Object.keys(tunes).map(function(tuneKey) {
    //console.log('UPDATE SINGLE ',tuneKey,tune)
    var tune = tunes[tuneKey]
    if (tune) {
      var setting = tune && tune.settings && tune.settings.length > tune.useSetting ? tune.settings[tune.useSetting] : {}
      if (setting) {
        abc +=  tweakABC(songNumber, tune)
        //setting.abc, tuneKey, tune.name, tune.forceTitle, setting.key, tune.type, tune.aliases) + "\n"
      } else {
        abc +=   emptyABC(tuneKey,tune.name, tune.forceTitle)
      }
    } else {
      abc +=   emptyABC(tuneKey,'', tune.forceTitle)
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
        abc +=  tweakShortABC(tuneKey, tune) 
        //setting.abc, tune.name, tune.forceTitle, setting.key, tune.type, tuneKey)
      } else {
        abc +=   emptyABC(tuneKey,tune.name, tune.forceTitle)
      }
    } else {
      abc +=   emptyABC(tuneKey,'', tune.forceTitle)
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
    //var setting = tune && tune.settings && tune.settings.length > tune.useSetting ? tune.settings[tune.useSetting] : {}
    //addTuneToIndexes(songNumber, tune, setting, searchText)
  }
  callback()
}  

function handleTunesListItem(tunesListItem, songNumber, tunesList, settingCallback) {
    var searchResults = {}
    // current tune has non empty name ?
    if (tunesListItem.length > 0) {
      // hack to force search result/setting using [] with ID for session.org tuneid and S for setting number
      // if present, ID must be first
      // eg [ID:33][S:2]cooley's
      var trimlist = tunesListItem.trim();
      var forceTuneId = getMetaValueFromSongline("ID", trimlist)
      var forceSetting = getMetaValueFromSongline("S", trimlist)
      var searchText = getTextFromSongline(trimlist)
      //if (trimlist.indexOf('[ID:') !== -1) {
        //var start = trimlist.indexOf('[ID:')
        //var end = trimlist.indexOf(']', start)
        //searchText = trimlist.slice(end + 1)
        //forceTuneId = trimlist.slice(start + 4,end)
      //}
      //if (trimlist.indexOf('[S:') !== -1) {
        //var start = trimlist.indexOf('[S:')
        //var end = trimlist.indexOf(']', start)
        //searchText = trimlist.slice(end + 1)
        //forceSetting = trimlist.slice(start + 3,end)
      //}
      
      
      //console.log('FORCE', forceTuneId, forceSetting)
      
      if (forceTuneId !== null) {
        $.get('https://thesession.org/tunes/'+forceTuneId+'?format=json&perpage=50').then(function(tune) {
          handleFoundTune(tune, tunesList, searchText, forceSetting, songNumber, settingCallback)
        })
      } else {
        $.get('https://thesession.org/tunes/search?format=json&perpage=50&q='+searchText).then(function(searchRes) {
          // cache search results
          var searchCache = loadLocalObject('abc2book_search')
          searchCache[safeString(searchText)] = searchRes.tunes
          saveLocalObject('abc2book_search',searchCache)
          if (searchRes && searchRes.tunes && searchRes.tunes.length > 0 && searchRes.tunes[0].id) {
            $.get('https://thesession.org/tunes/' + searchRes.tunes[0].id+'?format=json&perpage=50').then(function(tune) {
              handleFoundTune(tune, tunesList, searchText, forceSetting, songNumber, settingCallback)
            })
          } else {
            handleFoundTune(null, tunesList, searchText, null, songNumber, settingCallback)
          }
        })
      } 
    // empty tune title, try next tune (should not happen as input is filtered)
    } else {
      saveError(songNumber, 'Empty tune title')
      handleFoundTune(null, tunesList, searchText, null, songNumber, settingCallback)
    }
}


function handleFoundTune(tune, tunesList, searchText, forceSetting, songNumber, settingCallback) {
  // tune search has results
   if (tune && tune.id && Array.isArray(tune.settings)) {
      // if using hack to force setting, ensure that the setting is available or fall back to other strategy
      if (forceSetting !== null && tune.settings.length > forceSetting) {
         useSetting = forceSetting
         if (settingCallback) settingCallback(useSetting)
         saveTuneAndSetting(tune,useSetting,songNumber,searchText, function() {
          iterateTunes(tunesList.slice(1), songNumber + 1, settingCallback)
         })
      // try to use a setting with chords, or fallback....
      } else {
        // search for settings that have chords
        var useSetting = 0
        var usableSettings = []
        for (var setting in tune.settings) {
            // seek chords as text in abc string
            if (tune.settings[setting] && tune.settings[setting].abc && tune.settings[setting].abc.indexOf('"') !== -1) {
              var chords = getInnerStrings(tune.settings[setting].abc)
              var haveChords = false;
              // any match success
              chords.map(function(chord,k) {
                 if (isChord(chord)) {
                    haveChords = true;
                 }
              })
              if (haveChords) {
                usableSettings.push(setting) 
                break
              }
            }
        }
        if (usableSettings.length > 0) {
           useSetting = (usableSettings[0] >= 0) ? usableSettings[0] : 0 
        } 
        // if we can use a setting with chords
        if (settingCallback) settingCallback(useSetting)
        saveTuneAndSetting(tune,useSetting,songNumber,searchText, function() {
          iterateTunes(tunesList.slice(1), songNumber + 1, settingCallback)
        })
      }
  // no tune matches, try next tune
  } else {
    if (settingCallback) settingCallback(0)
    saveError(songNumber, 'No matches for '+searchText)
    saveTuneAndSetting({},null,songNumber,searchText, function() {
      iterateTunes(tunesList.slice(1), songNumber + 1, settingCallback)
    })
  }
  
}

/**
 * Use thesession.org api to recursively lookup and save list of tunes 
 * Errors loading or rendering are cached to localStorage as an object
 * @param songNumber used internally to recursively pass the tune number
 */
function iterateTunes(tunesList, songNumber, finishCallback, settingCallback) {
  if (!finishCallback) finishCallback = finishLoadTunes
  $('#processingstatus').html('<b>Processing..... '+tunesList.length+' remaining </b>')
  songNumber = songNumber > 0 ? songNumber : 0
  // allow for stop button
  if (tunesList.length > 0 && tunesList[0] && $('#stopbuttonvalue').val() !== "true") {
      if (tunesList.length === 1 && tunesList[0].trim() === '') {
        // skip single empty line
      } else {
        handleTunesListItem(tunesList[0].trim(), songNumber, tunesList, settingCallback)
      }
  // no more in list
  } else {
    $('#processingstatus').html('')
    finishCallback()
  }
}



function renderSonglistPicker() {
   var pickerItems = $('<div  ></div>')
   Object.keys(getSongLists()).map(function(listName) {
       pickerItems.append('<div><a href="#" onClick="selectSongList(\''+listName+'\'); " >'+listName+'</a></div>')
   })
   $('#songlistpicker').html(pickerItems.html())
   $('#songlistpickerbutton').click(function(e) {
      e.stopPropagation()
    })
   
   
}

