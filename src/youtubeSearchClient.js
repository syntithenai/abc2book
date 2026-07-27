import axios from 'axios'
import { parseTitleArtistFromYouTubeLabel } from './youtubeTitleParse'

/**
 * Search YouTube via the Google Data API (same as YouTubeSearchModal).
 * Returns [{ id, title, description, image, link }, ...]
 */
export async function searchYouTubeVideos(options) {
  const opts = options || {}
  const query = String(opts.query || opts.title || '').trim()
  if (!query) {
    return { empty: true, candidates: [] }
  }

  const key = process.env.REACT_APP_GOOGLE_API_KEY
  if (!key) {
    throw new Error('YouTube search needs REACT_APP_GOOGLE_API_KEY')
  }

  const maxResults = opts.maxResults || 25
  const url = 'https://youtube.googleapis.com/youtube/v3/search'
    + '?part=snippet&type=video&maxResults=' + maxResults
    + '&q=' + encodeURIComponent(query)
    + '&key=' + key

  const searchRes = await axios.get(url, { signal: opts.signal })
  const items = searchRes && searchRes.data && Array.isArray(searchRes.data.items)
    ? searchRes.data.items
    : []

  const candidates = []
  items.forEach(function(item) {
    if (!item || !item.id || item.id.kind !== 'youtube#video' || !item.id.videoId) return
    const snippet = item.snippet || {}
    const thumbnails = snippet.thumbnails || {}
    const image = (thumbnails.default && thumbnails.default.url)
      || (thumbnails.medium && thumbnails.medium.url)
      || ''
    candidates.push({
      id: item.id.videoId,
      title: snippet.title || '',
      description: snippet.description || '',
      image: image,
      link: 'https://www.youtube.com/watch?v=' + item.id.videoId,
      artist: opts.artist || '',
      source: 'youtube',
    })
  })

  if (candidates.length === 0) {
    return { empty: true, candidates: [] }
  }
  if (candidates.length === 1) {
    return Object.assign({ empty: false, multiple: false }, candidates[0])
  }
  return { empty: false, multiple: true, candidates: candidates }
}

/**
 * Lightweight YouTube availability check via oEmbed (no player probe UI).
 */
export async function checkYouTubeLinkOembed(url, signal) {
  const meta = await fetchYouTubeOembedMetadata(url, signal)
  if (meta && meta.ok) return { ok: true }
  return { ok: false, error: (meta && meta.error) || 'YouTube check failed' }
}

/**
 * Fetch YouTube oEmbed metadata (title + channel) for a video URL.
 */
export async function fetchYouTubeOembedMetadata(url, signal) {
  const src = String(url || '').trim()
  if (!src) return { ok: false, error: 'Missing link URL' }
  try {
    const response = await fetch(
      'https://www.youtube.com/oembed?url=' + encodeURIComponent(src) + '&format=json',
      { signal: signal, method: 'GET' }
    )
    if (!response.ok) {
      return { ok: false, error: 'YouTube video is unavailable' }
    }
    const data = await response.json()
    return {
      ok: true,
      title: data && data.title ? String(data.title) : '',
      authorName: data && data.author_name ? String(data.author_name) : '',
    }
  } catch (e) {
    if (e && e.name === 'AbortError') throw e
    return { ok: false, error: e && e.message ? e.message : 'YouTube check failed' }
  }
}

export { parseTitleArtistFromYouTubeLabel }
