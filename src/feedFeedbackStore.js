import { buildFeedbackSnapshot } from './feedFeedbackUtils'
import { downloadBlob } from './tuneDownloadActions'

export const FEED_FEEDBACK_STORAGE_KEY = 'bookstorage_feed_feedback'

function emptyStore() {
  return { version: 1, entries: {} }
}

function readStore() {
  try {
    const raw = localStorage.getItem(FEED_FEEDBACK_STORAGE_KEY)
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
    localStorage.setItem(FEED_FEEDBACK_STORAGE_KEY, JSON.stringify(store))
  } catch (e) {
    // ignore quota errors
  }
}

export function getFeedFeedbackEntry(itemId) {
  if (!itemId) return null
  const store = readStore()
  const entry = store.entries[itemId]
  return entry && typeof entry === 'object' ? entry : null
}

export function getAllFeedFeedback() {
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

export function upsertFeedFeedback(item, feedbackText) {
  const snapshot = buildFeedbackSnapshot(item)
  const itemId = snapshot.itemId
  if (!itemId) return null
  const now = new Date().toISOString()
  const prev = getFeedFeedbackEntry(itemId) || {}
  const entry = Object.assign({}, snapshot, {
    feedback: String(feedbackText != null ? feedbackText : prev.feedback || ''),
    updatedAt: now,
    createdAt: prev.createdAt || now,
  })
  const store = readStore()
  store.entries[itemId] = entry
  writeStore(store)
  return entry
}

export function downloadFeedFeedbackJson(filename) {
  const rows = getAllFeedFeedback().map(function(entry) {
    return {
      itemId: entry.itemId,
      lessonId: entry.lessonId || '',
      type: entry.type || '',
      title: entry.title || '',
      content: entry.content || '',
      notationExample: entry.notationExample || null,
      imageLink: entry.imageLink || null,
      imageComment: entry.imageComment || '',
      feedback: entry.feedback || '',
      updatedAt: entry.updatedAt || '',
    }
  })
  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' })
  downloadBlob(filename || 'feed-feedback.json', blob)
}

export function clearAllFeedFeedback() {
  writeStore(emptyStore())
}
