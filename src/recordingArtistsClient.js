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

export async function discoverWorkWriters(options) {
  const opts = options || {}
  const title = String(opts.title || '').trim()
  const maxWriters = typeof opts.maxWriters === 'number' ? opts.maxWriters : 6
  const maxWorks = typeof opts.maxWorks === 'number' ? opts.maxWorks : 3
  if (!title) return []

  const writers = {}
  let works = []
  try {
    const response = await axios.get(MUSICBRAINZ_BASE + '/work', {
      params: {
        query: 'work:"' + title + '"',
        fmt: 'json',
        limit: 8,
      },
      headers: { 'User-Agent': CLIENT_USER_AGENT },
      signal: opts.signal,
    })
    works = (response.data && response.data.works) || []
  } catch (e) {
    return []
  }

  const exactWorks = []
  works.forEach(function(work) {
    const score = typeof work.score === 'number' ? work.score : 0
    if (score < 70) return
    if (!workTitleMatches(work.title, title)) return
    if (!work.id) return
    exactWorks.push({ score: score, work: work })
  })
  if (exactWorks.length === 0) return []

  exactWorks.sort(function(a, b) { return b.score - a.score })
  const bestScore = exactWorks[0].score
  const selected = exactWorks
    .filter(function(item) { return item.score >= bestScore - 5 })
    .slice(0, maxWorks)

  for (let i = 0; i < selected.length; i += 1) {
    if (Object.keys(writers).length >= maxWriters) break
    const found = await discoverWritersFromWork(selected[i].work.id, opts.signal)
    found.forEach(function(name) { addArtist(writers, name) })
    if (Object.keys(writers).length > 0) break
  }

  return Object.values(writers).slice(0, maxWriters)
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
