import React, { useEffect, useState, useRef } from "react";
import abcjs from "abcjs";
import {Link} from 'react-router-dom'
import {Button , Modal} from 'react-bootstrap'
import useAbcTools from '../useAbcTools'
import ReactNoSleep from 'react-no-sleep';
import AbcPlayButton from './AbcPlayButton'
import Metronome from '../Metronome'
import * as localForage from "localforage";
import TempoControl from './TempoControl'
import TransposeModal from './TransposeModal'
import {isMobile} from 'react-device-detect'
import MP3Converter from '../MP3Converter'
  

export default function Abc(props) {
    const [tune, setTune] = useState(props.tunebook.abcTools.abc2json(props.abc))
    //console.log('ABC tune',tune, props.abc)
    const [showTempo, setShowTempo] = useState(false)
    const [showTranspose, setShowTranspose] = useState(false)
    const [lastSeek, setLastSeek] = useState(0)
    const [lastPlaybackSpeed, setLastPlaybackSpeed] = useState(1)
    const [audioChangedHash, setAudioChangedHash] = useState(null)
    const [tapToPlay, setTapToPlay] = useState(false)
    const [playCancelled, setPlayCancelled] = useState(false)
    
    const [abcTune, setAbcTune] = useState(props.abc);
    const [lastAbc, setLastAbc] = useState(null);
    const [lastTempo, setLastTempo] = useState(null);
    const [lastBoost, setLastBoost] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false)
    //var [milliSecondsPerMeasure,setMilliSecondsPerMeasure] = useState(null)
    const [playCount, setPlayCountInner] = useState(0)
    const playCountRef = useRef(0)
    
    function setPlayCount(v) {
      setPlayCountInner(v)
      playCountRef.current = v
    }
    function incrementPlayCount() {
      //console.log('increment', playCountRef.current + 1)
      setPlayCount(playCountRef.current + 1)
    }
    
    const lastScrollTo = useRef(0)
    const autoScroll = useRef(false)
    const realProgress = useRef(0) // updated by onplaying events
    // keep a copy as a ref to be available for lookup in callbacks
    
    const timer = new Date().getTime()
    function logtime(a) {
        console.log("LOGTIME",a,new Date().getTime() - timer)
      }
    //const [isWaiting, setIsWaiting] = useState(false)
    const [seekTo, setSeekTo] = useState(false)
    const [forceSeekTo, setForceSeekTo] = useState(false)
    const [ready, setReady] = useState(false)
    const [started, setStarted] = useState(false)
  
    const store = localForage.createInstance({
      name: "abcaudiocache"
    });
    const abcTools = useAbcTools()
    const inputEl = useRef(null);
    const metronomeTimeout = useRef(null)
    const metronome = useRef(null)
    const gaudioContext = useRef(null)
    const gmidiBuffer = useRef(null)
    const gvisualObj = useRef(null)
    const gtimingCallbacks = useRef(null)
    const gcursor = useRef(null)
    
    const playTimerRef = useRef(null);

    
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
    
      
    function setForceStop(val) {
        localStorage.setItem('bookstorage_forcestop',(val ? 'true' : 'false'))
    }
    function getForceStop() {
        return localStorage.getItem('bookstorage_forcestop') === 'true' ? true : false
    }
    setForceStop(false)
    
    // listen to properties on media controller to control local player
    useEffect(function() {
        console.log("MP change")
        if (props.mediaController) console.log(props.mediaController.isPlaying, props.mediaController.currentTime, props.mediaController.lastSeek,lastSeek,  props.mediaController.mediaLinkNumber)
        if (props.mediaController && props.mediaController.mediaLinkNumber === null) {
            if (lastPlaybackSpeed !== props.mediaController.playbackSpeed) {
                console.log("MP changewarp change", props.mediaController.playbackSpeed)
            }
            if (props.mediaController.isPlaying) {
                console.log('MP change play')
                //bodyClick()
                startPlaying()
            } else {
                console.log('MP change stop',gmidiBuffer.current)
                stopPlaying()
            }
            if (lastSeek !== props.mediaController.lastSeek) {
                console.log('MP changeseek change',props.mediaController.lastSeek,props.mediaController.duration)
                //setSeekTo(props.mediaController.lastSeek)
                seekPlayer(props.mediaController.lastSeek/props.mediaController.duration)
            }
            setLastSeek(props.mediaController.lastSeek)
            setLastPlaybackSpeed(props.mediaController.playbackSpeed)
        } 
        
    },[(props.mediaController ? props.mediaController.isPlaying : null), (props.mediaController ? props.mediaController.lastSeek : null), (props.mediaController ?  props.mediaController.mediaLinkNumber : null), (props.mediaController ? props.mediaController.playbackSpeed : null)])
    

    // autostart
    //useEffect(() => {
        //console.log('autostart change', props.autoStart)
        //if (props.autoStart) {
          //if (props.autoStart) {
           //setIsPlaying(true)
           //if (props.onStarted) props.onStarted()
          //}
        //}  else {
           //setIsPlaying(false)
        //}
    //}, [props.autoStart]); 


    function updateOnChange() {
        console.log('ABC CHANGE') //, props.tempo, lastTempo,  props.abc , lastAbc )
        var tune = props.tunebook.abcTools.abc2json(props.abc)
        if (gvisualObj ===null || gvisualObj.current === null  || lastAbc != props.abc || props.tempo != lastTempo ) {
          setSeekTo(0)
          setPlayCount(0)
          console.log('ABC ELEM UPDATE', lastAbc ? lastAbc.length : 0,  props.abc ? props.abc.length : 0 ,props.tempo , lastTempo,props.boost ,lastBoost)
          //setStarted(true)
          setReady(false)
          //setIsPlaying(false)
          //stopPlaying()
          // TODO if tempo is empty and current tune has tempo, set the tempo OTHERWISE per below
          setLastAbc(props.abc)
          setLastTempo(props.tempo)
          //setLastBoost(tune.boost)
          setAbcTune(props.abc);
          setTune(tune)
          renderTune(props.abc)
        } else {
          setStarted(false)
          setReady(false)
          //setIsPlaying(false)
        }
        
        return function cleanup() {
           console.log('ABC CLEANUP')
           stopPlaying() 
        }
    }


    // when abc changes, do a full update
    useEffect(() => {
    //console.log(props.abc)
      return updateOnChange()
    }, [props.abc])

    // save autoscroll prop to ref
    useEffect(() => {
      //console.log('set AS,',props.autoScroll)
      autoScroll.current = props.autoScroll
    }, [props.autoScroll])

    function beatCallback(currentBeat,totalBeats,lastMoment,position, debugInfo) {
        console.log('BEAT',props.mediaController,gmidiBuffer.current,'MM',currentBeat,totalBeats,lastMoment,position, debugInfo, props.mediaController)
        //console.log('seekTo',"W",currentBeat, totalBeats, props.mediaController.duration, sto * props.mediaController.duration)
        //if (gmidiBuffer && gmidiBuffer.current && props.mediaController) {
            ////setForceSeekTo(sto)
            //const sto = currentBeat/ totalBeats //* gmidiBuffer.current.duration
            //console.log('time from BEAT',sto)
            //props.mediaController.seek(sto)
        //}
      
         // FINISHED PLAYBACK
        // detect end of tune and handle repeats/call props.onEnded
         if (currentBeat === totalBeats) {
           console.log('end tune', playCountRef.current, props.repeat)
           // infinite repeats
           if (parseInt(props.repeat) === -1) {
             seekPlayer(0)
           // single repeat
           } else if (parseInt(props.repeat) === 0) {
             stopPlaying()
             seekPlayer(0)
             if (props.onEnded) props.onEnded()
           // specified repeats > 0
           } else if (parseInt(props.repeat) > 0 ) {
             if (playCountRef.current < props.repeat - 1) {
               seekPlayer(0)
               incrementPlayCount()
             } else {
                stopPlaying()
                setPlayCount(0)
                if (props.onEnded) props.onEnded()
                seekPlayer(0)
             }  
           } else {
              stopPlaying()
              seekPlayer(0)
              if (props.onEnded) props.onEnded()
           }
         }
         // draw cursor 
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
        //console.log('evcb',ev,autoScroll.current, props.autoScroll,ev.elements[0])
        //console.log('evcbclass', ev.elements[0][0].className.baseVal)
        if (autoScroll.current && gmidiBuffer && gmidiBuffer.current && gmidiBuffer.current.duration > 0) { 
          console.log('seekTo',"W",getWarp(),ev.milliseconds,gmidiBuffer.current.duration,"R",ev.milliseconds/(gmidiBuffer.current.duration*1000)*getWarp())
          //setSeekTo(ev.milliseconds/(gmidiBuffer.current.duration*1000)*getWarp())
          //if (props.mediaController)  props.mediaController.setCurrentTime((ev.milliseconds / 1000)/(gmidiBuffer.current.duration)*getWarp())
          var screenRatio = window.visualViewport.width/window.visualViewport.height
          // allow for small screen mobile in landscape
          const mobileAdjust =  (isMobile && window.visualViewport.height < 400) ? 0.45 : 1
          var finalScroll = ((ev.top) * screenRatio ) * mobileAdjust
          if (lastScrollTo.current!= ev.top ) {
            window.scrollTo(0,finalScroll)
          }
          lastScrollTo.current = ev.top
        }
        colorElements(ev.elements);
    }
    
    
    
    function getWarp() {
      if (props.warp > 0) {
        return parseInt(props.warp * 100)/100
      } else {
        return 1
      }
    }
    
    function getWarpTempo() {
      return parseInt(props.tempo * getWarp())
    }
    
  
  function assignStateOnCompletion(audioContext, midiBuffer, timingCallbacks, cursor) {
     console.log("ASSIGN STATE",audioContext, midiBuffer, timingCallbacks, cursor)
     setAudioContext(audioContext)
     if (midiBuffer && midiBuffer.duration > 0) { 
       setMidiBuffer(midiBuffer)
       if (props.mediaController) props.mediaController.setDuration(midiBuffer.duration)
       setTimingCallbacks(timingCallbacks)
       setCursor(cursor)
       setReady(true)
       setStarted(true)
     } else {
       setReady(false)
       setStarted(false)
     }
  }
    

  function createCursor() {
    var line = document.querySelector("#abc_music_viewer svg line");
    if (line) line.remove()
    // create new cursor
    var svg = document.querySelector("#abc_music_viewer svg");
    if (svg) {
      var cursor = document.createElementNS("http://www.w3.org/2000/svg", "line");
      cursor.setAttribute("class", "abcjs-cursor");
      cursor.setAttributeNS(null, 'x1', 0);
      cursor.setAttributeNS(null, 'y1', 0);
      cursor.setAttributeNS(null, 'x2', 0);
      cursor.setAttributeNS(null, 'y2', 0);
      svg.appendChild(cursor);
      setCursor(cursor)
      return cursor
    } else {
      //console.log("failed to create cursor - missing svg element")
      return 
    }
  }
  
  
    

    function seekPlayer(seekTo, play = false) {
        console.log("SEEK PLAYER",seekTo, play,gmidiBuffer.current, gtimingCallbacks.current)
        try {
          if (gmidiBuffer.current) gmidiBuffer.current.seek(seekTo)
          if (gtimingCallbacks.current) gtimingCallbacks.current.setProgress(seekTo)
        } catch (e) {
           try {
               if (gmidiBuffer.current) gmidiBuffer.current.seek(0)
               if (gtimingCallbacks.current) gtimingCallbacks.current.setProgress(0)
           } catch (e) {}
        }
        try {
          if (gmidiBuffer.current && play)  gmidiBuffer.current.start()
          if (gtimingCallbacks.current && play) gtimingCallbacks.current.start()
        } catch (e) {}
    }

  function startPrimedTune() {
    console.log('startPrimedTune primed tune',seekTo, realProgress, lastSeek, gtimingCallbacks.current,gmidiBuffer.current,getForceStop())
    var emergencyStop = getForceStop()
    if (!emergencyStop) {
      if (gtimingCallbacks && gtimingCallbacks.current && gmidiBuffer && gmidiBuffer.current) {
          if (seekTo > 0) { 
            console.log('startPrimedTune with seek ',seekTo, gmidiBuffer.current.duration)
            seekPlayer(seekTo/gmidiBuffer.current.duration, true)
          } else {
            console.log('startPrimedTune with metronome',gvisualObj)
            //if (gvisualObj && gvisualObj.current)
            seekPlayer(0)
            var o = gvisualObj.current
            // METRONOME COUNT IN ?
            // POSTCONDITIONS
            //  metronomeBeats is >= 0  (number of beats to be generated by metronome, if there are lead in notes, this is beats per bar - beats in anacrusis)
            // delay >= 0 (ms of delay between the metronome last note before triggering playback, if no lead in notes, this is one beat worth of ms)
            var metronomeBeats = o.getBeatsPerMeasure() 
            // 2 bars where there is a pickup
            if (o.getPickupLength() > 0)  metronomeBeats = o.getBeatsPerMeasure() +  (o.getBeatsPerMeasure() - parseInt(o.getPickupLength()/o.getBeatLength())) 
            
            var beatOverflow = o.getPickupLength()/o.getBeatLength() % 1
            var beatDuration = o.millisecondsPerMeasure()/o.getBeatsPerMeasure()
            var delay = beatDuration
            //console.log('timer delay', delay, beatOverflow)
            if (beatOverflow > 0) {
              //var pickupPercent = o.getPickupLength()/o.getBarLength()
              delay = delay - beatOverflow * beatDuration
              //if (pickupPercent
              //console.log('adjust for pickup', pickupPercent, delay)
            }
            //// postcondition - set delay and metronomeBeats (in total)
            //var metronomeBeats = o.getBeatsPerMeasure() - parseInt(o.getPickupLength()/o.getBeatLength())
            //// 2 bars where there is a pickup
            //if (o.getPickupLength() > 0)  metronomeBeats += o.getBeatsPerMeasure()
            //console.log('metro beats','PICKUP LENGTH',o.getPickupLength(),'BEAT LENGTH',o.getBeatLength(), 'BEATS PER MEASURE',o.getBeatsPerMeasure(), 'MS PER MEASURE',o.millisecondsPerMeasure(), 'METRONOME BEATS',metronomeBeats, 'BEAT OVERFLOW',beatOverflow,'BEAT DURATION', beatDuration, 'DELAY',delay)
            
            function startWithMetronome() {
                console.log('start with metro')
                if (props.metronomeCountIn) {
                  var warp =  props.warp > 0 ? props.warp : 1
                  metronome.current = new Metronome(props.tunebook.abcTools.cleanTempo(props.tempo * warp), o.getBeatsPerMeasure(), metronomeBeats , function() {
                    // wait one more beat
                    metronomeTimeout.current = setTimeout(function() {
                      gmidiBuffer.current.start()
                      gtimingCallbacks.current.start()
                    },delay)
                  });
                  logtime('start metronome')
                  metronome.current.start()
                } else {
                    logtime('start NO metronome')
                    gmidiBuffer.current.start()
                    gtimingCallbacks.current.start()
                }
              
            }
            // SPEAK THE TITLE ?
            var speakTitle = localStorage.getItem('bookstorage_announcesong') === "true" ? true : false
            if (speakTitle && tune) {
              //console.log('speak',tune)
              var toSpeak = tune.name
              if (tune.composer) toSpeak += " by " + tune.composer
              window.speak(toSpeak)
              setTimeout(function() {
                startWithMetronome()
              }, 1000)
            } else {
              startWithMetronome()
            }
          }
      } else {
        // try again
        console.log('startPrimedTune primed tune NO BUFFER')
        //setTimeout(function() {
          //startPrimedTune()
        //},5000)
      }
      //console.log('started primed tune')
    } else {
      stopPlaying()
    }
  }

  function startPlaying() {
      //console.log(gaudioContext,gmidiBuffer,gvisualObj,gtimingCallbacks,gcursor)
      setForceStop(false)
      if (gaudioContext.current && gmidiBuffer.current) {
          console.log('start playing ok - tune primed')
      
          startPrimedTune()
          if (props.onStarted) props.onStarted()
      } else {
          console.log('start playing NOT ok ')
          setStarted(true)
            createPlayer(o).then(function(p) {
                  console.log("CREATED PLAYER",  props.autoPrime,  props.autoStart)
                 var [audioContext, midiBuffer, timingCallbacks, cursor] = p
                 assignStateOnCompletion(audioContext, midiBuffer, timingCallbacks, cursor)
                 setSeekTo(0)
                 setPlayCount(0)
                 if (audioContext && props.autoStart) {
                   setIsPlaying(true)
                   if (props.onStarted) props.onStarted()
                 }
            }).catch(function(e) {
              console.log('REJECT CREATE PLAYER')
              setReady(false)
              setStarted(false)
              if (props.onStopped) props.onStopped()
              //setIsPlaying(false)
            })
          
      }
  }
    
  function stopPlaying()  {
    console.log('STOP PLAYING',gaudioContext,gmidiBuffer,gvisualObj,gtimingCallbacks,gcursor)
    if (metronome.current) metronome.current.stop()
    clearTimeout(metronomeTimeout.current)
    if (gtimingCallbacks && gtimingCallbacks.current) gtimingCallbacks.current.pause();
    if (gmidiBuffer && gmidiBuffer.current) gmidiBuffer.current.pause();
    //console.log('stopPlaying')
    setForceStop(true)
    setIsPlaying(false)
    if (props.onStopped) props.onStopped()
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

  function primeTune(audioContext, visualObj, force = false) {
    
      return new Promise(function(resolve,reject) {
          console.log('PRIME TUNE', audioContext, visualObj,props)
          if (visualObj) {
            setMidiBuffer(null)
            var midiBuffer = new abcjs.synth.CreateSynth()
            var count = 0
            // for development, run a server on 4000 to access sound fonts
            var a=process.env.NODE_ENV === "development" ? 'http://localhost:4000' : ''
            //var warp =  props.warp > 0 ? props.warp : 1
            var initOptions = {
              onPlaying: function(details) {
                //console.log('abconplay',details,midiBuffer.duration)
                //realProgress.current = details.timePlayed
                if (midiBuffer.duration > 0) setSeekTo((details.timePlayed + details.startOffset)/midiBuffer.duration)
              }, 
              visualObj: visualObj,
              //audioContext: gaudioContext,
               options:{
                 soundFontUrl: a + '/midi-js-soundfonts/abcjs',
                 soundFontVolumeMultiplier: 1.6,
                 //program: 21,
                 chordsOff: false,
                 //options: {
                     //program: 21,
                     //chordsOff: true
                 //},
                 warp: getWarp(),
                 programOffsets: {
                    "bright_acoustic_piano": 40,
                    "honkytonk_piano": 40,
                    "electric_piano_1": 30,
                    "electric_piano_2": 30,
                    "harpsichord": 40,
                    "clavinet": 20,
                    "celesta": 20,
                    "glockenspiel": 40,
                    "vibraphone": 30,
                    "marimba": 35,
                    "xylophone": 30,
                    "tubular_bells": 35,
                    "dulcimer": 30,
                    "drawbar_organ": 20,
                    "percussive_organ": 25,
                    "rock_organ": 20,
                    "church_organ": 40,
                    "reed_organ": 40,
                    "accordion": 40,
                    "harmonica": 40,
                    "acoustic_guitar_nylon": 20,
                    "acoustic_guitar_steel": 30,
                    "electric_guitar_jazz": 25,
                    "electric_guitar_clean": 15,
                    "electric_guitar_muted": 35,
                    "overdriven_guitar": 25,
                    "distortion_guitar": 20,
                    "guitar_harmonics": 30,
                    "electric_bass_finger": 15,
                    "electric_bass_pick": 30,
                    "fretless_bass": 40,
                    "violin": 105,
                    "viola": 50,
                    "cello": 40,
                    "contrabass": 60,
                    "trumpet": 10,
                    "trombone": 90,
                    "alto_sax": 20,
                    "tenor_sax": 20,
                    "clarinet": 20,
                    "flute": 50,
                    "banjo": 50,
                    "woodblock": 20,
                 }
               },
              
            }
            //console.log('prime init options',initOptions)
            //console.log('prime init options',initOptions)
            var tune = props.tunebook.abcTools.abc2json(props.abc)
            if (tune.soundFonts === 'online')  initOptions.options.soundFontUrl = null
            if (visualObj.visualTranspose > 0 || visualObj.visualTranspose < 0 ) {
              initOptions.options.midiTranspose = parseInt(visualObj.visualTranspose)
            }
         
            function getAudioHash(tune) {
              return tune.id + "-" + props.tunebook.abcTools.cleanTempo(props.tempo)+'-'+tune.transpose+"-"+props.tunebook.utils.hash(props.tunebook.abcTools.getNotesFromAbc(props.abc))
            }
            
            function resolveWithTimingAndCursor(midiBuffer) {
              //console.log('resolveWithTimingAndCursor',props.tempo,getWarp())
              var timingCallbacks = new abcjs.TimingCallbacks(visualObj, {
                beatCallback: beatCallback,
                eventCallback: function(ev) {eventCallback(ev)},
                qpm: getWarpTempo(),
                //lineEndCallback	: function() {
                  //if (isPlayingRef && isPlayingRef.current) global.window.scrollBy(0,90)
                //},
                //lineEndAnticipation: 500
              })
              var cursor = createCursor()
              resolve({midiBuffer, timingCallbacks, cursor})
            }
             
            function primeAndResolve() {
               //logtime('preinit primresolve',force)
                if (force) { 
                  midiBuffer.init(initOptions).then(
                  function (response) { 
                    //console.log('iniprime',initOptions)
                    //logtime('preinit pr inited')
                    midiBuffer.prime().then(function(presponse) {
                      //logtime('preinit prime tune primed AAA')
                      //console.log('preinit prime tune primed', presponse, midiBuffer)
                      //if (props.setMidiData) props.setMidiData(abcjs.synth.getMidiFile(visualObj, { midiOutputType: 'binary', bpm: tune.tempo ? tune.tempo : 100 }))
                      if (tune && tune.id && props.cacheAudio !== false) { 
                        saveAudioToCache(getAudioHash(tune),midiBuffer.audioBuffers, midiBuffer.duration).then(function() {
                          //logtime('created audio')
                          resolveWithTimingAndCursor(midiBuffer)
                        })
                      } else {
                        //logtime('audio from cache???')
                        resolveWithTimingAndCursor(midiBuffer)
                      }
                    })
                    .catch(function (error) {
                      console.log("prime synth error", error);
                      resolve(null)
                    })
                  }).catch(function (error) {
                     console.log("init synth error", error);
                    resolve(null)
                  })
                } else {
                  resolve(null)
                }
             }

              
              if ((tune && tune.id)) {
               //logtime('preget audio')
                if (props.cacheAudio !== false) {
                    getAudioFromCache(getAudioHash(tune)).then(function(audioResult) {
                        //console.log('GOT',audioResult)
                        if (audioResult) {
                          
                          const [duration, audioBuffers] = audioResult
                          if (audioBuffers) {
                            //console.log('GOT BUF',audioBuffers, duration, initOptions)
                             midiBuffer.init(initOptions).then(function (response) { 
                                midiBuffer.audioBuffers = audioBuffers
                                midiBuffer.duration = duration 
                                resolveWithTimingAndCursor(midiBuffer)
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
              } else {
                  primeAndResolve()
              }

          } else {
              reject(null)
          }
      }) 
  }
                    
    async function saveAudioToCache(tuneId,audioBuffers, duration) {
      //console.log('saveaudio', typeof tuneId,':',tuneId, audioBuffers, duration)
      if (duration > 0) {
        //let encoder = new Encoder();
        //var serialized = audioBuffers.map(function(buffer) {return encoder.execute(buffer)}) 
        //console.log('saveaudio serialized',serialized )
        var converter = new MP3Converter()
        converter.convertAudioBuffer(audioBuffers[0], {
            bitRate: 96
        }).then(function (blob) {
          //console.log('SAVEaudio converted',blob)
          store.setItem(tuneId, [duration, blob] ).then(function () {
            return store.getItem(tuneId);
          })
        })
        
      }
    }
    
    async function getAudioFromCache(tuneId) {
      //console.log('getaudio',tuneId)
      //let decoder = new Decoder();
      return store.getItem(tuneId).then(function (val) {
        if (val && Array.isArray(val)) {
          //console.log('getaudio got',tuneId,val)
          const [duration, buffers] = val;
          const context = new AudioContext();
          return buffers.arrayBuffer().then(function(arrayBuffer) {
            //console.log('getaudio got',duration, buffers, arrayBuffer)
            //var audioBuffer = await 
            return context.decodeAudioData(arrayBuffer).then(function(audioBuffer) {
              //console.log('getaudio decoded',audioBuffer)
              return [duration, [audioBuffer,audioBuffer]]
            })
          })
          
        } else {
          //console.log('getaudio noval',tuneId)
          return
        }
      })
    }

  const primeTimerRef = useRef(null);
  
  function createPlayer(visualObj) {
      return new Promise(function(resolve, reject) {
        console.log('CREATE PLAYER', visualObj)
        if (visualObj) {
            // already created
            if (gmidiBuffer.current && gtimingCallbacks.current && gcursor.current && gaudioContext.current) {
                console.log('CREATE PLAYER ALREADY EXIST')
            } 
            if (true) {
                //console.log('CREATE PLAYER HAVE VISUAL OBJ')
                primeAudio().then(function(audioContext) {
                  console.log('CREATE PLAYER AUDIO PRIMED',audioContext)
                    if (audioContext) {
                        //console.log('tune update have audio context')
                        //setReady(false)
                        //renderActive = true
                        if (primeTimerRef && primeTimerRef.current) clearTimeout(primeTimerRef.current)
                        //console.log('PRIME SET TIMEOUT')
                        
                        primeTimerRef.current = setTimeout(function() {
                          console.log('PRIME TIMEOUT doiT')
                          primeTune(audioContext, visualObj).then(function(primeParams) {
                             if (primeParams) {
                               const {midiBuffer, timingCallbacks, cursor} = primeParams
                               resolve([audioContext, midiBuffer, timingCallbacks, cursor, visualObj])
                             } else {
                               resolve([audioContext, null,null,null, visualObj])
                             }
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
            }
        } else reject('Missing rendered tune')
    })
  }
  
  

  

  function clickListener(abcelem, tuneNumber, classes, analysis, drag, mouseEvent) {
    //console.log('CLICK ELEM',abcelem,abcelem.type,abcelem.el_type) //props.onClickTempo,abcelem.type, ms,abcelem, tuneNumber, classes, analysis, drag, mouseEvent,gmidiBuffer) //, tuneNumber, classes, analysis, drag, mouseEvent)
    //console.log('click')
    
    if (abcelem && abcelem.type === 'tempo' && props.editableTempo) { // && props.onClickTempo) {props.onClickTempo() 
      //console.log('CLICK tempo')
      setShowTempo(true)
    }
    if (abcelem && (abcelem.el_type === 'clef' || abcelem.el_type === 'keySignature')) { // && props.onClickTempo) {props.onClickTempo() 
      //console.log('CLICK transpose')
      setShowTranspose(true)
    }
    var ms = (Array.isArray(abcelem.currentTrackMilliseconds) && abcelem.currentTrackMilliseconds.length > 0) ? abcelem.currentTrackMilliseconds[0] : abcelem.currentTrackMilliseconds
    
    //console.log('click seek ?',gtimingCallbacks.duration,gmidiBuffer.current,gtimingCallbacks.current)
    if (gmidiBuffer && gmidiBuffer.current) gmidiBuffer.current.seek(Math.floor(ms)/1000,'seconds')
     //console.log('click')
    if (gtimingCallbacks && gtimingCallbacks.current) gtimingCallbacks.current.setProgress(Math.floor(ms)/1000,'seconds')
    if (gmidiBuffer.current && gmidiBuffer.current.duration && gmidiBuffer.current.duration > 0) setSeekTo(Math.floor(ms/gmidiBuffer.current.duration)/1000)
    
    
    if (props.onClick)  props.onClick(abcelem, tuneNumber, classes, analysis, drag, mouseEvent)
    
  }
  
  
  
  function renderTune(abcTune) {
    console.log('RENDER TUNE')
    if (inputEl) { // && !renderActive) {
      console.log('RENDER TUNE aa')
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
          selectTypes: ['note','tempo','clef','keySignature']
        }
        var tune = props.tunebook.abcTools.abc2json(abcTune)
        if (tune.transpose > 0 || tune.transpose < 0 ) {
          renderOptions.visualTranspose= tune.transpose
        }
        //console.log('SS',props.scale)
        if (props.scale && props.scale > 0) {
          renderOptions.scale = props.scale
        }
        if (tune && tune.tablature && props.tunebook.abcTools.tablatureConfig.hasOwnProperty(tune.tablature)) {
          renderOptions.tablature = [props.tunebook.abcTools.tablatureConfig[tune.tablature]]
        } 
        if (props.tempo > 0) tune.tempo = props.tempo 
        var res = abcjs.renderAbc(inputEl.current, props.tunebook.abcTools.json2abc(tune), renderOptions );
            
        var o = res && res.length > 0 ? res[0] : null
        console.log('RENDERED TUNE tempo',o) //props.tempo,'pickup', o.getPickupLength(), 'beatlenght',o.getBeatLength(), 'beats per measure',o.getBeatsPerMeasure(), 'bar length',o.getBarLength(), 'bpm',o.getBpm(), 'mspermeasure',o.millisecondsPerMeasure(), o.getTotalBeats(), o.getTotalTime())
        if (o) {
            if (props.onWarnings) props.onWarnings(o.warnings)
             //&& (isPlayingRef.current || isPlaying)
            if (props.tempo) {
              
              //props.audioProps.
               setVisualObj(o)
               //if (props.autoPrime)  setStarted(true)
               var hash = tune.transpose  + '-' + props.meter + '-' + props.key + '-' + props.tempo + '-' + abcTools.getTuneHash(tune) //hash = props.tunebook.utils.hash((tune.notes ? tune.notes.join("") : '')+props.tempo+tune.tempo+tune.meter+tune.noteLength+tune.transpose)
               if (props.autoPrime && hash !== audioChangedHash) {
                console.log('RENDER TUNE AUDIODDD')
                setAudioChangedHash(hash)
                setStarted(true)
                createPlayer(o).then(function(p) {
                      console.log("CREATED PLAYER",  props.autoPrime,  props.autoStart)
                     var [audioContext, midiBuffer, timingCallbacks, cursor] = p
                     assignStateOnCompletion(audioContext, midiBuffer, timingCallbacks, cursor)
                     if (audioContext && props.autoStart) {
                       setIsPlaying(true)
                       if (props.onStarted) props.onStarted()
                     }
                }).catch(function(e) {
                  console.log('REJECT CREATE PLAYER')
                  setReady(false)
                  setStarted(false)
                  if (props.onStopped) props.onStopped()
                  //setIsPlaying(false)
                })
              
              } else {
                console.log('SKIP RENDER TUNE AUDIO no hash change OR AUTOPRIME', props.autoPrime)
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
 
    //function clickPlay(seekTo) {
        //console.log('onClickHandler PLAY',seekTo)
        //if (playTimerRef && playTimerRef.current) {
          ////console.log('onClickHandler DOUBLE')
            //clearTimeout(playTimerRef.current)
            //playTimerRef.current = null
            //setPlayCount(0)
            ////seekPlayer(0)
            //setSeekTo(seekTo > 0 ? parseInt(seekTo) : 0)
            ////setIsWaiting(true); 
            //setIsPlaying(true);
        //} else {
          ////console.log('onClickHandler start')
            //playTimerRef.current = setTimeout(() => {
              ////console.log('onClickHandler TIMEOUT TO SINGLE')
                //clearTimeout(playTimerRef.current)
                ////setIsWaiting(true); 
                //setIsPlaying(true);
                //playTimerRef.current = null
                
            //}, 500)
        //}
        
    //};

      
  //function bodyClick(enable) { 
    //if (!started) {
      //console.log('BODYCLICK')
      ////setStarted(true)
      //if (enable) enable() // enable no sleep 
      //clickInit()
    //}
  //}
    
  
  //function clickInit(playing) {
      //console.log('CLICK INIT', gvisualObj)
      //if (gvisualObj && gvisualObj.current) {
        //setReady(false)
        //setStarted(true)
        ////setIsPlaying(false)
        //if (props.mediaController) props.mediaController.setIsLoading(true)
        //createPlayer(gvisualObj.current).then(function(p) {
          //var [audioContext, midiBuffer, timingCallbacks, cursor] = p
           //if (props.mediaController) props.mediaController.setIsLoading(false)
           //assignStateOnCompletion(audioContext, midiBuffer, timingCallbacks, cursor)
           //if (playing) setIsPlaying(true)
        //})
      //}
  //}
   
  
    
    //useEffect(() => {
        //setSeekTo(forceSeekTo)
        //seekPlayer(forceSeekTo)
    //}, [forceSeekTo]);

    // start stop synth when isPlaying changes
    //useEffect(() => {
        //console.log("CHANGE isplaying ",isPlaying)
        //if (isPlaying) {
          //startPlaying()
        //} else {
          //stopPlaying()
        //}
    //}, [isPlaying]); 

  
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
  if (tapToPlay) {
        return <>
      <Modal   show={true} onHide={function() {props.mediaController.stop(); setTapToPlay(false); setPlayCancelled(true); }}>
            <Modal.Header closeButton>
              <Modal.Title>Click to allow autoplay</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <Button variant="success"  onClick={function() {setTapToPlay(false)}}  >Play</Button>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
                <Button variant="danger" onClick={function() {props.mediaController.stop(); setPlayCancelled(true); setTapToPlay(false)}} >Cancel</Button>
            </Modal.Body>
      </Modal>
      </>
  } else {
     return (
      <>
       <TempoControl showTempo={showTempo} setShowTempo={setShowTempo} value={props.tempo} onChange={function(e) {
         //console.log("TEMPO CHANGE",e)
          //var tuneLocal = props.tunebook.abcTools.abc2json(props.abc)
          //var tune = tuneLocal[tuneLocal.id]
          var tune = props.tunebook.abcTools.abc2json(props.abc)
          if (tune) {
            tune.tempo = e
            //console.log("TEMPO CHANGE",e,tune,props.abc)
            props.tunebook.saveTune(tune)
            updateOnChange()
            if (props.forceRefresh) props.forceRefresh()
          }
        }} />
       <ReactNoSleep>
            {({ isOn, enable, disable }) => (
              <span >
                 <TransposeModal show={showTranspose} setShow={setShowTranspose} tune={tune} saveTune={props.tunebook.saveTune} forceRefresh={props.forceRefresh} />
               
                WARP{props.warp}
               {(props.repeat > 1) && <Button style={{float:'right'}} variant="primary" >{props.tunebook.icons.timer2line} {(props.repeat - playCount )}</Button>}
                {props.link && <Link style={{color: 'black', textDecoration:'none'}}  to={"/tunes/"+tune.id} ><div id="abc_music_viewer" ref={inputEl} ></div></Link>}
                {(!props.link && !props.hideSvg) && <div id="abc_music_viewer" ref={inputEl} ></div>}
              </span>
            )}
        </ReactNoSleep></>
      );
    }
}

  //{(props.tempo) ? <span  >
              //{!props.hidePlayer && <AbcPlayButton forceRefresh={props.forceRefresh} tune={tune}  started={started} ready={ready}  isPlaying={isPlaying} setIsPlaying={setIsPlaying} clickInit={function(e) {clickInit(true) }} clickPlay={clickPlay}  clickRecord={clickRecord} clickStopPlaying={stopPlaying} tunebook={props.tunebook} />  }
            //</span> : null}

//{(gaudioContext && gaudioContext.current && !props.hidePlayer) && <input className="abcprogressslider" type="range" min='0' max='1' step='0.0001' value={seekTo} onChange={function(e) {setForceSeekTo(e.target.value)}}  style={{marginTop:'0.5em',marginBottom:'0.5em', width:'100%'}}/>}

        //style={{position:'fixed', top: 4, right: 4, zIndex: 66}}   
// onClick={function(e) {bodyClick(enable)}}
