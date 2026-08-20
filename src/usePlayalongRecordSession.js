import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  appendPlayalongTake,
  enableNotationInViewMode,
  estimateMusicStartOffsetSeconds,
  isPlayalongMusicBeat,
  persistPlayalongRecording,
  playalongMusicStartWallClockMs,
  resolvePlayalongMusicStartOffsetSeconds,
  refinePlayalongMusicStartOffsetSeconds,
  removePlayalongTake,
  clearPlayalongTakesPatch,
  mergePlayalongTakes,
  deleteRecording,
  normalizePlayalongTakes,
  shouldContinuePlayalongLoop,
} from './playalongTakes'
import { clampReferenceGain } from './practiceSessionSettings'
import {
  loadPlayalongSettings,
  playalongTrackingOptions,
  clampPlayalongRepeats,
} from './playalongSettings'
import { displayFlagsToViewMode, viewModeToDisplayFlags } from './viewModeUtils'
import {
  compactPeaks,
  compactPitchPoints,
  createLivePeakSampler,
  peaksDurationSeconds,
} from './playalongWaveform'
import { expectedNotesFromPlayalongTune } from './playalongTakeScore'

function stopStream(stream) {
  if (!stream || typeof stream.getTracks !== 'function') return
  stream.getTracks().forEach(function(track) {
    try { track.stop() } catch (e) {}
  })
}

function stopPlayalongMidi(media) {
  if (!media) return
  if (typeof media.stopNotationMidiPlayback === 'function') {
    try { media.stopNotationMidiPlayback() } catch (e) {}
    return
  }
  if (typeof media.stop === 'function') {
    try { media.stop() } catch (e) {}
  }
  if (typeof media.setIsLoading === 'function') {
    try { media.setIsLoading(false) } catch (e) {}
  }
}

function resumeSynthFromGesture(media) {
  if (!media) return
  if (typeof media.resumeSynthAudioContextFromGesture === 'function') {
    try { media.resumeSynthAudioContextFromGesture() } catch (e) {}
    return
  }
  if (media.resumeSynthAudioContextRef && typeof media.resumeSynthAudioContextRef.current === 'function') {
    try { media.resumeSynthAudioContextRef.current() } catch (e) {}
  }
}
function rewindPlayalongPlayback(media) {
  if (!media) return
  if (typeof media.pause === 'function') {
    try { media.pause() } catch (e) {}
  }
  if (media.notationPlaybackSeekRef) media.notationPlaybackSeekRef.current = null
  if (media.notationPlaybackStartSecondsRef) media.notationPlaybackStartSecondsRef.current = null
  if (media.pendingMidiPlayRef) media.pendingMidiPlayRef.current = null
  if (media.currentTimeRef) media.currentTimeRef.current = 0
  if (typeof media.setClickSeek === 'function') {
    try { media.setClickSeek(0) } catch (e) {}
  }
  if (typeof media.setCurrentTime === 'function') {
    try { media.setCurrentTime(0) } catch (e) {}
  }
}

export function playalongMidiStartOptions(tune, tempoBpm) {
  return {
    tune: tune,
    startBeat: 0,
    midiOnly: true,
    fromStart: true,
    restart: true,
    fresh: true,
    preservePosition: false,
    tempo: tempoBpm,
  }
}

function startPlayalongMidi(media, tune, tempoBpm) {
  rewindPlayalongPlayback(media)
  stopPlayalongMidi(media)
  rewindPlayalongPlayback(media)
  if (media && typeof media.startNotationMidiPlayback === 'function') {
    media.startNotationMidiPlayback(playalongMidiStartOptions(tune, tempoBpm))
    return
  }
  if (media && typeof media.playFromUserGesture === 'function') {
    media.playFromUserGesture({ fresh: true, restart: true, fromStart: true, preservePosition: false })
    return
  }
  if (media && typeof media.play === 'function') {
    media.play({ fresh: true, restart: true, fromStart: true, preservePosition: false })
  }
}

function resolvePlayalongTempoBpm(book, current, tempoOverride) {
  const tempoBpmFromTune = book && book.abcTools && typeof book.abcTools.getTempo === 'function'
    ? book.abcTools.getTempo(current)
    : 100
  return Number.isFinite(tempoOverride) && tempoOverride > 0
    ? tempoOverride
    : tempoBpmFromTune
}

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

const SPURIOUS_ENDED_GUARD_MS = 750

export default function usePlayalongRecordSession(options) {
  const opts = options || {}
  const tune = opts.tune
  const tunebook = opts.tunebook
  const mediaController = opts.mediaController
  const viewMode = opts.viewMode
  const setViewMode = opts.setViewMode
  const setTune = opts.setTune

  const [isRecording, setIsRecording] = useState(false)
  const [compareActive, setCompareActive] = useState(false)
  const [takesState, setTakesState] = useState(function() {
    return normalizePlayalongTakes(tune && tune.playalongTakes)
  })
  const [blobById, setBlobById] = useState({})
  const [peaksById, setPeaksById] = useState({})
  const [pitchPointsById, setPitchPointsById] = useState({})
  const [error, setError] = useState(null)
  const [loopTakeNumber, setLoopTakeNumber] = useState(0)
  const [loopMaxTakes, setLoopMaxTakes] = useState(function() {
    return clampPlayalongRepeats(loadPlayalongSettings().repeats)
  })
  const [midiEngineActive, setMidiEngineActive] = useState(false)
  const [isSavingTake, setIsSavingTake] = useState(false)
  const [livePitchPoints, setLivePitchPoints] = useState([])
  const [liveTempoBpm, setLiveTempoBpm] = useState(0)
  const [liveMusicStartOffsetSeconds, setLiveMusicStartOffsetSeconds] = useState(0)

  const isRecordingRef = useRef(false)
  const tempoBpmOverrideRef = useRef(null)
  const recorderRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])
  const startedAtRef = useRef(0)
  const takeStartedAtRef = useRef(0)
  const stoppingRef = useRef(false)
  const loopActiveRef = useRef(false)
  const loopMaxTakesRef = useRef(clampPlayalongRepeats(loadPlayalongSettings().repeats))
  const loopTransitionRef = useRef(false)
  const takesStartedRef = useRef(0)
  const sessionTakesAccRef = useRef([])
  const peakSamplerRef = useRef(null)
  const beginTakeRef = useRef(null)
  const pendingMidiTakeRef = useRef(0)
  const persistEpochRef = useRef(0)
  const savingIdRef = useRef(0)
  const sawPlaybackStartRef = useRef(false)
  const peakSamplerStartedAtRef = useRef(0)
  const musicStartedAtRef = useRef(0)
  const playbackStartedAtRef = useRef(0)
  const trackingOptionsRef = useRef(playalongTrackingOptions(loadPlayalongSettings()))
  const tuneRef = useRef(tune)
  const tunebookRef = useRef(tunebook)
  const mediaControllerRef = useRef(mediaController)
  const viewModeRef = useRef(viewMode)
  const setViewModeRef = useRef(setViewMode)
  const setTuneRef = useRef(setTune)

  tuneRef.current = tune
  tunebookRef.current = tunebook
  mediaControllerRef.current = mediaController
  viewModeRef.current = viewMode
  setViewModeRef.current = setViewMode
  setTuneRef.current = setTune

  const referenceGain = clampReferenceGain(
    opts.playbackGain != null ? opts.playbackGain : loadPlayalongSettings().playbackGain
  )

  useEffect(function() {
    const next = normalizePlayalongTakes(tune && tune.playalongTakes)
    sessionTakesAccRef.current = next
    setTakesState(next)
  }, [tune && tune.playalongTakes])

  const saveTunePatch = useCallback(function(patch) {
    const current = tuneRef.current
    if (!current || !current.id) return current
    const next = Object.assign({}, current, patch)
    if (typeof setTuneRef.current === 'function') setTuneRef.current(next)
    const book = tunebookRef.current
    if (book && typeof book.saveTune === 'function') book.saveTune(next)
    return next
  }, [])

  const turnNotationOn = useCallback(function() {
    const nextMode = enableNotationInViewMode(
      viewModeRef.current,
      viewModeToDisplayFlags,
      displayFlagsToViewMode
    )
    if (nextMode !== viewModeRef.current) {
      if (typeof setViewModeRef.current === 'function') setViewModeRef.current(nextMode)
      saveTunePatch({ viewMode: nextMode })
    }
  }, [saveTunePatch])

  const finishSession = useCallback(function() {
    loopActiveRef.current = false
    stoppingRef.current = false
    isRecordingRef.current = false
    pendingMidiTakeRef.current = 0
    tempoBpmOverrideRef.current = null
    setIsRecording(false)
    setLoopTakeNumber(0)
    setMidiEngineActive(false)
    sawPlaybackStartRef.current = false
    peakSamplerStartedAtRef.current = 0
    musicStartedAtRef.current = 0
    playbackStartedAtRef.current = 0
    stopPlayalongMidi(mediaControllerRef.current)
    stopStream(streamRef.current)
    streamRef.current = null
  }, [])

  const finishRecording = useCallback(function(blob, durationSeconds, livePeaks, livePitchPoints, samplerStats) {
    const current = tuneRef.current
    const book = tunebookRef.current
    if (!current || !blob) return Promise.resolve()
    const media = mediaControllerRef.current
    const estimatedOffsetSeconds = estimateMusicStartOffsetSeconds(
        current,
        book,
        media && media.playbackSpeed,
        tempoBpmOverrideRef.current
      )
    const resolvedOffset = resolvePlayalongMusicStartOffsetSeconds({
      samplerStartedAtMs: peakSamplerStartedAtRef.current,
      musicStartedAtMs: musicStartedAtRef.current,
      playbackStartedAtMs: playbackStartedAtRef.current,
      estimatedOffsetSeconds: estimatedOffsetSeconds,
    })
    const tempoBpmFromTune = book && book.abcTools && typeof book.abcTools.getTempo === 'function'
      ? book.abcTools.getTempo(current)
      : 100
    const tempoBpm = Number.isFinite(tempoBpmOverrideRef.current) && tempoBpmOverrideRef.current > 0
      ? tempoBpmOverrideRef.current
      : tempoBpmFromTune
    const peaks = compactPeaks(livePeaks || [])
    const pitchPoints = compactPitchPoints(Array.isArray(livePitchPoints) ? livePitchPoints : [])
    const firstNotes = expectedNotesFromPlayalongTune(current, 0)
    const offset = refinePlayalongMusicStartOffsetSeconds(resolvedOffset, pitchPoints, {
      firstExpectedMidi: firstNotes[0] && firstNotes[0].midi,
    })
    const peakDuration = peaksDurationSeconds(livePeaks)
    const duration = peakDuration > 0 ? peakDuration : durationSeconds
    const persistEpoch = persistEpochRef.current
    const savingId = savingIdRef.current + 1
    savingIdRef.current = savingId
    setIsSavingTake(true)
    setCompareActive(true)
    return persistPlayalongRecording({
      tune: current,
      blob: blob,
      duration: duration,
      musicStartOffsetSeconds: offset,
      tempoBpm: tempoBpm,
      peaks: peaks,
      pitchPoints: pitchPoints,
    }).then(function(saved) {
      if (persistEpochRef.current !== persistEpoch) return
      const nextTakes = appendPlayalongTake(sessionTakesAccRef.current, saved.take)
      sessionTakesAccRef.current = nextTakes
      setTakesState(nextTakes)
      saveTunePatch({ playalongTakes: nextTakes })
      setBlobById(function(prev) {
        const next = Object.assign({}, prev)
        next[saved.take.recordingId] = saved.blob
        return next
      })
      setPeaksById(function(prev) {
        const next = Object.assign({}, prev)
        next[saved.take.recordingId] = peaks
        return next
      })
      setPitchPointsById(function(prev) {
        const next = Object.assign({}, prev)
        next[saved.take.recordingId] = pitchPoints
        return next
      })
      setCompareActive(true)
    }).catch(function(err) {
      setError(err && err.message ? err.message : 'Could not save recording')
      loopActiveRef.current = false
    }).then(function() {
      if (savingIdRef.current === savingId) setIsSavingTake(false)
    })
  }, [saveTunePatch])

  const armRecorder = useCallback(function(stream) {
    if (!stream) return
    streamRef.current = stream
    if (peakSamplerRef.current && typeof peakSamplerRef.current.stop === 'function') {
      peakSamplerRef.current.stop()
    }
    peakSamplerRef.current = createLivePeakSampler(stream, trackingOptionsRef.current)
    peakSamplerStartedAtRef.current = peakSamplerRef.current.startedAtMs || nowMs()
    let recorder
    try {
      recorder = new MediaRecorder(stream)
    } catch (e) {
      recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
    }
    recorderRef.current = recorder
    chunksRef.current = []
    recorder.ondataavailable = function(e) {
      if (e.data && e.data.size) chunksRef.current.push(e.data)
    }
    recorder.start(250)
  }, [])

  const restartPlayalongMidiForTake = useCallback(function() {
    const media = mediaControllerRef.current
    const current = tuneRef.current
    const book = tunebookRef.current
    if (!media || !current) return
    resumeSynthFromGesture(media)
    sawPlaybackStartRef.current = false
    playbackStartedAtRef.current = 0
    musicStartedAtRef.current = 0
    startPlayalongMidi(
      media,
      current,
      resolvePlayalongTempoBpm(book, current, tempoBpmOverrideRef.current)
    )
  }, [])

  const beginTake = useCallback(function(options) {
    const reuseStream = !!(options && options.reuseStream)
    const current = tuneRef.current
    if (!current || !current.id) return
    if (!reuseStream && isRecordingRef.current) return
    if (typeof navigator === 'undefined'
      || !navigator.mediaDevices
      || !navigator.mediaDevices.getUserMedia
      || typeof MediaRecorder === 'undefined') {
      setError('Microphone recording is not supported in this browser')
      finishSession()
      return
    }

    setError(null)
    isRecordingRef.current = true
    sawPlaybackStartRef.current = false
    musicStartedAtRef.current = 0
    playbackStartedAtRef.current = 0
    peakSamplerStartedAtRef.current = 0
    stoppingRef.current = false
    setIsRecording(true)
    chunksRef.current = []
    startedAtRef.current = nowMs()
    takeStartedAtRef.current = startedAtRef.current
    takesStartedRef.current += 1
    setLoopTakeNumber(takesStartedRef.current)
    pendingMidiTakeRef.current = takesStartedRef.current
    setMidiEngineActive(true)
    turnNotationOn()

    if (options && Number.isFinite(options.tempoBpm) && options.tempoBpm > 0) {
      tempoBpmOverrideRef.current = options.tempoBpm
    }

    const media = mediaControllerRef.current
    resumeSynthFromGesture(media)

    if (reuseStream && streamRef.current) {
      armRecorder(streamRef.current)
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(function() {
          restartPlayalongMidiForTake()
          loopTransitionRef.current = false
        })
      } else {
        restartPlayalongMidiForTake()
        loopTransitionRef.current = false
      }
      return
    }

    navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
      if (!isRecordingRef.current || !loopActiveRef.current) {
        stopStream(stream)
        return
      }
      armRecorder(stream)
    }).catch(function(err) {
      setError(err && err.message ? err.message : 'Microphone permission denied')
      stopPlayalongMidi(media)
      finishSession()
    })
  }, [armRecorder, finishSession, turnNotationOn, restartPlayalongMidiForTake])

  beginTakeRef.current = beginTake

  useLayoutEffect(function() {
    if (!midiEngineActive || !isRecordingRef.current || !loopActiveRef.current) return
    const takeNum = pendingMidiTakeRef.current
    if (!(takeNum > 0)) return
    pendingMidiTakeRef.current = 0
    restartPlayalongMidiForTake()
    loopTransitionRef.current = false
  }, [midiEngineActive, loopTakeNumber, isRecording, restartPlayalongMidiForTake])

  const stop = useCallback(function(reason) {
    if (!isRecordingRef.current || stoppingRef.current) return
    stoppingRef.current = true
    const startedAt = startedAtRef.current
    const durationSeconds = startedAt > 0
      ? Math.max(0, nowMs() - startedAt) / 1000
      : 0
    const continueLoop = shouldContinuePlayalongLoop(
      reason,
      takesStartedRef.current,
      loopMaxTakesRef.current
    ) && loopActiveRef.current
    if (continueLoop) loopTransitionRef.current = true
    if (!continueLoop) loopActiveRef.current = false

    stopPlayalongMidi(mediaControllerRef.current)

    const sampler = peakSamplerRef.current
    const livePeaks = sampler && Array.isArray(sampler.peaks) ? sampler.peaks.slice() : []
    const livePitchPoints = sampler && Array.isArray(sampler.pitchPoints) ? sampler.pitchPoints.slice() : []
    const samplerStats = sampler && sampler.stats ? Object.assign({}, sampler.stats) : null
    if (sampler && typeof sampler.stop === 'function') sampler.stop()
    peakSamplerRef.current = null

    function afterBlob(blob) {
      recorderRef.current = null
      chunksRef.current = []
      if (blob && blob.size) finishRecording(blob, durationSeconds, livePeaks, livePitchPoints, samplerStats)
      if (continueLoop && loopActiveRef.current && beginTakeRef.current) {
        stoppingRef.current = false
        beginTakeRef.current({ reuseStream: true })
        return
      }
      finishSession()
    }

    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      const blob = chunksRef.current.length
        ? new Blob(chunksRef.current, { type: (recorder && recorder.mimeType) || 'audio/webm' })
        : null
      afterBlob(blob && blob.size ? blob : null)
      return
    }

    recorder.onstop = function() {
      const mimeType = recorder.mimeType || 'audio/webm'
      afterBlob(new Blob(chunksRef.current, { type: mimeType }))
    }
    try { recorder.stop() } catch (e) {
      afterBlob(null)
    }
  }, [finishRecording, finishSession])

  const start = useCallback(function(tempoBpm, settings) {
    if (isRecordingRef.current) return
    const nextSettings = settings || loadPlayalongSettings()
    trackingOptionsRef.current = playalongTrackingOptions(nextSettings)
    const maxTakes = clampPlayalongRepeats(nextSettings.repeats)
    loopMaxTakesRef.current = maxTakes
    setLoopMaxTakes(maxTakes)
    loopTransitionRef.current = false
    tempoBpmOverrideRef.current = Number.isFinite(tempoBpm) && tempoBpm > 0 ? tempoBpm : null
    resumeSynthFromGesture(mediaControllerRef.current)
    loopActiveRef.current = true
    takesStartedRef.current = 0
    sessionTakesAccRef.current = normalizePlayalongTakes(
      tuneRef.current && tuneRef.current.playalongTakes
    )
    setTakesState(sessionTakesAccRef.current)
    setLoopTakeNumber(0)
    beginTake({ reuseStream: false, tempoBpm: tempoBpmOverrideRef.current })
  }, [beginTake])

  const toggle = useCallback(function() {
    if (isRecordingRef.current) stop('click')
    else start()
  }, [start, stop])

  const closeCompare = useCallback(function() {
    setCompareActive(false)
  }, [])

  const openCompare = useCallback(function() {
    if (sessionTakesAccRef.current.length || (tuneRef.current && Array.isArray(tuneRef.current.playalongTakes) && tuneRef.current.playalongTakes.length)) {
      setCompareActive(true)
      turnNotationOn()
    }
  }, [turnNotationOn])

  const deleteTake = useCallback(function(recordingId) {
    const current = tuneRef.current
    if (!current) return
    const nextTakes = removePlayalongTake(current.playalongTakes, recordingId)
    sessionTakesAccRef.current = nextTakes
    setTakesState(nextTakes)
    saveTunePatch({ playalongTakes: nextTakes })
    setBlobById(function(prev) {
      const next = Object.assign({}, prev)
      delete next[recordingId]
      return next
    })
    setPeaksById(function(prev) {
      const next = Object.assign({}, prev)
      delete next[recordingId]
      return next
    })
    setPitchPointsById(function(prev) {
      const next = Object.assign({}, prev)
      delete next[recordingId]
      return next
    })
    deleteRecording(recordingId)
    if (!nextTakes.length) setCompareActive(false)
  }, [saveTunePatch])

  const abortRecording = useCallback(function() {
    loopActiveRef.current = false
    stoppingRef.current = true
    try {
      const recorder = recorderRef.current
      if (recorder) {
        recorder.ondataavailable = function() {}
        recorder.onstop = function() {
          recorderRef.current = null
          chunksRef.current = []
        }
        if (recorder.state === 'recording' || recorder.state === 'paused') {
          recorder.stop()
        }
      }
    } catch (e) {}
    if (peakSamplerRef.current && typeof peakSamplerRef.current.stop === 'function') {
      peakSamplerRef.current.stop()
    }
    peakSamplerRef.current = null
    finishSession()
  }, [finishSession])

  const handlePracticeBeat = useCallback(function(beat) {
    if (!isRecordingRef.current || musicStartedAtRef.current > 0) return
    if (!isPlayalongMusicBeat(beat)) return
    const capturedAt = nowMs()
    musicStartedAtRef.current = playalongMusicStartWallClockMs(capturedAt, beat)
  }, [])

  const clearTakes = useCallback(function() {
    persistEpochRef.current += 1
    if (isRecordingRef.current) abortRecording()
    const current = tuneRef.current
    const prev = mergePlayalongTakes(
      current && current.playalongTakes,
      sessionTakesAccRef.current
    )
    prev.forEach(function(take) {
      Promise.resolve(deleteRecording(take.recordingId)).catch(function() {})
    })
    sessionTakesAccRef.current = []
    setTakesState([])
    setBlobById({})
    setPeaksById({})
    setPitchPointsById({})
    setCompareActive(false)
    setError(null)
    if (current) saveTunePatch(clearPlayalongTakesPatch(current))
  }, [abortRecording, saveTunePatch])

  useEffect(function() {
    const media = mediaControllerRef.current
    if (!media) return
    if (!isRecording) {
      sawPlaybackStartRef.current = false
      return
    }
    if (media.isPlaying) {
      sawPlaybackStartRef.current = true
      if (!(playbackStartedAtRef.current > 0)) playbackStartedAtRef.current = nowMs()
      return
    }
    if (sawPlaybackStartRef.current && !stoppingRef.current && !loopTransitionRef.current) {
      stop('pause')
    }
  }, [isRecording, mediaController && mediaController.isPlaying, stop])

  // Live pitch graph while recording: sampler produces pitchPoints every ~50ms.
  useEffect(function() {
    if (!isRecording) {
      setLivePitchPoints([])
      setLiveTempoBpm(0)
      setLiveMusicStartOffsetSeconds(0)
      return undefined
    }
    const current = tuneRef.current
    const book = tunebookRef.current
    const media = mediaControllerRef.current
    const tempoBpmFromTune = book && book.abcTools && typeof book.abcTools.getTempo === 'function'
      ? book.abcTools.getTempo(current)
      : 100
    const tempoBpm = Number.isFinite(tempoBpmOverrideRef.current) && tempoBpmOverrideRef.current > 0
      ? tempoBpmOverrideRef.current
      : tempoBpmFromTune
    setLiveTempoBpm(tempoBpm)
    const baseOffsetSeconds = estimateMusicStartOffsetSeconds(
      current,
      book,
      media && media.playbackSpeed,
      tempoBpmOverrideRef.current
    )
    const firstNotes = expectedNotesFromPlayalongTune(current, 0)
    const firstExpectedMidi = firstNotes[0] && firstNotes[0].midi

    let cancelled = false
    const intervalMs = 100
    const timer = setInterval(function() {
      if (cancelled) return
      const sampler = peakSamplerRef.current
      const raw = sampler && Array.isArray(sampler.pitchPoints) ? sampler.pitchPoints : null
      const points = Array.isArray(raw) ? compactPitchPoints(raw.slice(), 1200) : []
      setLivePitchPoints(points)
      if (points.length) {
        const refined = refinePlayalongMusicStartOffsetSeconds(baseOffsetSeconds, points, {
          firstExpectedMidi: firstExpectedMidi,
        })
        setLiveMusicStartOffsetSeconds(refined)
      } else {
        setLiveMusicStartOffsetSeconds(baseOffsetSeconds)
      }
    }, intervalMs)

    return function() {
      cancelled = true
      clearInterval(timer)
    }
  }, [isRecording])

  useEffect(function() {
    return function() {
      loopActiveRef.current = false
      stopStream(streamRef.current)
      if (peakSamplerRef.current && typeof peakSamplerRef.current.stop === 'function') {
        peakSamplerRef.current.stop()
      }
      try {
        if (recorderRef.current && recorderRef.current.state === 'recording') {
          recorderRef.current.stop()
        }
      } catch (e) {}
    }
  }, [])

  return {
    isRecording: isRecording,
    isSavingTake: isSavingTake,
    compareActive: compareActive,
    referenceGain: referenceGain,
    livePitchPoints: livePitchPoints,
    liveTempoBpm: liveTempoBpm,
    liveMusicStartOffsetSeconds: liveMusicStartOffsetSeconds,
    blobById: blobById,
    peaksById: peaksById,
    pitchPointsById: pitchPointsById,
    error: error,
    loopTakeNumber: loopTakeNumber,
    loopMaxTakes: loopMaxTakes,
    midiEngineActive: midiEngineActive,
    takes: takesState,
    start: start,
    stop: stop,
    toggle: toggle,
    openCompare: openCompare,
    closeCompare: closeCompare,
    deleteTake: deleteTake,
    clearTakes: clearTakes,
    handlePracticeBeat: handlePracticeBeat,
    handlePlaybackEnded: function() {
      if (!isRecordingRef.current) return false
      if (takeStartedAtRef.current > 0 && (nowMs() - takeStartedAtRef.current) < SPURIOUS_ENDED_GUARD_MS) {
        return true
      }
      stop('ended')
      return true
    },
  }
}
