import {
  loadTextSearchIndexFromResource,
  searchLocalCollection,
  searchLocalCollectionNotation,
} from './localAbcCollectionSearch'
import { scoreNotationCandidate } from './notationMatchUtils'
import {
  hasStrongNotationMatch,
  searchThesessionNotation,
  sortNotationCandidates,
} from './thesessionNotationClient'
import { inferNotationSongType, isStrongLocalMatch } from './textSearchIndexUtils'
import { normalizeNotationSearch } from './notationSearchNormalize'

function emitProgress(onProgress, message, progress, stage) {
  if (typeof onProgress === 'function') {
    onProgress(message, progress, stage)
  }
}

function emptyNotationResult() {
  return {
    multiple: false,
    empty: true,
    found: false,
    candidates: [],
  }
}

function finalizeLightResult(candidates) {
  const sorted = candidates.slice()
  if (sorted.length === 0) {
    return emptyNotationResult()
  }
  if (sorted.length === 1) {
    return normalizeNotationSearch(sorted[0])
  }
  return normalizeNotationSearch({
    multiple: true,
    candidates: sorted,
  })
}

function filterCandidatesByScore(candidates, title, artist) {
  const queryWords = String(title || '').trim().split(/\s+/).filter(Boolean).length
  const minScore = queryWords > 1 ? 50 : 30
  const filtered = candidates.filter(function(candidate) {
    return scoreNotationCandidate(candidate, title, artist) >= minScore
  })
  if (filtered.length > 0) return filtered
  // Prefer nothing over a flood of weak FolkTuneFinder / Session substring hits.
  if (queryWords > 1) return []
  return candidates.slice(0, 8)
}

export async function searchNotationLight(options) {
  const opts = options || {}
  const title = String(opts.title || '').trim()
  const artist = String(opts.artist || '').trim()
  const songType = opts.songType || inferNotationSongType('', artist)
  const abcTools = opts.abcTools

  if (!title) {
    throw new Error('Song title is required')
  }

  emitProgress(opts.onProgress, 'Starting local notation search...', 0, 'start')

  const textSearchIndex = opts.textSearchIndex || await loadTextSearchIndexFromResource()
  emitProgress(opts.onProgress, 'Searching local collection...', 0.05, 'local')

  const localSearchRows = abcTools ? searchLocalCollection(title, textSearchIndex) : []
  const localResults = abcTools
    ? await searchLocalCollectionNotation({
      title: title,
      abcTools: abcTools,
      textSearchIndex: textSearchIndex,
      limit: 8,
    })
    : []

  if (isStrongLocalMatch(title, localSearchRows) && localResults.length > 0) {
    emitProgress(opts.onProgress, 'Local match found', 1, 'done')
    return finalizeLightResult(sortNotationCandidates(localResults, title, artist))
  }

  const skipFolkNotation = songType === 'song' && !!artist
  if (skipFolkNotation) {
    emitProgress(opts.onProgress, 'Skipping folk ABC for named-artist song', 0.2, 'local')
  } else {
    emitProgress(opts.onProgress, 'Searching The Session...', 0.15, 'thesession')
  }
  const sessionCandidates = skipFolkNotation
    ? []
    : await searchThesessionNotation({
      title: title,
      artist: artist,
      signal: opts.signal,
      onProgress: function(message, progress, stage) {
        emitProgress(opts.onProgress, message, 0.15 + (progress * 0.75), stage)
      },
    })

  let candidates = sortNotationCandidates(
    (skipFolkNotation ? [] : localResults).concat(sessionCandidates),
    title,
    artist
  )
  candidates = filterCandidatesByScore(candidates, title, artist)

  if (hasStrongNotationMatch(candidates, title, artist) && candidates.length > 1) {
    const topScore = scoreNotationCandidate(candidates[0], title, artist)
    candidates = candidates.filter(function(candidate) {
      return scoreNotationCandidate(candidate, title, artist)
        >= Math.max(30, topScore - 10)
    })
  }

  emitProgress(opts.onProgress, 'Notation search complete', 1, 'done')
  return finalizeLightResult(candidates)
}
