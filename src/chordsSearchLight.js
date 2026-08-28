import {
  loadTextSearchIndexFromResource,
  searchLocalCollection,
  searchLocalCollectionChords,
} from './localAbcCollectionSearch'
import { hasSingableLyricText } from './lyricsQualityUtils'
import { artistsLooselyMatch, scoreTitleArtistMatch } from './notationMatchUtils'
import { isGenericArtist } from './recordingArtistsClient'
import { isStrongLocalMatch } from './textSearchIndexUtils'

export const CHORDS_LIGHT_ERROR = 'No chord sheet found in local collections (Ultimate Guitar and similar sites require the media resolver)'

function emitProgress(onProgress, message, progress, stage) {
  if (typeof onProgress === 'function') {
    onProgress(message, progress, stage)
  }
}

function sortChordCandidates(candidates, title, artist) {
  return (candidates || []).slice().sort(function(a, b) {
    const scoreA = scoreTitleArtistMatch(a.title, a.artist, title, artist)
    const scoreB = scoreTitleArtistMatch(b.title, b.artist, title, artist)
    return scoreB - scoreA
  })
}

function candidateHasSingableLyrics(candidate) {
  if (!candidate) return false
  return hasSingableLyricText(
    candidate.lyricLines
      || candidate.sheetLines
      || candidate.lyricText
      || ''
  )
}

/**
 * Local ABC titles collide across repertoire (FolkTuneFinder "Gumboots" is Fred
 * Dagg, not Paul Simon). When a specific artist is requested, keep only hits
 * that match that artist — or, for generic/traditional searches, any local hit.
 */
function filterLocalChordCandidates(candidates, artist) {
  const list = Array.isArray(candidates) ? candidates : []
  if (isGenericArtist(artist)) return list
  return list.filter(function(candidate) {
    return artistsLooselyMatch(candidate && candidate.artist, artist)
  })
}

function finalizeLightResult(candidates) {
  const sorted = candidates.slice()
  if (sorted.length === 0) {
    throw new Error(CHORDS_LIGHT_ERROR)
  }
  if (sorted.length === 1) {
    return Object.assign({ multiple: false }, sorted[0])
  }
  return {
    multiple: true,
    candidates: sorted,
  }
}

export async function searchChordsLight(options) {
  const opts = options || {}
  const title = String(opts.title || '').trim()
  const artist = String(opts.artist || '').trim()

  if (!title) {
    throw new Error('Song title is required')
  }

  if (!opts.abcTools || typeof opts.renderChords !== 'function') {
    throw new Error(CHORDS_LIGHT_ERROR)
  }

  emitProgress(opts.onProgress, 'Searching local collection for embedded chords...', 0.05, 'local')

  // Prefer-chords from the lyrics editor should miss fast when the local index
  // is not already warm (cold load is ~28MB). Dedicated chords search may still
  // warm-load with a short timeout.
  const textSearchIndex = opts.textSearchIndex || await loadTextSearchIndexFromResource(null, {
    skipColdLoad: !!opts.skipColdIndexLoad,
    timeoutMs: typeof opts.indexTimeoutMs === 'number' ? opts.indexTimeoutMs : 8000,
  })
  if (!textSearchIndex || !textSearchIndex.tokens || !Object.keys(textSearchIndex.tokens).length) {
    throw new Error(CHORDS_LIGHT_ERROR)
  }

  const localSearchRows = searchLocalCollection(title, textSearchIndex)
  const localResults = await searchLocalCollectionChords({
    title: title,
    abcTools: opts.abcTools,
    renderChords: opts.renderChords,
    textSearchIndex: textSearchIndex,
    limit: 8,
  })

  const artistFits = filterLocalChordCandidates(localResults, artist)
  // Prefer sheets that include sung lyrics when available; fall back to
  // accompaniment-only ABC only for generic/traditional artist searches.
  const withLyrics = artistFits.filter(candidateHasSingableLyrics)
  const usable = withLyrics.length > 0
    ? withLyrics
    : (isGenericArtist(artist) ? artistFits : [])

  if (usable.length === 0) {
    throw new Error(CHORDS_LIGHT_ERROR)
  }

  if (isStrongLocalMatch(title, localSearchRows)) {
    emitProgress(opts.onProgress, 'Local chord match found', 1, 'done')
  } else {
    emitProgress(opts.onProgress, 'Local chord search complete', 1, 'done')
  }
  return finalizeLightResult(sortChordCandidates(usable, title, artist))
}
