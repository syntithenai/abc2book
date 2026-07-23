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

export const PRESET_CATEGORY_METRONOME = 'Metronome'
export const PRESET_CATEGORY_ROCK_POP = 'Rock & pop'
export const PRESET_CATEGORY_FUNK_SOUL = 'Funk & soul'
export const PRESET_CATEGORY_JAZZ_SWING = 'Jazz & swing'
export const PRESET_CATEGORY_LATIN = 'Latin'
export const PRESET_CATEGORY_FOLK = 'Folk & dance'
export const PRESET_CATEGORY_PRACTICE = 'Practice'
export const PRESET_CATEGORY_MINIMAL = 'Minimal'

export const DRUM_PRESET_CATEGORIES = [
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
]

const METRONOME_CLICK_PRESETS = METRONOME_RHYTHM_PRESETS.map(clickPresetFromMetronome)

export const ALL_RHYTHM_PRESETS = METRONOME_CLICK_PRESETS.concat(DRUM_GROOVE_PRESETS)

export function getRhythmPresetById(presetId) {
  return ALL_RHYTHM_PRESETS.find(function(preset) { return preset.id === presetId }) || null
}

export function getPresetsByCategory(category) {
  return ALL_RHYTHM_PRESETS.filter(function(preset) { return preset.category === category })
}

export function applyRhythmPreset(presetId) {
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
