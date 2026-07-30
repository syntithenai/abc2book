export const LESSON_PREVIEW_COMPLETE_KEY = 'bookstorage_lesson_preview_complete'

function readStore() {
  try {
    const raw = localStorage.getItem(LESSON_PREVIEW_COMPLETE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (e) {
    return {}
  }
}

function writeStore(entries) {
  try {
    localStorage.setItem(LESSON_PREVIEW_COMPLETE_KEY, JSON.stringify(entries))
  } catch (e) {
    // ignore quota errors
  }
}

export function isLessonContentComplete(lessonId) {
  if (!lessonId) return false
  const store = readStore()
  return !!store[lessonId]
}

export function setLessonContentComplete(lessonId, complete) {
  if (!lessonId) return
  const store = readStore()
  if (complete) {
    store[lessonId] = { completedAt: new Date().toISOString() }
  } else {
    delete store[lessonId]
  }
  writeStore(store)
}

export function toggleLessonContentComplete(lessonId) {
  setLessonContentComplete(lessonId, !isLessonContentComplete(lessonId))
}

export function getAllCompleteLessonIds() {
  return Object.keys(readStore())
}
