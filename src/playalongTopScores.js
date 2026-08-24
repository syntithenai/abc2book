
import { normalizePlayalongTakes, clearPlayalongTakePitchPcts } from './playalongTakes'

export const PLAYALONG_TOP_SCORES_STORAGE_KEY = 'bookstorage_playalong_top_scores'
export const PLAYALONG_TOP_SCORES_MAX = 100
export const PLAYALONG_TOP_SCORES_CHANGED_EVENT = 'playalongTopScoresChanged'

function emptyStore() {
  return { version: 1, scores: [] }
}

export function normalizePlayalongTopScore(raw) {
  if (!raw || typeof raw !== 'object') return null
  const recordingId = raw.recordingId != null ? String(raw.recordingId).trim() : ''
  const pitchPct = Math.round(parseFloat(raw.pitchPct))
  if (!recordingId || !Number.isFinite(pitchPct)) return null
  const clamped = Math.max(0, Math.min(100, pitchPct))
  const createdAt = raw.createdAt ? String(raw.createdAt) : ''
  const title = raw.title != null ? String(raw.title).trim() : ''
  const tuneId = raw.tuneId != null ? String(raw.tuneId).trim() : ''
  return {
    recordingId: recordingId,
    pitchPct: clamped,
    createdAt: createdAt,
    title: title,
    tuneId: tuneId,
  }
}

export function normalizePlayalongTopScores(list) {
  if (!Array.isArray(list)) return []
  const byId = {}
  list.forEach(function(item) {
    const score = normalizePlayalongTopScore(item)
    if (!score) return
    const prev = byId[score.recordingId]
    if (!prev || score.pitchPct > prev.pitchPct) {
      byId[score.recordingId] = score
    } else if (score.pitchPct === prev.pitchPct) {
      // Prefer newer metadata when tied.
      byId[score.recordingId] = Object.assign({}, prev, {
        createdAt: score.createdAt || prev.createdAt,
        title: score.title || prev.title,
        tuneId: score.tuneId || prev.tuneId,
      })
    }
  })
  return Object.keys(byId)
    .map(function(id) { return byId[id] })
    .sort(function(a, b) {
      if (b.pitchPct !== a.pitchPct) return b.pitchPct - a.pitchPct
      const ta = Date.parse(a.createdAt || '') || 0
      const tb = Date.parse(b.createdAt || '') || 0
      return tb - ta
    })
    .slice(0, PLAYALONG_TOP_SCORES_MAX)
}

export function averagePlayalongTopScores(list) {
  const scores = normalizePlayalongTopScores(list)
  if (!scores.length) return null
  const sum = scores.reduce(function(acc, row) { return acc + row.pitchPct }, 0)
  return Math.round(sum / scores.length)
}

/**
 * Collate scores by tune for reporting: min, max, and average per tune.
 */
export function summarizePlayalongScoresByTune(list) {
  const scores = normalizePlayalongTopScores(list)
  const byKey = {}
  scores.forEach(function(row) {
    const key = row.tuneId
      ? ('id:' + row.tuneId)
      : ('title:' + (row.title || 'Untitled'))
    let group = byKey[key]
    if (!group) {
      group = {
        tuneId: row.tuneId,
        title: row.title || 'Untitled',
        min: row.pitchPct,
        max: row.pitchPct,
        sum: row.pitchPct,
        count: 1,
      }
      byKey[key] = group
      return
    }
    if (row.pitchPct < group.min) group.min = row.pitchPct
    if (row.pitchPct > group.max) group.max = row.pitchPct
    group.sum += row.pitchPct
    group.count += 1
    if (!group.title && row.title) group.title = row.title
    if (!group.tuneId && row.tuneId) group.tuneId = row.tuneId
  })
  return Object.keys(byKey)
    .map(function(key) {
      const group = byKey[key]
      return {
        key: key,
        tuneId: group.tuneId || '',
        title: group.title || 'Untitled',
        min: group.min,
        max: group.max,
        average: Math.round(group.sum / group.count),
        count: group.count,
      }
    })
    .sort(function(a, b) {
      if (b.average !== a.average) return b.average - a.average
      return String(a.title || '').localeCompare(String(b.title || ''))
    })
}

export function playalongScoreMatchesTune(score, tuneId, title) {
  const id = tuneId != null ? String(tuneId).trim() : ''
  const name = title != null ? String(title).trim() : ''
  if (!score) return false
  if (id) return score.tuneId === id
  if (score.tuneId) return false
  return (score.title || 'Untitled') === (name || 'Untitled')
}

/** Remove stored top scores for one tune (by tuneId, or title when id is absent). */
export function removePlayalongTopScoresForTune(tuneId, title) {
  const next = loadPlayalongTopScores().filter(function(row) {
    return !playalongScoreMatchesTune(row, tuneId, title)
  })
  writeStore({ scores: next })
  return next
}

function readStore() {
  try {
    const raw = localStorage.getItem(PLAYALONG_TOP_SCORES_STORAGE_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return emptyStore()
    return {
      version: 1,
      scores: normalizePlayalongTopScores(parsed.scores),
    }
  } catch (e) {
    return emptyStore()
  }
}

function writeStore(store) {
  const next = {
    version: 1,
    scores: normalizePlayalongTopScores(store && store.scores),
  }
  let changed = true
  try {
    const prev = localStorage.getItem(PLAYALONG_TOP_SCORES_STORAGE_KEY)
    const serialized = JSON.stringify(next)
    changed = prev !== serialized
    if (changed) localStorage.setItem(PLAYALONG_TOP_SCORES_STORAGE_KEY, serialized)
  } catch (e) {
    // ignore quota errors
  }
  if (changed) {
    try {
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent(PLAYALONG_TOP_SCORES_CHANGED_EVENT))
      }
    } catch (e) {}
  }
  return next
}

export function loadPlayalongTopScores() {
  return readStore().scores
}

export function getPlayalongTopScoresAverage() {
  return averagePlayalongTopScores(loadPlayalongTopScores())
}

/**
 * Upsert a scored take into the personal top-scores list.
 * Same recordingId keeps the higher pitchPct; list is trimmed to the max pool size.
 */
export function recordPlayalongTopScore(entry) {
  const score = normalizePlayalongTopScore(entry)
  if (!score) return loadPlayalongTopScores()
  if (!score.createdAt) score.createdAt = new Date().toISOString()
  const next = writeStore({
    scores: loadPlayalongTopScores().concat([score]),
  })
  return next.scores
}

export function clearPlayalongTopScores() {
  writeStore(emptyStore())
  return []
}

function tuneMatchesResetFilter(id, tune, tuneId, title) {
  const wantId = tuneId != null ? String(tuneId).trim() : ''
  const wantTitle = title != null ? String(title).trim() : ''
  if (wantId) return String(id) === wantId
  if (!wantTitle) return true
  return tuneTitle(tune) === wantTitle
}

/**
 * Clear pitchPct on matching tunes (or all tunes) and persist via tunebook.saveTune.
 * Mutates in-memory tune.playalongTakes so immediate resolve sees cleared scores.
 */
export function clearPlayalongScorePitchPctFromTunes(tunes, tunebook, opts) {
  const o = opts || {}
  if (!tunes || typeof tunes !== 'object') return 0
  if (!tunebook || typeof tunebook.saveTune !== 'function') return 0
  let updated = 0
  Object.keys(tunes).forEach(function(id) {
    const tune = tunes[id]
    if (!tune) return
    if (!tuneMatchesResetFilter(id, tune, o.tuneId, o.title)) return
    const cleared = clearPlayalongTakePitchPcts(tune.playalongTakes)
    if (!cleared.changed) return
    tune.playalongTakes = cleared.takes
    tunebook.saveTune(Object.assign({}, tune, { playalongTakes: cleared.takes }))
    updated += 1
  })
  return updated
}

function tuneTitle(tune) {
  if (!tune || typeof tune !== 'object') return ''
  if (tune.name) return String(tune.name).trim()
  if (tune.title) return String(tune.title).trim()
  return ''
}

/** Build top-score candidates from pitchPct stored on playalong take ABC comments. */
export function collectPlayalongTopScoresFromTunes(tunes) {
  const rows = []
  if (!tunes || typeof tunes !== 'object') return []
  Object.keys(tunes).forEach(function(id) {
    const tune = tunes[id]
    if (!tune) return
    const title = tuneTitle(tune)
    normalizePlayalongTakes(tune.playalongTakes).forEach(function(take) {
      if (take.pitchPct == null) return
      rows.push({
        recordingId: take.recordingId,
        pitchPct: take.pitchPct,
        createdAt: take.createdAt,
        title: title,
        tuneId: id,
      })
    })
  })
  return normalizePlayalongTopScores(rows)
}

/**
 * Prefer ABC-backed scores from tunes; merge any local-only legacy scores.
 * When tunes are provided, also refresh the local cache for offline Account views.
 */
export function resolvePlayalongTopScores(tunes) {
  const fromTunes = collectPlayalongTopScoresFromTunes(tunes)
  const fromLocal = loadPlayalongTopScores()
  const merged = normalizePlayalongTopScores(fromTunes.concat(fromLocal))
  if (fromTunes.length) {
    const prevJson = JSON.stringify(fromLocal)
    const nextJson = JSON.stringify(merged)
    if (prevJson !== nextJson) {
      writeStore({ scores: merged })
    }
  }
  return merged
}
