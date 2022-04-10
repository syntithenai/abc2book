
var midiBuffer = null


function addAudioControls(element, visualObj, songNumber, searchString) {
  // PLAYBACK CONTROLS
  console.log('add audio', searchString)
  var boost = getMetaValueFromSongline('B',searchString)
  boost = boost > 0 ? boost : 0
  $("#controls_"+songNumber).remove()
  var startButton = $('<button class="actionbutton activate-audio playbutton" ><svg role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><title>Start Playing</title><path fill="none" d="M0 0h24v24H0z"/><path d="M16.394 12L10 7.737v8.526L16.394 12zm2.982.416L8.777 19.482A.5.5 0 0 1 8 19.066V4.934a.5.5 0 0 1 .777-.416l10.599 7.066a.5.5 0 0 1 0 .832z"/></svg></button>')
  startButton.click(function() { 
    $(".activate-audio").show(); 
    $(this).hide(); 
    $(".stop-audio").hide(); 
    $(".stop-audio",$(this).parent()).show(); 
    $("#playallbutton").hide()
    $("#stopplayingallbutton").show()
    playSongNumber(songNumber)
    
    //startPlaying(visualObj)
  })
  var stopButton = $('<button style="" class="stopplayingbutton actionbutton stop-audio"  ><svg role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><title>Stop Playing</title><path fill="none" d="M0 0h24v24H0z"/><path d="M7 7v10h10V7H7zM6 5h12a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/></svg></button>')
  stopButton.click(function() { 
    $(".playbutton").show(); 
    $("#playallbutton").show()
    $("#stopplayingallbutton").hide()
    $(this).hide(); 
    stopPlaying()
  })

  // SEARCH CONTROLS
  var sc = getSearchCache(songNumber)
  sc = sc ? sc : []
  var ss = getSettings(songNumber)
  ss = ss ? ss : []
  var tune = getTuneFromCache(songNumber)
  var useSetting = tune && tune.useSetting > 0 ? parseInt(tune.useSetting).mod(ss.length) : 0
    
  
  var wrongTuneControls = $('<span  style="position: relative"></span>')
  var wrongTuneButton = $('<button style="margin-left: 1em" ><svg role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><title>Wrong tune ?</title><path fill="none" d="M0 0h24v24H0z"/><path d="M18.031 16.617l4.283 4.282-1.415 1.415-4.282-4.283A8.96 8.96 0 0 1 11 20c-4.968 0-9-4.032-9-9s4.032-9 9-9 9 4.032 9 9a8.96 8.96 0 0 1-1.969 5.617zm-2.006-.742A6.977 6.977 0 0 0 18 11c0-3.868-3.133-7-7-7-3.868 0-7 3.132-7 7 0 3.867 3.132 7 7 7a6.977 6.977 0 0 0 4.875-1.975l.15-.15z"/></svg></button>')
  var wrongTuneSelector = $(`<div  id="wrong_tune_selector_`+songNumber+`" class="overlay" style="position: absolute; top: 10; left: 0;" >
    <div><label>Search </label><form onSubmit="delayedUpdateSearchResults(`+songNumber+`); return false" ><input id="wrong_tune_input_`+songNumber+`" value="`+getTextFromSongline(searchString)+`" type="text"   ><input type='submit' value="Search" /></form></div>
  </div>`)
  
  sc.map(function(v) {
    if (v) {
      wrongTuneSelector.append('<div class="tune_selector_option" ><a  href="#" onClick="updateTuneId(' + songNumber + ', ' + v.id + '); return false;" >'+v.name+'</a></div>')
    }
    return false
  })
  wrongTuneControls.click(function(e) {
    e.stopPropagation()
  })
  wrongTuneSelector.hide()
  wrongTuneControls.append(wrongTuneButton)
  wrongTuneControls.append(wrongTuneSelector)
  wrongTuneButton.click(function() {
    wrongTuneSelector.show()
    return false;
  })
  var wrongSettingButtonUp = $('<button style="z-index: 50 ; font-size:0.8em; margin-left: 0.4em" class="actionbutton wrong-setting-up"  ><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path fill="none" d="M0 0h24v24H0z"/><path d="M13 7.828V20h-2V7.828l-5.364 5.364-1.414-1.414L12 4l7.778 7.778-1.414 1.414L13 7.828z"/></svg></button>')
  var wrongSettingButtonDown = $('<button style="z-index: 50 ; font-size:0.8em; margin-left: 0.4em" class="actionbutton wrong-setting-down"  ><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path fill="none" d="M0 0h24v24H0z"/><path d="M13 16.172l5.364-5.364 1.414 1.414L12 20l-7.778-7.778 1.414-1.414L11 16.172V4h2v12.172z"/></svg></button>')
  wrongSettingButtonUp.click(function() {
    var tune = getTuneFromCache(songNumber)
    var useSetting = tune && tune.useSetting > 0 ? parseInt(tune.useSetting).mod(ss.length) : 0
    updateTuneSetting(songNumber, (useSetting + 1).mod(ss.length))
    $('#use_setting_'+songNumber).text((useSetting + 1).mod(ss.length) + 1)
    scrollTo('controls_'+songNumber)
  })
  wrongSettingButtonDown.click(function() {
    var tune = getTuneFromCache(songNumber)
    var useSetting = tune && tune.useSetting > 0 ? parseInt(tune.useSetting).mod(ss.length) : 0
    updateTuneSetting(songNumber, (useSetting - 1).mod(ss.length))
    $('#use_setting_'+songNumber).text((useSetting - 1).mod(ss.length) + 1)
    scrollTo('controls_'+songNumber)
  })
  var wrongSettingButton = $('<span style="margin-left: 0.4em; ">Setting (<span id="use_setting_'+songNumber+'" >'+ (useSetting + 1) +'</span>/' + (ss.length) +')</span>')
  wrongSettingButton.append(wrongSettingButtonUp)
  wrongSettingButton.append(wrongSettingButtonDown)
  
  var newSettingButton = $('<button style="margin-left:0.2em" ><svg  role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><title>New Setting</title><path fill="none" d="M0 0h24v24H0z"/><path d="M11 11V5h2v6h6v2h-6v6h-2v-6H5v-2z"/></svg></button>')
  newSettingButton.click(function() {
    const cb = navigator.clipboard;
    cb.writeText(tune.settings[tune.useSetting].abc).then(function() {
       if (confirm('Copied! Next a window will open where you can paste the ABC text, edit the music and submit a new setting for this tune.')) {
         var a = window.open('https://thesession.org/tunes/'+tune.id+"/add",'submitwindow')
         a.focus()
       }
    }).catch(function(e) {
        console.log(e)
    });
  })
  
  $("#controls_"+songNumber).remove()
  var boostButtons = $(`<div id="boostbuttons" style="float: right" >Progress (<span id="tune_boost_`+songNumber+`" >`+boost+`</span>)    
  <button id="tune_boost_up_`+songNumber+`" ><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path fill="none" d="M0 0h24v24H0z"/><path d="M13 7.828V20h-2V7.828l-5.364 5.364-1.414-1.414L12 4l7.778 7.778-1.414 1.414L13 7.828z"/></svg></button>
  <button  id="tune_boost_down_`+songNumber+`" ><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path fill="none" d="M0 0h24v24H0z"/><path d="M13 16.172l5.364-5.364 1.414 1.414L12 20l-7.778-7.778 1.414-1.414L11 16.172V4h2v12.172z"/></svg></button>  
  </div>`)
  
  var removeButton = $('<button style="float: right; margin-right: 0.5em" id="removebutton" ><svg role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><title>Remove from tune book</title><path fill="none" d="M0 0h24v24H0z"/><path d="M17 6h5v2h-2v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8H2V6h5V3a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v3zm1 2H6v12h12V8zm-9 3h2v6H9v-6zm4 0h2v6h-2v-6zM9 4v2h6V4H9z"/></svg></button>')
  removeButton.click(function() {
    if (confirm('Really remove this tune from your playlist ?')) {
      removeTune(songNumber)
    }
  })
  
  var controls = $('<div class="controls" id="controls_'+songNumber+'" style="clear: both; border-top: 1px solid black; " ></div>')
  controls.append(startButton)
  controls.append(stopButton)
  controls.append(wrongTuneControls)
  controls.append(newSettingButton)
  controls.append(wrongSettingButton)
  controls.append(boostButtons)
  controls.append(removeButton)
  //console.log('app contreols',controls)
  $(element).before(controls)
  $('#tune_boost_up_'+songNumber).click(function() {
       progressUp(songNumber )
  })
  $('#tune_boost_down_'+songNumber).click(function() {
    //$('#tune_boost_'+songNumber).text(parseInt($('#tune_boost_'+songNumber).text()) - 1)
    progressDown(songNumber)
  })
  $(".stop-audio").hide()
}

function addErrorControls(element, error) {
  var controls = $('<div style="clear: both; color: red;" >ERROR: '+error+'</div>')
  $(element).before(controls)
}

var midiBuffer = new ABCJS.synth.CreateSynth();
    
function playSongNumber(songNumber)  {
  $('#forcestop').val('')
  if (renderResult.length > songNumber) {
    var tunes = loadLocalObject('abc2book_tunes')
    if (tunes && tunes[songNumber] && tunes[songNumber].name) {
      speak(tunes[songNumber].name, {speed: 140, amplitude: 120} )
      setTimeout(function() {
        startPlaying(renderResult[songNumber], songNumber)
      }, 1200)
    }
  }
}

function finishPlaying(songNumber) {
  console.log('FINISH')
      if ($('#forcestop').val() !== "true") {
        // start next track after delay to avoid double callback
        console.log('MPW PLAY '+(songNumber + 1))
        var sp = $('#songlist').val().split("\n")
        if (songNumber < sp.length) {
          playSongNumber(parseInt(songNumber) + 1)
        } else {
          stopPlaying()
        }
      } else {
        $('#forcestop').val('')
        stopPlaying()
      }
}

      
function startPlaying(visualObj, songNumber) {
  if (!midiBuffer) midiBuffer = new ABCJS.synth.CreateSynth();
  if (ABCJS.synth.supportsAudio()) {
    window.AudioContext = window.AudioContext ||
      window.webkitAudioContext ||
      navigator.mozAudioContext ||
      navigator.msAudioContext;
    var audioContext = new window.AudioContext();
    audioContext.resume().then(function () {
      if (midiBuffer) {
        midiBuffer.stop();
      }
      // midiBuffer.init preloads and caches all the notes needed. There may be significant network traffic here.
      // HACK onEnded is called twice so skip first invocation
      var count = 0
      var onEnded = function(d) {
        console.log('ONENDED')
        count = count + 1;
        // TODO USE THIS HOOK TO START NEXT TRACK IF PLAY ALL trackId IS ACTIVE
        //if (count > 1) {
          finishPlaying(songNumber)
          onEnded = null
        //}
      }
      var initOptions = {
        visualObj: visualObj,
        audioContext: audioContext,
        millisecondsPerMeasure: visualObj.millisecondsPerMeasure(),
        //debugCallback: function(d) {
          //console.log('DC',d)
        //},
        options: {
          onEnded: onEnded
        }
      }
      var tempoSetting = $("#tempovalue").val()
      if (tempoSetting) { 
        // rough first cut assume 4 beats per bar   
        // millisecondsPerBeat = 60000/bpm
        initOptions.millisecondsPerMeasure = 60000/tempoSetting * 4
      }
      return midiBuffer.init(initOptions).then(function (response) {
        // midiBuffer.prime actually builds the output buffer.
        return midiBuffer.prime();
      }).then(function (response) {
        // At this point, everything slow has happened. midiBuffer.start will return very quickly and will start playing very quickly without lag.
        midiBuffer.start();
        //midiBuffer.seek(0.9);
        return Promise.resolve();
      }).catch(function (error) {
          console.warn("synth error", error);
      });
    });
  }
}
  
function stopPlaying() {
  if (midiBuffer) midiBuffer.stop();
  $('.playbutton').show()
  $('#playallbutton').show()
  $('#stopplayingallbutton').hide()
  $('#playallvalue').val('')
  $('#forcestop').val('true')
  midiBuffer = null
}  

function playAll() {
  $('#playallvalue').val('true')
  playSongNumber(0)
  $('#forcestop').val('')

}


