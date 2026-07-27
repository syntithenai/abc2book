import {
  defaultMetronomeRhythm,
  parseRhythmText,
  formatRhythmText,
  rhythmFromTimeSignature,
  slotsPerBar,
  pulsesPatternEqual,
  presetIdForRhythm,
} from './metronomeRhythmPresets'
import {
  createRhythmConfig,
  normalizeRhythmConfig,
  normalizeDrumPattern,
  ENGINE_MODE_CLICK,
  ENGINE_MODE_DRUMS,
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

export function meterDenominator(meter) {
  const raw = String(meter || '').trim()
  if (!raw) return 0
  const lowered = raw.toLowerCase()
  if (lowered === 'c' || lowered === 'common') return 4
  if (lowered === 'c|' || lowered === 'cut') return 2
  const match = raw.match(/^(\d+)\s*([\/\-:])\s*(\d+)$/i)
  return match ? parseInt(match[3], 10) : 0
}

/**
 * Count-in and during-playback clicks follow the tune time signature.
 * Replaces stale presets (e.g. saved 4/4 rhythm on a 6/8 tune) while keeping
 * drum patterns and engine mode when the slot grid changes.
 */
export function alignPlaybackRhythmToMeter(storedRhythm, meter) {
  const stored = normalizeRhythmConfig(storedRhythm || defaultMetronomeRhythm())
  if (!meter) return stored
  const meterRhythm = normalizeRhythmConfig(rhythmFromTimeSignature(meter))
  const sameGrid = stored.beatsPerBar === meterRhythm.beatsPerBar
    && slotsPerBar(stored) === slotsPerBar(meterRhythm)
    && pulsesPatternEqual(stored.pulsesPerBeat, meterRhythm.pulsesPerBeat)
  if (sameGrid) return stored
  const aligned = normalizeRhythmConfig(Object.assign({}, meterRhythm, {
    engineMode: stored.engineMode,
    presetId: stored.engineMode === ENGINE_MODE_DRUMS && stored.presetId
      ? stored.presetId
      : (presetIdForRhythm(meterRhythm) || stored.presetId || ''),
  }))
  if (aligned.engineMode === ENGINE_MODE_DRUMS && stored.drumPattern) {
    return normalizeRhythmConfig(Object.assign({}, aligned, {
      drumPattern: normalizeDrumPattern(stored.drumPattern, slotsPerBar(meterRhythm)),
    }))
  }
  return aligned
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

export function resolveMetronomeSettingsTune(candidate, options) {
  const opts = options || {}
  const tunes = opts.tunes
  const tablatureSourceTune = opts.tablatureSourceTune
  const mediaControllerTune = opts.mediaControllerTune
  const abc = opts.abc
  const abcTools = opts.abcTools

  const candidateId = (candidate && candidate.id)
    || (mediaControllerTune && mediaControllerTune.id)
    || (tablatureSourceTune && tablatureSourceTune.id)

  if (candidateId && tunes) {
    const fromTunes = tunes[candidateId] || tunes[String(candidateId)]
    if (fromTunes) return fromTunes
  }

  if (tablatureSourceTune && (!candidateId || tablatureSourceTune.id === candidateId)) {
    return tablatureSourceTune
  }

  if (mediaControllerTune) return mediaControllerTune

  if (abc && abcTools && abcTools.abc2json) {
    try {
      const fromAbc = abcTools.abc2json(abc)
      if (fromAbc && (!candidateId || fromAbc.id === candidateId)) {
        return fromAbc
      }
    } catch (e) {}
  }

  return candidate || null
}

export function serializePlaybackMetronomeRhythmStore(rhythm, engineMode) {
  const mode = engineMode === ENGINE_MODE_DRUMS ? ENGINE_MODE_DRUMS : ENGINE_MODE_CLICK
  const normalized = normalizeRhythmConfig(Object.assign({}, rhythm, { engineMode: mode }))
  const payload = {
    beatsPerBar: normalized.beatsPerBar,
    accents: normalized.accents,
    pulsesPerBeat: normalized.pulsesPerBeat,
    presetId: normalized.presetId || '',
  }
  if (mode === ENGINE_MODE_DRUMS && normalized.drumPattern) {
    payload.drumPattern = normalized.drumPattern
  }
  return payload
}

function rhythmFieldToConfig(field, engineMode, tune, tunebook) {
  if (!field || typeof field !== 'object' || !(field.beatsPerBar > 0)) return null
  return normalizeRhythmConfig(Object.assign({}, field, {
    engineMode: engineMode,
    presetId: field.presetId || '',
  }))
}

export function readPlaybackMetronomeRhythmStores(tune, tunebook) {
  const defaults = defaultPlaybackMetronomeSettings(tune, tunebook)
  const defaultClick = normalizeRhythmConfig(Object.assign({}, defaults.rhythm, {
    engineMode: ENGINE_MODE_CLICK,
    drumPattern: null,
  }))

  let clickRhythm = rhythmFieldToConfig(
    tune && tune.playbackMetronomeClickRhythm,
    ENGINE_MODE_CLICK,
    tune,
    tunebook
  )
  let drumRhythm = rhythmFieldToConfig(
    tune && tune.playbackMetronomeDrumRhythm,
    ENGINE_MODE_DRUMS,
    tune,
    tunebook
  )

  if (!clickRhythm && !drumRhythm && tune && hasCustomPlaybackMetronomeRhythm(tune)) {
    const normalized = normalizePlaybackMetronomeRhythm(tune.playbackMetronomeRhythm, tune, tunebook)
    const legacyEngine = tune.playbackMetronomeEngine === ENGINE_MODE_DRUMS
      || normalized.engineMode === ENGINE_MODE_DRUMS
        ? ENGINE_MODE_DRUMS
        : ENGINE_MODE_CLICK
    if (legacyEngine === ENGINE_MODE_DRUMS) {
      drumRhythm = normalizeRhythmConfig(Object.assign({}, normalized, {
        engineMode: ENGINE_MODE_DRUMS,
      }))
      clickRhythm = rhythmFieldToConfig({
        beatsPerBar: normalized.beatsPerBar,
        accents: normalized.accents,
        pulsesPerBeat: normalized.pulsesPerBeat,
        presetId: '',
      }, ENGINE_MODE_CLICK, tune, tunebook)
    } else {
      clickRhythm = normalizeRhythmConfig(Object.assign({}, normalized, {
        engineMode: ENGINE_MODE_CLICK,
        drumPattern: null,
      }))
    }
  }

  if (!clickRhythm) clickRhythm = defaultClick

  const activeEngine = tune && tune.playbackMetronomeEngine === ENGINE_MODE_DRUMS
    && drumRhythm
    ? ENGINE_MODE_DRUMS
    : ENGINE_MODE_CLICK

  let activeRhythm = activeEngine === ENGINE_MODE_DRUMS
    ? normalizeRhythmConfig(Object.assign({}, drumRhythm, { engineMode: ENGINE_MODE_DRUMS }))
    : normalizeRhythmConfig(Object.assign({}, clickRhythm, {
      engineMode: ENGINE_MODE_CLICK,
      drumPattern: null,
    }))

  if (tune && tune.playbackMetronomePresetId && !activeRhythm.presetId) {
    activeRhythm = normalizeRhythmConfig(Object.assign({}, activeRhythm, {
      presetId: tune.playbackMetronomePresetId,
    }))
  }

  return {
    clickRhythm: clickRhythm,
    drumRhythm: drumRhythm,
    activeEngine: activeEngine,
    activeRhythm: activeRhythm,
  }
}

export function getPlaybackMetronomeSettings(tune, tunebook) {
  const defaults = defaultPlaybackMetronomeSettings(tune, tunebook)
  if (!tune) {
    return {
      countIn: defaults.countIn,
      countInBars: defaults.countInBars,
      duringPlayback: defaults.duringPlayback,
      rhythm: defaults.rhythm,
      clickRhythm: defaults.rhythm,
      drumRhythm: null,
      engine: ENGINE_MODE_CLICK,
    }
  }
  const stores = readPlaybackMetronomeRhythmStores(tune, tunebook)
  const meter = resolveTuneTimeSignature(tune, tunebook)
  const countIn = tune.playbackMetronomeCountIn !== false
  const bars = parseInt(tune.playbackMetronomeCountInBars, 10)
  const activeRhythm = alignPlaybackRhythmToMeter(stores.activeRhythm, meter)
  return {
    countIn: countIn,
    countInBars: bars > 0 ? bars : defaults.countInBars,
    duringPlayback: tune.playbackMetronomeDuringPlayback === true,
    rhythm: activeRhythm,
    clickRhythm: alignPlaybackRhythmToMeter(stores.clickRhythm, meter),
    drumRhythm: stores.drumRhythm
      ? alignPlaybackRhythmToMeter(stores.drumRhythm, meter)
      : stores.drumRhythm,
    engine: stores.activeEngine,
  }
}

export function applyPlaybackMetronomeSettings(tune, settings, options) {
  if (!tune || !settings) return tune
  const tunebook = tunebookFromOptions(options)
  const next = Object.assign({}, tune)
  next.playbackMetronomeCountIn = settings.countIn !== false
  const bars = parseInt(settings.countInBars, 10)
  next.playbackMetronomeCountInBars = bars > 0 ? bars : 1
  next.playbackMetronomeDuringPlayback = settings.duringPlayback === true
  if (!options || options.persistRhythm !== false) {
    const stores = readPlaybackMetronomeRhythmStores(tune, tunebook)
    const normalized = normalizePlaybackMetronomeRhythm(settings.rhythm, tune, tunebook)
    const engine = normalized.engineMode === ENGINE_MODE_DRUMS
      ? ENGINE_MODE_DRUMS
      : ENGINE_MODE_CLICK

    let clickRhythm = settings.clickRhythm
      ? rhythmFieldToConfig(settings.clickRhythm, ENGINE_MODE_CLICK, tune, tunebook)
      : stores.clickRhythm
    let drumRhythm = settings.drumRhythm
      ? rhythmFieldToConfig(settings.drumRhythm, ENGINE_MODE_DRUMS, tune, tunebook)
      : stores.drumRhythm

    if (engine === ENGINE_MODE_DRUMS) {
      drumRhythm = normalized
    } else {
      clickRhythm = normalizeRhythmConfig(Object.assign({}, normalized, {
        engineMode: ENGINE_MODE_CLICK,
        drumPattern: null,
      }))
    }

    next.playbackMetronomeClickRhythm = serializePlaybackMetronomeRhythmStore(
      clickRhythm,
      ENGINE_MODE_CLICK
    )
    if (drumRhythm) {
      next.playbackMetronomeDrumRhythm = serializePlaybackMetronomeRhythmStore(
        drumRhythm,
        ENGINE_MODE_DRUMS
      )
    }
    next.playbackMetronomeRhythm = normalized
    next.playbackMetronomeEngine = engine
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
  return serializePlaybackMetronomeRhythmStore(
    normalized,
    normalized.engineMode === ENGINE_MODE_DRUMS ? ENGINE_MODE_DRUMS : ENGINE_MODE_CLICK
  )
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
