import {
  loadTextSearchIndexFromResource,
  searchLocalCollection,
  searchLocalCollectionLyrics,
} from './localAbcCollectionSearch'
import { searchLyricsOvhForArtists } from './lyricsOvhClient'
import { artistsLooselyMatch, scoreTitleArtistMatch } from './notationMatchUtils'
import { discoverRecordingArtists, isGenericArtist } from './recordingArtistsClient'
import { isStrongLocalMatch } from './textSearchIndexUtils'
import { normalizeLyricsSearch } from './lyricsSearchNormalize'

function emitProgress(onProgress, message, progress, stage) {
  if (typeof onProgress === 'function') {
    onProgress(message, progress, stage)
  }
}

function candidateKey(candidate) {
  const sourceUrl = String(candidate.sourceUrl || '').trim().toLowerCase()
  if (sourceUrl) return sourceUrl
  return (candidate.artist || '') + ':' + (candidate.text || '').slice(0, 120)
}

function dedupeCandidates(candidates) {
  const seen = new Set()
  const ordered = []
  ;(candidates || []).forEach(function(candidate) {
    const key = candidateKey(candidate)
    if (!key || seen.has(key)) return
    seen.add(key)
    ordered.push(candidate)
  })
  return ordered
}

function sortLyricsCandidates(candidates, title, artist) {
  return (candidates || []).slice().sort(function(a, b) {
    const scoreA = scoreTitleArtistMatch(a.title, a.artist, title, artist)
    const scoreB = scoreTitleArtistMatch(b.title, b.artist, title, artist)
    return scoreB - scoreA
  })
}

function localLyricsFitArtist(candidates, artist) {
  if (isGenericArtist(artist)) return candidates || []
  return (candidates || []).filter(function(candidate) {
    return artistsLooselyMatch(candidate && candidate.artist, artist)
  })
}

function finalizeLightResult(candidates) {
  const sorted = candidates.slice()
  if (sorted.length === 0) {
    throw new Error('No lyrics found for this song')
  }
  if (sorted.length === 1) {
    return normalizeLyricsSearch(sorted[0])
  }
  return normalizeLyricsSearch({
    multiple: true,
    candidates: sorted,
  })
}

export async function searchLyricsLight(options) {
  const opts = options || {}
  const title = String(opts.title || '').trim()
  const artist = String(opts.artist || '').trim()

  if (!title) {
    throw new Error('Song title is required')
  }

  emitProgress(opts.onProgress, 'Starting lyrics search...', 0, 'start')

  const textSearchIndex = opts.textSearchIndex || await loadTextSearchIndexFromResource()
  emitProgress(opts.onProgress, 'Searching local collection...', 0.05, 'local')

  const localSearchRows = opts.abcTools ? searchLocalCollection(title, textSearchIndex) : []
  const localResults = opts.abcTools
    ? await searchLocalCollectionLyrics({
      title: title,
      abcTools: opts.abcTools,
      textSearchIndex: textSearchIndex,
      limit: 8,
    })
    : []

  // Title-only local hits often collide across unrelated songs (Fred Dagg vs
  // Paul Simon "Gumboots"). Only short-circuit when the artist is generic or
  // a local lyric candidate actually matches the requested artist.
  const localArtistHits = localLyricsFitArtist(localResults, artist)
  if (isStrongLocalMatch(title, localSearchRows) && localArtistHits.length > 0) {
    emitProgress(opts.onProgress, 'Local match found', 1, 'done')
    return finalizeLightResult(sortLyricsCandidates(localArtistHits, title, artist))
  }

  let remoteCandidates = []

  if (!isGenericArtist(artist)) {
    emitProgress(opts.onProgress, 'Checking lyrics.ovh...', 0.15, 'lyrics.ovh')
    const direct = await searchLyricsOvhForArtists({
      title: title,
      artists: [artist],
      signal: opts.signal,
      onProgress: opts.onProgress,
    })
    remoteCandidates = remoteCandidates.concat(direct)
  }

  if (remoteCandidates.length === 0) {
    emitProgress(opts.onProgress, 'Discovering artists who recorded this song...', 0.12, 'musicbrainz')
    const artists = await discoverRecordingArtists({
      title: title,
      artist: artist,
      signal: opts.signal,
    })
    remoteCandidates = remoteCandidates.concat(await searchLyricsOvhForArtists({
      title: title,
      artists: artists,
      signal: opts.signal,
      onProgress: opts.onProgress,
    }))
  }

  let candidates = sortLyricsCandidates(
    dedupeCandidates(localArtistHits.concat(remoteCandidates)),
    title,
    artist
  )

  emitProgress(opts.onProgress, 'Lyrics search complete', 1, 'done')
  return finalizeLightResult(candidates)
}
