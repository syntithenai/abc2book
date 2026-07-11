export const PRACTICE_SETTINGS_STORAGE_KEY = 'bookstorage_practice_settings'

export const PRACTICE_INSTRUMENTS = [
  { id: 'violin', label: 'Violin' },
  { id: 'viola', label: 'Viola' },
  { id: 'cello', label: 'Cello' },
  { id: 'mandolin', label: 'Mandolin' },
  { id: 'flute', label: 'Flute' },
  { id: 'piano', label: 'Piano' },
  { id: 'guitar', label: 'Guitar' },
  { id: 'voice', label: 'Voice' },
]

export const DEFAULT_PRACTICE_SETTINGS = {
  instrument: 'mandolin',
  totalMinutes: 10,
  includeWarmups: true,
  skillLevel: 5,
  accuracyCheckingEnabled: false,
  headphoneMode: false,
  practiceReferenceGain: 0.08,
}

const DURATION_OPTIONS = [5, 10, 20]
const PRACTICE_INSTRUMENT_IDS = PRACTICE_INSTRUMENTS.map(function(item) { return item.id })

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

function clampReferenceGain(value) {
  const n = parseFloat(value)
  if (!Number.isFinite(n)) return DEFAULT_PRACTICE_SETTINGS.practiceReferenceGain
  return Math.max(0.05, Math.min(1, n))
}

export function loadPracticeSettings() {
  try {
    const raw = localStorage.getItem(PRACTICE_SETTINGS_STORAGE_KEY)
    if (!raw) return Object.assign({}, DEFAULT_PRACTICE_SETTINGS)
    const parsed = JSON.parse(raw)
    return {
      instrument: normalizePracticeInstrument(parsed.instrument),
      totalMinutes: normalizeDuration(parsed.totalMinutes),
      includeWarmups: parsed.includeWarmups !== false,
      skillLevel: clampSkillLevel(parsed.skillLevel),
      accuracyCheckingEnabled: parsed.accuracyCheckingEnabled === true,
      headphoneMode: parsed.headphoneMode === true,
      practiceReferenceGain: clampReferenceGain(parsed.practiceReferenceGain),
    }
  } catch (e) {
    return Object.assign({}, DEFAULT_PRACTICE_SETTINGS)
  }
}

export function savePracticeSettings(settings) {
  const next = {
    instrument: normalizePracticeInstrument(settings && settings.instrument),
    totalMinutes: normalizeDuration(settings && settings.totalMinutes),
    includeWarmups: settings && settings.includeWarmups !== false,
    skillLevel: clampSkillLevel(settings && settings.skillLevel),
    accuracyCheckingEnabled: settings && settings.accuracyCheckingEnabled === true,
    headphoneMode: settings && settings.headphoneMode === true,
    practiceReferenceGain: clampReferenceGain(
      settings && settings.practiceReferenceGain
    ),
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
  return Object.assign({}, opts, {
    skillLevel: skill,
    tempo: 70 + skill * 4,
    noteLength: skill <= 4 ? '1/4' : '1/8',
  })
}

export { DURATION_OPTIONS, clampSkillLevel }
