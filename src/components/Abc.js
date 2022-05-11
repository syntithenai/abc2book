import React, { useEffect, useState, useRef } from "react";
import abcjs from "abcjs";
import {Button } from 'react-bootstrap'
import useAbcTools from '../useAbcTools'
// TODO multiple clicks on play/stop then leaving state in playing results in multiple playback
import ReactNoSleep from 'react-no-sleep';
import AbcPlayButton from './AbcPlayButton'
//<AbcAudio  tunebook={props.tunebook} tempo={getTempo()} milliSecondsPerMeasure={(props.tunebook.abcTools.getMilliSecondsPerMeasure(tune, getTempo()))} >
//import workerize from 'workerize'
  
//import { create, all } from 'mathjs'

//const config = { }
//const math = create(all, config)

//console.log(math)
//math.add(math.bignumber(0.1), math.bignumber(0.2))     // BigNumber, 0.3
//math.divide(math.bignumber(0.3), math.bignumber(0.2))
                
export default function Abc(props) {
    const [abcTune, setAbcTune] = useState(props.abc);
    const [lastAbc, setLastAbc] = useState(null);
    const [lastTempo, setLastTempo] = useState(null);
    const [isPlaying, setIsPlayingInner] = useState(false)
    const isPlayingRef = useRef(false)
    // keep a copy as a ref to be available for lookup in callbacks
    function setIsPlaying(val) {
      isPlayingRef.current = val
      setIsPlayingInner(val)
    }
    //const [isWaiting, setIsWaiting] = useState(false)
    const [seekTo, setSeekTo] = useState(false)
    const [forceSeekTo, setForceSeekTo] = useState(false)
    const [ready, setReady] = useState(false)
    const [started, setStarted] = useState(false)
  
    const [renderTimeout, setRenderTimeout] = useState(null);
  
    var abcTools = useAbcTools()
    const inputEl = useRef(null);
    //console.log('ABC',props)
    
    var tune = props.tunebook.abcTools.abc2json(props.abc)
    //console.log('ABC',tune)
   
    //var [audioContext, setAudioContext] = useState(null)
    //var [midiBuffer, setMidiBuffer] = useState(null)
    //var [visualObj, setVisualObj] = useState(null)
    //var [timingCallbacks, setTimingCallbacks] = useState(null)
    //var [cursor,setCursor] = useState(null)
    
    var gaudioContext = useRef(null)
    var gmidiBuffer = useRef(null)
    var gvisualObj = useRef(null)
    var gtimingCallbacks = useRef(null)
    var gcursor = useRef(null)
    function setAudioContext(v) {
      gaudioContext.current = v
    }
    function setMidiBuffer(v) {
      gmidiBuffer.current = v
    }
    function setVisualObj(v) {
      gvisualObj.current = v
    }
    function setTimingCallbacks(v) {
      gtimingCallbacks.current = v
    }
    function setCursor(v) {
      gcursor.current = v
    }
    
    
  
  function assignStateOnCompletion(audioContext, midiBuffer, timingCallbacks, cursor) {
     console.log('assignStateOnCompletion',audioContext, midiBuffer, timingCallbacks, cursor) 
     setAudioContext(audioContext)
     setMidiBuffer(midiBuffer)
     setTimingCallbacks(timingCallbacks)
     setCursor(cursor)
     setReady(true)
     //setStarted(true)
  }
  
    var [repeat,setRepeat] = useState(null)
    var [milliSecondsPerMeasure,setMilliSecondsPerMeasure] = useState(null)
    var [playCount, setPlayCount] = useState(0)

  function createCursor() {
    var svg = document.querySelector("#abc_music_viewer svg");
    var cursor = document.createElementNS("http://www.w3.org/2000/svg", "line");
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
     // FINISHED PLAYBACK
     function restart() {
       console.log('restart')
       stopPlaying()
       startPlaying()
        //if (midiBuffer) {
           //midiBuffer.stop()
           //midiBuffer.start()
           //if (timingCallbacks) timingCallbacks.reset()
        //}
     }
     if (currentBeat === totalBeats) {
       console.log('end tune', playCount, props.repeat)
       if (parseInt(props.repeat) === -1) {
         restart()
       } else if (parseInt(props.repeat) === 0) {
         stopPlaying()
         if (props.onEnded) props.onEnded()
       } else if (parseInt(props.repeat) > 0 ) {
         if (playCount < props.repeat) {
           restart()
           //setForceSeekTo(0)
           //if (timingCallbacks) timingCallbacks.stop()
           //var timingCallbacks = new abcjs.TimingCallbacks(visualObj, {
              //beatCallback: beatCallback,
              //eventCallback: function(ev) {eventCallback(ev,midiBuffer)},
              //qpm: props.tempo,
              //lineEndCallback	: function() {
                //global.window.scrollBy(0,90)
              //},
              //lineEndAnticipation: 500
            //})
           //setTimingCallbacks(timingCallbacks)
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
      if (gcursor && gcursor.current) {
        gcursor.current.setAttribute("x1", x1);
        gcursor.current.setAttribute("x2", x2);
        gcursor.current.setAttribute("y1", y1);
        gcursor.current.setAttribute("y2", y2);
      }
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
    //console.log('evcb', ev.milliseconds, ev)
    if (gmidiBuffer && gmidiBuffer.current && gmidiBuffer.current.duration > 0) {
      var newSeek = ev.milliseconds/(gmidiBuffer.current.duration * 1000)
      //console.log('UPDATE SEEK',newSeek)
      setSeekTo(newSeek)
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
      if (gtimingCallbacks && gtimingCallbacks.current && gmidiBuffer && gmidiBuffer.current) {
          if (seekTo > 0) {
            gmidiBuffer.current.seek(seekTo)
            gtimingCallbacks.current.setProgress(seekTo)
          }
          gmidiBuffer.current.start()
          gtimingCallbacks.current.start()
      }
      //console.log('started primed tune')
    } else {
      stopPlaying()
    }
  }

   
  function startPlaying() {
      console.log(gaudioContext,gmidiBuffer,gvisualObj,gtimingCallbacks,gcursor)
      setForceStop(false)
      //if (audioContext.current && midiBuffer.current) {
          ////console.log('start ok - tune primed')
      startPrimedTune()
      //}
  }
    
  function stopPlaying()  {
    console.log(gaudioContext,gmidiBuffer,gvisualObj,gtimingCallbacks,gcursor)
    if (gtimingCallbacks && gtimingCallbacks.current) gtimingCallbacks.current.pause();
    if (gmidiBuffer && gmidiBuffer.current) gmidiBuffer.current.pause();
    //console.log('stopPlaying')
    setForceStop(true)
    setIsPlaying(false)
  }
  
  function finishPlaying() {
    //console.log('finished')
  }
  
   
  function primeAudio() {
    console.log('PRIMAUDIO')
    return new Promise(function(resolve,reject) {
      //if (audioContext) {
        //console.log('PRIMAUDIO REUSE')
        ////resolve(audioContext)
      //} e lse {
        //console.log('PRIMAUDIO in')
        var audioContext = null
        if (abcjs.synth.supportsAudio()) {
          //console.log('PRIMAUDIO support ok')
          window.AudioContext = window.AudioContext ||
            window.webkitAudioContext ||
            navigator.mozAudioContext ||
            navigator.msAudioContext;
          audioContext = new window.AudioContext();
          //console.log('PRIMAUDIO ac', audioContext)
          //audioContext.resume().then(function () {
            //console.log('PRIMAUDIO resume')
            resolve(audioContext)
          //}).catch(function(e) {
             //reject('Failed to resume')
          //})
        } else {
          //console.log('PRIMAUDIO REJECT')
          reject('No audio available')
        }
      //}
    })
  }

  function primeTune(audioContext, visualObj, milliSecondsPerMeasure) {
    
      return new Promise(function(resolve,reject) {
          console.log('PRIME TUNE', audioContext, visualObj, milliSecondsPerMeasure)
          var midiBuffer
          if (visualObj) {
            //if (!midiBuffer) {
               //console.log('STOP BUFFER')
                //midiBuffer.stop();
            //} else {
              //console.log('CREATE BUFFER')
                midiBuffer = new abcjs.synth.CreateSynth()
            //}
          
            //console.log('startok')
            var count = 0
            
            
            var mpm = milliSecondsPerMeasure ? milliSecondsPerMeasure  : gvisualObj.current.millisecondsPerMeasure()
            var initOptions = {
              debugCallback: function(a) {console.log("DEBUG",a)},
              //visualObj: visualObj,
              //audioContext: audioContext,
              //qpm: props.tempo,
              millisecondsPerMeasure:  milliSecondsPerMeasure ,
            }
            initOptions.sequence = visualObj.setUpAudio(initOptions)
           
            //console.log('sqe',initOptions.sequence)
            //const piWorker = new Worker(new URL("../audioWorker.js", import.meta.url))

 
          ////const piWorker = new Worker('../audioWorker.js', { type: 'module' });
          //piWorker.onmessage = event => {
            //console.log('WORKER MESSAGE RESPONSE: ' + event.data);
          //};
          //piWorker.postMessage({aa:9});
            //console.log('mididniT',initOptions)
            
            //if (midiBuffer) {
                midiBuffer.init(initOptions).then(function (response) {
                  console.log('prime tune inited', response)
                  midiBuffer.prime()
                  .then(function(presponse) {
                    console.log('prime tune primed', presponse)
                      resolve(midiBuffer)
                  })
                  .catch(function (error) {
                    console.log("prime synth error", error);
                    reject(null)
                  })
                  
                }).catch(function (error) {
                  console.log("init synth error", error);
                  reject(null)
                });
            //} else {
                //resolve(null)
            //}
          } else {
              reject(null)
          }
      })
  }
  
    function applyHack(meter, millisecondsPerMeasure) {
      if (meter === '3/4' || meter === '4/4') {
        return millisecondsPerMeasure * 2
      }
      return millisecondsPerMeasure
    }
  
    function getMilliSecondsPerMeasure(meter, tempo) {
         var meter = props.tunebook.abcTools.ensureText(meter, '4/4')
         var beats = props.tunebook.abcTools.getBeatsPerBar(meter) > 0 ? props.tunebook.abcTools.getBeatsPerBar(meter) : 4
         var duration = props.tunebook.abcTools.getBeatDuration(meter) > 0 ? props.tunebook.abcTools.getBeatDuration(meter) : 0
         var useTempo = parseInt(tempo) > 0 ? parseInt(tempo) : 100
         var final = (60000/useTempo) / (beats/duration)  * 2 
         console.log('MPM',final,meter, tempo, beats, duration , useTempo, 60000/useTempo * beats)
         return applyHack(meter, final)
    }
  const primeTimerRef = useRef(null);
  //var primeTuneCallback = null
  
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
                    if (primeTimerRef && primeTimerRef.current) clearTimeout(primeTimerRef.current)
                    console.log('PRIME SET TIMEOUT')
                    
                    primeTimerRef.current = setTimeout(function() {
                      console.log('PRIME TIMEOUT doiT')
                      primeTune(audioContext, visualObj, milliSecondsPerMeasure).then(function(midiBuffer) {
                          //renderActive = false
                          //setReady(true)
                          //console.log('PPI',midiBuffer)
                          var timingCallbacks = new abcjs.TimingCallbacks(visualObj, {
                            beatCallback: beatCallback,
                            eventCallback: function(ev) {eventCallback(ev)},
                            qpm: tempo,
                            lineEndCallback	: function() {
                              if (isPlayingRef && isPlayingRef.current) global.window.scrollBy(0,90)
                            },
                            lineEndAnticipation: 500
                          })
                          var cursor = createCursor()
                          
                          //console.log('CREATE PLAYER HAVE TIMING AND CURSOR', timingCallbacks, cursor) 
                          
                          console.log('CREATE PLAYER primed',audioContext, midiBuffer, timingCallbacks, cursor)
                          resolve([audioContext, midiBuffer, timingCallbacks, cursor, visualObj])
                      }).catch(function(e) {
                          console.log(e)
                          reject(e.message)
                      })
                    },1500)
                } else reject('No audio context')
            }).catch(function(e) {
                console.log(e)
                reject(e.message)
            })
        } else reject('Missing rendered tune')
    })
  }
  
  

  

  function clickListener(abcelem, tuneNumber, classes, analysis, drag, mouseEvent) {
    //console.log('CLICK ELEM',drag)
    //function getMeasureNumber(abcNotes, line,lineMeasure) {
    //var tally = 0
    //var lines = abcNotes.split("\n")
    //var notes = abcjs.extractMeasures(abcNotes)
  //}
  //abcelem, tuneNumber, classes, analysis, drag, mouseEvent)
    ////  drag.index/drag.max, analysis, abcelem, 'M',midiBuffer,'T',timingCallbacks)
    var toProgress = drag.index/drag.max
    //console.log('cclick',toProgress)
    //setSeekTo(toProgress)
    var notes = abcjs.extractMeasures(props.abc)
    //console.log('notes',notes[0].measures, analysis.line, analysis.line, analysis.measure)
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
  
  var [audioChangedHash, setAudioChangedHash] = useState(null)
  function renderTune(abcTune) {
    console.log('RENDER TUNE',abcTune)
    if (inputEl) { // && !renderActive) {
      //console.log('RENDER TUNE')
      //console.log('render abc', abcTune, inputEl.current)
      var res = abcjs.renderAbc(inputEl.current, abcTune, {
        add_classes: true,
        responsive: "resize",
        generateDownload: true,
        synth: {
            el: "#audio",
            
        },
        //soundFontUrl: 'soundfont/'
        clickListener:clickListener,
        //selectTypes: true
      });
      var o = res && res.length > 0 ? res[0] : null
      console.log('RENDERED TUNE',props.tempo,o)
      if (o) {
          if (props.onWarnings) props.onWarnings(o.warnings)
          var tune = props.tunebook.abcTools.abc2json(abcTune)
          if (props.tempo) {
            
            //props.audioProps.
             setVisualObj(o)
             setStarted(true)
             var hash = props.tunebook.utils.hash((tune.notes ? tune.notes.join("") : '')+props.tempo+tune.tempo+tune.meter+tune.noteLength)
             if (hash !== audioChangedHash) {
              console.log('RENDER TUNE AUDIODDD')
              setAudioChangedHash(hash)
              createPlayer(o, props.tempo, props.meter).then(function(p) {
                    console.log("CREATED PLAYER")
                   var [audioContext, midiBuffer, timingCallbacks, cursor] = p
                   assignStateOnCompletion(audioContext, midiBuffer, timingCallbacks, cursor)
                 
              }).catch(function(e) {
                console.log('REJECT CREATE PLAYER')
                setReady(false)
                setStarted(false)
                setIsPlaying(false)
              })
            } else {
              console.log('SKIP RENDER TUNE AUDIO no hash change')
              setReady(true)
            }
          } else {
            console.log('SKIP RENDER TUNE AUDIO NO TEMPO')
          }
      }
       //setSeekTo(0)
   }
  }
  
    const playTimerRef = useRef(null);
    
    function clickPlay() {
        console.log('onClickHandler')
        if (playTimerRef && playTimerRef.current) {
          console.log('onClickHandler DOUBLE')
            clearTimeout(playTimerRef.current)
            playTimerRef.current = null
            //if (midiBuffer) midiBuffer.stop()
            //if (timingCallbacks) timingCallbacks.stop()
            setForceSeekTo(0)
            //setIsWaiting(true); 
            setIsPlaying(true);
        } else {
          console.log('onClickHandler start')
            playTimerRef.current = setTimeout(() => {
              console.log('onClickHandler TIMEOUT TO SINGLE')
                clearTimeout(playTimerRef.current)
                //setIsWaiting(true); 
                setIsPlaying(true);
                playTimerRef.current = null
                
            }, 500)
        }
        
    };

      
  function bodyClick(enable) { 
    if (!started) {
      //console.log('BODYCLICK')
      //setStarted(true)
      enable()
      clickInit()
    }
  }
    
  
  function clickInit(playing) {
      //console.log('CLICK INIT', visualObj)
      if (gvisualObj && gvisualObj.current) {
        setReady(false)
        setStarted(true)
        setIsPlaying(false)
        createPlayer(gvisualObj.current, props.tempo, props.meter).then(function(p) {
          var [audioContext, midiBuffer, timingCallbacks, cursor] = p
           assignStateOnCompletion(audioContext, midiBuffer, timingCallbacks, cursor)
           if (playing) setIsPlaying(true)
        })
      }
  }
   
    function seekPlayerTo(seekTo) {
        //console.log('seekPlayerTo',seekTo)
        if (gmidiBuffer && gmidiBuffer.current) gmidiBuffer.current.seek(seekTo);
        if (gtimingCallbacks && gtimingCallbacks.current) gtimingCallbacks.current.setProgress(seekTo)
        
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

  
   // COMPONENT RENDER and UPDATE
  var renderActive = false 
  useEffect(() => {
    console.log('ABC CHANGE', lastAbc, lastTempo, props.tempo, props.abc )
    if (gvisualObj ===null || gvisualObj.current === null  || lastAbc != props.abc || props.tempo != lastTempo) {
      setSeekTo(0)
      setPlayCount(0)
      console.log('ABC ELEM UPDATE', lastAbc ? lastAbc.length : 0,  props.abc ? props.abc.length : 0 ,props.tempo , lastTempo)
      //setStarted(true)
      setReady(false)
      setIsPlaying(false)
      //stopPlaying()
      // TODO if tempo is empty and current tune has tempo, set the tempo OTHERWISE per below
      setLastAbc(props.abc)
      setLastTempo(props.tempo)
      setAbcTune(props.abc);
              
      renderTune(props.abc)
    } else {
      setStarted(false)
      setReady(false)
      setIsPlaying(false)
      
    }
    return function cleanup() {
      //console.log('ABC CLEANUP')
       stopPlaying() 
    }
   }, [props.abc, props.tempo])
 
 
//console.log('abc',props.tunebook)
  return (
   <ReactNoSleep>
        {({ isOn, enable, disable }) => (
          <span onClick={function(e) {bodyClick(enable)}} >
             {(props.tempo) ? <span style={{position:'fixed', top: 4, right: 4, zIndex: 66}} >
              <AbcPlayButton started={started} ready={ready}  isPlaying={isPlaying} clickInit={function(e) {clickInit(true) }} clickPlay={clickPlay} clickStopPlaying={stopPlaying} tunebook={props.tunebook} />  
            </span> : null}
            {gaudioContext && gaudioContext.current && <input type="range" min='0' max='1' step='0.0001' value={seekTo} onChange={function(e) {setForceSeekTo(e.target.value)}}  style={{marginTop:'0.5em',marginBottom:'0.5em', width:'100%'}}/>}
           {(props.repeat > 1) && <Button style={{float:'right'}} variant="primary" >{props.tunebook.icons.timer2line} {(playCount + 1)}</Button>}
            <div id="abc_music_viewer" ref={inputEl}></div>
          </span>
        )}
    </ReactNoSleep>
  );
}
           
