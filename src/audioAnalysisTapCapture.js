/**
 * Tier-1 tap-tone / impulse capture using the device microphone
 * (phone mic is fine). Optional stereo: L = radiated mic, R = piezo/contact.
 * Strings should be damped; tap the bridge top lightly.
 */
import { encodeAudioBufferToWav } from './encodeAudioBufferToWav'
import { extractNoteFeatures, computeMagnitudeSpectrum, findSpectralPeaks, magnitudeToDb } from './soundpostAnalysis'

export const TAP_TARGET_COUNT = 8
export const TAP_CAPTURE_MS = 800
const BUFFER_SIZE = 2048
const ONSET_RMS = 0.02
const QUIET_RMS = 0.008

function rmsOf(buf) {
  let sum = 0
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
  return Math.sqrt(sum / (buf.length || 1))
}

/** Concatenate Float32Array chunks into one buffer (testable pure helper). */
export function concatFloat32Chunks(chunks) {
  let total = 0
  const list = chunks || []
  for (let i = 0; i < list.length; i++) total += list[i].length
  const out = new Float32Array(total)
  let offset = 0
  for (let i = 0; i < list.length; i++) {
    out.set(list[i], offset)
    offset += list[i].length
  }
  return out
}

/**
 * Merge parallel L/R chunk lists into full channel buffers.
 * Truncates to the shorter total length if they differ.
 */
export function mergeStereoFrameChunks(leftChunks, rightChunks) {
  const left = concatFloat32Chunks(leftChunks)
  const right = concatFloat32Chunks(rightChunks)
  const n = Math.min(left.length, right.length)
  return {
    left: n === left.length ? left : left.subarray(0, n),
    right: n === right.length ? right : right.subarray(0, n)
  }
}

function streamChannelCount(mediaStream) {
  const track = mediaStream && mediaStream.getAudioTracks && mediaStream.getAudioTracks()[0]
  if (!track) return 1
  const settings = typeof track.getSettings === 'function' ? track.getSettings() : {}
  const n = settings.channelCount
  return n != null && n >= 2 ? 2 : 1
}

function tapFeatureOptions() {
  return {
    fftSize: 8192,
    findPeaks: true,
    peakOptions: { minHz: 180, maxHz: 2500, maxPeaks: 10 }
  }
}

/**
 * Capture one tap impulse after an energy onset.
 * @param {object} [options]
 * @param {boolean} [options.stereo] — request 2-channel capture (L mic, R piezo)
 * @param {string} [options.deviceId] — exact audioinput deviceId
 */
export async function captureTapImpulse(options) {
  const opts = options || {}
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : function() {}
  const signal = opts.signal
  const holdMs = opts.captureMs != null ? opts.captureMs : TAP_CAPTURE_MS
  const wantStereo = !!opts.stereo
  const deviceId = opts.deviceId || null

  const audioContext = new (window.AudioContext || window.webkitAudioContext)()
  let mediaStream = null
  let scriptProcessor = null
  let source = null
  let settled = false
  let settleResolve = null
  let settleReject = null
  const preRollL = []
  const preRollR = []
  let capturing = false
  let captureChunksL = []
  let captureChunksR = []
  let captureStartedAt = 0
  let quietFrames = 0
  let cleaned = false
  let useStereo = false

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
    const audioConstraints = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    }
    if (wantStereo) {
      audioConstraints.channelCount = { ideal: 2 }
    }
    if (deviceId) {
      audioConstraints.deviceId = { exact: deviceId }
    }

    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints })
    useStereo = wantStereo && streamChannelCount(mediaStream) >= 2
    const inChannels = useStereo ? 2 : 1

    source = audioContext.createMediaStreamSource(mediaStream)
    scriptProcessor = audioContext.createScriptProcessor(BUFFER_SIZE, inChannels, inChannels)
    source.connect(scriptProcessor)
    scriptProcessor.connect(audioContext.destination)

    onProgress({
      phase: 'waiting',
      message: useStereo
        ? 'Tap the bridge top now (stereo: L mic, R piezo)'
        : 'Tap the bridge top now (light, sharp tap)',
      channelCount: useStereo ? 2 : 1,
      stereoFallback: wantStereo && !useStereo
    })

    scriptProcessor.onaudioprocess = function(event) {
      if (settled) return
      const inputL = event.inputBuffer.getChannelData(0)
      const copyL = new Float32Array(inputL)
      let copyR = null
      let level = rmsOf(copyL)
      if (useStereo && event.inputBuffer.numberOfChannels >= 2) {
        copyR = new Float32Array(event.inputBuffer.getChannelData(1))
        const levelR = rmsOf(copyR)
        if (levelR > level) level = levelR
      }

      if (!capturing) {
        preRollL.push(copyL)
        if (preRollL.length > 8) preRollL.shift()
        if (useStereo) {
          preRollR.push(copyR || new Float32Array(copyL.length))
          if (preRollR.length > 8) preRollR.shift()
        }
        onProgress({
          phase: 'waiting',
          level: level,
          message: 'Waiting for tap…',
          channelCount: useStereo ? 2 : 1
        })
        if (level >= ONSET_RMS) {
          capturing = true
          captureStartedAt = Date.now()
          captureChunksL = preRollL.slice()
          captureChunksL.push(copyL)
          if (useStereo) {
            captureChunksR = preRollR.slice()
            captureChunksR.push(copyR || new Float32Array(copyL.length))
          }
          onProgress({ phase: 'capturing', level: level, message: 'Capturing impulse…' })
        }
        return
      }

      captureChunksL.push(copyL)
      if (useStereo) {
        captureChunksR.push(copyR || new Float32Array(copyL.length))
      }
      const elapsed = Date.now() - captureStartedAt
      if (level < QUIET_RMS) quietFrames++
      else quietFrames = 0
      onProgress({
        phase: 'capturing',
        level: level,
        heldMs: elapsed,
        needMs: holdMs,
        message: 'Capturing impulse…'
      })
      if (elapsed >= holdMs || (elapsed > 250 && quietFrames > 6)) {
        settled = true
        settleResolve()
      }
    }

    await settlePromise
  } catch (err) {
    cleanup()
    throw err
  }

  const sampleRate = audioContext.sampleRate
  let samplesL
  let samplesR = null
  let channelCount = 1

  if (useStereo) {
    const merged = mergeStereoFrameChunks(captureChunksL, captureChunksR)
    samplesL = merged.left
    samplesR = merged.right
    channelCount = 2
  } else {
    samplesL = concatFloat32Chunks(captureChunksL)
  }

  const features = extractNoteFeatures(samplesL, sampleRate, tapFeatureOptions())
  let featuresR = null
  if (channelCount === 2 && samplesR) {
    featuresR = extractNoteFeatures(samplesR, sampleRate, tapFeatureOptions())
  }

  const audioBuffer = audioContext.createBuffer(channelCount, samplesL.length, sampleRate)
  audioBuffer.getChannelData(0).set(samplesL)
  if (channelCount === 2 && samplesR) {
    audioBuffer.getChannelData(1).set(samplesR)
  }
  const wavBlob = encodeAudioBufferToWav(audioBuffer)
  cleanup()

  const result = {
    samples: samplesL,
    sampleRate: sampleRate,
    features: features,
    wavBlob: wavBlob,
    durationMs: Math.round((samplesL.length / sampleRate) * 1000),
    peaks: features.peaks || [],
    channelCount: channelCount
  }
  if (featuresR) {
    result.featuresR = featuresR
    result.samplesR = samplesR
  }
  if (wantStereo && channelCount === 1) {
    result.stereoFallback = true
  }
  return result
}

/**
 * Average peaks across taps: cluster by Hz proximity.
 * @param {Array} tapNotes
 * @param {number} [toleranceHz]
 * @param {string} [featuresKey] — 'features' (default) or 'featuresR'
 */
export function averageTapPeaks(tapNotes, toleranceHz, featuresKey) {
  const tol = toleranceHz != null ? toleranceHz : 15
  const key = featuresKey || 'features'
  const all = []
  ;(tapNotes || []).forEach(function(n) {
    const feat = n && n[key]
    ;((feat && feat.peaks) || []).forEach(function(p) {
      all.push(p)
    })
  })
  all.sort(function(a, b) { return a.hz - b.hz })
  const clusters = []
  all.forEach(function(p) {
    const last = clusters[clusters.length - 1]
    if (last && Math.abs(last.hz - p.hz) <= tol) {
      last.hz = (last.hz * last.n + p.hz) / (last.n + 1)
      last.db = (last.db * last.n + p.db) / (last.n + 1)
      last.n++
    } else {
      clusters.push({ hz: p.hz, db: p.db, n: 1 })
    }
  })
  return clusters
    .filter(function(c) { return c.n >= 2 })
    .sort(function(a, b) { return a.hz - b.hz })
    .slice(0, 8)
}

export function labelLikelyModes(peaks) {
  return (peaks || []).map(function(p) {
    let label = 'peak'
    if (p.hz >= 250 && p.hz <= 330) label = 'A0?'
    else if (p.hz >= 380 && p.hz <= 480) label = 'B1−?'
    else if (p.hz >= 500 && p.hz <= 580) label = 'B1+?'
    return Object.assign({}, p, { label: label })
  })
}

/** Compare two tap peak lists → Hz shifts for nearby modes. */
export function tapPeakShifts(baselinePeaks, candidatePeaks, toleranceHz) {
  const tol = toleranceHz != null ? toleranceHz : 40
  const shifts = []
  ;(baselinePeaks || []).forEach(function(a) {
    let best = null
    let bestDist = Infinity
    ;(candidatePeaks || []).forEach(function(b) {
      const d = Math.abs(b.hz - a.hz)
      if (d < bestDist && d <= tol) {
        bestDist = d
        best = b
      }
    })
    if (best) {
      shifts.push({
        fromHz: a.hz,
        toHz: best.hz,
        deltaHz: best.hz - a.hz,
        label: a.label || best.label || 'peak'
      })
    }
  })
  return shifts
}

export { computeMagnitudeSpectrum, findSpectralPeaks, magnitudeToDb }
