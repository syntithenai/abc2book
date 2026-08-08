import axios from 'axios'
import { resolveArtistMbid } from './artistDiscographyClient'
import {
  ALBUM_CONFIDENCE_HIGH,
  ALBUM_CONFIDENCE_LOW,
  ALBUM_CONFIDENCE_MEDIUM,
  confidenceRank,
  escapeMusicBrainzQueryTerm,
  formatAlbumLabel,
  isAmbiguousTitle,
  scoreRecordingTitleMatch,
  splitCandidatesByConfidence,
} from './bibliographicSearchUtils'
import { isGenericArtist } from './genericArtistUtils'
import { normalizeMatchText } from './notationMatchUtils'
import {
  normalizeArtistKey,
  titleVariants,
} from './recordingArtistsClient'

export {
  ALBUM_CONFIDENCE_HIGH,
  ALBUM_CONFIDENCE_LOW,
  ALBUM_CONFIDENCE_MEDIUM,
  isAmbiguousTitle,
  scoreRecordingTitleMatch,
} from './bibliographicSearchUtils'

const MUSICBRAINZ_BASE = 'https://musicbrainz.org/ws/2'
const RECORDING_SEARCH_LIMIT = 15
const MAX_WORKS = 5
const MAX_PERFORMERS = 6
const MAX_RECORDINGS_PER_SOURCE = 8
const MAX_RELEASES_PER_RECORDING = 50

function mbRequestConfig(signal) {
  return {
    signal: signal,
  }
}

function emitProgress(onProgress, message, progress) {
  if (typeof onProgress === 'function') {
    onProgress(message, progress)
  }
}

function normalizeAlbumKey(text) {
  return normalizeMatchText(text)
}

function releaseGroupKey(release) {
  if (!release) return ''
  if (release['release-group'] && release['release-group'].id) {
    return String(release['release-group'].id)
  }
  return normalizeAlbumKey(releaseGroupTitle(release))
}

function pickEarlierAlbumLabel(existingLabel, nextLabel) {
  const existingYear = String(existingLabel || '').match(/\((\d{4})\)/)
  const nextYear = String(nextLabel || '').match(/\((\d{4})\)/)
  if (existingYear && nextYear && parseInt(nextYear[1], 10) < parseInt(existingYear[1], 10)) {
    return nextLabel
  }
  return existingLabel
}

function releaseGroupTitle(release) {
  if (!release) return ''
  if (release['release-group'] && release['release-group'].title) {
    return String(release['release-group'].title).trim()
  }
  return String(release.title || '').trim()
}

function releaseDate(release) {
  if (!release) return ''
  if (release.date) return String(release.date)
  if (release['release-group'] && release['release-group']['first-release-date']) {
    return String(release['release-group']['first-release-date'])
  }
  return ''
}

function workTitleMatches(workTitle, searchTitle) {
  const workKey = normalizeArtistKey(workTitle)
  const searchKey = normalizeArtistKey(searchTitle)
  if (!workKey || !searchKey) return false
  return workKey === searchKey
}

function recordingPerformerName(recording) {
  const credits = recording && recording['artist-credit']
  if (!Array.isArray(credits) || !credits.length) return ''
  return String(credits[0] && credits[0].name || '').trim()
}

function buildAlbumCandidate(albumLabel, options) {
  const opts = options || {}
  return {
    album: albumLabel,
    preview: albumLabel,
    source: 'MusicBrainz',
    confidence: opts.confidence || ALBUM_CONFIDENCE_MEDIUM,
    matchType: opts.matchType || '',
    performer: opts.performer || '',
    recordingTitle: opts.recordingTitle || '',
  }
}

function addCandidate(store, seen, candidate) {
  const label = String(candidate && candidate.album || '').trim()
  const key = normalizeAlbumKey(label)
  if (!key || !label) return
  if (Object.prototype.hasOwnProperty.call(seen, key)) {
    const idx = seen[key]
    const existing = store[idx]
    if (confidenceRank(candidate.confidence) > confidenceRank(existing.confidence)) {
      store[idx] = candidate
    } else if (
      confidenceRank(candidate.confidence) === confidenceRank(existing.confidence)
      && candidate.matchType
      && !existing.matchType
    ) {
      store[idx] = candidate
    }
    return
  }
  seen[key] = store.length
  store.push(candidate)
}

async function searchRecordings(title, artistMbid, signal) {
  const queryTitle = String(title || '').trim()
  if (!queryTitle) return []
  let query = 'recording:"' + escapeMusicBrainzQueryTerm(queryTitle) + '"'
  if (artistMbid) query += ' AND arid:' + artistMbid
  const response = await axios.get(MUSICBRAINZ_BASE + '/recording', {
    params: { query: query, fmt: 'json', limit: RECORDING_SEARCH_LIMIT },
    ...mbRequestConfig(signal),
  })
  return (response.data && response.data.recordings) || []
}

async function searchMatchingWorks(title, signal) {
  const exactWorks = []
  const seenWorkIds = {}
  const variants = titleVariants(title)

  for (let v = 0; v < variants.length; v += 1) {
    const searchTitle = variants[v]
    let works = []
    try {
      const response = await axios.get(MUSICBRAINZ_BASE + '/work', {
        params: {
          query: 'work:"' + escapeMusicBrainzQueryTerm(searchTitle) + '"',
          fmt: 'json',
          limit: 15,
        },
        ...mbRequestConfig(signal),
      })
      works = (response.data && response.data.works) || []
    } catch (e) {
      continue
    }

    works.forEach(function(work) {
      const workId = work && work.id
      if (!workId || seenWorkIds[workId]) return
      const score = typeof work.score === 'number' ? work.score : 0
      if (score < 70) return
      if (!workTitleMatches(work.title, searchTitle)) return
      seenWorkIds[workId] = true
      exactWorks.push({ score: score, work: work })
    })
  }

  exactWorks.sort(function(a, b) { return b.score - a.score })
  return exactWorks.slice(0, MAX_WORKS)
}

async function fetchWorkWriters(workId, signal) {
  const writers = []
  try {
    const response = await axios.get(MUSICBRAINZ_BASE + '/work/' + workId, {
      params: { fmt: 'json', inc: 'artist-rels' },
      ...mbRequestConfig(signal),
    })
    const relations = (response.data && response.data.relations) || []
    relations.forEach(function(relation) {
      const relType = String(relation && relation.type || '').trim().toLowerCase()
      if (relType !== 'composer' && relType !== 'lyricist' && relType !== 'writer' && relType !== 'librettist') {
        return
      }
      const name = relation && relation.artist && relation.artist.name
      if (name) writers.push(String(name).trim())
    })
  } catch (e) {
    // best-effort
  }
  return writers
}

function composerMatchesWriters(composer, writers) {
  const composerKey = normalizeArtistKey(composer)
  if (!composerKey || isGenericArtist(composer)) return false
  return writers.some(function(writer) {
    return normalizeArtistKey(writer) === composerKey
  })
}

async function browseRecordingsForWork(workId, signal) {
  try {
    const response = await axios.get(MUSICBRAINZ_BASE + '/recording', {
      params: { work: workId, fmt: 'json', limit: 25 },
      ...mbRequestConfig(signal),
    })
    return (response.data && response.data.recordings) || []
  } catch (e) {
    return []
  }
}

function chooseRecordings(recordings, queryTitle, maxCount) {
  const limit = typeof maxCount === 'number' ? maxCount : MAX_RECORDINGS_PER_SOURCE
  const ranked = recordings.slice().sort(function(a, b) {
    return scoreRecordingTitleMatch(b, queryTitle) - scoreRecordingTitleMatch(a, queryTitle)
  })
  const exact = ranked.filter(function(recording) {
    return scoreRecordingTitleMatch(recording, queryTitle) === 100
  })
  if (exact.length > 0) return exact.slice(0, limit)
  const fuzzy = ranked.filter(function(recording) {
    return scoreRecordingTitleMatch(recording, queryTitle) >= 70
  })
  if (fuzzy.length > 0) return fuzzy.slice(0, limit)
  return ranked.slice(0, Math.min(3, limit))
}

async function fetchReleasesForRecording(recordingId, signal) {
  const response = await axios.get(MUSICBRAINZ_BASE + '/release', {
    params: { recording: recordingId, fmt: 'json', limit: MAX_RELEASES_PER_RECORDING },
    ...mbRequestConfig(signal),
  })
  return (response.data && response.data.releases) || []
}

async function collectAlbumCandidatesFromRecordings(recordings, queryTitle, context, signal, onProgress, progressBase) {
  const ctx = context || {}
  const chosen = chooseRecordings(recordings, queryTitle, ctx.maxRecordings)
  const store = []
  const seen = {}

  for (let i = 0; i < chosen.length; i += 1) {
    const recording = chosen[i]
    if (!recording || !recording.id) continue
    const titleScore = scoreRecordingTitleMatch(recording, queryTitle)
    const performer = recordingPerformerName(recording)
    const base = typeof progressBase === 'number' ? progressBase : 40
    emitProgress(onProgress, 'Loading albums…', base + Math.round((i / Math.max(chosen.length, 1)) * 45))

    let releases = []
    try {
      releases = await fetchReleasesForRecording(recording.id, signal)
    } catch (e) {
      continue
    }

    releases.forEach(function(release) {
      const groupTitle = releaseGroupTitle(release)
      const key = releaseGroupKey(release)
      let label = formatAlbumLabel(groupTitle, releaseDate(release))
      if (!groupTitle || !key || !label) return
      if (Object.prototype.hasOwnProperty.call(ctx.releaseSeen || {}, key)) {
        label = pickEarlierAlbumLabel(ctx.releaseSeen[key], label)
        ctx.releaseSeen[key] = label
      } else if (ctx.releaseSeen) {
        ctx.releaseSeen[key] = label
      }

      let confidence = ctx.confidence || ALBUM_CONFIDENCE_MEDIUM
      if (ctx.confidence === ALBUM_CONFIDENCE_LOW) {
        confidence = ALBUM_CONFIDENCE_LOW
      } else if (titleScore < 100) {
        confidence = ALBUM_CONFIDENCE_LOW
      } else if (ctx.ambiguousTitle && !ctx.workMatched && !ctx.performerScoped) {
        confidence = ALBUM_CONFIDENCE_MEDIUM
      }

      addCandidate(store, seen, buildAlbumCandidate(label, {
        confidence: confidence,
        matchType: ctx.matchType || '',
        performer: ctx.performer || performer,
        recordingTitle: recording.title || queryTitle,
      }))
    })
  }

  return store
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
  return ordered.slice(0, MAX_PERFORMERS)
}

function splitCandidates(candidates) {
  return splitCandidatesByConfidence(candidates)
}

/**
 * Find album titles that contain a recording matching the song title.
 * Returns ranked candidates with confidence tiers for selective auto-apply.
 */
export async function fetchAlbumsForSong(title, artistName, options) {
  const opts = options || {}
  const signal = opts.signal
  const onProgress = opts.onProgress
  const queryTitle = String(title || '').trim()
  const queryArtist = String(artistName || '').trim()
  const performers = normalizePerformerList(opts.performers, queryArtist)
  const ambiguousTitle = isAmbiguousTitle(queryTitle)
  if (!queryTitle) {
    return { albums: [], candidates: [], autoApply: [], suggestions: [] }
  }

  const allCandidates = []
  const candidateSeen = {}
  const releaseSeen = {}

  function mergeCandidates(found) {
    found.forEach(function(candidate) {
      addCandidate(allCandidates, candidateSeen, candidate)
    })
  }

  emitProgress(onProgress, 'Looking up works…', 5)
  const works = await searchMatchingWorks(queryTitle, signal)
  let composerVerifiedWork = false

  for (let w = 0; w < works.length; w += 1) {
    const work = works[w].work
    if (!work || !work.id) continue
    const writers = await fetchWorkWriters(work.id, signal)
    const composerMatch = composerMatchesWriters(queryArtist, writers)
    if (composerMatch) composerVerifiedWork = true

    emitProgress(onProgress, 'Loading work recordings…', 10 + Math.round((w / Math.max(works.length, 1)) * 15))
    const workRecordings = await browseRecordingsForWork(work.id, signal)
    const workCandidates = await collectAlbumCandidatesFromRecordings(
      workRecordings,
      queryTitle,
      {
        confidence: composerMatch || !ambiguousTitle
          ? ALBUM_CONFIDENCE_HIGH
          : ALBUM_CONFIDENCE_MEDIUM,
        matchType: composerMatch ? 'Work · composer match' : 'Work match',
        workMatched: true,
        ambiguousTitle: ambiguousTitle,
        releaseSeen: releaseSeen,
        maxRecordings: MAX_RECORDINGS_PER_SOURCE,
      },
      signal,
      onProgress,
      25
    )
    mergeCandidates(workCandidates)
  }

  emitProgress(onProgress, 'Looking up performers…', 45)
  let artistMbid = ''
  if (queryArtist && !isGenericArtist(queryArtist)) {
    const resolved = await resolveArtistMbid(queryArtist, signal, function(message) {
      emitProgress(onProgress, message, 50)
    })
    if (resolved) artistMbid = resolved.id
  }

  if (artistMbid) {
    emitProgress(onProgress, 'Searching for “' + queryTitle + '”…', 55)
    const artistRecordings = await searchRecordings(queryTitle, artistMbid, signal)
    const artistCandidates = await collectAlbumCandidatesFromRecordings(
      artistRecordings,
      queryTitle,
      {
        confidence: ALBUM_CONFIDENCE_HIGH,
        matchType: 'Artist match',
        performer: queryArtist,
        performerScoped: true,
        ambiguousTitle: ambiguousTitle,
        releaseSeen: releaseSeen,
      },
      signal,
      onProgress,
      58
    )
    mergeCandidates(artistCandidates)
  }

  const performerNames = performers.filter(function(name) {
    return normalizeArtistKey(name) !== normalizeArtistKey(queryArtist)
  })

  for (let p = 0; p < performerNames.length; p += 1) {
    const performerName = performerNames[p]
    emitProgress(onProgress, 'Searching “' + performerName + '”…', 60 + Math.round((p / Math.max(performerNames.length, 1)) * 20))
    let performerMbid = ''
    try {
      const resolved = await resolveArtistMbid(performerName, signal)
      if (resolved) performerMbid = resolved.id
    } catch (e) {
      continue
    }
    if (!performerMbid) continue
    const performerRecordings = await searchRecordings(queryTitle, performerMbid, signal)
    const performerCandidates = await collectAlbumCandidatesFromRecordings(
      performerRecordings,
      queryTitle,
      {
        confidence: ALBUM_CONFIDENCE_HIGH,
        matchType: 'Performer match',
        performer: performerName,
        performerScoped: true,
        ambiguousTitle: ambiguousTitle,
        releaseSeen: releaseSeen,
      },
      signal,
      onProgress,
      62 + Math.round((p / Math.max(performerNames.length, 1)) * 18)
    )
    mergeCandidates(performerCandidates)
  }

  const hasStrongMatches = allCandidates.some(function(candidate) {
    return candidate.confidence === ALBUM_CONFIDENCE_HIGH
  })

  if (!hasStrongMatches) {
    emitProgress(onProgress, 'Broad title search (review suggestions)…', 85)
    const broadRecordings = await searchRecordings(queryTitle, '', signal)
    const broadCandidates = await collectAlbumCandidatesFromRecordings(
      broadRecordings,
      queryTitle,
      {
        confidence: ambiguousTitle || !composerVerifiedWork
          ? ALBUM_CONFIDENCE_LOW
          : ALBUM_CONFIDENCE_MEDIUM,
        matchType: ambiguousTitle ? 'Possible homonym' : 'Title match',
        ambiguousTitle: ambiguousTitle,
        releaseSeen: releaseSeen,
      },
      signal,
      onProgress,
      88
    )
    mergeCandidates(broadCandidates)
  }

  const split = splitCandidates(allCandidates)
  const albumLabels = allCandidates.map(function(candidate) { return candidate.album })

  emitProgress(
    onProgress,
    'Found ' + allCandidates.length + ' album' + (allCandidates.length === 1 ? '' : 's'),
    100
  )

  return {
    albums: albumLabels,
    candidates: allCandidates,
    autoApply: split.autoApply,
    suggestions: split.suggestions,
  }
}
