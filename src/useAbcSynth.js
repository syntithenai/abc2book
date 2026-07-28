import {useState, useEffect, useLayoutEffect, useRef} from 'react'
import * as localForage from "localforage";
import useAbcTools from './useAbcTools'
import {isMobile} from 'react-device-detect'
import abcjs from "abcjs";
import { encodeAudioBufferWithSetting } from './audioCompressEncode'
import { getSoundFontUrl, getSoundFontVolumeMultiplier, isResolverMusyngKiteReady } from './soundFontConfig'
import { remapFlattenedMidiPrograms } from './localSoundfontInstrumentMap'
import PitchTempoShifter from './pitchTempoShifter'
import { getPlaybackSettings, combinedPitchSemitones } from './pitchTempoUtils'
import {
    isStaleSeekEngineReading,
    computeMidiMetronomeCountIn,
    rhythmAlignedCountInInput,
    computeExtraMeasuresAtBeginning,
    computeTimingMusicStartMs,
    audioRatioToTimingProgress,
    timingProgressToAudioSeconds,
    isMidiStartFromBeginning,
    shouldUseMidiMetronomeCountIn,
    resolveCountInHandoffAnchor,
    MIDI_START_FROM_BEGINNING_TOLERANCE_SECONDS,
    computePlaybackMetronomeTempo,
    computeRhythmGridTempo,
    computeCountInSlotCount,
    computeCountInGridTempo,
    defaultAbcBeatLengthForMeter,
    notationBeatToAudioSeconds,
    notationBeatToAudioRatio,
    notationMsToAudioRatio,
} from './playbackStateLogic'
import {
    getPlaybackMetronomeSettings,
    resolveMetronomeSettingsTune,
    resolveTuneTimeSignature,
    alignPlaybackRhythmToMeter,
} from './playbackMetronomeSettings'
import { slotsPerBar, rhythmFromTimeSignature, defaultMetronomeRhythm } from './metronomeRhythmPresets'
import { normalizeRhythmConfig, ENGINE_MODE_DRUMS } from './rhythmEngineTypes'
import { primeDrumKit } from './drumSampleKit'
import { scheduleMediaCacheStorageCheck } from './mediaCacheStorage'
import { preloadCountInCueInstrument, scheduleCountInCueNote, firstWarmupCueMidi, firstPlaybackCueMidiFromVisual } from './countInPitchCue'
import { playRhythmSlot } from './rhythmSlotPlayback'
import { getRhythmSwing } from './rhythmGrid'
import { createRhythmOutputBus } from './rhythmOutputBus'
import {
    createRhythmPlaybackController,
    stopRhythmPlaybackController,
    startRhythmCountIn,
    enterRhythmPlaying,
    seekRhythmPlaying,
    setRhythmPlaybackTempo,
    getRhythmPlaybackPhase,
    PHASE_IDLE,
    PHASE_COUNT_IN,
    PHASE_ENTRY_GAP,
    PHASE_PLAYING,
    isRhythmPlaybackActive,
    beginRhythmPlayingAtMusicStart,
    reanchorRhythm,
    getRhythmTimelineSnapshot,
} from './rhythmPlaybackController'
import {
    createRhythmTimingDiagnostics,
    recordRhythmSlotEvent,
    resetRhythmTimingDiagnostics,
    buildRhythmDiagnosticsSnapshot,
} from './rhythmTimingDiagnostics'

export default function useAbcSynth(props) {
    
    const metronomeTimeout = useRef(null)
    const rhythmOutputBus = useRef(createRhythmOutputBus())
    const rhythmController = useRef(null)
    const rhythmTimingDiagnostics = useRef(createRhythmTimingDiagnostics())
    const rhythmMusicAnchorRef = useRef({ musicSeconds: 0, audioContextTime: 0, active: false })
    const countInPendingRef = useRef(false)
    const countInMidiPreScheduledRef = useRef(false)
    /** @deprecated alias for rhythmController — tune playback no longer uses Metronome.js */
    const metronome = rhythmController
    const pendingRestartFromZeroRef = useRef(false)
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
    const gplaybackVisualObj = useRef(null)
    const primeTimerRef = useRef(null)
    const primePromiseRef = useRef(null)
    const midiPlaybackGuardUntilRef = useRef(0)
    // Standalone Abc (e.g. practice warmups) calls startPlaying(true) before count-in;
    // isPlaying stays false until MIDI audio starts after the metronome.
    const forcePlaybackUntilStartRef = useRef(false)
    const isPlayingRef = useRef(false)
    const pendingPlaybackStartSecondsRef = useRef(null)
    const midiPrimeInFlightRef = useRef(false)
    const beginMidiPlaybackRef = useRef(null)
    const playMidiBridgeRef = useRef(function(options) {
        midiPlaybackGuardUntilRef.current = 0
        if (beginMidiPlaybackRef.current) {
            return beginMidiPlaybackRef.current(options)
        }
        return false
    })
    
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
        if (gaudioContext.current.state !== 'running'
            && props.hasPlaybackGesture && props.hasPlaybackGesture()) {
            try {
                await gaudioContext.current.resume()
            } catch (e) {
                return false
            }
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

    function releaseMidiUiLoading() {
        midiPrimeInFlightRef.current = false
        isLoading.current = false
        if (props.mediaController && props.mediaController.setIsLoading) {
            props.mediaController.setIsLoading(false)
        }
    }

    function clearForcedPlaybackIntent() {
        forcePlaybackUntilStartRef.current = false
    }

    function handleMidiAudioStartFailure() {
        pauseMidiSynth()
        setIsPlaying(false)
        clearForcedPlaybackIntent()
        if (props.mediaController) {
            releaseMidiUiLoading()
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

    function startMidiAudioOutput(settings, ratio, startAtAudioTime) {
        const ctx = gaudioContext.current
        const when = ctx && Number.isFinite(startAtAudioTime)
          ? Math.max(ctx.currentTime + 0.002, startAtAudioTime)
          : null
        if (pitchShifterRef.current) {
            // Never run the native abcjs buffer player alongside the SoundTouch
            // shifter — both play the same rendered buffer and cause level drift.
            stopNativeMidiBufferOutput()
            if (pitchShifterRef.current.isConnected()) {
                try { pitchShifterRef.current.disconnect() } catch (e) {}
            }
            pitchShifterRef.current.applySettings(settings.tempo, settings.pitch, settings.fineTune)
            // Always apply the position before connecting (including 0), so a
            // reconnect after a seek/rewind starts at the requested point. The
            // previous `ratio > 0` guard let rewind-to-0 keep the old position.
            if (typeof ratio === 'number' && ratio >= 0) {
                pitchShifterRef.current.seek(ratio)
            }
            pitchShifterRef.current.connect(when)
            if (props.mediaController && props.mediaController.playbackVolume !== undefined) {
                pitchShifterRef.current.setDirectOutputGain(false)
                pitchShifterRef.current.setOutputVolume(props.mediaController.playbackVolume)
            } else if (props.practiceReferenceGain != null && props.practiceReferenceGain >= 0) {
                pitchShifterRef.current.setDirectOutputGain(true)
                pitchShifterRef.current.setOutputVolume(Math.max(0, Math.min(1, props.practiceReferenceGain)))
            }
            midiPlaybackGuardUntilRef.current = Date.now() + 3000
            return pitchShifterRef.current.isConnected()
                ? { ok: true, actualStartAudioTime: when != null ? when : (ctx ? ctx.currentTime : null) }
                : { ok: false, actualStartAudioTime: null }
        }
        if (gmidiBuffer.current) {
            // Native abcjs buffer cannot be scheduled into the future — it starts now.
            gmidiBuffer.current.start()
            return {
                ok: true,
                actualStartAudioTime: ctx ? ctx.currentTime : null,
            }
        }
        return { ok: false, actualStartAudioTime: null }
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
            // Route mode is authoritative — mediaLinkNumber state can still be 0
            // briefly after switching from playMedia to playMidi (async setState).
            if (props.mediaController.isMediaPlaybackRoute && props.mediaController.isMediaPlaybackRoute()) {
                return false
            }
            if (force) return true
            if (props.mediaController.hasActivePlaybackIntent && props.mediaController.hasActivePlaybackIntent()) {
                return true
            }
            return !!props.mediaController.isPlaying
        }
        return !!force || !!isPlayingRef.current || forcePlaybackUntilStartRef.current
    }

    function isMidiPlaybackActive() {
        if (props.mediaController) {
            if (props.mediaController.isMidiPlaybackRoute && !props.mediaController.isMidiPlaybackRoute()) {
                return false
            }
            if (props.mediaController.isMediaPlaybackRoute && props.mediaController.isMediaPlaybackRoute()) {
                return false
            }
            if (props.mediaController.hasActivePlaybackIntent && props.mediaController.hasActivePlaybackIntent()) {
                return true
            }
            if (props.mediaController.isPlaying) return true
        }
        return !!isPlayingRef.current
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
    
    const [isPlaying, setIsPlayingState] = useState(false)
    function setIsPlaying(v) {
      isPlayingRef.current = !!v
      setIsPlayingState(v)
    }
    const [isLastPlaying, setIsLastPlaying] = useState(false)
    //var [milliSecondsPerMeasure,setMilliSecondsPerMeasure] = useState(null)
    const [playCount, setPlayCountInner] = useState(0)
    const playCountRef = useRef(0)
    
    function setPlayCount(v) {
      setPlayCountInner(v)
      playCountRef.current = v
    }
    function incrementPlayCount() {
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
    function setPlaybackVisualObj(v) {
      gplaybackVisualObj.current = v
    }
    function synthVisualObj(displayVisualObj) {
      return gplaybackVisualObj.current || displayVisualObj
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

    function isMidiActivePlaybackRoute() {
        if (!props.mediaController || !props.mediaController.isMidiPlaybackRoute) {
            return true
        }
        return props.mediaController.isMidiPlaybackRoute()
    }

    function shouldPreserveNotationMidiEngines() {
        if (!props.mediaController || !props.mediaController.notationMidiOwner) return false
        if (props.mediaController.hasActivePlaybackIntent
            && props.mediaController.hasActivePlaybackIntent()) {
            return true
        }
        return false
    }

    const mediaController = props.mediaController
    const mcIsPlaying = mediaController ? mediaController.isPlaying : null
    const mcMediaLinkNumber = mediaController ? mediaController.mediaLinkNumber : null
    const mcMidiHashCurrent = mediaController && mediaController.midiHash ? mediaController.midiHash.current : null
    const mcTuneId = mediaController && mediaController.tune ? mediaController.tune.id : null

      //// listen to properties on media controller to control local player
    useEffect(function() {
        // Display-only notation must not drive or reset the shared midi engine.
        if (props.playbackEngine === false) return
        //props.mediaController.isPlaying, isLastPlaying,"TIME", props.mediaController.currentTime,"CLICKTIME", props.mediaController.clickSeek,clickSeek,  props.mediaController.mediaLinkNumber, props.mediaController.midiHash.current, props.mediaController.mediaLinkNumber,lastMediaLinkNumber)
        if (props.mediaController && props.mediaController.isMidiPlaybackRoute
            && props.mediaController.isMidiPlaybackRoute()) {
            const currentMidiHash = props.mediaController.midiHash ? props.mediaController.midiHash.current : null
            if (lastMidiHashRef.current !== undefined && currentMidiHash !== lastMidiHashRef.current) {
                const pendingMidiPlay = props.mediaController.pendingMidiPlayRef
                    && props.mediaController.pendingMidiPlayRef.current
                if (pendingMidiPlay
                    && !hasPendingNotationSeek()
                    && props.mediaController.hasActivePlaybackIntent
                    && props.mediaController.hasActivePlaybackIntent()
                    && !isSynthSeekGuardActive()) {
                    startPlayingFromIntent(true)
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
                if (!shouldPreserveNotationMidiEngines()) {
                    resetAudioState()
                }
                if (props.mediaController.hasActivePlaybackIntent
                    && props.mediaController.hasActivePlaybackIntent()
                    && !isSynthSeekGuardActive()) {
                        startPlayingFromIntent(true)
                } 
                
            }
            if (props.mediaController.mediaLinkNumber !== lastMediaLinkNumber) {
                if (!shouldPreserveNotationMidiEngines()) {
                    resetAudioState()
                }
                if (props.mediaController.hasActivePlaybackIntent
                    && props.mediaController.hasActivePlaybackIntent()
                    && !isSynthSeekGuardActive()) {
                    startPlayingFromIntent()
                } else {
                    //resetAudioState()
                }
            } 

            if (props.mediaController.isPlaying !== isLastPlaying) {
                if (props.mediaController.isPlaying) {
                    if (midiStartHandledRef.current || isSynthSeekGuardActive()) {
                        midiStartHandledRef.current = false
                    } else {
                        startPlayingFromIntent()
                    }
                } else {
                    if (!isSynthSeekGuardActive()) {
                        midiStartHandledRef.current = false
                        pauseMidiSynth()
                    }
                }
            }
        
        //if (props.mediaController && props.mediaController.mediaLinkNumber === null) {
            ////if (lastPlaybackSpeed !== props.mediaController.playbackSpeed) {
                ////resetAudioState()
            ////}
            ////if (props.mediaController.currentTime == 0 || clickSeek !== props.mediaController.clickSeek) {
                ////setSeekTo(props.mediaController.clickSeek)
                ////seekPlayer(parseFloat(props.mediaController.clickSeek))
                ////currentTime.current = parseFloat(props.mediaController.clickSeek)
            ////}
            //if (props.mediaController.isPlaying) {
                ////if (props.mediaController.isPlaying) {
                    ////bodyClick()
                    //startPlaying()
                ////} else {
                    ////stopPlaying()
                ////}
            //} else {
                //stopPlaying()
            //}
            setLastTuneId(props.mediaController && props.mediaController.tune ? props.mediaController.tune.id : null)
            setClickSeek(props.mediaController.clickSeek)
            setLastPlaybackSpeed(props.mediaController.playbackSpeed)
            setIsLastPlaying(props.mediaController.isPlaying)
            
        } else if (props.mediaController
            && props.mediaController.isMediaPlaybackRoute
            && props.mediaController.isMediaPlaybackRoute()
            && props.mediaController.mediaLinkNumber !== lastMediaLinkNumber) {
            stopPlaying()
            resetAudioState()
        }
        if (props.mediaController) setLastMediaLinkNumber(props.mediaController.mediaLinkNumber)
        //return function cleanup() {
           //resetAudioState()
        //}
        
    // eslint-disable-next-line react-hooks/exhaustive-deps -- syncs synth playback from mediaController snapshot fields above
    },[mcIsPlaying, mcMediaLinkNumber, mcMidiHashCurrent, mcTuneId])
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
        if (props.mediaController && props.mediaController.playbackVolume !== undefined) return
        if (props.practiceReferenceGain == null || props.practiceReferenceGain < 0) return
        if (pitchShifterRef.current) {
            pitchShifterRef.current.setDirectOutputGain(true)
            pitchShifterRef.current.setOutputVolume(Math.max(0, Math.min(1, props.practiceReferenceGain)))
        }
    }, [props.practiceReferenceGain, props.mediaController])
    
    const mcTapToPlay = mediaController ? mediaController.tapToPlay : tapToPlay
    const mcPlayCancelled = mediaController ? mediaController.playCancelled : playCancelled

     useEffect(function() {
         if (props.playbackEngine === false) return
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
     // eslint-disable-next-line react-hooks/exhaustive-deps -- resume synth when tap/play flags change; helpers read latest controller state
     },[
         mcTapToPlay,
         mcPlayCancelled,
         mcMediaLinkNumber,
     ])

    useEffect(function() {
        if (!props.mediaController) return undefined
        if (props.playbackEngine === false) return undefined
        const mc = props.mediaController
        mc.applyMidiTempoRef.current = applyMidiPlaybackSettings
        mc.applyPlaybackSettingsLiveRef.current = applyMidiPlaybackSettings
        mc.applyPlaybackVolumeRef.current = applySynthPlaybackVolume
        mc.resumeSynthAudioContextRef.current = resumeSynthAudioContext
        mc.pauseSynthRef.current = pauseMidiSynth
        mc.stopMetronomeRef.current = stopMetronome
        mc.invalidatePendingMidiStartsRef.current = invalidatePendingMidiStarts
        mc.armPlaybackFromZeroRef.current = armPlaybackFromZero
        if (mc.getRhythmPlaybackPhaseRef) {
            mc.getRhythmPlaybackPhaseRef.current = function() {
                return getRhythmPlaybackPhase(getRhythmController())
            }
        }
        if (mc.getRhythmDiagnosticsRef) {
            mc.getRhythmDiagnosticsRef.current = getRhythmDiagnostics
        }
        mc.playMidiRef.current = playMidiBridgeRef.current
        if (mc.resumeMidiAfterSeekRef) {
            mc.resumeMidiAfterSeekRef.current = resumeMidiAfterSeek
        }
        mc.stopMidiSynthRef.current = stopMidiSynth
        if (mc.getMidiPlaybackSecondsRef) {
            mc.getMidiPlaybackSecondsRef.current = getMidiPlaybackSeconds
        }
        if (mc.seekMidiRef) {
            mc.seekMidiRef.current = seekMidiPlayback
        }
        const pendingMidiPlay = mc.pendingMidiPlayRef && mc.pendingMidiPlayRef.current
        if (pendingMidiPlay && gvisualObj.current && beginMidiPlaybackRef.current) {
            mc.pendingMidiPlayRef.current = null
            beginMidiPlaybackRef.current(pendingMidiPlay)
        }
        return function() {
            if (mc.playMidiRef.current === playMidiBridgeRef.current) {
                mc.playMidiRef.current = null
            }
        }
    }, [props.mediaController, props.playbackEngine])

    const mcAbc = props.abc
    useEffect(function() {
        if (props.playbackEngine === false || !props.mediaController) return undefined
        const mc = props.mediaController
        const pendingMidiPlay = mc.pendingMidiPlayRef && mc.pendingMidiPlayRef.current
        if (!pendingMidiPlay || !gvisualObj.current || !beginMidiPlaybackRef.current) return undefined
        if (mc.isMidiPlaybackRoute && !mc.isMidiPlaybackRoute()) return undefined
        if (!(mc.hasActivePlaybackIntent && mc.hasActivePlaybackIntent())) return undefined
        mc.pendingMidiPlayRef.current = null
        beginMidiPlaybackRef.current(pendingMidiPlay)
        return undefined
    }, [props.mediaController, props.playbackEngine, mcAbc])

    useLayoutEffect(function() {
        if (!props.playbackControlRef) return undefined
        const controlRef = props.playbackControlRef
        const owner = {}
        const api = {
            pause: function() {
                pauseMidiSynth()
                setIsPlaying(false)
            },
            resume: function() {
                midiPlaybackGuardUntilRef.current = 0
                forcePlaybackUntilStartRef.current = true
                setForceStop(false)
                resumeSynthAudioContext()
                if (beginMidiPlaybackRef.current) {
                    beginMidiPlaybackRef.current({ resume: true })
                }
            },
            restart: function() {
                midiPlaybackGuardUntilRef.current = 0
                forcePlaybackUntilStartRef.current = true
                setForceStop(false)
                setPlayCount(0)
                resumeSynthAudioContext()
                if (beginMidiPlaybackRef.current) {
                    beginMidiPlaybackRef.current({ restart: true })
                }
            },
            play: function(options) {
                midiPlaybackGuardUntilRef.current = 0
                forcePlaybackUntilStartRef.current = true
                setForceStop(false)
                resumeSynthAudioContext()
                if (beginMidiPlaybackRef.current) {
                    return beginMidiPlaybackRef.current(options || {})
                }
                return false
            },
            stop: function() {
                midiPlaybackGuardUntilRef.current = 0
                pauseMidiSynth()
                setForceStop(true)
                setIsPlaying(false)
            },
            getAudioContext: function() {
                return gaudioContext.current || null
            },
            __owner: owner,
        }
        controlRef.current = api
        return function() {
            if (controlRef.current && controlRef.current.__owner === owner) {
                controlRef.current = null
            }
        }
    }, [props.playbackControlRef])

    function syncMirroredPlaybackCursor() {
        if (!props.mirrorNotationPlaybackCursor) return
        if (!props.mediaController || !props.mediaController.notationMidiOwner) return
        if (!gtimingCallbacks.current || !gmidiBuffer.current) {
            return
        }
        const bufferDuration = gmidiBuffer.current.duration > 0
            ? gmidiBuffer.current.duration
            : (props.mediaController.duration > 0
                ? parseFloat(props.mediaController.duration) : 0)
        if (!(bufferDuration > 0)) {
            return
        }
        if (!gcursor.current) {
            createCursor()
        }
        const seconds = props.mediaController.currentTime > 0
            ? parseFloat(props.mediaController.currentTime)
            : 0
        const ratio = Math.min(1, seconds / bufferDuration)
        setTimingProgressFromAudioRatio(ratio)
    }

    useLayoutEffect(function() {
        if (!props.mirrorNotationPlaybackCursor) return undefined
        const mc = props.mediaController
        if (!mc) return undefined
        function tick() {
            syncMirroredPlaybackCursor()
        }
        tick()
        const intervalId = window.setInterval(tick, 50)
        if (props.staffDisplayControlRef) {
            props.staffDisplayControlRef.current = { syncCursor: tick }
        }
        if (mc.notationStaffCursorRef) {
            mc.notationStaffCursorRef.current = tick
        }
        return function() {
            window.clearInterval(intervalId)
            if (props.staffDisplayControlRef && props.staffDisplayControlRef.current
                && props.staffDisplayControlRef.current.syncCursor === tick) {
                props.staffDisplayControlRef.current = null
            }
            if (mc.notationStaffCursorRef && mc.notationStaffCursorRef.current === tick) {
                mc.notationStaffCursorRef.current = null
            }
        }
    }, [
        props.mirrorNotationPlaybackCursor,
        props.staffDisplayControlRef,
        props.mediaController,
        mcIsPlaying,
        mcTuneId,
    ])
     
     function getRhythmController() {
        if (!rhythmController.current) {
            rhythmController.current = createRhythmPlaybackController(rhythmOutputBus.current)
        }
        return rhythmController.current
     }

     function rhythmPlaySlotFn(audioContext, audioTime, rhythm, slotInBar, destination, meta) {
        const controller = getRhythmController()
        if (meta && meta.generation != null && controller.generation !== meta.generation) {
            return
        }
        const phase = getRhythmPlaybackPhase(controller)
        if ((phase === PHASE_COUNT_IN || phase === PHASE_ENTRY_GAP)
            && meta && meta.globalSlot != null && meta.globalSlot >= 0) {
            return
        }
        recordRhythmSlotEvent(rhythmTimingDiagnostics.current, {
            slotInBar: slotInBar,
            globalSlot: meta && meta.globalSlot,
            audioTime: audioTime,
            expectedAudioTime: meta && meta.expectedAudioTime,
            musicSeconds: getRhythmMusicSeconds(),
            phase: phase,
        })
        playRhythmSlot(audioContext, audioTime, rhythm, slotInBar, destination)
     }

     function updateRhythmMusicAnchor(musicSeconds) {
        rhythmMusicAnchorRef.current = {
            musicSeconds: typeof musicSeconds === 'number' ? musicSeconds : 0,
            audioContextTime: gaudioContext.current ? gaudioContext.current.currentTime : 0,
            active: true,
        }
     }

     function clearRhythmMusicAnchor() {
        rhythmMusicAnchorRef.current.active = false
     }

     function getMidiEngineMode() {
        if (pitchShifterRef.current && pitchShifterRef.current.isConnected()) {
            const settings = pitchShifterRef.current.getState()
            const needsProcessing = Math.abs(combinedPitchSemitones(settings.pitch, settings.fineTune)) >= 0.0001
                || Math.abs(settings.tempo - 1) >= 0.0001
            return needsProcessing ? 'soundtouch' : 'direct'
        }
        if (gmidiBuffer.current && gmidiBuffer.current.isRunning) {
            return 'buffer'
        }
        return 'none'
     }

     function prepareFreshMidiStartFromCountIn() {
        clearRhythmMusicAnchor()
        if (gtimingCallbacks.current) {
            try {
                gtimingCallbacks.current.pause()
                gtimingCallbacks.current.setProgress(0)
            } catch (e) {}
        }
     }

     function getRhythmDiagnostics() {
        const rhythm = resolvePlaybackMetronomeRhythm()
        const o = gvisualObj.current
        const metro = resolvePlaybackMetronomeOptions()
        const timelineSnap = getRhythmTimelineSnapshot(getRhythmController())
        const ring = rhythmTimingDiagnostics.current.ring.slice()
        return buildRhythmDiagnosticsSnapshot({
            phase: getRhythmPlaybackPhase(getRhythmController()),
            tempo: getRhythmController().tempo,
            tempoFactor: getTempoFactor(),
            rhythmBeatsPerBar: rhythm.beatsPerBar,
            musicSeconds: getRhythmMusicSeconds(),
            rhythmGridQpm: getRhythmGridMetronomeTempo(o),
            playbackQpm: getPlaybackMetronomeTempo(o),
            duringPlayback: metro.duringPlayback,
            isMidiPlaying: isMidiAudioEngineRunning(),
            timingCallbacksRunning: !!(gtimingCallbacks.current && gtimingCallbacks.current.isRunning),
            midiEngineMode: getMidiEngineMode(),
            rhythmSlotsPerBar: slotsPerBar(rhythm),
            rhythmPulsesPerBeat: rhythm.pulsesPerBeat ? rhythm.pulsesPerBeat.slice() : [],
            downbeatAudioTime: timelineSnap ? timelineSnap.downbeatAudioTime : null,
            musicStartAudioTime: timelineSnap ? timelineSnap.musicStartAudioTime : null,
            rhythm: rhythm,
            swing: getRhythmSwing(rhythm),
            countInSlotsEmitted: rhythmTimingDiagnostics.current.countInSlotsEmitted,
            ring: ring,
        })
     }

     function stopRhythmPlayback() {
        clearRhythmMusicAnchor()
        resetRhythmTimingDiagnostics(rhythmTimingDiagnostics.current)
        stopRhythmPlaybackController(getRhythmController())
     }

     function getRhythmGridMetronomeTempo(visualObj) {
        const o = visualObj || gvisualObj.current
        const rhythm = resolvePlaybackMetronomeRhythm()
        const fallback = getPlaybackMetronomeTempo(o)
        if (!o || !o.millisecondsPerMeasure) {
            return fallback
        }
        return computeRhythmGridTempo({
            rhythmBeatsPerBar: rhythm.beatsPerBar,
            millisecondsPerMeasure: o.millisecondsPerMeasure(),
            tempoFactor: getTempoFactor(),
            fallbackQpm: fallback,
        })
     }

     function armPlaybackFromZero() {
        pendingRestartFromZeroRef.current = true
        pendingPlaybackStartSecondsRef.current = null
        currentTime.current = 0
        fullyResetMidiEnginesToStart()
     }

     function clearArmPlaybackFromZero() {
        pendingRestartFromZeroRef.current = false
     }

     function isMidiAudioEngineRunning() {
        if (pitchShifterRef.current) {
            return pitchShifterRef.current.isConnected()
        }
        if (gmidiBuffer.current) {
            return !!gmidiBuffer.current.isRunning
        }
        return false
     }

     function getRhythmMusicSeconds() {
        if (rhythmMusicAnchorRef.current.active && gaudioContext.current) {
            const anchor = rhythmMusicAnchorRef.current
            if (!isMidiAudioEngineRunning()) {
                return anchor.musicSeconds
            }
            const elapsed = gaudioContext.current.currentTime - anchor.audioContextTime
            if (elapsed >= 0 && elapsed < 30) {
                const tempoFactor = getTempoFactor()
                return anchor.musicSeconds + elapsed * tempoFactor
            }
        }
        return currentTime.current || 0
     }

     function isRhythmHandoffPhase() {
        const phase = getRhythmPlaybackPhase(getRhythmController())
        return phase === PHASE_PLAYING
            || phase === PHASE_COUNT_IN
            || phase === PHASE_ENTRY_GAP
     }

     function ensureDuringPlaybackMetronome(ratio) {
        const metro = resolvePlaybackMetronomeOptions()
        if (!metro.duringPlayback) return
        if (!gaudioContext.current) return
        if (countInPendingRef.current) return
        const phase = getRhythmPlaybackPhase(getRhythmController())
        if (phase === PHASE_COUNT_IN || phase === PHASE_ENTRY_GAP || phase === PHASE_PLAYING) {
            return
        }
        if (metro.metronomeCountIn && phase === PHASE_IDLE) {
            return
        }
        if (!isMidiAudioEngineRunning()) {
            return
        }
        const musicSeconds = getMusicSecondsForMetronomeSync(ratio)
        const controller = getRhythmController()
        const snap = getRhythmTimelineSnapshot(controller)
        const tempoFactor = getTempoFactor()
        const factor = tempoFactor > 0 ? tempoFactor : 1
        const musicStartAudioTime = snap && snap.musicStartAudioTime != null
            ? snap.musicStartAudioTime
            : gaudioContext.current.currentTime - musicSeconds / factor
        enterRhythmPlaying(controller, {
            rhythm: resolvePlaybackMetronomeRhythm(),
            tempo: getRhythmGridMetronomeTempo(),
            audioContext: gaudioContext.current,
            musicSeconds: musicSeconds,
            musicStartAudioTime: musicStartAudioTime,
            playSlot: rhythmPlaySlotFn,
            getMusicSeconds: getRhythmMusicSeconds,
            getTempoFactor: getTempoFactor,
        })
        updateRhythmMusicAnchor(musicSeconds)
     }

     function reconcileDuringPlaybackRhythm() {
        const metro = resolvePlaybackMetronomeOptions()
        if (!metro.duringPlayback) return
        if (!isMidiAudioEngineRunning()) return
        if (isRhythmPlaybackActive(getRhythmController())) return
        ensureDuringPlaybackMetronome(getMidiPlaybackRatio())
     }

     function stopMetronome() {
        countInPendingRef.current = false
        midiPrimeInFlightRef.current = false
        countInMidiPreScheduledRef.current = false
        if (metronomeTimeout.current) {
            clearTimeout(metronomeTimeout.current)
            metronomeTimeout.current = null
        }
        stopRhythmPlayback()
     }

     function getMusicSecondsForMetronomeSync(ratio) {
        if (rhythmMusicAnchorRef.current.active || (typeof currentTime.current === 'number' && currentTime.current >= 0)) {
            return getRhythmMusicSeconds()
        }
        if (gmidiBuffer.current && gmidiBuffer.current.duration > 0) {
            const r = ratio !== undefined && ratio !== null
                ? parseFloat(ratio)
                : getMidiPlaybackRatio()
            return Math.max(0, r * gmidiBuffer.current.duration)
        }
        return getMidiPlaybackSeconds()
     }

     function invalidatePendingMidiStarts() {
        playbackGenerationRef.current += 1
        stopMetronome()
        if (primeTimerRef.current) {
            clearTimeout(primeTimerRef.current)
            primeTimerRef.current = null
        }
        primePromiseRef.current = null
        isLoading.current = false
        if (props.mediaController) {
            const keepLoading = props.mediaController.hasPlayingIntent
                && props.mediaController.hasPlayingIntent()
            if (!keepLoading && props.mediaController.setIsLoading) {
                props.mediaController.setIsLoading(false)
            }
        }
     }

     function isPlaybackGenerationCurrent(generation) {
        return generation === playbackGenerationRef.current
     }

     function scheduleMidiStartAfterDelay(generation, delayMs, startOptions) {
        if (metronomeTimeout.current) {
            clearTimeout(metronomeTimeout.current)
            metronomeTimeout.current = null
        }
        metronomeTimeout.current = setTimeout(function() {
            metronomeTimeout.current = null
            if (!isPlaybackGenerationCurrent(generation)) {
                releaseMidiUiLoading()
                return
            }
            if (!wantsMidiPlayback(true)) {
                releaseMidiUiLoading()
                return
            }
            startMidiAndTiming(startOptions)
        }, delayMs)
     }

     function getRepeatGapMs() {
        const gapBeats = parseFloat(props.repeatGapBeats)
        if (!gapBeats || gapBeats <= 0) return 0
        const o = gvisualObj.current
        if (!o || !o.getBeatsPerMeasure || !o.millisecondsPerMeasure) return 0
        const beatsPerMeasure = parseFloat(o.getBeatsPerMeasure()) || 0
        if (beatsPerMeasure <= 0) return 0
        const tempoFactor = getTempoFactor()
        const beatDurationMs = (o.millisecondsPerMeasure() / beatsPerMeasure) / tempoFactor
        return gapBeats * beatDurationMs
     }

     function scheduleRepeatRestart() {
        const gapMs = getRepeatGapMs()
        if (gapMs <= 0) {
            seekPlayer(0, true)
            return
        }
        pauseMidiSynth()
        if (gtimingCallbacks.current) {
            try { gtimingCallbacks.current.pause() } catch (e) {}
        }
        if (gmidiBuffer.current) {
            try { gmidiBuffer.current.seek(0) } catch (e) {}
        }
        if (pitchShifterRef.current) {
            try { pitchShifterRef.current.seek(0) } catch (e) {}
        }
        currentTime.current = 0
        if (gtimingCallbacks.current) {
            try { gtimingCallbacks.current.setProgress(0) } catch (e) {}
        }
        const repeatGeneration = playbackGenerationRef.current
        scheduleMidiStartAfterDelay(repeatGeneration, gapMs, { forceRatio: 0 })
     }

     function getMidiStartPosition() {
        if (pendingRestartFromZeroRef.current) {
            return { seconds: 0, ratio: 0 }
        }
        let seconds = currentTime.current || 0
        let ratio = 0
        const tol = MIDI_START_FROM_BEGINNING_TOLERANCE_SECONDS
        if (gmidiBuffer.current && gmidiBuffer.current.duration > 0) {
            ratio = seconds / gmidiBuffer.current.duration
        }
        if (props.mediaController) {
            const clickSeek = parseFloat(props.mediaController.clickSeek)
            const controllerSeconds = parseFloat(props.mediaController.currentTime)
            const pendingSeconds = pendingPlaybackStartSecondsRef.current
            const hasPendingStart = typeof pendingSeconds === 'number' && pendingSeconds > tol
            const hasControllerSeconds = !isNaN(controllerSeconds) && controllerSeconds > tol
            const hasClickSeek = !isNaN(clickSeek) && clickSeek > tol
            if (hasPendingStart) {
                seconds = pendingSeconds
                if (gmidiBuffer.current && gmidiBuffer.current.duration > 0) {
                    ratio = Math.min(1, pendingSeconds / gmidiBuffer.current.duration)
                }
            } else if (hasClickSeek) {
                ratio = clickSeek
                if (gmidiBuffer.current && gmidiBuffer.current.duration > 0) {
                    seconds = clickSeek * gmidiBuffer.current.duration
                }
            } else if (!isMidiPlaybackActive()
                && !isNaN(clickSeek)
                && clickSeek >= 0
                && clickSeek <= tol) {
                ratio = 0
                seconds = 0
            } else if (isMidiPlaybackActive()) {
                // Synth beat clock / shifter are the source of truth while MIDI plays.
                // mediaController.currentTime is React state and is often stale/zero
                // (especially during practice), which would seek pitch changes to 0.
                if (pitchShifterRef.current) {
                    const shifterRatio = pitchShifterRef.current.getPlaybackRatio()
                    if (typeof shifterRatio === 'number' && shifterRatio > tol) {
                        ratio = Math.min(1, shifterRatio)
                        if (gmidiBuffer.current && gmidiBuffer.current.duration > 0) {
                            seconds = ratio * gmidiBuffer.current.duration
                        }
                    }
                }
            } else if (hasControllerSeconds) {
                seconds = controllerSeconds
                const controllerDuration = parseFloat(props.mediaController.duration)
                if (controllerDuration > 0) {
                    ratio = Math.min(1, controllerSeconds / controllerDuration)
                } else if (gmidiBuffer.current && gmidiBuffer.current.duration > 0) {
                    ratio = Math.min(1, controllerSeconds / gmidiBuffer.current.duration)
                }
            }
        }
        return { seconds: seconds, ratio: ratio }
     }

     function clearNotationPlaybackStartSeconds() {
        if (props.mediaController && props.mediaController.notationPlaybackStartSecondsRef) {
            props.mediaController.notationPlaybackStartSecondsRef.current = null
        }
     }

     function hasPendingNotationSeek() {
        if (!props.mediaController || !props.mediaController.notationPlaybackSeekRef) return false
        const seek = props.mediaController.notationPlaybackSeekRef.current
        if (!seek) return false
        if (typeof seek.startMs === 'number' && seek.startMs >= 0) return true
        return typeof seek.startBeat === 'number' && seek.startBeat > 0
     }

     function clearNotationPlaybackSeek() {
        if (props.mediaController && props.mediaController.notationPlaybackSeekRef) {
            props.mediaController.notationPlaybackSeekRef.current = null
        }
     }

     function resolveNotationPlaybackStartSeconds(opts) {
        const options = opts || {}
        const tempoBpm = options.tempo
            || (props.mediaController && props.mediaController.tune && props.mediaController.tune.tempo)
            || 120
        if (props.mediaController && props.mediaController.notationPlaybackSeekRef) {
            const seek = props.mediaController.notationPlaybackSeekRef.current
            if (seek && typeof seek.startMs === 'number' && seek.startMs >= 0) {
                return seek.startMs / 1000
            }
            if (seek && typeof seek.startBeat === 'number' && seek.startBeat > 0) {
                const fromSeek = notationBeatToAudioSeconds(
                    seek.startBeat, gvisualObj.current, seek.tempo || tempoBpm)
                if (fromSeek > 0) return fromSeek
            }
        }
        const startBeat = typeof options.startBeat === 'number' ? options.startBeat : null
        if (typeof options.startMs === 'number' && options.startMs >= 0) {
            return options.startMs / 1000
        }
        if (startBeat > 0) {
            const fromBeat = notationBeatToAudioSeconds(startBeat, gvisualObj.current, tempoBpm)
            if (fromBeat > 0) return fromBeat
        }
        if (typeof options.startSeconds === 'number' && options.startSeconds > 0) {
            return options.startSeconds
        }
        if (props.mediaController && props.mediaController.pendingMidiPlayRef
            && props.mediaController.pendingMidiPlayRef.current) {
            const pending = props.mediaController.pendingMidiPlayRef.current
            if (typeof pending.startMs === 'number' && pending.startMs >= 0) {
                return pending.startMs / 1000
            }
            if (typeof pending.startBeat === 'number' && pending.startBeat > 0) {
                const fromPendingBeat = notationBeatToAudioSeconds(
                    pending.startBeat, gvisualObj.current, pending.tempo || tempoBpm)
                if (fromPendingBeat > 0) return fromPendingBeat
            }
            if (typeof pending.startSeconds === 'number' && pending.startSeconds > 0) {
                return pending.startSeconds
            }
        }
        if (!(startBeat > 0) && props.mediaController && props.mediaController.notationPlaybackStartSecondsRef) {
            const notationSeconds = props.mediaController.notationPlaybackStartSecondsRef.current
            if (typeof notationSeconds === 'number' && notationSeconds > 0) {
                return notationSeconds
            }
        }
        if (!options.alwaysFromSelection) {
            if (typeof pendingPlaybackStartSecondsRef.current === 'number'
                && pendingPlaybackStartSecondsRef.current > MIDI_START_FROM_BEGINNING_TOLERANCE_SECONDS) {
                return pendingPlaybackStartSecondsRef.current
            }
            const pos = getMidiStartPosition()
            if (pos.seconds > MIDI_START_FROM_BEGINNING_TOLERANCE_SECONDS) {
                return pos.seconds
            }
        }
        return null
     }

     function maybeStopNotationSelectionPlayback(audioSeconds) {
        if (props.playbackEngine === false) return
        if (!props.mediaController || !props.mediaController.notationMidiOwner) return
        const seekRef = props.mediaController.notationPlaybackSeekRef
        const seek = seekRef && seekRef.current
        if (!seek || seek.endBeat == null) return
        const tempoBpm = seek.tempo
            || (props.mediaController.tune && props.mediaController.tune.tempo)
            || 120
        const endSeconds = notationBeatToAudioSeconds(
            seek.endBeat, gvisualObj.current, tempoBpm)
        if (!(endSeconds > 0)) return
        if (audioSeconds >= endSeconds - 0.05) {
            if (props.mediaController.stopNotationMidiPlayback) {
                props.mediaController.stopNotationMidiPlayback({})
            } else {
                pauseMidiSynth()
                setIsPlaying(false)
            }
        }
     }

     function resolveNotationSeekRatio(opts, pendingStartSeconds, bufferDuration, tempoBpm) {
        if (!(bufferDuration > 0)) return 0
        const options = opts || {}
        const seek = props.mediaController && props.mediaController.notationPlaybackSeekRef
            ? props.mediaController.notationPlaybackSeekRef.current
            : null
        const startMs = typeof options.startMs === 'number' ? options.startMs
            : (seek && typeof seek.startMs === 'number' ? seek.startMs : null)
        if (startMs != null) {
            const msRatio = notationMsToAudioRatio(startMs, bufferDuration)
            if (msRatio > 0) return msRatio
        }
        const startBeat = typeof options.startBeat === 'number' ? options.startBeat
            : (seek && typeof seek.startBeat === 'number' ? seek.startBeat : null)
        const tempo = tempoBpm || (seek && seek.tempo) || 120
        if (startBeat > 0) {
            const beatRatio = notationBeatToAudioRatio(
                startBeat, gvisualObj.current, bufferDuration, tempo)
            if (beatRatio > 0) return beatRatio
        }
        if (pendingStartSeconds > 0) {
            return Math.min(1, pendingStartSeconds / bufferDuration)
        }
        return 0
     }

     function startMidiAtResolvedSeconds(startSeconds, forcePlayback, opts) {
        if (!(startSeconds > 0)) return false
        pendingPlaybackStartSecondsRef.current = startSeconds
        if (gmidiBuffer.current && gmidiBuffer.current.duration > 0) {
            const ratio = resolveNotationSeekRatio(
                opts, startSeconds, gmidiBuffer.current.duration,
                opts && opts.tempo)
                || Math.min(1, startSeconds / gmidiBuffer.current.duration)
            pendingPlaybackStartSecondsRef.current = null
            syncPlaybackSeekFromSeconds(startSeconds, ratio)
            midiStartHandledRef.current = true
            setForceStop(false)
            stopMetronome()
            resumeSynthAudioContext()
            return startMidiAndTiming({ forceRatio: ratio, forcePlayback: !!forcePlayback })
        }
        return false
     }

     function startPlayingFromIntent(force) {
        const pending = props.mediaController && props.mediaController.pendingMidiPlayRef
            ? props.mediaController.pendingMidiPlayRef.current
            : null
        if (pending && beginMidiPlaybackRef.current) {
            if (beginMidiPlaybackRef.current(pending)) {
                if (props.mediaController && props.mediaController.pendingMidiPlayRef
                    && !hasPendingNotationSeek()) {
                    props.mediaController.pendingMidiPlayRef.current = null
                }
                return
            }
        }
        const startSeconds = resolveNotationPlaybackStartSeconds(pending)
        if (startSeconds > 0) {
            pendingPlaybackStartSecondsRef.current = startSeconds
        }
        if (startSeconds != null && startMidiAtResolvedSeconds(startSeconds, true, pending)) {
            return
        }
        startPlaying(force)
     }

     function captureLiveMidiPlaybackRatio() {
        if (pitchShifterRef.current) {
            const shifterRatio = pitchShifterRef.current.getPlaybackRatio()
            if (typeof shifterRatio === 'number' && shifterRatio >= 0) {
                return Math.min(1, shifterRatio)
            }
        }
        if (gmidiBuffer.current && gmidiBuffer.current.duration > 0 && currentTime.current > 0) {
            return Math.min(1, currentTime.current / gmidiBuffer.current.duration)
        }
        return getMidiPlaybackRatio()
    }

    function syncPlaybackSeekFromSeconds(seconds, ratio) {
        const safeSeconds = typeof seconds === 'number' && seconds > 0 ? seconds : 0
        const safeRatio = typeof ratio === 'number' && ratio > 0 ? Math.min(1, ratio) : 0
        currentTime.current = safeSeconds
        if (props.mediaController) {
            if (props.mediaController.setCurrentTime) props.mediaController.setCurrentTime(safeSeconds)
            if (props.mediaController.setClickSeek) props.mediaController.setClickSeek(safeRatio)
            if (safeSeconds > 0) clearNotationPlaybackSeek()
        }
    }

    function resolvePlaybackMetronomeOptions() {
        const sourceTune = resolveMetronomeSettingsTune(tune, {
            tunes: props.tunes,
            tablatureSourceTune: props.tablatureSourceTune,
            mediaControllerTune: props.mediaController && props.mediaController.tune,
            abc: props.abc,
            abcTools: props.tunebook && props.tunebook.abcTools,
        })
        const fromTune = getPlaybackMetronomeSettings(sourceTune, props.tunebook)
        return {
            metronomeCountIn: props.metronomeCountIn !== undefined
                ? !!props.metronomeCountIn
                : fromTune.countIn !== false,
            countInBars: fromTune.countInBars,
            duringPlayback: props.metronomeDuringPlayback !== undefined
                ? !!props.metronomeDuringPlayback
                : fromTune.duringPlayback === true,
            rhythm: fromTune.rhythm,
            countInBeats: props.metronomeCountInBeats,
            countInBarOnly: !!props.metronomeCountInBarOnly,
        }
    }

    function resolvePlaybackMetronomeRhythm() {
        const metro = resolvePlaybackMetronomeOptions()
        const sourceTune = resolveMetronomeSettingsTune(tune, {
            tunes: props.tunes,
            tablatureSourceTune: props.tablatureSourceTune,
            mediaControllerTune: props.mediaController && props.mediaController.tune,
            abc: props.abc,
            abcTools: props.tunebook && props.tunebook.abcTools,
        })
        const meter = resolveTuneTimeSignature(sourceTune, props.tunebook)
        let rhythm = null
        if (metro.rhythm && metro.rhythm.beatsPerBar > 0) {
            rhythm = normalizeRhythmConfig(metro.rhythm)
        } else if (meter) {
            rhythm = normalizeRhythmConfig(rhythmFromTimeSignature(meter))
        } else {
            rhythm = normalizeRhythmConfig(defaultMetronomeRhythm())
        }
        return alignPlaybackRhythmToMeter(rhythm, meter)
    }

    function syncPlaybackMetronomeTempo() {
        setRhythmPlaybackTempo(getRhythmController(), getRhythmGridMetronomeTempo())
    }

    function metronomeStartErrorCallback() {
        if (props.mediaController && props.mediaController.userGesturePlayRef && props.mediaController.userGesturePlayRef.current) {
            return
        }
        setIsPlaying(false)
        clearForcedPlaybackIntent()
        if (props.mediaController) {
            props.mediaController.setIsLoading(false)
            props.mediaController.setIsPlaying(false)
        }
        setTapToPlayFlag(true)
    }

    function shouldScheduleCountInPitchCue() {
        if (props.onCountInBeat) return true
        if (props.metronomeCountInCueMidi != null && Number.isFinite(props.metronomeCountInCueMidi)) {
            return true
        }
        if (props.practiceReferenceGain != null && props.practiceReferenceGain >= 0) {
            return true
        }
        if (props.mediaController && props.mediaController.isPracticeSessionActive) {
            return props.mediaController.isPracticeSessionActive()
        }
        return false
    }

    function shouldRestartMidiFromStart(forceRestart) {
        if (forceRestart) return true
        const pos = getMidiStartPosition()
        return isMidiStartFromBeginning({
            seconds: pos.seconds,
            ratio: pos.ratio,
        })
    }

     function shouldUseCountInForStart(forceRestart) {
        const pos = getMidiStartPosition()
        const metro = resolvePlaybackMetronomeOptions()
        return shouldUseMidiMetronomeCountIn({
            metronomeCountIn: metro.metronomeCountIn,
            forceRestart: !!forceRestart,
            seconds: pos.seconds,
            ratio: pos.ratio,
        })
     }

     function fullyResetMidiEnginesToStart() {
        currentTime.current = 0
        stopNativeMidiBufferOutput()
        if (pitchShifterRef.current) {
            try { pitchShifterRef.current.disconnect() } catch (e) {}
        }
        if (pitchShifterRef.current && pitchShifterBufferRef.current && gaudioContext.current) {
            initPitchShifter(gaudioContext.current, pitchShifterBufferRef.current)
        }
        if (pitchShifterRef.current) {
            try { pitchShifterRef.current.seek(0) } catch (e) {}
        }
        if (gtimingCallbacks.current) {
            try {
                gtimingCallbacks.current.pause()
                gtimingCallbacks.current.setProgress(0)
            } catch (e) {}
        }
        if (gmidiBuffer.current) {
            try { gmidiBuffer.current.seek(0) } catch (e) {}
        }
        if (props.mediaController) {
            if (props.mediaController.setCurrentTime) props.mediaController.setCurrentTime(0)
            if (props.mediaController.setClickSeek) props.mediaController.setClickSeek(0)
        }
     }

     function notifyPlaybackStarted() {
        if (!wantsMidiPlayback()) {
            releaseMidiUiLoading()
            return
        }
        midiPrimeInFlightRef.current = false
        midiStartHandledRef.current = true
        clearNotationPlaybackStartSeconds()
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
        const root = inputEl && inputEl.current;
        const svg = root ? root.querySelector('svg') : null;
        if (svg) {
          const existing = svg.querySelector('line.abcjs-cursor');
          if (existing) existing.remove();
        }
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
          return 
        }
    }
    
    function clickListener(abcelem, tuneNumber, classes, analysis, drag, mouseEvent) {
        
        if (abcelem && abcelem.type === 'tempo' && props.editableTempo) { // && props.onClickTempo) {props.onClickTempo() 
          setShowTempo(true)
        }
        if (abcelem && (abcelem.el_type === 'clef' || abcelem.el_type === 'keySignature')) { // && props.onClickTempo) {props.onClickTempo() 
          setShowTranspose(true)
        }
        var ms = (Array.isArray(abcelem.currentTrackMilliseconds) && abcelem.currentTrackMilliseconds.length > 0) ? abcelem.currentTrackMilliseconds[0] : abcelem.currentTrackMilliseconds
        
        if (!props.suppressPlaybackSeek) {
          if (gmidiBuffer && gmidiBuffer.current) gmidiBuffer.current.seek(Math.floor(ms)/1000,'seconds')
          if (pitchShifterRef.current && gmidiBuffer.current && gmidiBuffer.current.duration > 0) {
              pitchShifterRef.current.seek(Math.floor(ms) / 1000 / gmidiBuffer.current.duration)
          }
          if (gtimingCallbacks && gtimingCallbacks.current && gmidiBuffer.current && gmidiBuffer.current.duration > 0) {
              setTimingProgressFromAudioRatio(Math.floor(ms) / 1000 / gmidiBuffer.current.duration)
          }
          if (gmidiBuffer.current && gmidiBuffer.current.duration && gmidiBuffer.current.duration > 0) setSeekTo(Math.floor(ms/gmidiBuffer.current.duration)/1000)
        }
        
        if (props.onClick)  props.onClick(abcelem, tuneNumber, classes, analysis, drag, mouseEvent)
        
    }
    
    function shouldSuppressPracticePlaybackVisuals() {
        return !!(props.suppressPlaybackVisuals || props.practiceAutoPlay)
    }

    function beatCallback(currentBeat,totalBeats,lastMoment,position, debugInfo) {
        if (!gmidiBuffer.current || !(gmidiBuffer.current.duration > 0) || !totalBeats) {
            return
        }
        const newSeconds = timingProgressToAudioSeconds(
            currentBeat / totalBeats,
            getTimingMusicStartMs(),
            lastMoment,
            gmidiBuffer.current.duration
        )
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
            if (props.mediaController && props.mediaController.onAbcTimeUpdate) {
                props.mediaController.onAbcTimeUpdate(newSeconds)
            }
            currentTime.current = newSeconds
            updateRhythmMusicAnchor(newSeconds)
            maybeStopNotationSelectionPlayback(newSeconds)
            if (getRhythmPlaybackPhase(getRhythmController()) === PHASE_PLAYING) {
                // Playing clicks are driven by the 25ms scheduler on the music clock.
            } else {
                reconcileDuringPlaybackRhythm()
            }
        }
        if (props.onPracticeBeat) {
            props.onPracticeBeat({
                currentBeat: currentBeat,
                totalBeats: totalBeats,
                musicStartMs: getTimingMusicStartMs(),
                audioSeconds: newSeconds,
                repIndex: playCountRef.current,
            })
        }
         // FINISHED PLAYBACK
        // detect end of tune and handle repeats/call props.onEnded
         if (currentBeat === totalBeats) {
           // infinite repeats
           if (parseInt(props.repeat) === -1) {
             seekPlayer(0)
           // single repeat
           } else if (parseInt(props.repeat) === 0) {
             stopPlaying()
             seekPlayer(0)
             if (props.onEnded) props.onEnded()
           // specified repeats > 0
           } else if (parseInt(props.repeat, 10) > 0 ) {
             if (playCountRef.current < parseInt(props.repeat, 10) - 1) {
               incrementPlayCount()
               if (props.onRepeat) props.onRepeat(playCountRef.current + 1)
               forcePlaybackUntilStartRef.current = true
               setForceStop(false)
               scheduleRepeatRestart()
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
         if (!shouldSuppressPracticePlaybackVisuals()) {
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
        // Use ref / live MIDI check — TimingCallbacks keep a stale closure over isPlaying.
        const playing = isPlayingRef.current || isMidiPlaybackActive()
        if (playing && autoScroll.current && gmidiBuffer && gmidiBuffer.current && gmidiBuffer.current.duration > 0) { 
          //setSeekTo(ev.milliseconds/(gmidiBuffer.current.duration*1000)*getWarp())
          //if (props.mediaController)  props.mediaController.setCurrentTime((ev.milliseconds / 1000)/(gmidiBuffer.current.duration)*getWarp())
          if (lastScrollTo.current != ev.top) {
            const noteEl = ev.elements && ev.elements[0] && ev.elements[0][0]
            if (noteEl && typeof noteEl.scrollIntoView === 'function') {
              // Nearest keeps the playing note on-screen without fighting lyrics layout
              // (the old aspect-ratio window.scrollTo jumped once then stalled).
              try {
                noteEl.scrollIntoView({ block: 'nearest', inline: 'nearest' })
              } catch (err) {
                noteEl.scrollIntoView(true)
              }
            } else {
              var screenRatio = window.visualViewport.width/window.visualViewport.height
              const mobileAdjust =  (isMobile && window.visualViewport.height < 400) ? 0.45 : 1
              var finalScroll = ((ev.top) * screenRatio ) * mobileAdjust
              window.scrollTo(0,finalScroll)
            }
          }
          lastScrollTo.current = ev.top
        }
        if (!shouldSuppressPracticePlaybackVisuals()) {
            colorElements(ev.elements);
        }
    }
    
      async function saveAudioToCache(tuneId,audioBuffers, duration) {
      if (duration > 0) {
        encodeAudioBufferWithSetting(audioBuffers[0]).then(function (encoded) {
          store.setItem(tuneId, [duration, encoded.blob, encoded.format] ).then(function () {
            scheduleMediaCacheStorageCheck()
            return store.getItem(tuneId);
          })
        })
        
      }
    }
    
    async function getAudioFromCache(tuneId, audioContext) {
      if (!audioContext) return
      return store.getItem(tuneId).then(function (val) {
        if (val && Array.isArray(val)) {
          const duration = val[0]
          const buffers = val[1]
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

    function getPlaybackMetronomeTempo(visualObj) {
        const o = visualObj || gvisualObj.current
        if (!o || !o.getBeatsPerMeasure || !o.millisecondsPerMeasure) {
            return getEffectiveQpm()
        }
        return computePlaybackMetronomeTempo({
            beatsPerMeasure: o.getBeatsPerMeasure(),
            millisecondsPerMeasure: o.millisecondsPerMeasure(),
            tempoFactor: getTempoFactor(),
            fallbackQpm: getEffectiveQpm(),
        })
    }

    function getExtraMeasuresAtBeginning(visualObj) {
        const o = visualObj || gvisualObj.current
        const metro = resolvePlaybackMetronomeOptions()
        if (!metro.metronomeCountIn || !o) return 0
        return computeExtraMeasuresAtBeginning({
            beatsPerMeasure: o.getBeatsPerMeasure(),
            pickupLength: o.getPickupLength(),
            beatLength: o.getBeatLength(),
            millisecondsPerMeasure: o.millisecondsPerMeasure(),
            tempoFactor: getTempoFactor(),
            countInBarOnly: metro.countInBarOnly,
            countInBars: metro.countInBars,
        })
    }

    function getTimingMusicStartMs(visualObj) {
        const o = visualObj || gvisualObj.current
        const extra = getExtraMeasuresAtBeginning(o)
        if (extra <= 0 || !o) return 0
        return computeTimingMusicStartMs({
            extraMeasuresAtBeginning: extra,
            qpm: getPlaybackMetronomeTempo(o),
            beatLength: o.getBeatLength(),
            barLength: o.getBarLength(),
            pickupLength: o.getPickupLength(),
        })
    }

    function setTimingProgressFromAudioRatio(audioRatio) {
        if (!gtimingCallbacks.current) return
        const lastMoment = gtimingCallbacks.current.lastMoment
        const progress = audioRatioToTimingProgress(
            audioRatio,
            getTimingMusicStartMs(),
            lastMoment
        )
        try {
            gtimingCallbacks.current.setProgress(progress)
        } catch (e) {}
    }

    function buildTimingCallbacksOptions(visualObj) {
        const opts = {
            beatCallback: beatCallback,
            eventCallback: eventCallback,
            qpm: getPlaybackMetronomeTempo(visualObj),
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
        // Audio ratios are music-only; map through count-in prefix so the cursor
        // lands on the sounding notes rather than the prep measures.
        setTimingProgressFromAudioRatio(Math.max(0, Math.min(1, parseFloat(progressRatio) || 0)))
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

    function notifyPitchOutputReady() {
        if (props.mediaController && props.mediaController.finishPitchShiftPrepareRef) {
            props.mediaController.finishPitchShiftPrepareRef.current()
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
            },
            notifyPitchOutputReady
        )
        const s = pitchTempoSettingsRef.current
        pitchShifterRef.current.applySettings(s.tempo, s.pitch, s.fineTune)
        if (props.mediaController && props.mediaController.playbackVolume !== undefined) {
            pitchShifterRef.current.setDirectOutputGain(false)
            pitchShifterRef.current.setOutputVolume(props.mediaController.playbackVolume)
        } else if (props.practiceReferenceGain != null && props.practiceReferenceGain >= 0) {
            pitchShifterRef.current.setDirectOutputGain(true)
            pitchShifterRef.current.setOutputVolume(Math.max(0, Math.min(1, props.practiceReferenceGain)))
        }
    }

    function applySynthPlaybackVolume(volume) {
        if (pitchShifterRef.current) {
            pitchShifterRef.current.setOutputVolume(volume)
        }
    }

    function applyMidiPlaybackSettings(tempo, pitch, fineTune, options) {
        const opts = options || {}
        const nextTempo = tempo > 0 ? parseFloat(tempo) : 1
        const nextPitch = pitch !== undefined && pitch !== null
            ? parseInt(pitch, 10) : pitchTempoSettingsRef.current.pitch
        const nextFineTune = fineTune !== undefined && fineTune !== null
            ? parseInt(fineTune, 10) : pitchTempoSettingsRef.current.fineTune
        const resolvedPitch = isNaN(nextPitch) ? 0 : nextPitch
        const resolvedFineTune = isNaN(nextFineTune) ? 0 : nextFineTune
        const tempoChanged = pitchTempoSettingsRef.current.tempo !== nextTempo
        const pitchChanged = pitchTempoSettingsRef.current.pitch !== resolvedPitch
        const fineTuneChanged = pitchTempoSettingsRef.current.fineTune !== resolvedFineTune
        const prevCombined = combinedPitchSemitones(
            pitchTempoSettingsRef.current.pitch,
            pitchTempoSettingsRef.current.fineTune
        )
        const nextCombined = combinedPitchSemitones(resolvedPitch, resolvedFineTune)
        const modeWillChange = (Math.abs(prevCombined) < 0.0001) !== (Math.abs(nextCombined) < 0.0001)
        const wasPlaying = isMidiPlaybackActive()
        // Capture before any disconnect so pitch changes do not seek to 0.
        const ratio = captureLiveMidiPlaybackRatio()
        pitchTempoSettingsRef.current = {
            tempo: nextTempo,
            pitch: resolvedPitch,
            fineTune: resolvedFineTune,
        }
        const settings = pitchTempoSettingsRef.current
        if (opts.liveTempoOnly && wasPlaying && tempoChanged && !pitchChanged && !fineTuneChanged) {
            if (pitchShifterRef.current) {
                pitchShifterRef.current.applySettings(settings.tempo, settings.pitch, settings.fineTune)
            }
            syncPlaybackMetronomeTempo()
            return
        }
        // Live pitch/fine-tune with no tempo change: keep position.
        if (wasPlaying && !tempoChanged && (pitchChanged || fineTuneChanged)) {
            if (!pitchShifterRef.current && pitchShifterBufferRef.current && gaudioContext.current) {
                initPitchShifter(gaudioContext.current, pitchShifterBufferRef.current)
            }
            if (!pitchShifterRef.current) {
                notifyPitchOutputReady()
                return
            }
            midiPlaybackGuardUntilRef.current = Date.now() + 3000
            if (modeWillChange) {
                // Direct ↔ SoundTouch switch: recreate shifter (same as seek) then resume.
                if (pitchShifterRef.current.isConnected()) {
                    pitchShifterRef.current.disconnect()
                }
                if (pitchShifterBufferRef.current && gaudioContext.current) {
                    initPitchShifter(gaudioContext.current, pitchShifterBufferRef.current)
                }
            } else {
                pitchShifterRef.current.applySettings(settings.tempo, settings.pitch, settings.fineTune)
            }
            const ctx = gaudioContext.current
            if (!ctx) {
                notifyPitchOutputReady()
                return
            }
            const resumeAndStart = function() {
                if (ctx.state === 'running') {
                    startMidiAudioOutput(settings, ratio)
                    return
                }
                notifyPitchOutputReady()
                if (props.mediaController && props.mediaController.setTapToPlay) {
                    props.mediaController.setTapToPlay(true)
                }
            }
            if (ctx.state === 'running') {
                resumeAndStart()
            } else {
                ctx.resume().then(resumeAndStart).catch(resumeAndStart)
            }
            return
        }
        if (wasPlaying) {
            midiPlaybackGuardUntilRef.current = Date.now() + 3000
        }
        if (pitchShifterRef.current) {
            pitchShifterRef.current.applySettings(settings.tempo, settings.pitch, settings.fineTune)
        }
        if (gvisualObj.current && tempoChanged) {
            recreateTimingCallbacksAtTempo(settings.tempo, ratio, wasPlaying)
            syncPlaybackMetronomeTempo()
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
        const pos = getMidiStartPosition()
        if (isMidiStartFromBeginning(pos)) {
            return 0
        }
        if (gmidiBuffer.current && gmidiBuffer.current.duration > 0 && pos.seconds > 0) {
            return Math.min(1, pos.seconds / gmidiBuffer.current.duration)
        }
        if (!isNaN(pos.ratio) && pos.ratio > 0) {
            return Math.min(1, pos.ratio)
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
        // Media-settings MIDI after reload can kick startPlaying from
        // beginMidiPlayback, Abc pending-play, and autoPrime createPlayer.
        // Stacking those restarts count-in mid-schedule (3 quick + 3 even).
        if (countInPendingRef.current || isRhythmHandoffPhase()) {
            return
        }
        if (midiPrimeInFlightRef.current) {
            return
        }
        if (!force && isSynthSeekGuardActive()) {
            releaseMidiUiLoading()
            return
        }
        if (!wantsMidiPlayback(force)) {
            if (force) {
                releaseMidiUiLoading()
            }
            return
        }
        if (force) {
            forcePlaybackUntilStartRef.current = true
        }
        setForceStop(false)
        midiPrimeInFlightRef.current = true
        // Keep start lock across stopMetronome (it clears the flag for external stops).
        stopMetronome()
        midiPrimeInFlightRef.current = true
        resumeSynthAudioContext()
        if (gaudioContext.current && gmidiBuffer.current) {
          midiPrimeInFlightRef.current = false
          startPrimedTune(force)
        } else {
            setStarted(true)
            const loadGeneration = playbackGenerationRef.current
            createPlayer(tune, gvisualObj.current, { showUiLoading: true }).then(function(p) {
                  if (!isPlaybackGenerationCurrent(loadGeneration)) {
                      releaseMidiUiLoading()
                      return
                  }
                  var [audioContext, midiBuffer, timingCallbacks, cursor] = p
                 if (!midiBuffer) {
                   setReady(false)
                   setStarted(false)
                   releaseMidiUiLoading()
                   if (props.mediaController && props.mediaController.abortPlayingIntent
                       && !(props.mediaController.notationMidiOwner)) {
                       props.mediaController.abortPlayingIntent()
                   }
                   return
                 }
                 assignStateOnCompletion(audioContext, midiBuffer, timingCallbacks, cursor)
                 const pending = props.mediaController && props.mediaController.pendingMidiPlayRef
                     ? props.mediaController.pendingMidiPlayRef.current
                     : null
                 let pendingStartSeconds = resolveNotationPlaybackStartSeconds(pending || {})
                 if (!(pendingStartSeconds > 0)) {
                   pendingStartSeconds = pendingPlaybackStartSecondsRef.current
                 }
                 if (typeof pendingStartSeconds === 'number' && pendingStartSeconds > 0 && midiBuffer.duration > 0) {
                   pendingPlaybackStartSecondsRef.current = null
                   if (props.mediaController && props.mediaController.pendingMidiPlayRef) {
                     props.mediaController.pendingMidiPlayRef.current = null
                   }
                   const ratio = resolveNotationSeekRatio(
                     pending || {}, pendingStartSeconds, midiBuffer.duration,
                     pending && pending.tempo)
                     || Math.min(1, pendingStartSeconds / midiBuffer.duration)
                   syncPlaybackSeekFromSeconds(pendingStartSeconds, ratio)
                   setPlayCount(0)
                   midiPrimeInFlightRef.current = false
                   startMidiAndTiming({ forceRatio: ratio, forcePlayback: true })
                   return
                 }
                 setSeekTo(0)
                 setPlayCount(0)
                 midiPrimeInFlightRef.current = false
                 startPrimedTune(!hasPendingNotationSeek())
            }).catch(function(e) {
              if (e === 'cancelled' || !isPlaybackGenerationCurrent(loadGeneration)) {
                  releaseMidiUiLoading()
                  return
              }
              setReady(false)
              setStarted(false)
              releaseMidiUiLoading()
              if (props.mediaController && props.mediaController.abortPlayingIntent
                  && !(props.mediaController.notationMidiOwner)) {
                  props.mediaController.abortPlayingIntent()
              }
              if (props.onStopped) props.onStopped()
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
        stopRhythmPlayback()
        const skipPositionWrite = isSynthSeekGuardActive()
        // Always stop audio output, even during a seek guard window.
        midiPlaybackGuardUntilRef.current = Date.now() + 1000
        stopNativeMidiBufferOutput()
        if (pitchShifterRef.current) pitchShifterRef.current.disconnect()
        if (gtimingCallbacks && gtimingCallbacks.current) gtimingCallbacks.current.pause()
        if (gmidiBuffer && gmidiBuffer.current) gmidiBuffer.current.pause()
        if (skipPositionWrite) return
        // Only write the shared playback position when MIDI is the active engine.
        const midiIsActiveRoute = isMidiActivePlaybackRoute()
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
    }

    function stopPlaying()  {
        playbackGenerationRef.current += 1
        pauseMidiSynth()
        setForceStop(true)
        setIsPlaying(false)
        clearForcedPlaybackIntent()
        if (props.onStopped) props.onStopped()
    }

    function stopMidiSynth() {
        stopMetronome()
        seekPlayer(0)
        currentTime.current = 0
        const midiIsActiveRoute = isMidiActivePlaybackRoute()
        if (midiIsActiveRoute && props.mediaController) {
            if (props.mediaController.setCurrentTime) props.mediaController.setCurrentTime(0)
            if (props.mediaController.setClickSeek) props.mediaController.setClickSeek(0)
        }
        stopPlaying()
    }

    async function resumeMidiPlayback() {
        // Pause arms a short seek guard; clear it so immediate unpause can restart.
        midiPlaybackGuardUntilRef.current = 0
        forcePlaybackUntilStartRef.current = true
        setForceStop(false)
        if (!wantsMidiPlayback(true)) return false
        midiStartHandledRef.current = true
        if (!resolvePlaybackMetronomeOptions().duringPlayback) {
            stopMetronome()
        }
        resumeSynthAudioContext()
        const ratio = getMidiPlaybackRatio()
        syncTimingCallbacksToSettings(ratio)
        return startMidiAndTiming({ forcePlayback: true })
    }

    function beginMidiPlayback(options) {
        let opts = options || {}
        // Media-controls "Play MIDI" uses fresh:true after reload; treat like
        // From start so count-in is a single clean rewind path.
        if (opts.fresh && !opts.resume && !opts.preservePosition) {
            opts = Object.assign({}, opts, { restart: true })
        }
        const alwaysFromSelection = !!opts.alwaysFromSelection
        const tempoBpm = opts.tempo
            || (props.mediaController && props.mediaController.tune && props.mediaController.tune.tempo)
            || 120
        const explicitStartBeat = typeof opts.startBeat === 'number' && opts.startBeat > 0
            ? opts.startBeat
            : null
        const explicitStartMs = typeof opts.startMs === 'number' && opts.startMs >= 0
            ? opts.startMs
            : null
        let explicitStartSeconds = typeof opts.startSeconds === 'number' && opts.startSeconds > 0
            ? opts.startSeconds
            : null
        if (explicitStartSeconds == null && explicitStartMs != null) {
            explicitStartSeconds = explicitStartMs / 1000
        }
        if (explicitStartSeconds == null && explicitStartBeat != null) {
            explicitStartSeconds = notationBeatToAudioSeconds(
                explicitStartBeat, gvisualObj.current, tempoBpm)
            if (!(explicitStartSeconds > 0)) {
                explicitStartSeconds = null
            }
        }
        if (explicitStartSeconds != null) {
            pendingPlaybackStartSecondsRef.current = explicitStartSeconds
            midiPlaybackGuardUntilRef.current = 0
        }
        const hasStartPosition = explicitStartSeconds != null
            || explicitStartBeat != null
            || explicitStartMs != null
            || alwaysFromSelection
            || opts.fromNotationSelection
            || opts.preservePosition === true
        if (hasStartPosition && explicitStartSeconds == null
            && explicitStartBeat == null && explicitStartMs == null) {
            const resolvedStart = resolveNotationPlaybackStartSeconds(opts)
            if (resolvedStart > 0) {
                pendingPlaybackStartSecondsRef.current = resolvedStart
                midiPlaybackGuardUntilRef.current = 0
            }
        }
        if (isSynthSeekGuardActive() && !opts.restart && !opts.resume && !hasStartPosition) {
            releaseMidiUiLoading()
            return false
        }
        if (props.mediaController && props.mediaController.isMidiPlaybackRoute
            && !props.mediaController.isMidiPlaybackRoute()) {
            releaseMidiUiLoading()
            return false
        }
        if (opts.resume && !alwaysFromSelection) {
            if (pendingRestartFromZeroRef.current) {
                opts = Object.assign({}, opts, { resume: false, restart: true })
            } else {
            midiPlaybackGuardUntilRef.current = 0
            forcePlaybackUntilStartRef.current = true
            midiStartHandledRef.current = true
            setForceStop(false)
            if (gtimingCallbacks.current && gmidiBuffer.current && gmidiBuffer.current.duration > 0) {
                resumeMidiPlayback()
            } else {
                startPlaying(true)
            }
            return true
            }
        }
        const pendingStartSeconds = explicitStartSeconds != null
            ? explicitStartSeconds
            : resolveNotationPlaybackStartSeconds(opts)
        if (opts.restart) {
            clearArmPlaybackFromZero()
            clearNotationPlaybackSeek()
            clearNotationPlaybackStartSeconds()
            pendingPlaybackStartSecondsRef.current = null
            if (props.mediaController && props.mediaController.pendingMidiPlayRef) {
                props.mediaController.pendingMidiPlayRef.current = null
            }
        }
        const fromBeginning = opts.restart
            ? true
            : (alwaysFromSelection
                ? !(pendingStartSeconds > 0 || explicitStartBeat > 0
                    || (explicitStartMs != null && explicitStartMs > 0))
                : (!hasStartPosition && shouldRestartMidiFromStart(opts.restart)))
        if (fromBeginning) {
            // Already priming or counting in — ignore duplicate kicks from
            // media-settings play + Abc autoPrime/pending-play after reload.
            if (midiPrimeInFlightRef.current
                || countInPendingRef.current
                || isRhythmHandoffPhase()) {
                return true
            }
            if (props.mediaController && props.mediaController.pendingMidiPlayRef) {
                props.mediaController.pendingMidiPlayRef.current = null
            }
            pendingPlaybackStartSecondsRef.current = null
            invalidatePendingMidiStarts()
            fullyResetMidiEnginesToStart()
            midiStartHandledRef.current = true
            setForceStop(false)
            startPlaying(true)
            return true
        }
        if (pendingStartSeconds > 0) {
            pendingPlaybackStartSecondsRef.current = pendingStartSeconds
            midiPlaybackGuardUntilRef.current = 0
        }
        if (pendingStartSeconds > 0 && gmidiBuffer.current && gmidiBuffer.current.duration > 0) {
            const ratio = resolveNotationSeekRatio(
                opts, pendingStartSeconds, gmidiBuffer.current.duration, tempoBpm)
                || Math.min(1, pendingStartSeconds / gmidiBuffer.current.duration)
            pendingPlaybackStartSecondsRef.current = null
            if (props.mediaController && props.mediaController.pendingMidiPlayRef) {
                props.mediaController.pendingMidiPlayRef.current = null
            }
            syncPlaybackSeekFromSeconds(pendingStartSeconds, ratio)
            midiStartHandledRef.current = true
            setForceStop(false)
            startMidiAndTiming({ forceRatio: ratio, forcePlayback: true })
            return true
        }
        const alreadyPlaying = isMidiPlaybackActive()
        if (alreadyPlaying && pitchShifterRef.current && pitchShifterRef.current.isConnected()
            && gtimingCallbacks.current && gtimingCallbacks.current.isRunning) {
            if (props.mediaController && props.mediaController.confirmPlayingStarted) {
                props.mediaController.confirmPlayingStarted()
            }
            return true
        }
        if (hasStartPosition && (pendingStartSeconds > 0 || explicitStartBeat > 0
            || (explicitStartMs != null && explicitStartMs > 0))) {
            midiStartHandledRef.current = true
            setForceStop(false)
            startPlaying(true)
            return true
        }
        let ratio = getMidiPlaybackRatio()
        if (!alwaysFromSelection && ratio > 0 && gtimingCallbacks.current && gmidiBuffer.current) {
            if (isSynthSeekGuardActive()) {
                releaseMidiUiLoading()
                return false
            }
            if (alreadyPlaying && pitchShifterRef.current && pitchShifterRef.current.isConnected()
                && gtimingCallbacks.current.isRunning) {
                if (props.mediaController && props.mediaController.confirmPlayingStarted) {
                    props.mediaController.confirmPlayingStarted()
                }
                return true
            }
            resumeMidiPlayback()
            return true
        }
        midiStartHandledRef.current = true
        setForceStop(false)
        startPlaying(true)
        return true
    }

    useLayoutEffect(function() {
        beginMidiPlaybackRef.current = beginMidiPlayback
    })

    function assignStateOnCompletion(audioContext, midiBuffer, timingCallbacks, cursor) {
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
        invalidatePendingMidiStarts()
        destroyAudioEngines()
    }

    function destroyAudioEngines() {
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
        pendingPlaybackStartSecondsRef.current = null
        pendingRestartFromZeroRef.current = clamped <= (MIDI_START_FROM_BEGINNING_TOLERANCE_SECONDS
            / gmidiBuffer.current.duration)
        const wasPlaying = props.mediaController && props.mediaController.hasActivePlaybackIntent
            ? props.mediaController.hasActivePlaybackIntent()
            : isMidiPlaybackActive()
        const allowAutoResume = wasPlaying && !opts.skipAutoResume
        midiPlaybackGuardUntilRef.current = Date.now() + 3000
        currentTime.current = clamped * gmidiBuffer.current.duration
        updateRhythmMusicAnchor(currentTime.current)
        if (opts.skipAutoResume) {
            stopNativeMidiBufferOutput()
            stopMetronome()
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
        setTimingProgressFromAudioRatio(clamped)
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
        if (resolvePlaybackMetronomeOptions().duringPlayback && gmidiBuffer.current
            && gmidiBuffer.current.duration > 0) {
            const musicSeconds = clamped * gmidiBuffer.current.duration
            if (getRhythmPlaybackPhase(getRhythmController()) === PHASE_PLAYING) {
                seekRhythmPlaying(getRhythmController(), musicSeconds)
            } else if (allowAutoResume) {
                ensureDuringPlaybackMetronome(clamped)
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
        const duringPlayback = resolvePlaybackMetronomeOptions().duringPlayback
        if (!duringPlayback) {
            stopMetronome()
        }
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
                    setTimingProgressFromAudioRatio(ratio > 0 ? ratio : 0)
                    gtimingCallbacks.current.start()
                }
            } catch (e) {}
        }
        if (props.mediaController.confirmPlayingStarted) {
            props.mediaController.confirmPlayingStarted()
        }
        if (duringPlayback) {
            seekRhythmPlaying(getRhythmController(), ratio > 0 ? ratio * (gmidiBuffer.current ? gmidiBuffer.current.duration : 0) : 0)
            ensureDuringPlaybackMetronome(ratio)
        }
    }

    function seekPlayer(seekTo, play = false, options) {
        seekMidiPlayback(seekTo, options)
        if (play) startMidiAndTiming({ forcePlayback: true })
    }
    
  async function startMidiAndTiming(startOptions) {
      const opts = startOptions || {}
      const forceWanted = !!opts.forcePlayback
      const duringPlayback = resolvePlaybackMetronomeOptions().duringPlayback
      const rhythmPhaseAtStart = getRhythmPlaybackPhase(getRhythmController())
      const rhythmAlreadyPlaying = rhythmPhaseAtStart === PHASE_PLAYING
      if (!isRhythmHandoffPhase()) {
          stopMetronome()
      }
      if (!forceWanted && isSynthSeekGuardActive()) {
          releaseMidiUiLoading()
          return false
      }
      const generation = playbackGenerationRef.current
      if (!wantsMidiPlayback(forceWanted) || getForceStop()) {
          releaseMidiUiLoading()
          return false
      }
      try {
          const contextReady = await ensureSynthAudioContextRunning()
          if (!isPlaybackGenerationCurrent(generation)) {
              releaseMidiUiLoading()
              return false
          }
          if (!wantsMidiPlayback(forceWanted) || getForceStop()) {
              releaseMidiUiLoading()
              return false
          }
          if (!contextReady) {
              handleMidiAudioStartFailure()
              return false
          }

          const settings = pitchTempoSettingsRef.current
          const ratio = opts.forceRatio !== undefined
              ? Math.max(0, Math.min(1, parseFloat(opts.forceRatio) || 0))
              : getMidiPlaybackRatio()
          // Detect pre-scheduled count-in MIDI before any forceRatio seek.
          // Direct-mode seek() disconnects the BufferSource; doing that after
          // pre-schedule makes the tune start on the downbeat then restart.
          const midiWasPreScheduled = countInMidiPreScheduledRef.current
              && pitchShifterRef.current
              && pitchShifterRef.current.isConnected()
          if (opts.forceRatio !== undefined) {
              currentTime.current = gmidiBuffer.current && gmidiBuffer.current.duration > 0
                  ? ratio * gmidiBuffer.current.duration
                  : 0
              // forceRatio is music-only (0 = first note). Do not reset TimingCallbacks
              // to 0 when count-in prep measures are present — that put the cursor a
              // full count-in behind the audio for the rest of the tune.
              const atMusicStart = isMidiStartFromBeginning({ ratio: ratio })
              if (atMusicStart
                  && getExtraMeasuresAtBeginning() <= 0
                  && gtimingCallbacks.current) {
                  try {
                      gtimingCallbacks.current.pause()
                      gtimingCallbacks.current.setProgress(0)
                  } catch (e) {}
              }
              setTimingProgressFromAudioRatio(ratio)
              if (!midiWasPreScheduled) {
                  if (pitchShifterRef.current) {
                      try { pitchShifterRef.current.seek(ratio) } catch (e) {}
                  } else if (gmidiBuffer.current) {
                      try { gmidiBuffer.current.seek(ratio) } catch (e) {}
                  }
              }
          }
          const audioStart = midiWasPreScheduled
              ? {
                  ok: true,
                  actualStartAudioTime: typeof opts.startAtAudioTime === 'number'
                      ? opts.startAtAudioTime
                      : (gaudioContext.current ? gaudioContext.current.currentTime : null),
              }
              : startMidiAudioOutput(
                  settings,
                  ratio,
                  opts.startAtAudioTime != null ? opts.startAtAudioTime : null
              )
          countInMidiPreScheduledRef.current = false
          if (!audioStart || !audioStart.ok) {
              handleMidiAudioStartFailure()
              return false
          }

          if (!isPlaybackGenerationCurrent(generation) || !wantsMidiPlayback(forceWanted) || getForceStop()) {
              pauseMidiSynth()
              releaseMidiUiLoading()
              return false
          }
          if (gtimingCallbacks.current) {
              const progressRatio = opts.forceRatio !== undefined
                  ? Math.max(0, Math.min(1, parseFloat(opts.forceRatio) || 0))
                  : (ratio > 0 ? ratio : 0)
              setTimingProgressFromAudioRatio(progressRatio)
              // Mark playing before TimingCallbacks.start so eventCallback autoScroll
              // sees a live ref (callbacks are created at prime-time with a stale closure).
              isPlayingRef.current = true
              if (!gtimingCallbacks.current.isRunning) {
                  gtimingCallbacks.current.start()
              }
          }
          if (!isPlaybackGenerationCurrent(generation) || !wantsMidiPlayback(forceWanted) || getForceStop()) {
              pauseMidiSynth()
              releaseMidiUiLoading()
              return false
          }
          setIsPlaying(true)
          clearForcedPlaybackIntent()
          clearArmPlaybackFromZero()
          releaseMidiUiLoading()
          notifyPlaybackStarted()
          const rhythmPhase = getRhythmPlaybackPhase(getRhythmController())
          const countInHandoff = typeof opts.startAtAudioTime === 'number'
          const rhythmHandoffReady = rhythmPhase === PHASE_PLAYING
              || (duringPlayback && rhythmPhase === PHASE_ENTRY_GAP && countInHandoff)
          if (rhythmHandoffReady) {
              syncPlaybackMetronomeTempo()
              const controller = getRhythmController()
              const snap = getRhythmTimelineSnapshot(controller)
              const scheduledStart = typeof opts.startAtAudioTime === 'number'
                  ? opts.startAtAudioTime
                  : (snap && snap.musicStartAudioTime != null ? snap.musicStartAudioTime : null)
              const handoff = resolveCountInHandoffAnchor(
                  scheduledStart,
                  gaudioContext.current ? gaudioContext.current.currentTime : null,
                  {
                      minLeadSec: 0.002,
                      audioStartedAtScheduled: midiWasPreScheduled,
                      tempoFactor: getTempoFactor(),
                  }
              )
              const musicStartAudioTime = handoff.actualStartAudioTime
              const musicSeconds = handoff.musicSeconds
              rhythmMusicAnchorRef.current = {
                  musicSeconds: musicSeconds,
                  audioContextTime: gaudioContext.current
                      ? gaudioContext.current.currentTime
                      : (musicStartAudioTime || 0),
                  active: true,
              }
              beginRhythmPlayingAtMusicStart(controller, {
                  musicSeconds: musicSeconds,
                  musicStartAudioTime: musicStartAudioTime,
                  // 0 = downbeat; negative = anacrusis (e.g. -1 for one-beat pickup).
                  musicStartSlot: snap && snap.musicStartSlot != null
                      ? snap.musicStartSlot
                      : (controller.musicStartSlot != null ? controller.musicStartSlot : 0),
              })
          }
          if (duringPlayback
              && rhythmPhase !== PHASE_PLAYING
              && rhythmPhase !== PHASE_COUNT_IN
              && rhythmPhase !== PHASE_ENTRY_GAP) {
              ensureDuringPlaybackMetronome(ratio)
          }
          return true
      } catch (e) {
        handleMidiAudioStartFailure()
        return false
      }
  }
    
  function startPrimedTune(force = false) {
    var emergencyStop = getForceStop()
    var fromStart = shouldRestartMidiFromStart(force)
    var useCountIn = shouldUseCountInForStart(force)
    if (wantsMidiPlayback(force)) {
        if (!emergencyStop) {
          if (gtimingCallbacks && gtimingCallbacks.current && gmidiBuffer && gmidiBuffer.current) {
              if (!fromStart) {
                const pending = props.mediaController && props.mediaController.pendingMidiPlayRef
                    ? props.mediaController.pendingMidiPlayRef.current
                    : null
                let pendingStartSeconds = resolveNotationPlaybackStartSeconds(pending || {})
                if (!(pendingStartSeconds > 0)) {
                    pendingStartSeconds = pendingPlaybackStartSecondsRef.current
                }
                if (typeof pendingStartSeconds === 'number' && pendingStartSeconds > 0
                    && gmidiBuffer.current.duration > 0) {
                    pendingPlaybackStartSecondsRef.current = null
                    if (props.mediaController && props.mediaController.pendingMidiPlayRef) {
                        props.mediaController.pendingMidiPlayRef.current = null
                    }
                    const ratio = resolveNotationSeekRatio(
                        pending || {}, pendingStartSeconds, gmidiBuffer.current.duration,
                        pending && pending.tempo)
                        || Math.min(1, pendingStartSeconds / gmidiBuffer.current.duration)
                    syncPlaybackSeekFromSeconds(pendingStartSeconds, ratio)
                    startMidiAndTiming({ forceRatio: ratio, forcePlayback: true })
                    return
                }
                if (hasPendingNotationSeek()) {
                    const pendingSeek = props.mediaController && props.mediaController.pendingMidiPlayRef
                        ? props.mediaController.pendingMidiPlayRef.current
                        : null
                    if (pendingSeek && beginMidiPlaybackRef.current) {
                        beginMidiPlaybackRef.current(pendingSeek)
                    }
                    return
                }
                const resumeRatio = getMidiPlaybackRatio()
                if (resumeRatio > 0) {
                    startMidiAndTiming({ forceRatio: resumeRatio, forcePlayback: true })
                    return
                }
                startMidiAndTiming({ forcePlayback: true })
              } else if (!useCountIn) {
                invalidatePendingMidiStarts()
                fullyResetMidiEnginesToStart()
                startMidiAndTiming({ forceRatio: 0, forcePlayback: true })
              } else {
                invalidatePendingMidiStarts()
                const countInGeneration = playbackGenerationRef.current
                fullyResetMidiEnginesToStart()
                countInPendingRef.current = true
                var o = gvisualObj.current
                var tempoFactor = getTempoFactor()
                var metro = resolvePlaybackMetronomeOptions()
                var countInRhythm = resolvePlaybackMetronomeRhythm()
                const countInMeter = resolveTuneTimeSignature(
                    resolveMetronomeSettingsTune(tune, {
                        tunes: props.tunes,
                        tablatureSourceTune: props.tablatureSourceTune,
                        mediaControllerTune: props.mediaController && props.mediaController.tune,
                        abc: props.abc,
                        abcTools: props.tunebook && props.tunebook.abcTools,
                    }),
                    props.tunebook
                )
                // Full bar when practice forces it or there is no anacrusis.
                // With pickup (e.g. 3/4 Amazing Grace): count (bar − pickup) so
                // the anacrusis lands on the correct beat (1–2, enter on 3).
                const countInOptions = {
                    tempoFactor: tempoFactor,
                    countInBeats: metro.countInBeats,
                    countInBarOnly: !!metro.countInBarOnly,
                    countInBars: metro.countInBars,
                    meter: countInMeter,
                }
                var countInInput = rhythmAlignedCountInInput(o, countInRhythm, countInOptions)
                if (!countInInput) {
                    const abcBeats = parseFloat(o.getBeatsPerMeasure()) || countInRhythm.beatsPerBar
                    const abcBeatLen = parseFloat(o.getBeatLength()) || 0
                    const fallbackBeatLen = abcBeatLen > 0
                        ? abcBeatLen
                        : defaultAbcBeatLengthForMeter(countInMeter || '4/4')
                    countInInput = {
                        beatsPerMeasure: countInRhythm.beatsPerBar,
                        pickupLength: metro.countInBarOnly
                            ? 0
                            : (parseFloat(o.getPickupLength()) || 0),
                        beatLength: fallbackBeatLen > 0
                            ? fallbackBeatLen * (abcBeats / countInRhythm.beatsPerBar)
                            : 0,
                        millisecondsPerMeasure: o.millisecondsPerMeasure(),
                        tempoFactor: tempoFactor,
                        countInBeats: metro.countInBeats,
                        countInBarOnly: !!metro.countInBarOnly,
                        countInBars: metro.countInBars,
                    }
                }
                var countIn = computeMidiMetronomeCountIn(countInInput)
                var metronomeBeats = countIn.metronomeBeats
                const extraMeasures = getExtraMeasuresAtBeginning()
                const pickupDelayMs = parseFloat(countIn.delayMs) || 0
                const countInBeatLength = parseFloat(countInInput.beatLength) || 0
                const countInPickupLength = metro.countInBarOnly
                    ? 0
                    : (parseFloat(countInInput.pickupLength) || 0)
                const pickupBeats = (countInPickupLength > 0 && countInBeatLength > 0)
                    ? countInPickupLength / countInBeatLength
                    : 0

                function startCountInCursor() {
                    if (metro.duringPlayback) return
                    if (extraMeasures > 0 && gtimingCallbacks.current) {
                        try {
                            gtimingCallbacks.current.reset()
                            gtimingCallbacks.current.start(0)
                        } catch (e) {}
                    }
                }

                function startWithMetronome() {
                    if (!isPlaybackGenerationCurrent(countInGeneration)) {
                        countInPendingRef.current = false
                        return
                    }
                    if (!metro.metronomeCountIn || metronomeBeats <= 0) {
                       countInPendingRef.current = false
                       startMidiAndTiming({ forceRatio: 0, forcePlayback: true })
                       return
                    }

                    const beginCountIn = function(contextReady) {
                        if (!isPlaybackGenerationCurrent(countInGeneration)) {
                            countInPendingRef.current = false
                            return
                        }
                        if (!wantsMidiPlayback()) {
                            countInPendingRef.current = false
                            return
                        }
                        if (!contextReady) {
                            countInPendingRef.current = false
                            releaseMidiUiLoading()
                            showMidiTapToPlay()
                            return
                        }

                        var effectiveTempo = computeCountInGridTempo(o, countInRhythm, Object.assign({}, countInOptions, {
                            fallbackQpm: getPlaybackMetronomeTempo(o),
                        }))
                        if (!(effectiveTempo > 0)) effectiveTempo = getRhythmGridMetronomeTempo()
                        if (!(effectiveTempo > 0)) effectiveTempo = getPlaybackMetronomeTempo()
                        if (!(effectiveTempo > 0)) effectiveTempo = 120
                        var countInSlots = computeCountInSlotCount(o, countInRhythm, countInOptions)
                        if (!(countInSlots > 0)) countInSlots = metronomeBeats
                        // No anacrusis: exact N bars of rhythm beats (4 in 4/4, 3 in 3/4).
                        if (pickupBeats <= 0 && countInRhythm.beatsPerBar > 0) {
                            const bars = metro.countInBars > 0 ? metro.countInBars : 1
                            countInSlots = Math.floor(countInRhythm.beatsPerBar * bars)
                            metronomeBeats = countInSlots
                        }
                        const duringPlayback = metro.duringPlayback === true
                        const preferredCue = (props.metronomeCountInCueMidi != null
                          && Number.isFinite(props.metronomeCountInCueMidi))
                          ? Math.round(props.metronomeCountInCueMidi)
                          : null
                        const fromVisual = firstPlaybackCueMidiFromVisual(gvisualObj.current)
                        const cueMidi = preferredCue != null
                          ? preferredCue
                          : ((fromVisual != null && Number.isFinite(fromVisual))
                            ? fromVisual
                            : firstWarmupCueMidi(props.abc))
                        const beatDurationSec = 60 / effectiveTempo
                        const cueDurationSec = Math.max(0.35, Math.min(1.2, beatDurationSec * 0.95))
                        const primedCueBuffer = gmidiBuffer.current
                          && gmidiBuffer.current.audioBuffers
                          && gmidiBuffer.current.audioBuffers[0]
                        const cueReady = primedCueBuffer
                          ? Promise.resolve(primedCueBuffer)
                          : (cueMidi != null && Number.isFinite(cueMidi)
                            ? preloadCountInCueInstrument(gaudioContext.current)
                            : Promise.resolve(null))

                        const launchCountIn = function() {
                            if (!isPlaybackGenerationCurrent(countInGeneration)) {
                                countInPendingRef.current = false
                                releaseMidiUiLoading()
                                return
                            }
                            const gridTempo = computeCountInGridTempo(o, countInRhythm, Object.assign({}, countInOptions, {
                                fallbackQpm: effectiveTempo,
                            }))
                            const tempo = gridTempo > 0 ? gridTempo : effectiveTempo
                            countInMidiPreScheduledRef.current = false
                            const countInStarted = startRhythmCountIn(getRhythmController(), {
                                rhythm: countInRhythm,
                                tempo: tempo,
                                slotCount: countInSlots,
                                duringPlayback: duringPlayback,
                                pickupBeats: pickupBeats,
                                entryGapDelayMs: pickupDelayMs,
                                audioContext: gaudioContext.current,
                                playSlot: rhythmPlaySlotFn,
                                getMusicSeconds: getRhythmMusicSeconds,
                                getTempoFactor: getTempoFactor,
                                getGridTempo: function() {
                                    return computeCountInGridTempo(o, countInRhythm, Object.assign({}, countInOptions, {
                                        fallbackQpm: effectiveTempo,
                                    })) || getRhythmGridMetronomeTempo()
                                },
                                onSlot: function(slot, emitted, total) {
                                    if (!isPlaybackGenerationCurrent(countInGeneration)) return
                                    if (props.onCountInBeat) {
                                        props.onCountInBeat({
                                            beat: Math.min(emitted, total),
                                            totalBeats: total,
                                            remaining: Math.max(0, total - emitted + 1),
                                            slotsRemaining: Math.max(0, countInSlots - emitted),
                                        })
                                    }
                                },
                                onFirstNoteSchedule: shouldScheduleCountInPitchCue()
                                    ? function(time) {
                                    if (!isPlaybackGenerationCurrent(countInGeneration)) return
                                    const cueGain = props.practiceReferenceGain != null
                                        ? Math.max(0.35, Math.min(1, props.practiceReferenceGain * 4))
                                        : 0.75
                                    cueReady.then(function(buffer) {
                                        if (!isPlaybackGenerationCurrent(countInGeneration)) return
                                        scheduleCountInCueNote(
                                            gaudioContext.current,
                                            cueMidi,
                                            time,
                                            cueDurationSec,
                                            cueGain,
                                            null
                                        )
                                    }).catch(function() {})
                                }
                                    : null,
                                onMusicStart: function(scheduledMusicStartAudioTime) {
                                    if (!isPlaybackGenerationCurrent(countInGeneration)) {
                                        countInPendingRef.current = false
                                        releaseMidiUiLoading()
                                        return
                                    }
                                    if (!wantsMidiPlayback(true)) {
                                        countInPendingRef.current = false
                                        releaseMidiUiLoading()
                                        return
                                    }
                                    const startAt = typeof scheduledMusicStartAudioTime === 'number'
                                        ? scheduledMusicStartAudioTime
                                        : null
                                    if (!duringPlayback) {
                                        prepareFreshMidiStartFromCountIn()
                                    }
                                    // Keep count-in pending until handoff finishes so media
                                    // cold-start kicks cannot stack a second startMidiAndTiming.
                                    Promise.resolve(startMidiAndTiming({
                                        forceRatio: 0,
                                        forcePlayback: true,
                                        startAtAudioTime: startAt,
                                    })).finally(function() {
                                        countInPendingRef.current = false
                                    })
                                },
                            })
                            if (!countInStarted) {
                                countInPendingRef.current = false
                                releaseMidiUiLoading()
                                prepareFreshMidiStartFromCountIn()
                                startMidiAndTiming({ forceRatio: 0, forcePlayback: true })
                            } else {
                                releaseMidiUiLoading()
                                // Pre-schedule pitch-shifted MIDI on the count-in downbeat so
                                // async handoff cannot start music a beat late (accent on 4).
                                if (duringPlayback && pitchShifterRef.current && gaudioContext.current) {
                                    const preStartAt = getRhythmController().musicStartAudioTime
                                    if (typeof preStartAt === 'number'
                                        && preStartAt > gaudioContext.current.currentTime + 0.05) {
                                        const pre = startMidiAudioOutput(
                                            pitchTempoSettingsRef.current,
                                            0,
                                            preStartAt
                                        )
                                        countInMidiPreScheduledRef.current = !!(pre && pre.ok)
                                    }
                                }
                            }
                        }

                        launchCountIn()
                        startCountInCursor()
                    }

                    ensureSynthAudioContextRunning().then(function(contextReady) {
                        const startCountInFlow = function() {
                            beginCountIn(contextReady)
                        }
                        if (countInRhythm.engineMode === ENGINE_MODE_DRUMS) {
                            primeDrumKit(gaudioContext.current).then(startCountInFlow).catch(startCountInFlow)
                        } else {
                            startCountInFlow()
                        }
                    })
                }
                var speakTitle = localStorage.getItem('bookstorage_announcesong') === "true" ? true : false
                if (speakTitle && tune) {
                  var toSpeak = tune.name
                  if (tune.composer) toSpeak += " by " + tune.composer
                  window.speak(toSpeak)
                  setTimeout(function() {
                    if (!isPlaybackGenerationCurrent(countInGeneration)) return
                    if (wantsMidiPlayback()) {
                      startWithMetronome()
                    }
                  }, 1000)
                } else {
                  startWithMetronome()
                }
              }
          } else {
          }
        } else {
          stopPlaying()
        }
    }
  }

  
  function primeAudio() {
      
    return new Promise(function(resolve,reject) {
        var audioContext = null
        if (abcjs.synth.supportsAudio()) {
          window.AudioContext = window.AudioContext ||
            window.webkitAudioContext ||
            navigator.mozAudioContext ||
            navigator.msAudioContext;
          audioContext = new window.AudioContext();
          const fromGesture = props.mediaController && props.mediaController.userGesturePlayRef
              && props.mediaController.userGesturePlayRef.current
          const fromPracticeGesture = props.consumePlaybackGesture && props.consumePlaybackGesture()
          if ((fromGesture || fromPracticeGesture) && audioContext.state === 'suspended') {
              audioContext.resume()
          }
            resolve(audioContext)
        } else {
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

  function primeTune(tune, audioContext, visualObj, force = false, options = {}) {
      const showUiLoading = !!options.showUiLoading
      const synthObj = options.playbackVisualObj || visualObj
      if (primePromiseRef.current && isLoading.current) {
          return primePromiseRef.current
      }
      //var tempo = tune ? tune.tempo : 100
      const promise = new Promise(function(resolve,reject) {
          isLoading.current = true
          if (showUiLoading && props.mediaController) props.mediaController.setIsLoading(true)
          // cleanup first — tear down old engines only; do not bump playback
          // generation or we invalidate the prime we are about to start.
          destroyAudioEngines()
          const generation = playbackGenerationRef.current
          if (visualObj) {
            setMidiBuffer(null)
            var midiBuffer = new abcjs.synth.CreateSynth()
            var count = 0
            // Prefer full MusyngKite from the resolver when the volume bank is ready;
            // otherwise use the embedded selection and remap GM programs onto it.
            // Per-tune: "local" forces remap; "online"/"" uses resolver when ready.
            var musyngReady = isResolverMusyngKiteReady()
            if (tune && tune.soundFonts === 'local') musyngReady = false
            var a = getSoundFontUrl({ musyngKiteReady: musyngReady })
            //var warp =  props.warp > 0 ? props.warp : 1
            var soundFontVolume = getSoundFontVolumeMultiplier()
            // Practice quiet/loud level is applied live via pitch-shifter output
            // gain so the session volume slider can change without re-priming.
            var initOptions = {
                audioContext: audioContext,
              //onPlaying: function(details) {
                //if (midiBuffer.duration > 0) setSeekTo((details.timePlayed + details.startOffset)/midiBuffer.duration)
              //},
              millisecondsPerMeasure: synthObj.millisecondsPerMeasure(),
              options:{
                 soundFontUrl: a,
                 soundFontVolumeMultiplier: soundFontVolume,
                 //program: 21,
                 chordsOff: false,
                 programOffsets: programOffsets,
               },
            }
            if (musyngReady) {
              initOptions.visualObj = synthObj
            } else {
              // Remap GM programs onto the local instrument subset so abcjs only
              // requests samples that exist under selection/MusyngKite.
              try {
                var flattened = synthObj.setUpAudio({})
                remapFlattenedMidiPrograms(flattened)
                initOptions.sequence = flattened
              } catch (remapErr) {
                console.warn('Local soundfont program remap failed; using visualObj', remapErr)
                initOptions.visualObj = synthObj
              }
            }
            // Legacy "online" preference: when resolver bank is ready, MusyngKite
            // already covers full GM. When not ready, keep remapped local fonts
            // (no longer clears soundFontUrl to hit FluidR3 CDN).
            if (synthObj.visualTranspose > 0 || synthObj.visualTranspose < 0 ) {
              initOptions.options.midiTranspose = parseInt(synthObj.visualTranspose)
            }
         
            function getAudioHash(tune) {
              return tune.id + "-" + tune.tempo  + '-'+tune.transpose+"-"+props.tunebook.utils.hash(props.tunebook.abcTools.getNotesFromAbc(props.abc))
            }
            
            function resolveWithTimingAndCursor(midiBuffer) {
              if (!isPlaybackGenerationCurrent(generation)) {
                isLoading.current = false
                releaseMidiUiLoading()
                resolve(null)
                return
              }
              var timingCallbacks = new abcjs.TimingCallbacks(visualObj, buildTimingCallbacksOptions(visualObj))
              var cursor = createCursor()
              releaseMidiUiLoading()
              resolve({midiBuffer, timingCallbacks, cursor})
            }
             
            function primeAndResolve() {
                //if (force) { 
                  midiBuffer.init(initOptions).then(
                  function (response) { 
                    midiBuffer.prime().then(function(presponse) {
                      //if (props.setMidiData) props.setMidiData(abcjs.synth.getMidiFile(visualObj, { midiOutputType: 'binary', bpm: tune.tempo ? tune.tempo : 100 }))
                      if (tune && tune.id && props.cacheAudio !== false) { 
                        saveAudioToCache(getAudioHash(tune),midiBuffer.audioBuffers, midiBuffer.duration).then(function() {
                          resolveWithTimingAndCursor(midiBuffer)
                        })
                      } else {
                        resolveWithTimingAndCursor(midiBuffer)
                      }
                    })
                    .catch(function (error) {
                      if (isPlaybackGenerationCurrent(generation)) {
                        releaseMidiUiLoading()
                      } else {
                        isLoading.current = false
                      }
                      resolve(null)
                    })
                  }).catch(function (error) {
                     if (isPlaybackGenerationCurrent(generation)) {
                       releaseMidiUiLoading()
                     } else {
                       isLoading.current = false
                     }
                    resolve(null)
                  })
                //} else {
                  //resolve(null)
                //}
             }

              
              if ((tune && tune.id)) {
                if (props.cacheAudio !== false) {
                    getAudioFromCache(getAudioHash(tune), audioContext).then(function(audioResult) {
                        if (audioResult) {
                          
                          const [duration, audioBuffers] = audioResult
                          if (audioBuffers) {
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
              if (isPlaybackGenerationCurrent(generation)) {
                releaseMidiUiLoading()
              } else {
                isLoading.current = false
              }
              reject(null)
          }
      })
      primePromiseRef.current = promise
      promise.finally(function() {
          if (primePromiseRef.current === promise) {
              primePromiseRef.current = null
          }
      })
      return promise
  }
                    
  

  function createPlayer(tune, visualObj, options = {}) {
      const generation = playbackGenerationRef.current
      const showUiLoading = !!options.showUiLoading
      const debounceMs = showUiLoading
          ? 0
          : (props.audioRenderTimeout > 0 ? props.audioRenderTimeout : 1500)
      return new Promise(function(resolve, reject) {
        if (tune && visualObj) {
            // already created
            if (gmidiBuffer.current && gtimingCallbacks.current && gcursor.current && gaudioContext.current) {
            } 
            if (true) {
                primeAudio().then(function(audioContext) {
                    if (audioContext) {
                        //setReady(false)
                        //renderActive = true
                        if (primeTimerRef && primeTimerRef.current) clearTimeout(primeTimerRef.current)
                        // use timeout to prevent duplicate calls on load
                        primeTimerRef.current = setTimeout(function() {
                          if (!isPlaybackGenerationCurrent(generation)) {
                            resolve([audioContext, null, null, null, visualObj])
                            return
                          }
                          primeTune(tune, audioContext, visualObj, false, Object.assign({}, options, {
                            playbackVisualObj: synthVisualObj(visualObj),
                          })).then(function(primeParams) {
                             if (!isPlaybackGenerationCurrent(generation)) {
                               resolve([audioContext, null, null, null, visualObj])
                               return
                             }
                             if (primeParams) {
                               const {midiBuffer, timingCallbacks, cursor} = primeParams
                               resolve([audioContext, midiBuffer, timingCallbacks, cursor, visualObj])
                             } else {
                               resolve([audioContext, null,null,null, visualObj])
                             }
                          }).catch(function(e) {
                              if (e === 'cancelled') {
                                resolve([audioContext, null, null, null, visualObj])
                                return
                              }
                              reject(e)
                          })
                        }, debounceMs)
                    } else reject('No audio context')
                }).catch(function(e) {
                    reject(e.message)
                })
            }
        } else reject('Missing rendered tune')
    })
  }

  return {createCursor, programOffsets, clickListener, beatCallback, eventCallback, metronomeTimeout, metronome, rhythmController, gaudioContext, gmidiBuffer, gvisualObj, gplaybackVisualObj, gtimingCallbacks, gcursor,  showTempo, setShowTempo,showTranspose, setShowTranspose, clickSeek, setClickSeek, lastPlaybackSpeed, setLastPlaybackSpeed, audioChangedHash, setAudioChangedHash, tapToPlay, setTapToPlay, playCancelled, setPlayCancelled, abcTune, setAbcTune, lastAbc, setLastAbc, lastTempo, setLastTempo, lastBoost, setLastBoost, isPlaying, setIsPlaying, playCount, setPlayCountInner, playCountRef, setPlayCount, incrementPlayCount, lastScrollTo, autoScroll, realProgress, seekTo, setSeekTo, forceSeekTo, setForceSeekTo, ready, setReady, started, setStarted, store, abcTools, inputEl, playTimerRef, setAudioContext, setMidiBuffer, setVisualObj, setPlaybackVisualObj, setTimingCallbacks, setCursor, setForceStop, getForceStop, getWarp, getWarpTempo, saveAudioToCache, getAudioFromCache, startPlaying, startPlayingFromIntent, stopPlaying, assignStateOnCompletion, resetAudioState, seekPlayer, createPlayer, primeTune, primeAudio, startPrimedTune, tune, setTune, isLastPlaying, setIsLastPlaying, setTempoFactor, applyMidiTempo, getPitchTempoState, resetPitchTempo, applyPlaybackSettings, getPlaybackGeneration: function() { return playbackGenerationRef.current }, isPlaybackGenerationCurrent}
}



