import { browseMusicCollection } from './musicCollectionCuratorClient'
import { collectionEntryToCandidate, artistNamesMatch } from './artistDiscographyPlaybackResolver'
import { discographyTitlesMatch } from './artistDiscographyClient'
import { mediaArtistTitleIdentityKey } from './importTitleMatch'
import { musicCollectionCandidateIdentityKey, materializeKey } from './mediaSearchTuneMaterialize'

export function mediaArtistTitleDedupeKey(title, artist) {
  return mediaArtistTitleIdentityKey(title, artist)
}

export function collectionEntriesMatchByArtistTitle(left, right) {
  const keyA = mediaArtistTitleDedupeKey(left && left.title, left && left.artist)
  const keyB = mediaArtistTitleDedupeKey(right && right.title, right && right.artist)
  if (keyA && keyB && keyA === keyB) return true
  const titleA = String(left && left.title || '').trim()
  const titleB = String(right && right.title || '').trim()
  if (!titleA || !titleB || !discographyTitlesMatch(titleA, titleB)) return false
  return artistNamesMatch(left && left.artist, right && right.artist)
}

export function candidateMatchesArtistTitle(candidate, title, artist) {
  const candidateKey = mediaArtistTitleDedupeKey(candidate && candidate.title, candidate && candidate.artist)
  const targetKey = mediaArtistTitleDedupeKey(title, artist)
  if (candidateKey && targetKey && candidateKey === targetKey) return true
  const candidateTitle = String(candidate && candidate.title || '').trim()
  if (!candidateTitle || !title) return false
  if (!discographyTitlesMatch(candidateTitle, title)) return false
  return artistNamesMatch(candidate && candidate.artist, artist)
}

export function candidateMatchesSeenArtistTitles(candidate, seenList) {
  const key = mediaArtistTitleDedupeKey(candidate && candidate.title, candidate && candidate.artist)
  if (key) {
    for (let i = 0; i < seenList.length; i += 1) {
      const seenKey = mediaArtistTitleDedupeKey(seenList[i].title, seenList[i].artist)
      if (seenKey && seenKey === key) return true
    }
  }
  const title = String(candidate && candidate.title || '').trim()
  if (!title) return false
  const artist = String(candidate && candidate.artist || '').trim()
  for (let i = 0; i < seenList.length; i += 1) {
    if (candidateMatchesArtistTitle(candidate, seenList[i].title, seenList[i].artist)) {
      return true
    }
  }
  return false
}

export function dedupeMediaSearchCandidates(candidates) {
  const kept = []
  const seenMediaKeys = {}
  const seenArtistTitleKeys = {}
  const seenArtistTitles = []
  ;(Array.isArray(candidates) ? candidates : []).forEach(function(candidate) {
    if (!candidate) return
    const titleArtistKey = mediaArtistTitleDedupeKey(candidate.title, candidate.artist)
    if (titleArtistKey && seenArtistTitleKeys[titleArtistKey]) return
    if (candidateMatchesSeenArtistTitles(candidate, seenArtistTitles)) return
    const mediaKey = musicCollectionCandidateIdentityKey(candidate) || materializeKey(candidate)
    if (mediaKey) {
      if (seenMediaKeys[mediaKey]) return
      seenMediaKeys[mediaKey] = true
    }
    if (titleArtistKey) seenArtistTitleKeys[titleArtistKey] = true
    seenArtistTitles.push({
      title: String(candidate.title || '').trim(),
      artist: String(candidate.artist || '').trim(),
    })
    kept.push(candidate)
  })
  return kept
}

function candidateDuplicatesAlbumTrack(candidate, track) {
  if (!candidate || !track) return false
  const other = track.candidate
  if (!other) return false
  const pathKey = musicCollectionCandidateIdentityKey(candidate)
  const otherPathKey = musicCollectionCandidateIdentityKey(other)
  if (pathKey && otherPathKey && pathKey === otherPathKey) return true
  return candidateMatchesArtistTitle(
    candidate,
    other.title || track.title,
    other.artist
  )
}

function albumAcceptsCandidate(candidate, tracks) {
  const list = Array.isArray(tracks) ? tracks : []
  for (let i = 0; i < list.length; i += 1) {
    if (candidateDuplicatesAlbumTrack(candidate, list[i])) return false
  }
  return true
}

function dedupeCollectionEntries(entries) {
  const kept = []
  ;(Array.isArray(entries) ? entries : []).forEach(function(entry) {
    if (!entry) return
    const candidate = collectionEntryToCandidate(entry)
    const pathKey = candidate ? musicCollectionCandidateIdentityKey(candidate) : ''
    if (pathKey) {
      for (let i = 0; i < kept.length; i += 1) {
        const keptCandidate = collectionEntryToCandidate(kept[i])
        const keptPathKey = keptCandidate ? musicCollectionCandidateIdentityKey(keptCandidate) : ''
        if (pathKey === keptPathKey) return
      }
    }
    for (let i = 0; i < kept.length; i += 1) {
      if (collectionEntriesMatchByArtistTitle(entry, kept[i])) return
    }
    kept.push(entry)
  })
  return kept
}

function normalizeAlbumKey(title) {
  return String(title || '').trim().toLowerCase()
}

function albumSortKey(album) {
  const year = String(album.year || '').trim()
  return [year ? (9999 - Number(year)) : 9999, String(album.title || '').toLowerCase()].join('\0')
}

export function groupCollectionEntriesByAlbum(entries) {
  const albumsByKey = {}
  const albums = []
  ;(Array.isArray(entries) ? entries : []).forEach(function(entry) {
    if (!entry) return
    const albumTitle = String(entry.album || '').trim() || 'Unknown album'
    const albumKey = normalizeAlbumKey(albumTitle)
    if (!albumsByKey[albumKey]) {
      albumsByKey[albumKey] = {
        albumKey: albumKey,
        title: albumTitle,
        year: String(entry.year || '').trim(),
        tracks: [],
      }
      albums.push(albumsByKey[albumKey])
    }
    const candidate = collectionEntryToCandidate(entry)
    if (!candidate) return
    if (!albumAcceptsCandidate(candidate, albumsByKey[albumKey].tracks)) return
    albumsByKey[albumKey].tracks.push({
      title: candidate.title || entry.title || 'Track',
      candidate: candidate,
    })
    if (!albumsByKey[albumKey].year && entry.year) {
      albumsByKey[albumKey].year = String(entry.year).trim()
    }
  })
  albums.sort(function(a, b) {
    return albumSortKey(a).localeCompare(albumSortKey(b))
  })
  albums.forEach(function(album) {
    album.tracks.sort(function(left, right) {
      return String(left.title || '').localeCompare(String(right.title || ''))
    })
  })
  return albums.filter(function(album) {
    return album.tracks.length > 0
  })
}

/**
 * Load albums/tracks for an artist from available local media files only.
 */
export async function loadArtistMediaAlbums(artistName, options) {
  const opts = options || {}
  const queryArtist = String(artistName || '').trim()
  if (!queryArtist) {
    return { artistName: '', albums: [] }
  }
  const body = await browseMusicCollection({
    artist: queryArtist,
    limit: opts.limit || 500,
    accessToken: opts.accessToken,
    token: opts.accessToken,
    signal: opts.signal,
  })
  const entries = dedupeCollectionEntries((body.entries || []).filter(function(entry) {
    return artistNamesMatch(entry && entry.artist, queryArtist)
  }))
  return {
    artistName: queryArtist,
    albums: groupCollectionEntriesByAlbum(entries),
  }
}
