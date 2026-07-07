import { parseKeySignatureForTests } from './melodyPitchSpelling'
import { selectWarmupsForSession } from './practiceWarmupGenerator'
import {
  getSkillTempoRange,
  getWarmupOptionsForSkill,
  normalizePracticeInstrument,
  tuneMatchesPracticeInstrument,
} from './practiceSessionSettings'
import { getRecentTunes } from './recentTunes'
import { filterOutRecentlyPracticedTunes } from './practiceRecentHistory'
import { tuneHasLyrics } from './practiceTuneViewUtils'

const WARMUP_SECONDS_EACH = 30
const DEFAULT_TUNE_SECONDS = 120
const MAX_WARMUP_FRACTION = 0.2
const MAX_WARMUP_MINUTES = 2
const RECENT_TUNES_FOR_PRACTICE_FILTER = 5
const MIN_PRACTICE_CONFIDENCE = 3

const ROOT_PITCH_CLASS = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
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

export function getTuneConfidence(tune) {
  const value = parseInt(tune && tune.boost, 10)
  return Number.isFinite(value) ? value : 0
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

/** Voice practice: lyrics required. Other instruments: melody notes in ABC (not chord-only). */
export function isSuitableForPractice(tune) {
  return !!(tune && tune.suitableForPractice !== false)
}

export function tuneMatchesPracticeContent(tune, instrument, helpers) {
  const inst = normalizePracticeInstrument(instrument)
  if (inst === 'voice') {
    return tuneHasLyrics(tune)
  }
  if (helpers.hasNotes && helpers.hasNotes(tune)) {
    return true
  }
  return false
}

function normalizeBookName(name) {
  return name != null ? String(name).trim().toLowerCase() : ''
}

function normalizeTagName(name) {
  return name != null ? String(name).trim() : ''
}

export function derivePracticeContextFromRecentTunes(tunes, limit) {
  const recent = getRecentTunes(tunes, limit != null ? limit : RECENT_TUNES_FOR_PRACTICE_FILTER)
  const recentBooks = []
  const recentTags = []
  const seenBooks = {}
  const seenTags = {}

  recent.forEach(function(tune) {
    ;(tune && Array.isArray(tune.books) ? tune.books : []).forEach(function(book) {
      const normalized = normalizeBookName(book)
      if (!normalized || seenBooks[normalized]) return
      seenBooks[normalized] = true
      recentBooks.push(String(book).trim())
    })
    ;(tune && Array.isArray(tune.tags) ? tune.tags : []).forEach(function(tag) {
      const normalized = normalizeTagName(tag)
      if (!normalized || seenTags[normalized]) return
      seenTags[normalized] = true
      recentTags.push(normalized)
    })
  })

  return { recentBooks, recentTags }
}

export function tuneMatchesRecentPracticeContext(tune, recentBooks, recentTags) {
  if ((!recentBooks || recentBooks.length === 0) && (!recentTags || recentTags.length === 0)) {
    return true
  }
  const tuneBooks = tune && Array.isArray(tune.books) ? tune.books : []
  for (let i = 0; i < tuneBooks.length; i++) {
    const book = tuneBooks[i]
    if (!book) continue
    for (let j = 0; j < (recentBooks || []).length; j++) {
      if (normalizeBookName(book) === normalizeBookName(recentBooks[j])) {
        return true
      }
    }
  }
  const tuneTags = tune && Array.isArray(tune.tags) ? tune.tags : []
  for (let i = 0; i < tuneTags.length; i++) {
    const tag = tuneTags[i]
    if (!tag) continue
    for (let j = 0; j < (recentTags || []).length; j++) {
      if (normalizeTagName(tag) === normalizeTagName(recentTags[j])) {
        return true
      }
    }
  }
  return false
}

function sortByIncreasingConfidence(candidates) {
  return candidates.slice().sort(function(a, b) {
    const diff = getTuneConfidence(a) - getTuneConfidence(b)
    if (diff !== 0) return diff
    const aName = a && a.name ? String(a.name) : ''
    const bName = b && b.name ? String(b.name) : ''
    return aName.localeCompare(bName)
  })
}

export function orderPracticeCandidates(candidates, options) {
  const opts = options || {}
  const instrument = normalizePracticeInstrument(opts.instrument)
  const minConfidence = opts.minConfidence != null ? opts.minConfidence : MIN_PRACTICE_CONFIDENCE
  const minCount = opts.minCount != null ? opts.minCount : 1
  const pool = Array.isArray(candidates) ? candidates : []

  function withInstrument(list) {
    return list.filter(function(tune) { return tuneMatchesPracticeInstrument(tune, instrument) })
  }

  function withMinConfidence(list) {
    return list.filter(function(tune) { return getTuneConfidence(tune) >= minConfidence })
  }

  function excludingRecentlyPracticed(list) {
    return filterOutRecentlyPracticedTunes(list, {
      now: opts.now,
      cooldownMs: opts.cooldownMs,
      recentPracticeHistory: opts.recentPracticeHistory,
    })
  }

  const attempts = [
    sortByIncreasingConfidence(withMinConfidence(withInstrument(excludingRecentlyPracticed(pool)))),
    sortByIncreasingConfidence(withInstrument(excludingRecentlyPracticed(pool))),
    sortByIncreasingConfidence(withMinConfidence(excludingRecentlyPracticed(pool))),
    sortByIncreasingConfidence(excludingRecentlyPracticed(pool)),
    sortByIncreasingConfidence(withMinConfidence(withInstrument(pool))),
    sortByIncreasingConfidence(withInstrument(pool)),
    sortByIncreasingConfidence(withMinConfidence(pool)),
    sortByIncreasingConfidence(pool),
  ]

  for (let i = 0; i < attempts.length; i++) {
    if (attempts[i].length >= minCount) {
      return attempts[i]
    }
  }
  return attempts[attempts.length - 1]
}

export function collectPracticeCandidates(tunes, filters, helpers, selectionOptions) {
  const bookFilter = filters && filters.bookFilter ? String(filters.bookFilter).trim() : ''
  const tagFilter = (filters && Array.isArray(filters.tagFilter) ? filters.tagFilter : [])
    .filter(function(t) { return t && String(t).trim().length > 0 })
  const hasExplicitFilters = bookFilter.length > 0 || tagFilter.length > 0
  const recentContext = derivePracticeContextFromRecentTunes(tunes, RECENT_TUNES_FOR_PRACTICE_FILTER)

  const instrument = normalizePracticeInstrument(selectionOptions && selectionOptions.instrument)

  let candidates = Object.values(tunes || {}).filter(function(tune) {
    if (!isPlayableTune(tune, helpers)) return false
    if (!isSuitableForPractice(tune)) return false
    if (!tuneMatchesPracticeContent(tune, instrument, helpers)) return false
    if (hasExplicitFilters) {
      return helpers.filterSearch(tune, '', bookFilter, tagFilter)
    }
    return tuneMatchesRecentPracticeContext(
      tune,
      recentContext.recentBooks,
      recentContext.recentTags
    )
  })

  return orderPracticeCandidates(candidates, selectionOptions || {})
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
  const instrument = normalizePracticeInstrument(opts.instrument || 'mandolin')
  const tempoRange = getSkillTempoRange(skillLevel)
  const warmupGenOptions = getWarmupOptionsForSkill(skillLevel, { instrument: instrument })
  const tunes = opts.tunes || {}
  const helpers = opts.helpers || {}
  const filters = opts.filters || {}

  const candidates = collectPracticeCandidates(tunes, filters, helpers, {
    instrument: instrument,
    minConfidence: MIN_PRACTICE_CONFIDENCE,
    minCount: 1,
  })
  const bookFilter = filters && filters.bookFilter ? String(filters.bookFilter).trim() : ''
  const tagFilter = (filters && Array.isArray(filters.tagFilter) ? filters.tagFilter : [])
    .filter(function(t) { return t && String(t).trim().length > 0 })
  const hasExplicitFilters = bookFilter.length > 0 || tagFilter.length > 0
  if (candidates.length === 0) {
    const recentContext = derivePracticeContextFromRecentTunes(tunes, RECENT_TUNES_FOR_PRACTICE_FILTER)
    const hasRecentContext = recentContext.recentBooks.length > 0 || recentContext.recentTags.length > 0
    return {
      error: hasExplicitFilters
        ? 'No playable tunes match your filters.'
        : (hasRecentContext
          ? 'No playable tunes match your recently viewed books or tags.'
          : (normalizePracticeInstrument(instrument) === 'voice'
            ? 'No tunes with lyrics found for voice practice.'
            : 'No tunes with melody notation found for practice.')),
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
          meter: warmup.meter,
          action: warmup.action,
          estimatedSeconds: WARMUP_SECONDS_EACH,
        })
        warmupMinutes += WARMUP_SECONDS_EACH / 60
      }
    })
  }

  function tempoRangeForTune(tune) {
    // Songs with lyrics stay at full speed so singing along stays natural.
    if (tuneHasLyrics(tune)) {
      return { tempoStart: 1, tempoEnd: 1 }
    }
    return tempoRange
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
    const tempos = tempoRangeForTune(tune)
    steps.push({
      type: 'tune',
      tuneId: tune.id,
      tuneName: tune.name || tune.id,
      route: routeInfo.route,
      linkIndex: routeInfo.linkIndex,
      pitchOffset: pitchOffsetToPracticeKey(tuneKey, practiceKey),
      tempoStart: tempos.tempoStart,
      tempoEnd: tempos.tempoEnd,
      estimatedSeconds: duration,
    })
    tuneSecondsUsed += duration
  })

  if (!steps.some(function(s) { return s.type === 'tune' })) {
    const first = orderedTunes[0]
    const routeInfo = selectRouteForTune(first, helpers)
    if (routeInfo) {
      const tempos = tempoRangeForTune(first)
      steps.push({
        type: 'tune',
        tuneId: first.id,
        tuneName: first.name || first.id,
        route: routeInfo.route,
        linkIndex: routeInfo.linkIndex,
        pitchOffset: pitchOffsetToPracticeKey(getTuneKey(first), practiceKey),
        tempoStart: tempos.tempoStart,
        tempoEnd: tempos.tempoEnd,
        estimatedSeconds: estimateTuneDurationSeconds(first, routeInfo.route),
      })
    }
  }

  return {
    practiceKey,
    instrument,
    totalMinutes,
    skillLevel,
    warmupMinutes: Math.round(warmupMinutes * 10) / 10,
    steps,
    tuneCount: steps.filter(function(s) { return s.type === 'tune' }).length,
  }
}
