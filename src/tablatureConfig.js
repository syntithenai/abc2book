import {
  TUNER_INSTRUMENT_LABELS,
  defaultPresetForInstrument,
  presetsForInstrument,
  getPreset,
} from './instrumentTuningPresets.js'
import { resolvePresetFromText, canonicalTuningLabel } from './tuningPresetResolver.js'
import { noteLinesHaveRealMelody } from './timedImportFinalizer.js'
import { getTuneVoiceKeys } from './abcVoiceViewSettings.js'

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
  return getActiveTablatureVoiceKeys(tune).length > 0
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

export function normalizeTablatureVoiceEntry(entry) {
  if (!entry || typeof entry !== 'object') return null
  const instrumentId = normalizeTablatureInstrument(entry.instrumentId || entry.instrument)
  if (!instrumentId || !isSupportedTablatureInstrument(instrumentId)) return null
  return {
    instrumentId: instrumentId,
    presetId: String(entry.presetId || entry.preset || '').trim(),
    tuning: String(entry.tuning || entry.tuningText || '').trim(),
  }
}

export function parseTablatureVoices(raw) {
  if (!raw) return {}
  let parsed = raw
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw)
    } catch (e) {
      return {}
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  const out = {}
  Object.keys(parsed).forEach(function(voiceKey) {
    const entry = normalizeTablatureVoiceEntry(parsed[voiceKey])
    if (entry) out[voiceKey] = entry
  })
  return out
}

export function getTablatureVoices(tune) {
  return parseTablatureVoices(tune && tune.tablatureVoices)
}

export function serializeTablatureVoices(tune) {
  const voices = getTablatureVoices(tune)
  const keys = Object.keys(voices)
  if (!keys.length) return ''
  const payload = {}
  keys.forEach(function(voiceKey) {
    const entry = voices[voiceKey]
    payload[voiceKey] = {
      instrumentId: entry.instrumentId,
      presetId: entry.presetId || '',
      tuning: entry.tuning || '',
    }
  })
  try {
    return JSON.stringify(payload)
  } catch (e) {
    return ''
  }
}

export function getActiveTablatureVoiceKeys(tune) {
  const stored = getTablatureVoices(tune)
  const storedKeys = sortVoiceKeys(Object.keys(stored))
  if (storedKeys.length) return storedKeys

  const legacy = getLegacyTablatureSelection(tune)
  if (!legacy.instrumentId) return []

  const voiceKeys = getTuneVoiceKeys(tune)
  if (!voiceKeys.length) return ['1']

  return voiceKeys.filter(function(voiceKey) {
    const notes = tune.voices[voiceKey] && tune.voices[voiceKey].notes
    return voiceNoteLinesHaveMelody(notes)
  })
}

function getLegacyTablatureSelection(tune) {
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

export function getTablatureSelection(tune) {
  const activeKeys = getActiveTablatureVoiceKeys(tune)
  if (!activeKeys.length) {
    return { instrumentId: '', presetId: '', preset: null }
  }

  const stored = getTablatureVoices(tune)
  const firstKey = activeKeys[0]
  const storedEntry = stored[firstKey]
  if (storedEntry) {
    const preset = resolveVoiceTabPreset(
      storedEntry.instrumentId,
      storedEntry.presetId,
      tune,
      storedEntry.tuning
    )
    return {
      instrumentId: storedEntry.instrumentId,
      presetId: preset ? preset.id : storedEntry.presetId,
      preset: preset,
    }
  }

  return getLegacyTablatureSelection(tune)
}

function tuningLabelForVoiceEntry(entry, instrumentId, tune) {
  if (entry && entry.tuning) return entry.tuning
  if (entry && entry.presetId) {
    const preset = getPreset(instrumentId, entry.presetId)
    if (preset) return canonicalTuningLabel(preset)
  }
  if (tune && tune.tuning) return tune.tuning
  const preset = defaultPresetForInstrument(instrumentId)
  return preset ? canonicalTuningLabel(preset) : ''
}

export function tuningOptionsForInstrument(instrumentId) {
  return presetsForTabInstrument(instrumentId).map(function(preset) {
    return canonicalTuningLabel(preset)
  })
}

export function resolveVoiceTuningSelection(instrumentId, tuningText, presetId) {
  const normalized = normalizeTablatureInstrument(instrumentId)
  if (!normalized) return { presetId: '', tuningText: '' }
  const text = String(tuningText || '').trim()
  if (text) {
    const fromText = resolvePresetFromTextForInstrument(text, normalized)
    if (fromText) {
      return { presetId: fromText.id, tuningText: text }
    }
    return { presetId: '', tuningText: text }
  }
  if (presetId) {
    const preset = getPreset(normalized, presetId)
    if (preset) {
      return { presetId: preset.id, tuningText: canonicalTuningLabel(preset) }
    }
  }
  const fallback = defaultPresetForInstrument(normalized)
  return fallback
    ? { presetId: fallback.id, tuningText: canonicalTuningLabel(fallback) }
    : { presetId: '', tuningText: '' }
}

export function getTablatureVoiceSettings(tune) {
  const voiceKeys = getTuneVoiceKeys(tune)
  const stored = getTablatureVoices(tune)
  const legacy = getLegacyTablatureSelection(tune)
  const hasStored = Object.keys(stored).length > 0
  const legacyTuningText = legacy.preset
    ? canonicalTuningLabel(legacy.preset)
    : (tune && tune.tuning ? tune.tuning : '')

  if (!voiceKeys.length) {
    if (!legacy.instrumentId) {
      return [{
        voiceKey: '1',
        enabled: false,
        instrumentId: '',
        presetId: '',
        tuningText: '',
      }]
    }
    return [{
      voiceKey: '1',
      enabled: true,
      instrumentId: legacy.instrumentId,
      presetId: legacy.presetId,
      tuningText: legacyTuningText,
    }]
  }

  return voiceKeys.map(function(voiceKey) {
    const storedEntry = stored[voiceKey]
    if (storedEntry) {
      return {
        voiceKey: voiceKey,
        enabled: true,
        instrumentId: storedEntry.instrumentId,
        presetId: storedEntry.presetId,
        tuningText: tuningLabelForVoiceEntry(storedEntry, storedEntry.instrumentId, tune),
      }
    }
    if (!hasStored && legacy.instrumentId && voiceNoteLinesHaveMelody(tune.voices[voiceKey] && tune.voices[voiceKey].notes)) {
      return {
        voiceKey: voiceKey,
        enabled: true,
        instrumentId: legacy.instrumentId,
        presetId: legacy.presetId,
        tuningText: legacyTuningText,
      }
    }
    return {
      voiceKey: voiceKey,
      enabled: false,
      instrumentId: '',
      presetId: '',
      tuningText: '',
    }
  })
}

export function tablatureInstrumentSummary(tune) {
  const activeKeys = getActiveTablatureVoiceKeys(tune)
  if (!activeKeys.length) return ''

  const stored = getTablatureVoices(tune)
  const labels = []
  const seen = {}
  activeKeys.forEach(function(voiceKey) {
    const entry = stored[voiceKey] || getLegacyTablatureSelection(tune)
    const label = tabInstrumentLabel(entry.instrumentId)
    if (!label || seen[label]) return
    seen[label] = true
    labels.push(label)
  })
  return labels.join(' + ')
}

export function getTablatureButtonLabel(tune) {
  const summary = tablatureInstrumentSummary(tune)
  if (!summary) return 'Tablature'
  const parts = summary.split(' + ')
  if (parts.length === 1) return parts[0]
  return 'Tablature'
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
 * Uses explicit per-voice settings when present; otherwise legacy global tab on melody voices.
 */
export function buildTablatureRenderOptions(tune) {
  const voiceKeys = getTuneVoiceKeys(tune)
  const stored = getTablatureVoices(tune)
  const storedKeys = Object.keys(stored)

  if (storedKeys.length) {
    const keys = voiceKeys.length ? voiceKeys : sortVoiceKeys(storedKeys)
    const options = keys.map(function(voiceKey) {
      const entry = stored[voiceKey]
      if (!entry) return { instrument: '' }
      const cfg = buildAbcjsTablatureConfigForSelection(
        entry.instrumentId,
        entry.presetId,
        tune,
        entry.tuning
      )
      return cfg || { instrument: '' }
    })
    return options.some(function(opt) { return opt.instrument }) ? options : null
  }

  const baseCfg = buildAbcjsTablatureConfig(tune)
  if (!baseCfg) return null

  if (!voiceKeys.length) return [baseCfg]

  const options = voiceKeys.map(function(voiceKey) {
    const notes = tune.voices[voiceKey] && tune.voices[voiceKey].notes
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

export function resolveVoiceTabPreset(instrumentId, presetId, tune, tuningText) {
  const normalized = normalizeTablatureInstrument(instrumentId)
  if (!normalized || !isSupportedTablatureInstrument(normalized)) return null
  if (presetId) {
    const preset = getPreset(normalized, presetId)
    if (preset) return preset
  }
  const text = String(tuningText || '').trim()
  if (text) {
    const fromText = resolvePresetFromTextForInstrument(text, normalized)
    if (fromText) return fromText
    const tuneStub = tune ? Object.assign({}, tune, { tuning: text }) : { tuning: text }
    const fromStub = resolveTuningPresetForTab(normalized, tuneStub)
    if (fromStub) return fromStub
  }
  return resolveTuningPresetForTab(normalized, tune)
}

export function buildAbcjsTablatureConfigForSelection(instrumentId, presetId, tune, tuningText) {
  const normalized = normalizeTablatureInstrument(instrumentId)
  if (!normalized || !isSupportedTablatureInstrument(normalized)) return null

  const abcjsInstrument = ABCJS_INSTRUMENT_MAP[normalized]
  if (!abcjsInstrument) return null

  const preset = resolveVoiceTabPreset(normalized, presetId, tune, tuningText)
  let strings = preset && preset.strings ? preset.strings.slice() : []
  if (normalized === 'banjo5' || normalized === 'uke') {
    strings = sortStringsAscending(strings)
  }

  return {
    instrument: abcjsInstrument,
    tuning: pitchStringsToAbcTuning(strings, normalized),
    label: tabLabelForInstrument(normalized),
    capo: Math.max(0, parseInt(tune && tune.capo, 10) || 0),
  }
}

export function buildAbcjsTablatureConfig(tune) {
  const selection = getLegacyTablatureSelection(tune)
  if (!selection.instrumentId) return null
  return buildAbcjsTablatureConfigForSelection(selection.instrumentId, selection.presetId, tune)
}

function syncLegacyTablatureFields(tune, tablatureVoices) {
  const keys = sortVoiceKeys(Object.keys(tablatureVoices || {}))
  if (!keys.length) {
    tune.tablature = ''
    tune.tuning = ''
    return
  }
  const first = tablatureVoices[keys[0]]
  tune.tablature = first.instrumentId
  const preset = resolveVoiceTabPreset(first.instrumentId, first.presetId, tune, first.tuning)
  tune.tuning = first.tuning || (preset ? canonicalTuningLabel(preset) : '')
}

function voiceSettingToStoredEntry(setting) {
  if (!setting || !setting.instrumentId) return null
  const instrumentId = normalizeTablatureInstrument(setting.instrumentId)
  if (!instrumentId) return null
  const resolved = resolveVoiceTuningSelection(
    instrumentId,
    setting.tuningText,
    setting.presetId
  )
  return {
    instrumentId: instrumentId,
    presetId: resolved.presetId,
    tuning: resolved.tuningText,
  }
}

/** Apply per-voice tablature settings to a tune (mutates tune). */
export function applyTablatureVoiceConfigs(tune, voiceSettings, tabDisplay) {
  if (!tune) return tune
  const tablatureVoices = {}
  ;(voiceSettings || []).forEach(function(setting) {
    const active = setting.enabled !== false && !!setting.instrumentId
    if (!active) return
    const entry = voiceSettingToStoredEntry(setting)
    if (!entry) return
    tablatureVoices[setting.voiceKey] = entry
  })

  if (!Object.keys(tablatureVoices).length) {
    tune.tablature = ''
    tune.tuning = ''
    tune.tablatureVoices = null
    tune.tabDisplay = ''
    return tune
  }

  tune.tablatureVoices = tablatureVoices
  syncLegacyTablatureFields(tune, tablatureVoices)
  if (tabDisplay != null && String(tabDisplay).trim()) {
    tune.tabDisplay = normalizeTabDisplay(tabDisplay)
  } else if (!tune.tabDisplay) {
    tune.tabDisplay = 'both'
  }
  return tune
}

/** Apply tablature instrument + tuning preset to a tune (mutates tune). */
export function applyTablatureSelection(tune, instrumentId, presetId, tabDisplay, tuningText) {
  if (!tune) return tune
  const normalized = normalizeTablatureInstrument(instrumentId)
  if (!normalized) {
    tune.tablature = ''
    tune.tuning = ''
    tune.tablatureVoices = null
    tune.tabDisplay = ''
    return tune
  }
  tune.tablatureVoices = null
  tune.tablature = normalized
  const resolved = resolveVoiceTuningSelection(normalized, tuningText, presetId)
  const preset = resolveVoiceTabPreset(normalized, resolved.presetId, tune, resolved.tuningText)
  tune.tuning = resolved.tuningText || (preset ? canonicalTuningLabel(preset) : '')
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
