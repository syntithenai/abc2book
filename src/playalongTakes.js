import { tuneHasMidiNotes } from './nowPlayingQueue'
import { getPlaybackMetronomeSettings, resolveTuneTimeSignature } from './playbackMetronomeSettings'
import { effectiveCountInBars } from './playbackStateLogic'
import { beatsPerBarFromMeter } from './notation/beatGrid'
import { deleteRecording, getRecording, saveRecording } from './linkRecording'
import utilsFunctions from './utilsFunctions'
export const PLAYALONG_TAKE_COMMENT_PREFIX = '% abcbook-playalong-take-'
export const PLAYALONG_RECORDING_SOURCE = 'playalong'
export const PLAYALONG_MAX_LOOP_TAKES = 10

export function shouldContinuePlayalongLoop(reason, takesStarted, maxTakes) {
  if (reason !== 'ended') return false
  const started = parseInt(takesStarted, 10)
  const max = parseInt(maxTakes, 10)
  const useMax = Number.isFinite(max) && max > 0 ? max : PLAYALONG_MAX_LOOP_TAKES
  const useStarted = Number.isFinite(started) && started > 0 ? started : 0
  return useStarted < useMax
}

export function normalizePlayalongTake(raw) {
  if (!raw || typeof raw !== 'object') return null
  const recordingId = raw.recordingId != null ? String(raw.recordingId).trim() : ''
  if (!recordingId) return null
  const duration = parseFloat(raw.duration)
  const offset = parseFloat(raw.musicStartOffsetSeconds)
  const tempoBpm = parseFloat(raw.tempoBpm)
  const createdAt = raw.createdAt ? String(raw.createdAt) : ''
  const outputLatency = parseFloat(raw.outputLatencySeconds)
  const onsetAlign = parseFloat(raw.onsetAlignSeconds)
  const pitchPctRaw = Math.round(parseFloat(raw.pitchPct))
  const pitchPct = Number.isFinite(pitchPctRaw)
    ? Math.max(0, Math.min(100, pitchPctRaw))
    : null
  return {
    recordingId: recordingId,
    createdAt: createdAt,
    duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
    musicStartOffsetSeconds: Number.isFinite(offset) && offset > 0 ? offset : 0,
    tempoBpm: Number.isFinite(tempoBpm) && tempoBpm > 0 ? tempoBpm : 0,
    outputLatencySeconds: Number.isFinite(outputLatency) && outputLatency > 0 ? outputLatency : 0,
    onsetAlignSeconds: Number.isFinite(onsetAlign) && Math.abs(onsetAlign) > 0.001 ? onsetAlign : 0,
    pitchPct: pitchPct,
  }
}

export function normalizePlayalongTakes(list) {
  if (!Array.isArray(list)) return []
  const out = []
  list.forEach(function(item) {
    const take = normalizePlayalongTake(item)
    if (take) out.push(take)
  })
  return out
}

export function appendPlayalongTake(list, take) {
  const next = normalizePlayalongTakes(list)
  const normalized = normalizePlayalongTake(take)
  if (!normalized) return next
  next.push(normalized)
  return next
}

export function removePlayalongTake(list, recordingId) {
  const id = recordingId != null ? String(recordingId) : ''
  return normalizePlayalongTakes(list).filter(function(take) {
    return take.recordingId !== id
  })
}

export function mergePlayalongTakes() {
  const byId = {}
  const order = []
  Array.prototype.forEach.call(arguments, function(list) {
    normalizePlayalongTakes(list).forEach(function(take) {
      const prev = byId[take.recordingId]
      if (!prev) {
        byId[take.recordingId] = take
        order.push(take.recordingId)
        return
      }
      const next = Object.assign({}, prev)
      if (take.createdAt && !prev.createdAt) next.createdAt = take.createdAt
      if (take.duration > prev.duration) next.duration = take.duration
      if (take.musicStartOffsetSeconds > 0 && !(prev.musicStartOffsetSeconds > 0)) {
        next.musicStartOffsetSeconds = take.musicStartOffsetSeconds
      }
      if (take.tempoBpm > 0 && !(prev.tempoBpm > 0)) next.tempoBpm = take.tempoBpm
      if (take.outputLatencySeconds > 0 && !(prev.outputLatencySeconds > 0)) {
        next.outputLatencySeconds = take.outputLatencySeconds
      }
      if (take.pitchPct != null && (prev.pitchPct == null || take.pitchPct > prev.pitchPct)) {
        next.pitchPct = take.pitchPct
      }
      byId[take.recordingId] = next
    })
  })
  return order.map(function(id) { return byId[id] })
}

/** Upsert pitchPct onto a take. Keeps the higher score; returns {takes, changed}. */
export function applyPlayalongTakePitchPct(list, recordingId, pitchPct) {
  const id = recordingId != null ? String(recordingId) : ''
  const pct = Math.round(parseFloat(pitchPct))
  if (!id || !Number.isFinite(pct)) {
    return { takes: normalizePlayalongTakes(list), changed: false }
  }
  const clamped = Math.max(0, Math.min(100, pct))
  let changed = false
  const takes = normalizePlayalongTakes(list).map(function(take) {
    if (take.recordingId !== id) return take
    if (take.pitchPct != null && take.pitchPct >= clamped) return take
    changed = true
    return Object.assign({}, take, { pitchPct: clamped })
  })
  return { takes: takes, changed: changed }
}

export function stripPlayalongTakeComments(abccomments) {
  if (!Array.isArray(abccomments)) return abccomments
  return abccomments.filter(function(line) {
    return String(line || '').indexOf(PLAYALONG_TAKE_COMMENT_PREFIX) !== 0
  })
}

export function clearPlayalongTakesPatch(tune) {
  return {
    playalongTakes: [],
    abccomments: stripPlayalongTakeComments(tune && tune.abccomments),
  }
}

export function parsePlayalongTakeComment(line) {
  const text = String(line || '').trim()
  if (text.indexOf(PLAYALONG_TAKE_COMMENT_PREFIX) !== 0) return null
  const rest = text.slice(PLAYALONG_TAKE_COMMENT_PREFIX.length)
  const space = rest.indexOf(' ')
  if (space < 0) return null
  const payload = rest.slice(space + 1).trim()
  if (!payload) return null
  try {
    return normalizePlayalongTake(JSON.parse(payload))
  } catch (e) {
    return null
  }
}

export function renderPlayalongTakesAbc(tune) {
  const takes = normalizePlayalongTakes(tune && tune.playalongTakes)
  if (!takes.length) return ''
  return takes.map(function(take, index) {
    const payload = {
      recordingId: take.recordingId,
      createdAt: take.createdAt,
      duration: take.duration,
      musicStartOffsetSeconds: take.musicStartOffsetSeconds,
      tempoBpm: take.tempoBpm,
    }
    if (take.outputLatencySeconds > 0) {
      payload.outputLatencySeconds = take.outputLatencySeconds
    }
    if (take.onsetAlignSeconds && Math.abs(take.onsetAlignSeconds) > 0.001) {
      payload.onsetAlignSeconds = take.onsetAlignSeconds
    }
    if (take.pitchPct != null) {
      payload.pitchPct = take.pitchPct
    }
    return PLAYALONG_TAKE_COMMENT_PREFIX + index + ' ' + JSON.stringify(payload)
  }).join('\n') + '\n'
}

export function shouldShowPlayalongRecordButton(tune, tunebook, fileOverlayActive) {
  if (fileOverlayActive) return false
  return tuneHasMidiNotes(tune, tunebook)
}

export function handlePlayalongTuneEnded(isRecording, stopFn) {
  if (!isRecording) return false
  if (typeof stopFn === 'function') stopFn('ended')
  return true
}

export function enableNotationInViewMode(viewMode, viewModeToDisplayFlags, displayFlagsToViewMode) {
  const flags = viewModeToDisplayFlags(viewMode)
  if (flags && flags.notation && flags.notation !== 'off') return viewMode
  const next = Object.assign({}, flags || {}, { notation: 'lines' })
  return displayFlagsToViewMode(next)
}

function resolveTuneTempoBpm(tune, tunebook) {
  if (tunebook && tunebook.abcTools && typeof tunebook.abcTools.getTempo === 'function') {
    const bpm = parseFloat(tunebook.abcTools.getTempo(tune))
    if (Number.isFinite(bpm) && bpm > 0) return bpm
  }
  const raw = tune && tune.tempo
  const n = parseFloat(raw)
  if (Number.isFinite(n) && n > 0 && n < 400) return n
  return 100
}

/**
 * Seconds from MediaRecorder start (including count-in) to beat 0 of the music.
 */
export function estimateMusicStartOffsetSeconds(tune, tunebook, playbackSpeed, tempoBpmOverride) {
  const metro = getPlaybackMetronomeSettings(tune, tunebook)
  if (!metro || metro.countIn === false) return 0
  const meter = resolveTuneTimeSignature(tune, tunebook) || '4/4'
  const bars = effectiveCountInBars(meter, metro.countInBars)
  const beatsPerBar = beatsPerBarFromMeter(meter)
  const tempoBpm = Number.isFinite(tempoBpmOverride) && tempoBpmOverride > 0
    ? tempoBpmOverride
    : resolveTuneTempoBpm(tune, tunebook)
  const warp = parseFloat(playbackSpeed)
  const speed = Number.isFinite(warp) && warp > 0 ? warp : 1
  const seconds = (bars * beatsPerBar) * (60 / tempoBpm) / speed
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0
}

export function secondsPerBeat(tempoBpm, playbackSpeed) {
  const bpm = parseFloat(tempoBpm)
  const speed = parseFloat(playbackSpeed)
  const useBpm = Number.isFinite(bpm) && bpm > 0 ? bpm : 100
  const useSpeed = Number.isFinite(speed) && speed > 0 ? speed : 1
  return 60 / useBpm / useSpeed
}

/**
 * Abc beatCallback audioSeconds is music-only: 0 during count-in extras,
 * then increases from 0 at written beat 0. Do not compare it to musicStartMs.
 */
export function isPlayalongMusicBeat(beat) {
  if (!beat) return false
  const musicStartMs = parseFloat(beat.musicStartMs)
  const audioSeconds = parseFloat(beat.audioSeconds)
  if (Number.isFinite(musicStartMs) && musicStartMs > 0) {
    // Count-in extras report 0 or float dust (e.g. 2e-16) until music is sounding.
    return Number.isFinite(audioSeconds) && audioSeconds >= 0.05
  }
  return Number.isFinite(audioSeconds)
}

/** Reconstruct wall-clock beat 0 from a later music-only beat callback. */
export function playalongMusicStartWallClockMs(nowMs, beat) {
  const audioSeconds = parseFloat(beat && beat.audioSeconds)
  const elapsedMs = Number.isFinite(audioSeconds) && audioSeconds > 0 ? audioSeconds * 1000 : 0
  return nowMs - elapsedMs
}

export function resolvePlayalongMusicStartOffsetSeconds(options) {
  const o = options || {}
  const sampler = parseFloat(o.samplerStartedAtMs)
  const music = parseFloat(o.musicStartedAtMs)
  const playback = parseFloat(o.playbackStartedAtMs)
  const estimated = parseFloat(o.estimatedOffsetSeconds)
  const estimate = Number.isFinite(estimated) && estimated > 0 ? estimated : 0
  let engineDelay = 0
  if (Number.isFinite(playback) && playback > 0 && Number.isFinite(sampler) && sampler > 0) {
    engineDelay = Math.max(0, (playback - sampler) / 1000)
  }
  let measured = null
  if (Number.isFinite(music) && music > 0 && Number.isFinite(sampler) && sampler > 0) {
    measured = Math.max(0, (music - sampler) / 1000)
  }
  // Count-in beatCallback can stamp "music start" too early:
  // float-dust during extras (~0.2s) or pickup-trimmed extras (~1.8–2.2s vs 2.4s metronome).
  if (measured != null && estimate > 0.5 && (measured < estimate * 0.5 || measured < estimate - 0.15)) {
    measured = null
  }
  if (measured != null) return measured
  // isPlaying often flips at actual music start and already includes count-in.
  if (engineDelay > 0 && engineDelay >= estimate * 0.7) return engineDelay
  return estimate + engineDelay
}

/** YIN / hop / smoother lag: shift pitch mapping earlier on the compare roll. */
export const PLAYALONG_PITCH_LATENCY_SECONDS = 0.16

/** Reported device output latency at/above this is treated as high-risk (e.g. Bluetooth). */
export const PLAYALONG_HIGH_OUTPUT_LATENCY_SECONDS = 0.08

export function readAudioContextOutputLatencySeconds(audioContext) {
  if (!audioContext) return 0
  const output = parseFloat(audioContext.outputLatency)
  const base = parseFloat(audioContext.baseLatency)
  let total = 0
  if (Number.isFinite(output) && output > 0) total += output
  if (Number.isFinite(base) && base > 0) total += base
  return total
}

/**
 * Total reported output path latency for playalong alignment:
 * prefer user clap/loopback calibration when set; else AudioContext device
 * latency plus optional pitch-shifter buffer.
 */
export function getPlayalongOutputLatencySeconds(source) {
  if (typeof source === 'number') {
    return Number.isFinite(source) && source > 0 ? source : 0
  }
  const s = source || {}
  const calibrated = parseFloat(s.calibratedOutputLatencySeconds)
  if (Number.isFinite(calibrated) && calibrated >= 0.02) {
    return Math.min(0.5, calibrated)
  }
  let ctx = s.audioContext || null
  if (!ctx && typeof s.getAudioContext === 'function') {
    try { ctx = s.getAudioContext() } catch (e) { ctx = null }
  }
  if (!ctx && s.mediaController && typeof s.mediaController.getAudioContext === 'function') {
    try { ctx = s.mediaController.getAudioContext() } catch (e) { ctx = null }
  }
  let total = readAudioContextOutputLatencySeconds(ctx)
  let buffer = 0
  if (s.pitchShifter && typeof s.pitchShifter.getOutputLatencySec === 'function') {
    buffer = parseFloat(s.pitchShifter.getOutputLatencySec())
  } else if (typeof s.getOutputLatencySec === 'function') {
    buffer = parseFloat(s.getOutputLatencySec())
  }
  if (Number.isFinite(buffer) && buffer > 0) total += buffer
  return total
}

export function isHighPlayalongOutputLatency(seconds) {
  const n = parseFloat(seconds)
  return Number.isFinite(n) && n >= PLAYALONG_HIGH_OUTPUT_LATENCY_SECONDS
}

/**
 * Latency still needed for mic→beat mapping after the playback timeline
 * may already have absorbed some of it (SoundTouch / audible re-anchor).
 */
export function residualPlayalongOutputLatencySeconds(options) {
  const opts = options || {}
  const reported = parseFloat(opts.outputLatencySeconds)
  const useReported = Number.isFinite(reported) && reported > 0 ? reported : 0
  if (!opts.outputLatencyAlreadyInTimeline) return useReported
  const appliedRaw = parseFloat(opts.outputLatencyAppliedSeconds)
  const applied = Number.isFinite(appliedRaw) && appliedRaw >= 0
    ? appliedRaw
    : useReported
  return Math.max(0, useReported - applied)
}

export function effectivePlayalongMusicOffsetSeconds(musicStartOffsetSeconds, pitchLatencySeconds) {
  const offset = Number.isFinite(parseFloat(musicStartOffsetSeconds))
    ? parseFloat(musicStartOffsetSeconds)
    : 0
  let latency = PLAYALONG_PITCH_LATENCY_SECONDS
  if (pitchLatencySeconds !== undefined && pitchLatencySeconds !== null) {
    const parsed = parseFloat(pitchLatencySeconds)
    latency = Number.isFinite(parsed) ? Math.max(0, parsed) : PLAYALONG_PITCH_LATENCY_SECONDS
  }
  return offset + latency
}

/**
 * Detector pad is for YIN/hop lag. When per-note onset align already baked that
 * residual into musicStartOffsetSeconds, adding the pad again pulls onsets early.
 * Large calibrated output latency without onset-align still gets a lighter pad.
 */
export function playalongDetectorPitchLatencySeconds(takeOrOptions) {
  const t = takeOrOptions || {}
  const onsetAlign = parseFloat(t.onsetAlignSeconds)
  if (Number.isFinite(onsetAlign) && Math.abs(onsetAlign) > 0.001) return 0
  const outLat = parseFloat(t.outputLatencySeconds)
  if (Number.isFinite(outLat) && outLat >= PLAYALONG_HIGH_OUTPUT_LATENCY_SECONDS) {
    // Calibration already covers most of the audible path; keep a small detector-only pad.
    return Math.min(PLAYALONG_PITCH_LATENCY_SECONDS, 0.06)
  }
  return PLAYALONG_PITCH_LATENCY_SECONDS
}

/**
 * Live recording graph must track wall-clock music start with no post-hoc
 * detector latency pad — that pad makes the tip trail the notation cursor.
 * Optional residual output latency (Bluetooth) is added once for mapping.
 */
export function livePlayalongMusicOffsetSeconds(musicStartOffsetSeconds, options) {
  const offset = Number.isFinite(parseFloat(musicStartOffsetSeconds))
    ? parseFloat(musicStartOffsetSeconds)
    : 0
  const residual = residualPlayalongOutputLatencySeconds(options || {})
  return Math.max(0, offset + residual)
}

/**
 * Saved-take mapping seed: music-start plus residual output latency.
 * Detector pad is applied separately via effectivePlayalongMusicOffsetSeconds.
 */
export function savedPlayalongMusicOffsetSeconds(musicStartOffsetSeconds, options) {
  const offset = Number.isFinite(parseFloat(musicStartOffsetSeconds))
    ? parseFloat(musicStartOffsetSeconds)
    : 0
  const residual = residualPlayalongOutputLatencySeconds(options || {})
  return Math.max(0, offset + residual)
}

/**
 * When count-in stamped music-start too early, the first matching pitch lands late.
 * Nudge the offset forward so Compare existing (and scoring) align without re-recording.
 */
export function refinePlayalongMusicStartOffsetSeconds(offsetSeconds, pitchPoints, options) {
  const base = Number.isFinite(parseFloat(offsetSeconds)) ? parseFloat(offsetSeconds) : 0
  const list = Array.isArray(pitchPoints) ? pitchPoints : []
  const opts = options || {}
  const expectedMidi = Number.isFinite(opts.firstExpectedMidi) ? opts.firstExpectedMidi : null
  const leadIn = Number.isFinite(parseFloat(opts.leadInSeconds))
    ? Math.max(0, parseFloat(opts.leadInSeconds))
    : 0.08
  let first = null
  for (let i = 0; i < list.length; i += 1) {
    const point = list[i]
    if (!point || !Number.isFinite(point.timeMs) || !Number.isFinite(point.rawMidi)) continue
    if (expectedMidi != null) {
      const delta = Math.abs(point.rawMidi - expectedMidi)
      const octave = Math.abs(((point.rawMidi - expectedMidi) % 12 + 12) % 12)
      const nearOctave = octave <= 1.75 || octave >= 10.25
      const harmonic = Math.abs(point.rawMidi - (expectedMidi + 19)) <= 1.75
        || Math.abs(point.rawMidi - (expectedMidi + 12)) <= 1.75
        || Math.abs(point.rawMidi - (expectedMidi + 24)) <= 1.75
      if (delta > 1.75 && !nearOctave && !harmonic) continue
    }
    first = point
    break
  }
  if (!first) return base
  const lag = first.timeMs / 1000 - base
  if (lag > 0.28 && lag < 0.95) return Math.max(base, first.timeMs / 1000 - leadIn)
  return base
}

export function beatToAudioSeconds(beat, musicStartOffsetSeconds, tempoBpm, playbackSpeed) {
  const offset = Number.isFinite(parseFloat(musicStartOffsetSeconds))
    ? parseFloat(musicStartOffsetSeconds)
    : 0
  return offset + (parseFloat(beat) || 0) * secondsPerBeat(tempoBpm, playbackSpeed)
}

export async function persistPlayalongRecording(options) {
  const opts = options || {}
  const tune = opts.tune
  const blob = opts.blob
  if (!tune || !tune.id || !blob) {
    throw new Error('Missing tune or audio data')
  }
  const utils = utilsFunctions()
  const recordingId = utils.generateObjectId()
  const b64 = await utils.blobToBase64(blob)
  const duration = parseFloat(opts.duration)
  const offset = parseFloat(opts.musicStartOffsetSeconds)
  const tempoBpm = parseFloat(opts.tempoBpm)
  const outputLatency = parseFloat(opts.outputLatencySeconds)
  const onsetAlign = parseFloat(opts.onsetAlignSeconds)
  const recording = {
    id: recordingId,
    tuneId: tune.id,
    tuneName: tune.name || '',
    name: opts.title || ('Play-along ' + new Date().toLocaleString()),
    type: blob.type || 'audio/webm',
    mediaKind: 'audio',
    data: b64,
    duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
    source: PLAYALONG_RECORDING_SOURCE,
    musicStartOffsetSeconds: Number.isFinite(offset) && offset > 0 ? offset : 0,
    tempoBpm: Number.isFinite(tempoBpm) && tempoBpm > 0 ? tempoBpm : 0,
    outputLatencySeconds: Number.isFinite(outputLatency) && outputLatency > 0 ? outputLatency : 0,
    onsetAlignSeconds: Number.isFinite(onsetAlign) && Math.abs(onsetAlign) > 0.001 ? onsetAlign : 0,
    waveformPeaks: Array.isArray(opts.peaks) ? opts.peaks : [],
    pitchPoints: Array.isArray(opts.pitchPoints) ? opts.pitchPoints : [],
    createdTimestamp: new Date(),
    updatedTimestamp: new Date(),
  }
  await saveRecording(recording)
  return {
    recording: recording,
    take: normalizePlayalongTake({
      recordingId: recordingId,
      createdAt: new Date().toISOString(),
      duration: recording.duration,
      musicStartOffsetSeconds: recording.musicStartOffsetSeconds,
      tempoBpm: recording.tempoBpm,
      outputLatencySeconds: recording.outputLatencySeconds,
      onsetAlignSeconds: recording.onsetAlignSeconds,
    }),
    blob: blob,
    peaks: Array.isArray(opts.peaks) ? opts.peaks : [],
    pitchPoints: Array.isArray(opts.pitchPoints) ? opts.pitchPoints : [],
  }
}

export { getRecording, deleteRecording }
