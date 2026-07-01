export const PRACTICE_SETTINGS_STORAGE_KEY = 'bookstorage_practice_settings'

export const DEFAULT_PRACTICE_SETTINGS = {
  totalMinutes: 10,
  includeWarmups: true,
  skillLevel: 5,
}

const DURATION_OPTIONS = [5, 10, 20]

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

export function loadPracticeSettings() {
  try {
    const raw = localStorage.getItem(PRACTICE_SETTINGS_STORAGE_KEY)
    if (!raw) return Object.assign({}, DEFAULT_PRACTICE_SETTINGS)
    const parsed = JSON.parse(raw)
    return {
      totalMinutes: normalizeDuration(parsed.totalMinutes),
      includeWarmups: parsed.includeWarmups !== false,
      skillLevel: clampSkillLevel(parsed.skillLevel),
    }
  } catch (e) {
    return Object.assign({}, DEFAULT_PRACTICE_SETTINGS)
  }
}

export function savePracticeSettings(settings) {
  const next = {
    totalMinutes: normalizeDuration(settings && settings.totalMinutes),
    includeWarmups: settings && settings.includeWarmups !== false,
    skillLevel: clampSkillLevel(settings && settings.skillLevel),
  }
  try {
    localStorage.setItem(PRACTICE_SETTINGS_STORAGE_KEY, JSON.stringify(next))
  } catch (e) {
    // ignore quota errors
  }
  return next
}

/**
 * Tune tempo range for a skill level (1 = easiest … 10 = full speed).
 * Skill 1: 50% throughout. Skill 2: 50% → 80%. Skill 10: 100% throughout.
 */
export function getSkillTempoRange(skillLevel) {
  const skill = clampSkillLevel(skillLevel)
  if (skill === 1) {
    return { tempoStart: 0.5, tempoEnd: 0.5 }
  }
  if (skill === 10) {
    return { tempoStart: 1.0, tempoEnd: 1.0 }
  }
  const tempoStart = skill <= 2 ? 0.5 : 0.5 + (skill - 2) / 8 * 0.5
  const tempoEnd = skill <= 2
    ? 0.5 + (skill - 1) * 0.3
    : 0.8 + (skill - 2) / 8 * 0.2
  return { tempoStart, tempoEnd }
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
