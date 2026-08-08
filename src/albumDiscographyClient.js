import {
  albumYearFromDate,
  BIBLIO_CONFIDENCE_HIGH,
  BIBLIO_CONFIDENCE_LOW,
  BIBLIO_CONFIDENCE_MEDIUM,
  confidenceRank,
  formatAlbumLabel,
  scoreAlbumTitleMatch,
  splitCandidatesByConfidence,
} from './bibliographicSearchUtils'
import {
  dedupeDiscographyTitles,
  resolveArtistMbid,
} from './artistDiscographyClient'
import { normalizeArtistKey, titleVariants } from './recordingArtistsClient'
import { musicBrainzGet } from './musicBrainzRequest'

const RELEASE_GROUP_SEARCH_LIMIT = 25
const MAX_CANDIDATES = 12

function emitProgress(onProgress, message, progress) {
  if (typeof onProgress === 'function') {
    onProgress(message, progress)
  }
}

function escapeQueryTerm(text) {
  return String(text || '').replace(/["\\]/g, '\\$&')
}

function releaseGroupArtistName(releaseGroup) {
  const credits = releaseGroup && releaseGroup['artist-credit']
  if (!Array.isArray(credits) || !credits.length) return ''
  const parts = []
  credits.forEach(function(credit) {
    if (credit && credit.name) parts.push(String(credit.name).trim())
    else if (credit && credit.artist && credit.artist.name) {
      parts.push(String(credit.artist.name).trim())
    }
  })
  return parts.filter(Boolean).join(', ')
}

function artistCreditMatchesHint(artistCreditName, artistHint) {
  const hintKey = normalizeArtistKey(artistHint)
  const creditKey = normalizeArtistKey(artistCreditName)
  if (!hintKey || !creditKey) return false
  if (hintKey === creditKey) return true
  return creditKey.indexOf(hintKey) >= 0 || hintKey.indexOf(creditKey) >= 0
}

function scoreReleaseGroup(releaseGroup, albumName, options) {
  const opts = options || {}
  if (!releaseGroup) return 0
  const titleScore = scoreAlbumTitleMatch(releaseGroup.title, albumName)
  if (titleScore === 0) return 0

  let score = titleScore
  const mbScore = typeof releaseGroup.score === 'number' ? releaseGroup.score : 0
  score += Math.min(40, Math.round(mbScore / 2.5))

  if (releaseGroup['primary-type'] === 'Album') score += 10
  const secondary = releaseGroup['secondary-types'] || []
  if (secondary.indexOf('Compilation') >= 0) score -= 25
  if (secondary.indexOf('Live') >= 0) score -= 15
  if (secondary.indexOf('Soundtrack') >= 0) score -= 5

  const artistName = releaseGroupArtistName(releaseGroup)
  if (opts.artistHint && artistCreditMatchesHint(artistName, opts.artistHint)) {
    score += 50
  }

  return score
}

function assignLookupConfidence(titleScore, artistMatched, rankScore, bestRankScore, ambiguousTitle) {
  if (titleScore < 70) return BIBLIO_CONFIDENCE_LOW
  if (titleScore === 100 && artistMatched) return BIBLIO_CONFIDENCE_HIGH
  if (titleScore === 100 && !ambiguousTitle && bestRankScore > 0 && rankScore >= bestRankScore - 5) {
    return BIBLIO_CONFIDENCE_HIGH
  }
  if (titleScore === 100 && rankScore >= bestRankScore - 8) return BIBLIO_CONFIDENCE_MEDIUM
  if (titleScore >= 70) return ambiguousTitle ? BIBLIO_CONFIDENCE_LOW : BIBLIO_CONFIDENCE_MEDIUM
  return BIBLIO_CONFIDENCE_LOW
}

function buildAlbumCandidate(releaseGroup, albumName, options) {
  const opts = options || {}
  const artistName = releaseGroupArtistName(releaseGroup)
  const year = albumYearFromDate(releaseGroup['first-release-date'])
  const label = formatAlbumLabel(releaseGroup.title, year)
  return {
    releaseGroupId: releaseGroup.id || '',
    albumName: String(releaseGroup.title || '').trim(),
    artistName: artistName,
    year: year,
    label: label,
    titleScore: scoreAlbumTitleMatch(releaseGroup.title, albumName),
    rankScore: opts.rankScore || 0,
    artistMatched: !!(opts.artistHint && artistCreditMatchesHint(artistName, opts.artistHint)),
    confidence: opts.confidence || BIBLIO_CONFIDENCE_MEDIUM,
    matchType: opts.artistHint && artistCreditMatchesHint(artistName, opts.artistHint)
      ? 'Artist match'
      : 'Album match',
    releaseMbid: '',
  }
}

async function searchReleaseGroups(albumName, artistMbid, signal) {
  const album = String(albumName || '').trim()
  if (!album) return []

  const seen = {}
  const groups = []
  const variants = titleVariants(album)

  for (let v = 0; v < variants.length; v += 1) {
    const searchTitle = variants[v]
    let query = 'releasegroup:"' + escapeQueryTerm(searchTitle) + '" AND primarytype:album'
    if (artistMbid) query += ' AND arid:' + artistMbid
    try {
      const response = await musicBrainzGet('/release-group', {
        params: { query: query, fmt: 'json', limit: RELEASE_GROUP_SEARCH_LIMIT },
        signal: signal,
      })
      ;((response.data && response.data['release-groups']) || []).forEach(function(releaseGroup) {
        if (!releaseGroup || !releaseGroup.id || seen[releaseGroup.id]) return
        if (scoreAlbumTitleMatch(releaseGroup.title, album) === 0) return
        seen[releaseGroup.id] = true
        groups.push(releaseGroup)
      })
    } catch (e) {
      // best-effort
    }
  }

  return groups
}

async function enrichReleaseGroupArtistCredit(releaseGroup, signal) {
  if (!releaseGroup || !releaseGroup.id) return releaseGroup
  if (releaseGroupArtistName(releaseGroup)) return releaseGroup
  try {
    const response = await musicBrainzGet('/release-group/' + releaseGroup.id, {
      params: { fmt: 'json', inc: 'artist-credits' },
      signal: signal,
    })
    return response.data || releaseGroup
  } catch (e) {
    return releaseGroup
  }
}

function pickAutoCandidate(candidates) {
  const list = Array.isArray(candidates) ? candidates.slice() : []
  if (!list.length) return null
  const highs = list.filter(function(candidate) {
    return candidate.confidence === BIBLIO_CONFIDENCE_HIGH
  })
  if (highs.length === 1) return highs[0]
  if (highs.length > 1) {
    highs.sort(function(a, b) { return (b.rankScore || 0) - (a.rankScore || 0) })
    const best = highs[0]
    const second = highs[1]
    if (best.rankScore - (second.rankScore || 0) >= 15) return best
    return null
  }
  if (list.length === 1 && list[0].confidence !== BIBLIO_CONFIDENCE_LOW) return list[0]
  return null
}

/**
 * Search MusicBrainz release-groups for albums matching a name.
 */
export async function searchAlbumsByName(albumName, artistName, options) {
  const opts = options || {}
  const signal = opts.signal
  const onProgress = opts.onProgress
  const queryAlbum = String(albumName || '').trim()
  const queryArtist = String(artistName || '').trim()
  if (!queryAlbum) {
    return { candidates: [], autoPick: null, needsPicker: false }
  }

  emitProgress(onProgress, 'Looking up album…', 5)
  let artistMbid = ''
  if (queryArtist) {
    const resolved = await resolveArtistMbid(queryArtist, signal, function(message) {
      emitProgress(onProgress, message, 12)
    })
    if (resolved) artistMbid = resolved.id
  }

  emitProgress(onProgress, 'Searching for “' + queryAlbum + '”…', 25)
  const releaseGroups = await searchReleaseGroups(queryAlbum, artistMbid, signal)
  if (!releaseGroups.length) {
    emitProgress(onProgress, 'Album not found', 100)
    return { candidates: [], autoPick: null, needsPicker: false }
  }

  const scored = []
  for (let i = 0; i < releaseGroups.length; i += 1) {
    const enriched = await enrichReleaseGroupArtistCredit(releaseGroups[i], signal)
    const rankScore = scoreReleaseGroup(enriched, queryAlbum, {
      artistHint: queryArtist,
    })
    if (rankScore <= 0) continue
    scored.push({ releaseGroup: enriched, rankScore: rankScore })
  }

  scored.sort(function(a, b) { return b.rankScore - a.rankScore })
  const bestRankScore = scored.length ? scored[0].rankScore : 0
  const ambiguousTitle = queryAlbum.split(/\s+/).length <= 2 && normalizeArtistKey(queryAlbum).length < 12

  const candidates = scored.slice(0, MAX_CANDIDATES).map(function(entry) {
    const titleScore = scoreAlbumTitleMatch(entry.releaseGroup.title, queryAlbum)
    const artistNameFromCredit = releaseGroupArtistName(entry.releaseGroup)
    const artistMatched = !!(queryArtist && artistCreditMatchesHint(artistNameFromCredit, queryArtist))
    const confidence = assignLookupConfidence(
      titleScore,
      artistMatched,
      entry.rankScore,
      bestRankScore,
      ambiguousTitle
    )
    return buildAlbumCandidate(entry.releaseGroup, queryAlbum, {
      artistHint: queryArtist,
      rankScore: entry.rankScore,
      confidence: confidence,
    })
  })

  const autoPick = pickAutoCandidate(candidates)
  const split = splitCandidatesByConfidence(candidates)
  const needsPicker = !autoPick && candidates.length > 0

  emitProgress(
    onProgress,
    'Found ' + candidates.length + ' album' + (candidates.length === 1 ? '' : 's'),
    100
  )

  return {
    candidates: candidates,
    autoPick: autoPick,
    needsPicker: needsPicker,
    suggestions: split.suggestions,
    autoApply: split.autoApply,
  }
}

function scoreReleaseMatch(release, albumName) {
  if (!release) return 0
  let score = scoreAlbumTitleMatch(release.title, albumName)
  if (release['release-group'] && release['release-group'].title) {
    score = Math.max(score, scoreAlbumTitleMatch(release['release-group'].title, albumName))
  }
  if (release.status === 'Official') score += 8
  if (release['release-group'] && release['release-group']['primary-type'] === 'Album') score += 5
  const secondary = release['release-group'] && release['release-group']['secondary-types']
  if (Array.isArray(secondary)) {
    if (secondary.indexOf('Compilation') >= 0) score -= 20
    if (secondary.indexOf('Live') >= 0) score -= 10
  }
  return score
}

function pickBestRelease(releases, albumName) {
  const list = Array.isArray(releases) ? releases.slice() : []
  if (!list.length) return null
  list.sort(function(a, b) {
    const scoreDiff = scoreReleaseMatch(b, albumName) - scoreReleaseMatch(a, albumName)
    if (scoreDiff !== 0) return scoreDiff
    const dateA = String(a.date || '')
    const dateB = String(b.date || '')
    return dateA.localeCompare(dateB)
  })
  return list[0]
}

function trackTitlesFromRelease(data) {
  const titles = []
  const media = data && Array.isArray(data.media) ? data.media : []
  media.forEach(function(medium) {
    const tracks = medium && Array.isArray(medium.tracks) ? medium.tracks : []
    tracks.forEach(function(track) {
      const title = track && (track.title || (track.recording && track.recording.title))
        ? String(track.title || track.recording.title).trim()
        : ''
      if (title) titles.push(title)
    })
  })
  return titles
}

async function browseReleasesForGroup(releaseGroupId, signal) {
  if (!releaseGroupId) return []
  const response = await musicBrainzGet('/release', {
    params: {
      'release-group': releaseGroupId,
      fmt: 'json',
      limit: 100,
    },
    signal: signal,
  })
  return (response.data && response.data.releases) || []
}

async function fetchReleaseTrackTitles(releaseMbid, signal, onProgress) {
  emitProgress(onProgress, 'Loading album tracks…', 70)
  const response = await musicBrainzGet('/release/' + releaseMbid, {
    params: { inc: 'recordings', fmt: 'json' },
    signal: signal,
  })
  return trackTitlesFromRelease(response.data || {})
}

/**
 * Load track titles for a chosen release-group or release MBID.
 */
export async function fetchAlbumTracks(candidate, albumName, options) {
  const opts = options || {}
  const signal = opts.signal
  const onProgress = opts.onProgress
  const pick = candidate || {}
  const queryAlbum = String(albumName || pick.albumName || '').trim()
  let releaseMbid = String(pick.releaseMbid || '').trim()
  let chosenRelease = null

  if (!releaseMbid && pick.releaseGroupId) {
    emitProgress(onProgress, 'Choosing best release…', 50)
    const releases = await browseReleasesForGroup(pick.releaseGroupId, signal)
    chosenRelease = pickBestRelease(releases, queryAlbum)
    if (chosenRelease && chosenRelease.id) releaseMbid = chosenRelease.id
  }

  if (!releaseMbid) {
    return {
      titles: [],
      albumName: pick.label || pick.albumName || queryAlbum,
      artistName: pick.artistName || '',
      releaseMbid: '',
    }
  }

  emitProgress(onProgress, 'Found ' + (chosenRelease && chosenRelease.title || pick.albumName || queryAlbum) + '…', 55)
  const rawTitles = await fetchReleaseTrackTitles(releaseMbid, signal, onProgress)
  emitProgress(onProgress, 'Building track list…', 95)
  const titles = dedupeDiscographyTitles(rawTitles)

  return {
    titles: titles,
    albumName: (chosenRelease && chosenRelease.title) || pick.albumName || queryAlbum,
    artistName: pick.artistName || '',
    releaseMbid: releaseMbid,
  }
}

/**
 * Look up track titles for a MusicBrainz album/release.
 * When the match is ambiguous, returns needsPicker + candidates instead of titles.
 */
export async function fetchAlbumDiscography(albumName, artistName, options) {
  const opts = options || {}
  const signal = opts.signal
  const onProgress = opts.onProgress
  const queryAlbum = String(albumName || '').trim()
  const queryArtist = String(artistName || '').trim()
  if (!queryAlbum) {
    return { titles: [], albumName: '', artistName: queryArtist, releaseMbid: '', needsPicker: false }
  }

  if (opts.candidate) {
    const tracks = await fetchAlbumTracks(opts.candidate, queryAlbum, {
      signal: signal,
      onProgress: onProgress,
    })
    emitProgress(onProgress, 'Found ' + tracks.titles.length + ' track' + (tracks.titles.length === 1 ? '' : 's'), 100)
    return Object.assign({ needsPicker: false, candidates: [] }, tracks)
  }

  const search = await searchAlbumsByName(queryAlbum, queryArtist, {
    signal: signal,
    onProgress: onProgress,
  })

  if (search.needsPicker) {
    return {
      titles: [],
      albumName: queryAlbum,
      artistName: queryArtist,
      releaseMbid: '',
      needsPicker: true,
      candidates: search.candidates || [],
    }
  }

  const pick = search.autoPick || (search.candidates && search.candidates[0]) || null
  if (!pick) {
    return {
      titles: [],
      albumName: queryAlbum,
      artistName: queryArtist,
      releaseMbid: '',
      needsPicker: false,
      candidates: search.candidates || [],
    }
  }

  const tracks = await fetchAlbumTracks(pick, queryAlbum, {
    signal: signal,
    onProgress: onProgress,
  })
  emitProgress(onProgress, 'Found ' + tracks.titles.length + ' track' + (tracks.titles.length === 1 ? '' : 's'), 100)
  return Object.assign({ needsPicker: false, candidates: search.candidates || [] }, tracks)
}
