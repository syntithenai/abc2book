import { fetchAlbumsForSong } from './songAlbumsClient'
import { buildExternalSearchQuestion, buildGoogleSearchQuestionUrl } from './externalSearchLinks'

export async function searchAlbumsForSong(title, artist, options) {
  const opts = options || {}
  const result = await fetchAlbumsForSong(title, artist, {
    signal: opts.signal,
    onProgress: opts.onProgress,
    performers: opts.performers,
  })
  const candidates = Array.isArray(result.candidates) ? result.candidates : []
  const autoApply = Array.isArray(result.autoApply) ? result.autoApply : []
  const suggestions = Array.isArray(result.suggestions) ? result.suggestions : []

  if (candidates.length === 0) {
    return {
      empty: true,
      candidates: [],
      autoApply: [],
      suggestions: [],
      albums: [],
    }
  }

  if (candidates.length === 1 && autoApply.length === 1) {
    return Object.assign({ empty: false, multiple: false, albums: [autoApply[0].album] }, autoApply[0], {
      candidates: candidates,
      autoApply: autoApply,
      suggestions: suggestions,
    })
  }

  return {
    empty: false,
    multiple: true,
    albums: autoApply.map(function(candidate) { return candidate.album }),
    candidates: candidates,
    autoApply: autoApply,
    suggestions: suggestions,
  }
}

export function buildGoogleAlbumsSearchQuestion(title, artist) {
  return buildExternalSearchQuestion('albums', title, artist)
}

export function buildGoogleAlbumsSearchUrl(title, artist) {
  return buildGoogleSearchQuestionUrl(buildGoogleAlbumsSearchQuestion(title, artist))
}
