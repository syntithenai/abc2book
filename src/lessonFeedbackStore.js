import { buildLessonFeedbackSnapshot, compileLessonFeedbackText } from './lessonFeedbackUtils'
import { downloadBlob } from './tuneDownloadActions'

export const LESSON_FEEDBACK_STORAGE_KEY = 'bookstorage_lesson_feedback'

function emptyStore() {
  return { version: 1, entries: {} }
}

function readStore() {
  try {
    const raw = localStorage.getItem(LESSON_FEEDBACK_STORAGE_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return emptyStore()
    if (!parsed.entries || typeof parsed.entries !== 'object') {
      return { version: 1, entries: {} }
    }
    return { version: 1, entries: parsed.entries }
  } catch (e) {
    return emptyStore()
  }
}

function writeStore(store) {
  try {
    localStorage.setItem(LESSON_FEEDBACK_STORAGE_KEY, JSON.stringify(store))
  } catch (e) {
    // ignore quota errors
  }
}

export function getLessonFeedbackEntry(itemId) {
  if (!itemId) return null
  const store = readStore()
  const entry = store.entries[itemId]
  return entry && typeof entry === 'object' ? entry : null
}

export function getAllLessonFeedback() {
  const store = readStore()
  return Object.keys(store.entries)
    .map(function(id) { return store.entries[id] })
    .filter(Boolean)
    .sort(function(a, b) {
      const ta = Date.parse(a.updatedAt || '') || 0
      const tb = Date.parse(b.updatedAt || '') || 0
      return tb - ta
    })
}

export function upsertLessonFeedback(draft) {
  const snapshot = buildLessonFeedbackSnapshot(draft)
  const itemId = snapshot.itemId
  if (!itemId) return null
  const now = new Date().toISOString()
  const prev = getLessonFeedbackEntry(itemId) || {}
  const entry = Object.assign({}, snapshot, {
    presets: Array.isArray(draft && draft.presets)
      ? draft.presets.slice()
      : (Array.isArray(prev.presets) ? prev.presets : []),
    notes: draft && draft.notes != null ? String(draft.notes) : String(prev.notes || ''),
    feedback: '',
    updatedAt: now,
    createdAt: prev.createdAt || now,
  })
  entry.feedback = compileLessonFeedbackText(entry)
  const store = readStore()
  store.entries[itemId] = entry
  writeStore(store)
  return entry
}

export function downloadLessonFeedbackJson(filename) {
  const rows = getAllLessonFeedback().map(function(entry) {
    return {
      itemId: entry.itemId,
      lessonId: entry.lessonId || '',
      type: entry.type || '',
      title: entry.title || '',
      sectionId: entry.sectionId || '',
      sectionTitle: entry.sectionTitle || '',
      questionId: entry.questionId || '',
      questionPrompt: entry.questionPrompt || '',
      selectedText: entry.selectedText || '',
      context: entry.context || '',
      position: entry.position || null,
      presets: entry.presets || [],
      notes: entry.notes || '',
      feedback: entry.feedback || '',
      updatedAt: entry.updatedAt || '',
    }
  })
  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' })
  downloadBlob(filename || 'lesson-feedback.json', blob)
}

export function clearAllLessonFeedback() {
  writeStore(emptyStore())
}
