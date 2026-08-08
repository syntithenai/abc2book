import { discographyTitlesMatch } from './artistDiscographyClient'
import { browseMusicCollection } from './musicCollectionCuratorClient'
import { searchMediaLinks } from './mediaLinkSearchClient'
import { normalizeArtistKey } from './recordingArtistsClient'

export function artistNamesMatch(artistA, artistB) {
  const left = String(artistA || '').trim()
  const right = String(artistB || '').trim()
  if (!left || !right) return false
  const keyA = normalizeArtistKey(left)
  const keyB = normalizeArtistKey(right)
  if (!keyA || !keyB) return false
  if (keyA === keyB) return true
  if (keyA.length >= 4 && keyB.indexOf(keyA) >= 0) return true
  if (keyB.length >= 4 && keyA.indexOf(keyB) >= 0) return true
  return false
}

export function collectionEntryToCandidate(entry) {
  if (!entry) return null
  if (entry.source && entry.link) return entry
  const path = String(entry.path || '').trim()
  const id = String(entry.id || '').trim()
  return {
    source: 'music-collection',
    title: entry.title || '',
    artist: entry.artist || '',
    album: entry.album || '',
    link: entry.link || (path ? '/music-collection/' + path : ''),
    path: path,
    id: id,
    image: id ? '/music-collection-art/' + id : '',
  }
}

function matchCollectionEntry(entries, artist, trackTitle) {
  const list = Array.isArray(entries) ? entries : []
  for (let i = 0; i < list.length; i += 1) {
    const entry = list[i]
    const title = entry && entry.title ? String(entry.title) : ''
    if (!title || !discographyTitlesMatch(title, trackTitle)) continue
    if (!artistNamesMatch(entry && entry.artist, artist)) continue
    return collectionEntryToCandidate(entry)
  }
  return null
}

function pickBestSearchCandidate(candidates, artist, trackTitle) {
  const list = Array.isArray(candidates) ? candidates : []
  if (!list.length) return null
  let best = null
  let bestScore = -1
  list.forEach(function(candidate) {
    if (!candidate || candidate.source === 'youtube') return
    const title = String(candidate.title || '')
    if (!discographyTitlesMatch(title, trackTitle)) return
    if (!artistNamesMatch(candidate.artist, artist)) return
    let score = Number(candidate.matchScore) || 0
    if (candidate.source === 'music-collection') score += 30
    if (candidate.source === 'bandcamp') score += 10
    if (score > bestScore) {
      bestScore = score
      best = candidate
    }
  })
  return best
}

export function createArtistDiscographyPlaybackSession() {
  const cache = new Map()
  let collectionEntries = null
  let collectionArtist = ''

  async function loadCollectionEntries(artist, options) {
    const opts = options || {}
    const name = String(artist || '').trim()
    if (!name) return []
    if (collectionEntries && collectionArtist === name) return collectionEntries
    try {
      const body = await browseMusicCollection({
        artist: name,
        limit: 200,
        accessToken: opts.accessToken,
        token: opts.accessToken,
        signal: opts.signal,
      })
      collectionEntries = (body.entries || []).filter(function(entry) {
        return artistNamesMatch(entry && entry.artist, name)
      })
      collectionArtist = name
      return collectionEntries
    } catch (e) {
      collectionEntries = []
      collectionArtist = name
      return []
    }
  }

  async function resolvePlayableCandidate(artist, trackTitle, options) {
    const opts = options || {}
    const cacheKey = normalizeArtistKey(artist) + '::' + String(trackTitle || '').trim().toLowerCase()
    if (cache.has(cacheKey)) return cache.get(cacheKey)

    const entries = await loadCollectionEntries(artist, opts)
    const localMatch = matchCollectionEntry(entries, artist, trackTitle)
    if (localMatch) {
      cache.set(cacheKey, localMatch)
      return localMatch
    }

    try {
      const result = await searchMediaLinks({
        title: trackTitle,
        artist: artist,
        query: [trackTitle, artist].filter(Boolean).join(' '),
        maxTotalResults: 8,
        accessToken: opts.accessToken,
        token: opts.accessToken,
        signal: opts.signal,
      })
      const picked = pickBestSearchCandidate(result && result.candidates, artist, trackTitle)
      cache.set(cacheKey, picked || null)
      return picked || null
    } catch (e) {
      cache.set(cacheKey, null)
      return null
    }
  }

  async function resolveAlbumPlayableCandidates(artist, trackTitles, options) {
    const opts = options || {}
    const titles = Array.isArray(trackTitles) ? trackTitles : []
    const concurrency = typeof opts.concurrency === 'number' ? opts.concurrency : 3
    const out = new Array(titles.length).fill(null)
    let index = 0

    async function worker() {
      while (index < titles.length) {
        const current = index
        index += 1
        if (opts.signal && opts.signal.aborted) return
        const title = titles[current]
        out[current] = await resolvePlayableCandidate(artist, title, opts)
      }
    }

    const workers = []
    for (let i = 0; i < Math.min(concurrency, titles.length); i += 1) {
      workers.push(worker())
    }
    await Promise.all(workers)
    return out
  }

  return {
    resolvePlayableCandidate: resolvePlayableCandidate,
    resolveAlbumPlayableCandidates: resolveAlbumPlayableCandidates,
  }
}
