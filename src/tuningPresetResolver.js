import {
  allPresetsFlat,
  getPreset,
  TUNER_INSTRUMENTS
} from './instrumentTuningPresets.js'

const TUNE_NAME_PRESETS = [
  { pattern: /black\s*mountain\s*rag/i, instrument: 'mandolin', presetId: 'aeacSharp' },
  { pattern: /drunken\s*hiccups/i, instrument: 'mandolin', presetId: 'aeacSharp' },
  { pattern: /lost\s*indian/i, instrument: 'mandolin', presetId: 'aeacSharp' },
  { pattern: /marcus\s*martin.*calico|calico/i, instrument: 'mandolin', presetId: 'aeacSharp' },
  { pattern: /bonaparte.*retreat/i, instrument: 'mandolin', presetId: 'ddad' },
  { pattern: /midnight\s*on\s*the\s*water/i, instrument: 'mandolin', presetId: 'ddad' },
  { pattern: /dry\s*and\s*dusty/i, instrument: 'mandolin', presetId: 'ddad' },
  { pattern: /cluck\s*old\s*hen/i, instrument: 'mandolin', presetId: 'aeae' },
  { pattern: /hangman.*reel/i, instrument: 'mandolin', presetId: 'aeae' },
  { pattern: /breaking\s*up\s*christmas/i, instrument: 'mandolin', presetId: 'aeae' },
  { pattern: /soldier.*joy/i, instrument: 'mandolin', presetId: 'adae' },
  { pattern: /sally\s*goodin/i, instrument: 'mandolin', presetId: 'adae' },
  { pattern: /old\s*sledge/i, instrument: 'mandolin', presetId: 'aead' },
  { pattern: /flatwoods/i, instrument: 'mandolin', presetId: 'gdad' }
]

function normalizeText(text) {
  return String(text || '').trim().toLowerCase()
}

function pitchStringFromPreset(preset) {
  return preset.chordTuning.join('').toUpperCase().replace(/#/g, '#')
}

function pitchLettersJoined(strings) {
  return strings.map(function(s) {
    return s.replace(/[0-9]/g, '')
  }).join('').toUpperCase()
}

export function resolvePresetFromText(text) {
  const norm = normalizeText(text)
  if (!norm) return null

  const flat = allPresetsFlat()
  for (let i = 0; i < flat.length; i++) {
    const { instrument, preset } = flat[i]
    if (normalizeText(preset.id) === norm) {
      return { instrument, presetId: preset.id, preset, source: 'id' }
    }
    if (normalizeText(preset.label) === norm) {
      return { instrument, presetId: preset.id, preset, source: 'label' }
    }
    const pitch = pitchLettersJoined(preset.strings)
    if (norm.replace(/[^a-g#]/gi, '') === pitch.toLowerCase().replace(/[^a-g#]/gi, '')) {
      return { instrument, presetId: preset.id, preset, source: 'pitch' }
    }
    const aliases = preset.aliases || []
    for (let j = 0; j < aliases.length; j++) {
      if (normalizeText(aliases[j]) === norm || norm.indexOf(normalizeText(aliases[j])) !== -1) {
        return { instrument, presetId: preset.id, preset, source: 'alias' }
      }
    }
    // Match pitch-like tokens: GDAD, AEAC#, DADGAD
    const compact = norm.replace(/[^a-g#]/gi, '')
    const presetPitch = pitchLettersJoined(preset.strings).replace(/[^A-G#]/gi, '').toLowerCase()
    if (compact.length >= 3 && compact === presetPitch) {
      return { instrument, presetId: preset.id, preset, source: 'pitch-compact' }
    }
    // Match label substring
    if (norm.length >= 3 && normalizeText(preset.label).indexOf(norm) !== -1) {
      return { instrument, presetId: preset.id, preset, source: 'label-partial' }
    }
    if (norm.length >= 3 && norm.indexOf(normalizeText(preset.label)) !== -1) {
      return { instrument, presetId: preset.id, preset, source: 'label-partial' }
    }
  }
  return null
}

export function resolvePresetFromTuneName(tuneName) {
  if (!tuneName) return null
  for (let i = 0; i < TUNE_NAME_PRESETS.length; i++) {
    const entry = TUNE_NAME_PRESETS[i]
    if (entry.pattern.test(tuneName)) {
      const preset = getPreset(entry.instrument, entry.presetId)
      if (preset) {
        return {
          instrument: entry.instrument,
          presetId: entry.presetId,
          preset,
          source: 'tune-name'
        }
      }
    }
  }
  return null
}

export function resolvePresetForTune(tune) {
  if (!tune) return null
  const fromTuning = resolvePresetFromText(tune.tuning)
  if (fromTuning) return fromTuning
  return resolvePresetFromTuneName(tune.name)
}

export function canonicalTuningLabel(preset) {
  return preset ? preset.label : ''
}

export function isValidTunerInstrument(instrument) {
  return TUNER_INSTRUMENTS.indexOf(instrument) !== -1
}
