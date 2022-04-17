
/** 
 * Update review list and current music rendering
 * Change display mode to review
 */
 //$('#reviewlist').val()
 //$('#reviewindex').val()
function review() {
  generateReviewList()
  renderReviewList()
  renderReviewMusic()
  showContentSection('review')
   $('#reviewlistwrapper').show()

  $('#reviewbuttons').show()
  $('#buttonblock').hide()
  $('.playblock').hide()
}

function generateReviewList() {
   //var songlist = $('#songlist').val().split("\n")
   var tunes = loadLocalObject('abc2book_tunes')
   //console.log('AB;E TUNES',tunes)
   var reviewable = {}
   var counter = 0
   Object.keys(tunes).map(function(tuneKey) {
     var tune = tunes[tuneKey]
     var boost = tune ? tune.boost : 0
     //getMetaValueFromSongline('B', songlist[tuneKey])
     
     if (boost > 0 && !hasPlayedInLast24Hours(tune.id)) {
       if (!Array.isArray(reviewable[boost]))  reviewable[boost] = []
       tune.songNumber = counter
       reviewable[boost].push(tune)
       counter++
     }
     return
   })
   Object.keys(reviewable).map(function(boost) {
     // randomise from this boost band
     shuffleArray(reviewable[boost])
     return
   })
   
   //console.log('AB;E',reviewable)
   $('#reviewlist').val(JSON.stringify(reviewable))
   $('#reviewindex').val(0)
   return reviewable
}


function renderReviewList() {
  var reviewList = getReviewListFromDOM()
  if (Object.keys(reviewList).length === 0) {
   //alert('You have seen all your boosted tunes in the last 24 hours.')
   $('#reviewlist').html('')
   $('#reviewmusic').html('<b  >You have seen all your boosted tunes in the last 24 hours.</b>')
  } else {
    //console.log('render',reviewList)
    var tuneList = $('<ul class="list-group" ></ul>')
    var counter = 0
    var searchFor = $('#reviewsearchinput').val().trim().toLowerCase()
    Object.keys(reviewList).map(function(boost) {
      var tunes = reviewList[boost]
      if (Array.isArray(tunes)) {
        tunes.map(function(tune) {
          //console.log('renderT',tune)
          if ((searchFor.length === 0) || (getTuneName(tune).toLowerCase().indexOf(searchFor) !== -1)) {
            tuneList.append($('<li class="list-group-item" onClick="setReviewItem('+counter+')"  >'+getTuneName(tune)+'</li>'))
          }
          counter++
        })
      }
      return
    })
    $('#reviewlist').html('')
    $('#reviewlist').append(tuneList)
  }
}


function setReviewItem(index) {
  //console.log('set reviewindex',index)
  $('#reviewindex').val(index)
  renderReviewMusic() 
}

function previousReviewItem() {
  var reviewList = getReviewListFromDOM()
  var nextIndex= ($('#reviewindex').val() > 0) ? (parseInt($('#reviewindex').val()) - 1).mod(Object.keys(reviewList).length) : 0
  $('#reviewindex').val(nextIndex)
  //console.log('prev',nextIndex,$('#reviewindex').val(), reviewList)
  renderReviewMusic() 
}

function nextReviewItem() {
  var reviewList = getReviewListFromDOM()
  var reviewItemCount = 0
  Object.values(reviewList).map(function(items) {
    reviewItemCount+= items.length
  })
  var nextIndex= ($('#reviewindex').val() > 0) ? (parseInt($('#reviewindex').val()) + 1) : 1  
  if (nextIndex >= reviewItemCount) {
    
  } else {
    $('#reviewindex').val(nextIndex)
    //console.log('next',nextIndex,$('#reviewindex').val(), reviewList)
    renderReviewMusic() 
  }
}

function getCurrentReviewTune() {
  var tuneIndex = $('#reviewindex').val() > 0 ? (parseInt($('#reviewindex').val())) : 0
  var tune = getTuneFromReviewList(tuneIndex)
  console.log('get current',tuneIndex, tune)
  return tune
}

function getTuneFromReviewList(tuneIndex) {
  var reviewList = getReviewListFromDOM()
  if (Object.keys(reviewList).length === 0) {
    return null
  }
  //console.log('GET tune for revilist',reviewList, tuneIndex)
  //console.log(reviewList)
  var reviewIndex = 0
  var found = {}
  Object.keys(reviewList).map(function(boost) {
    reviewList[boost].map(function(tune) {
        //console.log('gpot tune for revilist',boost,tune,reviewIndex, tuneIndex)
        if (reviewIndex == tuneIndex) {
            console.log('gpot tune for revilist FOUND',reviewList[boost][tune], tune)
          found = tune
        }
        reviewIndex++
        
    })
  })
  return found
}
function showReviewList() {
  renderReviewList()
  $('#reviewlistwrapper').show()
}

function startReview() {
  //console.log('start review')
  playCurrentSong()
}


function renderBoostButtons(songNumber, boost) {
  return $(`<div id="reviewboostbuttons" style="float: right; margin-right: 0.5em" ><svg role="img" version="1.1" id="Capa_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px"
	 viewBox="0 0 463 463" height="24px" width="24px" style="enable-background:new 0 0 463 463;" xml:space="preserve">
   <title>Review</title>
<g>
	<path d="M151.245,222.446C148.054,237.039,135.036,248,119.5,248c-4.142,0-7.5,3.357-7.5,7.5s3.358,7.5,7.5,7.5
		c23.774,0,43.522-17.557,46.966-40.386c14.556-1.574,27.993-8.06,38.395-18.677c2.899-2.959,2.85-7.708-0.109-10.606
		c-2.958-2.897-7.707-2.851-10.606,0.108C184.947,202.829,172.643,208,159.5,208c-26.743,0-48.5-21.757-48.5-48.5
		c0-4.143-3.358-7.5-7.5-7.5s-7.5,3.357-7.5,7.5C96,191.715,120.119,218.384,151.245,222.446z"/>
	<path d="M183,287.5c0-4.143-3.358-7.5-7.5-7.5c-35.014,0-63.5,28.486-63.5,63.5c0,0.362,0.013,0.725,0.019,1.088
		C109.23,344.212,106.39,344,103.5,344c-4.142,0-7.5,3.357-7.5,7.5s3.358,7.5,7.5,7.5c26.743,0,48.5,21.757,48.5,48.5
		c0,4.143,3.358,7.5,7.5,7.5s7.5-3.357,7.5-7.5c0-26.611-16.462-49.437-39.731-58.867c-0.178-1.699-0.269-3.418-0.269-5.133
		c0-26.743,21.757-48.5,48.5-48.5C179.642,295,183,291.643,183,287.5z"/>
	<path d="M439,223.5c0-17.075-6.82-33.256-18.875-45.156c1.909-6.108,2.875-12.426,2.875-18.844
		c0-30.874-22.152-56.659-51.394-62.329C373.841,91.6,375,85.628,375,79.5c0-19.557-11.883-36.387-28.806-43.661
		C317.999,13.383,287.162,0,263.5,0c-13.153,0-24.817,6.468-32,16.384C224.317,6.468,212.653,0,199.5,0
		c-23.662,0-54.499,13.383-82.694,35.839C99.883,43.113,88,59.943,88,79.5c0,6.128,1.159,12.1,3.394,17.671
		C62.152,102.841,40,128.626,40,159.5c0,6.418,0.965,12.735,2.875,18.844C30.82,190.244,24,206.425,24,223.5
		c0,13.348,4.149,25.741,11.213,35.975C27.872,270.087,24,282.466,24,295.5c0,23.088,12.587,44.242,32.516,55.396
		C56.173,353.748,56,356.626,56,359.5c0,31.144,20.315,58.679,49.79,68.063C118.611,449.505,141.965,463,167.5,463
		c27.995,0,52.269-16.181,64-39.674c11.731,23.493,36.005,39.674,64,39.674c25.535,0,48.889-13.495,61.71-35.437
		c29.475-9.385,49.79-36.92,49.79-68.063c0-2.874-0.173-5.752-0.516-8.604C426.413,339.742,439,318.588,439,295.5
		c0-13.034-3.872-25.413-11.213-36.025C434.851,249.241,439,236.848,439,223.5z M167.5,448c-21.029,0-40.191-11.594-50.009-30.256
		c-0.973-1.849-2.671-3.208-4.688-3.751C88.19,407.369,71,384.961,71,359.5c0-3.81,0.384-7.626,1.141-11.344
		c0.702-3.447-1.087-6.92-4.302-8.35C50.32,332.018,39,314.626,39,295.5c0-8.699,2.256-17.014,6.561-24.379
		C56.757,280.992,71.436,287,87.5,287c4.142,0,7.5-3.357,7.5-7.5s-3.358-7.5-7.5-7.5C60.757,272,39,250.243,39,223.5
		c0-14.396,6.352-27.964,17.428-37.221c2.5-2.09,3.365-5.555,2.14-8.574C56.2,171.869,55,165.744,55,159.5
		c0-26.743,21.757-48.5,48.5-48.5s48.5,21.757,48.5,48.5c0,4.143,3.358,7.5,7.5,7.5s7.5-3.357,7.5-7.5
		c0-33.642-26.302-61.243-59.421-63.355C104.577,91.127,103,85.421,103,79.5c0-13.369,8.116-24.875,19.678-29.859
		c0.447-0.133,0.885-0.307,1.308-0.527C127.568,47.752,131.447,47,135.5,47c12.557,0,23.767,7.021,29.256,18.325
		c1.81,3.727,6.298,5.281,10.023,3.47c3.726-1.809,5.28-6.296,3.47-10.022c-6.266-12.903-18.125-22.177-31.782-25.462
		C165.609,21.631,184.454,15,199.5,15c13.509,0,24.5,10.99,24.5,24.5v97.051c-6.739-5.346-15.25-8.551-24.5-8.551
		c-4.142,0-7.5,3.357-7.5,7.5s3.358,7.5,7.5,7.5c13.509,0,24.5,10.99,24.5,24.5v180.279c-9.325-12.031-22.471-21.111-37.935-25.266
		c-3.999-1.071-8.114,1.297-9.189,5.297c-1.075,4.001,1.297,8.115,5.297,9.189C206.8,343.616,224,366.027,224,391.5
		C224,422.654,198.654,448,167.5,448z M395.161,339.807c-3.215,1.43-5.004,4.902-4.302,8.35c0.757,3.718,1.141,7.534,1.141,11.344
		c0,25.461-17.19,47.869-41.803,54.493c-2.017,0.543-3.716,1.902-4.688,3.751C335.691,436.406,316.529,448,295.5,448
		c-31.154,0-56.5-25.346-56.5-56.5c0-2.109-0.098-4.2-0.281-6.271c0.178-0.641,0.281-1.314,0.281-2.012V135.5
		c0-13.51,10.991-24.5,24.5-24.5c4.142,0,7.5-3.357,7.5-7.5s-3.358-7.5-7.5-7.5c-9.25,0-17.761,3.205-24.5,8.551V39.5
		c0-13.51,10.991-24.5,24.5-24.5c15.046,0,33.891,6.631,53.033,18.311c-13.657,3.284-25.516,12.559-31.782,25.462
		c-1.81,3.727-0.256,8.214,3.47,10.022c3.726,1.81,8.213,0.257,10.023-3.47C303.733,54.021,314.943,47,327.5,47
		c4.053,0,7.933,0.752,11.514,2.114c0.422,0.22,0.86,0.393,1.305,0.526C351.883,54.624,360,66.13,360,79.5
		c0,5.921-1.577,11.627-4.579,16.645C322.302,98.257,296,125.858,296,159.5c0,4.143,3.358,7.5,7.5,7.5s7.5-3.357,7.5-7.5
		c0-26.743,21.757-48.5,48.5-48.5s48.5,21.757,48.5,48.5c0,6.244-1.2,12.369-3.567,18.205c-1.225,3.02-0.36,6.484,2.14,8.574
		C417.648,195.536,424,209.104,424,223.5c0,26.743-21.757,48.5-48.5,48.5c-4.142,0-7.5,3.357-7.5,7.5s3.358,7.5,7.5,7.5
		c16.064,0,30.743-6.008,41.939-15.879c4.306,7.365,6.561,15.68,6.561,24.379C424,314.626,412.68,332.018,395.161,339.807z"/>
	<path d="M359.5,240c-15.536,0-28.554-10.961-31.745-25.554C358.881,210.384,383,183.715,383,151.5c0-4.143-3.358-7.5-7.5-7.5
		s-7.5,3.357-7.5,7.5c0,26.743-21.757,48.5-48.5,48.5c-13.143,0-25.447-5.171-34.646-14.561c-2.898-2.958-7.647-3.007-10.606-0.108
		s-3.008,7.647-0.109,10.606c10.402,10.617,23.839,17.103,38.395,18.677C315.978,237.443,335.726,255,359.5,255
		c4.142,0,7.5-3.357,7.5-7.5S363.642,240,359.5,240z"/>
	<path d="M335.5,328c-2.89,0-5.73,0.212-8.519,0.588c0.006-0.363,0.019-0.726,0.019-1.088c0-35.014-28.486-63.5-63.5-63.5
		c-4.142,0-7.5,3.357-7.5,7.5s3.358,7.5,7.5,7.5c26.743,0,48.5,21.757,48.5,48.5c0,1.714-0.091,3.434-0.269,5.133
		C288.462,342.063,272,364.889,272,391.5c0,4.143,3.358,7.5,7.5,7.5s7.5-3.357,7.5-7.5c0-26.743,21.757-48.5,48.5-48.5
		c4.142,0,7.5-3.357,7.5-7.5S339.642,328,335.5,328z"/>
</g>
</svg> (<span id="tune_boost_`+songNumber+`" >`+boost+`</span>)    
  <button id="review_tune_boost_up" ><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"  class="button"><path fill="none" d="M0 0h24v24H0z"/><path d="M13 7.828V20h-2V7.828l-5.364 5.364-1.414-1.414L12 4l7.778 7.778-1.414 1.414L13 7.828z"/></svg></button>
  <button  id="review_tune_boost_down" ><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"  class="button"><path fill="none" d="M0 0h24v24H0z"/><path d="M13 16.172l5.364-5.364 1.414 1.414L12 20l-7.778-7.778 1.414-1.414L11 16.172V4h2v12.172z"/></svg></button>  
  </div>`)
  
}













var reviewMidiBuffer = new ABCJS.synth.CreateSynth();
    
function playCurrentSong(skipVoice = false)  {
  console.log('PLAY REVIEW SONG')
  //$('#reviewplaycounter').val(0)
  $('#reviewplayallbutton').hide()
  $('#reviewstopallbutton').show()
  $('#reviewforcestop').val('')
  var tune = getCurrentReviewTune()
  if (tune ) {
    if ($('#reviewforcestop').val() !== "true") {
      if (!skipVoice) speak(getTuneName(tune), {speed: 140, amplitude: 120} )
      setTimeout(function() {
        if ($('#reviewforcestop').val() !== "true") {
          reviewStartPlaying(reviewRenderResult, tune)
        }
      }, 1200)
    }
  }
} 
function reviewFinishPlaying() {
  console.log('FINISH')
      if ($('#reviewforcestop').val() !== "true") {
        // start next track after delay to avoid double callback
        console.log('review next PLAY ')
        //if ($('#reviewplaycounter').val() > 2) {
          var tune = getCurrentReviewTune()
          
          // auto increment boost when finished playing in review
          if ($('#reviewplaycounter').val() > 1) {
            if (tune ) {
              progressUp(tune.songNumber)
              saveLastPlayed(tune.id)
            }

            $('#reviewplaycounter').val(0)
            nextReviewItem()
            if ($('#reviewforcestop').val() !== "true") {
              playCurrentSong()
            }

          } else {
            var nextCount = parseInt($('#reviewplaycounter').val()) > 0 ? parseInt($('#reviewplaycounter').val()) + 1 : 1
            //console.log('under', nextCount)
            $('#reviewplaycounter').val(nextCount)
            if ($('#reviewforcestop').val() !== "true") {
              playCurrentSong(true)
            }

          }
          
        //} else {
          //$('#reviewplaycounter').val(parseInt($('#reviewplaycounter').val()) + 1)
          //playCurrentSong()
        //}
        //var sp = $('#songlist').val().split("\n")
        //if (songNumber < sp.length) {
          //playSongNumber(parseInt(songNumber) + 1)
          //scrollTo('controls_'+songNumber)
        //} else {
          //reviewStopPlaying()
        //}
      } else {
        $('#reviewforcestop').val('')
        reviewStopPlaying()
      }
}

  
function reviewStartPlaying(visualObj, tune) {
  //var songlist = $('#songlist').val().split("\n")
  //var boost = getMetaValueFromSongline("B",songlist[tune.songNumber])
  if (!reviewMidiBuffer) reviewMidiBuffer = new ABCJS.synth.CreateSynth();
  if (ABCJS.synth.supportsAudio()) {
    window.AudioContext = window.AudioContext ||
      window.webkitAudioContext ||
      navigator.mozAudioContext ||
      navigator.msAudioContext;
    var audioContext = new window.AudioContext();
    audioContext.resume().then(function () {
      if (reviewMidiBuffer) {
        reviewMidiBuffer.stop();
      }
      // reviewMidiBuffer.init preloads and caches all the notes needed. There may be significant network traffic here.
      // HACK onEnded is called twice so skip first invocation
      var count = 0
      var onEnded = function(d) {
        console.log('ONENDED')
        count = count + 1;
        // TODO USE THIS HOOK TO START NEXT TRACK IF PLAY ALL trackId IS ACTIVE
        //if (count > 1) {
          reviewFinishPlaying()
          onEnded = null
        //}
      }
      var initOptions = {
        visualObj: visualObj,
        audioContext: audioContext,
        millisecondsPerMeasure: getMillisecondsPerMeasure(tune), //visualObj.millisecondsPerMeasure(),
        //debugCallback: function(d) {
          //console.log('DC',d)
        //},
        options: {
          onEnded: onEnded
        }
      }
      
      // rough first cut assume 4 beats per bar   
      // millisecondsPerBeat = 60000/bpm
      //initOptions.millisecondsPerMeasure = getMillisecondsPerMeasure(tune)
      return reviewMidiBuffer.init(initOptions).then(function (response) {
        // reviewMidiBuffer.prime actually builds the output buffer.
        return reviewMidiBuffer.prime();
      }).then(function (response) {
        // At this point, everything slow has happened. reviewMidiBuffer.start will return very quickly and will start playing very quickly without lag.
        reviewMidiBuffer.start();
        //reviewMidiBuffer.seek(0.8);
        if (startPlayingHook) startPlayingHook()
         return Promise.resolve();
       
      }).catch(function (error) {
          console.warn("synth error", error);
      });
    });
  }
}

function getBeatsPerBar(meter) {
  switch (meter) {
    case '4/4':
      return 4
    case '3/4':
      return 3
    case '2/4':
      return 2
    case '6/8':
      return 2
    case '9/4':
      return 3
    case '12/8':
      return 4
    case '3/2':
      return 3
  }
  return 4
}

function getMillisecondsPerMeasure(tune) {
   var meter = ensureText(getTuneMeter(tune), '4/4')
   //meter = timeSignatureFromTuneType(tune.type)
   var beats = getBeatsPerBar(meter)
   var tempo = getTempo(tune) 
   console.log('beats',beats, meter, tempo, tune)
   return 60000/tempo * beats
}

function getMillisecondsPerMeasureForTempo(tempo, tune) {
   var meter = ensureText(getTuneMeter(tune), '4/4')
   //meter = timeSignatureFromTuneType(tune.type)
   var beats = getBeatsPerBar(meter)
   console.log('beats',beats, meter, tempo, tune)
   return 60000/tempo * beats
}

function getTempo(tune) {
  if (tune) {
    var boost = tune.boost > 0 ? tune.boost : 0
    var useBoost = boost > 20 ? 20 : boost
    //Math.min(boost,50)
    var tempo = 30 + useBoost * 5
    //tempo+= 300 // testing
      
    return tempo;
  } else {
    return 100
  }
}
  
function reviewStopPlaying() {
  if (stopPlayingHook) stopPlayingHook()
  stopPlaying
  if (reviewMidiBuffer) reviewMidiBuffer.stop();
  $('#reviewplayallbutton').show()
  $('#reviewstopallbutton').hide()
  $('#reviewforcestop').val('true')
  reviewMidiBuffer = null
}  





var reviewRenderResult=null
var stopPlayingHook = null
var startsPlayingHook = null
var timingCallbacks = null
function renderReviewMusic() {
  var tune = getCurrentReviewTune()
  if (tune) {
    console.log('REND MUSIC',tune)
    var abc = json2abc(tune.songNumber, tune) 
    var renderResultSingle = window.ABCJS.renderAbc(['reviewmusic'], abc , getMainRendererSettings());
    renderResultSingle.map(function(rr,rk) {
      reviewRenderResult=rr
      $('#reviewboostbuttons').remove()
      var boost = tune.boost > 0 ? tune.boost : 0
      $('#reviewmusic').before(renderBoostButtons(tune.songNumber,boost))
      $('#review_tune_boost_up').click(function() {
         progressUp(tune.songNumber )
      })
      $('#review_tune_boost_down').click(function() {
        progressDown(tune.songNumber )
      })
      
      // ANIMATED CURSOR
      // TODO - the following nearly works
      // need to set qpm accurately using M and L values to 
      
      timingCallbacks = new ABCJS.TimingCallbacks(reviewRenderResult, {
        beatCallback: beatCallback,
        eventCallback: eventCallback,
        qpm: getTempo(tune)
      });

      function createCursor() {
        var svg = document.querySelector("#reviewmusic svg");
        var cursor = document.createElementNS("http://www.w3.org/2000/svg", "line");
        cursor.setAttribute("class", "abcjs-cursor");
        cursor.setAttributeNS(null, 'x1', 0);
        cursor.setAttributeNS(null, 'y1', 0);
        cursor.setAttributeNS(null, 'x2', 0);
        cursor.setAttributeNS(null, 'y2', 0);
        svg.appendChild(cursor);
        return cursor;
      }
      var cursor = createCursor();
      stopPlayingHook = function() {
        timingCallbacks.stop();
      }
      
      startPlayingHook = function() {
        timingCallbacks.start();
      }

      function beatCallback(currentBeat,totalBeats,lastMoment,position, debugInfo) {
        var x1, x2, y1, y2;
        if (currentBeat === totalBeats) {
          x1 = 0;
          x2 = 0;
          y1 = 0;
          y2 = 0;
        } else {
          x1 = position.left - 2;
          x2 = position.left - 2;
          y1 = position.top;
          y2 = position.top + position.height;
        }
        cursor.setAttribute("x1", x1);
        cursor.setAttribute("x2", x2);
        cursor.setAttribute("y1", y1);
        cursor.setAttribute("y2", y2);
        colorElements([]);
      }
      var lastEls = [];
      function colorElements(els) {
        var i;
        var j;
        for (i = 0; i < lastEls.length; i++) {
          for (j = 0; j < lastEls[i].length; j++) {
            lastEls[i][j].classList.remove("color");
          }
        }
        for (i = 0; i < els.length; i++) {
          for (j = 0; j < els[i].length; j++) {
            els[i][j].classList.add("color");
          }
        }
        lastEls = els;
      }
      function eventCallback(ev) {
        if (!ev) {
          return;
        }
        colorElements(ev.elements);
      }
    })
    $('.abcjs-rhythm tspan').attr('y','20')
  }
}
