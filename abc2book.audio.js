
var midiBuffer = null


function addAudioControls(element, visualObj, songNumber) {
  var startButton = $('<button style="class="actionbutton activate-audio" >Play</button>')
  startButton.click(function() { $(".activate-audio").show(); $(this).hide(); $(".stop-audio").hide(); $(".stop-audio",$(this).parent()).show(); startPlaying(visualObj)})
  var stopButton = $('<button style="display: none;" class="actionbutton stop-audio"  >Stop</button>')
  stopButton.click(function() { $(this).hide(); $(".activate-audio",$(this).parent()).show(); stopPlaying()})
  
  var sc = getSearchCache(songNumber)
  sc = sc ? sc : []
  var ss = getSettings(songNumber)
  ss = ss ? ss : []
  //var tunes = loadLocalObject('abc2book_tunes')
  var tune = getTuneFromCache(songNumber)
  
  var useSetting = tune && tune.useSetting ? (tune.useSetting % ss.length) : 0
  //console.log("UUU",useSetting, tune.useSetting,tune,"SC",sc,"SS",ss)
  var wrongTuneButtonUp = $('<button style="font-size:0.8em; margin-left: 1em" class="actionbutton wrong-tune-up"  >⇧</button>')
  var wrongTuneButtonDown = $('<button style="font-size:0.8em; margin-left: 1em"  class="actionbutton wrong-tune-down"  >⇩</button>')
  wrongTuneButtonUp.click(function() {
    console.log('UPT'+songNumber) 
    //updateTuneId(songNumber, (useSetting + 1) % ss.length)
  })
  wrongTuneButtonDown.click(function() { 
    console.log('DDT'+songNumber) 
    //updateTuneId(songNumber, (useSetting + 1) % ss.length)
  })
  var wrongTuneButton = $('<span style="margin-left: 2em; ">Wrong Tune ? ('+(sc.length + 1)+')</span>')
  wrongTuneButton.append(wrongTuneButtonUp)
  wrongTuneButton.append(wrongTuneButtonDown)
  
  var wrongSettingButtonUp = $('<button style="z-index: 50 ; font-size:0.8em; margin-left: 1em" class="actionbutton wrong-setting-up"  >⇧</button>')
  var wrongSettingButtonDown = $('<button style="z-index: 50 ; font-size:0.8em; margin-left: 1em" class="actionbutton wrong-setting-down"  >⇩</button>')
  wrongSettingButtonUp.click(function() {
    console.log("UUU S") //,useSetting + 1)
    updateTuneSetting(songNumber, (useSetting + 1) % ss.length)
  })
  wrongSettingButtonDown.click(function() {
    console.log("DDDS") //,(useSetting - 1 % ss.length))
    updateTuneSetting(songNumber, ((useSetting - 1) % ss.length))
  })
  var wrongSettingButton = $('<span style="margin-left: 2em; ">Setting ('+ (useSetting + 1) +'/' + (ss.length + 1) +')</span>')
  wrongSettingButton.append(wrongSettingButtonUp)
  wrongSettingButton.append(wrongSettingButtonDown)
  
  $("#controls_"+songNumber).remove()
  var controls = $('<div id="controls_'+songNumber+'" style="clear: both; " ></div>')
  controls.append(startButton)
  controls.append(stopButton)
  controls.append(wrongSettingButton)
  controls.append(wrongTuneButton)
  $(element).before(controls)
}

function addErrorControls(element, error) {
  //var startButton = $('<button style="class="actionbutton activate-audio" >Play</button>')
  //startButton.click(function() { $(".activate-audio").show(); $(this).hide(); $(".stop-audio").hide(); $(".stop-audio",$(this).parent()).show(); startPlaying(visualObj)})
  //var stopButton = $('<button style="display: none;" class="actionbutton stop-audio"  >Stop</button>')
  //stopButton.click(function() { $(this).hide(); $(".activate-audio",$(this).parent()).show(); stopPlaying()})
  //var wrongTuneButton = $('<button style="margin-left: 2em; " class="actionbutton wrong-tune"  >Wrong Tune ?</button>')
  //wrongTuneButton.click(function() { })
  //var wrongSettingButton = $('<button style="margin-left: 2em;" class="actionbutton wrong-setting"  >Wrong Setting ?</button>')
  //wrongSettingButton.click(function() {})
  
  var controls = $('<div style="clear: both; color: red;" >ERROR: '+error+'</div>')
  //controls.append(startButton)
  //controls.append(stopButton)
  //controls.append(wrongTuneButton)
  //controls.append(wrongSettingButton)
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
        millisecondsPerMeasure: visualObj.millisecondsPerMeasure()
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
