/**
 * Pitch-gated note capture for Audio Analysis wizard.
 * Uses aubio (window.aubio) when available.
 */
import { floatCentsBetween, midiToFrequency, noteNameToMidi } from './tunerTuningUtils'
import { encodeAudioBufferToWav } from './encodeAudioBufferToWav'
import { extractNoteFeatures } from './soundpostAnalysis'

const BUFFER_SIZE = 4096
const GATE_CENTS = 15
const HOLD_MS = 2000
const AUBIO_WAIT_MS = 3000

function waitForAubio(timeoutMs) {
  const limit = timeoutMs || AUBIO_WAIT_MS
  return new Promise(function(resolve, reject) {
    const started = Date.now()
    function check() {
      if (typeof window !== 'undefined' && window.aubio) return resolve(window.aubio)
      if (Date.now() - started >= limit) return reject(new Error('aubio not loaded'))
      setTimeout(check, 80)
    }
    check()
  })
}

/**
 * Play a short reference beep at targetHz.
 */
export function playReferenceTone(audioContext, frequency, durationMs) {
  const ctx = audioContext
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = frequency
  gain.gain.value = 0.15
  osc.connect(gain)
  gain.connect(ctx.destination)
  const now = ctx.currentTime
  const dur = (durationMs || 600) / 1000
  gain.gain.setValueAtTime(0.15, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + dur)
  osc.start(now)
  osc.stop(now + dur + 0.05)
  return new Promise(function(resolve) {
    setTimeout(resolve, (durationMs || 600) + 80)
  })
}

/**
 * Capture one note: wait until pitch is within GATE_CENTS of target for HOLD_MS continuously,
 * then return PCM + features + wav blob.
 *
 * @param {{
 *   targetNote: string,
 *   a4?: number,
 *   onProgress?: (info) => void,
 *   signal?: AbortSignal
 * }} options
 */
export async function captureGatedNote(options) {
  const opts = options || {}
  const targetMidi = noteNameToMidi(opts.targetNote)
  if (targetMidi == null) throw new Error('Invalid target note')
  const a4 = opts.a4 != null ? opts.a4 : 440
  const targetHz = midiToFrequency(targetMidi, a4)
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : function() {}
  const signal = opts.signal

  const aubioFn = await waitForAubio()
  const audioContext = new (window.AudioContext || window.webkitAudioContext)()
  const lib = await aubioFn()
  const pitchDetector = new lib.Pitch('default', BUFFER_SIZE, 1, audioContext.sampleRate)

  let mediaStream = null
  let scriptProcessor = null
  let source = null
  const chunks = []
  const centsSamples = []
  let inTuneStartedAt = null
  let firstLockAt = null
  let freqSum = 0
  let freqCount = 0
  let settled = false
  let settleReject = null
  let settleResolve = null
  let cleaned = false

  const settlePromise = new Promise(function(resolve, reject) {
    settleResolve = resolve
    settleReject = reject
  })

  function cleanup() {
    if (cleaned) return
    cleaned = true
    if (scriptProcessor) {
      scriptProcessor.onaudioprocess = null
      try { scriptProcessor.disconnect() } catch (e) {}
    }
    if (source) {
      try { source.disconnect() } catch (e) {}
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach(function(t) { t.stop() })
    }
    if (audioContext && audioContext.state !== 'closed') {
      try {
        const closed = audioContext.close()
        if (closed && typeof closed.catch === 'function') closed.catch(function() {})
      } catch (e) {}
    }
  }

  if (signal) {
    if (signal.aborted) {
      cleanup()
      throw new Error('aborted')
    }
    signal.addEventListener('abort', function() {
      if (!settled) {
        settled = true
        cleanup()
        settleReject(new Error('aborted'))
      }
    })
  }

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    source = audioContext.createMediaStreamSource(mediaStream)
    scriptProcessor = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1)
    source.connect(scriptProcessor)
    scriptProcessor.connect(audioContext.destination)

    scriptProcessor.onaudioprocess = function(event) {
      if (settled) return
      const input = event.inputBuffer.getChannelData(0)
      chunks.push(new Float32Array(input))

      const frequency = pitchDetector.do(input)
      let cents = null
      if (frequency) {
        cents = floatCentsBetween(frequency, targetHz)
        if (cents != null && Math.abs(cents) <= 50) {
          centsSamples.push(cents)
          freqSum += frequency
          freqCount++
        }
      }

      const inTune = cents != null && Math.abs(cents) <= GATE_CENTS
      const now = Date.now()
      if (inTune) {
        if (inTuneStartedAt == null) inTuneStartedAt = now
        if (firstLockAt == null) firstLockAt = now
        const held = now - inTuneStartedAt
        onProgress({
          cents: cents,
          frequency: frequency,
          heldMs: held,
          needMs: HOLD_MS,
          locked: held >= HOLD_MS
        })
        if (held >= HOLD_MS) {
          settled = true
          settleResolve()
        }
      } else {
        inTuneStartedAt = null
        onProgress({
          cents: cents,
          frequency: frequency || null,
          heldMs: 0,
          needMs: HOLD_MS,
          locked: false
        })
      }
    }

    await settlePromise
  } catch (err) {
    cleanup()
    throw err
  }

  // Build contiguous buffer from last ~HOLD_MS of audio (+ a bit)
  const sampleRate = audioContext.sampleRate
  const needSamples = Math.floor(sampleRate * (HOLD_MS / 1000))
  let total = 0
  for (let i = 0; i < chunks.length; i++) total += chunks[i].length
  const all = new Float32Array(total)
  let offset = 0
  for (let i = 0; i < chunks.length; i++) {
    all.set(chunks[i], offset)
    offset += chunks[i].length
  }
  const start = Math.max(0, all.length - needSamples)
  const samples = all.subarray(start)

  const f0Mean = freqCount ? freqSum / freqCount : targetHz
  const features = extractNoteFeatures(samples, sampleRate, {
    f0Hz: f0Mean,
    centsSamples: centsSamples.slice(-Math.max(10, Math.floor(centsSamples.length * 0.5))),
    timeToLockMs: firstLockAt != null ? 0 : null
  })

  const storedFeatures = Object.assign({}, features)
  if (storedFeatures.spectrumDb && storedFeatures.spectrumDb.length > 1025) {
    storedFeatures.spectrumDb = storedFeatures.spectrumDb.slice(0, 1025)
    storedFeatures.spectrumFreqs = storedFeatures.spectrumFreqs.slice(0, 1025)
  }

  const audioBuffer = audioContext.createBuffer(1, samples.length, sampleRate)
  const channel = audioBuffer.getChannelData(0)
  channel.set(samples)
  const wavBlob = encodeAudioBufferToWav(audioBuffer)

  cleanup()

  return {
    samples: samples,
    sampleRate: sampleRate,
    features: storedFeatures,
    wavBlob: wavBlob,
    durationMs: Math.round((samples.length / sampleRate) * 1000),
    f0Mean: f0Mean,
    targetHz: targetHz
  }
}

export { GATE_CENTS, HOLD_MS }
