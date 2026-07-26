import axios from 'axios'
import {
  dedupeDiscographyTitles,
  resolveArtistMbid,
} from './artistDiscographyClient'

const MUSICBRAINZ_BASE = 'https://musicbrainz.org/ws/2'
const CLIENT_USER_AGENT = 'ABC2Book/1.0 (https://tunebook.net)'

function mbRequestConfig(signal) {
  return {
    headers: { 'User-Agent': CLIENT_USER_AGENT },
    signal: signal,
  }
}

function emitProgress(onProgress, message, progress) {
  if (typeof onProgress === 'function') {
    onProgress(message, progress)
  }
}

function escapeQueryTerm(text) {
  return String(text || '').replace(/["\\]/g, '\\$&')
}

function normalizeAlbumTitle(text) {
  return String(text || '').trim().toLowerCase()
}

function scoreReleaseMatch(release, albumName) {
  if (!release) return 0
  const wanted = normalizeAlbumTitle(albumName)
  const title = normalizeAlbumTitle(release.title)
  if (!wanted || !title) return 0
  let score = 0
  if (title === wanted) score += 100
  else if (title.indexOf(wanted) >= 0 || wanted.indexOf(title) >= 0) score += 60
  if (release['release-group'] && release['release-group']['primary-type'] === 'Album') score += 10
  if (release.status === 'Official') score += 5
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

async function searchReleases(albumName, artistMbid, signal) {
  const album = String(albumName || '').trim()
  if (!album) return []
  let query = 'release:"' + escapeQueryTerm(album) + '"'
  if (artistMbid) query += ' AND arid:' + artistMbid
  const response = await axios.get(MUSICBRAINZ_BASE + '/release', {
    params: { query: query, fmt: 'json', limit: 25 },
    ...mbRequestConfig(signal),
  })
  return (response.data && response.data.releases) || []
}

async function fetchReleaseTrackTitles(releaseMbid, signal, onProgress) {
  emitProgress(onProgress, 'Loading album tracks…', 70)
  const response = await axios.get(MUSICBRAINZ_BASE + '/release/' + releaseMbid, {
    params: { inc: 'recordings', fmt: 'json' },
    ...mbRequestConfig(signal),
  })
  return trackTitlesFromRelease(response.data || {})
}

/**
 * Look up track titles for a MusicBrainz album/release.
 */
export async function fetchAlbumDiscography(albumName, artistName, options) {
  const opts = options || {}
  const signal = opts.signal
  const onProgress = opts.onProgress
  const queryAlbum = String(albumName || '').trim()
  const queryArtist = String(artistName || '').trim()
  if (!queryAlbum) {
    return { titles: [], albumName: '', artistName: queryArtist, releaseMbid: '' }
  }

  emitProgress(onProgress, 'Looking up album…', 5)
  let artistMbid = ''
  let artistLabel = queryArtist
  if (queryArtist) {
    const resolved = await resolveArtistMbid(queryArtist, signal, function(message) {
      emitProgress(onProgress, message, 15)
    })
    if (resolved) {
      artistMbid = resolved.id
      artistLabel = resolved.name
    }
  }

  emitProgress(onProgress, 'Searching for “' + queryAlbum + '”…', 30)
  const releases = await searchReleases(queryAlbum, artistMbid, signal)
  const chosen = pickBestRelease(releases, queryAlbum)
  if (!chosen || !chosen.id) {
    emitProgress(onProgress, 'Album not found', 100)
    return { titles: [], albumName: queryAlbum, artistName: artistLabel, releaseMbid: '' }
  }

  emitProgress(onProgress, 'Found ' + (chosen.title || queryAlbum) + '…', 55)
  const rawTitles = await fetchReleaseTrackTitles(chosen.id, signal, onProgress)
  emitProgress(onProgress, 'Building track list…', 95)
  const titles = dedupeDiscographyTitles(rawTitles)
  emitProgress(onProgress, 'Found ' + titles.length + ' track' + (titles.length === 1 ? '' : 's'), 100)

  return {
    titles: titles,
    albumName: chosen.title || queryAlbum,
    artistName: artistLabel,
    releaseMbid: chosen.id,
  }
}
