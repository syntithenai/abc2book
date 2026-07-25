/**
 * Quiz catalog loading and search for /quizzes page.
 */
import { normalizeSearchQuery, scoreSearchRecord, lessonAssetUrl, fetchLessonAssetJson } from './lessonSearch'
import { getAllLessonQuizProgress } from './lessonQuizProgressStore'

export async function loadQuizzesIndex() {
  return fetchLessonAssetJson(lessonAssetUrl('quizzes-index.json'))
}

export function flattenQuizzesIndex(index) {
  const rows = []
  ;(index && index.quizzes || []).forEach(function(row) {
    rows.push(row)
  })
  return rows
}

export function searchQuizzes(rows, query, limit) {
  const q = normalizeSearchQuery(query)
  if (!q || !Array.isArray(rows)) return []
  const max = typeof limit === 'number' ? limit : 40
  return rows
    .map(function(row) {
      const record = {
        title: row.title,
        text: [
          row.title,
          row.unitLabel,
          row.trackLabel,
          (row.tags || []).join(' '),
        ].join(' '),
        tags: row.tags,
      }
      return { row: row, score: scoreSearchRecord(record, q) }
    })
    .filter(function(entry) { return entry.score > 0 })
    .sort(function(a, b) { return b.score - a.score })
    .slice(0, max)
    .map(function(entry) { return entry.row })
}

export function groupQuizzesByUnit(rows) {
  const groups = {}
  ;(rows || []).forEach(function(row) {
    const key = row.unitId || row.trackId || 'other'
    if (!groups[key]) {
      groups[key] = {
        id: key,
        label: row.unitLabel || row.trackLabel || 'Other',
        trackLabel: row.trackLabel || '',
        quizzes: [],
      }
    }
    groups[key].quizzes.push(row)
  })
  return Object.values(groups).sort(function(a, b) {
    return String(a.label).localeCompare(String(b.label))
  })
}

export function attachQuizProgress(rows) {
  const progress = getAllLessonQuizProgress()
  return (rows || []).map(function(row) {
    const p = progress[row.id] || null
    return Object.assign({}, row, {
      progress: p,
      attempted: !!(p && p.attempts),
      completed: !!(p && p.completed),
      bestCorrect: p ? p.bestCorrect : 0,
      total: p ? p.total : row.questionCount,
    })
  })
}

export function summarizeQuizActivity(rows) {
  const withProgress = attachQuizProgress(rows)
  let attempted = 0
  let completed = 0
  let totalQuestions = 0
  let totalBestCorrect = 0
  const unitScores = {}
  withProgress.forEach(function(row) {
    totalQuestions += Number(row.questionCount) || 0
    if (row.attempted) attempted += 1
    if (row.completed) completed += 1
    totalBestCorrect += Number(row.bestCorrect) || 0
    const unit = row.unitLabel || row.trackLabel || 'Other'
    if (!unitScores[unit]) unitScores[unit] = { label: unit, correct: 0, total: 0, count: 0 }
    unitScores[unit].correct += Number(row.bestCorrect) || 0
    unitScores[unit].total += Number(row.questionCount) || 0
    unitScores[unit].count += 1
  })
  const interests = Object.values(unitScores)
    .map(function(u) {
      return Object.assign({}, u, {
        pct: u.total ? Math.round((u.correct / u.total) * 100) : 0,
      })
    })
    .sort(function(a, b) { return b.count - a.count })
  return {
    quizCount: withProgress.length,
    attempted: attempted,
    completed: completed,
    totalQuestions: totalQuestions,
    totalBestCorrect: totalBestCorrect,
    overallPct: totalQuestions ? Math.round((totalBestCorrect / totalQuestions) * 100) : 0,
    interests: interests,
    rows: withProgress,
  }
}
