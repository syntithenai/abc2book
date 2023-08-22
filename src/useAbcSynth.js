import {useState, useEffect, useRef} from 'react'
import * as localForage from "localforage";
import useAbcTools from './useAbcTools'
import {isMobile} from 'react-device-detect'
import abcjs from "abcjs";
import Metronome from './Metronome'

import MP3Converter from './MP3Converter'

export default function useAbcSynth(props) {
    
    const metronomeTimeout = useRef(null)
    const metronome = useRef(null)
    const gaudioContext = useRef(null)
    const gmidiBuffer = useRef(null)
    const gvisualObj = useRef(null)
    const gtimingCallbacks = useRef(null)
    const gcursor = useRef(null)
    const isLoading = useRef(null)
    const currentTime = useRef(0)
    
    const [tune, setTune] = useState(props.tunebook.abcTools.abc2json(props.abc))
    
    const [showTempo, setShowTempo] = useState(false)
    const [showTranspose, setShowTranspose] = useState(false)
    const [clickSeek, setClickSeek] = useState(0)
    const [tapToPlay, setTapToPlay] = useState(false)
    const [playCancelled, setPlayCancelled] = useState(false)
    
    
    const [abcTune, setAbcTune] = useState(props.abc);
    const [lastAbc, setLastAbc] = useState(null);
    const [lastTuneId, setLastTuneId] = useState(null);
    const [lastTempo, setLastTempo] = useState(null);
    const [lastBoost, setLastBoost] = useState(null);
    const [lastMediaLinkNumber, setLastMediaLinkNumber] = useState(null);
    const [lastPlaybackSpeed, setLastPlaybackSpeed] = useState(1)
    const [audioChangedHash, setAudioChangedHash] = useState(null)
    
    const [isPlaying, setIsPlaying] = useState(false)
    const [isLastPlaying, setIsLastPlaying] = useState(false)
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
    
     
    
    function getWarp() {
      if (props.warp > 0) {
        return parseInt(props.warp * 100)/100
      } else {
        return 1
      }
    }
    
    function getWarpTempo() {
      return parseInt(tune.tempo * getWarp())
    }
    
    
    const programOffsets = {
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
     
     
      //// listen to properties on media controller to control local player
    useEffect(function() {
        console.log("SYNTH change", props.mediaController)
        //if (props.mediaController) console.log("SYNTH",[(props.mediaController ? props.mediaController.isPlaying : null), (props.mediaController ? props.mediaController.clickSeek : null), (props.mediaController ?  props.mediaController.mediaLinkNumber : null), (props.mediaController ? props.mediaController.playbackSpeed : null), (props.mediaController ? props.mediaController.midiHash.current : null), (props.mediaController && props.mediaController.tune ? props.mediaController.tune.id : null)]) 
        //props.mediaController.isPlaying, isLastPlaying,"TIME", props.mediaController.currentTime,"CLICKTIME", props.mediaController.clickSeek,clickSeek,  props.mediaController.mediaLinkNumber, props.mediaController.midiHash.current, props.mediaController.mediaLinkNumber,lastMediaLinkNumber)
        if (props.mediaController && props.mediaController.mediaLinkNumber === null) {
            if (props.mediaController.playbackSpeed !== lastPlaybackSpeed) {
                //console.log("SYNTH play speed change", props.mediaController.playbackSpeed)
                stopPlaying()
                resetAudioState()
            }
            var nowTuneId = props.mediaController.tune ? props.mediaController.tune.id : null
            if (nowTuneId !== lastTuneId) {
                //console.log("SYNTH tune id change to",props.mediaController.tune.id)
                //stopPlaying()
                resetAudioState()
                if (props.mediaController.isPlaying) {
                    //stopPlaying()
                    //setTimeout(function() {
                        startPlaying(true)
                    //},100)
                } 
                
            }
            if (props.mediaController.mediaLinkNumber !== lastMediaLinkNumber) {
                //console.log("SYNTH medialinknumber change to",props.mediaController.mediaLinkNumber)
                //stopPlaying()
                resetAudioState()
                if (props.mediaController.isPlaying) {
                    startPlaying()
                } else {
                     //console.log("SYNTH medialinknumber change not playing, reset audio")
                    //resetAudioState()
                }
            } 

            if (props.mediaController.currentTime == 0 ||props.mediaController.clickSeek !== clickSeek) {
                //console.log("SYNTH click seek change", props.mediaController.clickSeek)
                if (gmidiBuffer.current) {
                    setSeekTo(props.mediaController.clickSeek * gmidiBuffer.current.duration)
                    seekPlayer(parseFloat(props.mediaController.clickSeek))
                    currentTime.current = parseFloat(props.mediaController.clickSeek)  * gmidiBuffer.current.duration
                }
                //if (props.mediaController.isPlaying) {
                    ////console.log('SYNTH change play')
                    //startPlaying()
                //} else {
                    ////console.log('SYNTH change stop',gmidiBuffer.current)
                    //stopPlaying()
                //}
            }
            if (props.mediaController.isPlaying !== isLastPlaying) {
                console.log("SYNTH playing change to ",props.mediaController.isPlaying)
                if (props.mediaController.isPlaying) {
                    //console.log('SYNTH change play')
                    startPlaying()
                } else {
                    //console.log('SYNTH change stop',gmidiBuffer.current)
                    stopPlaying()
                }
            }
        
        //if (props.mediaController && props.mediaController.mediaLinkNumber === null) {
            ////console.log("SYNTH change have link")
            ////if (lastPlaybackSpeed !== props.mediaController.playbackSpeed) {
                ////console.log("SYNTH changewarp change", props.mediaController.playbackSpeed)
                ////resetAudioState()
            ////}
            ////if (props.mediaController.currentTime == 0 || clickSeek !== props.mediaController.clickSeek) {
                ////console.log('SYNTH changeseek change',props.mediaController.clickSeek,props.mediaController.duration, props.mediaController.midiHash.current)
                ////setSeekTo(props.mediaController.clickSeek)
                ////seekPlayer(parseFloat(props.mediaController.clickSeek))
                ////currentTime.current = parseFloat(props.mediaController.clickSeek)
            ////}
            //if (props.mediaController.isPlaying) {
                //console.log('SYNTH  change start')
                ////if (props.mediaController.isPlaying) {
                    //console.log('SYNTH change play')
                    ////bodyClick()
                    //startPlaying()
                ////} else {
                    ////console.log('MP change stop',gmidiBuffer.current)
                    ////stopPlaying()
                ////}
            //} else {
                 //console.log('SYNTH  change STOP')
                //stopPlaying()
            //}
            setLastTuneId(props.mediaController && props.mediaController.tune ? props.mediaController.tune.id : null)
            setClickSeek(props.mediaController.clickSeek)
            setLastPlaybackSpeed(props.mediaController.playbackSpeed)
            setIsLastPlaying(props.mediaController.isPlaying)
            
        }  else {
            //console.log('USE MEDIA SO CLEAR MIDI')
            resetAudioState()
        }
        if (props.mediaController) setLastMediaLinkNumber(props.mediaController.mediaLinkNumber)
        //return function cleanup() {
           //console.log('ABC CLEANUP')
           //resetAudioState()
        //}
        
    },[(props.mediaController ? props.mediaController.isPlaying : null), (props.mediaController ? props.mediaController.clickSeek : null), (props.mediaController ?  props.mediaController.mediaLinkNumber : null), (props.mediaController ? props.mediaController.playbackSpeed : null), (props.mediaController ? props.mediaController.midiHash.current : null), (props.mediaController && props.mediaController.tune ? props.mediaController.tune.id : null)])
    
     useEffect(function() {
         //console.log('TTP',tapToPlay , playCancelled)
         if (props.mediaController && props.mediaController.mediaLinkNumber === null) {
             if (!tapToPlay && !playCancelled) {
                 //console.log('TTP play',gaudioContext.current)
                 if (gaudioContext.current && gaudioContext.current.state == "running") {
                     //console.log('TTP play OK')
                     startPlaying()
                 } else {
                     //console.log('TTP play fail')
                     stopPlaying()
                 } 
                //startPlaying()
                //setPlayCancelled(false)
             } else {
                 //setPlayCancelled(false)
                 //setTapToPlay(false)
             }
         }
     },[tapToPlay])
     
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
    
    function beatCallback(currentBeat,totalBeats,lastMoment,position, debugInfo) {
        //console.log('BEAT',props.mediaController,gmidiBuffer.current,'MM',currentBeat,totalBeats,lastMoment,position, debugInfo, props.mediaController)
        //console.log('seekTo',"W",currentBeat, totalBeats, props.mediaController.duration, sto * props.mediaController.duration)
        //if (gmidiBuffer && gmidiBuffer.current && props.mediaController) {
            ////setForceSeekTo(sto)
            //const sto = currentBeat/ totalBeats //* gmidiBuffer.current.duration
            //console.log('time from BEAT',sto)
            ////if (props.mediaController.isPlaying) props.mediaController.seek(sto)
        //}
        props.mediaController.onAbcTimeUpdate(currentBeat/ totalBeats * gmidiBuffer.current.duration)
        currentTime.current = currentBeat/ totalBeats * gmidiBuffer.current.duration
         // FINISHED PLAYBACK
        // detect end of tune and handle repeats/call props.onEnded
         if (currentBeat === totalBeats) {
           //console.log('end tune', playCountRef.current, props.repeat)
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
        if (isPlaying && autoScroll.current && gmidiBuffer && gmidiBuffer.current && gmidiBuffer.current.duration > 0) { 
          //console.log('seekTo',"W",getWarp(),ev.milliseconds,gmidiBuffer.current.duration,"R",ev.milliseconds/(gmidiBuffer.current.duration*1000)*getWarp())
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
    
    async function  getAudioFromCache(tuneId) {
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
    
    
    function startPlaying(force = false) {
        //console.log(gaudioContext,gmidiBuffer,gvisualObj,gtimingCallbacks,gcursor)
        setForceStop(false)
        //console.log("SYNTH START PLAYING",tune, isPlaying, force)
        if (gaudioContext.current && gmidiBuffer.current) {
          //console.log('start playing ok - tune primed')

          startPrimedTune(force)
          if (props.onStarted) props.onStarted()
        } else {
            //console.log('start playing NOT ok ')
            setStarted(true)
            //resetAudioState()
            createPlayer(tune, gvisualObj.current).then(function(p) {
                  //console.log("CREATED PLAYER",  props.autoPrime,  props.autoStart)
                 var [audioContext, midiBuffer, timingCallbacks, cursor] = p
                 assignStateOnCompletion(audioContext, midiBuffer, timingCallbacks, cursor)
                 setSeekTo(0)
                 setPlayCount(0)
                 //if (audioContext && props.autoStart) {
                    console.log('start playing NOT ok ')
                   startPlaying(true)
                   //if (props.onStarted) props.onStarted()
                 //}
            }).catch(function(e) {
              console.log('REJECT CREATE PLAYER',e)
              setReady(false)
              setStarted(false)
              if (props.onStopped) props.onStopped()
              //setIsPlaying(false)
            })
          
        }
    }

    function stopPlaying()  {
        //console.log('SYNTH STOP PLAYING',gaudioContext,gmidiBuffer,gvisualObj,gtimingCallbacks,gcursor)
        if (metronome.current) metronome.current.stop()
        clearTimeout(metronomeTimeout.current)
        if (gtimingCallbacks && gtimingCallbacks.current) gtimingCallbacks.current.pause();
        if (gmidiBuffer && gmidiBuffer.current) gmidiBuffer.current.pause();
        //console.log('stopPlaying')
        setForceStop(true)
        setIsPlaying(false)
        if (props.onStopped) props.onStopped()
    }

    function assignStateOnCompletion(audioContext, midiBuffer, timingCallbacks, cursor) {
         //console.log("SYNTH ASSIGN STATE",audioContext, midiBuffer, timingCallbacks, cursor)
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
         isLoading.current = false
    }

  
    function resetAudioState() {
        //console.log('SYNTH RESET AUDIO')
        try {
          //if (props.mediaController) props.mediaController.setDuration(0)
          if (gmidiBuffer.current)  gmidiBuffer.current.stop()
          if (gtimingCallbacks.current) gtimingCallbacks.current.stop()
          delete gmidiBuffer.current
          delete gtimingCallbacks.current
        } catch (e) {}
    }

    function seekPlayer(seekTo, play = false) {
        //console.log("SYNTH SEEK PLAYER",seekTo, play,gmidiBuffer.current, gtimingCallbacks.current)
        if (gmidiBuffer.current)  currentTime.current = seekTo * gmidiBuffer.current.duration
        try {
          if (gmidiBuffer.current) gmidiBuffer.current.seek(seekTo)
          if (gtimingCallbacks.current) gtimingCallbacks.current.setProgress(seekTo)
        } catch (e) {
           try {
               if (gmidiBuffer.current) gmidiBuffer.current.seek(0)
               if (gtimingCallbacks.current) gtimingCallbacks.current.setProgress(0)
           } catch (e) {}
        }
        if (play) startMidiAndTiming()
    }
    
  function startMidiAndTiming() {
       //console.log("start buffer and timing",gmidiBuffer.current)
      try {
          if (gmidiBuffer.current)  gmidiBuffer.current.start()
          if (gtimingCallbacks.current) gtimingCallbacks.current.start()
      } catch (e) {
        console.log("start buffer and timing ERROR")
        console.log(e)
      }
  }
    
  function startPrimedTune(force = false) {
    //console.log('SYNTH startPrimedTune primed tune',currentTime, gmidiBuffer.current.duration, seekTo, 'rp',realProgress, 'clickseek',clickSeek, gtimingCallbacks.current,gmidiBuffer.current,getForceStop())
    var emergencyStop = getForceStop()
    var seekTo = currentTime.current
    if (!isPlaying) { // || force) {
        if (!emergencyStop) {
          if (gtimingCallbacks && gtimingCallbacks.current && gmidiBuffer && gmidiBuffer.current) {
              if (seekTo > 0) { 
                //console.log('SYNTH startPrimedTune with seek ',seekTo, currentTime, gmidiBuffer.current.duration)
                //seekPlayer(seekTo/gmidiBuffer.current.duration, true)
                setIsPlaying(true)
                startMidiAndTiming()
                if (props.onStarted) props.onStarted()
              } else {
                //console.log('SYNTH startPrimedTune with metronome',gvisualObj)
                //if (gvisualObj && gvisualObj.current)
                seekPlayer(0)
                var o = gvisualObj.current
                // METRONOME COUNT IN ?
                // POSTCONDITIONS
                //  metronomeBeats is >= 0  (number of beats to be generated by metronome, if there are lead in notes, this is beats per bar - beats in anacrusis)
                // delay >= 0 (ms of delay between the metronome last note before triggering playback, if no lead in notes, this is one beat worth of ms)
                var metronomeBeats = o.getBeatsPerMeasure() 
                // 2 bars where there is a pickup  
                //  
                if (o.getPickupLength() > 0)  metronomeBeats = (o.getBeatsPerMeasure() + o.getBeatsPerMeasure() - parseInt(o.getPickupLength()/o.getBeatLength())) 
                
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
                    //console.log('start with metro',delay)
                    if (props.metronomeCountIn) {
                      var warp =  props.warp > 0 ? props.warp : 1
                      
                       metronome.current = new Metronome(gaudioContext.current, tune.tempo * warp, o.getBeatsPerMeasure(), metronomeBeats , function() {
                        //console.log('metronome CB')
                        // wait one more beat
                        metronomeTimeout.current = setTimeout(function() {
                            //console.log('metronome CB start')
                            startMidiAndTiming()
                        },delay)
                      }, function() {
                          //console.log('metronome failed CB')
                          setTapToPlay(true)
                      });
                      //console.log('start metronome')
                      metronome.current.start()
                    } else {
                        //console.log('start NO metronome')
                       startMidiAndTiming()
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
            console.log('SYNTH startPrimedTune primed tune NO BUFFER')
            //setTimeout(function() {
              //startPrimedTune()
            //},5000)
          }
          //console.log('started primed tune')
        } else {
            console.log('SYNTH start primed tune emergency stop')
          stopPlaying()
        }
    } else {
        console.log('SYNTH start primed tune already started')
        //stopPlaying()
        //setTimeout(function() {
            //startPlaying()
        //},100)
        //props.mediaController.forceMidiChange()
        if (gtimingCallbacks && gtimingCallbacks.current && gmidiBuffer && gmidiBuffer.current) {
              //if (seekTo > 0) { 
                //console.log('SYNTH REstartPrimedTune with seek ',seekTo, currentTime, gmidiBuffer.current.duration)
                //seekPlayer(seekTo/gmidiBuffer.current.duration, true)
                //setIsPlaying(true)
                startMidiAndTiming()
                if (props.onStarted) props.onStarted()
            //}
        }
    }
  }

  
  function primeAudio() {
      
    return new Promise(function(resolve,reject) {
        var audioContext = null
        if (abcjs.synth.supportsAudio()) {
          //console.log('PRIMAUDIO support ok')
          window.AudioContext = window.AudioContext ||
            window.webkitAudioContext ||
            navigator.mozAudioContext ||
            navigator.msAudioContext;
          audioContext = new window.AudioContext();
            resolve(audioContext)
        } else {
          //console.log('PRIMAUDIO REJECT')
          setTapToPlay(true)
          reject('No audio available')
        }
      //}
    })
  } 

  function primeTune(tune, audioContext, visualObj, force = false) {
      //console.log('PRIME TUNE',tune.tempo, isLoading.current, tune, audioContext, visualObj,props)
      //var tempo = tune ? tune.tempo : 100
      return new Promise(function(resolve,reject) {
          if (isLoading.current) {
              //console.log('ALREADY LOADINGWHEN ATTEMPT PRIME')
              reject()
          }
          isLoading.current = true
          if (props.mediaController) props.mediaController.setIsLoading(true)
          // cleanup first
          //console.log('SYNTH CLEANUP AUDIO BEFORE PRIME')
          resetAudioState()
          if (visualObj) {
            setMidiBuffer(null)
            var midiBuffer = new abcjs.synth.CreateSynth()
            var count = 0
            // for development, run a server on 4000 to access sound fonts
            var a=process.env.NODE_ENV === "development" ? 'http://localhost:4000' : ''
            //var warp =  props.warp > 0 ? props.warp : 1
            var initOptions = {
                audioContext: audioContext,
              //onPlaying: function(details) {
                //if (midiBuffer.duration > 0) setSeekTo((details.timePlayed + details.startOffset)/midiBuffer.duration)
              //}, 
              visualObj: visualObj,
              millisecondsPerMeasure: visualObj.millisecondsPerMeasure(),
              options:{
                 soundFontUrl: a + '/midi-js-soundfonts/abcjs',
                 soundFontVolumeMultiplier: 1.6,
                 //program: 21,
                 chordsOff: false,
                 programOffsets: programOffsets,
               },
            }
            console.log('prime init options',initOptions)
            //var tune = props.tunebook.abcTools.abc2json(props.abc)
            if (tune.soundFonts === 'online')  initOptions.options.soundFontUrl = null
            if (visualObj.visualTranspose > 0 || visualObj.visualTranspose < 0 ) {
              initOptions.options.midiTranspose = parseInt(visualObj.visualTranspose)
            }
         
            function getAudioHash(tune) {
              return tune.id + "-" + tune.tempo  + '-'+tune.transpose+"-"+props.tunebook.utils.hash(props.tunebook.abcTools.getNotesFromAbc(props.abc))
            }
            
            function resolveWithTimingAndCursor(midiBuffer) {
              //console.log('resolveWithTimingAndCursor',props.tempo,getWarp())
              var timingCallbacks = new abcjs.TimingCallbacks(visualObj, {
                beatCallback: beatCallback,
                eventCallback: eventCallback,
                //qpm: getWarpTempo(),
               
              })
              var cursor = createCursor()
              if (props.mediaController) props.mediaController.setIsLoading(false)
              isLoading.current = false
              resolve({midiBuffer, timingCallbacks, cursor})
            }
             
            function primeAndResolve() {
               console.log('preinit primresolve',force)
                //if (force) { 
                  midiBuffer.init(initOptions).then(
                  function (response) { 
                    console.log('iniprime',initOptions)
                    //console.log('preinit pr inited')
                    midiBuffer.prime().then(function(presponse) {
                      console.log('preinit prime tune primed AAA')
                      //console.log('preinit prime tune primed', presponse, midiBuffer)
                      //if (props.setMidiData) props.setMidiData(abcjs.synth.getMidiFile(visualObj, { midiOutputType: 'binary', bpm: tune.tempo ? tune.tempo : 100 }))
                      if (tune && tune.id && props.cacheAudio !== false) { 
                        saveAudioToCache(getAudioHash(tune),midiBuffer.audioBuffers, midiBuffer.duration).then(function() {
                          //console.log('created audio')
                          resolveWithTimingAndCursor(midiBuffer)
                        })
                      } else {
                        //console.log('audio from cache???')
                        resolveWithTimingAndCursor(midiBuffer)
                      }
                    })
                    .catch(function (error) {
                      console.log("prime synth error", error);
                      if (props.mediaController) props.mediaController.setIsLoading(false)
                      isLoading.current = false
                      resolve(null)
                    })
                  }).catch(function (error) {
                     console.log("init synth error", error);
                     if (props.mediaController) props.mediaController.setIsLoading(false)
                     isLoading.current = false
                    resolve(null)
                  })
                //} else {
                  //resolve(null)
                //}
             }

              
              if ((tune && tune.id)) {
               //console.log('preget audio')
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
              if (props.mediaController) props.mediaController.setIsLoading(false)
              isLoading.current = false
              reject(null)
          }
      }) 
  }
                    
  

  const primeTimerRef = useRef(null);
  
  function createPlayer(tune, visualObj) {
      return new Promise(function(resolve, reject) {
        //console.log('CREATE PLAYER', tune, visualObj)
        if (tune && visualObj) {
            // already created
            if (gmidiBuffer.current && gtimingCallbacks.current && gcursor.current && gaudioContext.current) {
                //console.log('CREATE PLAYER ALREADY EXIST')
            } 
            if (true) {
                //console.log('CREATE PLAYER HAVE VISUAL OBJ')
                primeAudio().then(function(audioContext) {
                  //console.log('CREATE PLAYER AUDIO PRIMED',tune, audioContext)
                    if (audioContext) {
                        //console.log('tune update have audio context')
                        //setReady(false)
                        //renderActive = true
                        if (primeTimerRef && primeTimerRef.current) clearTimeout(primeTimerRef.current)
                        //console.log('PRIME SET TIMEOUT')
                        // use timeout to prevent duplicate calls on load
                        primeTimerRef.current = setTimeout(function() {
                          //console.log('PRIME TIMEOUT doiT', tune)
                          primeTune(tune, audioContext, visualObj).then(function(primeParams) {
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
    
  
  return {createCursor, programOffsets, clickListener, beatCallback, eventCallback, metronomeTimeout, metronome, gaudioContext, gmidiBuffer, gvisualObj, gtimingCallbacks, gcursor,  showTempo, setShowTempo,showTranspose, setShowTranspose, clickSeek, setClickSeek, lastPlaybackSpeed, setLastPlaybackSpeed, audioChangedHash, setAudioChangedHash, tapToPlay, setTapToPlay, playCancelled, setPlayCancelled, abcTune, setAbcTune, lastAbc, setLastAbc, lastTempo, setLastTempo, lastBoost, setLastBoost, isPlaying, setIsPlaying, playCount, setPlayCountInner, playCountRef, setPlayCount, incrementPlayCount, lastScrollTo, autoScroll, realProgress, seekTo, setSeekTo, forceSeekTo, setForceSeekTo, ready, setReady, started, setStarted, store, abcTools, inputEl, playTimerRef, setAudioContext, setMidiBuffer, setVisualObj, setTimingCallbacks, setCursor, setForceStop, getForceStop, getWarp, getWarpTempo, saveAudioToCache, getAudioFromCache, startPlaying, stopPlaying, assignStateOnCompletion, resetAudioState, seekPlayer, createPlayer, primeTune, primeAudio, startPrimedTune, tune, setTune, isLastPlaying, setIsLastPlaying}
}



