import React, { useEffect, useState, useRef } from "react";
import abcjs from "abcjs";
import {Link} from 'react-router-dom'
import {Button } from 'react-bootstrap'
import useAbcTools from '../useAbcTools'
import ReactNoSleep from 'react-no-sleep';
import AbcPlayButton from './AbcPlayButton'
import Metronome from '../Metronome'
import * as localForage from "localforage";
import TempoControl from './TempoControl'
const Encoder = require('audiobuffer-arraybuffer-serializer').Encoder;
const Decoder = require('audiobuffer-arraybuffer-serializer').Decoder;
     
            
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
    //var gtempo = props.tempo
    
    var abcTools = useAbcTools()
    const inputEl = useRef(null);
    //console.log('ABC',props)
    var metronomeTimeout = useRef(null)
    var metronome = useRef(null)
    var [tune, setTune] = useState(props.tunebook.abcTools.abc2json(props.abc))
    const [showTempo, setShowTempo] = useState(false)

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
     //console.log('assignStateOnCompletion',audioContext, midiBuffer, timingCallbacks, cursor) 
     setAudioContext(audioContext)
     setMidiBuffer(midiBuffer)
     setTimingCallbacks(timingCallbacks)
     setCursor(cursor)
     setReady(true)
     //setStarted(true)
  }
  
    var [repeat,setRepeat] = useState(null)
    var [milliSecondsPerMeasure,setMilliSecondsPerMeasure] = useState(null)
    var [playCount, setPlayCountInner] = useState(0)
    var playCountRef = useRef(0)
    function setPlayCount(v) {
      setPlayCountInner(v)
      playCountRef.current = v
    }
    function incrementPlayCount() {
      //console.log('increment', playCountRef.current + 1)
      setPlayCount(playCountRef.current + 1)
    }

  function createCursor() {
    var svg = document.querySelector("#abc_music_viewer svg");
    var cursor = document.createElementNS("http://www.w3.org/2000/svg", "line");
    if (cursor) {
      cursor.setAttribute("class", "abcjs-cursor");
      cursor.setAttributeNS(null, 'x1', 0);
      cursor.setAttributeNS(null, 'y1', 0);
      cursor.setAttributeNS(null, 'x2', 0);
      cursor.setAttributeNS(null, 'y2', 0);
      svg.appendChild(cursor);
    }
    setCursor(cursor)
    return cursor;
  }
  
  
  function beatCallback(currentBeat,totalBeats,lastMoment,position, debugInfo) {
    //console.log('BEAT',currentBeat,totalBeats,lastMoment,position, debugInfo)
     // FINISHED PLAYBACK
     function restart() {
       //console.log('restart')
       //stopPlaying()
       //startPlaying()
        if (gmidiBuffer && gmidiBuffer.current) {
          gmidiBuffer.current.seek(0)
           //gmidiBuffer.stop()
           //gmidiBuffer.start()
           if (gtimingCallbacks && gtimingCallbacks.current) gtimingCallbacks.current.setProgress(0)
        }
     }
     if (currentBeat === totalBeats) {
       //console.log('end tune', playCountRef.current, props.repeat)
       if (parseInt(props.repeat) === -1) {
         restart()
       } else if (parseInt(props.repeat) === 0) {
         stopPlaying()
         if (props.onEnded) props.onEnded()
       } else if (parseInt(props.repeat) > 0 ) {
         if (playCountRef.current < props.repeat - 1) {
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
           //setPlayCount(playCount + 1)
           incrementPlayCount()
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
      if (gcursor && gcursor.current && x1 !== NaN && x2 !== NaN  && y1 !== NaN && y2 !== NaN) {
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
    if (props.autoScroll && gmidiBuffer && gmidiBuffer.current && gmidiBuffer.current.duration > 0) {
      var newSeek = ev.milliseconds/(gmidiBuffer.current.duration * 1000)
      //console.log('UPDATE SEEK',newSeek)
      //setSeekTo(newSeek)
      if (ev.top > 0 && ev.left > 0) {
        console.log('scroll',ev.left,ev.top)
        window.scrollTo(ev.left,(ev.top*2.3 + 150))
      } 
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
            gmidiBuffer.current.start()
            gtimingCallbacks.current.start()
          } else {
            //console.log('start',gvisualObj)
            if (gvisualObj && gvisualObj.current)
            var o = gvisualObj.current
            //console.log('RENDERED TUNE tempo',props.tempo,'pickup', o.getPickupLength(), 'beatlenght',o.getBeatLength(), 'beats per measure',o.getBeatsPerMeasure(), 'bar length',o.getBarLength(), 'bpm',o.getBpm(), 'mspermeasure',o.millisecondsPerMeasure(), o.getTotalBeats(), o.getTotalTime())
            
            var metronomeBeats = o.getBeatsPerMeasure() - parseInt(o.getPickupLength()/o.getBeatLength())
            // 2 bars where there is a pickup
            if (o.getPickupLength() > 0)  metronomeBeats += o.getBeatsPerMeasure()
            var beatOverflow = o.getPickupLength()/o.getBeatLength() % 1
            var beatDuration = o.millisecondsPerMeasure()/o.getBeatsPerMeasure()
            var delay = beatDuration
            //console.log('timer delay', delay, beatOverflow)
            if (beatOverflow > 0) {
              var pickupPercent = o.getPickupLength()/o.getBarLength()
              delay = delay - beatOverflow * beatDuration
              //if (pickupPercent
              //console.log('adjust for pickup', pickupPercent, delay)
            }
            
            //console.log('metro beats',metronomeBeats,beatDuration)
            function startWithMetronome() {
              if (props.metronomeCountIn) {
                metronome.current = new Metronome(props.tunebook.abcTools.cleanTempo(props.tempo), o.getBeatsPerMeasure(), metronomeBeats, function() {
                  // settime after residual delay if not even beat anacrusis
                  //console.log('done')
                  // wait one more beat
                  metronomeTimeout.current = setTimeout(function() {
                    gmidiBuffer.current.start()
                    gtimingCallbacks.current.start()
                  },delay)
                });
                metronome.current.start()
              } else {
                  gmidiBuffer.current.start()
                  gtimingCallbacks.current.start()
              }
            }
            //var tune = props.tunebook.abcTools.abc2json(props.abc)
            //console.log('speak',props.speakTitle,tune)
            if (props.speakTitle && tune) {
              //console.log('speak',tune)
              window.speak(tune.name)
              setTimeout(function() {
                startWithMetronome()
              }, 1000)
            } else {
              startWithMetronome()
            }
          }
      }
      //console.log('started primed tune')
    } else {
      stopPlaying()
    }
  }

  function startPlaying() {
      //console.log(gaudioContext,gmidiBuffer,gvisualObj,gtimingCallbacks,gcursor)
      setForceStop(false)
      //if (audioContext.current && midiBuffer.current) {
          ////console.log('start ok - tune primed')
      startPrimedTune()
      if (props.onStarted) props.onStarted()
      //}
  }
    
  function stopPlaying()  {
    //console.log(gaudioContext,gmidiBuffer,gvisualObj,gtimingCallbacks,gcursor)
    if (metronome.current) metronome.current.stop()
    clearTimeout(metronomeTimeout.current)
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
    //console.log('PRIMAUDIO')
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
          //console.log('PRIME TUNE', audioContext, visualObj, milliSecondsPerMeasure)
          var midiBuffer
          if (visualObj) {
            //if (!midiBuffer) {
               //console.log('STOP BUFFER')
                //midiBuffer.stop();
            //} else {
              //console.log('CREATE BUFFER')
                //var synthOptions = {synth:{}}
                //if (tune) synthOptions.synth.options = {options:{midiTranspose:parseInt(tune.transpose)}}
                ////renderOptions.synth.options = {midiTranspose:parseInt(tune.transpose)}
      
                midiBuffer = new abcjs.synth.CreateSynth()
            //}
          
            //console.log('startok', midiBuffer,visualObj,visualObj.visualTranspose)
            var count = 0
            
            
            var mpm = milliSecondsPerMeasure ? milliSecondsPerMeasure  : gvisualObj.current.millisecondsPerMeasure()
            var a=process.env.NODE_ENV === "development" ? 'http://localhost:4000/' : ''
            var initOptions = {
              //debugCallback: function(a) {console.log("DEBUG",a)},
              visualObj: visualObj,
              //audioContext: audioContext,
              //qpm: props.tempo,
              //midiTranspose: 7
              //synth: {{options:{midiTranspose:9}}
              options:{soundFontUrl: a + '/midi-js-soundfonts/abcjs',
              }
              
            //  millisecondsPerMeasure:  milliSecondsPerMeasure ,
            }
            var tune = props.tunebook.abcTools.abc2json(props.abc)
            //console.log("TUNE FONT", tune.soundFonts, tune) 
            if (tune.soundFonts === 'online')  initOptions.options.soundFontUrl = null
            //if (tune) synthOptions.synth.options = {options:{midiTranspose:parseInt(tune.transpose)}}
                ////renderOptions.synth.options = {midiTranspose:parseInt(tune.transpose)}
      
            //if (tune) {
              if (visualObj.visualTranspose > 0 || visualObj.visualTranspose < 0 ) {
                initOptions.options.midiTranspose = parseInt(visualObj.visualTranspose)
              }
            //}
            //console.log('sqe',initOptions)
            //const piWorker = new Worker(new URL("../audioWorker.js", import.meta.url))

 
          ////const piWorker = new Worker('../audioWorker.js', { type: 'module' });
          //piWorker.onmessage = event => {
            //console.log('WORKER MESSAGE RESPONSE: ' + event.data);
          //};
          //piWorker.postMessage({aa:9});
            //console.log('mididniT',initOptions)
            
            //if (midiBuffer) {
            
            function getAudioHash(tune) {
              return tune.id + "-" + props.tunebook.abcTools.cleanTempo(props.tempo)+'-'+tune.transpose+"-"+props.tunebook.utils.hash(props.tunebook.abcTools.getNotesFromAbc(props.abc))
            }
            
             //console.log("tune", tune,props.abc);
             
             function primeAndResolve() {
               //logtime('preinit primresolve')
                midiBuffer.init(initOptions).then(function (response) { 
                  //logtime('preinit pr inited')
                  midiBuffer.prime()
                  .then(function(presponse) {
                    //logtime('preinit prime tune primed AAA')
                    //console.log('preinit prime tune primed', presponse, midiBuffer)
                    if (tune && tune.id) { 
                      saveAudioToCache(getAudioHash(tune),midiBuffer.audioBuffers, midiBuffer.duration).then(function() {
                        //console.log('created audio')
                        resolve(midiBuffer)
                      })
                    } else {
                      //console.log('audio from cache')
                      resolve(midiBuffer)
                    }
                  })
                  .catch(function (error) {
                    //console.log("prime synth error", error);
                    resolve(null)
                  })
                }).catch(function (error) {
                  resolve(null)
                })
             }

              var timer = new Date().getTime()
              function logtime(a) {
                //console.log("LOGTIME",a,new Date().getTime() - timer)
              }
             if ((tune && tune.id)) {
               //logtime('preget audio')
                getAudioFromCache(getAudioHash(tune)).then(function(audioResult) {
                    //console.log('GOT',audioResult)
                    if (audioResult) {
                      
                      const [duration, audioBuffers] = audioResult
                      if (audioBuffers) {
                        //console.log('GOT BUF',audioBuffers, duration)
                         //primeAndResolve()
                         //logtime('preinit')
                         midiBuffer.init(initOptions).then(function (response) { 
                           //logtime('inited for buffer')
                            midiBuffer.audioBuffers = audioBuffers
                            midiBuffer.duration = duration 
                            
                            var timingCallbacks = new abcjs.TimingCallbacks(visualObj, {
                              beatCallback: beatCallback,
                              eventCallback: function(ev) {eventCallback(ev)},
                              qpm: props.tempo,
                              //lineEndCallback	: function() {
                                //if (isPlayingRef && isPlayingRef.current) global.window.scrollBy(0,90)
                              //},
                              //lineEndAnticipation: 500
                            })
                            var cursor = createCursor()
                            setTimingCallbacks(timingCallbacks)
                            setCursor(cursor)
                            resolve(midiBuffer)
                        })
                      } else {
                        primeAndResolve()
                      }
                    } else {
                      primeAndResolve()
                    } 
                })
              } else {
                primeAndResolve()
              }
                //}).catch(function (error) {
                  ////console.log("init synth error", error);
                  //reject(null)
                //});
                
                
                  
            //} else {
                //resolve(null)
            //}
          } else {
              reject(null)
          }
      })
  }
  
       //console.log('ABC',tune)
    var store = localForage.createInstance({
        name: "abcaudiocache"
      });
    
    async function saveAudioToCache(tuneId,audioBuffers, duration) {
      //console.log('saveaudio', typeof tuneId,':',tuneId, audioBuffers)
      let encoder = new Encoder();
      var serialized = audioBuffers.map(function(buffer) {return encoder.execute(buffer)}) 
      store.setItem(tuneId, [duration, serialized] ).then(function () {
        return store.getItem(tuneId);
      })
    }
    
    async function getAudioFromCache(tuneId) {
      //console.log('getaudio',tuneId)
      let decoder = new Decoder();
      return store.getItem(tuneId).then(function (val) {
        if (val && Array.isArray(val)) {
          //console.log('getaudio',tuneId,val)
          const [duration, buffers] = val;
          return [duration, buffers.map(function(buffer) {return decoder.execute(buffer)})]
        } else {
          //console.log('getaudio noval',tuneId)
          return
        }
      })
    }
    
    //function applyHack(meter, millisecondsPerMeasure) {
      ////if (meter === '3/4' || meter === '4/4') {
        ////return millisecondsPerMeasure * 2
      ////}
      //return millisecondsPerMeasure
    //}
    
    //function numerator(val) {
      //var parts = val.split("/")
      //if (parts.length > 0) return parts[0]
    //}
    //function denominator(val) {
      //var parts = val.split("/")
      //return (parts.length > 1) ? parts[1] : 1
    //}

    
    //function getMilliSecondsPerMeasure(meter, tempo) {
         //var meter = props.tunebook.abcTools.ensureText(meter, '4/4')
         //var beats = numerator(meter) //props.tunebook.abcTools.getBeatsPerBar(meter) > 0 ? props.tunebook.abcTools.getBeatsPerBar(meter) : 4
         //var duration = denominator(meter) //props.tunebook.abcTools.getBeatDuration(meter) > 0 ? props.tunebook.abcTools.getBeatDuration(meter) : 0
         //var useTempo = parseInt(tempo) > 0 ? parseInt(tempo) : 100
         //var final = (60000/useTempo) * 4 // (beats/duration)  * 4 
         //console.log('MPM',final,meter, tempo, beats, duration , useTempo, 60000/useTempo)
         //return applyHack(meter, final)
    //}
  const primeTimerRef = useRef(null);
  //var primeTuneCallback = null
  
  function createPlayer(visualObj, tempo, meter) {
      var milliSecondsPerMeasure = 0 //getMilliSecondsPerMeasure(meter, tempo)
      return new Promise(function(resolve, reject) {
        //console.log('CREATE PLAYER', visualObj)
            
        if (visualObj) {
            //console.log('CREATE PLAYER HAVE VISUAL OBJ')
            primeAudio().then(function(audioContext) {
              //console.log('CREATE PLAYER AUDIO PRIMED',audioContext)
                if (audioContext) {
                    
                    //console.log('tune update have audio context')
                    //setReady(false)
                    //renderActive = true
                    if (primeTimerRef && primeTimerRef.current) clearTimeout(primeTimerRef.current)
                    //console.log('PRIME SET TIMEOUT')
                    
                    primeTimerRef.current = setTimeout(function() {
                      //console.log('PRIME TIMEOUT doiT')
                      primeTune(audioContext, visualObj, milliSecondsPerMeasure).then(function(midiBuffer) {
                          //renderActive = false
                          //setReady(true)
                          //console.log('CREATE TIMEING',tempo)
                          var timingCallbacks = new abcjs.TimingCallbacks(visualObj, {
                            beatCallback: beatCallback,
                            eventCallback: function(ev) {eventCallback(ev)},
                            qpm: tempo,
                            //lineEndCallback	: function() {
                              //if (isPlayingRef && isPlayingRef.current) global.window.scrollBy(0,90)
                            //},
                            //lineEndAnticipation: 500
                          })
                          var cursor = createCursor()
                          
                          //console.log('CREATE PLAYER HAVE TIMING AND CURSOR', timingCallbacks, cursor) 
                          
                            //console.log('CREATE PLAYER primed',audioContext, midiBuffer, timingCallbacks, cursor)
                          resolve([audioContext, midiBuffer, timingCallbacks, cursor, visualObj])
                      }).catch(function(e) {
                          console.log(e)
                          reject(e)
                      })
                    },props.audioRenderTimeout > 0 ? props.audioRenderTimeout : 1500)
                } else reject('No audio context')
            }).catch(function(e) {
                console.log(e)
                reject(e.message)
            })
        } else reject('Missing rendered tune')
    })
  }
  
  

  

  function clickListener(abcelem, tuneNumber, classes, analysis, drag, mouseEvent) {
    //console.log('CLICK ELEM',abcelem,abcelem.type) //props.onClickTempo,abcelem.type, ms,abcelem, tuneNumber, classes, analysis, drag, mouseEvent,gmidiBuffer) //, tuneNumber, classes, analysis, drag, mouseEvent)
    
    if (abcelem && abcelem.type === 'tempo' && props.editableTempo) { // && props.onClickTempo) {props.onClickTempo() 
      //console.log('CLICK tempo')
      setShowTempo(true)
    }
    var ms = (Array.isArray(abcelem.currentTrackMilliseconds) && abcelem.currentTrackMilliseconds.length > 0) ? abcelem.currentTrackMilliseconds[0] : abcelem.currentTrackMilliseconds
    
    if (gmidiBuffer && gmidiBuffer.current) gmidiBuffer.current.seek(ms/1000,'seconds')
    if (gtimingCallbacks && gtimingCallbacks.current) gtimingCallbacks.current.setProgress(ms/1000,'seconds')
    if (gmidiBuffer.duration > 0) setSeekTo(ms/1000/gmidiBuffer.duration)
    
    
    if (props.onClick)  props.onClick(abcelem, tuneNumber, classes, analysis, drag, mouseEvent)
    
    //function getMeasureNumber(abcNotes, line,lineMeasure) {
    //var tally = 0
    //var lines = abcNotes.split("\n")
    //var notes = abcjs.extractMeasures(abcNotes)
  //}
  //abcelem, tuneNumber, classes, analysis, drag, mouseEvent)
    ////  drag.index/drag.max, analysis, abcelem, 'M',midiBuffer,'T',timingCallbacks)
    //var toProgress = drag.index/drag.max
    //console.log('cclick',toProgress)
    //setForceSeekTo(toProgress)
    //var notes = abcjs.extractMeasures(props.abc)
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
    //console.log('RENDER TUNE',abcTune)
    if (inputEl) { // && !renderActive) {
      //console.log('RENDER TUNE')
      //console.log('render abc', abcTune, inputEl.current)
      
      
      try {
        var renderOptions = {
          add_classes: true,
          responsive: "resize",
          generateDownload: true,
          synth: {
              el: "#audio",
              
          },
          //soundFontUrl: 'soundfont/'
          clickListener:clickListener,
          selectTypes: ['note','tempo']
        }
        var tune = props.tunebook.abcTools.abc2json(abcTune)
        if (tune.transpose > 0 || tune.transpose < 0 ) {
          renderOptions.visualTranspose= tune.transpose
        }
        //console.log('SS',props.scale)
        if (props.scale && props.scale > 0) {
          renderOptions.scale = props.scale
        }
        //console.log("OPT",tune.transpose,'f',renderOptions)
        //abcjsParams: {"selectTypes":false,"visualTranspose":0},
    //synth: {
      //el: "#audio",
      //options: {
        //displayRestart: true, displayPlay: true, displayProgress: true,
        //options: {"midiTranspose":0}
      //}
    //},
        
        //console.log('use tab?', tune.tablature, props.tunebook.abcTools.tablatureConfig)
        if (tune && tune.tablature && props.tunebook.abcTools.tablatureConfig.hasOwnProperty(tune.tablature)) {
          
          renderOptions.tablature = [props.tunebook.abcTools.tablatureConfig[tune.tablature]]
        } 
        if (props.tempo > 0) tune.tempo = props.tempo 
        var res = abcjs.renderAbc(inputEl.current, props.tunebook.abcTools.json2abc(tune), renderOptions );
            
        var o = res && res.length > 0 ? res[0] : null
        //console.log('RENDERED TUNE tempo',props.tempo,'pickup', o.getPickupLength(), 'beatlenght',o.getBeatLength(), 'beats per measure',o.getBeatsPerMeasure(), 'bar length',o.getBarLength(), 'bpm',o.getBpm(), 'mspermeasure',o.millisecondsPerMeasure(), o.getTotalBeats(), o.getTotalTime())
        if (o) {
            if (props.onWarnings) props.onWarnings(o.warnings)
            if (props.tempo) {
              
              //props.audioProps.
               setVisualObj(o)
               setStarted(true)
               var hash = props.tempo + '-' + abcTools.getTuneHash(tune) //hash = props.tunebook.utils.hash((tune.notes ? tune.notes.join("") : '')+props.tempo+tune.tempo+tune.meter+tune.noteLength+tune.transpose)
               if (hash !== audioChangedHash) {
                //console.log('RENDER TUNE AUDIODDD')
                setAudioChangedHash(hash)
                createPlayer(o, props.tempo, props.meter).then(function(p) {
                      //console.log("CREATED PLAYER")
                     var [audioContext, midiBuffer, timingCallbacks, cursor] = p
                     assignStateOnCompletion(audioContext, midiBuffer, timingCallbacks, cursor)
                     if (props.autoStart && started) {
                       setIsPlaying(true)
                       if (props.onStarted) props.onStarted()
                     }
                     
                   
                }).catch(function(e) {
                  //console.log('REJECT CREATE PLAYER')
                  setReady(false)
                  setStarted(false)
                  //setIsPlaying(false)
                })
              } else {
                //console.log('SKIP RENDER TUNE AUDIO no hash change')
                setReady(true)
              }
            } else {
              //console.log('SKIP RENDER TUNE AUDIO NO TEMPO')
            }
        }
         //setSeekTo(0)
      } catch (e) {
        console.log('RENDER EXC',e)
      }
   }
  }
  
    const playTimerRef = useRef(null);
    
    function clickRecord() {
      return clickPlay()
    }
    
    function clickPlay(seekTo) {
        //console.log('onClickHandler')
        if (playTimerRef && playTimerRef.current) {
          //console.log('onClickHandler DOUBLE')
            clearTimeout(playTimerRef.current)
            playTimerRef.current = null
            if (gmidiBuffer && gmidiBuffer.current) gmidiBuffer.current.seek(0)
            if (gtimingCallbacks && gtimingCallbacks.current) gtimingCallbacks.current.setProgress(0)
            setSeekTo(seekTo > 0 ? parseInt(seekTo) : 0)
            //setIsWaiting(true); 
            setIsPlaying(true);
        } else {
          //console.log('onClickHandler start')
            playTimerRef.current = setTimeout(() => {
              //console.log('onClickHandler TIMEOUT TO SINGLE')
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
        //setIsPlaying(false)
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



  function updateOnChange() {
    //console.log('ABC CHANGE') //, lastAbc, lastTempo, props.tempo, props.abc )
    if (gvisualObj ===null || gvisualObj.current === null  || lastAbc != props.abc || props.tempo != lastTempo) {
      setSeekTo(0)
      setPlayCount(0)
      //console.log('ABC ELEM UPDATE', lastAbc ? lastAbc.length : 0,  props.abc ? props.abc.length : 0 ,props.tempo , lastTempo)
      //setStarted(true)
      setReady(false)
      //setIsPlaying(false)
      //stopPlaying()
      // TODO if tempo is empty and current tune has tempo, set the tempo OTHERWISE per below
      setLastAbc(props.abc)
      setLastTempo(props.tempo)
      setAbcTune(props.abc);
      setTune(props.tunebook.abcTools.abc2json(props.abc))
        
      renderTune(props.abc)
    } else {
      setStarted(false)
      setReady(false)
      //setIsPlaying(false)
      
    }
    return function cleanup() {
      //console.log('ABC CLEANUP')
       stopPlaying() 
    }
  }

  
   // COMPONENT RENDER and UPDATE
  var renderActive = false 
  useEffect(() => {
      return updateOnChange()
   }, [props.abc])

  //useEffect(() => {
    ////console.log('tempo change',props.tempo, props.abc)
      //if (props.tunes) {
        //var tuneLocal = props.tunebook.abcTools.abc2json(props.abc)
        //var tune = props.tunes[tuneLocal.id]
        //if (tune) {
          //tune.tempo = props.tempo
          //props.tunebook.saveTune(tune)
        //}
      //}
      //return updateOnChange()
      ////props.forceRefresh()
   //}, [props.tempo]) 
 
//console.log('abc',props.tunebook)
  return (
  <>
   <TempoControl showTempo={showTempo} setShowTempo={setShowTempo} value={props.tempo} onChange={function(e) {
     //console.log("TEMPO CHANGE",e)
      //var tuneLocal = props.tunebook.abcTools.abc2json(props.abc)
      //var tune = tuneLocal[tuneLocal.id]
      if (tune) {
        tune.tempo = e
        props.tunebook.saveTune(tune)
        updateOnChange()
        if (props.forceRefresh) props.forceRefresh()
      }
    }} />
   <ReactNoSleep>
        {({ isOn, enable, disable }) => (
          <span onClick={function(e) {bodyClick(enable)}} >
             {(props.tempo) ? <span style={{position:'fixed', top: 4, right: 4, zIndex: 66}} >
              <AbcPlayButton forceRefresh={props.forceRefresh} tune={tune}  started={started} ready={ready}  isPlaying={isPlaying} clickInit={function(e) {clickInit(true) }} clickPlay={clickPlay}  clickRecord={clickRecord} clickStopPlaying={stopPlaying} tunebook={props.tunebook} />  
            </span> : null}
            {gaudioContext && gaudioContext.current && <input className="abcprogressslider" type="range" min='0' max='1' step='0.0001' value={seekTo} onChange={function(e) {setForceSeekTo(e.target.value)}}  style={{marginTop:'0.5em',marginBottom:'0.5em', width:'100%'}}/>}
           {(props.repeat > 1) && <Button style={{float:'right'}} variant="primary" >{props.tunebook.icons.timer2line} {(playCount + 1)}</Button>}
            {props.link && <Link style={{color: 'black', textDecoration:'none'}}  to={"/tunes/"+tune.id} ><div id="abc_music_viewer" ref={inputEl} ></div></Link>}
            {!props.link && <div id="abc_music_viewer" ref={inputEl} ></div>}
          </span>
        )}
    </ReactNoSleep></>
  );
}
           
