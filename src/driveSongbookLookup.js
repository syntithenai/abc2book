/**
 * Helpers for finding the user's Google Drive songbook ("ABC Tune Book").
 * Under drive.file, a failed/errored list must not be treated as "missing"
 * (that used to create a second empty songbook on Android).
 */

export const SONGBOOK_DOC_ID_STORAGE_KEY = 'bookstorage_google_document_id'

export function readStoredSongbookDocId() {
  try {
    return String(localStorage.getItem(SONGBOOK_DOC_ID_STORAGE_KEY) || '').trim()
  } catch (e) {
    return ''
  }
}

export function writeStoredSongbookDocId(fileId) {
  var id = String(fileId || '').trim()
  if (!id) return
  try {
    localStorage.setItem(SONGBOOK_DOC_ID_STORAGE_KEY, id)
  } catch (e) { /* ignore quota */ }
}

export function clearStoredSongbookDocId() {
  try {
    localStorage.removeItem(SONGBOOK_DOC_ID_STORAGE_KEY)
  } catch (e) { /* ignore */ }
}

/**
 * @param {object|null} response Parsed Drive files.list JSON
 * @param {number} [httpStatus]
 * @returns {{ ok: boolean, error: string|null, files: Array }}
 */
export function parseDriveFilesListResponse(response, httpStatus) {
  var status = typeof httpStatus === 'number' ? httpStatus : 200
  if (status < 200 || status >= 300) {
    var statusMsg = response && response.error && response.error.message
      ? String(response.error.message)
      : ('Drive list failed (HTTP ' + status + ')')
    return { ok: false, error: statusMsg, files: [] }
  }
  if (response && response.error) {
    var errMsg = response.error.message
      ? String(response.error.message)
      : 'Drive list failed'
    return { ok: false, error: errMsg, files: [] }
  }
  var files = response && Array.isArray(response.files) ? response.files : []
  return { ok: true, error: null, files: files }
}

function fileSize(file) {
  var n = file && file.size != null ? Number(file.size) : NaN
  return Number.isFinite(n) ? n : -1
}

function fileModifiedMs(file) {
  if (!file || !file.modifiedTime) return 0
  var ms = Date.parse(file.modifiedTime)
  return Number.isFinite(ms) ? ms : 0
}

/**
 * Prefer the largest file (real songbooks are much larger than empty stubs),
 * then files that report a size at all, then most recently modified.
 * Last-wins forEach was nondeterministic and often bound Android to a new empty stub.
 */
export function pickBestTuneBookFile(files, tuneBookName) {
  var name = String(tuneBookName || 'ABC Tune Book')
  var matches = (Array.isArray(files) ? files : []).filter(function(file) {
    return file && file.id && file.name === name
  })
  if (matches.length === 0) return null
  if (matches.length === 1) return matches[0]
  matches.sort(function(a, b) {
    var sizeA = fileSize(a)
    var sizeB = fileSize(b)
    var hasSizeA = sizeA >= 0
    var hasSizeB = sizeB >= 0
    if (hasSizeA && hasSizeB && sizeB !== sizeA) return sizeB - sizeA
    if (hasSizeA !== hasSizeB) return hasSizeA ? -1 : 1
    return fileModifiedMs(b) - fileModifiedMs(a)
  })
  return matches[0]
}
