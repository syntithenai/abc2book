import {
  buildGenreSearchContext,
  inferGenreFromSearchContext,
  shouldOfferGenreSuggestion,
} from './genreInference'
import { offerSideFieldSuggestion } from './tuneFieldLookupQueue'

/**
 * Route inferred genre from another search into Suggestions (or auto-apply when empty).
 * Without a tune/candidate id, auto-applies only when the genre field is empty.
 */
export function maybeOfferGenreFromSearchResult(options) {
  const opts = options || {}
  const inferred = inferGenreFromSearchContext(buildGenreSearchContext(
    opts.result || {},
    Object.assign({
      title: opts.title || '',
      artist: opts.artist || '',
      rhythm: opts.rhythm || '',
    }, opts.extras || {})
  ))
  if (!inferred || !shouldOfferGenreSuggestion(inferred.genre, opts.currentGenre)) {
    return null
  }

  const candidate = {
    genre: inferred.genre,
    reason: inferred.reason || '',
    source: inferred.source || 'inferred',
    preview: inferred.genre,
  }

  function applyToForm() {
    if (typeof opts.onGenreAccept === 'function') {
      opts.onGenreAccept(inferred.genre)
    }
  }

  if (!opts.tuneId && !opts.candidateId) {
    if (!String(opts.currentGenre || '').trim()) applyToForm()
    return null
  }

  return offerSideFieldSuggestion({
    tuneId: opts.tuneId || null,
    candidateId: opts.candidateId || null,
    kind: 'genre',
    candidate: candidate,
    currentValue: opts.currentGenre || '',
    title: opts.title || '',
    artist: opts.artist || '',
    label: 'Genre suggestion',
    onApplied: function() { applyToForm() },
  })
}
