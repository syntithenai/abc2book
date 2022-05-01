import React, { useEffect, useState, useRef } from "react";
import abcjs from "abcjs";
import {Button } from 'react-bootstrap'
import useAbcTools from '../useAbcTools'
// TODO multiple clicks on play/stop then leaving state in playing results in multiple playback
import ReactNoSleep from 'react-no-sleep';

export default function Abc({ abc, isPlaying, audioCallback, repeat, tempo, milliSecondsPerMeasure}) {
  const [abcTune, setAbcTune] = useState(abc);
  var abcTools = useAbcTools()
  function setForceStop(val) {
    localStorage.setItem('bookstorage_forcestop',(val ? 'true' : 'false'))
  }
  function getForceStop() {
    return localStorage.getItem('bookstorage_forcestop') === 'true' ? true : false
  }
  setForceStop(false)
  
  const inputEl = useRef(null);
  var [midiBuffer, setMidiBuffer] = useState(null)
  var [visualObj, setVisualObj] = useState(null)
  var [timingCallbacks, setTimingCallbacks] = useState(null)
  
  function startPlaying() {
    if (midiBuffer) midiBuffer.stop();
    setMidiBuffer(null)
              
    if (audioCallback) audioCallback('start')
    setForceStop(false)
    if (visualObj) {
      if (audioCallback) audioCallback('startok')
      
      if (!midiBuffer) {
        midiBuffer = new abcjs.synth.CreateSynth()
        setMidiBuffer(midiBuffer)
      }
      if (abcjs.synth.supportsAudio()) {
        if (audioCallback) audioCallback('startokaudio')
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
          
          var count = 0
          var onEnded = function(d) {
            if (audioCallback) audioCallback('ended')
            if (repeat) {
              midiBuffer.seek(0);
              startPlaying()
            } else {
              // HACK onEnded is called twice so skip first invocation
              //count = count + 1;
              // TODO USE THIS HOOK TO START NEXT TRACK IF PLAY ALL trackId IS ACTIVE
              //if (count > 1) {
                finishPlaying()
                onEnded = null
              //}
            }
            
          }
          var mpm = milliSecondsPerMeasure ? milliSecondsPerMeasure  : visualObj.millisecondsPerMeasure()
          var initOptions = {
            visualObj: visualObj,
            audioContext: audioContext,
            millisecondsPerMeasure:  mpm,
            options: {
              onEnded: onEnded
            }
          }
          return midiBuffer.init(initOptions).then(function (response) {
            if (audioCallback) audioCallback('init')
            // midiBuffer.prime actually builds the output buffer.
              return midiBuffer.prime();
          }).then(function (response) {
            if (audioCallback) audioCallback('ready')
            // At this point, everything slow has happened. midiBuffer.start will return very quickly and will start playing very quickly without lag.
            var emergencyStop = getForceStop()
            if (!emergencyStop) {
              midiBuffer.start();
              startPlayingHook()
              if (audioCallback) audioCallback('started')
            } else {
              stopPlaying()
            }
            //midiBuffer.seek(0.9);
            
            return Promise.resolve();
          }).catch(function (error) {
            if (audioCallback) audioCallback('error')
              console.warn("synth error", error);
          });
        });
      }
    }
  }
    
  function stopPlaying()  {
    stopPlayingHook()
    if (midiBuffer) midiBuffer.stop();
    if (audioCallback) audioCallback('stop')
    setMidiBuffer(null)
    setForceStop(true)
  }
  
  function finishPlaying() {
    
  }
  
  function getTempo() {
    return 120
  }
  
  // ANIMATED CURSOR
  var timingCallbacks
  var cursor
  
  function createCursor() {
    var svg = document.querySelector("#abc_music_viewer svg");
    cursor = document.createElementNS("http://www.w3.org/2000/svg", "line");
    cursor.setAttribute("class", "abcjs-cursor");
    cursor.setAttributeNS(null, 'x1', 0);
    cursor.setAttributeNS(null, 'y1', 0);
    cursor.setAttributeNS(null, 'x2', 0);
    cursor.setAttributeNS(null, 'y2', 0);
    svg.appendChild(cursor);
    return cursor;
  }
  var stopPlayingHook = function() {
    if (timingCallbacks) timingCallbacks.stop();
  }
  
  var startPlayingHook = function() {
    if (timingCallbacks)  timingCallbacks.start();
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

  
   // COMPONENT RENDER and UPDATE
    
  useEffect(() => {
    if (inputEl) {
      var res = abcjs.renderAbc(inputEl.current, abcTune, {
        add_classes: true,
        responsive: "resize",
        generateDownload: true,
        synth: {
            el: "#audio"
        }
      });
      var o = res && res.length > 0 ? res[0] : null
      setVisualObj(o)
      if (o) {
        setTimingCallbacks(new abcjs.TimingCallbacks(o, {
          beatCallback: beatCallback,
          eventCallback: eventCallback,
          //qpm: getTempo()
        }));
        var cursor = createCursor();
      }
      
   }}, [abcTune]);

  useEffect(() => {
    setAbcTune(abc);
  }, [abc]);
  
  useEffect(() => {
    if (isPlaying) {
      startPlaying()
    } else {
      stopPlaying()
    }
  }, [isPlaying]); 

  return (
   <ReactNoSleep>
        {({ isOn, enable, disable }) => (
          <div onClick={function(e) {console.log('nosleep active'); enable()}}>
            <div id="abc_music_viewer" ref={inputEl}></div>
          </div>
        )}
    </ReactNoSleep>
  );
}
