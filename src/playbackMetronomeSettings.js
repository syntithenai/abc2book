import {
  defaultMetronomeRhythm,
  parseRhythmText,
  formatRhythmText,
  rhythmFromTimeSignature,
} from './metronomeRhythmPresets'
import {
  createRhythmConfig,
  normalizeRhythmConfig,
  ENGINE_MODE_CLICK,
} from './rhythmEngineTypes'

export function resolveTuneTimeSignature(tune, tunebook) {
  if (!tune) return ''
  let meter = tune.meter != null ? String(tune.meter).trim() : ''
  if (!meter && tunebook && tunebook.abcTools && tunebook.abcTools.getTuneMeter) {
    meter = String(tunebook.abcTools.getTuneMeter(tune) || '').trim()
  }
  if (!meter && tune.rhythm && tunebook && tunebook.abcTools && tunebook.abcTools.timeSignatureFromTuneType) {
    meter = String(tunebook.abcTools.timeSignatureFromTuneType(tune.rhythm) || '').trim()
  }
  return meter
}

export function hasCustomPlaybackMetronomeRhythm(tune) {
  return !!(tune
    && tune.playbackMetronomeRhythm
    && typeof tune.playbackMetronomeRhythm === 'object'
    && tune.playbackMetronomeRhythm.beatsPerBar > 0)
}

export function defaultPlaybackMetronomeSettings(tune, tunebook) {
  const meter = resolveTuneTimeSignature(tune, tunebook)
  const rhythm = meter
    ? normalizeRhythmConfig(rhythmFromTimeSignature(meter))
    : normalizeRhythmConfig(defaultMetronomeRhythm())
  return {
    countIn: true,
    countInBars: 1,
    duringPlayback: false,
    rhythm: rhythm,
  }
}

export function normalizePlaybackMetronomeRhythm(rhythm, tune, tunebook) {
  if (rhythm && typeof rhythm === 'object' && rhythm.beatsPerBar > 0) {
    return normalizeRhythmConfig(rhythm)
  }
  return defaultPlaybackMetronomeSettings(tune, tunebook).rhythm
}

export function getPlaybackMetronomeSettings(tune, tunebook) {
  const defaults = defaultPlaybackMetronomeSettings(tune, tunebook)
  if (!tune) return defaults
  const countIn = tune.playbackMetronomeCountIn !== false
  const bars = parseInt(tune.playbackMetronomeCountInBars, 10)
  let rhythm = hasCustomPlaybackMetronomeRhythm(tune)
    ? normalizePlaybackMetronomeRhythm(tune.playbackMetronomeRhythm, tune, tunebook)
    : defaults.rhythm
  if (tune.playbackMetronomeEngine) {
    rhythm = normalizeRhythmConfig(Object.assign({}, rhythm, {
      engineMode: tune.playbackMetronomeEngine,
    }))
  }
  if (tune.playbackMetronomePresetId) {
    rhythm = normalizeRhythmConfig(Object.assign({}, rhythm, {
      presetId: tune.playbackMetronomePresetId,
    }))
  }
  return {
    countIn: countIn,
    countInBars: bars > 0 ? bars : defaults.countInBars,
    duringPlayback: tune.playbackMetronomeDuringPlayback === true,
    rhythm: rhythm,
  }
}

export function applyPlaybackMetronomeSettings(tune, settings, options) {
  if (!tune || !settings) return tune
  const next = Object.assign({}, tune)
  next.playbackMetronomeCountIn = settings.countIn !== false
  const bars = parseInt(settings.countInBars, 10)
  next.playbackMetronomeCountInBars = bars > 0 ? bars : 1
  next.playbackMetronomeDuringPlayback = settings.duringPlayback === true
  if (!options || options.persistRhythm !== false) {
    const normalized = normalizePlaybackMetronomeRhythm(settings.rhythm, tune, tunebookFromOptions(options))
    next.playbackMetronomeRhythm = normalized
    next.playbackMetronomeEngine = normalized.engineMode || ENGINE_MODE_CLICK
    next.playbackMetronomePresetId = normalized.presetId || ''
  }
  return next
}

function tunebookFromOptions(options) {
  return options && options.tunebook ? options.tunebook : null
}

export function applyPlaybackMetronomeCountInFields(tune, settings) {
  if (!tune || !settings) return tune
  const next = Object.assign({}, tune)
  next.playbackMetronomeCountIn = settings.countIn !== false
  const bars = parseInt(settings.countInBars, 10)
  next.playbackMetronomeCountInBars = bars > 0 ? bars : 1
  next.playbackMetronomeDuringPlayback = settings.duringPlayback === true
  return next
}

export function serializePlaybackMetronomeRhythm(rhythm) {
  const normalized = normalizePlaybackMetronomeRhythm(rhythm)
  const payload = {
    beatsPerBar: normalized.beatsPerBar,
    accents: normalized.accents,
    pulsesPerBeat: normalized.pulsesPerBeat,
    engineMode: normalized.engineMode,
    presetId: normalized.presetId || '',
  }
  if (normalized.engineMode === 'drums' && normalized.drumPattern) {
    payload.drumPattern = normalized.drumPattern
  }
  return JSON.stringify(payload)
}

export function parsePlaybackMetronomeRhythmField(raw, tune, tunebook) {
  if (!raw || !String(raw).trim()) {
    return defaultPlaybackMetronomeSettings(tune, tunebook).rhythm
  }
  try {
    const parsed = JSON.parse(String(raw))
    return normalizePlaybackMetronomeRhythm(parsed, tune, tunebook)
  } catch (e) {
    const fromText = parseRhythmText(String(raw).trim())
    if (fromText) return fromText
    return defaultPlaybackMetronomeSettings(tune, tunebook).rhythm
  }
}

export function rhythmLabel(rhythm) {
  try {
    return formatRhythmText(normalizePlaybackMetronomeRhythm(rhythm))
  } catch (e) {
    return '4/4'
  }
}
