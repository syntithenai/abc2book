import axios from 'axios'
import { lyricsPreview, parsePlainLyricsText } from './lyricsParseUtils'

const LRCLIB_SEARCH_URL = 'https://lrclib.net/api/search'
const LRCLIB_TIMEOUT_MS = 8000
const LRCLIB_USER_AGENT = 'ABC2Book/1.0 (+https://tunebook.net)'

/**
 * Browser-safe lrclib search (CORS allows *). Fast plain-lyrics API.
 */
export async function fetchLyricsLrclib(artist, title, signal) {
  const titleText = String(title || '').trim()
  if (!titleText) return null
  const artistText = String(artist || '').trim()

  const params = { track_name: titleText }
  if (artistText) params.artist_name = artistText

  let response
  try {
    response = await axios.get(LRCLIB_SEARCH_URL, {
      params: params,
      signal: signal,
      timeout: LRCLIB_TIMEOUT_MS,
      headers: { 'User-Agent': LRCLIB_USER_AGENT },
      validateStatus: function(status) {
        return status === 200 || status === 404
      },
    })
  } catch (e) {
    return null
  }

  if (!response || response.status === 404) return null
  const payload = response.data
  if (!Array.isArray(payload)) return null

  for (let i = 0; i < payload.length; i += 1) {
    const hit = payload[i]
    if (!hit || typeof hit !== 'object' || hit.instrumental) continue
    let lyrics = typeof hit.plainLyrics === 'string' ? hit.plainLyrics : ''
    if (!lyrics.trim() && typeof hit.syncedLyrics === 'string') {
      lyrics = hit.syncedLyrics.replace(/\[[^\]]+\]/g, '').trim()
    }
    if (!lyrics.trim()) continue

    const parsed = parsePlainLyricsText(lyrics)
    const stanzas = parsed[0]
    const lines = parsed[1]
    const text = parsed[2]
    if (!text) continue

    const hitArtist = String(hit.artistName || artistText || '').trim()
    const hitTitle = String(hit.trackName || titleText).trim()
    const sourceUrl = LRCLIB_SEARCH_URL
      + '?track_name=' + encodeURIComponent(titleText)
      + (artistText ? ('&artist_name=' + encodeURIComponent(artistText)) : '')

    return {
      text: text,
      lines: lines,
      stanzas: stanzas,
      source: 'lrclib.net',
      sourceUrl: sourceUrl,
      title: hitTitle,
      artist: hitArtist,
      preview: lyricsPreview(lines),
      titleOnly: false,
    }
  }

  return null
}

export async function searchLyricsLrclibForArtists(options) {
  const opts = options || {}
  const title = String(opts.title || '').trim()
  const artists = Array.isArray(opts.artists) ? opts.artists : []
  if (!title) return []

  const candidates = []
  const seen = new Set()

  const artistList = artists.length ? artists : ['']
  for (let i = 0; i < artistList.length; i += 1) {
    const artist = String(artistList[i] || '').trim()
    if (typeof opts.onProgress === 'function') {
      opts.onProgress(
        artist ? ('Checking lrclib for ' + artist + '…') : 'Checking lrclib…',
        0.18 + (0.2 * (i + 1) / Math.max(artistList.length, 1)),
        'lrclib'
      )
    }
    const result = await fetchLyricsLrclib(artist, title, opts.signal)
    if (!result) continue
    const key = (result.sourceUrl || '') + ':' + result.text.slice(0, 120)
    if (seen.has(key)) continue
    seen.add(key)
    candidates.push(result)
  }

  return candidates
}
