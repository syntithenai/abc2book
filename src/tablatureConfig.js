import {
  TUNER_INSTRUMENT_LABELS,
  defaultPresetForInstrument,
  presetsForInstrument,
  getPreset,
} from './instrumentTuningPresets.js'
import { resolvePresetFromText, canonicalTuningLabel } from './tuningPresetResolver.js'
import { noteLinesHaveRealMelody } from './timedImportFinalizer.js'

/** Tab-capable tuner instruments (fretted / commonly tabbed). */
export const TABLATURE_INSTRUMENTS = [
  { id: 'violin', label: 'Violin' },
  { id: 'guitar', label: TUNER_INSTRUMENT_LABELS.guitar },
  { id: 'uke', label: TUNER_INSTRUMENT_LABELS.uke },
  { id: 'banjo4', label: TUNER_INSTRUMENT_LABELS.banjo4 },
  { id: 'banjo5', label: TUNER_INSTRUMENT_LABELS.banjo5 },
  { id: 'bouzouki', label: TUNER_INSTRUMENT_LABELS.bouzouki },
]

export const TABLATURE_INSTRUMENT_OPTIONS = [
  { value: '', label: '(none)' },
].concat(TABLATURE_INSTRUMENTS.map(function(inst) {
  return { value: inst.id, label: inst.label }
}))

export const TAB_DISPLAY_MODES = ['both', 'tab']

export const TAB_DISPLAY_OPTIONS = [
  { value: 'both', label: 'Notation and tab' },
  { value: 'tab', label: 'Tab only' },
]

export function normalizeTabDisplay(value) {
  const mode = String(value || '').trim().toLowerCase()
  if (mode === 'tab') return 'tab'
  // Legacy "staff" meant notation-only; turning tab off is the supported path now.
  return 'both'
}

export function getTabDisplay(tune) {
  return normalizeTabDisplay(tune && tune.tabDisplay)
}

export function tabDisplayLabel(mode) {
  const normalized = normalizeTabDisplay(mode)
  const option = TAB_DISPLAY_OPTIONS.find(function(entry) { return entry.value === normalized })
  return option ? option.label : 'Notation and tab'
}

export function countActiveTabVoices(tabOptions) {
  if (!Array.isArray(tabOptions)) return 0
  return tabOptions.filter(function(opt) { return opt && opt.instrument }).length
}

export function shouldRenderTablature(tune) {
  return !!getTablatureSelection(tune).instrumentId
}

export function shouldApplyTabOnlyDisplay(tune, tabOptions) {
  if (!shouldRenderTablature(tune)) return false
  return getTabDisplay(tune) === 'tab' && countActiveTabVoices(tabOptions) > 0
}

/** Map legacy stored ids and aliases to current tab instrument ids. */
export function normalizeTablatureInstrument(instrumentId) {
  const id = String(instrumentId || '').trim()
  if (!id) return ''
  if (id === 'mandolin' || id === 'fiddle') return 'violin'
  return id
}

export function tabInstrumentLabel(instrumentId) {
  const id = normalizeTablatureInstrument(instrumentId)
  const inst = TABLATURE_INSTRUMENTS.find(function(entry) { return entry.id === id })
  return inst ? inst.label : ''
}

export function presetsForTabInstrument(instrumentId) {
  const id = normalizeTablatureInstrument(instrumentId)
  if (!id || !isSupportedTablatureInstrument(id)) return []
  return presetsForInstrument(id)
}

export function getTablatureSelection(tune) {
  const instrumentId = normalizeTablatureInstrument(tune && tune.tablature)
  if (!instrumentId || !isSupportedTablatureInstrument(instrumentId)) {
    return { instrumentId: '', presetId: '', preset: null }
  }
  const preset = resolveTuningPresetForTab(instrumentId, tune)
  return {
    instrumentId: instrumentId,
    presetId: preset ? preset.id : '',
    preset: preset,
  }
}

export function getTablatureButtonLabel(tune) {
  const selection = getTablatureSelection(tune)
  if (!selection.instrumentId) return 'Tablature'
  return tabInstrumentLabel(selection.instrumentId)
}

function sortVoiceKeys(voiceKeys) {
  return voiceKeys.slice().sort(function(a, b) {
    const na = parseInt(a, 10)
    const nb = parseInt(b, 10)
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb
    return String(a).localeCompare(String(b))
  })
}

/** True when a voice has pitched notes, excluding chord-symbol-only lines. */
export function voiceNoteLinesHaveMelody(noteLines) {
  return noteLinesHaveRealMelody(noteLines)
}

/**
 * Build per-voice abcjs tablature options for the tune being rendered.
 * Tab is added only under voices with melody; chord-only voices are skipped.
 */
export function buildTablatureRenderOptions(tune) {
  const baseCfg = buildAbcjsTablatureConfig(tune)
  if (!baseCfg) return null

  const voices = tune && tune.voices
  if (!voices || typeof voices !== 'object') return [baseCfg]

  const voiceKeys = sortVoiceKeys(Object.keys(voices))
  if (!voiceKeys.length) return [baseCfg]

  const options = voiceKeys.map(function(voiceKey) {
    const notes = voices[voiceKey] && voices[voiceKey].notes
    if (voiceNoteLinesHaveMelody(notes)) {
      return Object.assign({}, baseCfg)
    }
    return { instrument: '' }
  })

  const hasMelodyTab = options.some(function(opt) { return opt.instrument })
  return hasMelodyTab ? options : null
}

const ABCJS_INSTRUMENT_MAP = {
  violin: 'violin',
  guitar: 'guitar',
  uke: 'mandolin',
  banjo4: 'mandolin',
  banjo5: 'fiveString',
  bouzouki: 'mandolin',
}

const NOTE_TO_SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

function normalizeText(text) {
  return String(text || '').trim().toLowerCase()
}

function pitchLettersJoined(strings) {
  return strings.map(function(s) {
    return s.replace(/[0-9]/g, '')
  }).join('').toUpperCase()
}

function parsePitchString(pitch) {
  const match = String(pitch || '').match(/^([A-Ga-g])([#b]?)(\d+)$/)
  if (!match) return null
  return {
    letter: match[1].toUpperCase(),
    accidental: match[2] || '',
    octave: parseInt(match[3], 10),
  }
}

function pitchToMidi(pitch) {
  const parsed = parsePitchString(pitch)
  if (!parsed) return null
  let semitone = NOTE_TO_SEMITONE[parsed.letter]
  if (parsed.accidental === '#') semitone += 1
  if (parsed.accidental === 'b') semitone -= 1
  return (parsed.octave + 1) * 12 + semitone
}

/** Convert scientific pitch strings (e.g. G3, E5) to abcjs tuning tokens. */
export function pitchStringsToAbcTuning(strings, instrumentId) {
  const list = strings || []
  if (!list.length) return []

  if (instrumentId === 'guitar' || list.length === 6) {
    return list.map(function(pitch, index) {
      const parsed = parsePitchString(pitch)
      if (!parsed) return String(pitch || '')
      const prefix = accidentalPrefix(parsed)
      if (index < 2) return prefix + parsed.letter + ','
      if (index === list.length - 1) return prefix + parsed.letter.toLowerCase()
      return prefix + parsed.letter
    })
  }

  if (list.length === 4) {
    return list.map(function(pitch, index) {
      const parsed = parsePitchString(pitch)
      if (!parsed) return String(pitch || '')
      const prefix = accidentalPrefix(parsed)
      if (index === 0 && parsed.octave < 4) {
        return prefix + parsed.letter + ','.repeat(4 - parsed.octave)
      }
      if (index === list.length - 1 && parsed.octave >= 5) {
        return prefix + parsed.letter.toLowerCase() + "'".repeat(Math.max(0, parsed.octave - 5))
      }
      return prefix + parsed.letter
    })
  }

  if (instrumentId === 'banjo5' || list.length === 5) {
    return list.map(function(pitch) {
      const parsed = parsePitchString(pitch)
      if (!parsed) return String(pitch || '')
      const prefix = accidentalPrefix(parsed)
      if (parsed.octave <= 3) {
        const commas = Math.max(1, 4 - parsed.octave)
        return prefix + parsed.letter + ','.repeat(commas)
      }
      return prefix + parsed.letter
    })
  }

  return list.map(function(pitch) {
    const parsed = parsePitchString(pitch)
    if (!parsed) return String(pitch || '')
    const prefix = accidentalPrefix(parsed)
    const diff = parsed.octave - 4
    if (diff < 0) {
      return prefix + parsed.letter + ','.repeat(-diff)
    }
    if (diff === 0) {
      return prefix + parsed.letter
    }
    return prefix + parsed.letter.toLowerCase() + "'".repeat(diff - 1)
  })
}

function accidentalPrefix(parsed) {
  if (parsed.accidental === '#') return '^'
  if (parsed.accidental === 'b') return '_'
  return ''
}

function sortStringsAscending(strings) {
  return strings.slice().sort(function(a, b) {
    return (pitchToMidi(a) || 0) - (pitchToMidi(b) || 0)
  })
}

export function isSupportedTablatureInstrument(instrument) {
  const id = normalizeTablatureInstrument(instrument)
  return TABLATURE_INSTRUMENTS.some(function(inst) { return inst.id === id })
}

export function resolvePresetFromTextForInstrument(text, instrument) {
  const norm = normalizeText(text)
  if (!norm || !instrument) return null

  const presets = presetsForInstrument(instrument)
  for (let i = 0; i < presets.length; i++) {
    const preset = presets[i]
    if (normalizeText(preset.id) === norm) {
      return preset
    }
    if (normalizeText(preset.label) === norm) {
      return preset
    }
    const compact = norm.replace(/[^a-g#]/gi, '')
    const presetPitch = pitchLettersJoined(preset.strings).replace(/[^A-G#]/gi, '').toLowerCase()
    if (compact.length >= 3 && compact === presetPitch) {
      return preset
    }
    const aliases = preset.aliases || []
    for (let j = 0; j < aliases.length; j++) {
      if (normalizeText(aliases[j]) === norm || norm.indexOf(normalizeText(aliases[j])) !== -1) {
        return preset
      }
    }
    if (norm.length >= 3 && normalizeText(preset.label).indexOf(norm) !== -1) {
      return preset
    }
    if (norm.length >= 3 && norm.indexOf(normalizeText(preset.label)) !== -1) {
      return preset
    }
  }
  return null
}

export function resolveTuningPresetForTab(instrument, tune) {
  const instrumentId = normalizeTablatureInstrument(instrument)
  if (!instrumentId || !isSupportedTablatureInstrument(instrumentId)) return null

  const fromTuning = tune && tune.tuning
    ? resolvePresetFromTextForInstrument(tune.tuning, instrumentId)
    : null
  if (fromTuning) return fromTuning

  const globalMatch = tune && tune.tuning ? resolvePresetFromText(tune.tuning) : null
  if (globalMatch && normalizeTablatureInstrument(globalMatch.instrument) === instrumentId) {
    return globalMatch.preset
  }

  return defaultPresetForInstrument(instrumentId)
}

function tabLabelForInstrument(instrumentId) {
  const label = tabInstrumentLabel(instrumentId)
  return label ? label + ' (%T)' : '%T'
}

export function buildAbcjsTablatureConfig(tune) {
  const instrumentId = normalizeTablatureInstrument(tune && tune.tablature)
  if (!instrumentId || !isSupportedTablatureInstrument(instrumentId)) return null

  const abcjsInstrument = ABCJS_INSTRUMENT_MAP[instrumentId]
  if (!abcjsInstrument) return null

  const preset = resolveTuningPresetForTab(instrumentId, tune)
  let strings = preset && preset.strings ? preset.strings.slice() : []
  if (instrumentId === 'banjo5' || instrumentId === 'uke') {
    strings = sortStringsAscending(strings)
  }

  const config = {
    instrument: abcjsInstrument,
    tuning: pitchStringsToAbcTuning(strings, instrumentId),
    label: tabLabelForInstrument(instrumentId),
    capo: Math.max(0, parseInt(tune && tune.capo, 10) || 0),
  }

  return config
}

/** Apply tablature instrument + tuning preset to a tune (mutates tune). */
export function applyTablatureSelection(tune, instrumentId, presetId, tabDisplay) {
  if (!tune) return tune
  const normalized = normalizeTablatureInstrument(instrumentId)
  if (!normalized) {
    tune.tablature = ''
    tune.tabDisplay = ''
    return tune
  }
  tune.tablature = normalized
  const preset = presetId ? getPreset(normalized, presetId) : defaultPresetForInstrument(normalized)
  tune.tuning = preset ? canonicalTuningLabel(preset) : ''
  if (tabDisplay != null && String(tabDisplay).trim()) {
    tune.tabDisplay = normalizeTabDisplay(tabDisplay)
  } else if (!tune.tabDisplay) {
    tune.tabDisplay = 'both'
  }
  return tune
}

export function applyTabDisplay(tune, tabDisplay) {
  if (!tune) return tune
  tune.tabDisplay = normalizeTabDisplay(tabDisplay)
  return tune
}

/** Legacy map keyed by tab instrument id (default tuning, no tune context). */
export function buildLegacyTablatureConfigMap() {
  const map = {}
  TABLATURE_INSTRUMENTS.forEach(function(inst) {
    const cfg = buildAbcjsTablatureConfig({ tablature: inst.id, tuning: '', capo: 0 })
    if (cfg) map[inst.id] = cfg
  })
  return map
}
