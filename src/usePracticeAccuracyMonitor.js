import { useCallback, useEffect, useRef, useState } from 'react'
import { createPitchStabilizer } from './tunerlib/pitchStabilizer'
import {
  centsFromFrequencyToMidi,
  liveIntonationBand,
  summarizeRepPitch,
  summarizeRepTiming,
} from './practiceAccuracyScorer'
import {
  noteEventsFromWarmupAbc,
  expandTimelineForRep,
  noteWindowsFromTimeline,
  expectedNoteAtBeat,
  notationBeatFromAudioSeconds,
} from './practiceExpectedTimeline'
import { frequencyToMidi } from './tunerTuningUtils'
import { createPitchfinderDetector } from './practiceAccuracyBackends'

const DEFAULT_BUFFER_SIZE = 4096
const AUBIO_WAIT_MS = 2500
const MIC_LEVEL_SMOOTHING = 0.18

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

  const samplesRef = useRef([])
  const onsetsRef = useRef([])
  const repSummariesRef = useRef([])
  const timelineRef = useRef(null)
  const stabilizerRef = useRef(createPitchStabilizer({ gateThreshold: 0.02 }))
  const captureRef = useRef(null)
  const currentBeatRef = useRef(0)
  const currentRepRef = useRef(0)
  const recordingChunksRef = useRef([])
  const mediaRecorderRef = useRef(null)
  const micContextRef = useRef(null)
  const levelSmootherRef = useRef(createLevelSmoother())

  const resetRepBuffers = useCallback(function() {
    samplesRef.current = []
    onsetsRef.current = []
  }, [])

  const handlePracticeBeat = useCallback(function(payload) {
    if (!payload) return
    if (payload.repIndex != null) currentRepRef.current = payload.repIndex
    const timeline = timelineRef.current
    if (timeline && typeof payload.audioSeconds === 'number') {
      currentBeatRef.current = notationBeatFromAudioSeconds(
        payload.audioSeconds,
        timeline.tuneMeta,
        currentRepRef.current,
        timeline.patternDurationBeats,
        gapBeatsRef.current
      )
    } else if (payload.currentBeat != null) {
      currentBeatRef.current = payload.currentBeat
    }
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
      return
    }
    timelineRef.current = noteEventsFromWarmupAbc(abc)
  }, [abc])

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
      const baseState = {
        micLevel: micLevel,
        micStatus: 'active',
        micHeard: micLevel > 0.04,
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
      let cents = null
      if (frame.frequency > 0) {
        if (expectedMidi != null) {
          cents = centsFromFrequencyToMidi(frame.frequency, expectedMidi)
        } else {
          const nearestMidi = Math.round(frequencyToMidi(frame.frequency))
          cents = centsFromFrequencyToMidi(frame.frequency, nearestMidi)
        }
      }
      const stabilized = stabilizer.process(
        frame.frequency,
        frame.rms,
        cents,
        null,
        timeMs
      )
      if (stabilized && stabilized.freq > 0) {
        samplesRef.current.push({
          timeMs: timeMs,
          frequency: stabilized.freq,
          gated: true,
        })
      }
      const displayCents = stabilized && stabilized.cents != null ? stabilized.cents : cents
      setMicState(Object.assign({}, baseState, {
        pitchCents: displayCents,
        intonationBand: liveIntonationBand(displayCents),
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
  }, [enabled])

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
    handlePracticeBeat: handlePracticeBeat,
    onRepComplete: onRepComplete,
    onStepComplete: onStepComplete,
    resetRepBuffers: resetRepBuffers,
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
