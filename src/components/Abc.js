import React, { useEffect, useState, useRef } from "react";
import abcjs from "abcjs";
import {Button } from 'react-bootstrap'
import useAbcTools from '../useAbcTools'
// TODO multiple clicks on play/stop then leaving state in playing results in multiple playback
import ReactNoSleep from 'react-no-sleep';
import AbcPlayButton from './AbcPlayButton'
//<AbcAudio  tunebook={props.tunebook} tempo={getTempo()} milliSecondsPerMeasure={(props.tunebook.abcTools.getMilliSecondsPerMeasure(tune, getTempo()))} >



                
export default function Abc(props) {
    const [abcTune, setAbcTune] = useState(props.abc);
    const [lastAbc, setLastAbc] = useState(null);
    const [lastTempo, setLastTempo] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false)
    //const [isWaiting, setIsWaiting] = useState(false)
    const [seekTo, setSeekTo] = useState(false)
    const [forceSeekTo, setForceSeekTo] = useState(false)
    const [ready, setReady] = useState(false)
    const [started, setStarted] = useState(false)
  
    const [renderTimeout, setRenderTimeout] = useState(null);
  
    var abcTools = useAbcTools()
    const inputEl = useRef(null);
    //console.log('ABC',props)
    
    var [midiBuffer, setMidiBuffer] = useState(null)
    var [visualObj, setVisualObj] = useState(null)
    var [timingCallbacks, setTimingCallbacks] = useState(null)
    var [cursor,setCursor] = useState(null)
    var [repeat,setRepeat] = useState(null)
    var [milliSecondsPerMeasure,setMilliSecondsPerMeasure] = useState(null)
    var [audioContext, setAudioContext] = useState(null)
    var [playCount, setPlayCount] = useState(0)

  function createCursor() {
    var svg = document.querySelector("#abc_music_viewer svg");
    cursor = document.createElementNS("http://www.w3.org/2000/svg", "line");
    cursor.setAttribute("class", "abcjs-cursor");
    cursor.setAttributeNS(null, 'x1', 0);
    cursor.setAttributeNS(null, 'y1', 0);
    cursor.setAttributeNS(null, 'x2', 0);
    cursor.setAttributeNS(null, 'y2', 0);
    svg.appendChild(cursor);
    setCursor(cursor)
    return cursor;
  }
  
  
  function beatCallback(currentBeat,totalBeats,lastMoment,position, debugInfo) {
    console.log('BC',currentBeat,totalBeats,lastMoment,position, debugInfo)
     // FINISHED PLAYBACK
     if (currentBeat === totalBeats) {
       console.log('end tune', playCount, props.repeat)
       if (parseInt(props.repeat) === -1) {
         setForceSeekTo(0)
       } else if (parseInt(props.repeat) === 0) {
         stopPlaying()
         if (props.onEnded) props.onEnded()
       } else if (parseInt(props.repeat) > 0 ) {
         if (playCount < props.repeat) {
           setForceSeekTo(0)
           setPlayCount(playCount + 1)
         } else {
            stopPlaying()
            if (props.onEnded) props.onEnded()
         }  
       } else {
          stopPlaying()
          if (props.onEnded) props.onEnded()
       }
      
     }
     
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
  
  function eventCallback(ev, midiBuffer) {
    if (!ev) {
      return;
    }
    console.log('evcb', ev.milliseconds, ev)
    if (midiBuffer && midiBuffer.duration > 0) {
      var newSeek = ev.milliseconds/(midiBuffer.duration * 1000)
      //console.log('UPDATE SEEK',newSeek)
      setForceSeekTo(newSeek)
    }
    colorElements(ev.elements);
  }



  
    function setForceStop(val) {
        localStorage.setItem('bookstorage_forcestop',(val ? 'true' : 'false'))
    }
    function getForceStop() {
        return localStorage.getItem('bookstorage_forcestop') === 'true' ? true : false
    }
    setForceStop(false)
  

  function startPrimedTune(midiBuffer) {
   var emergencyStop = getForceStop()
    if (!emergencyStop) {
      if (midiBuffer) {
          if (seekTo > 0) {
            midiBuffer.seek(seekTo)
            timingCallbacks.setProgress(seekTo)
          }
          midiBuffer.start()
          timingCallbacks.start()
      }
      console.log('started primed tune')
    } else {
      stopPlaying()
    }
  }

   
  function startPlaying() {
      setForceStop(false)
      if (audioContext && midiBuffer) {
          console.log('start ok - tune primed')
          startPrimedTune(midiBuffer)
      }
  }
    
  function stopPlaying()  {
    if (timingCallbacks) timingCallbacks.pause();
    if (midiBuffer) midiBuffer.pause();
    console.log('stop')
    setForceStop(true)
    setIsPlaying(false)
  }
  
  function finishPlaying() {
    console.log('finished')
  }
  
   
  function primeAudio() {
    return new Promise(function(resolve,reject) {
      if (audioContext) {
        resolve(audioContext)
      } else {
        var audioContext = null
        if (abcjs.synth.supportsAudio()) {
          window.AudioContext = window.AudioContext ||
            window.webkitAudioContext ||
            navigator.mozAudioContext ||
            navigator.msAudioContext;
          audioContext = new window.AudioContext();
          audioContext.resume().then(function () {
            resolve(audioContext)
          })
        } else {
          reject('No audio available')
        }
      }
    })
  }

  function primeTune(audioContext, visualObj, milliSecondsPerMeasure) {
    
      return new Promise(function(resolve,reject) {
          console.log('PRIME TUNE', audioContext, visualObj, milliSecondsPerMeasure)
          var midiBuffer
          if (!midiBuffer) {
             //console.log('STOP BUFFER')
              //midiBuffer.stop();
          //} else {
            console.log('CREATE BUFFER')
              midiBuffer = new abcjs.synth.CreateSynth()
          }
        
          if (visualObj) {
            console.log('startok')
            var count = 0
            
            
            var mpm = milliSecondsPerMeasure ? milliSecondsPerMeasure  : visualObj.millisecondsPerMeasure()
            var initOptions = {
              visualObj: visualObj,
              audioContext: audioContext,
              millisecondsPerMeasure:  mpm,
              //options: {
                //onEnded: onEnded
              //}
            }
            if (midiBuffer) {
                return midiBuffer.init(initOptions).then(function (response) {
                  console.log('prime tune init')
                    return midiBuffer.prime();
                }).then(function (response) {
                  console.log('prime tune inited')
                  resolve(midiBuffer)
                }).catch(function (error) {
                  console.warn("synth error", error);
                });
            } else {
                resolve(null)
            }
          } else {
              resolve(null)
          }
      })
  }
 
  function createPlayer(visualObj, tempo, meter) {
      var milliSecondsPerMeasure = getMilliSecondsPerMeasure(meter, tempo)
      return new Promise(function(resolve, reject) {
        console.log('CREATE PLAYER', visualObj)
            
        if (visualObj) {
            console.log('CREATE PLAYER HAVE VISUAL OBJ')
            primeAudio().then(function(audioContext) {
              console.log('CREATE PLAYER AUDIO PRIMED',audioContext)
                if (audioContext) {
                    
                    //console.log('tune update have audio context')
                    //setReady(false)
                    //renderActive = true
                    
                    primeTune(audioContext, visualObj, milliSecondsPerMeasure).then(function(midiBuffer) {
                        //renderActive = false
                        //setReady(true)
                        //console.log('PPI',midiBuffer)
                        var timingCallbacks = new abcjs.TimingCallbacks(visualObj, {
                          beatCallback: beatCallback,
                          eventCallback: function(ev) {eventCallback(ev,midiBuffer)},
                          qpm: tempo
                        })
                        var cursor = createCursor()
                        
                        console.log('CREATE PLAYER HAVE TIMING AND CURSOR', timingCallbacks, cursor) 
                        
                        console.log('CREATE PLAYER primed',audioContext, midiBuffer, timingCallbacks, cursor)
                        resolve([audioContext, midiBuffer, timingCallbacks, cursor, visualObj])
                    }).catch(function(e) {
                        console.log(e)
                        reject(e.message)
                    })
                }
            })
        } else reject('Missing rendered tune')
    })
  }
  
  
    var timer
    
    function clickPlay() {
        console.log('onClickHandler')
        if (timer) {
            clearTimeout(timer)
            timer = null
            //if (midiBuffer) midiBuffer.stop()
            //if (timingCallbacks) timingCallbacks.stop()
            setSeekTo(0)
            //setIsWaiting(true); 
            setIsPlaying(true);
        } else {
            timer = setTimeout(() => {
                clearTimeout(timer)
                timer = null
                //setIsWaiting(true); 
                setIsPlaying(true);
            }, 500)
        }
        
    };

    
    function getMilliSecondsPerMeasure(meter, tempo) {
         var meter = props.tunebook.abcTools.ensureText(meter, '4/4')
         var beats = props.tunebook.abcTools.getBeatsPerBar(meter) > 0 ? props.tunebook.abcTools.getBeatsPerBar(meter) : 4
         var useTempo = parseInt(tempo) > 0 ? parseInt(tempo) : 100
         console.log('MPM',60000/useTempo * beats, beats, meter, useTempo)
         return 60000/useTempo * beats
    }
  

  function clickListener(abcelem, tuneNumber, classes, analysis, drag, mouseEvent) {
    console.log('CLICK ELEM',drag)
    //function getMeasureNumber(abcNotes, line,lineMeasure) {
    //var tally = 0
    //var lines = abcNotes.split("\n")
    //var notes = abcjs.extractMeasures(abcNotes)
  //}
  //abcelem, tuneNumber, classes, analysis, drag, mouseEvent)
    ////  drag.index/drag.max, analysis, abcelem, 'M',midiBuffer,'T',timingCallbacks)
    var toProgress = drag.index/drag.max
    console.log('cclick',toProgress)
    //setSeekTo(toProgress)
    var notes = abcjs.extractMeasures(props.abc)
    console.log('notes',notes[0].measures, analysis.line, analysis.line, analysis.measure)
    ////var tally = notes.measures.map(function() 
    ////var measureNumber = analysis.line
    ////stopPlaying()
    //if (midiBuffer) {
      ////midiBuffer.pause();
      //midiBuffer.seek(toProgress);
    //}
    //if (timingCallbacks) {
      ////timingCallbacks.pause()
      //timingCallbacks.setProgress(toProgress)
    //}
  }
  
  
  function renderTune() {
    if (inputEl) { // && !renderActive) {
      console.log('RENDER TUNE')
      //console.log('render abc', abcTune, inputEl.current)
      var res = abcjs.renderAbc(inputEl.current, abcTune, {
        add_classes: true,
        responsive: "resize",
        generateDownload: true,
        synth: {
            el: "#audio"
        },
        //soundFontUrl: 'soundfont/'
        clickListener:clickListener,
        //selectTypes: true
      });
      var o = res && res.length > 0 ? res[0] : null
      console.log('RENDERED TUNE',o)
      if (o) {
          if (props.onWarnings) props.onWarnings(o.warnings)
          setReady(false)
          //props.audioProps.
          setVisualObj(o)
          createPlayer(o, props.tempo, props.meter).then(function(p) {
            //console.log("PP",p)
           var [audioContext, midiBuffer, timingCallbacks, cursor] = p
           assignStateOnCompletion(audioContext, midiBuffer, timingCallbacks, cursor, visualObj)
        })
      }
       //setSeekTo(0)
   }
  }
  
  
  function clickInit(playing) {
      console.log('CLICK INIT', visualObj)
      if (visualObj) {
        createPlayer(visualObj, props.tempo, props.meter).then(function(p) {
          var [audioContext, midiBuffer, timingCallbacks, cursor] = p
           assignStateOnCompletion(audioContext, midiBuffer, timingCallbacks, cursor, visualObj)
           if (playing) setIsPlaying(true)
        })
      }
  }
   
    function seekPlayerTo(seekTo) {
        console.log('seekPlayerTo',seekTo)
        if (midiBuffer) midiBuffer.seek(seekTo);
        if (timingCallbacks) timingCallbacks.setProgress(seekTo)
        
    }
    
    useEffect(() => {
        setSeekTo(forceSeekTo)
        seekPlayerTo(forceSeekTo)
    }, [forceSeekTo]);

    useEffect(() => {
        if (isPlaying) {
          startPlaying()
        } else {
          stopPlaying()
        }
    }, [isPlaying]); 

  
  function assignStateOnCompletion(audioContext, midiBuffer, timingCallbacks, cursor, visualObj) {
     console.log('assignStateOnCompletion',audioContext, midiBuffer, timingCallbacks, cursor, visualObj) 
     setAudioContext(audioContext)
     setMidiBuffer(midiBuffer)
     setTimingCallbacks(timingCallbacks)
     setCursor(cursor)
     setVisualObj(visualObj)
     setReady(true)
     setStarted(true)
  }
  
   // COMPONENT RENDER and UPDATE
  var renderActive = false 
  useEffect(() => {
    if (visualObj ===null || lastAbc != props.abc || props.tempo != lastTempo) {
      stopPlaying()
      // TODO if tempo is empty and current tune has tempo, set the tempo OTHERWISE per below
      console.log('ABC ELEM UPDATE', lastAbc ? lastAbc.length : 0,  props.abc ? props.abc.length : 0 ,props.tempo , lastTempo)
      setLastAbc(props.abc)
      setLastTempo(props.tempo)
      setAbcTune(props.abc);
      setSeekTo(0)
      setPlayCount(0)
      renderTune()
    }
   }, [props.abc, props.tempo])
 
   
  function bodyClick(enable) { 
    if (!started) {
      console.log('BODYCLICK')
      enable()
      clickInit()
    }
    setStarted(true)
  }

  return (
   <ReactNoSleep>
        {({ isOn, enable, disable }) => (
          <span onClick={function(e) {bodyClick(enable)}} >
             <span style={{float:'right'}} >
              <AbcPlayButton started={started} ready={ready} isPlaying={isPlaying} clickInit={function(e) {clickInit(true) }} clickPlay={clickPlay} clickStopPlaying={stopPlaying} tunebook={props.tunebook} />  
            </span>
            {audioContext && <input type="range" min='0' max='1' step='0.0001' value={seekTo} onChange={function(e) {setForceSeekTo(e.target.value)}}  style={{marginTop:'0.5em',marginBottom:'0.5em', width:'100%'}}/>}
           {(props.repeat > 1) && <Button style={{float:'right'}} variant="primary" >{props.tunebook.icons.timer2line} {(playCount + 1)}</Button>}
            <div id="abc_music_viewer" ref={inputEl}></div>
          </span>
        )}
    </ReactNoSleep>
  );
}
           
