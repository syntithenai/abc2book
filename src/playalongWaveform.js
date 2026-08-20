import decode from 'audio-decode'
import { createPitchfinderDetector } from './practiceAccuracyBackends'

export function downsamplePeaks(channelData, targetLength) {
  const len = Math.max(1, targetLength)
  const data = channelData || []
  const block = Math.max(1, Math.floor(data.length / len))
  const peaks = []
  for (let i = 0; i < len; i += 1) {
    const start = i * block
    let min = 0
    let max = 0
    for (let j = start; j < start + block && j < data.length; j += 1) {
      const v = data[j]
      if (v < min) min = v
      if (v > max) max = v
    }
    peaks.push({ min: min, max: max })
  }
  return peaks
}

export function peaksFromAudioBuffer(audioBuffer) {
  if (!audioBuffer || typeof audioBuffer.getChannelData !== 'function') {
    return { peaks: [], durationSeconds: 0 }
  }
  const channel = audioBuffer.getChannelData(0)
  const targetLength = Math.min(4000, Math.max(200, Math.floor(channel.length / 512)))
  return {
    peaks: downsamplePeaks(channel, targetLength),
    durationSeconds: audioBuffer.duration || 0,
  }
}

export function recordingDataToBlob(recording) {
  if (!recording) return null
  if (recording.blob instanceof Blob) return recording.blob
  const data = recording.data
  if (!data) return null
  if (typeof data !== 'string') return null
  try {
    const comma = data.indexOf(',')
    const base64 = comma >= 0 ? data.slice(comma + 1) : data
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i)
    }
    return new Blob([bytes], { type: recording.type || 'audio/webm' })
  } catch (e) {
    return null
  }
}

function compactPeaks(peaks, maxPoints) {
  const list = Array.isArray(peaks) ? peaks : []
  const limit = maxPoints > 0 ? maxPoints : 1500
  if (list.length <= limit) return list.slice()
  const block = list.length / limit
  const out = []
  for (let i = 0; i < limit; i += 1) {
    const start = Math.floor(i * block)
    const end = Math.min(list.length, Math.floor((i + 1) * block))
    let min = 0
    let max = 0
    for (let j = start; j < end; j += 1) {
      const peak = list[j]
      if (peak && peak.min < min) min = peak.min
      if (peak && peak.max > max) max = peak.max
    }
    out.push({ min: min, max: max })
  }
  return out
}

export function decodePeaksFromBlob(blob) {
  if (!blob) return Promise.resolve({ peaks: [], durationSeconds: 0 })
  return blob.arrayBuffer().then(function(buffer) {
    return decode(buffer)
  }).then(function(audioBuffer) {
    return peaksFromAudioBuffer(audioBuffer)
  }).catch(function() {
    return { peaks: [], durationSeconds: 0 }
  })
}

const PEAK_INTERVAL_MS = 50
const COMPARE_EXTRACT_INTERVAL_MS = 25
const PITCH_RMS_FLOOR = 0.0055
const PITCH_HOLD_MS = 480
const PITCH_MIN_HZ = 65
const PITCH_MAX_HZ = 1200
const PITCH_MIN_MIDI = 40
const PITCH_MAX_MIDI = 96

export function resolvePitchTrackerOptions(options) {
  const opts = options && typeof options === 'object' ? options : {}
  const rmsFloor = Number.isFinite(opts.rmsFloor) && opts.rmsFloor > 0 ? opts.rmsFloor : PITCH_RMS_FLOOR
  const holdRms = Number.isFinite(opts.holdRms) && opts.holdRms > 0 ? opts.holdRms : rmsFloor * 0.6
  const minHz = Number.isFinite(opts.minHz) && opts.minHz > 0 ? opts.minHz : PITCH_MIN_HZ
  const maxHz = Number.isFinite(opts.maxHz) && opts.maxHz > minHz ? opts.maxHz : PITCH_MAX_HZ
  const minMidi = Number.isFinite(opts.minMidi) ? opts.minMidi : PITCH_MIN_MIDI
  const maxMidi = Number.isFinite(opts.maxMidi) ? opts.maxMidi : PITCH_MAX_MIDI
  return {
    rmsFloor: rmsFloor,
    holdRms: holdRms,
    minHz: minHz,
    maxHz: maxHz,
    minMidi: minMidi,
    maxMidi: maxMidi,
  }
}

export function frequencyToMidiFloat(freq) {
  if (!freq || freq <= 0) return null
  const midi = 69 + (12 * Math.log(freq / 440)) / Math.log(2)
  return Number.isFinite(midi) ? midi : null
}

function detectPitchHz(samples, sampleRate, options) {
  const pitch = resolvePitchTrackerOptions(options)
  if (!samples || !samples.length || !sampleRate) return null
  let rms = 0
  for (let i = 0; i < samples.length; i += 1) {
    const v = samples[i]
    rms += v * v
  }
  rms = Math.sqrt(rms / samples.length)
  if (rms < pitch.rmsFloor) return null

  const minLag = Math.max(2, Math.floor(sampleRate / pitch.maxHz))
  const maxLag = Math.min(samples.length - 2, Math.floor(sampleRate / pitch.minHz))
  if (maxLag <= minLag) return null

  let bestLag = -1
  let bestCorr = 0
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let corr = 0
    for (let i = 0; i < samples.length - lag; i += 1) {
      corr += samples[i] * samples[i + lag]
    }
    if (corr > bestCorr) {
      bestCorr = corr
      bestLag = lag
    }
  }
  if (bestLag < 0 || bestCorr <= 0) return null

  const prev = bestLag > minLag ? bestLag - 1 : bestLag
  const next = bestLag < maxLag ? bestLag + 1 : bestLag
  let corrPrev = 0
  let corrBest = 0
  let corrNext = 0
  for (let i = 0; i < samples.length - next; i += 1) {
    if (i < samples.length - prev) corrPrev += samples[i] * samples[i + prev]
    if (i < samples.length - bestLag) corrBest += samples[i] * samples[i + bestLag]
    corrNext += samples[i] * samples[i + next]
  }
  const denom = corrPrev - (2 * corrBest) + corrNext
  const shift = Math.abs(denom) > 1e-9 ? (corrPrev - corrNext) / (2 * denom) : 0
  const refinedLag = bestLag + Math.max(-1, Math.min(1, shift))
  if (!(refinedLag > 0)) return null
  const freq = sampleRate / refinedLag
  return Number.isFinite(freq) && freq >= pitch.minHz && freq <= pitch.maxHz ? freq : null
}

function pitchCorrelationAtLag(samples, lag) {
  const useLag = Math.round(lag)
  if (!samples || useLag < 2 || useLag >= samples.length - 1) return 0
  let corr = 0
  for (let i = 0; i < samples.length - useLag; i += 1) {
    corr += samples[i] * samples[i + useLag]
  }
  return corr
}

/** Prefer fundamental over a strong harmonic for monophonic instruments (e.g. tin whistle). */
export function preferMonophonicFundamental(freq, samples, sampleRate, options) {
  const pitch = resolvePitchTrackerOptions(options)
  if (!(freq > 0) || !samples || !sampleRate) return freq
  const startMidi = frequencyToMidiFloat(freq)
  const maxFolds = startMidi != null && startMidi >= 84 ? 2 : 1
  let current = freq
  let folds = 0
  while (folds < maxFolds) {
    const half = current / 2
    if (half < pitch.minHz || half > pitch.maxHz) break
    const harmLag = sampleRate / current
    const fundLag = sampleRate / half
    if (!(fundLag >= 2)) break
    const harmCorr = pitchCorrelationAtLag(samples, harmLag)
    const fundCorr = pitchCorrelationAtLag(samples, fundLag)
    if (fundCorr >= harmCorr * 0.65) {
      current = half
      folds += 1
    } else {
      break
    }
  }
  return current
}

export function createLivePeakSampler(stream, options) {
  const pitch = resolvePitchTrackerOptions(options)
  const peaks = []
  const pitchPoints = []
  if (!stream) {
    return {
      peaks: peaks,
      pitchPoints: pitchPoints,
      intervalMs: PEAK_INTERVAL_MS,
      stop: function() {},
    }
  }
  const AudioCtx = typeof window !== 'undefined'
    ? (window.AudioContext || window.webkitAudioContext)
    : null
  if (!AudioCtx) {
    return {
      peaks: peaks,
      pitchPoints: pitchPoints,
      intervalMs: PEAK_INTERVAL_MS,
      stop: function() {},
    }
  }
  const ctx = new AudioCtx()
  if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
    try { ctx.resume() } catch (e) {}
  }
  let source = null
  let analyser = null
  try {
    source = ctx.createMediaStreamSource(stream)
    analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    source.connect(analyser)
  } catch (e) {
    try { ctx.close() } catch (err) {}
    return {
      peaks: peaks,
      pitchPoints: pitchPoints,
      intervalMs: PEAK_INTERVAL_MS,
      stop: function() {},
    }
  }
  const data = new Uint8Array(analyser.fftSize)
  const floatData = new Float32Array(analyser.fftSize)
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
  let lastMidi = null
  let lastMidiAt = -Infinity
  let yinDetect = null
  const stats = {
    frames: 0,
    detected: 0,
    held: 0,
    droppedRms: 0,
    droppedHz: 0,
    droppedMidi: 0,
    minHz: pitch.minHz,
    maxHz: pitch.maxHz,
    rmsFloor: pitch.rmsFloor,
    holdRms: pitch.holdRms,
    minMidi: pitch.minMidi,
    maxMidi: pitch.maxMidi,
  }
  createPitchfinderDetector(ctx.sampleRate).then(function(detect) {
    yinDetect = detect
  }).catch(function() {})

  function fillFloatFromBytes() {
    for (let i = 0; i < data.length; i += 1) {
      floatData[i] = (data[i] - 128) / 128
    }
  }

  const timer = setInterval(function() {
    analyser.getByteTimeDomainData(data)
    let usedFloat = false
    if (typeof analyser.getFloatTimeDomainData === 'function') {
      try {
        analyser.getFloatTimeDomainData(floatData)
        usedFloat = true
      } catch (e) {
        usedFloat = false
      }
    }
    if (!usedFloat) fillFloatFromBytes()
    let min = 0
    let max = 0
    for (let i = 0; i < data.length; i += 1) {
      const v = (data[i] - 128) / 128
      if (v < min) min = v
      if (v > max) max = v
    }
    peaks.push({ min: min, max: max })

    let rms = 0
    for (let i = 0; i < floatData.length; i += 1) {
      const v = floatData[i]
      rms += v * v
    }
    rms = Math.sqrt(rms / floatData.length)

    stats.frames += 1
    let freq = null
    let yinHz = null
    if (typeof yinDetect === 'function') {
      try { yinHz = yinDetect(floatData) || null } catch (e) { yinHz = null }
      if (yinHz > 0 && (yinHz < pitch.minHz || yinHz > pitch.maxHz)) {
        stats.droppedHz += 1
        yinHz = null
      }
      if (yinHz > 0) freq = preferMonophonicFundamental(yinHz, floatData, ctx.sampleRate, pitch)
    }
    if (!(freq > 0)) freq = detectPitchHz(floatData, ctx.sampleRate, pitch)
    const elapsedMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt
    let rawMidi = frequencyToMidiFloat(freq)
    if (rawMidi != null && (rawMidi < pitch.minMidi || rawMidi > pitch.maxMidi)) {
      stats.droppedMidi += 1
      rawMidi = null
    }
    let held = false
    if (rawMidi != null && Number.isFinite(rawMidi)) {
      lastMidi = rawMidi
      lastMidiAt = elapsedMs
      stats.detected += 1
    } else if (
      lastMidi != null
      && rms >= pitch.holdRms
      && elapsedMs - lastMidiAt <= PITCH_HOLD_MS
    ) {
      rawMidi = lastMidi
      held = true
      stats.held += 1
    } else if (!(rms >= pitch.rmsFloor)) {
      stats.droppedRms += 1
    }
    if (rawMidi != null && Number.isFinite(rawMidi)) {
      pitchPoints.push({
        timeMs: elapsedMs,
        rawMidi: rawMidi,
        held: held,
      })
    }
  }, PEAK_INTERVAL_MS)

  return {
    peaks: peaks,
    pitchPoints: pitchPoints,
    stats: stats,
    intervalMs: PEAK_INTERVAL_MS,
    startedAtMs: startedAt,
    stop: function() {
      clearInterval(timer)
      try { source.disconnect() } catch (e) {}
      try { ctx.close() } catch (e) {}
    },
  }
}

export function compactPitchPoints(points, maxPoints) {
  const list = Array.isArray(points) ? points : []
  const limit = maxPoints > 0 ? maxPoints : 800
  if (list.length <= limit) return list.slice()
  const step = list.length / limit
  const out = []
  for (let i = 0; i < limit; i += 1) {
    const point = list[Math.min(list.length - 1, Math.floor(i * step))]
    if (point) out.push(point)
  }
  return out
}

export function extractPitchPointsFromChannel(channel, sampleRate, options) {
  const opts = options || {}
  const pitch = resolvePitchTrackerOptions(opts)
  const data = channel || []
  const rate = sampleRate > 0 ? sampleRate : 44100
  const intervalMs = opts.intervalMs > 0 ? opts.intervalMs : PEAK_INTERVAL_MS
  const win = opts.windowSize > 0 ? opts.windowSize : 2048
  const hop = Math.max(1, Math.floor(rate * (intervalMs / 1000)))
  const detect = typeof opts.detect === 'function' ? opts.detect : null
  const maxPoints = opts.maxPoints > 0 ? opts.maxPoints : 800
  const points = []
  let lastMidi = null
  let lastMidiAt = -Infinity
  for (let i = 0; i + win <= data.length; i += hop) {
    const slice = data.subarray ? data.subarray(i, i + win) : data.slice(i, i + win)
    let rms = 0
    for (let j = 0; j < slice.length; j += 1) {
      const v = slice[j]
      rms += v * v
    }
    rms = slice.length ? Math.sqrt(rms / slice.length) : 0
    let freq = null
    if (detect) {
      try { freq = detect(slice) || null } catch (e) { freq = null }
      if (freq > 0 && (freq < pitch.minHz || freq > pitch.maxHz)) freq = null
      if (freq > 0) freq = preferMonophonicFundamental(freq, slice, rate, pitch)
    }
    if (!(freq > 0)) freq = detectPitchHz(slice, rate, pitch)
    const timeMs = (i / rate) * 1000
    let rawMidi = frequencyToMidiFloat(freq)
    if (rawMidi != null && (rawMidi < pitch.minMidi || rawMidi > pitch.maxMidi)) rawMidi = null
    let held = false
    if (rawMidi != null && Number.isFinite(rawMidi)) {
      lastMidi = rawMidi
      lastMidiAt = timeMs
    } else if (
      lastMidi != null
      && rms >= pitch.holdRms
      && timeMs - lastMidiAt <= PITCH_HOLD_MS
    ) {
      rawMidi = lastMidi
      held = true
    }
    if (rawMidi == null) continue
    points.push({
      timeMs: timeMs,
      rawMidi: rawMidi,
      held: held,
    })
  }
  return compactPitchPoints(points, maxPoints)
}

export function extractPitchPointsFromBlob(blob, options) {
  if (!blob) return Promise.resolve([])
  const extractOptions = options && typeof options === 'object' ? options : {}
  return blob.arrayBuffer().then(function(buffer) {
    return decode(buffer)
  }).then(function(audioBuffer) {
    if (!audioBuffer || typeof audioBuffer.getChannelData !== 'function') return []
    const channel = audioBuffer.getChannelData(0)
    const sampleRate = audioBuffer.sampleRate || 44100
    return createPitchfinderDetector(sampleRate).then(function(detect) {
      return extractPitchPointsFromChannel(channel, sampleRate, Object.assign({}, extractOptions, { detect: detect }))
    }).catch(function() {
      return extractPitchPointsFromChannel(channel, sampleRate, extractOptions)
    })
  }).catch(function() {
    return []
  })
}

const pitchExtractCache = {}

function pitchExtractCacheKey(recordingId, tracking, extractOptions) {
  const t = tracking || {}
  const e = extractOptions || {}
  return [
    recordingId || '',
    t.rmsFloor,
    t.holdRms,
    t.minHz,
    t.maxHz,
    t.minMidi,
    t.maxMidi,
    e.intervalMs,
    e.maxPoints,
  ].join(':')
}

export const PLAYALONG_COMPARE_EXTRACT_OPTIONS = {
  intervalMs: COMPARE_EXTRACT_INTERVAL_MS,
  maxPoints: 5000,
}

/**
 * Prefer re-extracting pitch from the audio blob with current tracking options so
 * cutoff / instrument changes apply to Compare existing without re-recording.
 * Falls back to cached session points or stored pitchPoints.
 */
export function resolvePlayalongTakePitchPoints(take, pitchPointsById, blobById, options) {
  const opts = options || {}
  const getRecordingFn = typeof opts.getRecording === 'function' ? opts.getRecording : null
  const tracking = opts.tracking || {}
  const extractOptions = Object.assign({}, PLAYALONG_COMPARE_EXTRACT_OPTIONS, opts.extractOptions || {})
  const recordingId = take && take.recordingId != null ? String(take.recordingId) : ''
  const sessionPoints = pitchPointsById && recordingId ? pitchPointsById[recordingId] : null
  const sessionBlob = blobById && recordingId ? blobById[recordingId] : null
  const cacheKey = pitchExtractCacheKey(recordingId, tracking, extractOptions)
  const extractPayload = Object.assign({}, tracking, extractOptions)

  function fallbackPoints() {
    if (Array.isArray(sessionPoints) && sessionPoints.length) return sessionPoints
    return []
  }

  function fromBlob(blob) {
    if (!blob) return Promise.resolve(undefined)
    if (recordingId && pitchExtractCache[cacheKey]) {
      return Promise.resolve(pitchExtractCache[cacheKey])
    }
    return extractPitchPointsFromBlob(blob, extractPayload).then(function(points) {
      const result = Array.isArray(points) ? points : []
      if (recordingId && result.length) pitchExtractCache[cacheKey] = result
      return result
    }).catch(function() {
      return undefined
    })
  }

  if (sessionBlob) {
    return fromBlob(sessionBlob).then(function(points) {
      if (points !== undefined) return points
      return fallbackPoints()
    })
  }

  if (!getRecordingFn || !recordingId) {
    return Promise.resolve(fallbackPoints())
  }

  return getRecordingFn(recordingId).then(function(recording) {
    const blob = recordingDataToBlob(recording)
    return fromBlob(blob).then(function(points) {
      if (points !== undefined) return points
      if (recording && Array.isArray(recording.pitchPoints) && recording.pitchPoints.length) {
        return recording.pitchPoints
      }
      return fallbackPoints()
    })
  }).catch(function() {
    return fallbackPoints()
  })
}

export function peaksDurationSeconds(peaks, intervalMs) {
  const count = Array.isArray(peaks) ? peaks.length : 0
  const ms = intervalMs > 0 ? intervalMs : PEAK_INTERVAL_MS
  return count > 0 ? (count * ms) / 1000 : 0
}

export { compactPeaks, PEAK_INTERVAL_MS }
