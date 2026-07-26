import { resolveArtistMbid } from './artistDiscographyClient'
import {
  BIBLIO_CONFIDENCE_HIGH,
  BIBLIO_CONFIDENCE_LOW,
  BIBLIO_CONFIDENCE_MEDIUM,
  isAmbiguousTitle,
  mergeCandidateByConfidence,
  pickProminentWriter,
  scoreRecordingTitleMatch,
  sortCandidatesByConfidence,
  splitCandidatesByConfidence,
} from './bibliographicSearchUtils'
import { buildExternalSearchQuestion, buildGoogleSearchQuestionUrl } from './externalSearchLinks'
import {
  discoverWorkWritersWithProminence,
  isGenericArtist,
  normalizeArtistKey,
  searchRecordingsScoped,
} from './recordingArtistsClient'

function emitProgress(onProgress, message, progress) {
  if (typeof onProgress === 'function') {
    onProgress(message, progress)
  }
}

function buildArtistCandidate(name, options) {
  const opts = options || {}
  const artist = String(name || '').trim()
  return {
    artist: artist,
    role: opts.role || '',
    source: opts.source || 'MusicBrainz',
    preview: opts.preview || artist,
    confidence: opts.confidence || BIBLIO_CONFIDENCE_MEDIUM,
    matchType: opts.matchType || '',
  }
}

function addArtistCandidate(store, seen, candidate) {
  if (!candidate || !candidate.artist || isGenericArtist(candidate.artist)) return
  mergeCandidateByConfidence(store, seen, candidate, function(entry) {
    return normalizeArtistKey(entry.artist)
  })
}

function mergeCandidates(store, seen, found) {
  ;(found || []).forEach(function(candidate) {
    addArtistCandidate(store, seen, candidate)
  })
}

function composerMatchesWriter(composer, writerName) {
  const composerKey = normalizeArtistKey(composer)
  if (!composerKey || isGenericArtist(composer)) return false
  return normalizeArtistKey(writerName) === composerKey
}

async function collectPerformersFromRecordings(recordings, queryTitle, context) {
  const ctx = context || {}
  const found = []
  ;(recordings || []).forEach(function(recording) {
    const titleScore = scoreRecordingTitleMatch(recording, queryTitle)
    if (titleScore < 70) return
    let confidence = ctx.confidence || BIBLIO_CONFIDENCE_MEDIUM
    if (titleScore < 100) {
      confidence = BIBLIO_CONFIDENCE_LOW
    } else if (ctx.ambiguousTitle && !ctx.performerScoped) {
      confidence = confidence === BIBLIO_CONFIDENCE_HIGH
        ? BIBLIO_CONFIDENCE_MEDIUM
        : confidence
    }
    ;(recording['artist-credit'] || []).forEach(function(credit) {
      const name = credit && credit.name
      if (!name || isGenericArtist(name)) return
      found.push(buildArtistCandidate(name, {
        role: 'performer',
        source: 'MusicBrainz',
        preview: name,
        confidence: confidence,
        matchType: ctx.matchType || '',
      }))
    })
  })
  return found
}

function normalizePerformerList(performers, composer) {
  const ordered = []
  const seen = {}
  function add(name) {
    const trimmed = String(name || '').trim()
    if (!trimmed || isGenericArtist(trimmed)) return
    const key = normalizeArtistKey(trimmed)
    if (seen[key]) return
    seen[key] = true
    ordered.push(trimmed)
  }
  if (Array.isArray(performers)) {
    performers.forEach(add)
  }
  add(composer)
  return ordered
}

/**
 * MusicBrainz-based artist chip candidates for the multi-artist field.
 */
export async function searchArtists(options) {
  const opts = options || {}
  const title = String(opts.title || '').trim()
  if (!title) {
    return { empty: true, candidates: [], autoApply: [], suggestions: [] }
  }
  const signal = opts.signal
  const maxArtists = 20
  const queryArtist = String(opts.artist || '').trim()
  const performers = normalizePerformerList(opts.performers, queryArtist)
  const ambiguousTitle = isAmbiguousTitle(title)
  const store = []
  const seen = {}

  emitProgress(opts.onProgress, 'Looking up writers…', 0.1)
  const workResult = await discoverWorkWritersWithProminence({
    title: title,
    maxWriters: maxArtists,
    signal: signal,
  })
  const writers = (workResult && workResult.writers) || []
  const prominentWriter = pickProminentWriter(writers)

  writers.forEach(function(writer) {
    const name = typeof writer === 'string' ? writer : writer.artist
    if (!name) return
    let confidence = BIBLIO_CONFIDENCE_MEDIUM
    if (prominentWriter && normalizeArtistKey(prominentWriter.artist) === normalizeArtistKey(name)) {
      confidence = BIBLIO_CONFIDENCE_HIGH
    }
    if (composerMatchesWriter(queryArtist, name)) {
      confidence = BIBLIO_CONFIDENCE_HIGH
    }
    if (ambiguousTitle && confidence === BIBLIO_CONFIDENCE_HIGH && !composerMatchesWriter(queryArtist, name)) {
      confidence = BIBLIO_CONFIDENCE_MEDIUM
    }
    addArtistCandidate(store, seen, buildArtistCandidate(name, {
      role: 'writer',
      source: 'MusicBrainz',
      preview: name,
      confidence: confidence,
      matchType: 'Work · writer',
    }))
  })

  emitProgress(opts.onProgress, 'Searching performers…', 0.45)
  let artistMbid = ''
  if (queryArtist && !isGenericArtist(queryArtist)) {
    const resolved = await resolveArtistMbid(queryArtist, signal, function(message) {
      emitProgress(opts.onProgress, message, 0.5)
    })
    if (resolved) artistMbid = resolved.id
  }

  if (artistMbid) {
    const artistRecordings = await searchRecordingsScoped(title, artistMbid, {
      signal: signal,
      limit: 15,
    })
    mergeCandidates(store, seen, await collectPerformersFromRecordings(artistRecordings, title, {
      confidence: BIBLIO_CONFIDENCE_HIGH,
      matchType: 'Composer match',
      performerScoped: true,
      ambiguousTitle: ambiguousTitle,
    }))
  }

  const performerNames = performers.filter(function(name) {
    return normalizeArtistKey(name) !== normalizeArtistKey(queryArtist)
  })

  for (let p = 0; p < performerNames.length; p += 1) {
    const performerName = performerNames[p]
    emitProgress(opts.onProgress, 'Searching “' + performerName + '”…', 0.55 + (p / Math.max(performerNames.length, 1)) * 0.2)
    let performerMbid = ''
    try {
      const resolved = await resolveArtistMbid(performerName, signal)
      if (resolved) performerMbid = resolved.id
    } catch (e) {
      continue
    }
    if (!performerMbid) continue
    const performerRecordings = await searchRecordingsScoped(title, performerMbid, {
      signal: signal,
      limit: 15,
    })
    mergeCandidates(store, seen, await collectPerformersFromRecordings(performerRecordings, title, {
      confidence: BIBLIO_CONFIDENCE_HIGH,
      matchType: 'Performer match',
      performerScoped: true,
      ambiguousTitle: ambiguousTitle,
    }))
  }

  const hasStrongMatches = store.some(function(candidate) {
    return candidate.confidence === BIBLIO_CONFIDENCE_HIGH
  })

  if (!hasStrongMatches) {
    emitProgress(opts.onProgress, 'Broad title search (review suggestions)…', 0.85)
    const broadRecordings = await searchRecordingsScoped(title, '', {
      signal: signal,
      limit: 15,
    })
    mergeCandidates(store, seen, await collectPerformersFromRecordings(broadRecordings, title, {
      confidence: ambiguousTitle ? BIBLIO_CONFIDENCE_LOW : BIBLIO_CONFIDENCE_MEDIUM,
      matchType: ambiguousTitle ? 'Possible homonym' : 'Title match',
      ambiguousTitle: ambiguousTitle,
    }))
  }

  const capped = sortCandidatesByConfidence(store).slice(0, maxArtists)
  const split = splitCandidatesByConfidence(capped)

  if (capped.length === 0) {
    return { empty: true, candidates: [], autoApply: [], suggestions: [] }
  }
  if (capped.length === 1) {
    return Object.assign({
      empty: false,
      multiple: false,
      autoApply: split.autoApply,
      suggestions: split.suggestions,
    }, capped[0])
  }
  return {
    empty: false,
    multiple: true,
    candidates: capped,
    autoApply: split.autoApply,
    suggestions: split.suggestions,
  }
}

export function buildGoogleArtistsSearchQuestion(title, artist) {
  return buildExternalSearchQuestion('artists', title, artist)
}

export function buildGoogleArtistsSearchUrl(title, artist) {
  return buildGoogleSearchQuestionUrl(buildGoogleArtistsSearchQuestion(title, artist))
}
