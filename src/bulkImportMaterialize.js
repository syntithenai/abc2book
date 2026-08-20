import { createImportCandidate } from './importReviewSession'

function assignBook(tune, book) {
  const next = Object.assign({}, tune || {})
  const bookName = book ? String(book).trim().toLowerCase() : ''
  if (!bookName) return next
  const books = Array.isArray(next.books) ? next.books.slice() : []
  if (books.indexOf(bookName) === -1) books.push(bookName)
  next.books = books
  return next
}

/**
 * Persist bulk-import candidates immediately and return merge-review
 * candidates that target the saved tune ids.
 */
export function materializeBulkImportCandidates(candidates, options) {
  const opts = options || {}
  const tunebook = opts.tunebook
  const book = opts.book ? String(opts.book).trim().toLowerCase() : ''
  const enhance = !!opts.enhance
  const list = Array.isArray(candidates) ? candidates : []
  const savedTunes = []
  const mergeCandidates = []

  if (!tunebook || typeof tunebook.saveTune !== 'function') {
    return { savedTunes: savedTunes, mergeCandidates: mergeCandidates, firstTuneId: '' }
  }

  list.forEach(function(candidate) {
    if (!candidate || !candidate.tune) return
    const tune = assignBook(candidate.tune, book)
    if (!tune.voices) tune.voices = { '1': { meta: '', notes: [] } }
    tunebook.saveTune(tune)
    if (!tune.id) return
    savedTunes.push(tune)
    mergeCandidates.push(createImportCandidate({
      id: candidate.id,
      tune: tune,
      sourceKind: candidate.sourceKind || 'bulk-text',
      youtubeUrl: candidate.youtubeUrl || '',
      mergeTargetId: tune.id,
      mergeStatus: 'exactId',
      mergeMode: 'suggestOnly',
      skipEnrich: !enhance,
    }))
  })

  return {
    savedTunes: savedTunes,
    mergeCandidates: mergeCandidates,
    firstTuneId: savedTunes[0] && savedTunes[0].id ? String(savedTunes[0].id) : '',
  }
}
