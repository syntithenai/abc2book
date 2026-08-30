import axios from 'axios'
import { toast } from 'react-toastify'
import { parseTitleArtistFromYouTubeLabel } from './youtubeTitleParse'
import { isAndroidApp } from './platformUtils'
import { TunebookYoutube, isNativeYoutubeAvailable } from './capacitor/tunebookPlugins'

var YOUTUBE_QUOTA_MESSAGE = 'YouTube search quota exceeded. Try again in 24 hours.'
var YOUTUBE_QUOTA_TOAST_ID = 'youtube-search-quota-exceeded'

function isYouTubeQuotaError(err) {
  if (!err) return false
  var status = err.response && err.response.status
  var data = err.response && err.response.data
  var apiErr = data && data.error
  var reasons = (apiErr && Array.isArray(apiErr.errors) ? apiErr.errors : [])
    .map(function(e) { return e && e.reason })
  if (reasons.indexOf('quotaExceeded') >= 0 || reasons.indexOf('dailyLimitExceeded') >= 0) {
    return true
  }
  var msg = String((apiErr && apiErr.message) || err.message || '')
  if ((status === 403 || status === 429) && /quota/i.test(msg)) {
    return true
  }
  return false
}

function throwYouTubeQuotaError() {
  toast.warning(YOUTUBE_QUOTA_MESSAGE, {
    toastId: YOUTUBE_QUOTA_TOAST_ID,
    autoClose: 8000,
  })
  var error = new Error(YOUTUBE_QUOTA_MESSAGE)
  error.code = 'YOUTUBE_QUOTA_EXCEEDED'
  throw error
}

/**
 * Search YouTube via the Google Data API (same as YouTubeSearchModal).
 * On Android, uses native Innertube search (API key referrer restrictions break WebView).
 * Returns [{ id, title, description, image, link }, ...]
 */
export async function searchYouTubeVideos(options) {
  const opts = options || {}
  const query = String(opts.query || opts.title || '').trim()
  if (!query) {
    return { empty: true, candidates: [] }
  }

  const maxResults = opts.maxResults || 25

  if (isAndroidApp() && isNativeYoutubeAvailable()) {
    try {
      const nativeResult = await TunebookYoutube.searchYoutubeVideos({
        query: query,
        maxResults: maxResults,
      })
      const nativeCandidates = nativeResult && Array.isArray(nativeResult.candidates)
        ? nativeResult.candidates
        : []
      if (nativeCandidates.length === 0) {
        return { empty: true, candidates: [] }
      }
      if (nativeCandidates.length === 1) {
        return Object.assign({ empty: false, multiple: false }, nativeCandidates[0])
      }
      return { empty: false, multiple: true, candidates: nativeCandidates }
    } catch (nativeErr) {
      console.warn('native YouTube search failed, trying API', nativeErr)
    }
  }

  const key = process.env.REACT_APP_GOOGLE_API_KEY
  if (!key) {
    throw new Error('YouTube search needs REACT_APP_GOOGLE_API_KEY')
  }

  const url = 'https://youtube.googleapis.com/youtube/v3/search'
    + '?part=snippet&type=video&maxResults=' + maxResults
    + '&q=' + encodeURIComponent(query)
    + '&key=' + key

  var searchRes
  try {
    searchRes = await axios.get(url, { signal: opts.signal })
  } catch (err) {
    if (err && err.name === 'AbortError') throw err
    if (err && err.code === 'ERR_CANCELED') throw err
    if (isYouTubeQuotaError(err)) {
      throwYouTubeQuotaError()
    }
    throw err
  }

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
