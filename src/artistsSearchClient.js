import { discoverRecordingArtists, discoverWorkWriters, isGenericArtist } from './recordingArtistsClient'

/**
 * MusicBrainz-based artist chip candidates for the multi-artist field.
 */
export async function searchArtists(options) {
  const opts = options || {}
  const title = String(opts.title || '').trim()
  if (!title) {
    return { empty: true, candidates: [] }
  }
  const signal = opts.signal
  const maxArtists = 12

  if (typeof opts.onProgress === 'function') {
    opts.onProgress('Searching recording artists…', 0.2)
  }

  const recording = await discoverRecordingArtists({
    title: title,
    artist: opts.artist || '',
    maxArtists: maxArtists,
    signal: signal,
  })
  if (typeof opts.onProgress === 'function') {
    opts.onProgress('Searching writers…', 0.55)
  }
  const writers = await discoverWorkWriters({
    title: title,
    maxWriters: maxArtists,
    signal: signal,
  })

  const seen = {}
  const candidates = []
  function push(name, role, source) {
    const artist = String(name || '').trim()
    if (!artist || isGenericArtist(artist)) return
    const key = artist.toLowerCase()
    if (seen[key]) return
    seen[key] = true
    candidates.push({
      artist: artist,
      role: role || '',
      source: source || 'MusicBrainz',
      preview: artist,
    })
  }

  ;(recording || []).forEach(function(name) { push(name, 'performer', 'MusicBrainz') })
  ;(writers || []).forEach(function(name) { push(name, 'writer', 'MusicBrainz') })

  if (candidates.length === 0) {
    return { empty: true, candidates: [] }
  }
  if (candidates.length === 1) {
    return Object.assign({ empty: false, multiple: false }, candidates[0])
  }
  return { empty: false, multiple: true, candidates: candidates }
}

export function buildGoogleArtistsSearchUrl(title, artist) {
  return 'https://www.google.com/search?q='
    + encodeURIComponent([title, artist, 'artists performers'].filter(Boolean).join(' '))
}
