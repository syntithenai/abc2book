import {useState, useEffect, useRef} from 'react'
import * as localForage from "localforage";
import useAbcTools from './useAbcTools'
import {isMobile} from 'react-device-detect'
import abcjs from "abcjs";
import Metronome from './Metronome'
import MP3Converter from './MP3Converter'
import { getSoundFontUrl, getSoundFontVolumeMultiplier } from './soundFontConfig'
import PitchTempoShifter from './pitchTempoShifter'
import { getPlaybackSettings } from './pitchTempoUtils'
import { isStaleSeekEngineReading, computeMidiMetronomeCountIn, computeExtraMeasuresAtBeginning } from './playbackStateLogic'

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
    const pitchShifterRef = useRef(null)
    const pitchShifterBufferRef = useRef(null)
    const pitchTempoSettingsRef = useRef({ tempo: 1.0, pitch: 0, fineTune: 0 })
    const forceStopRef = useRef(false)
    const playbackGenerationRef = useRef(0)
    const midiPlaybackGuardUntilRef = useRef(0)
    
    const [tune, setTune] = useState(props.tunebook.abcTools.abc2json(props.abc))
    
    const [showTempo, setShowTempo] = useState(false)
    const [showTranspose, setShowTranspose] = useState(false)
    const [clickSeek, setClickSeek] = useState(0)
    const [tapToPlay, setTapToPlay] = useState(false)
    const [playCancelled, setPlayCancelled] = useState(false)

    function setTapToPlayFlag(value) {
        if (!value) {
            if (props.mediaController) {
                props.mediaController.setTapToPlay(false)
            } else {
                setTapToPlay(false)
            }
            return
        }
        if (tryResumeSynthAndStart()) {
            return
        }
        if (props.mediaController) {
            props.mediaController.setTapToPlay(true)
        } else {
            setTapToPlay(true)
        }
    }

    function resumeSynthAudioContext() {
        if (gaudioContext.current && gaudioContext.current.state === 'suspended') {
            gaudioContext.current.resume()
        }
    }

    async function ensureSynthAudioContextRunning() {
        if (!gaudioContext.current) return false
        if (gaudioContext.current.state === 'running') return true
        if (gaudioContext.current.state === 'closed') return false
        try {
            await gaudioContext.current.resume()
        } catch (e) {
            return false
        }
        return gaudioContext.current.state === 'running'
    }

    function showMidiTapToPlay() {
        if (props.mediaController) {
            props.mediaController.setTapToPlay(true)
        } else {
            setTapToPlay(true)
        }
    }

    function handleMidiAudioStartFailure() {
        pauseMidiSynth()
        setIsPlaying(false)
        if (props.mediaController) {
            props.mediaController.setIsLoading(false)
            props.mediaController.setIsPlaying(false)
        }
        showMidiTapToPlay()
    }

    function stopNativeMidiBufferOutput() {
        if (!gmidiBuffer.current) return
        try {
            if (gmidiBuffer.current.isRunning) {
                gmidiBuffer.current.stop()
            } else if (gmidiBuffer.current.pause) {
                gmidiBuffer.current.pause()
            }
        } catch (e) {}
    }

    function startMidiAudioOutput(settings, ratio) {
        if (pitchShifterRef.current) {
            // Never run the native abcjs buffer player alongside the SoundTouch
            // shifter — both play the same rendered buffer and cause level drift.
            stopNativeMidiBufferOutput()
            pitchShifterRef.current.applySettings(settings.tempo, settings.pitch, settings.fineTune)
            // Always apply the position before connecting (including 0), so a
            // reconnect after a seek/rewind starts at the requested point. The
            // previous `ratio > 0` guard let rewind-to-0 keep the old position.
            if (typeof ratio === 'number' && ratio >= 0) {
                pitchShifterRef.current.seek(ratio)
            }
            pitchShifterRef.current.connect()
            midiPlaybackGuardUntilRef.current = Date.now() + 3000
            return pitchShifterRef.current.isConnected()
        }
        if (gmidiBuffer.current) {
            gmidiBuffer.current.start()
            return true
        }
        return false
    }

    function tryResumeSynthAndStart() {
        if (isSynthSeekGuardActive()) return false
        if (!wantsMidiPlayback()) return false
        if (gaudioContext.current) {
            if (gaudioContext.current.state === 'running') {
                startPlaying()
                return true
            }
            if (gaudioContext.current.state === 'suspended') {
                gaudioContext.current.resume().then(function() {
                    if (wantsMidiPlayback()) {
                        startPlaying()
                    }
                }).catch(function() {
                    if (props.mediaController && wantsMidiPlayback()) {
                        props.mediaController.setTapToPlay(true)
                        props.mediaController.setIsPlaying(false)
                        props.mediaController.setIsLoading(false)
                    }
                })
                return true
            }
        } else if (gvisualObj.current) {
            startPlaying()
            return true
        }
        return false
    }

    function getTapToPlay() {
        return props.mediaController ? props.mediaController.tapToPlay : tapToPlay
    }

    function getPlayCancelled() {
        return props.mediaController ? props.mediaController.playCancelled : playCancelled
    }

    function wantsMidiPlayback(force) {
        if (props.mediaController) {
            if (props.mediaController.isMidiPlaybackRoute && !props.mediaController.isMidiPlaybackRoute()) {
                return false
            }
            if (props.mediaController.mediaLinkNumber !== null) return false
            if (force) return true
            if (props.mediaController.hasActivePlaybackIntent && props.mediaController.hasActivePlaybackIntent()) {
                return true
            }
            return !!props.mediaController.isPlaying
        }
        return force || isPlaying
    }

    function isMidiPlaybackActive() {
        if (props.mediaController) {
            if (props.mediaController.isMidiPlaybackRoute && !props.mediaController.isMidiPlaybackRoute()) {
                return false
            }
            if (props.mediaController.mediaLinkNumber !== null) return false
            if (props.mediaController.hasActivePlaybackIntent && props.mediaController.hasActivePlaybackIntent()) {
                return true
            }
            if (props.mediaController.isPlaying) return true
        }
        return isPlaying
    }
    
    
    const [abcTune, setAbcTune] = useState(props.abc);
    const [lastAbc, setLastAbc] = useState(null);
    const [lastTuneId, setLastTuneId] = useState(null);
    const [lastTempo, setLastTempo] = useState(null);
    const [lastBoost, setLastBoost] = useState(null);
    const [lastMediaLinkNumber, setLastMediaLinkNumber] = useState(null);
    const [lastPlaybackSpeed, setLastPlaybackSpeed] = useState(1)
    const lastMidiHashRef = useRef(null)
    const midiStartHandledRef = useRef(false)
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
        forceStopRef.current = !!val
    }
    function getForceStop() {
        return forceStopRef.current
    }
    
     
    
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
    
    
    // abcjs programOffsets trim instrument attack transients (milliseconds), not
    // volume. Large offsets on melody instruments (esp. violin) can make short
    // melody notes nearly inaudible against sustained chord pads.
    const programOffsets = {
        "bright_acoustic_piano": 55,
        "honkytonk_piano": 55,
        "electric_piano_1": 45,
        "electric_piano_2": 45,
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
        "acoustic_guitar_nylon": 15,
        "acoustic_guitar_steel": 20,
        "electric_guitar_jazz": 25,
        "electric_guitar_clean": 15,
        "electric_guitar_muted": 35,
        "overdriven_guitar": 25,
        "distortion_guitar": 20,
        "guitar_harmonics": 30,
        "electric_bass_finger": 15,
        "electric_bass_pick": 30,
        "fretless_bass": 40,
        "violin": 35,
        "viola": 30,
        "cello": 30,
        "contrabass": 40,
        "trumpet": 10,
        "trombone": 90,
        "alto_sax": 15,
        "tenor_sax": 15,
        "clarinet": 15,
        "flute": 18,
        "tin_whistle": 15,
        "recorder": 18,
        "banjo": 30,
        "mandolin": 25,
        "woodblock": 20,
     }
     
     
    function isSynthSeekGuardActive() {
        if (!props.mediaController) return false
        if (props.mediaController.isSeekGuardActive && props.mediaController.isSeekGuardActive()) {
            return true
        }
        if (props.mediaController.shouldSuppressSpuriousPause
            && props.mediaController.shouldSuppressSpuriousPause()) {
            return true
        }
        return false
    }

      //// listen to properties on media controller to control local player
    useEffect(function() {
        //console.log("SYNTH change", props.mediaController)
        //if (props.mediaController) console.log("SYNTH",[(props.mediaController ? props.mediaController.isPlaying : null), (props.mediaController ? props.mediaController.clickSeek : null), (props.mediaController ?  props.mediaController.mediaLinkNumber : null), (props.mediaController ? props.mediaController.playbackSpeed : null), (props.mediaController ? props.mediaController.midiHash.current : null), (props.mediaController && props.mediaController.tune ? props.mediaController.tune.id : null)]) 
        //props.mediaController.isPlaying, isLastPlaying,"TIME", props.mediaController.currentTime,"CLICKTIME", props.mediaController.clickSeek,clickSeek,  props.mediaController.mediaLinkNumber, props.mediaController.midiHash.current, props.mediaController.mediaLinkNumber,lastMediaLinkNumber)
        if (props.mediaController && props.mediaController.mediaLinkNumber === null) {
            const currentMidiHash = props.mediaController.midiHash ? props.mediaController.midiHash.current : null
            if (lastMidiHashRef.current !== undefined && currentMidiHash !== lastMidiHashRef.current) {
                if (props.mediaController.isPlaying && !isSynthSeekGuardActive()) {
                    startPlaying(true)
                }
            }
            lastMidiHashRef.current = currentMidiHash
            if (props.mediaController.playbackSpeed !== lastPlaybackSpeed) {
                syncPitchTempoSettingsFromController()
                pitchTempoSettingsRef.current.tempo = props.mediaController.playbackSpeed > 0
                    ? parseFloat(props.mediaController.playbackSpeed) : 1
            }
            var nowTuneId = props.mediaController.tune ? props.mediaController.tune.id : null
            if (nowTuneId !== lastTuneId) {
                syncPitchTempoSettingsFromController()
                //console.log("SYNTH tune id change to",props.mediaController.tune.id)
                //stopPlaying()
                resetAudioState()
                if (props.mediaController.isPlaying && !isSynthSeekGuardActive()) {
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
                if (props.mediaController.isPlaying && !isSynthSeekGuardActive()) {
                    startPlaying()
                } else {
                     //console.log("SYNTH medialinknumber change not playing, reset audio")
                    //resetAudioState()
                }
            } 

            if (props.mediaController.isPlaying !== isLastPlaying) {
                if (props.mediaController.isPlaying) {
                    if (midiStartHandledRef.current || isSynthSeekGuardActive()) {
                        midiStartHandledRef.current = false
                    } else {
                        startPlaying()
                    }
                } else {
                    if (!isSynthSeekGuardActive()) {
                        midiStartHandledRef.current = false
                        pauseMidiSynth()
                    }
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
            
        }  else if (props.mediaController && props.mediaController.mediaLinkNumber !== lastMediaLinkNumber) {
            stopPlaying()
            resetAudioState()
        }
        if (props.mediaController) setLastMediaLinkNumber(props.mediaController.mediaLinkNumber)
        //return function cleanup() {
           //console.log('ABC CLEANUP')
           //resetAudioState()
        //}
        
    },[(props.mediaController ? props.mediaController.isPlaying : null), (props.mediaController ?  props.mediaController.mediaLinkNumber : null), (props.mediaController ? props.mediaController.midiHash.current : null), (props.mediaController && props.mediaController.tune ? props.mediaController.tune.id : null)])

    function getMidiPlaybackSeconds() {
        // currentTime.current is the single source of truth for the MIDI playhead.
        // It is driven by the abcjs timing callbacks (beat callback), which seek and
        // reset reliably. The SoundTouch pitch/tempo shifter is an audio-only stage:
        // its source position does not reliably reflect seeks/rewinds (and orphaned
        // shifters from the autoStart component swap can report stale positions), so
        // it must never be used as the displayed clock.
        return currentTime.current || 0
    }

    useEffect(function() {
        if (!props.mediaController) return
        props.mediaController.applyMidiTempoRef.current = applyMidiPlaybackSettings
        props.mediaController.applyPlaybackSettingsLiveRef.current = applyMidiPlaybackSettings
        props.mediaController.resumeSynthAudioContextRef.current = resumeSynthAudioContext
        props.mediaController.pauseSynthRef.current = pauseMidiSynth
        props.mediaController.playMidiRef.current = beginMidiPlayback
        if (props.mediaController.resumeMidiAfterSeekRef) {
            props.mediaController.resumeMidiAfterSeekRef.current = resumeMidiAfterSeek
        }
        props.mediaController.stopMidiSynthRef.current = stopMidiSynth
        if (props.mediaController.getMidiPlaybackSecondsRef) {
            props.mediaController.getMidiPlaybackSecondsRef.current = getMidiPlaybackSeconds
        }
        if (props.mediaController.seekMidiRef) {
            props.mediaController.seekMidiRef.current = seekMidiPlayback
        }
    })
    
     useEffect(function() {
         if (isSynthSeekGuardActive()) return
         if (props.mediaController && props.mediaController.isMidiPlaybackRoute
             && props.mediaController.isMidiPlaybackRoute()) {
             if (!getTapToPlay() && !getPlayCancelled()) {
                 const wantsPlay = props.mediaController.hasActivePlaybackIntent
                     ? props.mediaController.hasActivePlaybackIntent()
                     : props.mediaController.isPlaying
                 if (!wantsPlay) return
                 tryResumeSynthAndStart()
             }
         }
     },[
         props.mediaController ? props.mediaController.tapToPlay : tapToPlay,
         props.mediaController ? props.mediaController.playCancelled : playCancelled,
         props.mediaController ? props.mediaController.mediaLinkNumber : null,
     ])
     
     function stopMetronome() {
        if (metronomeTimeout.current) {
            clearTimeout(metronomeTimeout.current)
            metronomeTimeout.current = null
        }
        if (metronome.current) {
            metronome.current.stop()
            metronome.current = null
        }
     }

     function notifyPlaybackStarted() {
        if (!wantsMidiPlayback()) return
        if (props.mediaController) {
            props.mediaController.setTapToPlay(false)
            if (props.mediaController.confirmPlayingStarted) {
                props.mediaController.confirmPlayingStarted()
            }
        } else if (props.onStarted) {
            props.onStarted()
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
        if (pitchShifterRef.current && gmidiBuffer.current && gmidiBuffer.current.duration > 0) {
            pitchShifterRef.current.seek(Math.floor(ms) / 1000 / gmidiBuffer.current.duration)
        }
         //console.log('click')
        if (gtimingCallbacks && gtimingCallbacks.current) gtimingCallbacks.current.setProgress(Math.floor(ms)/1000,'seconds')
        if (gmidiBuffer.current && gmidiBuffer.current.duration && gmidiBuffer.current.duration > 0) setSeekTo(Math.floor(ms/gmidiBuffer.current.duration)/1000)
        
        
        if (props.onClick)  props.onClick(abcelem, tuneNumber, classes, analysis, drag, mouseEvent)
        
    }
    
    function beatCallback(currentBeat,totalBeats,lastMoment,position, debugInfo) {
        const newSeconds = currentBeat / totalBeats * gmidiBuffer.current.duration
        let skipPositionUpdate = false
        if (props.mediaController && props.mediaController.getSeekSettlement) {
            const settlement = props.mediaController.getSeekSettlement()
            if (settlement && isStaleSeekEngineReading(newSeconds, {
                seekTargetSeconds: settlement.target,
                seekFromSeconds: settlement.from,
            })) {
                skipPositionUpdate = true
            }
        }
        if (!skipPositionUpdate) {
            props.mediaController.onAbcTimeUpdate(newSeconds)
            currentTime.current = newSeconds
        }
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
    
    async function getAudioFromCache(tuneId, audioContext) {
      if (!audioContext) return
      return store.getItem(tuneId).then(function (val) {
        if (val && Array.isArray(val)) {
          const [duration, buffers] = val;
          return buffers.arrayBuffer().then(function(arrayBuffer) {
            return audioContext.decodeAudioData(arrayBuffer).then(function(audioBuffer) {
              return [duration, [audioBuffer, audioBuffer]]
            })
          }).catch(function() {
            return null
          })
        }
      })
    }
    
    
    function getBaseQpm() {
        if (!gvisualObj.current) return 120
        const tempo = gvisualObj.current.metaText ? gvisualObj.current.metaText.tempo : null
        return gvisualObj.current.getBpm(tempo) || 120
    }

    function getTempoFactor() {
        const factor = pitchTempoSettingsRef.current.tempo
        return factor > 0 ? factor : 1
    }

    function getEffectiveQpm() {
        return Math.round(getBaseQpm() * getTempoFactor())
    }

    function getExtraMeasuresAtBeginning(visualObj) {
        const o = visualObj || gvisualObj.current
        if (!props.metronomeCountIn || !o) return 0
        return computeExtraMeasuresAtBeginning({
            beatsPerMeasure: o.getBeatsPerMeasure(),
            pickupLength: o.getPickupLength(),
            beatLength: o.getBeatLength(),
            millisecondsPerMeasure: o.millisecondsPerMeasure(),
            tempoFactor: getTempoFactor(),
        })
    }

    function buildTimingCallbacksOptions(visualObj) {
        const opts = {
            beatCallback: beatCallback,
            eventCallback: eventCallback,
            qpm: getEffectiveQpm(),
        }
        const extra = getExtraMeasuresAtBeginning(visualObj)
        if (extra > 0) {
            opts.extraMeasuresAtBeginning = extra
        }
        return opts
    }

    function recreateTimingCallbacksAtTempo(factor, progressRatio, autoStart) {
        if (!gvisualObj.current) return
        const wasRunning = gtimingCallbacks.current && gtimingCallbacks.current.isRunning
        try {
            if (gtimingCallbacks.current) gtimingCallbacks.current.pause()
        } catch (e) {}
        gtimingCallbacks.current = new abcjs.TimingCallbacks(gvisualObj.current, buildTimingCallbacksOptions())
        if (progressRatio > 0) {
            gtimingCallbacks.current.setProgress(progressRatio)
        }
        if (autoStart && (wasRunning || isMidiPlaybackActive())) {
            gtimingCallbacks.current.start()
        }
    }

    function syncPitchTempoSettingsFromController() {
        if (props.mediaController && props.mediaController.tune) {
            const settings = getPlaybackSettings(props.mediaController.tune)
            pitchTempoSettingsRef.current = {
                tempo: settings.tempo,
                pitch: settings.pitch,
                fineTune: settings.fineTune,
            }
        }
    }

    function initPitchShifter(audioContext, audioBuffer) {
        destroyPitchShifter()
        if (!audioBuffer || !audioContext) return
        pitchShifterBufferRef.current = audioBuffer
        syncPitchTempoSettingsFromController()
        pitchShifterRef.current = new PitchTempoShifter(
            audioContext,
            audioBuffer,
            function onTimeUpdate(timePlayed) {
                // Audio-only callback. The timing-callback beat handler is the sole
                // writer of the playhead position; writing it here lets a stale or
                // orphaned shifter fight the real clock and corrupt seek/rewind.
            },
            function onEnded() {
                if (Date.now() < midiPlaybackGuardUntilRef.current) {
                    return
                }
                if (isSynthSeekGuardActive()) {
                    return
                }
                stopPlaying()
                if (props.onEnded) props.onEnded()
            }
        )
        const s = pitchTempoSettingsRef.current
        pitchShifterRef.current.applySettings(s.tempo, s.pitch, s.fineTune)
    }

    function applyMidiPlaybackSettings(tempo, pitch, fineTune) {
        const nextTempo = tempo > 0 ? parseFloat(tempo) : 1
        const nextPitch = pitch !== undefined && pitch !== null
            ? parseInt(pitch, 10) : pitchTempoSettingsRef.current.pitch
        const nextFineTune = fineTune !== undefined && fineTune !== null
            ? parseInt(fineTune, 10) : pitchTempoSettingsRef.current.fineTune
        const tempoChanged = pitchTempoSettingsRef.current.tempo !== nextTempo
        pitchTempoSettingsRef.current = {
            tempo: nextTempo,
            pitch: isNaN(nextPitch) ? 0 : nextPitch,
            fineTune: isNaN(nextFineTune) ? 0 : nextFineTune,
        }
        const ratio = getMidiPlaybackRatio()
        const wasPlaying = isMidiPlaybackActive()
        const settings = pitchTempoSettingsRef.current
        if (wasPlaying) {
            midiPlaybackGuardUntilRef.current = Date.now() + 3000
        }
        if (pitchShifterRef.current) {
            pitchShifterRef.current.applySettings(settings.tempo, settings.pitch, settings.fineTune)
        }
        if (gvisualObj.current && tempoChanged) {
            recreateTimingCallbacksAtTempo(settings.tempo, ratio, wasPlaying)
        }
        if (wasPlaying && pitchShifterRef.current && gaudioContext.current
            && gaudioContext.current.state === 'running') {
            if (tempoChanged) {
                // Restart the audio pipe so SoundTouch tempo changes stay aligned with
                // the recreated timing callbacks and output level stays steady.
                if (pitchShifterRef.current.isConnected()) {
                    pitchShifterRef.current.disconnect()
                }
                startMidiAudioOutput(settings, ratio)
                midiPlaybackGuardUntilRef.current = Date.now() + 3000
            } else if (!pitchShifterRef.current.isConnected()) {
                startMidiAudioOutput(settings, ratio)
                midiPlaybackGuardUntilRef.current = Date.now() + 3000
            }
        }
    }

    function applyMidiTempo(factor) {
        applyMidiPlaybackSettings(factor, pitchTempoSettingsRef.current.pitch, pitchTempoSettingsRef.current.fineTune)
    }

    function setTempoFactor(factor) {
        applyMidiPlaybackSettings(factor, pitchTempoSettingsRef.current.pitch, pitchTempoSettingsRef.current.fineTune)
    }

    function applyPlaybackSettings(settings) {
        applyMidiPlaybackSettings(
            settings && settings.tempo !== undefined ? settings.tempo : 1,
            settings && settings.pitch !== undefined ? settings.pitch : 0,
            settings && settings.fineTune !== undefined ? settings.fineTune : 0
        )
    }
    function destroyPitchShifter() {
        if (pitchShifterRef.current) {
            pitchShifterRef.current.destroy()
            pitchShifterRef.current = null
        }
    }

    function getMidiPlaybackRatio() {
        if (gmidiBuffer.current && gmidiBuffer.current.duration > 0) {
            if (currentTime.current > 0) {
                return currentTime.current / gmidiBuffer.current.duration
            }
            if (props.mediaController && props.mediaController.duration > 0 && props.mediaController.currentTime > 0) {
                return props.mediaController.currentTime / props.mediaController.duration
            }
        }
        return 0
    }

    function getPitchTempoState() {
        return {
            tempo: pitchTempoSettingsRef.current.tempo,
            pitch: pitchTempoSettingsRef.current.pitch,
            fineTune: pitchTempoSettingsRef.current.fineTune,
        }
    }

    function resetPitchTempo() {
        applyMidiPlaybackSettings(1, 0, 0)
    }

    function startPlaying(force = false) {
        if (!force && isSynthSeekGuardActive()) return
        if (!wantsMidiPlayback(force)) return
        setForceStop(false)
        stopMetronome()
        resumeSynthAudioContext()
        if (gaudioContext.current && gmidiBuffer.current) {
          startPrimedTune(force)
        } else {
            //console.log('start playing NOT ok ')
            setStarted(true)
            //resetAudioState()
            createPlayer(tune, gvisualObj.current).then(function(p) {
                  var [audioContext, midiBuffer, timingCallbacks, cursor] = p
                 if (!midiBuffer) {
                   console.log('CREATE PLAYER failed: soundfont or synth prime returned null', getSoundFontUrl())
                   setReady(false)
                   setStarted(false)
                   if (props.mediaController && props.mediaController.abortPlayingIntent) {
                       props.mediaController.abortPlayingIntent()
                   }
                   return
                 }
                 assignStateOnCompletion(audioContext, midiBuffer, timingCallbacks, cursor)
                 setSeekTo(0)
                 setPlayCount(0)
                   startPlaying(true)
            }).catch(function(e) {
              console.log('REJECT CREATE PLAYER', e, getSoundFontUrl())
              setReady(false)
              setStarted(false)
              if (props.mediaController && props.mediaController.abortPlayingIntent) {
                  props.mediaController.abortPlayingIntent()
              }
              if (props.onStopped) props.onStopped()
              //setIsPlaying(false)
            })
          
        }
    }

    function syncTimingCallbacksToSettings(progressRatio) {
        syncPitchTempoSettingsFromController()
        const settings = pitchTempoSettingsRef.current
        if (!gvisualObj.current) return
        const ratio = progressRatio > 0 ? progressRatio : getMidiPlaybackRatio()
        recreateTimingCallbacksAtTempo(settings.tempo, ratio, false)
    }

    function pauseMidiSynth() {
        if (isSynthSeekGuardActive()) return
        stopMetronome()
        // Only write the shared playback position when MIDI is the active engine.
        // enforceExclusivePlayback() stops the (idle) synth when switching to a
        // media route; without this guard that stop would clobber the media
        // position with the synth's 0, restarting media playback from the start.
        const midiIsActiveRoute = !props.mediaController.isMidiPlaybackRoute
            || props.mediaController.isMidiPlaybackRoute()
        if (midiIsActiveRoute && props.mediaController && props.mediaController.setCurrentTime) {
            const seconds = getMidiPlaybackSeconds()
            if (seconds >= 0) {
                props.mediaController.setCurrentTime(seconds)
            }
            const total = props.mediaController.duration > 0
                ? parseFloat(props.mediaController.duration) : 0
            if (total > 0 && props.mediaController.setClickSeek) {
                props.mediaController.setClickSeek(Math.min(1, seconds / total))
            }
        }
        midiPlaybackGuardUntilRef.current = Date.now() + 1000
        stopNativeMidiBufferOutput()
        if (pitchShifterRef.current) pitchShifterRef.current.disconnect()
        if (gtimingCallbacks && gtimingCallbacks.current) gtimingCallbacks.current.pause()
        if (gmidiBuffer && gmidiBuffer.current) gmidiBuffer.current.pause()
    }

    function stopPlaying()  {
        playbackGenerationRef.current += 1
        pauseMidiSynth()
        setForceStop(true)
        setIsPlaying(false)
        if (props.onStopped) props.onStopped()
    }

    function stopMidiSynth() {
        stopMetronome()
        seekPlayer(0)
        currentTime.current = 0
        const midiIsActiveRoute = !props.mediaController.isMidiPlaybackRoute
            || props.mediaController.isMidiPlaybackRoute()
        if (midiIsActiveRoute && props.mediaController) {
            if (props.mediaController.setCurrentTime) props.mediaController.setCurrentTime(0)
            if (props.mediaController.setClickSeek) props.mediaController.setClickSeek(0)
        }
        stopPlaying()
    }

    async function resumeMidiPlayback() {
        if (isSynthSeekGuardActive()) return false
        if (!wantsMidiPlayback(true)) return false
        midiStartHandledRef.current = true
        setForceStop(false)
        stopMetronome()
        resumeSynthAudioContext()
        const ratio = getMidiPlaybackRatio()
        syncTimingCallbacksToSettings(ratio)
        return startMidiAndTiming()
    }

    function beginMidiPlayback() {
        if (isSynthSeekGuardActive()) return
        if (props.mediaController && props.mediaController.isMidiPlaybackRoute
            && !props.mediaController.isMidiPlaybackRoute()) {
            return
        }
        const alreadyPlaying = isMidiPlaybackActive()
        if (alreadyPlaying && pitchShifterRef.current && pitchShifterRef.current.isConnected()
            && gtimingCallbacks.current && gtimingCallbacks.current.isRunning) {
            return
        }
        let ratio = getMidiPlaybackRatio()
        if (ratio <= 0 && props.mediaController) {
            if (props.mediaController.clickSeek > 0) {
                ratio = parseFloat(props.mediaController.clickSeek)
            } else if (props.mediaController.currentTime > 0 && props.mediaController.duration > 0) {
                ratio = props.mediaController.currentTime / props.mediaController.duration
            }
            if (ratio > 0) {
                seekMidiPlayback(ratio)
            }
        }
        if (ratio > 0 && gtimingCallbacks.current && gmidiBuffer.current) {
            if (isSynthSeekGuardActive()) {
                return
            }
            if (alreadyPlaying && pitchShifterRef.current && pitchShifterRef.current.isConnected()
                && gtimingCallbacks.current.isRunning) {
                return
            }
            resumeMidiPlayback()
            return
        }
        midiStartHandledRef.current = true
        setForceStop(false)
        startPlaying(true)
    }

    function assignStateOnCompletion(audioContext, midiBuffer, timingCallbacks, cursor) {
         //console.log("SYNTH ASSIGN STATE",audioContext, midiBuffer, timingCallbacks, cursor)
         setAudioContext(audioContext)
         if (midiBuffer && midiBuffer.duration > 0) { 
           setMidiBuffer(midiBuffer)
           if (props.mediaController) props.mediaController.setDuration(midiBuffer.duration)
           setTimingCallbacks(timingCallbacks)
           setCursor(cursor)
           if (midiBuffer.audioBuffers && midiBuffer.audioBuffers[0]) {
             initPitchShifter(audioContext, midiBuffer.audioBuffers[0])
           }
           syncTimingCallbacksToSettings(0)
           setReady(true)
           setStarted(true)
         } else {
           setReady(false)
           setStarted(false)
         }
         isLoading.current = false
    }

  
    function resetAudioState() {
        stopMetronome()
        try {
          destroyPitchShifter()
          //if (props.mediaController) props.mediaController.setDuration(0)
          if (gmidiBuffer.current)  gmidiBuffer.current.stop()
          if (gtimingCallbacks.current) gtimingCallbacks.current.stop()
          delete gmidiBuffer.current
          delete gtimingCallbacks.current
        } catch (e) {}
    }

    function seekMidiPlayback(ratio, options) {
        const opts = options || {}
        const clamped = Math.max(0, Math.min(1, parseFloat(ratio) || 0))
        if (!gmidiBuffer.current || gmidiBuffer.current.duration <= 0) return
        const wasPlaying = props.mediaController && props.mediaController.hasActivePlaybackIntent
            ? props.mediaController.hasActivePlaybackIntent()
            : isMidiPlaybackActive()
        const allowAutoResume = wasPlaying && !opts.skipAutoResume
        midiPlaybackGuardUntilRef.current = Date.now() + 3000
        currentTime.current = clamped * gmidiBuffer.current.duration
        if (opts.skipAutoResume) {
            stopNativeMidiBufferOutput()
            if (pitchShifterRef.current) {
                try { pitchShifterRef.current.disconnect() } catch (e) {}
            }
            if (gtimingCallbacks.current) {
                try { gtimingCallbacks.current.pause() } catch (e) {}
            }
        }
        // Seeking a SoundTouch pipe in place (or by disconnect/reconnect of the
        // same node) does not reliably reset its source position — most visibly on
        // rewind-to-0, where the node keeps its previous position. Recreate the
        // shifter from the cached buffer so the seek below always takes effect.
        if (pitchShifterRef.current && pitchShifterBufferRef.current && gaudioContext.current) {
            initPitchShifter(gaudioContext.current, pitchShifterBufferRef.current)
        }
        if (pitchShifterRef.current) {
            try { pitchShifterRef.current.seek(clamped) } catch (e) {}
        }
        if (gtimingCallbacks.current) {
            try { gtimingCallbacks.current.setProgress(clamped) } catch (e) {}
        }
        if (gmidiBuffer.current && !pitchShifterRef.current) {
            try { gmidiBuffer.current.seek(clamped) } catch (e) {}
        }
        if (allowAutoResume) {
            const settings = pitchTempoSettingsRef.current
            if (pitchShifterRef.current) {
                if (gaudioContext.current && gaudioContext.current.state === 'running') {
                    if (pitchShifterRef.current.isConnected()) {
                        try { pitchShifterRef.current.disconnect() } catch (e) {}
                    }
                    startMidiAudioOutput(settings, clamped)
                }
            } else if (gmidiBuffer.current && !gmidiBuffer.current.isRunning) {
                startMidiAudioOutput(settings, clamped)
            }
            if (gtimingCallbacks.current && !gtimingCallbacks.current.isRunning) {
                try {
                    gtimingCallbacks.current.start()
                } catch (e) {}
            }
        }
        if (props.mediaController) {
            if (props.mediaController.setCurrentTime) {
                props.mediaController.setCurrentTime(currentTime.current)
            }
        }
    }

    function resumeMidiAfterSeek() {
        const shouldResume = props.mediaController && props.mediaController.hasActivePlaybackIntent
            ? props.mediaController.hasActivePlaybackIntent()
            : (props.mediaController && props.mediaController.hasPlayingIntent
                && props.mediaController.hasPlayingIntent())
        if (!shouldResume && !(props.mediaController && props.mediaController.isPlaying)) {
            return
        }
        midiPlaybackGuardUntilRef.current = Date.now() + 3000
        setForceStop(false)
        midiStartHandledRef.current = true
        stopMetronome()
        resumeSynthAudioContext()
        const ratio = getMidiPlaybackRatio()
        const settings = pitchTempoSettingsRef.current
        if (pitchShifterRef.current && gaudioContext.current
            && gaudioContext.current.state === 'running') {
            if (pitchShifterRef.current.isConnected()) {
                try { pitchShifterRef.current.disconnect() } catch (e) {}
            }
            startMidiAudioOutput(settings, ratio >= 0 ? ratio : 0)
        } else if (gmidiBuffer.current && gaudioContext.current
            && gaudioContext.current.state === 'running' && !gmidiBuffer.current.isRunning) {
            startMidiAudioOutput(settings, ratio > 0 ? ratio : 0)
        }
        if (gtimingCallbacks.current) {
            try {
                if (!gtimingCallbacks.current.isRunning) {
                    if (ratio > 0) {
                        gtimingCallbacks.current.setProgress(ratio)
                    }
                    gtimingCallbacks.current.start()
                }
            } catch (e) {}
        }
        if (props.mediaController.confirmPlayingStarted) {
            props.mediaController.confirmPlayingStarted()
        }
    }

    function seekPlayer(seekTo, play = false, options) {
        //console.log("SYNTH SEEK PLAYER",seekTo, play,gmidiBuffer.current, gtimingCallbacks.current)
        seekMidiPlayback(seekTo, options)
        if (play) startMidiAndTiming()
    }
    
  async function startMidiAndTiming() {
      stopMetronome()
      if (isSynthSeekGuardActive()) return false
      const generation = playbackGenerationRef.current
      if (!wantsMidiPlayback() || getForceStop()) return false
      try {
          const contextReady = await ensureSynthAudioContextRunning()
          if (generation !== playbackGenerationRef.current || !wantsMidiPlayback() || getForceStop()) {
              return false
          }
          if (!contextReady) {
              handleMidiAudioStartFailure()
              return false
          }

          const settings = pitchTempoSettingsRef.current
          const ratio = getMidiPlaybackRatio()
          const audioStarted = startMidiAudioOutput(settings, ratio)
          if (!audioStarted) {
              handleMidiAudioStartFailure()
              return false
          }

          if (generation !== playbackGenerationRef.current || !wantsMidiPlayback() || getForceStop()) {
              pauseMidiSynth()
              return false
          }
          if (gtimingCallbacks.current) {
              const ratio = getMidiPlaybackRatio()
              if (ratio > 0) {
                  try {
                      gtimingCallbacks.current.setProgress(ratio)
                  } catch (e) {}
              }
              if (!gtimingCallbacks.current.isRunning) {
                  gtimingCallbacks.current.start()
              }
          }
          if (generation !== playbackGenerationRef.current || !wantsMidiPlayback() || getForceStop()) {
              pauseMidiSynth()
              return false
          }
          setIsPlaying(true)
          notifyPlaybackStarted()
          return true
      } catch (e) {
        console.log("start buffer and timing ERROR", e)
        handleMidiAudioStartFailure()
        return false
      }
  }
    
  function startPrimedTune(force = false) {
    //console.log('SYNTH startPrimedTune primed tune',currentTime, gmidiBuffer.current.duration, seekTo, 'rp',realProgress, 'clickseek',clickSeek, gtimingCallbacks.current,gmidiBuffer.current,getForceStop())
    var emergencyStop = getForceStop()
    var seekTo = currentTime.current
    if (wantsMidiPlayback(force)) {
        if (!emergencyStop) {
          if (gtimingCallbacks && gtimingCallbacks.current && gmidiBuffer && gmidiBuffer.current) {
              if (seekTo > 0) { 
                //console.log('SYNTH startPrimedTune with seek ',seekTo, currentTime, gmidiBuffer.current.duration)
                //seekPlayer(seekTo/gmidiBuffer.current.duration, true)
                startMidiAndTiming()
              } else {
                //console.log('SYNTH startPrimedTune with metronome',gvisualObj)
                //if (gvisualObj && gvisualObj.current)
                seekMidiPlayback(0, { skipAutoResume: true })
                var o = gvisualObj.current
                var tempoFactor = getTempoFactor()
                // METRONOME COUNT IN — two bars minus anacrusis (supports fractional pickup)
                var countIn = computeMidiMetronomeCountIn({
                    beatsPerMeasure: o.getBeatsPerMeasure(),
                    pickupLength: o.getPickupLength(),
                    beatLength: o.getBeatLength(),
                    millisecondsPerMeasure: o.millisecondsPerMeasure(),
                    tempoFactor: tempoFactor,
                })
                var metronomeBeats = countIn.metronomeBeats
                var delay = countIn.delayMs
                const extraMeasures = getExtraMeasuresAtBeginning()
                
                function startCountInCursor() {
                    if (extraMeasures > 0 && gtimingCallbacks.current) {
                        try {
                            gtimingCallbacks.current.reset()
                            gtimingCallbacks.current.start(0)
                        } catch (e) {}
                    }
                }

                function startWithMetronome() {
                    stopMetronome()
                    if (props.metronomeCountIn) {
                      var effectiveTempo = getEffectiveQpm()
                      
                       metronome.current = new Metronome(gaudioContext.current, effectiveTempo, o.getBeatsPerMeasure(), metronomeBeats , function() {
                        stopMetronome()
                        metronomeTimeout.current = setTimeout(function() {
                            if (wantsMidiPlayback()) {
                                startMidiAndTiming()
                            }
                        }, delay)
                      }, function() {
                          if (props.mediaController && props.mediaController.userGesturePlayRef && props.mediaController.userGesturePlayRef.current) {
                              return
                          }
                          setIsPlaying(false)
                          if (props.mediaController) {
                              props.mediaController.setIsLoading(false)
                              props.mediaController.setIsPlaying(false)
                          }
                          setTapToPlayFlag(true)
                      });
                      startCountInCursor()
                      metronome.current.start()
                    } else {
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
                    if (wantsMidiPlayback()) {
                      startWithMetronome()
                    }
                  }, 1000)
                } else {
                  startWithMetronome()
                }
              }
          } else {
            // try again
            //console.log('SYNTH startPrimedTune primed tune NO BUFFER')
            //setTimeout(function() {
              //startPrimedTune()
            //},5000)
          }
          //console.log('started primed tune')
        } else {
            //console.log('SYNTH start primed tune emergency stop')
          stopPlaying()
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
          const fromGesture = props.mediaController && props.mediaController.userGesturePlayRef
              && props.mediaController.userGesturePlayRef.current
          if (fromGesture && audioContext.state === 'suspended') {
              audioContext.resume()
          }
            resolve(audioContext)
        } else {
          //console.log('PRIMAUDIO REJECT')
          setTapToPlayFlag(true)
          if (props.mediaController) {
              props.mediaController.setIsLoading(false)
              props.mediaController.setIsPlaying(false)
          }
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
            var a = getSoundFontUrl()
            //var warp =  props.warp > 0 ? props.warp : 1
            var initOptions = {
                audioContext: audioContext,
              //onPlaying: function(details) {
                //if (midiBuffer.duration > 0) setSeekTo((details.timePlayed + details.startOffset)/midiBuffer.duration)
              //}, 
              visualObj: visualObj,
              millisecondsPerMeasure: visualObj.millisecondsPerMeasure(),
              options:{
                 soundFontUrl: a,
                 soundFontVolumeMultiplier: getSoundFontVolumeMultiplier(),
                 //program: 21,
                 chordsOff: false,
                 programOffsets: programOffsets,
               },
            }
            //console.log('prime init options',initOptions)
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
              var timingCallbacks = new abcjs.TimingCallbacks(visualObj, buildTimingCallbacksOptions(visualObj))
              var cursor = createCursor()
              if (props.mediaController) props.mediaController.setIsLoading(false)
              isLoading.current = false
              resolve({midiBuffer, timingCallbacks, cursor})
            }
             
            function primeAndResolve() {
               //console.log('preinit primresolve',force)
                //if (force) { 
                  midiBuffer.init(initOptions).then(
                  function (response) { 
                    //console.log('iniprime',initOptions)
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
                      console.log('Soundfont prime failed:', error, getSoundFontUrl())
                      if (props.mediaController) props.mediaController.setIsLoading(false)
                      isLoading.current = false
                      resolve(null)
                    })
                  }).catch(function (error) {
                     console.log('Soundfont init failed:', error, getSoundFontUrl())
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
                    getAudioFromCache(getAudioHash(tune), audioContext).then(function(audioResult) {
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
    
  
  return {createCursor, programOffsets, clickListener, beatCallback, eventCallback, metronomeTimeout, metronome, gaudioContext, gmidiBuffer, gvisualObj, gtimingCallbacks, gcursor,  showTempo, setShowTempo,showTranspose, setShowTranspose, clickSeek, setClickSeek, lastPlaybackSpeed, setLastPlaybackSpeed, audioChangedHash, setAudioChangedHash, tapToPlay, setTapToPlay, playCancelled, setPlayCancelled, abcTune, setAbcTune, lastAbc, setLastAbc, lastTempo, setLastTempo, lastBoost, setLastBoost, isPlaying, setIsPlaying, playCount, setPlayCountInner, playCountRef, setPlayCount, incrementPlayCount, lastScrollTo, autoScroll, realProgress, seekTo, setSeekTo, forceSeekTo, setForceSeekTo, ready, setReady, started, setStarted, store, abcTools, inputEl, playTimerRef, setAudioContext, setMidiBuffer, setVisualObj, setTimingCallbacks, setCursor, setForceStop, getForceStop, getWarp, getWarpTempo, saveAudioToCache, getAudioFromCache, startPlaying, stopPlaying, assignStateOnCompletion, resetAudioState, seekPlayer, createPlayer, primeTune, primeAudio, startPrimedTune, tune, setTune, isLastPlaying, setIsLastPlaying, setTempoFactor, applyMidiTempo, getPitchTempoState, resetPitchTempo, applyPlaybackSettings}
}



