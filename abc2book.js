/**
 * Set flag to stop rendering lookups.
 */

function setStopNow(val) {
   $("#stopbuttonvalue").val("true")
   $("#stopbutton").hide()
}
/**
 * Persist songs list textarea
 */
function loadSongList() {
  $('#songlist').val(localStorage.getItem('songlist'))
}

function saveSongList() {
  localStorage.setItem('songlist',$('#songlist').val())
}

/**
 * Refresh display from list. Reload all songs.
 */
function generateMusic() {
  $("#stopbuttonvalue").val("")
  $("#stopbutton").show()
  $("#generatebutton").hide()

  $('#music').html('')
  $('#index').html('')
  $('#indexbykey').html('<h3>Index By Key Signature</h3>')
  $('#indexbytype').html('<h3>Index By Tune Type</h3>')
  $('#errors').html('')
  var tunesList = $('#songlist').val().split("\n").map(function(v) {if (v) { return v.trim()} else return v})
  console.log(tunesList)
  let tunesListUnique = tunesList.filter((item, i, ar) => ar.indexOf(item) === i);
  iterateTunes(tunesListUnique, 1)
}

/**
 * Once all songs are rendered
 * - restore buttons
 * - sort the song index
 */
function finishGeneration() {
    $("#stopbutton").hide()
    $("#generatebutton").show()
    // sort the main index and split into columns of 40, 3 cols per page
    var lookups = {}
    $("#index div").map(function(a,d) {
        var lParts = $(d).text().split(".")
        var number = lParts[0]
        var name = lParts[1].trim()
        lookups[name] = $(d).text()
    })
    var sorted = []
    var sortedKeys = Object.keys(lookups).sort()
    sortedKeys.map(function(a) {
      sorted.push(lookups[a])
    })  
    $('#index').html(sorted.map(function(a) {return $("<div>"+a+"</div>")}) )
}


function printPage() {
  //$('#controls').hide()
  //$('#errors').html('')
  window.print()
}


/**
 * Append a div (or div and parent collation key div) 
 */
function addToCollation(collationId, key,keyText, value) {
    var container = $("#"+collationId)
    var keyContainer = $("#"+key, container)
    //console.log('add collation',keyContainer.length)
    if (keyContainer.length == 0) {
      container.append('<div style="float: left; margin-left: 1em; width: 25%" id="'+key+'"><h4>'+keyText+'</h4><div>'+value+'</div></div>')
    } else {
      keyContainer.append('<div>'+value+'</div>')
    }
}

/**
 * Add a tune to various indexes 
 */
function indexTune(tuneName, tuneType, tuneKey) {
   $('#index').append("<div>" + tuneName + "</div>")
   addToCollation('indexbykey', tuneKey, tuneKey.slice(0,1)+' ' +tuneKey.slice(1), tuneName)
   addToCollation('indexbytype', tuneType, tuneType, tuneName)
}

/**
 * Append metadata for song title,.. to abc string
 */
function tweakABC(abc, songNumber, name, key, type) {
  return  abc  + " \n" + "T: " + songNumber + ". "  + name + " \nR: "+ key.slice(0,1) + ' ' + key.slice(1) +' - ' + type + "\n"
}

/**
 * Create the DOM for the music rendering in the page
 * - add a p for page break
 * - div for tune with id  tune_XX
 * - abcjs render
 * Finally, check that music rendered successfully and trigger appropriate callback.
 * This is used to skip indexing of songs that fail to render.
 */
function renderTune(tune,setting,songNumber,searchText, rendererSettings, cbOK, cbFail) {
    $('#music').append("<p style='page-break-before: always'><div class='paper' id='tune_"+tune.id+"'></div></p>")
    var renderResult = window.ABCJS.renderAbc('tune_'+tune.id, tweakABC(setting.abc, songNumber, searchText, setting.key, tune.type), rendererSettings);
    if (renderResult && renderResult.length > 0 && renderResult[0] && renderResult[0].lines && renderResult[0].lines.length > 0 ) {
      cbOK()
    } else {
      cbFail()
    } 
}

/**
 * Use thesession.org api to recursively lookup a list of tunes 
 * As tunes are loaded they are indexed and rendered into the page
 * Errors loading or rendering are appended to #errors
 * @para songNumber used internally to recursively pass the tune number
 */
function iterateTunes(tunesList, songNumber) {
  var rendererSettings = {}
  // allow for stop button
  if (tunesList.length > 0 && $('#stopbuttonvalue').val() !== "true") {
      // current tune has non empty name ?
      if (tunesList[0].trim().length > 0) {
        // hack to force search result/setting using :::
        // eg 1:::my tune               to use setting 1 
        // or 1:::44:::my tune          to specify thesession tuneid and setting
        var forceSelections = tunesList[0].trim().split(":::") 
        var forceTuneId = null
        var forceSetting = null
        var searchText = tunesList[0]
        if (forceSelections.length === 3) {
          searchText = forceSelections[2]
          forceTuneId = forceSelections[1]
          forceSetting = forceSelections[0]
        } else if (forceSelections.length === 2) {
          searchText = forceSelections[1]
          forceSetting = forceSelections[0]
        } 
        var query = 'search?format=json&q='+searchText
        if (forceTuneId !== null) {
          query = forceTuneId + '?format=json'
        }
        console.log(query)
        $.get('https://thesession.org/tunes/' + query).then(function(res) {
          console.log(['RR',res])
          // hack lookup by id into array shape
          if (!res.tunes || !Array.isArray(res.tunes)) {
            res = {tunes: [res]}
          }
          // tune search has results
          if (res && res.tunes && res.tunes.length > 0 && res.tunes[0].id) {
            $.get('https://thesession.org/tunes/' + res.tunes[0].id+'?format=json&perpage=50').then(function(res2) {
              
              // if using hack to force setting, ensure that the setting is available or fall back to other strategy
              if (forceSetting !== null && res2.settings.length > forceSetting) {
                 useSetting = forceSetting
                 renderTune(res.tunes[0],res2.settings[useSetting],songNumber,searchText, rendererSettings, function() {
                  //console.log('SUCCESS explicit setting')
                  indexTune(songNumber + ". "  + searchText + " \n", res.tunes[0].type, res2.settings[useSetting].key)
                  iterateTunes(tunesList.slice(1), songNumber + 1)
                }, function() {
                  //console.log('FAIL explicit setting')
                  $('#errors').append('<div style="color: red; ">Failed to render ' + tunesList[0]+'</div>')
                  $('#tune_'+res.tunes[0].id).remove()
                  iterateTunes(tunesList.slice(1), songNumber)
                })
                
              // try to use a setting with chords, or fallback....
              } else {
                // search for settings that have chords
                var useSetting = 0
                var usableSettings = []
                for (var setting in res2.settings) {
                    if (res2.settings[setting] && res2.settings[setting].abc && res2.settings[setting].abc.indexOf('"') !== -1) {
                      usableSettings.push(setting)
                    }
                }
                if (usableSettings.length > 0) {
                   useSetting = usableSettings[0]
                }
                // if we can use a setting with chords
                if (res2 && res2.settings && res2.settings.length > 0 && res2.settings[useSetting].abc && res2.settings[useSetting].abc.length > 0) {
                  renderTune(res.tunes[0],res2.settings[useSetting],songNumber,searchText, rendererSettings, function() {
                    indexTune(songNumber + ". "  + searchText + " \n", res.tunes[0].type, res2.settings[useSetting].key)
                    iterateTunes(tunesList.slice(1), songNumber + 1)
                  }, function() {
                    // try recover with a different setting (with chords)
                    if (usableSettings.length > 1) {
                       useSetting = usableSettings[1]
                       renderTune(res.tunes[0],res2.settings[useSetting],songNumber,searchText, rendererSettings, function() {
                          indexTune(songNumber + ". "  + searchText + " \n", res.tunes[0].type, res2.settings[useSetting].key)
                          iterateTunes(tunesList.slice(1), songNumber + 1)
                       }, function() {
                          $('#errors').append('<div style="color: red; ">Failed to render ' + searchText+'</div>')
                          $('#tune_'+res.tunes[0].id).remove()
                          iterateTunes(tunesList.slice(1), songNumber)
                       })
                    // try recover with a different setting (without chords), second search result
                    } else {
                      if (res2.settings.length  > 1) {
                         useSetting = 1
                         renderTune(res.tunes[0],res2.settings[useSetting],songNumber,searchText, rendererSettings, function() {
                            indexTune(songNumber + ". "  + searchText + " \n", res.tunes[0].type, res2.settings[useSetting].key)
                            iterateTunes(tunesList.slice(1), songNumber + 1)
                         }, function() {
                            $('#errors').append('<div style="color: red; ">Failed to render ' + searchText+'</div>')
                            $('#tune_'+res.tunes[0].id).remove()
                            iterateTunes(tunesList.slice(1), songNumber )
                         })
                         
                      } else {
                        $('#errors').append('<div style="color: red; ">Failed to render ' + searchText+'</div>')
                        $('#tune_'+res.tunes[0].id).remove()
                        iterateTunes(tunesList.slice(1), songNumber )
                      }
                    }
                  })
                }  
                  
              //// no settings, try next tune
              //} else {
                //$('#errors').append('<div style="color: red; ">Failed to load settings for ' + searchText+"</div>")
                //iterateTunes(tunesList.slice(1), songNumber )
              //}
                
              }
            })
            
            
          // no tune matches, try next tune
          } else {
            $('#errors').append('<div style="color: red; ">Failed to find a tune matching ' + searchText+"</div>")
            iterateTunes(tunesList.slice(1), songNumber )
          }
        })
      // empty title, try next tune
      } else {
        iterateTunes(tunesList.slice(1), songNumber )
      }
  // no more in list
  } else {
    finishGeneration()
  }

}
