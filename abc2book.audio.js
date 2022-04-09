
var midiBuffer = null


function addAudioControls(element, visualObj, songNumber, searchString) {
  // PLAYBACK CONTROLS
  var startButton = $('<button style="class="actionbutton activate-audio playbutton" >Play</button>')
  startButton.click(function() { 
    $(".activate-audio").show(); 
    $(this).hide(); 
    $(".stop-audio").hide(); 
    $(".stop-audio",$(this).parent()).show(); 
    $("#playallbutton").hide()
    $("#stopplayingallbutton").show()
    
    
    startPlaying(visualObj)
  })
  var stopButton = $('<button style="" class="stopplayingbutton actionbutton stop-audio"  >Stop</button>')
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
  
  var wrongTuneControls = $('<span  style="position: relative; margin-left: 2em; "></span>')
  var wrongTuneButton = $('<button>Wrong Tune ? ('+(sc.length + 1)+')</button>')
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
  var wrongSettingButtonUp = $('<button style="z-index: 50 ; font-size:0.8em; margin-left: 1em" class="actionbutton wrong-setting-up"  >⇧</button>')
  var wrongSettingButtonDown = $('<button style="z-index: 50 ; font-size:0.8em; margin-left: 1em" class="actionbutton wrong-setting-down"  >⇩</button>')
  wrongSettingButtonUp.click(function() {
    updateTuneSetting(songNumber, (parseInt(useSetting) + 1).mod(ss.length))
    scrollTo('controls_'+songNumber)
  })
  wrongSettingButtonDown.click(function() {
    updateTuneSetting(songNumber, (parseInt(useSetting) - 1).mod(ss.length))
    scrollTo('controls_'+songNumber)
  })
  var wrongSettingButton = $('<span style="margin-left: 2em; ">Setting ('+ (useSetting + 1) +'/' + (ss.length) +')</span>')
  wrongSettingButton.append(wrongSettingButtonUp)
  wrongSettingButton.append(wrongSettingButtonDown)
  
  var newSettingButton = $('<button style="margin-left:2em" >New Setting</button>')
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
  var controls = $('<div class="controls" id="controls_'+songNumber+'" style="clear: both; " ></div>')
  controls.append(startButton)
  controls.append(stopButton)
  controls.append(wrongTuneControls)
  controls.append(newSettingButton)
  controls.append(wrongSettingButton)
  $(element).before(controls)
  $(".stop-audio").hide()
}

function addErrorControls(element, error) {
  var controls = $('<div style="clear: both; color: red;" >ERROR: '+error+'</div>')
  $(element).before(controls)
}

function startPlaying(visualObj) {
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
      midiBuffer = new ABCJS.synth.CreateSynth();
      // midiBuffer.init preloads and caches all the notes needed. There may be significant network traffic here.
      var initOptions = {
        visualObj: visualObj,
        audioContext: audioContext,
        millisecondsPerMeasure: visualObj.millisecondsPerMeasure(),
        onEnded: function() {
          // TODO USE THIS HOOK TO START NEXT TRACK IF PLAY ALL trackId IS ACTIVE
          console.log('finished playing')
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
        return Promise.resolve();
      }).catch(function (error) {
          console.warn("synth error", error);
      });
    });
  }
}
  
function stopPlaying(element) {
  if (midiBuffer) midiBuffer.stop();
}  

function playAll() {
  
}


