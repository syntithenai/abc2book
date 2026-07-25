/**
 * YouTube URL helpers for lesson playlists (no tunebook records).
 */

export function extractYoutubeVideoId(urlOrId) {
  if (!urlOrId) return null
  const raw = String(urlOrId).trim()
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw
  const parts = raw.split(/(vi\/|v%3D|v=|\/v\/|youtu\.be\/|\/embed\/)/)
  const id = parts[2] !== undefined ? parts[2].split(/[^0-9a-z_-]/i)[0] : parts[0]
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null
}

export function youtubeWatchUrl(videoId) {
  if (!videoId) return ''
  return 'https://www.youtube.com/watch?v=' + videoId
}
