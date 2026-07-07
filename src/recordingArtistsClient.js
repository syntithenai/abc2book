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
