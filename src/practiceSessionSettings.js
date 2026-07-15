import {
  normalizeVocalNoteName,
  resolveVocalRange,
} from './practiceInstrumentProfiles'

export const PRACTICE_SETTINGS_STORAGE_KEY = 'bookstorage_practice_settings'

export const PRACTICE_INSTRUMENTS = [
  { id: 'violin', label: 'Violin' },
  { id: 'viola', label: 'Viola' },
  { id: 'cello', label: 'Cello' },
  { id: 'mandolin', label: 'Mandolin' },
  { id: 'flute', label: 'Flute' },
  { id: 'piano', label: 'Piano' },
  { id: 'guitar', label: 'Guitar' },
  { id: 'banjo', label: 'Banjo - 5 string open G' },
  { id: 'voice', label: 'Voice' },
]

export const DEFAULT_PRACTICE_SETTINGS = {
  instrument: 'mandolin',
  totalMinutes: 10,
  includeWarmups: true,
  skillLevel: 5,
  accuracyCheckingEnabled: false,
  // Mid quiet-reference: room to turn down; slider max is PRACTICE_REFERENCE_GAIN_MAX.
  practiceReferenceGain: 0.12,
  recentInstruments: [],
  vocalRangeLow: '',
  vocalRangeHigh: '',
}

/** Cap for accuracy-mode reference notes (slider full = this, not unity). */
export const PRACTICE_REFERENCE_GAIN_MAX = 0.35

const DURATION_OPTIONS = [5, 10, 20]
const PRACTICE_INSTRUMENT_IDS = PRACTICE_INSTRUMENTS.map(function(item) { return item.id })
const MAX_RECENT_INSTRUMENTS = 3

function clampSkillLevel(value) {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return DEFAULT_PRACTICE_SETTINGS.skillLevel
  return Math.max(1, Math.min(10, n))
}

function normalizeDuration(value) {
  const n = parseInt(value, 10)
  if (DURATION_OPTIONS.indexOf(n) !== -1) return n
  return DEFAULT_PRACTICE_SETTINGS.totalMinutes
}

const LEGACY_PRACTICE_INSTRUMENTS = {
  fiddle: 'violin',
}

export function normalizePracticeInstrument(value) {
  let id = value != null ? String(value).trim().toLowerCase() : ''
  if (LEGACY_PRACTICE_INSTRUMENTS[id]) {
    id = LEGACY_PRACTICE_INSTRUMENTS[id]
  }
  if (PRACTICE_INSTRUMENT_IDS.indexOf(id) !== -1) return id
  return DEFAULT_PRACTICE_SETTINGS.instrument
}

export function normalizeSuitableInstruments(values) {
  if (!Array.isArray(values)) return []
  const seen = {}
  const normalized = []
  values.forEach(function(value) {
    const id = normalizePracticeInstrument(value)
    if (seen[id]) return
    seen[id] = true
    normalized.push(id)
  })
  return normalized
}

export function tuneMatchesPracticeInstrument(tune, instrumentId) {
  const suitable = normalizeSuitableInstruments(tune && tune.suitableFor)
  if (suitable.length === 0) return true
  const target = normalizePracticeInstrument(instrumentId)
  return suitable.indexOf(target) !== -1
}

export function getPracticeInstrumentLabel(instrumentId) {
  const id = normalizePracticeInstrument(instrumentId)
  const match = PRACTICE_INSTRUMENTS.find(function(item) { return item.id === id })
  return match ? match.label : id
}

/**
 * Keep up to 3 unique recent instrument ids (most-recent first), excluding current.
 */
export function normalizeRecentInstruments(values, currentInstrument) {
  const current = normalizePracticeInstrument(currentInstrument)
  const seen = {}
  const out = []
  const list = Array.isArray(values) ? values : []
  list.forEach(function(value) {
    if (out.length >= MAX_RECENT_INSTRUMENTS) return
    const id = String(value || '').trim().toLowerCase()
    const mapped = LEGACY_PRACTICE_INSTRUMENTS[id] || id
    if (PRACTICE_INSTRUMENT_IDS.indexOf(mapped) === -1) return
    if (mapped === current) return
    if (seen[mapped]) return
    seen[mapped] = true
    out.push(mapped)
  })
  return out
}

/**
 * When switching from previousInstrument to next, push previous onto recent list.
 */
export function pushRecentInstrument(recentList, previousInstrument, nextInstrument) {
  const next = normalizePracticeInstrument(nextInstrument)
  const prev = previousInstrument != null
    ? String(previousInstrument).trim().toLowerCase()
    : ''
  const mappedPrev = LEGACY_PRACTICE_INSTRUMENTS[prev] || prev
  let nextRecent = Array.isArray(recentList) ? recentList.slice() : []
  if (mappedPrev && PRACTICE_INSTRUMENT_IDS.indexOf(mappedPrev) !== -1 && mappedPrev !== next) {
    nextRecent = [mappedPrev].concat(nextRecent)
  }
  return normalizeRecentInstruments(nextRecent, next)
}

export function clampReferenceGain(value) {
  const n = parseFloat(value)
  if (!Number.isFinite(n)) return DEFAULT_PRACTICE_SETTINGS.practiceReferenceGain
  return Math.max(0, Math.min(PRACTICE_REFERENCE_GAIN_MAX, n))
}

/**
 * Squared slider mapping: finer control at quiet end, softer top.
 * gain = max * (percent/100)^2
 */
export function referenceGainToSliderPercent(gain) {
  const capped = clampReferenceGain(gain)
  const ratio = PRACTICE_REFERENCE_GAIN_MAX > 0 ? capped / PRACTICE_REFERENCE_GAIN_MAX : 0
  return Math.round(Math.sqrt(Math.max(0, Math.min(1, ratio))) * 100)
}

export function sliderPercentToReferenceGain(percent) {
  const t = Math.max(0, Math.min(100, parseFloat(percent) || 0)) / 100
  return clampReferenceGain(PRACTICE_REFERENCE_GAIN_MAX * t * t)
}

export { resolveVocalRange, normalizeVocalNoteName }

export function loadPracticeSettings() {
  try {
    const raw = localStorage.getItem(PRACTICE_SETTINGS_STORAGE_KEY)
    if (!raw) return Object.assign({}, DEFAULT_PRACTICE_SETTINGS)
    const parsed = JSON.parse(raw)
    const instrument = normalizePracticeInstrument(parsed.instrument)
    return {
      instrument: instrument,
      totalMinutes: normalizeDuration(parsed.totalMinutes),
      includeWarmups: parsed.includeWarmups !== false,
      skillLevel: clampSkillLevel(parsed.skillLevel),
      accuracyCheckingEnabled: parsed.accuracyCheckingEnabled === true,
      practiceReferenceGain: clampReferenceGain(parsed.practiceReferenceGain),
      recentInstruments: normalizeRecentInstruments(parsed.recentInstruments, instrument),
      vocalRangeLow: normalizeVocalNoteName(parsed.vocalRangeLow),
      vocalRangeHigh: normalizeVocalNoteName(parsed.vocalRangeHigh),
    }
  } catch (e) {
    return Object.assign({}, DEFAULT_PRACTICE_SETTINGS)
  }
}

export function savePracticeSettings(settings) {
  const instrument = normalizePracticeInstrument(settings && settings.instrument)
  const next = {
    instrument: instrument,
    totalMinutes: normalizeDuration(settings && settings.totalMinutes),
    includeWarmups: settings && settings.includeWarmups !== false,
    skillLevel: clampSkillLevel(settings && settings.skillLevel),
    accuracyCheckingEnabled: settings && settings.accuracyCheckingEnabled === true,
    practiceReferenceGain: clampReferenceGain(
      settings && settings.practiceReferenceGain
    ),
    recentInstruments: normalizeRecentInstruments(
      settings && settings.recentInstruments,
      instrument
    ),
    vocalRangeLow: normalizeVocalNoteName(settings && settings.vocalRangeLow),
    vocalRangeHigh: normalizeVocalNoteName(settings && settings.vocalRangeHigh),
  }
  try {
    localStorage.setItem(PRACTICE_SETTINGS_STORAGE_KEY, JSON.stringify(next))
  } catch (e) {
    // ignore quota errors
  }
  return next
}

/** Merge partial updates onto stored settings so toggles are not wiped. */
export function mergePracticeSettings(partial) {
  const current = loadPracticeSettings()
  const patch = partial || {}
  const next = Object.assign({}, current)
  Object.keys(patch).forEach(function(key) {
    if (patch[key] !== undefined) next[key] = patch[key]
  })
  return savePracticeSettings(next)
}

/**
 * Lowest starting tempo for the easiest practice sessions (skill 1).
 */
export const PRACTICE_MIN_TEMPO = 0.35

/** Tempo start/end multipliers per skill level (1 = easiest … 10 = full speed). */
const SKILL_TEMPO_RANGES = [
  { tempoStart: 0.35, tempoEnd: 0.50 }, // skill 1
  { tempoStart: 0.40, tempoEnd: 0.55 },
  { tempoStart: 0.40, tempoEnd: 0.60 },
  { tempoStart: 0.40, tempoEnd: 0.65 },
  { tempoStart: 0.50, tempoEnd: 0.70 },
  { tempoStart: 0.50, tempoEnd: 0.75 },
  { tempoStart: 0.55, tempoEnd: 0.80 },
  { tempoStart: 0.55, tempoEnd: 0.85 },
  { tempoStart: 0.80, tempoEnd: 0.95 },
  { tempoStart: 1.00, tempoEnd: 1.00 }, // skill 10
]

/**
 * Tune tempo range for a skill level (1 = easiest … 10 = full speed).
 */
export function getSkillTempoRange(skillLevel) {
  const skill = clampSkillLevel(skillLevel)
  return Object.assign({}, SKILL_TEMPO_RANGES[skill - 1])
}

export function getWarmupOptionsForSkill(skillLevel, baseOptions) {
  const skill = clampSkillLevel(skillLevel)
  const opts = baseOptions || {}
  const instrument = normalizePracticeInstrument(opts.instrument)
  const isVoice = instrument === 'voice'
  const tempo = isVoice
    ? 52 + skill * 3
    : 70 + skill * 4
  const noteLength = isVoice
    ? '1/4'
    : (skill <= 4 ? '1/4' : '1/8')
  return Object.assign({}, opts, {
    skillLevel: skill,
    instrument: instrument,
    tempo: tempo,
    noteLength: noteLength,
  })
}

export { DURATION_OPTIONS, clampSkillLevel }
