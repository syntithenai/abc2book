import axios from 'axios'
import { normalizeMatchText } from './notationMatchUtils'

const MUSICBRAINZ_BASE = 'https://musicbrainz.org/ws/2'
const CLIENT_USER_AGENT = 'ABC2Book/1.0 (https://tunebook.net)'

const GENERIC_ARTIST_KEYS = {
  '': true,
  traditional: true,
  trad: true,
  anonymous: true,
  unknown: true,
  folk: true,
  publicdomain: true,
  various: true,
  na: true,
  composerunknown: true,
}

export function normalizeArtistKey(value) {
  return normalizeMatchText(value)
}

export function isGenericArtist(artist) {
  const key = normalizeArtistKey(artist)
  if (GENERIC_ARTIST_KEYS[key]) return true
  return key.indexOf('trad') === 0
}

function addArtist(store, artist) {
  const name = String(artist || '').trim()
  if (!name || isGenericArtist(name)) return
  const key = normalizeArtistKey(name)
  if (store[key]) return
  store[key] = name
}

async function discoverArtistsMusicbrainz(title, maxArtists, signal) {
  const artists = {}
  try {
    const response = await axios.get(MUSICBRAINZ_BASE + '/recording', {
      params: {
        query: 'recording:"' + title + '"',
        fmt: 'json',
        limit: 15,
      },
      headers: { 'User-Agent': CLIENT_USER_AGENT },
      signal: signal,
    })
    const recordings = (response.data && response.data.recordings) || []
    recordings.forEach(function(recording) {
      if (Object.keys(artists).length >= maxArtists) return
      ;(recording['artist-credit'] || []).forEach(function(credit) {
        if (Object.keys(artists).length >= maxArtists) return
        addArtist(artists, credit && credit.name)
      })
    })
  } catch (e) {
    // MusicBrainz lookup is best-effort.
  }
  return Object.values(artists)
}

const WRITER_RELATION_TYPES = {
  composer: true,
  lyricist: true,
  writer: true,
  librettist: true,
}

function workTitleMatches(workTitle, searchTitle) {
  const workKey = normalizeArtistKey(workTitle)
  const searchKey = normalizeArtistKey(searchTitle)
  if (!workKey || !searchKey) return false
  return workKey === searchKey
}

const TITLE_VARIANT_SWAPS = [
  ['clare', 'clair'],
  ['clair', 'clare'],
  ['claire', 'clair'],
  ['clair', 'claire'],
]

/** Unique title strings to try in MusicBrainz work search (original first). */
export function titleVariants(title) {
  const text = String(title || '').trim()
  if (!text) return []

  const ordered = [text]
  const seen = {}
  seen[text.toLowerCase()] = true

  function add(candidate) {
    const next = String(candidate || '').trim()
    if (!next) return
    const key = next.toLowerCase()
    if (seen[key]) return
    seen[key] = true
    ordered.push(next)
  }

  const lower = text.toLowerCase()
  TITLE_VARIANT_SWAPS.forEach(function(pair) {
    const left = pair[0]
    const right = pair[1]
    const boundary = new RegExp('\\b' + left.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i')
    if (!boundary.test(lower)) return
    add(text.replace(boundary, function(word) {
      if (word === word.toUpperCase()) return right.toUpperCase()
      if (word.charAt(0) === word.charAt(0).toUpperCase()) {
        return right.charAt(0).toUpperCase() + right.slice(1)
      }
      return right
    }))
  })

  return ordered
}

async function discoverWritersFromWork(workId, signal) {
  const writers = {}
  try {
    const response = await axios.get(MUSICBRAINZ_BASE + '/work/' + workId, {
      params: {
        fmt: 'json',
        inc: 'artist-rels',
      },
      headers: { 'User-Agent': CLIENT_USER_AGENT },
      signal: signal,
    })
    const relations = (response.data && response.data.relations) || []
    relations.forEach(function(relation) {
      const relType = String(relation && relation.type || '').trim().toLowerCase()
      if (!WRITER_RELATION_TYPES[relType]) return
      const artist = relation && relation.artist
      addArtist(writers, artist && artist.name)
    })
  } catch (e) {
    // MusicBrainz lookup is best-effort.
  }
  return Object.values(writers)
}

function workRecordingCount(work) {
  const keys = ['recording-count', 'recording_count']
  for (let i = 0; i < keys.length; i += 1) {
    const raw = work && work[keys[i]]
    if (typeof raw === 'number' && raw >= 0) return raw
  }
  return 0
}

export function pickSuggestedWorkTitle(searchTitle, exactWorks) {
  const searchKey = normalizeArtistKey(searchTitle)
  if (!searchKey || !Array.isArray(exactWorks) || exactWorks.length === 0) return ''
  const ranked = exactWorks.slice().sort(function(a, b) {
    const rcDiff = workRecordingCount(b.work) - workRecordingCount(a.work)
    if (rcDiff !== 0) return rcDiff
    return b.score - a.score
  })
  for (let i = 0; i < ranked.length; i += 1) {
    const workTitle = String(ranked[i].work && ranked[i].work.title || '').trim()
    if (!workTitle) continue
    if (normalizeArtistKey(workTitle) === searchKey) continue
    return workTitle
  }
  return ''
}

export async function discoverWorkWritersWithProminence(options) {
  const opts = options || {}
  const title = String(opts.title || '').trim()
  const maxWriters = typeof opts.maxWriters === 'number' ? opts.maxWriters : 6
  const maxWorks = typeof opts.maxWorks === 'number' ? opts.maxWorks : 8
  if (!title) return { writers: [], suggestedTitle: '' }

  const writers = {}
  const exactWorks = []
  const seenWorkIds = {}
  const variants = titleVariants(title)

  for (let v = 0; v < variants.length; v += 1) {
    const searchTitle = variants[v]
    let works = []
    try {
      const response = await axios.get(MUSICBRAINZ_BASE + '/work', {
        params: {
          query: 'work:"' + searchTitle + '"',
          fmt: 'json',
          limit: 15,
        },
        headers: { 'User-Agent': CLIENT_USER_AGENT },
        signal: opts.signal,
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

  if (exactWorks.length === 0) {
    return { writers: [], suggestedTitle: '' }
  }

  exactWorks.sort(function(a, b) { return b.score - a.score })
  const selected = exactWorks.slice(0, maxWorks)
  const suggestedTitle = pickSuggestedWorkTitle(title, exactWorks)

  for (let i = 0; i < selected.length; i += 1) {
    if (Object.keys(writers).length >= maxWriters) break
    const found = await discoverWritersFromWork(selected[i].work.id, opts.signal)
    found.forEach(function(name) { addArtist(writers, name) })
  }

  return {
    writers: Object.values(writers).slice(0, maxWriters),
    suggestedTitle: suggestedTitle,
  }
}

export async function discoverWorkWriters(options) {
  const enriched = await discoverWorkWritersWithProminence(options)
  return enriched.writers || []
}

export async function discoverRecordingArtists(options) {
  const opts = options || {}
  const title = String(opts.title || '').trim()
  const maxArtists = typeof opts.maxArtists === 'number' ? opts.maxArtists : 8
  if (!title) return []

  const merged = {}
  const discovered = await discoverArtistsMusicbrainz(title, maxArtists, opts.signal)
  discovered.forEach(function(name) { addArtist(merged, name) })

  const userArtist = String(opts.artist || '').trim()
  if (userArtist && !isGenericArtist(userArtist)) {
    const ordered = [userArtist]
    Object.values(merged).forEach(function(name) {
      if (normalizeArtistKey(name) !== normalizeArtistKey(userArtist)) {
        ordered.push(name)
      }
    })
    return ordered.slice(0, maxArtists)
  }

  return Object.values(merged).slice(0, maxArtists)
}
