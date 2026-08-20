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
  return {
    recordingId: recordingId,
    createdAt: createdAt,
    duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
    musicStartOffsetSeconds: Number.isFinite(offset) && offset > 0 ? offset : 0,
    tempoBpm: Number.isFinite(tempoBpm) && tempoBpm > 0 ? tempoBpm : 0,
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
  const seen = {}
  const out = []
  Array.prototype.forEach.call(arguments, function(list) {
    normalizePlayalongTakes(list).forEach(function(take) {
      if (seen[take.recordingId]) return
      seen[take.recordingId] = true
      out.push(take)
    })
  })
  return out
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
    return PLAYALONG_TAKE_COMMENT_PREFIX + index + ' ' + JSON.stringify({
      recordingId: take.recordingId,
      createdAt: take.createdAt,
      duration: take.duration,
      musicStartOffsetSeconds: take.musicStartOffsetSeconds,
      tempoBpm: take.tempoBpm,
    })
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

/** YIN / hop lag: shift pitch mapping slightly earlier on the compare roll. */
export const PLAYALONG_PITCH_LATENCY_SECONDS = 0.06

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
    }),
    blob: blob,
    peaks: Array.isArray(opts.peaks) ? opts.peaks : [],
    pitchPoints: Array.isArray(opts.pitchPoints) ? opts.pitchPoints : [],
  }
}

export { getRecording, deleteRecording }
