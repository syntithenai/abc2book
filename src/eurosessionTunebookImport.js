/**
 * Import EuroSession / Import Book review packages into the tunebook.
 * Re-imports update by stable tune id from the review page.
 */

import {
  createTuneFileFromBlob,
  getTuneFiles,
  removeTuneFileMeta,
  deleteStoredTuneFile,
} from './tuneFiles'
import { setTuneBookPage } from './tuneBookPages'
import {
  ensureAbcbookRepeats,
  isGenericComposer,
  stripGenericComposerFromAbc,
} from './bookImportAbcTransforms'
import { noteLinesHaveRealMelody } from './timedImportFinalizer'
import { isPhotoOnlyAbc } from './abcPhotoOnly'

export const EUROSESSION_IMPORT_BOOK = 'eurosession'
export const EUROSESSION_CROP_SOURCE = 'eurosession'
export const BOOK_IMPORT_CROP_SOURCE = 'book-import'

/**
 * @param {unknown} raw
 * @returns {{ book: string, bookLabel: string, tunes: object[], version: number }}
 */
export function parseEurosessionImportPackage(raw) {
  let data = raw
  if (typeof raw === 'string') {
    data = JSON.parse(raw)
  }
  if (!data || typeof data !== 'object' || !Array.isArray(data.tunes)) {
    throw new Error('Invalid eurosession-import.json (missing tunes array)')
  }
  const book = String(data.book || EUROSESSION_IMPORT_BOOK).trim().toLowerCase() || EUROSESSION_IMPORT_BOOK
  const tunes = []
  for (let i = 0; i < data.tunes.length; i++) {
    const t = data.tunes[i]
    if (!t || typeof t !== 'object') continue
    const id = String(t.id || '').trim()
    const title = String(t.title || '').trim() || ('Tune ' + (i + 1))
    const crop = String(t.crop || '').trim()
    const abc = String(t.abc || '').trim()
    const notationOnly = !!(t.notationOnly || t.joinTier === 'mxl_only')
    if (!id) {
      throw new Error('Tune "' + title + '" is missing a stable id — re-export from the review page')
    }
    if (!crop && !notationOnly) {
      throw new Error('Tune "' + title + '" is missing crop filename')
    }
    tunes.push({
      key: String(t.key || '').trim(),
      id: id,
      title: title,
      page: t.page,
      tuneIndex: t.tuneIndex,
      crop: crop,
      complete: !!t.complete,
      abc: abc,
      notationOnly: notationOnly,
      joinTier: String(t.joinTier || '').trim(),
    })
  }
  if (!tunes.length) throw new Error('eurosession-import.json has no tunes')
  return {
    book: book,
    bookLabel: String(data.bookLabel || 'EuroSession').trim() || 'EuroSession',
    version: data.version || 1,
    exportedAt: data.exportedAt || null,
    tunes: tunes,
  }
}

/**
 * Index File objects from a directory picker by basename (case-sensitive first, then lower).
 * @param {FileList|File[]} files
 * @returns {Map<string, File>}
 */
export function indexCropFilesByBasename(files) {
  const map = new Map()
  const list = files && files.length != null ? Array.from(files) : []
  list.forEach(function(file) {
    if (!file || !file.name) return
    const base = String(file.name).split(/[/\\]/).pop()
    if (!base) return
    if (!map.has(base)) map.set(base, file)
    const lower = base.toLowerCase()
    if (!map.has(lower)) map.set(lower, file)
  })
  return map
}

export function findCropFile(cropIndex, cropName) {
  if (!cropIndex || !cropName) return null
  return cropIndex.get(cropName) || cropIndex.get(String(cropName).toLowerCase()) || null
}

/** Incomplete → crop is default view (activeFile set). */
export function shouldSetCropActive(complete) {
  return !complete
}

function importedTuneHasLyrics(imported) {
  const words = imported && imported.words
  if (!Array.isArray(words)) return false
  return words.some(function(w) { return w && String(w).trim() })
}

function importedTuneHasMelody(imported) {
  const voices = imported && imported.voices
  if (!voices || typeof voices !== 'object') return false
  return Object.keys(voices).some(function(k) {
    const voice = voices[k]
    return noteLinesHaveRealMelody(voice && voice.notes)
  })
}

function importedTuneHasChords(imported) {
  const wLines = imported && imported.wLines
  if (!Array.isArray(wLines) || !wLines.length) return false
  return wLines.some(function(line) {
    const text = String(line || '').trim()
    if (!text) return false
    return /[A-G][#b]?(\/|[\s]|$)/.test(text)
  })
}

/**
 * Photo-only / empty imports should open on the crop snapshot, not a blank ABC stub.
 */
export function shouldDefaultCropSnapshotVisible(entry, imported) {
  if (!entry || entry.notationOnly || entry.joinTier === 'mxl_only') return false
  if (String(entry.joinTier || '') === 'photo_only') return true
  const abc = String(entry.abc || '')
  if (isPhotoOnlyAbc(abc)) return true
  if (!importedTuneHasMelody(imported)
    && !importedTuneHasLyrics(imported)
    && !importedTuneHasChords(imported)) {
    return true
  }
  return false
}

export function shouldActivateCropOnImport(entry, imported) {
  return shouldSetCropActive(entry && entry.complete) || shouldDefaultCropSnapshotVisible(entry, imported)
}

function ensureBookOnTune(tune, book) {
  const next = Object.assign({}, tune || {})
  const books = Array.isArray(next.books) ? next.books.slice() : []
  const needle = String(book || '').toLowerCase()
  const has = books.some(function(b) { return String(b || '').toLowerCase() === needle })
  if (!has && needle) books.push(needle)
  next.books = books
  return next
}

/**
 * Strip crop snapshots matching a source so re-import replaces rather than stacks.
 */
export async function stripCropsBySource(tune, cropSource) {
  let next = tune
  const source = String(cropSource || '')
  const list = getTuneFiles(next).slice()
  for (let i = 0; i < list.length; i++) {
    const meta = list[i]
    if (!meta || !meta.id) continue
    if (String(meta.source || '') !== source) continue
    const fileId = meta.id
    next = removeTuneFileMeta(next, fileId)
    try {
      await deleteStoredTuneFile(fileId, next && next.id)
    } catch (e) {
      // best-effort
    }
  }
  return next
}

/**
 * Strip previous eurosession crop snapshots so re-import replaces rather than stacks.
 */
export async function stripEurosessionCrops(tune) {
  return stripCropsBySource(tune, EUROSESSION_CROP_SOURCE)
}

/**
 * Merge imported ABC onto an existing tune, preserving personal fields where useful.
 */
export function mergeImportedAbcOntoTune(existing, imported, book) {
  const next = Object.assign({}, existing || {}, imported || {})
  next.id = existing && existing.id ? existing.id : imported.id
  if (existing) {
    if (existing.boost != null) next.boost = existing.boost
    if (existing.starred != null) next.starred = existing.starred
    // Prefer links from the import package when present (e.g. curated YouTube).
    if (Array.isArray(imported && imported.links) && imported.links.length > 0) {
      next.links = imported.links
    } else if (Array.isArray(existing.links)) {
      next.links = existing.links
    }
    if (Array.isArray(existing.recordings)) next.recordings = existing.recordings
    if (Array.isArray(existing.tags)) next.tags = existing.tags
    next.tuneFiles = getTuneFiles(existing)
    next.activeFile = existing.activeFile || ''
    if (existing.bookPages && typeof existing.bookPages === 'object') {
      next.bookPages = Object.assign({}, existing.bookPages)
    }
    if (Array.isArray(existing.books)) {
      next.books = existing.books.slice()
    }
  }
  return ensureBookOnTune(next, book)
}

/**
 * Import a book review package (tunes + crop blobs/files) into the tunebook.
 * The given `book` is forced onto every tune.
 */
export async function importBookReviewPackage(options) {
  const opts = options || {}
  const book = String(opts.book || '').trim().toLowerCase()
  if (!book) {
    throw new Error('A book is required to import a review set')
  }
  const cropSource = String(opts.cropSource || BOOK_IMPORT_CROP_SOURCE).trim() || BOOK_IMPORT_CROP_SOURCE
  const historyLabel = String(opts.historyLabel || 'Book import').trim() || 'Book import'
  const entries = Array.isArray(opts.tunes) ? opts.tunes : []
  const cropIndex = opts.cropIndex
  const resolveCrop = typeof opts.resolveCrop === 'function' ? opts.resolveCrop : null
  const tunebook = opts.tunebook
  const tunesMap = opts.tunesMap || {}
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : function() {}

  if (!entries.length) {
    throw new Error('Missing import tunes')
  }
  if (!tunebook || !tunebook.abcTools || typeof tunebook.abcTools.abc2json !== 'function') {
    throw new Error('tunebook is required')
  }
  const needsCrop = entries.some(function(entry) {
    return !(entry && (entry.notationOnly || entry.joinTier === 'mxl_only'))
  })
  if (needsCrop && !cropIndex && !resolveCrop) {
    throw new Error('Crop images are required')
  }

  const summary = {
    inserted: 0,
    updated: 0,
    skipped: 0,
    missingCrop: [],
    errors: [],
  }

  const total = entries.length
  if (typeof tunebook.beginTunesBatchCommit === 'function') {
    tunebook.beginTunesBatchCommit()
  }

  try {
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      const title = String(entry.title || '').trim() || ('Tune ' + (i + 1))
      onProgress(i, total, title, 'start')
      try {
        const notationOnly = !!(entry.notationOnly || entry.joinTier === 'mxl_only')
        let cropFile = null
        if (!notationOnly) {
          if (resolveCrop) {
            cropFile = await resolveCrop(entry)
          }
          if (!cropFile && cropIndex) {
            if (typeof cropIndex.get === 'function') {
              cropFile = findCropFile(cropIndex, entry.crop || entry.cropName || entry.cropBlobKey)
            } else if (entry.cropBlobKey && cropIndex[entry.cropBlobKey]) {
              cropFile = cropIndex[entry.cropBlobKey]
            } else if (entry.crop && cropIndex[entry.crop]) {
              cropFile = cropIndex[entry.crop]
            }
          }
          if (!cropFile) {
            summary.missingCrop.push((entry.crop || entry.cropBlobKey || '?') + ' (' + title + ')')
            summary.skipped += 1
            onProgress(i + 1, total, title, 'missing-crop')
            continue
          }
        }

        const abcWithRepeats = ensureAbcbookRepeats(
          stripGenericComposerFromAbc(entry.abc || ''),
          3,
        )
        let imported = tunebook.abcTools.abc2json(abcWithRepeats, { bAsSourceBook: true })
        if (!imported || typeof imported !== 'object') {
          imported = {
            id: entry.id,
            name: title,
            voices: { '1': { meta: '', notes: [] } },
            words: [],
            links: [],
          }
        }
        imported.id = entry.id
        imported.name = imported.name || title
        // Always set composer so re-import clears MuseScore placeholders on existing tunes.
        imported.composer = isGenericComposer(imported.composer)
          ? ''
          : String(imported.composer || '')
        if (!imported.repeats) imported.repeats = '3'
        imported = ensureBookOnTune(imported, book)

        const liveTunes = (typeof tunebook.getTunes === 'function' ? tunebook.getTunes() : null) || tunesMap || {}
        const existing = liveTunes[entry.id] || tunesMap[entry.id] || null
        const isUpdate = !!(existing && existing.id)
        let tune = isUpdate
          ? mergeImportedAbcOntoTune(existing, imported, book)
          : tunebook.createTune(imported)

        tune = ensureBookOnTune(tune, book)
        tune = setTuneBookPage(tune, book, entry.page, entry.tuneIndex)

        // Only strip prior crops when a replacement crop is being attached.
        // ABC-only / notation-only updates must keep existing snapshots.
        if (isUpdate && cropFile) {
          tune = await stripCropsBySource(tune, cropSource)
        }

        tune = tunebook.saveTune(tune, false, {
          deferCommit: true,
          skipHistory: true,
          historyLabel: isUpdate ? (historyLabel + ' update') : historyLabel,
        })

        if (cropFile) {
          const fileResult = await createTuneFileFromBlob({
            tune: tune,
            blob: cropFile,
            name: entry.crop || entry.cropName || (cropFile.name) || 'crop.jpg',
            type: cropFile.type || 'image/jpeg',
            source: cropSource,
            setActive: shouldActivateCropOnImport(entry, imported),
            uploadToDrive: false,
          })
          tune = fileResult.tune
        }
        if ((entry.complete || notationOnly) && !shouldDefaultCropSnapshotVisible(entry, imported)) {
          tune = Object.assign({}, tune, { activeFile: '' })
        }

        tunebook.saveTune(tune, false, {
          deferCommit: true,
          skipHistory: true,
          historyLabel: isUpdate ? (historyLabel + ' update') : historyLabel,
        })

        if (isUpdate) summary.updated += 1
        else summary.inserted += 1
        onProgress(i + 1, total, title, isUpdate ? 'updated' : 'inserted')
      } catch (err) {
        summary.errors.push(title + ': ' + (err && err.message ? err.message : String(err)))
        summary.skipped += 1
        onProgress(i + 1, total, title, 'error')
      }
    }
  } finally {
    if (typeof tunebook.commitTunesBatch === 'function') {
      tunebook.commitTunesBatch()
    }
  }

  return summary
}

/**
 * @param {object} options
 * @param {object} options.packageData - parsed package
 * @param {Map<string, File>} options.cropIndex
 * @param {object} options.tunebook
 * @param {object} [options.tunes] - current tunes map
 * @param {function} [options.onProgress] - (done, total, title, status) => void
 */
export async function importEurosessionPackage(options) {
  const opts = options || {}
  const pkg = opts.packageData
  if (!pkg || !Array.isArray(pkg.tunes)) {
    throw new Error('Missing import package')
  }
  return importBookReviewPackage({
    book: pkg.book || EUROSESSION_IMPORT_BOOK,
    cropSource: EUROSESSION_CROP_SOURCE,
    historyLabel: 'EuroSession import',
    tunes: pkg.tunes,
    cropIndex: opts.cropIndex,
    tunebook: opts.tunebook,
    tunesMap: opts.tunes || {},
    onProgress: opts.onProgress,
  })
}

/**
 * Read a File as text (for the JSON package).
 * @param {File} file
 * @returns {Promise<string>}
 */
export function readImportJsonFile(file) {
  return new Promise(function(resolve, reject) {
    if (!file) {
      reject(new Error('No file'))
      return
    }
    const reader = new FileReader()
    reader.onload = function() {
      resolve(String(reader.result || ''))
    }
    reader.onerror = function() {
      reject(new Error('Could not read file'))
    }
    reader.readAsText(file)
  })
}
