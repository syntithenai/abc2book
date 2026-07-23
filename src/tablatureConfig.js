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
  if (!isTablatureEnabled(tune)) return false
  return getActiveTablatureVoiceKeys(tune).length > 0
}

export function isTablatureEnabled(tune) {
  if (!tune) return false
  if (tune.tablatureEnabled === false) return false
  return true
}

/** Hide tablature while keeping saved instrument/tuning settings. */
export function disableTablature(tune) {
  if (!tune) return tune
  if (!Object.keys(getTablatureVoices(tune)).length) {
    const legacy = getLegacyTablatureSelection(tune)
    if (legacy.instrumentId) {
      const resolved = resolveVoiceTuningSelection(
        legacy.instrumentId,
        tune.tuning,
        legacy.presetId
      )
      tune.tablatureVoices = {
        '1': {
          instrumentId: legacy.instrumentId,
          presetId: resolved.presetId,
          tuning: resolved.tuningText,
        },
      }
    }
  }
  tune.tablatureEnabled = false
  tune.tablature = ''
  return tune
}

export function enableTablature(tune) {
  if (!tune) return tune
  tune.tablatureEnabled = true
  const voices = getTablatureVoices(tune)
  if (Object.keys(voices).length) {
    syncLegacyTablatureFields(tune, voices)
  }
  return tune
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
  const tuneVoiceKeys = getTuneVoiceKeys(tune)
  const storedKeys = sortVoiceKeys(Object.keys(stored)).filter(function(voiceKey) {
    return !tuneVoiceKeys.length || tuneVoiceKeys.indexOf(voiceKey) >= 0
  })
  if (storedKeys.length) return storedKeys

  const legacy = getLegacyTablatureSelection(tune)
  if (!legacy.instrumentId) return []

  if (!tuneVoiceKeys.length) return ['1']

  return tuneVoiceKeys.filter(function(voiceKey) {
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
      enabled: isTablatureEnabled(tune),
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
        enabled: isTablatureEnabled(tune),
        instrumentId: storedEntry.instrumentId,
        presetId: storedEntry.presetId,
        tuningText: tuningLabelForVoiceEntry(storedEntry, storedEntry.instrumentId, tune),
      }
    }
    if (!hasStored && legacy.instrumentId && voiceNoteLinesHaveMelody(tune.voices[voiceKey] && tune.voices[voiceKey].notes)) {
      return {
        voiceKey: voiceKey,
        enabled: isTablatureEnabled(tune),
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
  if (!isTablatureEnabled(tune)) return ''
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
 *
 * renderContext:
 *   sourceTune — full tune with original voice keys (before display filtering)
 *   voiceKeys — ordered original voice keys matching the rendered ABC staves
 */
export function buildTablatureRenderOptions(tune, renderContext) {
  const ctx = renderContext || {}
  const sourceTune = ctx.sourceTune || tune
  if (!shouldRenderTablature(sourceTune)) return null

  const renderedVoiceKeys = getTuneVoiceKeys(tune)
  const stored = getTablatureVoices(sourceTune)
  const storedKeys = Object.keys(stored)

  if (storedKeys.length) {
    const options = []
    for (let index = 0; index < renderedVoiceKeys.length; index++) {
      const voiceKey = renderedVoiceKeys[index]
      const entry = voiceKey ? stored[voiceKey] : null
      if (!entry) {
        options.push({ instrument: '' })
        continue
      }
      const cfg = buildAbcjsTablatureConfigForSelection(
        entry.instrumentId,
        entry.presetId,
        sourceTune,
        entry.tuning
      )
      options.push(cfg || { instrument: '' })
    }
    return options.some(function(opt) { return opt.instrument }) ? options : null
  }

  const baseCfg = buildAbcjsTablatureConfig(sourceTune)
  if (!baseCfg) return null

  if (!getTuneVoiceKeys(sourceTune).length && !renderedVoiceKeys.length) {
    return [baseCfg]
  }

  const voiceKeys = renderedVoiceKeys.length ? renderedVoiceKeys : ['1']
  if (!voiceKeys.length) return [baseCfg]

  const options = voiceKeys.map(function(voiceKey) {
    const notes = sourceTune.voices && sourceTune.voices[voiceKey]
      ? sourceTune.voices[voiceKey].notes
      : null
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

/** abcjs tab placement requires strictly ascending open-string pitches (no duplicates). */
function openStringPitchesAreValid(strings) {
  if (!Array.isArray(strings) || !strings.length) return false
  let prev = null
  for (let i = 0; i < strings.length; i++) {
    const midi = pitchToMidi(strings[i])
    if (midi == null) return false
    if (prev != null && midi <= prev) return false
    prev = midi
  }
  return true
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

const TAB_STRING_COUNTS = {
  guitar: 6,
  violin: 4,
  uke: 4,
  banjo4: 4,
  banjo5: 5,
  bouzouki: 4,
}

const TAB_OCTAVE_TEMPLATES = {
  guitar: [2, 2, 3, 3, 3, 4],
  violin: [3, 4, 4, 5],
  uke: [4, 4, 4, 4],
  banjo4: [3, 3, 4, 4],
  banjo5: [3, 3, 3, 3, 4],
  bouzouki: [2, 3, 3, 4],
}

function expectedStringCountForInstrument(instrumentId) {
  const id = normalizeTablatureInstrument(instrumentId)
  return TAB_STRING_COUNTS[id] || 0
}

function parseTuningNoteToken(token) {
  const match = String(token || '').trim().match(/^([A-Ga-g])(#{1,2}|b)?(\d+)?$/)
  if (!match) return null
  return {
    letter: match[1].toUpperCase(),
    accidental: match[2] === 'b' ? 'b' : (match[2] ? '#' : ''),
    octave: match[3] ? parseInt(match[3], 10) : null,
  }
}

function tokenizeTuningText(text) {
  const norm = String(text || '').trim()
  if (!norm) return []

  if (/[\s,;|/+\-]+/.test(norm)) {
    return norm.split(/[\s,;|/+\-]+/).map(parseTuningNoteToken).filter(Boolean)
  }

  const tokens = []
  let index = 0
  while (index < norm.length) {
    const match = norm.slice(index).match(/^([A-Ga-g])(#{1,2}|b)?(\d+)?/)
    if (!match) break
    tokens.push({
      letter: match[1].toUpperCase(),
      accidental: match[2] === 'b' ? 'b' : (match[2] ? '#' : ''),
      octave: match[3] ? parseInt(match[3], 10) : null,
    })
    index += match[0].length
  }
  return tokens
}

function pitchStringFromTuningToken(token, octave) {
  const oct = token.octave != null ? token.octave : octave
  return token.letter + (token.accidental || '') + oct
}

/** Parse user-entered tuning text into scientific pitch strings when no preset matches. */
export function parseCustomTuningToStrings(text, instrumentId) {
  const normalized = normalizeTablatureInstrument(instrumentId)
  if (!normalized || !text) return null

  const fromPreset = resolvePresetFromTextForInstrument(text, normalized)
  if (fromPreset && fromPreset.strings) return fromPreset.strings.slice()

  const expectedCount = expectedStringCountForInstrument(normalized)
  const tokens = tokenizeTuningText(text)
  if (!expectedCount || tokens.length !== expectedCount) return null

  const template = TAB_OCTAVE_TEMPLATES[normalized] || TAB_OCTAVE_TEMPLATES.guitar
  return tokens.map(function(token, index) {
    return pitchStringFromTuningToken(token, template[index])
  })
}

export function resolveVoiceTabPreset(instrumentId, presetId, tune, tuningText) {
  const normalized = normalizeTablatureInstrument(instrumentId)
  if (!normalized || !isSupportedTablatureInstrument(normalized)) return null

  const text = String(tuningText || '').trim()
  if (text) {
    const fromText = resolvePresetFromTextForInstrument(text, normalized)
    if (fromText) return fromText
    return null
  }

  if (presetId) {
    const preset = getPreset(normalized, presetId)
    if (preset) return preset
  }

  return resolveTuningPresetForTab(normalized, tune)
}

function tuningFormatExample(instrumentId) {
  const examples = {
    guitar: 'E A D G B E',
    violin: 'G D A E',
    uke: 'G C E A',
    banjo4: 'G D G B',
    banjo5: 'G D G B D',
    bouzouki: 'G D A D',
  }
  return examples[normalizeTablatureInstrument(instrumentId)] || 'low to high'
}

function orderOpenStringsForInstrument(instrumentId, strings) {
  const list = strings.slice()
  const normalized = normalizeTablatureInstrument(instrumentId)
  if (normalized === 'banjo5' || normalized === 'uke') {
    return sortStringsAscending(list)
  }
  return list
}

/** User-facing validation for tablature tuning text in settings forms. */
export function getTablatureTuningValidation(instrumentId, tuningText, presetId) {
  const normalized = normalizeTablatureInstrument(instrumentId)
  if (!normalized || !isSupportedTablatureInstrument(normalized)) {
    return { valid: true, message: '' }
  }

  const text = String(tuningText || '').trim()
  if (!text) {
    return { valid: false, message: 'Enter a tuning.' }
  }

  const preset = resolveVoiceTabPreset(normalized, presetId, null, tuningText)
  let strings = preset && preset.strings ? preset.strings.slice() : []
  if (!strings.length) {
    strings = parseCustomTuningToStrings(text, normalized) || []
    if (!strings.length) {
      const expected = expectedStringCountForInstrument(normalized)
      return {
        valid: false,
        message: 'Enter ' + expected + ' note names from low to high (e.g. '
          + tuningFormatExample(normalized) + ').',
      }
    }
  }

  strings = orderOpenStringsForInstrument(normalized, strings)
  if (!openStringPitchesAreValid(strings)) {
    return {
      valid: false,
      message: 'Each string must be higher than the one below it. Repeating the same note (e.g. FFFFFF) is not valid.',
    }
  }

  return { valid: true, message: '' }
}

function isAbcjsTuningToken(token) {
  return /^[\^_]?[A-Ga-g][,_']*$/.test(String(token || '').trim())
}

function abcTuningTokensAreValid(tokens, instrumentId) {
  const expected = expectedStringCountForInstrument(instrumentId)
  if (!Array.isArray(tokens) || tokens.length !== expected) return false
  return tokens.every(isAbcjsTuningToken)
}

export function buildAbcjsTablatureConfigForSelection(instrumentId, presetId, tune, tuningText) {
  const normalized = normalizeTablatureInstrument(instrumentId)
  if (!normalized || !isSupportedTablatureInstrument(normalized)) return null

  const abcjsInstrument = ABCJS_INSTRUMENT_MAP[normalized]
  if (!abcjsInstrument) return null

  const text = String(tuningText || '').trim()
  const preset = resolveVoiceTabPreset(normalized, presetId, tune, tuningText)
  let strings = preset && preset.strings ? preset.strings.slice() : []
  if (!strings.length && text) {
    strings = parseCustomTuningToStrings(text, normalized) || []
  }
  if (!strings.length) {
    const fallback = defaultPresetForInstrument(normalized)
    strings = fallback && fallback.strings ? fallback.strings.slice() : []
  }
  if (!strings.length) return null

  strings = orderOpenStringsForInstrument(normalized, strings)

  if (!openStringPitchesAreValid(strings)) {
    const fallback = defaultPresetForInstrument(normalized)
    strings = fallback && fallback.strings ? fallback.strings.slice() : []
    if (!openStringPitchesAreValid(strings)) return null
  }

  const tuning = pitchStringsToAbcTuning(strings, normalized)
  if (!abcTuningTokensAreValid(tuning, normalized)) return null

  return {
    instrument: abcjsInstrument,
    tuning: tuning,
    label: tabLabelForInstrument(normalized),
    capo: Math.max(0, parseInt(tune && tune.capo, 10) || 0),
  }
}

export function buildAbcjsTablatureConfig(tune) {
  const instrumentId = normalizeTablatureInstrument(tune && tune.tablature)
  if (!instrumentId || !isSupportedTablatureInstrument(instrumentId)) return null
  const tuningText = tune && tune.tuning ? String(tune.tuning).trim() : ''
  const matched = tuningText ? resolvePresetFromTextForInstrument(tuningText, instrumentId) : null
  const presetId = matched ? matched.id : ''
  return buildAbcjsTablatureConfigForSelection(instrumentId, presetId, tune, tuningText)
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
    return disableTablature(tune)
  }

  tune.tablatureEnabled = true
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
    return disableTablature(tune)
  }
  tune.tablatureEnabled = true
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
