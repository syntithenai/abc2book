import {
  loadTextSearchIndexFromResource,
  searchLocalCollection,
  searchLocalCollectionChords,
} from './localAbcCollectionSearch'
import { scoreTitleArtistMatch } from './notationMatchUtils'
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

  const textSearchIndex = opts.textSearchIndex || await loadTextSearchIndexFromResource()
  const localSearchRows = searchLocalCollection(title, textSearchIndex)
  const localResults = await searchLocalCollectionChords({
    title: title,
    abcTools: opts.abcTools,
    renderChords: opts.renderChords,
    textSearchIndex: textSearchIndex,
    limit: 8,
  })

  if (isStrongLocalMatch(title, localSearchRows) && localResults.length > 0) {
    emitProgress(opts.onProgress, 'Local chord match found', 1, 'done')
    return finalizeLightResult(sortChordCandidates(localResults, title, artist))
  }

  if (localResults.length > 0) {
    emitProgress(opts.onProgress, 'Local chord search complete', 1, 'done')
    return finalizeLightResult(sortChordCandidates(localResults, title, artist))
  }

  throw new Error(CHORDS_LIGHT_ERROR)
}
