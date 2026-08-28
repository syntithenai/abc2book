/**
 * Named Import Book review sets (localforage).
 * Book is required and forced onto every tune.
 */
import localforage from 'localforage'

const INDEX_KEY = 'index'
const setStore = localforage.createInstance({ name: 'bookimportreviewsets' })
const blobStore = localforage.createInstance({ name: 'bookimportreviewblobs' })

const listeners = new Set()
let revision = 0

function notify() {
  revision += 1
  listeners.forEach(function(listener) {
    try {
      listener()
    } catch (e) {
      // ignore
    }
  })
}

export function subscribeBookImportReviewSets(listener) {
  listeners.add(listener)
  return function unsubscribe() {
    listeners.delete(listener)
  }
}

export function getBookImportReviewRevision() {
  return String(revision)
}

function freshId(prefix) {
  return (prefix || 'id') + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9)
}

function normalizeBook(book) {
  return String(book || '').trim().toLowerCase()
}

function normalizeBookLabel(label, book) {
  const text = String(label || '').trim()
  if (text) return text
  const slug = normalizeBook(book)
  if (!slug) return ''
  return slug.charAt(0).toUpperCase() + slug.slice(1)
}

function publicSetSummary(set) {
  if (!set) return null
  return {
    id: set.id,
    name: set.name,
    book: set.book,
    bookLabel: set.bookLabel,
    createdAt: set.createdAt,
    updatedAt: set.updatedAt,
    status: set.status || 'draft',
    tuneCount: Array.isArray(set.tunes) ? set.tunes.length : 0,
    pageCount: Array.isArray(set.pages) ? set.pages.length : 0,
  }
}

async function readIndex() {
  const index = await setStore.getItem(INDEX_KEY)
  return Array.isArray(index) ? index.slice() : []
}

async function writeIndex(ids) {
  await setStore.setItem(INDEX_KEY, Array.isArray(ids) ? ids : [])
}

async function readSet(id) {
  if (!id) return null
  const set = await setStore.getItem('set:' + id)
  return set && typeof set === 'object' ? set : null
}

async function writeSet(set) {
  if (!set || !set.id) throw new Error('Invalid review set')
  await setStore.setItem('set:' + set.id, set)
  notify()
  return set
}

export async function listReviewSets() {
  const ids = await readIndex()
  const out = []
  for (let i = 0; i < ids.length; i += 1) {
    const set = await readSet(ids[i])
    if (set) out.push(publicSetSummary(set))
  }
  out.sort(function(a, b) {
    return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
  })
  return out
}

export async function getReviewSet(id) {
  return readSet(id)
}

/**
 * @param {{ name: string, book: string, bookLabel?: string }} options
 */
export async function createReviewSet(options) {
  const opts = options || {}
  const book = normalizeBook(opts.book)
  if (!book) {
    throw new Error('A book is required for a review set')
  }
  const name = String(opts.name || '').trim() || ('Book import ' + new Date().toLocaleString())
  const now = new Date().toISOString()
  const set = {
    id: freshId('reviewset'),
    name: name,
    book: book,
    bookLabel: normalizeBookLabel(opts.bookLabel, book),
    createdAt: now,
    updatedAt: now,
    status: 'draft',
    pages: [],
    tunes: [],
  }
  const ids = await readIndex()
  ids.unshift(set.id)
  await writeIndex(ids)
  await writeSet(set)
  return set
}

export async function putReviewBlob(blobKey, blob) {
  if (!blobKey) throw new Error('Missing blob key')
  if (!blob) throw new Error('Missing blob')
  await blobStore.setItem(blobKey, blob)
  return blobKey
}

export async function getReviewBlob(blobKey) {
  if (!blobKey) return null
  return blobStore.getItem(blobKey)
}

export async function deleteReviewBlob(blobKey) {
  if (!blobKey) return
  try {
    await blobStore.removeItem(blobKey)
  } catch (e) {
    // best-effort
  }
}

function stampBookOnTunes(tunes, book) {
  const needle = normalizeBook(book)
  return (Array.isArray(tunes) ? tunes : []).map(function(tune) {
    const next = Object.assign({}, tune || {})
    next.books = needle ? [needle] : []
    return next
  })
}

/**
 * Replace pages/tunes (or patch fields) on a set. Always re-stamps book on tunes.
 */
export async function updateReviewSet(id, patch) {
  const set = await readSet(id)
  if (!set) throw new Error('Review set not found')
  const next = Object.assign({}, set, patch || {})
  next.id = set.id
  next.book = set.book
  next.bookLabel = set.bookLabel
  next.name = String(next.name || set.name).trim() || set.name
  next.updatedAt = new Date().toISOString()
  if (Array.isArray(next.tunes)) {
    next.tunes = stampBookOnTunes(next.tunes, set.book)
  }
  return writeSet(next)
}

export async function updateTuneInReviewSet(setId, tuneId, patch) {
  const set = await readSet(setId)
  if (!set) throw new Error('Review set not found')
  const tunes = Array.isArray(set.tunes) ? set.tunes.slice() : []
  const index = tunes.findIndex(function(tune) {
    return tune && String(tune.id) === String(tuneId)
  })
  if (index < 0) throw new Error('Tune not found in review set')
  const updated = Object.assign({}, tunes[index], patch || {})
  updated.id = tunes[index].id
  updated.books = [set.book]
  tunes[index] = updated
  return updateReviewSet(setId, { tunes: tunes })
}

export async function appendTunesToReviewSet(setId, pages, tunes) {
  const set = await readSet(setId)
  if (!set) throw new Error('Review set not found')
  const nextPages = (Array.isArray(set.pages) ? set.pages : []).concat(Array.isArray(pages) ? pages : [])
  const nextTunes = (Array.isArray(set.tunes) ? set.tunes : []).concat(Array.isArray(tunes) ? tunes : [])
  return updateReviewSet(setId, {
    pages: nextPages,
    tunes: nextTunes,
    status: nextTunes.length ? 'review' : set.status,
  })
}

export async function deleteReviewSet(id) {
  const set = await readSet(id)
  if (!set) return false
  const blobKeys = []
  ;(Array.isArray(set.pages) ? set.pages : []).forEach(function(page) {
    if (page && page.blobKey) blobKeys.push(page.blobKey)
  })
  ;(Array.isArray(set.tunes) ? set.tunes : []).forEach(function(tune) {
    if (tune && tune.cropBlobKey) blobKeys.push(tune.cropBlobKey)
  })
  for (let i = 0; i < blobKeys.length; i += 1) {
    await deleteReviewBlob(blobKeys[i])
  }
  await setStore.removeItem('set:' + id)
  const ids = await readIndex()
  await writeIndex(ids.filter(function(item) { return item !== id }))
  notify()
  return true
}

export function createBlankTuneRecord(options) {
  const opts = options || {}
  const book = normalizeBook(opts.book)
  return {
    id: opts.id || freshId('tune'),
    title: String(opts.title || '').trim() || 'Untitled',
    page: Number(opts.page) || 1,
    tuneIndex: Number(opts.tuneIndex) || 1,
    cropBlobKey: opts.cropBlobKey || '',
    cropName: opts.cropName || '',
    key: String(opts.key || '').trim(),
    abc: String(opts.abc || '').trim(),
    complete: !!opts.complete,
    abcSource: String(opts.abcSource || '').trim(),
    candidates: Array.isArray(opts.candidates) ? opts.candidates : [],
    selectedCandidateId: opts.selectedCandidateId || '',
    omrAbc: String(opts.omrAbc || '').trim(),
    notationIssues: Array.isArray(opts.notationIssues) ? opts.notationIssues : [],
    cropZones: Array.isArray(opts.cropZones)
      ? opts.cropZones
      : (Array.isArray(opts.badSections) ? opts.badSections : []),
    bbox: opts.bbox || null,
    books: book ? [book] : [],
    status: opts.status || 'pending',
    sheetFormat: String(opts.sheetFormat || opts.pageType || '').trim(),
    pageType: String(opts.pageType || opts.sheetFormat || '').trim(),
    pageKind: String(opts.pageKind || '').trim(),
    chordSheetText: String(opts.chordSheetText || '').trim(),
    meta: opts.meta && typeof opts.meta === 'object' ? opts.meta : null,
    suggestedMergeWithNext: !!opts.suggestedMergeWithNext,
    sourcePdfPage: opts.sourcePdfPage != null ? Number(opts.sourcePdfPage) : null,
    sourcePdfBlobKey: String(opts.sourcePdfBlobKey || '').trim(),
    rasterScale: Number(opts.rasterScale) || 0,
  }
}

export function isAllowedBookImportFile(file) {
  if (!file) return false
  const name = String(file.name || '').toLowerCase()
  const type = String(file.type || '').toLowerCase()
  if (type === 'application/pdf' || name.endsWith('.pdf')) return true
  if (type.indexOf('image/') === 0) return true
  return /\.(png|jpe?g|webp|gif|tif|tiff)$/i.test(name)
}

export function filterBookImportFiles(files) {
  return (Array.isArray(files) ? files : Array.from(files || [])).filter(isAllowedBookImportFile)
}

/** Test helper: wipe stores. */
export async function __resetBookImportReviewStoreForTests() {
  await setStore.clear()
  await blobStore.clear()
  notify()
}
