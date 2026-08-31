import { albumYearFromDate } from './bibliographicSearchUtils'
import { resolveArtistMbid } from './artistDiscographyClient'
import { fetchAlbumTracks } from './albumDiscographyClient'
import { musicBrainzGet } from './musicBrainzRequest'

const PAGE_SIZE = 100
const PAGE_DELAY_MS = 1000
/** Cap on release-groups retained (large catalogs like Dolly Parton). */
const MAX_ALBUMS = 300

function delay(ms) {
  return new Promise(function(resolve) {
    setTimeout(resolve, ms)
  })
}

function emitProgress(onProgress, message, progress) {
  if (typeof onProgress === 'function') {
    onProgress(message, progress)
  }
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

function summarizeReleaseGroup(releaseGroup) {
  if (!releaseGroup || !releaseGroup.id) return null
  const year = albumYearFromDate(releaseGroup['first-release-date'])
  return {
    releaseGroupId: releaseGroup.id,
    title: String(releaseGroup.title || '').trim(),
    year: year,
    primaryType: releaseGroup['primary-type'] || '',
    secondaryTypes: releaseGroup['secondary-types'] || [],
    artistName: releaseGroupArtistName(releaseGroup),
  }
}

/**
 * Map a release-group to a UI type chip category.
 */
export function albumTypeCategory(album) {
  const secondary = Array.isArray(album && album.secondaryTypes) ? album.secondaryTypes : []
  const primary = String(album && album.primaryType || '').trim()
  for (let i = 0; i < secondary.length; i += 1) {
    if (String(secondary[i] || '').toLowerCase() === 'compilation') return 'Compilation'
  }
  if (primary === 'Compilation') return 'Compilation'
  if (primary === 'Album') return 'Album'
  if (primary === 'EP') return 'EP'
  if (primary === 'Single') return 'Single'
  return 'Other'
}

/**
 * Filter albums by selected type categories. Empty/null categories → all albums.
 */
export function filterAlbumsByTypeCategories(albums, categories) {
  const list = Array.isArray(albums) ? albums : []
  if (!Array.isArray(categories) || !categories.length) return list.slice()
  const allowed = {}
  categories.forEach(function(cat) {
    const key = String(cat || '').trim()
    if (key) allowed[key] = true
  })
  return list.filter(function(album) {
    return !!allowed[albumTypeCategory(album)]
  })
}

async function fetchReleaseGroupPage(artistMbid, offset, signal) {
  const response = await musicBrainzGet('/release-group', {
    params: {
      artist: artistMbid,
      fmt: 'json',
      limit: PAGE_SIZE,
      offset: offset,
    },
    signal: signal,
  })
  const data = response.data || {}
  return {
    total: typeof data['release-group-count'] === 'number' ? data['release-group-count'] : 0,
    items: (data['release-groups'] || []).map(summarizeReleaseGroup).filter(Boolean),
  }
}

/**
 * Fetch album summaries for an artist from MusicBrainz release-groups.
 */
export async function fetchArtistAlbumDiscography(artistName, options) {
  const opts = options || {}
  const signal = opts.signal
  const onProgress = opts.onProgress
  const pageDelayMs = typeof opts.pageDelayMs === 'number' ? opts.pageDelayMs : PAGE_DELAY_MS
  const maxAlbums = typeof opts.maxAlbums === 'number' ? opts.maxAlbums : MAX_ALBUMS
  const queryName = String(artistName || '').trim()
  if (!queryName) {
    return { artistName: '', artistMbid: '', albums: [] }
  }

  const resolved = await resolveArtistMbid(queryName, signal, onProgress)
  if (!resolved) {
    emitProgress(onProgress, 'Artist not found', 100)
    return { artistName: queryName, artistMbid: '', albums: [] }
  }

  emitProgress(onProgress, 'Found ' + resolved.name + ' — loading albums…', 10)
  const albums = []
  let offset = 0
  let total = null
  let pageIndex = 0
  while (total === null || (offset < total && albums.length < maxAlbums)) {
    if (pageIndex > 0) await delay(pageDelayMs)
    if (signal && signal.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
    emitProgress(onProgress, 'Loading albums…', 10 + Math.min(70, Math.round((albums.length / maxAlbums) * 70)))
    const page = await fetchReleaseGroupPage(resolved.id, offset, signal)
    total = page.total
    page.items.forEach(function(album) {
      if (albums.length < maxAlbums) albums.push(album)
    })
    if (!page.items.length) break
    offset += PAGE_SIZE
    pageIndex += 1
    if (page.items.length < PAGE_SIZE) break
  }

  albums.sort(function(a, b) {
    const yearA = String(a.year || '')
    const yearB = String(b.year || '')
    if (yearA && yearB && yearA !== yearB) return yearB.localeCompare(yearA)
    return String(a.title || '').localeCompare(String(b.title || ''))
  })

  emitProgress(onProgress, 'Found ' + albums.length + ' album' + (albums.length === 1 ? '' : 's'), 100)
  return {
    artistName: resolved.name,
    artistMbid: resolved.id,
    albums: albums,
  }
}

/**
 * Load track titles for one album release-group.
 */
export async function fetchArtistAlbumTracks(albumSummary, artistName, options) {
  const opts = options || {}
  const signal = opts.signal
  const onProgress = opts.onProgress
  const album = albumSummary || {}
  const candidate = {
    releaseGroupId: album.releaseGroupId,
    albumName: album.title,
    artistName: album.artistName || artistName,
    year: album.year,
    label: album.title + (album.year ? ' (' + album.year + ')' : ''),
  }
  const result = await fetchAlbumTracks(candidate, album.title, {
    signal: signal,
    onProgress: onProgress,
  })
  return {
    titles: result.titles || [],
    albumName: result.albumName || album.title,
    artistName: result.artistName || artistName,
    needsPicker: !!result.needsPicker,
    candidates: result.candidates || [],
  }
}
