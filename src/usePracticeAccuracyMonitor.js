import { useCallback, useEffect, useRef, useState } from 'react'
import { createPitchStabilizer } from './tunerlib/pitchStabilizer'
import {
  liveCentsToExpectedMidi,
  liveIntonationBand,
  foldMidiNearExpected,
  summarizeRepPitch,
  summarizeRepTiming,
} from './practiceAccuracyScorer'
import {
  noteEventsFromWarmupAbc,
  expandTimelineForRep,
  noteWindowsFromTimeline,
  expectedNoteAtBeat,
  notationBeatFromAudioSeconds,
  patternLocalBeatFromAbsolute,
  absoluteBeatFromPatternLocal,
} from './practiceExpectedTimeline'
import { frequencyToMidi } from './tunerTuningUtils'
import { createPitchfinderDetector } from './practiceAccuracyBackends'

const DEFAULT_BUFFER_SIZE = 4096
const AUBIO_WAIT_MS = 2500
const MIC_LEVEL_SMOOTHING = 0.18
const TRACE_THROTTLE_BEATS = 0.01
const TRACE_THROTTLE_MS = 25

function publishTraces(setRepTraces, tracesRef) {
  setRepTraces(tracesRef.current.map(function(trace) {
    return {
      repIndex: trace.repIndex,
      points: trace.points.slice(),
    }
  }))
}

function getAubio() {
  return typeof window !== 'undefined' ? window.aubio : null
}

function waitForAubio(timeoutMs) {
  const limit = timeoutMs || AUBIO_WAIT_MS
  return new Promise(function(resolve, reject) {
    const started = Date.now()
    function check() {
      const fn = getAubio()
      if (fn) return resolve(fn)
      if (Date.now() - started >= limit) {
        return reject(new Error('aubio not loaded'))
      }
      setTimeout(check, 80)
    }
    check()
  })
}

function createLevelSmoother() {
  let value = 0
  return function update(rms) {
    const peak = Math.min(1, Math.max(0, (rms || 0) * 14))
    value += (peak - value) * MIC_LEVEL_SMOOTHING
    return value
  }
}

export function createMainThreadPitchCapture(audioContext, options) {
  const opts = options || {}
  const bufferSize = opts.bufferSize || DEFAULT_BUFFER_SIZE
  let pitchDetector = null
  let pitchDetectFn = null
  let analyser = null
  let scriptProcessor = null
  let silentSink = null
  let mediaStream = null
  let sourceNode = null

  function ensureGraph() {
    if (!analyser) analyser = audioContext.createAnalyser()
    if (!scriptProcessor) {
      scriptProcessor = audioContext.createScriptProcessor(bufferSize, 1, 1)
    }
    if (!silentSink) {
      silentSink = audioContext.createGain()
      silentSink.gain.value = 0
    }
  }

  function stopMediaOnly() {
    if (scriptProcessor) {
      scriptProcessor.onaudioprocess = null
      try { scriptProcessor.disconnect() } catch (e) { /* ignore */ }
    }
    if (silentSink) {
      try { silentSink.disconnect() } catch (e) { /* ignore */ }
    }
    if (analyser) {
      try { analyser.disconnect() } catch (e) { /* ignore */ }
    }
    if (sourceNode) {
      try { sourceNode.disconnect() } catch (e) { /* ignore */ }
      sourceNode = null
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach(function(t) { t.stop() })
      mediaStream = null
    }
  }

  function destroy() {
    stopMediaOnly()
    scriptProcessor = null
    silentSink = null
    analyser = null
    pitchDetector = null
    pitchDetectFn = null
  }

  function initAubioPitch() {
    return waitForAubio(AUBIO_WAIT_MS).then(function(aubioFn) {
      return aubioFn().then(function(lib) {
        pitchDetector = new lib.Pitch('default', bufferSize, 1, audioContext.sampleRate)
        pitchDetectFn = function(channel) {
          return pitchDetector.do(channel) || 0
        }
        return 'aubio'
      })
    })
  }

  function initPitchfinderFallback() {
    return createPitchfinderDetector(audioContext.sampleRate).then(function(detect) {
      if (!detect) throw new Error('pitchfinder unavailable')
      pitchDetectFn = function(channel) {
        try {
          return detect(channel) || 0
        } catch (e) {
          return 0
        }
      }
      return 'pitchfinder'
    })
  }

  return {
    init: function() {
      ensureGraph()
      return initAubioPitch().catch(function() {
        return initPitchfinderFallback()
      }).catch(function() {
        pitchDetectFn = function() { return 0 }
        return 'level-only'
      })
    },

    start: function(stream, onFrame) {
      stopMediaOnly()
      ensureGraph()
      mediaStream = stream
      sourceNode = audioContext.createMediaStreamSource(stream)
      sourceNode.connect(analyser)
      analyser.connect(scriptProcessor)
      scriptProcessor.connect(silentSink)
      silentSink.connect(audioContext.destination)
      scriptProcessor.onaudioprocess = function(event) {
        if (!onFrame) return
        const channel = event.inputBuffer.getChannelData(0)
        let rms = 0
        for (let i = 0; i < channel.length; i += 1) rms += channel[i] * channel[i]
        rms = Math.sqrt(rms / channel.length)
        const frequency = pitchDetectFn ? pitchDetectFn(channel) : 0
        onFrame({
          frequency: frequency || 0,
          rms: rms,
          time: audioContext.currentTime,
        })
      }
    },

    stop: destroy,
  }
}

export default function usePracticeAccuracyMonitor(options) {
  const opts = options || {}
  const enabled = !!opts.enabled
  const abc = opts.abc
  const gapBeats = opts.gapBeats != null ? opts.gapBeats : 1
  const musicStartMs = opts.musicStartMs || 0

  const gapBeatsRef = useRef(gapBeats)
  const musicStartMsRef = useRef(musicStartMs)
  gapBeatsRef.current = gapBeats
  musicStartMsRef.current = musicStartMs

  const [liveState, setLiveState] = useState({
    pitchCents: null,
    intonationBand: 'none',
    expectedMidi: null,
    timingHint: null,
    micLevel: 0,
    micStatus: 'idle',
    micHeard: false,
  })
  const [repSummary, setRepSummary] = useState(null)
  const [aggregateSummary, setAggregateSummary] = useState(null)
  const [resolverPending, setResolverPending] = useState(false)
  const [repTraces, setRepTraces] = useState([])
  const [playheadBeat, setPlayheadBeat] = useState(0)
  const [expectedNotes, setExpectedNotes] = useState([])
  const [patternDurationBeats, setPatternDurationBeats] = useState(0)

  const samplesRef = useRef([])
  const onsetsRef = useRef([])
  const repSummariesRef = useRef([])
  const timelineRef = useRef(null)
  const stabilizerRef = useRef(createPitchStabilizer({ gateThreshold: 0.02 }))
  const captureRef = useRef(null)
  const currentBeatRef = useRef(0)
  const patternLocalBeatRef = useRef(0)
  const currentRepRef = useRef(0)
  const recordingChunksRef = useRef([])
  const mediaRecorderRef = useRef(null)
  const micContextRef = useRef(null)
  const levelSmootherRef = useRef(createLevelSmoother())
  const repTracesRef = useRef([])
  const lastTraceBeatRef = useRef(-999)
  const lastTraceTimeRef = useRef(-999)
  const tracesPublishTimerRef = useRef(null)

  const scheduleTracesPublish = useCallback(function() {
    if (tracesPublishTimerRef.current != null) return
    tracesPublishTimerRef.current = setTimeout(function() {
      tracesPublishTimerRef.current = null
      publishTraces(setRepTraces, repTracesRef)
    }, 50)
  }, [])

  const ensureRepTrace = useCallback(function(repIndex) {
    let trace = repTracesRef.current.find(function(t) { return t.repIndex === repIndex })
    if (!trace) {
      trace = { repIndex: repIndex, points: [] }
      repTracesRef.current = repTracesRef.current.concat([trace])
    }
    return trace
  }, [])

  const clearAllTraces = useCallback(function() {
    repTracesRef.current = []
    lastTraceBeatRef.current = -999
    lastTraceTimeRef.current = -999
    setRepTraces([])
    setPlayheadBeat(0)
  }, [])

  const resetRepBuffers = useCallback(function() {
    samplesRef.current = []
    onsetsRef.current = []
    lastTraceBeatRef.current = -999
    lastTraceTimeRef.current = -999
  }, [])

  const handlePracticeBeat = useCallback(function(payload) {
    if (!payload) return
    if (payload.repIndex != null) currentRepRef.current = payload.repIndex
    const timeline = timelineRef.current
    const pattern = timeline ? timeline.patternDurationBeats : 0
    const gap = gapBeatsRef.current
    const rep = currentRepRef.current

    if (payload.currentBeat != null && Number.isFinite(payload.currentBeat)) {
      // abcjs beat is pattern-local for the current play-through.
      patternLocalBeatRef.current = Math.max(0, payload.currentBeat)
      currentBeatRef.current = absoluteBeatFromPatternLocal(
        patternLocalBeatRef.current,
        rep,
        pattern,
        gap
      )
    } else if (timeline && typeof payload.audioSeconds === 'number') {
      currentBeatRef.current = notationBeatFromAudioSeconds(
        payload.audioSeconds,
        timeline.tuneMeta,
        rep,
        pattern,
        gap
      )
      patternLocalBeatRef.current = patternLocalBeatFromAbsolute(
        currentBeatRef.current,
        rep,
        pattern,
        gap
      )
    }
    setPlayheadBeat(patternLocalBeatRef.current)
  }, [])

  const scoreCurrentRep = useCallback(function(repIndex) {
    const timeline = timelineRef.current
    if (!timeline) return null
    const repNotes = expandTimelineForRep(timeline, repIndex, gapBeatsRef.current)
    const windows = noteWindowsFromTimeline(repNotes, timeline.tuneMeta, musicStartMsRef.current)
    const pitchSummary = summarizeRepPitch(windows, samplesRef.current)
    const timingSummary = summarizeRepTiming(windows, onsetsRef.current)
    const summary = Object.assign({}, pitchSummary, {
      timingPct: timingSummary.timingPct,
      repIndex: repIndex,
    })
    repSummariesRef.current.push(summary)
    setRepSummary(summary)
    return summary
  }, [])

  useEffect(function() {
    if (!abc) {
      timelineRef.current = null
      setExpectedNotes([])
      setPatternDurationBeats(0)
      clearAllTraces()
      return
    }
    const timeline = noteEventsFromWarmupAbc(abc)
    timelineRef.current = timeline
    setExpectedNotes(timeline.notes.slice())
    setPatternDurationBeats(timeline.patternDurationBeats || 0)
    clearAllTraces()
    repSummariesRef.current = []
  }, [abc, clearAllTraces])

  useEffect(function() {
    if (!enabled) {
      setLiveState(function(prev) {
        return Object.assign({}, prev, {
          micStatus: 'idle',
          micLevel: 0,
          micHeard: false,
          pitchCents: null,
          intonationBand: 'none',
        })
      })
      return undefined
    }

    let cancelled = false
    const stabilizer = createPitchStabilizer({ gateThreshold: 0.02 })
    stabilizerRef.current = stabilizer
    stabilizer.reset()
    levelSmootherRef.current = createLevelSmoother()

    function setMicState(partial) {
      if (cancelled) return
      setLiveState(function(prev) {
        return Object.assign({}, prev, partial)
      })
    }

    function processFrame(frame) {
      if (cancelled) return
      const micLevel = levelSmootherRef.current(frame.rms)
      const micHeard = micLevel > 0.04
      const baseState = {
        micLevel: micLevel,
        micStatus: 'active',
        micHeard: micHeard,
      }
      if (!timelineRef.current) {
        setMicState(Object.assign({}, baseState, {
          pitchCents: null,
          intonationBand: 'none',
          expectedMidi: null,
          timingHint: null,
        }))
        return
      }
      const timeMs = frame.time * 1000
      const repNotes = expandTimelineForRep(
        timelineRef.current,
        currentRepRef.current,
        gapBeatsRef.current
      )
      const expected = expectedNoteAtBeat(repNotes, currentBeatRef.current)
      const expectedMidi = expected ? expected.midi : null
      const stabilized = stabilizer.process(
        frame.frequency,
        frame.rms,
        null,
        null,
        timeMs
      )
      const useFreq = stabilized && stabilized.freq > 0 ? stabilized.freq : frame.frequency
      const gated = !!(stabilized && stabilized.freq > 0)
      const canTrace = (gated || micHeard) && useFreq > 0
      let displayCents = null
      if (gated && useFreq > 0) {
        if (expectedMidi != null) {
          displayCents = liveCentsToExpectedMidi(useFreq, expectedMidi)
        } else {
          const nearestMidi = Math.round(frequencyToMidi(useFreq))
          displayCents = liveCentsToExpectedMidi(useFreq, nearestMidi)
        }
        samplesRef.current.push({
          timeMs: timeMs,
          frequency: useFreq,
          gated: true,
        })
      }
      if (canTrace) {
        const localBeat = patternLocalBeatRef.current
        const beatDelta = localBeat - lastTraceBeatRef.current
        const timeDelta = timeMs - lastTraceTimeRef.current
        if (beatDelta >= TRACE_THROTTLE_BEATS || timeDelta >= TRACE_THROTTLE_MS) {
          lastTraceBeatRef.current = localBeat
          lastTraceTimeRef.current = timeMs
          const rawMidi = frequencyToMidi(useFreq)
          const displayMidi = foldMidiNearExpected(rawMidi, expectedMidi != null ? expectedMidi : rawMidi)
          const cents = expectedMidi != null
            ? liveCentsToExpectedMidi(useFreq, expectedMidi)
            : liveCentsToExpectedMidi(useFreq, Math.round(rawMidi))
          const trace = ensureRepTrace(currentRepRef.current)
          trace.points.push({
            beat: localBeat,
            midi: displayMidi,
            rawMidi: rawMidi,
            expectedMidi: expectedMidi,
            cents: cents,
            timeMs: timeMs,
          })
          scheduleTracesPublish()
        }
      }
      setMicState(Object.assign({}, baseState, {
        pitchCents: gated && micHeard ? displayCents : null,
        intonationBand: gated && micHeard ? liveIntonationBand(displayCents) : 'none',
        expectedMidi: expectedMidi,
        timingHint: null,
      }))
    }

    setMicState({
      pitchCents: null,
      intonationBand: 'none',
      expectedMidi: null,
      timingHint: null,
      micLevel: 0,
      micStatus: 'requesting',
      micHeard: false,
    })

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMicState({ micStatus: 'unavailable', micLevel: 0, micHeard: false })
      return function() { cancelled = true }
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) {
      setMicState({ micStatus: 'unavailable', micLevel: 0, micHeard: false })
      return function() { cancelled = true }
    }

    const micCtx = new AudioCtx()
    micContextRef.current = micCtx

    function startCapture() {
      if (cancelled) return
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
        if (cancelled) {
          stream.getTracks().forEach(function(t) { t.stop() })
          return
        }

        // Mark active as soon as permission is granted so UI leaves "Requesting…".
        setMicState({ micStatus: 'active', micLevel: 0, micHeard: false })

        try {
          if (window.MediaRecorder) {
            const recorder = new MediaRecorder(stream)
            recordingChunksRef.current = []
            recorder.ondataavailable = function(e) {
              if (e.data && e.data.size) recordingChunksRef.current.push(e.data)
            }
            recorder.start(250)
            mediaRecorderRef.current = recorder
          }
        } catch (e) {
          // optional recording for resolver
        }

        const capture = createMainThreadPitchCapture(micCtx, {})
        captureRef.current = capture
        return capture.init().then(function() {
          if (cancelled) {
            stream.getTracks().forEach(function(t) { t.stop() })
            return
          }
          capture.start(stream, processFrame)
        })
      }).catch(function(err) {
        if (cancelled) return
        console.warn('Practice mic permission/setup failed', err)
        const denied = err && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')
        setMicState({
          pitchCents: null,
          intonationBand: 'none',
          expectedMidi: null,
          timingHint: null,
          micLevel: 0,
          micStatus: denied ? 'denied' : 'error',
          micHeard: false,
        })
      })
    }

    if (micCtx.state === 'suspended') {
      micCtx.resume().then(startCapture).catch(startCapture)
    } else {
      startCapture()
    }

    return function() {
      cancelled = true
      if (tracesPublishTimerRef.current != null) {
        clearTimeout(tracesPublishTimerRef.current)
        tracesPublishTimerRef.current = null
      }
      if (captureRef.current) captureRef.current.stop()
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop() } catch (e) { /* ignore */ }
      }
      captureRef.current = null
      mediaRecorderRef.current = null
      if (micContextRef.current) {
        try { micContextRef.current.close() } catch (e) { /* ignore */ }
        micContextRef.current = null
      }
    }
  // Restart only when accuracy monitoring is toggled. Unstable object deps
  // (resolver features / audio context identity) previously looped this effect
  // and left the UI stuck on "Requesting microphone…".
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ensureRepTrace, scheduleTracesPublish])

  const onRepComplete = useCallback(function(repIndex) {
    return scoreCurrentRep(repIndex)
  }, [scoreCurrentRep])

  const onStepComplete = useCallback(function() {
    const reps = repSummariesRef.current
    if (!reps.length) return null
    const pitchPcts = reps.map(function(r) { return r.pitchPct })
    const avg = Math.round(pitchPcts.reduce(function(a, b) { return a + b }, 0) / pitchPcts.length)
    const agg = {
      reps: reps,
      average: { pitchPct: avg },
      best: reps.reduce(function(a, b) { return a.pitchPct >= b.pitchPct ? a : b }),
      last: reps[reps.length - 1],
    }
    setAggregateSummary(agg)
    return agg
  }, [])

  const getRecordingBlob = useCallback(function() {
    if (!recordingChunksRef.current.length) return null
    return new Blob(recordingChunksRef.current, { type: 'audio/webm' })
  }, [])

  const applyResolverSummary = useCallback(function(resolverSummary) {
    setResolverPending(false)
    if (!resolverSummary) return
    setRepSummary(function(prev) {
      return Object.assign({}, prev, resolverSummary, { source: 'resolver' })
    })
    setAggregateSummary(function(prev) {
      if (!prev) return prev
      return Object.assign({}, prev, {
        resolver: resolverSummary,
        source: 'resolver',
      })
    })
  }, [])

  const startResolverPending = useCallback(function() {
    setResolverPending(true)
  }, [])

  return {
    liveState: liveState,
    repSummary: repSummary,
    aggregateSummary: aggregateSummary,
    resolverPending: resolverPending,
    repTraces: repTraces,
    playheadBeat: playheadBeat,
    expectedNotes: expectedNotes,
    patternDurationBeats: patternDurationBeats,
    handlePracticeBeat: handlePracticeBeat,
    onRepComplete: onRepComplete,
    onStepComplete: onStepComplete,
    resetRepBuffers: resetRepBuffers,
    clearAllTraces: clearAllTraces,
    getRecordingBlob: getRecordingBlob,
    applyResolverSummary: applyResolverSummary,
    startResolverPending: startResolverPending,
  }
}

export async function createPitchfinderWorkletDetector(audioContext) {
  const detect = await createPitchfinderDetector(audioContext.sampleRate)
  if (!detect) return null
  await audioContext.audioWorklet.addModule(
    (process.env.PUBLIC_URL || '') + '/practice-capture-processor.js'
  )
  return { detect: detect }
}
