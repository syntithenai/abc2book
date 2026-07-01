import { parseKeySignatureForTests } from './melodyPitchSpelling'
import { selectWarmupsForSession } from './practiceWarmupGenerator'
import { getSkillTempoRange, getWarmupOptionsForSkill } from './practiceSessionSettings'

const WARMUP_SECONDS_EACH = 45
const DEFAULT_TUNE_SECONDS = 120
const MAX_WARMUP_FRACTION = 0.2
const MAX_WARMUP_MINUTES = 2

const ROOT_PITCH_CLASS = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
}

function shuffleArray(array) {
  const copy = array.slice()
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = copy[i]
    copy[i] = copy[j]
    copy[j] = tmp
  }
  return copy
}

export function normalizePracticeKey(key) {
  const info = parseKeySignatureForTests(key)
  if (!info) return ''
  return info.root + (info.mode === 'minor' ? 'm' : '')
}

export function getTuneKey(tune) {
  if (!tune) return ''
  if (tune.key && String(tune.key).trim()) return String(tune.key).trim()
  if (tune.timedMelody && tune.timedMelody.detectedKey) {
    return String(tune.timedMelody.detectedKey).trim()
  }
  if (tune.timedMelody && tune.timedMelody.key) {
    return String(tune.timedMelody.key).trim()
  }
  return ''
}

export function pickPracticeKey(candidates) {
  const counts = {}
  candidates.forEach(function(tune) {
    const normalized = normalizePracticeKey(getTuneKey(tune))
    if (!normalized) return
    counts[normalized] = (counts[normalized] || 0) + 1
  })
  let best = 'C'
  let bestCount = 0
  Object.keys(counts).forEach(function(key) {
    if (counts[key] > bestCount) {
      best = key
      bestCount = counts[key]
    }
  })
  return best
}

function pitchClassForKey(key) {
  const info = parseKeySignatureForTests(key)
  if (!info) return 0
  return ROOT_PITCH_CLASS[info.root] != null ? ROOT_PITCH_CLASS[info.root] : 0
}

export function pitchOffsetToPracticeKey(tuneKey, practiceKey) {
  const tuneNorm = normalizePracticeKey(tuneKey)
  const practiceNorm = normalizePracticeKey(practiceKey)
  if (!tuneNorm || !practiceNorm || tuneNorm === practiceNorm) return 0
  let diff = pitchClassForKey(practiceKey) - pitchClassForKey(tuneKey)
  while (diff > 6) diff -= 12
  while (diff < -6) diff += 12
  return diff
}

export function isPlayableTune(tune, helpers) {
  if (!tune || !tune.id) return false
  return helpers.hasLinks(tune) || helpers.hasNotesOrChords(tune)
}

export function collectPracticeCandidates(tunes, filters, helpers) {
  const bookFilter = filters && filters.bookFilter ? String(filters.bookFilter).trim() : ''
  const tagFilter = (filters && Array.isArray(filters.tagFilter) ? filters.tagFilter : [])
    .filter(function(t) { return t && String(t).trim().length > 0 })
  const hasBook = bookFilter.length > 0
  const hasTags = tagFilter.length > 0

  let candidates = Object.values(tunes || {}).filter(function(tune) {
    if (!isPlayableTune(tune, helpers)) return false
    if (!hasBook && !hasTags) return true
    return helpers.filterSearch(tune, '', bookFilter, tagFilter)
  })

  candidates = shuffleArray(candidates)
  candidates.sort(function(a, b) {
    const aBoost = a && a.boost ? a.boost : 0
    const bBoost = b && b.boost ? b.boost : 0
    return aBoost > bBoost ? 1 : -1
  })
  return candidates
}

export function selectRouteForTune(tune, helpers) {
  if (helpers.hasLinks(tune)) {
    return { route: 'media', linkIndex: 0 }
  }
  if (helpers.hasNotesOrChords(tune)) {
    return { route: 'midi', linkIndex: null }
  }
  return null
}

function parseRegionSeconds(value) {
  const n = parseFloat(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function estimateTuneDurationSeconds(tune, route) {
  if (route === 'media' && tune && Array.isArray(tune.links) && tune.links[0]) {
    const link = tune.links[0]
    const start = parseRegionSeconds(link.startAt)
    const end = parseRegionSeconds(link.endAt)
    if (end > start) return end - start
  }
  if (tune && tune.tempo && tune.tempo > 0) {
    return Math.min(180, Math.max(60, 3600 / tune.tempo))
  }
  return DEFAULT_TUNE_SECONDS
}

function partitionByPracticeKey(candidates, practiceKey) {
  const matching = []
  const other = []
  candidates.forEach(function(tune) {
    if (normalizePracticeKey(getTuneKey(tune)) === normalizePracticeKey(practiceKey)) {
      matching.push(tune)
    } else {
      other.push(tune)
    }
  })
  return { matching, other }
}

function warmupBudgetSeconds(totalMinutes, includeWarmups) {
  if (!includeWarmups) return 0
  const cap = Math.min(totalMinutes * MAX_WARMUP_FRACTION, MAX_WARMUP_MINUTES) * 60
  return Math.round(cap)
}

export function buildPracticeSessionPlan(options) {
  const opts = options || {}
  const totalMinutes = opts.totalMinutes || 10
  const includeWarmups = opts.includeWarmups !== false
  const skillLevel = opts.skillLevel != null ? opts.skillLevel : 5
  const tempoRange = getSkillTempoRange(skillLevel)
  const warmupGenOptions = getWarmupOptionsForSkill(skillLevel, {})
  const tunes = opts.tunes || {}
  const helpers = opts.helpers || {}
  const filters = opts.filters || {}

  const candidates = collectPracticeCandidates(tunes, filters, helpers)
  const bookFilter = filters && filters.bookFilter ? String(filters.bookFilter).trim() : ''
  const tagFilter = (filters && Array.isArray(filters.tagFilter) ? filters.tagFilter : [])
    .filter(function(t) { return t && String(t).trim().length > 0 })
  const hasActiveFilters = bookFilter.length > 0 || tagFilter.length > 0
  if (candidates.length === 0) {
    return {
      error: hasActiveFilters
        ? 'No playable tunes match your filters.'
        : 'No playable tunes found in your tune book.',
      steps: [],
      practiceKey: 'C',
      totalMinutes,
      warmupMinutes: 0,
    }
  }

  const practiceKey = pickPracticeKey(candidates)
  const partitioned = partitionByPracticeKey(candidates, practiceKey)
  const orderedTunes = partitioned.matching.concat(partitioned.other)

  const warmupSeconds = warmupBudgetSeconds(totalMinutes, includeWarmups)
  const totalSeconds = totalMinutes * 60
  const tuneBudgetSeconds = Math.max(0, totalSeconds - warmupSeconds)

  const steps = []
  let warmupMinutes = 0

  if (includeWarmups && warmupSeconds > 0) {
    const maxWarmups = Math.max(1, Math.min(4, Math.floor(warmupSeconds / WARMUP_SECONDS_EACH)))
    const warmups = selectWarmupsForSession(practiceKey, skillLevel, warmupGenOptions, maxWarmups)
    warmups.forEach(function(warmup) {
      if (warmupMinutes * 60 + WARMUP_SECONDS_EACH <= warmupSeconds + 15) {
        steps.push({
          type: 'warmup',
          id: warmup.id,
          title: warmup.title,
          abc: warmup.abc,
          action: warmup.action,
          estimatedSeconds: WARMUP_SECONDS_EACH,
        })
        warmupMinutes += WARMUP_SECONDS_EACH / 60
      }
    })
  }

  let tuneSecondsUsed = 0
  orderedTunes.forEach(function(tune) {
    const routeInfo = selectRouteForTune(tune, helpers)
    if (!routeInfo) return
    const duration = estimateTuneDurationSeconds(tune, routeInfo.route)
    if (tuneSecondsUsed + duration > tuneBudgetSeconds && steps.some(function(s) { return s.type === 'tune' })) {
      return
    }
    const tuneKey = getTuneKey(tune)
    steps.push({
      type: 'tune',
      tuneId: tune.id,
      tuneName: tune.name || tune.id,
      route: routeInfo.route,
      linkIndex: routeInfo.linkIndex,
      pitchOffset: pitchOffsetToPracticeKey(tuneKey, practiceKey),
      tempoStart: tempoRange.tempoStart,
      tempoEnd: tempoRange.tempoEnd,
      estimatedSeconds: duration,
    })
    tuneSecondsUsed += duration
  })

  if (!steps.some(function(s) { return s.type === 'tune' })) {
    const first = orderedTunes[0]
    const routeInfo = selectRouteForTune(first, helpers)
    if (routeInfo) {
      steps.push({
        type: 'tune',
        tuneId: first.id,
        tuneName: first.name || first.id,
        route: routeInfo.route,
        linkIndex: routeInfo.linkIndex,
        pitchOffset: pitchOffsetToPracticeKey(getTuneKey(first), practiceKey),
        tempoStart: tempoRange.tempoStart,
        tempoEnd: tempoRange.tempoEnd,
        estimatedSeconds: estimateTuneDurationSeconds(first, routeInfo.route),
      })
    }
  }

  return {
    practiceKey,
    totalMinutes,
    skillLevel,
    warmupMinutes: Math.round(warmupMinutes * 10) / 10,
    steps,
    tuneCount: steps.filter(function(s) { return s.type === 'tune' }).length,
  }
}
