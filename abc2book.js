var renderResult = null

$.fn.sortChildren = function(sortCb){
    this.children().detach().sort(sortCb).appendTo(this);
};



function sliceIntoChunks(arr, chunkSize) {
    const res = [];
    for (let i = 0; i < arr.length; i += chunkSize) {
        const chunk = arr.slice(i, i + chunkSize);
        res.push(chunk);
    }
    return res;
}


function updateTunesFromLongAbc() {
  if ($('#longabc').val().trim() === '') {
    showContentSection('music')
    return
  } else {
    var tv = $('#longabc').val()
    var tunes = abc2Tunebook(tv)
    console.log(tv,tunes)
    saveLocalObject('abc2book_tunes',tunes)
    // also songlist
    //var songList = tunes.map(function(tune) {
      //var text = tune.forceTitle ? tune.forceTitle : tune.name
      //var newLine = ''
      //if (tune.id)  newLine += '[ID:'+tune.id+']'
      //if (tune.useSetting > 0)  newLine += '[S:'+tune.useSetting+']'
      //else newLine += '[S:0]'
      //var boost = tune.boost > 0 ? tune.boost : 0
      //newLine += '[B:'+boost+']' + text
      //return newLine
    //})
    //$('#songlist').val(songList.join("\n"))
    var start = new Date().getTime()
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
    showContentSection('music')
  }
}
    //var row = null;
    //// collate into rows
    //tuneBook.tunes.map(function(v,k) {
    
  
 



      
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
  if (tune && tune.settings && tune.settings.length > tune.useSetting) {
    
    var shortParts = $('#shortabc').val().trim().split("X:").slice(1)
    var shortabc = json2shortabc(songNumber, tune)
    //tune.settings[tune.useSetting].abc, tune.name, tune.forceTitle, tune.settings[tune.useSetting].key, tune.type, songNumber)
    // cut off X:
    shortParts[songNumber] =  shortabc.slice(3) + "\n"
    $('#shortabc').val("X:" + shortParts.join(("X:")))
    //// update abc long
    var longParts = $('#longabc').val().trim().split("X:").slice(1)
    var longabc = json2abc(songNumber, tune) 
    //.settings[tune.useSetting].abc, songNumber, tune.name, tune.forceTitle, tune.settings[tune.useSetting].key, tune.type, tune.aliases)
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
    //var searchStrings = $('#songlist').val().split("\n")
    var renderResultSingle = window.ABCJS.renderAbc([longkey], longabc , getMainRendererSettings());
    renderResultSingle.map(function(rr,rk) {
      // update cache 
      renderResult[songNumber] = rr
      var searchString = ''
      //searchStrings.length > rk && searchStrings[rk] ? searchStrings[rk] : ''
      //if (errors.hasOwnProperty(rk)) {
        //addErrorControls('#music_'+rk, errors[rk])
      //} else { 
        addAudioControls('#music_'+rk, rr, rk, tune)
      //}
      $('.abcjs-rhythm tspan').attr('y','20')
      makeEditable(".abcjs-title tspan")
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
  //var searchStrings = $('#songlist').val().split("\n")
  renderResult.map(function(rr,rk) {
    //console.log('RR',rr,rk)
    //var searchString = searchStrings.length > rk && searchStrings[rk] ? searchStrings[rk] : ''
    //if (errors.hasOwnProperty(rk)) {
      //addErrorControls('#music_'+rk, errors[rk])
    //} else { 
    var tune = getTuneFromCache(rk)
    addAudioControls('#music_'+rk, rr, rk, tune)
      
      //}
  })
  
  $('.abcjs-rhythm tspan').attr('y','20')
  $('#downloadlongabc').css('display','block')
  $('#downloadshortabc').css('display','block')
  $('#printbutton').css('display','block')
  makeEditable(".abcjs-title tspan")
}

function generateAbcFromTunes() {
  var tunes = loadLocalObject('abc2book_tunes')
  var abc = ''
  console.log('UPDATE ALL tune ',tunes)
  Object.keys(tunes).map(function(tuneKey) {
    
    var tune = tunes[tuneKey]
    //console.log('UPDATE tune ',tuneKey, tune)
    if (tune) {
      var setting = tune && tune.settings && tune.settings.length > tune.useSetting ? tune.settings[tune.useSetting] : null
      if (setting) {
        abc +=  json2abc(tuneKey, tune)
        //console.log('UPDATE tune OK')
        //setting.abc, tuneKey, tune.name, tune.forceTitle, setting.key, tune.type, tune.aliases) + "\n"
      } else {
        abc +=   emptyABC(tuneKey,getTuneName(tune), tune.forceTitle)
        //console.log('UPDATE tune EMPTY no setting')
      }
    } else {
      abc +=   emptyABC(tuneKey,'', tune.forceTitle)
      //console.log('UPDATE tune EMPTY no tune')
    }
    
  })
  console.log([abc])
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
        abc +=  json2abc(songNumber, tune)
        //setting.abc, tuneKey, tune.name, tune.forceTitle, setting.key, tune.type, tune.aliases) + "\n"
      } else {
        abc +=   emptyABC(tuneKey,getTuneName(tune), tune.forceTitle)
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
        abc +=  json2shortabc(tuneKey, tune) 
        //setting.abc, tune.name, tune.forceTitle, setting.key, tune.type, tuneKey)
      } else {
        abc +=   emptyABC(tuneKey,getTuneName(tune), tune.forceTitle)
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
    //tune.forceTitle = searchText
    tune.useSetting = useSetting
    tunes[songNumber] = tune
    saveLocalObject('abc2book_tunes', tunes)
    //var setting = tune && tune.settings && tune.settings.length > tune.useSetting ? tune.settings[tune.useSetting] : {}
    //addTuneToIndexes(songNumber, tune, setting, searchText)
  }
  if (callback) callback()
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
        }).catch(function(e) {
          console.log(["ERR1",e])
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
            }).catch(function(e) {
              console.log(["ERR2",e])
            })
          } else {
            handleFoundTune(null, tunesList, searchText, null, songNumber, settingCallback)
          }
        }).catch(function(e) {
          console.log(["ERR3",e])
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
        for (var setting in tune.settings.reverse()) {
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

