/**
 * Export / import review sets as eurosession-import.json compatible packages.
 */
import { ensureAbcbookRepeats, stripGenericComposerFromAbc } from './bookImportAbcTransforms'

/**
 * @param {object} reviewSet
 * @returns {object}
 */
export function buildReviewSetImportPackage(reviewSet) {
  if (!reviewSet || !Array.isArray(reviewSet.tunes)) {
    throw new Error('Review set has no tunes')
  }
  const book = String(reviewSet.book || '').trim().toLowerCase()
  if (!book) throw new Error('Review set is missing a book')
  const tunes = reviewSet.tunes.map(function(tune, index) {
    const id = String(tune.id || '').trim()
    if (!id) {
      throw new Error('Tune "' + (tune.title || index) + '" is missing a stable id')
    }
    const abc = ensureAbcbookRepeats(
      stripGenericComposerFromAbc(String(tune.abc || '').trim()),
      3,
    )
    return {
      id: id,
      title: String(tune.title || '').trim() || ('Tune ' + (index + 1)),
      page: Number(tune.page) || 1,
      tuneIndex: Number(tune.tuneIndex) || (index + 1),
      crop: String(tune.cropName || tune.crop || '').trim(),
      complete: !!(tune.complete || tune.status === 'ready'),
      abc: abc,
      key: String(tune.key || '').trim(),
      notationOnly: !!tune.notationOnly,
      joinTier: String(tune.joinTier || '').trim(),
    }
  })
  return {
    book: book,
    bookLabel: String(reviewSet.bookLabel || reviewSet.name || book).trim() || book,
    exportedAt: new Date().toISOString(),
    storageKey: 'book-import-review:' + String(reviewSet.id || ''),
    version: 1,
    tunes: tunes,
  }
}

/**
 * @param {object} pkg
 * @param {object} reviewSet
 * @returns {object} updated review set
 */
export function mergeImportPackageIntoReviewSet(reviewSet, pkg) {
  if (!reviewSet || !pkg || !Array.isArray(pkg.tunes)) {
    throw new Error('Invalid import package')
  }
  const byId = {}
  ;(reviewSet.tunes || []).forEach(function(t) {
    if (t && t.id) byId[t.id] = t
  })
  pkg.tunes.forEach(function(entry) {
    const id = String(entry.id || '').trim()
    if (!id || !byId[id]) return
    const existing = byId[id]
    byId[id] = Object.assign({}, existing, {
      abc: String(entry.abc || existing.abc || '').trim(),
      complete: entry.complete != null ? !!entry.complete : existing.complete,
      status: entry.complete ? 'ready' : (existing.status || 'needs-review'),
      key: String(entry.key || existing.key || '').trim(),
      notationOnly: entry.notationOnly != null ? !!entry.notationOnly : existing.notationOnly,
      joinTier: String(entry.joinTier || existing.joinTier || '').trim(),
    })
  })
  const tunes = (reviewSet.tunes || []).map(function(t) {
    return byId[t.id] || t
  })
  return Object.assign({}, reviewSet, { tunes: tunes, updatedAt: Date.now() })
}

/**
 * Trigger browser download of import JSON.
 * @param {object} reviewSet
 * @param {string} [fileName]
 */
export function downloadReviewSetImportJson(reviewSet, fileName) {
  const pkg = buildReviewSetImportPackage(reviewSet)
  const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName || (String(reviewSet.book || 'book') + '-import.json')
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  return pkg
}

/**
 * @param {File} file
 * @returns {Promise<object>}
 */
export function readReviewSetImportFile(file) {
  return new Promise(function(resolve, reject) {
    if (!file) {
      reject(new Error('No file'))
      return
    }
    const reader = new FileReader()
    reader.onload = function() {
      try {
        resolve(JSON.parse(String(reader.result || '')))
      } catch (e) {
        reject(new Error('Invalid JSON'))
      }
    }
    reader.onerror = function() { reject(new Error('Could not read file')) }
    reader.readAsText(file)
  })
}
