import {
  METRONOME_ACCENT,
  METRONOME_TICK,
  METRONOME_MUTE,
} from './metronomeTickSounds'
import { METRONOME_RHYTHM_PRESETS } from './metronomeRhythmPresets'
import {
  ENGINE_MODE_CLICK,
  ENGINE_MODE_DRUMS,
  createRhythmConfig,
  createEmptyDrumPattern,
  normalizeRhythmConfig,
} from './rhythmEngineTypes'
import { rhythmPulseShapeKey, pulseShapeKey } from './rhythmGranularity'
import { slotsPerBar } from './metronomeRhythmPresets'
import {
  isUserDrumPresetId,
  findUserDrumPresetById,
  userDrumPresetToRhythm,
  userDrumPresetIdForRhythm,
  getCachedUserDrumPresets,
} from './userDrumPresets'

export const PRESET_CATEGORY_METRONOME = 'Metronome'
export const PRESET_CATEGORY_ROCK_POP = 'Rock & pop'
export const PRESET_CATEGORY_FUNK_SOUL = 'Funk & soul'
export const PRESET_CATEGORY_JAZZ_SWING = 'Jazz & swing'
export const PRESET_CATEGORY_LATIN = 'Latin'
export const PRESET_CATEGORY_FOLK = 'Folk & dance'
export const PRESET_CATEGORY_PRACTICE = 'Practice'
export const PRESET_CATEGORY_MINIMAL = 'Minimal'
export const PRESET_CATEGORY_MY_PATTERNS = 'My patterns'

export const DRUM_PRESET_CATEGORIES = [
  PRESET_CATEGORY_MY_PATTERNS,
  PRESET_CATEGORY_METRONOME,
  PRESET_CATEGORY_ROCK_POP,
  PRESET_CATEGORY_FUNK_SOUL,
  PRESET_CATEGORY_JAZZ_SWING,
  PRESET_CATEGORY_LATIN,
  PRESET_CATEGORY_FOLK,
  PRESET_CATEGORY_PRACTICE,
  PRESET_CATEGORY_MINIMAL,
]

function stepsFromHits(slotCount, hits) {
  const steps = Array.from({ length: slotCount }, function() { return 0 })
  ;(hits || []).forEach(function(index) {
    if (index >= 0 && index < slotCount) steps[index] = 1
  })
  return steps
}

function buildDrumPattern(slotCount, trackHits, swing) {
  const pattern = createEmptyDrumPattern(slotCount, swing)
  pattern.tracks = pattern.tracks.map(function(track) {
    return Object.assign({}, track, {
      steps: stepsFromHits(slotCount, trackHits[track.id]),
    })
  })
  return pattern
}

function drumPreset(id, label, category, beatsPerBar, pulsesPerBeat, trackHits, swing, accents) {
  const slotCount = pulsesPerBeat.reduce(function(sum, p) { return sum + p }, 0)
  const accentPattern = accents || Array.from({ length: beatsPerBar }, function(_, i) {
    return i === 0 ? METRONOME_ACCENT : METRONOME_TICK
  })
  return {
    id: id,
    label: label,
    category: category,
    engineMode: ENGINE_MODE_DRUMS,
    beatsPerBar: beatsPerBar,
    accents: accentPattern,
    pulsesPerBeat: pulsesPerBeat,
    swing: swing || 0,
    drumPattern: buildDrumPattern(slotCount, trackHits, swing || 0),
  }
}

function clickPresetFromMetronome(preset) {
  return {
    id: preset.id,
    label: preset.label,
    category: PRESET_CATEGORY_METRONOME,
    engineMode: ENGINE_MODE_CLICK,
    beatsPerBar: preset.beatsPerBar,
    accents: preset.accents,
    pulsesPerBeat: Array.isArray(preset.pulsesPerBeat)
      ? preset.pulsesPerBeat
      : Array.from({ length: preset.beatsPerBar }, function() { return preset.pulsesPerBeat || 1 }),
    swing: 0,
    drumPattern: null,
  }
}

const SIXTEEN = [4, 4, 4, 4]
const EIGHT = [2, 2, 2, 2]
const TWELVE = [3, 3, 3, 3]
const SIX_EIGHT = [3, 3]
const TWO_FOUR = [2, 2]
const THREE_FOUR = [3, 3, 3]
const WALTZ = [1, 1, 1]

const DRUM_GROOVE_PRESETS = [
  drumPreset('rock-basic', 'Rock backbeat', PRESET_CATEGORY_ROCK_POP, 4, SIXTEEN, {
    kick: [0, 8],
    snare: [4, 12],
    hat: [0, 2, 4, 6, 8, 10, 12, 14],
  }),
  drumPreset('rock-driving', 'Driving 8ths', PRESET_CATEGORY_ROCK_POP, 4, EIGHT, {
    kick: [0, 4],
    snare: [2, 6],
    hat: [0, 1, 2, 3, 4, 5, 6, 7],
  }),
  drumPreset('rock-halftime', 'Half-time rock', PRESET_CATEGORY_ROCK_POP, 4, SIXTEEN, {
    kick: [0],
    snare: [8],
    hat: [0, 2, 4, 6, 8, 10, 12, 14],
  }),
  drumPreset('blues-rock', 'Blues rock', PRESET_CATEGORY_ROCK_POP, 4, SIXTEEN, {
    kick: [0, 6, 10],
    snare: [4, 12],
    hat: [0, 2, 4, 6, 8, 10, 12, 14],
  }),
  drumPreset('four-on-floor', 'Four on the floor', PRESET_CATEGORY_ROCK_POP, 4, SIXTEEN, {
    kick: [0, 4, 8, 12],
    snare: [4, 12],
    hat: [0, 2, 4, 6, 8, 10, 12, 14],
  }),
  drumPreset('pop-light', 'Light pop', PRESET_CATEGORY_ROCK_POP, 4, SIXTEEN, {
    kick: [0, 10],
    snare: [4, 12],
    hat: [0, 4, 8, 12],
  }),
  drumPreset('pop-syncopated', 'Syncopated pop', PRESET_CATEGORY_ROCK_POP, 4, SIXTEEN, {
    kick: [0, 6, 8],
    snare: [4, 12],
    hat: [0, 2, 4, 6, 8, 10, 12, 14],
  }),

  drumPreset('funk-16ths', 'Funky 16ths', PRESET_CATEGORY_FUNK_SOUL, 4, SIXTEEN, {
    kick: [0, 3, 8, 11],
    snare: [4, 12],
    hat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  }),
  drumPreset('funk-laidback', 'Laid-back funk', PRESET_CATEGORY_FUNK_SOUL, 4, SIXTEEN, {
    kick: [0, 7, 8],
    snare: [4, 12],
    hat: [0, 3, 6, 9, 12, 15],
    rim: [6, 14],
  }, 0.15),
  drumPreset('motown', 'Motown backbeat', PRESET_CATEGORY_FUNK_SOUL, 4, SIXTEEN, {
    kick: [0, 8],
    snare: [4, 12],
    hat: [0, 4, 8, 12],
    rim: [2, 6, 10, 14],
  }),
  drumPreset('soul-shuffle', 'Soul shuffle', PRESET_CATEGORY_FUNK_SOUL, 4, TWELVE, {
    kick: [0, 6],
    snare: [3, 9],
    hat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  }, 0.33),

  drumPreset('jazz-swing', 'Swing ride', PRESET_CATEGORY_JAZZ_SWING, 4, TWELVE, {
    kick: [0, 6],
    snare: [3, 9],
    hat: [0, 2, 4, 6, 8, 10],
    rim: [1, 4, 7, 10],
  }, 0.33),
  drumPreset('jazz-brush', 'Brush ballad', PRESET_CATEGORY_JAZZ_SWING, 4, EIGHT, {
    kick: [0],
    snare: [2, 6],
    hat: [0, 1, 3, 4, 5, 7],
  }, 0.15),
  drumPreset('jazz-bossa', 'Bossa jazz', PRESET_CATEGORY_JAZZ_SWING, 4, SIXTEEN, {
    kick: [0, 10],
    snare: [4, 12],
    hat: [0, 3, 6, 8, 11, 14],
    rim: [2, 7, 13],
  }),

  drumPreset('latin-bossa', 'Bossa nova', PRESET_CATEGORY_LATIN, 4, SIXTEEN, {
    kick: [0, 6, 10],
    snare: [4, 12],
    hat: [0, 3, 6, 9, 12, 15],
    rim: [2, 8, 14],
  }),
  drumPreset('latin-samba', 'Samba feel', PRESET_CATEGORY_LATIN, 4, SIXTEEN, {
    kick: [0, 3, 6, 8, 11, 14],
    snare: [4, 12],
    hat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  }),
  drumPreset('latin-clave-32', 'Clave 3-2', PRESET_CATEGORY_LATIN, 4, SIXTEEN, {
    kick: [0, 3, 6, 8, 11],
    snare: [4, 12],
    hat: [0, 2, 4, 6, 8, 10, 12, 14],
    rim: [0, 3, 6, 8, 11],
  }),

  drumPreset('folk-reel', 'Reel (2/4)', PRESET_CATEGORY_FOLK, 2, EIGHT, {
    kick: [0, 4],
    snare: [2, 6],
    hat: [0, 1, 2, 3, 4, 5, 6, 7],
  }),
  drumPreset('folk-jig', 'Jig (6/8)', PRESET_CATEGORY_FOLK, 2, SIX_EIGHT, {
    kick: [0, 3],
    snare: [2, 5],
    hat: [0, 1, 2, 3, 4, 5],
  }),
  drumPreset('folk-polka', 'Polka', PRESET_CATEGORY_FOLK, 2, [4, 4], {
    kick: [0, 4],
    snare: [2, 6],
    hat: [0, 1, 2, 3, 4, 5, 6, 7],
  }),
  drumPreset('folk-waltz', 'Waltz', PRESET_CATEGORY_FOLK, 3, WALTZ, {
    kick: [0],
    snare: [1],
    hat: [0, 1, 2],
  }),
  drumPreset('folk-hornpipe', 'Hornpipe', PRESET_CATEGORY_FOLK, 4, EIGHT, {
    kick: [0, 4],
    snare: [2, 6],
    hat: [0, 1, 2, 3, 4, 5, 6, 7],
  }),

  drumPreset('practice-hat-16ths', 'Hat every 16th', PRESET_CATEGORY_PRACTICE, 4, SIXTEEN, {
    hat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  }),
  drumPreset('practice-kick-quarter', 'Kick quarters', PRESET_CATEGORY_PRACTICE, 4, SIXTEEN, {
    kick: [0, 4, 8, 12],
  }),
  drumPreset('practice-accent-drill', 'Accent drill', PRESET_CATEGORY_PRACTICE, 4, SIXTEEN, {
    kick: [0, 8],
    snare: [4, 12],
    hat: [0, 2, 4, 6, 8, 10, 12, 14],
  }),
  drumPreset('practice-subdivision', 'Subdivision trainer', PRESET_CATEGORY_PRACTICE, 4, SIXTEEN, {
    kick: [0, 4, 8, 12],
    rim: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  }),

  drumPreset('minimal-kick', 'Kick only', PRESET_CATEGORY_MINIMAL, 4, SIXTEEN, {
    kick: [0, 4, 8, 12],
  }),
  drumPreset('minimal-hat', 'Hi-hat only', PRESET_CATEGORY_MINIMAL, 4, SIXTEEN, {
    hat: [0, 2, 4, 6, 8, 10, 12, 14],
  }),
  drumPreset('minimal-rim', 'Rim backbeat', PRESET_CATEGORY_MINIMAL, 4, SIXTEEN, {
    rim: [4, 12],
  }),
  drumPreset('minimal-tom', 'Tom pattern', PRESET_CATEGORY_MINIMAL, 4, SIXTEEN, {
    tom: [0, 4, 8, 12],
  }),

  // Curated from assets/drum-template.mid (see scripts/extractDrumPresets.mjs)
  drumPreset('tpl-4-4-backbeat', 'Template rock sparse', PRESET_CATEGORY_ROCK_POP, 4, SIXTEEN, {
    kick: [8],
    snare: [4, 12],
    hat: [4, 8, 12],
  }),
  drumPreset('tpl-4-4-light', 'Template rock steady hats', PRESET_CATEGORY_ROCK_POP, 4, SIXTEEN, {
    kick: [8, 14],
    snare: [4, 12],
    hat: [0, 4, 8, 12],
  }),
  drumPreset('tpl-4-4-syncopated', 'Template rock kick syncopation', PRESET_CATEGORY_ROCK_POP, 4, SIXTEEN, {
    kick: [10],
    snare: [4, 12],
  }),
  drumPreset('tpl-4-4-sparse', 'Template rock offbeat kick', PRESET_CATEGORY_ROCK_POP, 4, SIXTEEN, {
    kick: [10, 13],
    snare: [4, 12],
  }),
  drumPreset('tpl-4-4-driving', 'Template rock pickup kick', PRESET_CATEGORY_ROCK_POP, 4, SIXTEEN, {
    kick: [0, 10],
    snare: [4, 12],
  }),
  drumPreset('tpl-4-4-steady', 'Template rock push kick', PRESET_CATEGORY_ROCK_POP, 4, SIXTEEN, {
    kick: [7, 10],
    snare: [4, 12],
  }),

  drumPreset('tpl-6-8-backbeat', 'Template jig basic', PRESET_CATEGORY_FOLK, 2, SIX_EIGHT, {
    kick: [3],
    snare: [2],
    hat: [1],
  }),
  drumPreset('tpl-6-8-light', 'Template jig lift', PRESET_CATEGORY_FOLK, 2, SIX_EIGHT, {
    kick: [3],
    snare: [5],
    hat: [2],
  }),
  drumPreset('tpl-6-8-syncopated', 'Template jig syncopated', PRESET_CATEGORY_FOLK, 2, SIX_EIGHT, {
    kick: [3, 4],
    snare: [0, 2],
    hat: [5],
  }),

  drumPreset('tpl-3-4-backbeat', 'Template waltz basic', PRESET_CATEGORY_FOLK, 3, WALTZ, {
    kick: [0],
    snare: [1],
    hat: [1],
  }),
  drumPreset('tpl-3-4-light', 'Template waltz light', PRESET_CATEGORY_FOLK, 3, WALTZ, {
    kick: [0],
    snare: [1],
    hat: [0, 1],
  }),

  drumPreset('tpl-2-4-backbeat', 'Template reel basic', PRESET_CATEGORY_FOLK, 2, TWO_FOUR, {
    kick: [0],
    snare: [2],
    hat: [0],
  }),
  drumPreset('tpl-2-4-light', 'Template reel driving', PRESET_CATEGORY_FOLK, 2, TWO_FOUR, {
    kick: [0, 2],
    snare: [2],
    hat: [0, 1],
  }),

  drumPreset('tpl-12-8-backbeat', 'Template shuffle basic', PRESET_CATEGORY_FOLK, 4, TWELVE, {
    kick: [11],
    snare: [0, 3, 7, 9],
  }),
  drumPreset('tpl-12-8-light', 'Template shuffle light', PRESET_CATEGORY_FOLK, 4, TWELVE, {
    kick: [10],
    snare: [0, 3, 7, 9],
  }),
]

const METRONOME_CLICK_PRESETS = METRONOME_RHYTHM_PRESETS.map(clickPresetFromMetronome)

export const ALL_RHYTHM_PRESETS = METRONOME_CLICK_PRESETS.concat(DRUM_GROOVE_PRESETS)

const DEFAULT_DRUM_PRESET_BY_SIGNATURE = {
  '4:[4,4,4,4]': 'rock-basic',
  '2:[3,3]': 'tpl-6-8-backbeat',
  '3:[1,1,1]': 'tpl-3-4-light',
  '2:[1,1]': 'folk-reel',
  '2:[2,2]': 'tpl-2-4-light',
  '4:[3,3,3,3]': 'tpl-12-8-backbeat',
}

const FALLBACK_DRUM_PRESET_BY_SIGNATURE = {
  '2:[3,3]': 'folk-jig',
  '3:[1,1,1]': 'folk-waltz',
  '2:[2,2]': 'folk-reel',
  '4:[3,3,3,3]': 'folk-hornpipe',
}

export function rhythmSignatureKey(rhythm) {
  const beatsPerBar = rhythm && rhythm.beatsPerBar != null ? rhythm.beatsPerBar : 4
  const pulses = rhythm && Array.isArray(rhythm.pulsesPerBeat) ? rhythm.pulsesPerBeat : [1]
  return beatsPerBar + ':' + JSON.stringify(pulses)
}

export function presetMatchesRhythm(preset, rhythm) {
  if (!preset || !rhythm) return false
  return rhythmSignatureKey(preset) === rhythmSignatureKey(rhythm)
}

function uniformDownscaleCompatible(presetPulses, rhythmPulses) {
  if (presetPulses.length !== rhythmPulses.length) return false
  for (let i = 0; i < presetPulses.length; i++) {
    const presetP = presetPulses[i]
    const rhythmP = rhythmPulses[i]
    if (presetP === rhythmP) continue
    if (presetP < rhythmP || presetP % rhythmP !== 0) return false
  }
  return true
}

function uniformUpscaleCompatible(presetPulses, rhythmPulses) {
  if (presetPulses.length !== rhythmPulses.length) return false
  for (let i = 0; i < presetPulses.length; i++) {
    const presetP = presetPulses[i]
    const rhythmP = rhythmPulses[i]
    if (presetP === rhythmP) continue
    if (rhythmP < presetP || rhythmP % presetP !== 0) return false
  }
  return true
}

export function presetCompatibleWithRhythm(preset, rhythm) {
  if (!preset || !rhythm) return false
  if (presetMatchesRhythm(preset, rhythm)) return true
  const normalized = normalizeRhythmConfig(rhythm)
  if (preset.beatsPerBar !== normalized.beatsPerBar) return false
  if (rhythmPulseShapeKey(preset) === rhythmPulseShapeKey(normalized)) return true
  const presetPulses = Array.isArray(preset.pulsesPerBeat)
    ? preset.pulsesPerBeat
    : Array.from({ length: preset.beatsPerBar }, function() { return preset.pulsesPerBeat || 1 })
  const rhythmPulses = normalized.pulsesPerBeat || []
  return uniformDownscaleCompatible(presetPulses, rhythmPulses)
    || uniformUpscaleCompatible(presetPulses, rhythmPulses)
}

export function getCompatibleDrumPresets(rhythm, options) {
  const opts = options || {}
  const normalized = normalizeRhythmConfig(rhythm)
  const source = opts.includeUser !== false && Array.isArray(opts.userPresets)
    ? DRUM_GROOVE_PRESETS.concat(opts.userPresets)
    : DRUM_GROOVE_PRESETS
  const engineMode = opts.engineMode || ENGINE_MODE_DRUMS
  const filtered = source.filter(function(preset) {
    if (preset.engineMode !== engineMode) return false
    return presetCompatibleWithRhythm(preset, normalized)
  })
  return filtered.sort(function(a, b) {
    const aExact = presetMatchesRhythm(a, normalized) ? 0 : 1
    const bExact = presetMatchesRhythm(b, normalized) ? 0 : 1
    if (aExact !== bExact) return aExact - bExact
    return String(a.label).localeCompare(String(b.label))
  })
}

/**
 * Searchable preset list for the drum picker (built-in + user).
 */
export function getSearchableRhythmPresets(rhythm, options) {
  const opts = options || {}
  const normalized = normalizeRhythmConfig(rhythm)
  const engineMode = opts.engineMode || normalized.engineMode || ENGINE_MODE_DRUMS
  const query = (opts.query || '').trim().toLowerCase()
  let presets = engineMode === ENGINE_MODE_CLICK
    ? METRONOME_CLICK_PRESETS.slice()
    : getCompatibleDrumPresets(normalized, {
      userPresets: opts.userPresets || [],
      engineMode: ENGINE_MODE_DRUMS,
    })
  if (query) {
    presets = presets.filter(function(preset) {
      return preset.label.toLowerCase().includes(query)
        || preset.category.toLowerCase().includes(query)
        || preset.id.toLowerCase().includes(query)
    })
  }
  return presets
}

export function groupPresetsForPicker(presets, rhythm) {
  const normalized = normalizeRhythmConfig(rhythm)
  const exact = []
  const compatible = []
  const myPatterns = []
  presets.forEach(function(preset) {
    if (preset.category === PRESET_CATEGORY_MY_PATTERNS) {
      myPatterns.push(preset)
      return
    }
    if (presetMatchesRhythm(preset, normalized)) exact.push(preset)
    else compatible.push(preset)
  })
  return { exact: exact, compatible: compatible, myPatterns: myPatterns }
}

export function getDrumPresetsForRhythm(rhythm) {
  return DRUM_GROOVE_PRESETS.filter(function(preset) {
    return presetMatchesRhythm(preset, rhythm)
  })
}

export function defaultDrumPresetIdForRhythm(rhythm) {
  const key = rhythmSignatureKey(rhythm)
  const preferred = DEFAULT_DRUM_PRESET_BY_SIGNATURE[key]
  if (preferred && getRhythmPresetById(preferred)) {
    return preferred
  }
  const fallback = FALLBACK_DRUM_PRESET_BY_SIGNATURE[key]
  if (fallback && getRhythmPresetById(fallback)) {
    return fallback
  }
  const match = DRUM_GROOVE_PRESETS.find(function(preset) {
    return presetMatchesRhythm(preset, rhythm)
  })
  return match ? match.id : 'rock-basic'
}

export function getRhythmPresetById(presetId) {
  if (isUserDrumPresetId(presetId)) {
    return findUserDrumPresetById(presetId)
  }
  return ALL_RHYTHM_PRESETS.find(function(preset) { return preset.id === presetId }) || null
}

export function getPresetsByCategory(category) {
  const builtins = ALL_RHYTHM_PRESETS.filter(function(preset) { return preset.category === category })
  if (category !== PRESET_CATEGORY_MY_PATTERNS) return builtins
  return getCachedUserDrumPresets()
}

export function applyRhythmPreset(presetId) {
  if (isUserDrumPresetId(presetId)) {
    const userPreset = findUserDrumPresetById(presetId)
    if (userPreset) return userDrumPresetToRhythm(userPreset)
    return createRhythmConfig(4)
  }
  const preset = getRhythmPresetById(presetId)
  if (!preset) return createRhythmConfig(4)

  if (preset.engineMode === ENGINE_MODE_CLICK) {
    return createRhythmConfig(preset.beatsPerBar, preset.accents, preset.pulsesPerBeat, {
      engineMode: ENGINE_MODE_CLICK,
      presetId: preset.id,
    })
  }

  return createRhythmConfig(preset.beatsPerBar, preset.accents, preset.pulsesPerBeat, {
    engineMode: ENGINE_MODE_DRUMS,
    presetId: preset.id,
    drumPattern: preset.drumPattern,
  })
}

export function presetIdForRhythmConfig(rhythm) {
  const normalized = normalizeRhythmConfig(rhythm)
  if (normalized.presetId) {
    const preset = getRhythmPresetById(normalized.presetId)
    if (preset) return normalized.presetId
  }
  const userId = userDrumPresetIdForRhythm(normalized)
  if (userId) return userId
  const match = ALL_RHYTHM_PRESETS.find(function(preset) {
    const applied = applyRhythmPreset(preset.id)
    return applied.engineMode === normalized.engineMode
      && applied.beatsPerBar === normalized.beatsPerBar
      && JSON.stringify(applied.pulsesPerBeat) === JSON.stringify(normalized.pulsesPerBeat)
      && (normalized.engineMode !== ENGINE_MODE_DRUMS
        || JSON.stringify(applied.drumPattern) === JSON.stringify(normalized.drumPattern))
  })
  return match ? match.id : ''
}

export function presetLabelForId(presetId) {
  const preset = getRhythmPresetById(presetId)
  return preset ? preset.label : ''
}
