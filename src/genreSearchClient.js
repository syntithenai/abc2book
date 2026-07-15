import {
  buildGenreSearchContext,
  inferGenreFromSearchContext,
} from './genreInference'
import { getMusicGenreList } from './musicGenreOptions'

/**
 * Light genre suggestions from title / artist / rhythm / background heuristics.
 */
export function searchGenre(options) {
  const opts = options || {}
  const title = String(opts.title || '').trim()
  const artist = String(opts.artist || '').trim()
  const rhythm = String(opts.rhythm || '').trim()
  const backgroundInfo = String(opts.backgroundInfo || '').trim()
  const currentGenre = String(opts.currentGenre || '').trim()

  const inferred = inferGenreFromSearchContext(buildGenreSearchContext({
    text: backgroundInfo,
    title: title,
    artist: artist,
  }, {
    title: title,
    artist: artist,
    rhythm: rhythm,
  }))

  const candidates = []
  const seen = {}

  function pushGenre(genre, source, reason) {
    const label = String(genre || '').trim()
    if (!label) return
    const key = label.toLowerCase()
    if (seen[key]) return
    if (currentGenre && key === currentGenre.toLowerCase()) return
    seen[key] = true
    candidates.push({
      genre: label,
      preview: label,
      source: source || 'inference',
      reason: reason || '',
    })
  }

  if (inferred && inferred.genre) {
    pushGenre(inferred.genre, 'inference', inferred.reason || '')
  }

  const haystack = [title, artist, rhythm, backgroundInfo].join(' ').toLowerCase()
  getMusicGenreList().forEach(function(genre) {
    if (candidates.length >= 8) return
    const key = String(genre || '').toLowerCase()
    if (!key || key.length < 3) return
    if (haystack.indexOf(key) >= 0) {
      pushGenre(genre, 'title match', 'matched text')
    }
  })

  if (candidates.length === 0) {
    return { empty: true, candidates: [] }
  }
  if (candidates.length === 1) {
    return Object.assign({ empty: false, multiple: false }, candidates[0])
  }
  return { empty: false, multiple: true, candidates: candidates }
}

export function buildGoogleGenreSearchUrl(title, artist) {
  return 'https://www.google.com/search?q='
    + encodeURIComponent([title, artist, 'music genre'].filter(Boolean).join(' '))
}
