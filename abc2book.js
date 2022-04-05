/**
 * Set flag to stop rendering lookups.
 */

function setStopNow(val) {
   $("#stopbuttonvalue").val("true")
   $("#stopbutton").hide()
}
/**
 * Persist songs list textarea, abc textareas and indexes
 */
function loadSongList() {
  $('#songlist').val(localStorage.getItem('songlist'))
}

function saveSongList() {
  localStorage.setItem('songlist',$('#songlist').val())
}
function loadShortAbc() {
  $('#shortabc').val(localStorage.getItem('shortabc'))
}

function saveShortAbc() {
  localStorage.setItem('shortabc',$('#shortabc').val())
}
function loadLongAbc() {
  $('#longabc').val(localStorage.getItem('longabc'))
}

function saveLongAbc() {
  localStorage.setItem('longabc',$('#longabc').val())
}

function saveIndexes() {
  localStorage.setItem('abcbook_index',$('#index').html())
  localStorage.setItem('abcbook_indexbykey',$('#indexbykey').html())
  localStorage.setItem('abcbook_indexbytype',$('#indexbytype').html())
}

function loadIndexes() {
  $('#index').html(localStorage.getItem('abcbook_index'))
  $('#indexbykey').html(localStorage.getItem('abcbook_indexbykey'))
  $('#indexbytype').html(localStorage.getItem('abcbook_indexbytype'))
}

function timeSignatureFromTuneType(type) {
  var types = {
    'jig': '6/8',
    'reel':  '4/4',
    'slip jig':  '9/8',
    'hornpipe':  '4/4',
    'polka':  '2/4',
    'slide':  '12/8',
    'waltz':  '3/4',
    'barndance':  '4/4',
    'strathspey':  '4/4',
    'three-two':  '3/2',
    'mazurka':  '3/4'
  }
  if (types.hasOwnProperty(type)) {
    return types[type]
  } else {
    return ''
  }
}

/**
 * Refresh display from list. Reload all songs.
 */
function generateMusic() {
  $("#stopbuttonvalue").val("")
  $("#shortabc").val("")
  $("#longabc").val("")
  $("#stopbutton").show()
  $("#generatebutton").hide()
  $('#cheatsheet_music').html('')
  $('#music').html('')
  $('#index').html('')
  $('#indexbykey').html('')
  $('#indexbytype').html('')
  $('#errors').html('')
  var tunesList = $('#songlist').val().split("\n").map(function(v) {if (v) { return v.trim()} else return v})
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
    collateMainIndex()
    $.fn.sortChildren = function(sortCb){
      this.children().detach().sort(sortCb).appendTo(this);
    };

    // Sort indexes
    $('#indexbytype').sortChildren(function(a, b) {
        // Compare amount of children
        return $(b).children().length - $(a).children().length;
    });
    $('#indexbykey').sortChildren(function(a, b) {
        // Compare amount of children
        return $(b).children().length - $(a).children().length;
    });
    
    saveIndexes()
    renderCheetsheetFromShortAbc()
    $('#downloadlongabc').css('display','block')
    $('#downloadshortabc').css('display','block')
    
}

function collateMainIndex() {
    var num_cols = 3,
    forceMinItemsPerColumn = 60,
    container = $('#index'),
    listItem = 'div',
    listClass = 'sub-list';
    container.each(function() {
      console.log(this)
        var items_per_col = new Array(),
        items = $(this).find(listItem),
        min_items_per_col = Math.max(forceMinItemsPerColumn,Math.floor(items.length / num_cols)),
        difference = items.length - (min_items_per_col * num_cols);
        for (var i = 0; i < num_cols; i++) {
            if (i < difference) {
                items_per_col[i] = min_items_per_col + 1;
            } else {
                items_per_col[i] = min_items_per_col;
            }
        }
        for (var i = 0; i < num_cols; i++) {
            $(this).append($('<div></div>').addClass(listClass));
            for (var j = 0; j < items_per_col[i]; j++) {
                var pointer = 0;
                for (var k = 0; k < i; k++) {
                    pointer += items_per_col[k];
                }
                $(this).find('.' + listClass).last().append(items[j + pointer]);
            }
        }
    });

}


function renderCheetsheetFromShortAbc() {
  var rendererSettings = {
      staffwidth: 300,
      wrap: { minSpacing: 1.0, maxSpacing: 1.4, preferredMeasuresPerLine: 4 },
      scale: 0.5,
      paddingLeft: 1,
      paddingRight: 1,
      //showDebug: ['grid','box']
  }
  var tuneBook = new window.ABCJS.TuneBook($('#shortabc').val())
  var targetArray = []
  
  var row = null;
  
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
  
  var renderResult = window.ABCJS.renderAbc(targetArray, $('#shortabc').val() , rendererSettings);
  
}

function addAudioControls(element, visualObj) {
  var startButton = $('<button style="font-size: 2em" class="activate-audio" >Play</button>')
  startButton.click(function() { $(".activate-audio").show(); $(this).hide(); $(".stop-audio").hide(); $(".stop-audio",$(this).parent()).show(); startPlaying(visualObj)})
  var stopButton = $('<button style="font-size: 2em; display: none;" class="stop-audio"  >Stop</button>')
  stopButton.click(function() { $(this).hide(); $(".activate-audio",$(this).parent()).show(); stopPlaying()})
  var wrongTuneButton = $('<button style="margin-left: 2em; font-size: 2em; " class="wrong-tune"  >Wrong Tune ?</button>')
  wrongTuneButton.click(function() { })
  var wrongSettingButton = $('<button style="margin-left: 2em; font-size: 2em;" class="wrong-setting"  >Wrong Setting ?</button>')
  wrongSettingButton.click(function() {})
  
  var controls = $('<div style="clear: both;" ></div>')
  controls.append(startButton)
  controls.append(stopButton)
  controls.append(wrongTuneButton)
  controls.append(wrongSettingButton)
  $(element).before(controls)
}

var midiBuffer = null

function startPlaying(visualObj) {
  console.log("START PLAYING", visualObj)
  //startAudioButton.setAttribute("style", "display:none;");
  //explanationDiv.setAttribute("style", "opacity: 0;");
  //statusDiv.innerHTML = "<div>Testing browser</div>";
  if (ABCJS.synth.supportsAudio()) {
    //stopAudioButton.setAttribute("style", "");

    // An audio context is needed - this can be passed in for two reasons:
    // 1) So that you can share this audio context with other elements on your page.
    // 2) So that you can create it during a user interaction so that the browser doesn't block the sound.
    // Setting this is optional - if you don't set an audioContext, then abcjs will create one.
    window.AudioContext = window.AudioContext ||
      window.webkitAudioContext ||
      navigator.mozAudioContext ||
      navigator.msAudioContext;
    var audioContext = new window.AudioContext();
    audioContext.resume().then(function () {
      //statusDiv.innerHTML += "<div>AudioContext resumed</div>";
      // In theory the AC shouldn't start suspended because it is being initialized in a click handler, but iOS seems to anyway.

      // This does a bare minimum so this object could be created in advance, or whenever convenient.
      if (midiBuffer) {
        midiBuffer.stop();
      }
      midiBuffer = new ABCJS.synth.CreateSynth();

      // midiBuffer.init preloads and caches all the notes needed. There may be significant network traffic here.
      var initOptions = {
        visualObj: visualObj,
        audioContext: audioContext,
        millisecondsPerMeasure: visualObj.millisecondsPerMeasure()
      }
      var tempoSetting = $("#tempovalue").val()
      console.log(' TEMPO',tempoSetting)
      if (tempoSetting) { 
        initOptions.millisecondsPerMeasure = 60000/tempoSetting * 4
      }
      return midiBuffer.init(initOptions).then(function (response) {
        //console.log("Notes loaded: ", response)
        //statusDiv.innerHTML += "<div>Audio object has been initialized</div>";
        // console.log(response); // this contains the list of notes that were loaded.
        // midiBuffer.prime actually builds the output buffer.
        return midiBuffer.prime();
      }).then(function (response) {
        //statusDiv.innerHTML += "<div>Audio object has been primed (" + response.duration + " seconds).</div>";
        //statusDiv.innerHTML += "<div>status = " + response.status + "</div>"
        // At this point, everything slow has happened. midiBuffer.start will return very quickly and will start playing very quickly without lag.
        midiBuffer.start();
        //statusDiv.innerHTML += "<div>Audio started</div>";
        return Promise.resolve();
      }).catch(function (error) {
        if (error.status === "NotSupported") {
          //stopAudioButton.setAttribute("style", "display:none;");
          //var audioError = document.querySelector(".audio-error");
          //audioError.setAttribute("style", "");
        }
         //else
          //console.warn("synth error", error);
      });
    });
  }
   //else {
    ////var audioError = document.querySelector(".audio-error");
    ////audioError.setAttribute("style", "");
  //}
}
  
function stopPlaying(element) {
  console.log("stopPlaying",element,midiBuffer)
  //startAudioButton.setAttribute("style", "");
  //explanationDiv.setAttribute("style", "");
  //stopAudioButton.setAttribute("style", "display:none;");
  if (midiBuffer)
    midiBuffer.stop();
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

function renderMusicFromLongAbc() {
    
  var tuneBook = new window.ABCJS.TuneBook($('#longabc').val())
  var targetArray = []
  
  var row = null;
  
  tuneBook.tunes.map(function(v,k) {
    $('#music').append('<div id="music_'+k+'" ></div>')
    
    targetArray.push('music_'+k)
  })
  
  var renderResult = window.ABCJS.renderAbc(targetArray, $('#longabc').val() , getMainRendererSettings());
 //console.log('RENDERMAIN')
  renderResult.map(function(rr,rk) {
    //console.log(rk,rr)
    addAudioControls('#music_'+rk, rr)
  })
  
  $('.abcjs-rhythm tspan').attr('y','20')
  $('#downloadlongabc').css('display','block')
  $('#downloadshortabc').css('display','block')
  $('#printbutton').css('display','block')
}

function download(filename, text) {
    var element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    element.setAttribute('download', filename);

    element.style.display = 'none';
    document.body.appendChild(element);

    element.click();

    document.body.removeChild(element);
}

function downloadLongAbc() {
  download('tunebook.abc', $("#longabc").val())
}

function downloadShortAbc() {
  download('tunebook_cheatsheet.abc', $("#shortabc").val())
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
    if (keyContainer.length == 0) {
      container.append('<div style="float: left; width: 25%" id="'+key+'"><h4>'+keyText+'</h4><div>'+value+'</div></div>')
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
function tweakABC(abc, songNumber, name, key, type, aliases) {
  var aliasText = ''
  if (Array.isArray(aliases) && aliases.length > 0) {
    aliasText = 'C: AKA ' +aliases.slice(0,6).join(", ")+"\n"
  }
  // remove strings from abc
  abc = abc.trim()
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
  //console.log("ALIAS",aliasText)
  return  "\nX: "+songNumber + "\n" + "K:"+key+ "\n"+ "M:"+timeSignatureFromTuneType(type)+ "\n" + aliasText + abc  + " \n" + "T: " + songNumber + ". "  + name + " \nR: "+ key.slice(0,1) + ' ' + key.slice(1) +' - ' + type + "\n"
  
  
}

/**
 * Create the DOM for the music rendering in the page
 * - add a p for page break
 * - div for tune with id  tune_XX
 * - abcjs render
 * Finally, check that music rendered successfully and trigger appropriate callback.
 * This is used to skip indexing of songs that fail to render.
 */
function renderTune(tune,setting,songNumber,searchText, cbOK, cbFail, aliases) {
  //console.log("REAN ALIAS", aliases)
    $('#music').append("<div class='paper' id='tune_"+tune.id+"'></div>")
    
    if (setting.abc) { 
      // remove strings from abc
      var abc = setting.abc.trim()
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
      var keySig = setting.key.replace("major","").replace("minor","min");
       
      shortAbcParts = abc.split("|").slice(0,4)
      var shortAbc = ''
      if (shortAbcParts.length > 3) {
        // tune starts at first bar
        if (shortAbcParts[0].trim() === '') {
          // time sig
          var ts = timeSignatureFromTuneType(tune.type)
          if (ts !== '') {
            shortAbc = shortAbc + "[M:"+ts+ "] "
          } 
          // key sig
          shortAbc = shortAbc + "[K:"+keySig+ "] "
          // tune title 
          //shortAbc = shortAbc + '"' + searchText + '"' 
          // append abc minus empty bar
          shortAbc = shortAbc  + '"'+searchText+ '"' +  shortAbcParts.slice(1).join("|") 
          //shortAbc = shortAbc + "[T:"+searchText+ "] "
        // lead in note
        } else {
          // time sig
          var ts = timeSignatureFromTuneType(tune.type)
          if (ts !== '') {
            shortAbc = shortAbc + "[M:"+ts+ "] "
          } 
          // key sig
          shortAbc = shortAbc + "[K:"+keySig+ "] "
          // append abc 
          shortAbc = shortAbc  + '"'+searchText+ '"' +  shortAbcParts.join("|") 
          
          
        }
      }
      shortAbc = "\nX: "+songNumber + "\n" + shortAbc + "\n"
      
      $('#longabc').val( $('#longabc').val()  + tweakABC(setting.abc, songNumber, searchText, setting.key, tune.type, aliases) + "\n")
      saveLongAbc()
      
      $('#shortabc').val( $('#shortabc').val()  + shortAbc)
      saveShortAbc()
      
    } 
    var renderResult = window.ABCJS.renderAbc('tune_'+tune.id, tweakABC(setting.abc, songNumber, searchText, setting.key, tune.type), getMainRendererSettings(), aliases);
    if (renderResult && renderResult.length > 0 && renderResult[0] && renderResult[0].lines && renderResult[0].lines.length > 0 ) {
      // hack rendering
      $('.abcjs-rhythm tspan').attr('y','20')
      renderResult.map(function(rr,rk) {
        //console.log(rk,rr)
        addAudioControls('#tune_'+tune.id, rr)
      })
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
        $.get('https://thesession.org/tunes/' + query).then(function(res) {
          // hack lookup by id into array shape
          if (!res.tunes || !Array.isArray(res.tunes)) {
            res = {tunes: [res]}
          }
          // tune search has results
          if (res && res.tunes && res.tunes.length > 0 && res.tunes[0].id) {
            $.get('https://thesession.org/tunes/' + res.tunes[0].id+'?format=json&perpage=50').then(function(res2) {
              //console.log("TUNE ON LOAD",res.tunes[0], res2)
    
              // if using hack to force setting, ensure that the setting is available or fall back to other strategy
              if (forceSetting !== null && res2.settings.length > forceSetting) {
                 useSetting = forceSetting
                 renderTune(res.tunes[0],res2.settings[useSetting],songNumber,searchText, function() {
                  //console.log('SUCCESS explicit setting')
                  indexTune(songNumber + ". "  + searchText + " \n", res.tunes[0].type, res2.settings[useSetting].key)
                  iterateTunes(tunesList.slice(1), songNumber + 1)
                }, function() {
                  //console.log('FAIL explicit setting')
                  $('#errors').css('display','block')
                  $('#errors').append('<div style="color: red; ">Failed to render ' + tunesList[0]+'</div>')
                  $('#tune_'+res.tunes[0].id).remove()
                  iterateTunes(tunesList.slice(1), songNumber)
                }, res2.aliases)
                
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
                  renderTune(res.tunes[0],res2.settings[useSetting],songNumber,searchText, function() {
                    indexTune(songNumber + ". "  + searchText + " \n", res.tunes[0].type, res2.settings[useSetting].key)
                    iterateTunes(tunesList.slice(1), songNumber + 1)
                  }, function() {
                    // try recover with a different setting (with chords)
                    if (usableSettings.length > 1) {
                       useSetting = usableSettings[1]
                       renderTune(res.tunes[0],res2.settings[useSetting],songNumber,searchText, function() {
                          indexTune(songNumber + ". "  + searchText + " \n", res.tunes[0].type, res2.settings[useSetting].key)
                          iterateTunes(tunesList.slice(1), songNumber + 1)
                       }, function() {
                          $('#errors').css('display','block')
                          $('#errors').append('<div style="color: red; ">Failed to render ' + searchText+'</div>')
                          $('#tune_'+res.tunes[0].id).remove()
                          iterateTunes(tunesList.slice(1), songNumber)
                       }, res2.aliases)
                    // try recover with a different setting (without chords), second search result
                    } else {
                      if (res2.settings.length  > 1) {
                         useSetting = 1
                         renderTune(res.tunes[0],res2.settings[useSetting],songNumber,searchText, function() {
                            indexTune(songNumber + ". "  + searchText + " \n", res.tunes[0].type, res2.settings[useSetting].key)
                            iterateTunes(tunesList.slice(1), songNumber + 1)
                         }, function() {
                            $('#errors').css('display','block')
                            $('#errors').append('<div style="color: red; ">Failed to render ' + searchText+'</div>')
                            $('#tune_'+res.tunes[0].id).remove()
                            iterateTunes(tunesList.slice(1), songNumber )
                         }, res2.aliases)
                         
                      } else {
                        $('#errors').css('display','block')
                        $('#errors').append('<div style="color: red; ">Failed to render ' + searchText+'</div>')
                        $('#tune_'+res.tunes[0].id).remove()
                        iterateTunes(tunesList.slice(1), songNumber )
                      }
                    }
                  }, res2.aliases)
                      
              //// no settings, try next tune
              } else {
                $('#errors').css('display','block')
                $('#errors').append('<div style="color: red; ">Failed to load settings for ' + searchText+"</div>")
                iterateTunes(tunesList.slice(1), songNumber )
              }
                
              }
            })
            
            
          // no tune matches, try next tune
          } else {
            $('#errors').css('display','block')
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
