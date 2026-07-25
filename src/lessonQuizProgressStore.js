const STORAGE_KEY = 'bookstorage_lesson_quiz_progress'

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (e) {
    return {}
  }
}

function writeAll(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data || {}))
  } catch (e) {
    // ignore
  }
}

export function getLessonQuizProgress(lessonId) {
  if (!lessonId) return null
  const all = readAll()
  return all[lessonId] || null
}

export function saveLessonQuizResult(lessonId, summary) {
  if (!lessonId || !summary) return
  const all = readAll()
  const prev = all[lessonId] || {}
  const next = {
    lessonId: lessonId,
    lastAttemptAt: Date.now(),
    bestCorrect: Math.max(Number(prev.bestCorrect) || 0, Number(summary.correctCount) || 0),
    total: Number(summary.total) || 0,
    lastCorrect: Number(summary.correctCount) || 0,
    attempts: (Number(prev.attempts) || 0) + 1,
    completed: !!(summary.completed),
  }
  all[lessonId] = next
  writeAll(all)
  return next
}

export function getAllLessonQuizProgress() {
  return readAll()
}

export function getQuizProgressSummary(lessonIds) {
  const all = readAll()
  const ids = Array.isArray(lessonIds) ? lessonIds : Object.keys(all)
  let attempted = 0
  let completed = 0
  let totalCorrect = 0
  let totalQuestions = 0
  ids.forEach(function(id) {
    const row = all[id]
    if (!row) return
    attempted += 1
    if (row.completed) completed += 1
    totalCorrect += Number(row.bestCorrect) || 0
    totalQuestions += Number(row.total) || 0
  })
  return {
    lessonCount: ids.length,
    attempted: attempted,
    completed: completed,
    totalCorrect: totalCorrect,
    totalQuestions: totalQuestions,
  }
}
