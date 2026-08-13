export const CHORD_READINESS_CLEANUP_SETTINGS_STORAGE_KEY = 'bookstorage_chord_readiness_cleanup_settings'

export const DEFAULT_CHORD_READINESS_CLEANUP_SETTINGS = {
  book: '',
  batchLimit: 25,
  dryRun: true,
  includeMelody: false,
  alwaysTag: false,
}

const MIN_BATCH_LIMIT = 1
const MAX_BATCH_LIMIT = 500

function normalizeBatchLimit(value) {
  const parsed = parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < MIN_BATCH_LIMIT) return DEFAULT_CHORD_READINESS_CLEANUP_SETTINGS.batchLimit
  return Math.min(MAX_BATCH_LIMIT, parsed)
}

export function resolveCleanupBook(savedBook, books, fallbackBook) {
  const bookList = Array.isArray(books) ? books : []
  const saved = savedBook == null ? '' : String(savedBook)
  if (!saved) return fallbackBook != null ? String(fallbackBook) : ''
  if (bookList.indexOf(saved) >= 0) return saved
  return fallbackBook != null ? String(fallbackBook) : ''
}

export function loadChordReadinessCleanupSettings() {
  try {
    const raw = localStorage.getItem(CHORD_READINESS_CLEANUP_SETTINGS_STORAGE_KEY)
    if (!raw) return Object.assign({}, DEFAULT_CHORD_READINESS_CLEANUP_SETTINGS)
    const parsed = JSON.parse(raw)
    return {
      book: parsed.book != null ? String(parsed.book) : '',
      batchLimit: normalizeBatchLimit(parsed.batchLimit),
      dryRun: parsed.dryRun !== false,
      includeMelody: !!parsed.includeMelody,
      alwaysTag: !!parsed.alwaysTag,
    }
  } catch (e) {
    return Object.assign({}, DEFAULT_CHORD_READINESS_CLEANUP_SETTINGS)
  }
}

export function saveChordReadinessCleanupSettings(settings) {
  const next = {
    book: settings && settings.book != null ? String(settings.book) : '',
    batchLimit: normalizeBatchLimit(settings && settings.batchLimit),
    dryRun: settings && settings.dryRun !== false,
    includeMelody: !!(settings && settings.includeMelody),
    alwaysTag: !!(settings && settings.alwaysTag),
  }
  try {
    localStorage.setItem(CHORD_READINESS_CLEANUP_SETTINGS_STORAGE_KEY, JSON.stringify(next))
  } catch (e) {
    // ignore quota errors
  }
  return next
}
