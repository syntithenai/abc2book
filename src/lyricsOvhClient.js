import axios from 'axios'
import { lyricsPreview, parsePlainLyricsText } from './lyricsParseUtils'

const LYRICS_OVH_BASE = 'https://api.lyrics.ovh/v1'

export async function fetchLyricsOvh(artist, title, signal) {
  const artistText = String(artist || '').trim()
  const titleText = String(title || '').trim()
  if (!artistText || !titleText) return null

  const url = LYRICS_OVH_BASE + '/' + encodeURIComponent(artistText) + '/' + encodeURIComponent(titleText)
  let response
  try {
    response = await axios.get(url, {
      signal: signal,
      timeout: 8000,
      validateStatus: function(status) {
        return status === 200 || status === 404
      },
    })
  } catch (e) {
    return null
  }

  if (!response || response.status === 404) return null
  const lyrics = response.data && response.data.lyrics
  if (typeof lyrics !== 'string' || !lyrics.trim()) return null

  const parsed = parsePlainLyricsText(lyrics)
  const stanzas = parsed[0]
  const lines = parsed[1]
  const text = parsed[2]
  if (!text) return null

  return {
    text: text,
    lines: lines,
    stanzas: stanzas,
    source: 'lyrics.ovh',
    sourceUrl: url,
    title: titleText,
    artist: artistText,
    preview: lyricsPreview(lines),
    titleOnly: false,
  }
}

export async function searchLyricsOvhForArtists(options) {
  const opts = options || {}
  const title = String(opts.title || '').trim()
  const artists = Array.isArray(opts.artists) ? opts.artists : []
  if (!title) return []

  const candidates = []
  const seen = new Set()

  for (let i = 0; i < artists.length; i += 1) {
    const artist = String(artists[i] || '').trim()
    if (!artist) continue
    if (typeof opts.onProgress === 'function') {
      opts.onProgress(
        'Searching lyrics for ' + artist + '...',
        0.2 + (0.5 * (i + 1) / Math.max(artists.length, 1)),
        'lyrics.ovh'
      )
    }
    const result = await fetchLyricsOvh(artist, title, opts.signal)
    if (!result) continue
    const key = (result.sourceUrl || '') + ':' + result.text.slice(0, 120)
    if (seen.has(key)) continue
    seen.add(key)
    candidates.push(result)
  }

  return candidates
}
