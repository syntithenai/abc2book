/**
 * Detect Bandcamp track/album URLs (https://*.bandcamp.com/...).
 * Fuzzysearch sometimes returns doubled origins:
 * https://artist.bandcamp.comhttps://artist.bandcamp.com/track/...
 */
const DOUBLED_BANDCAMP_ORIGIN_RE = /^https:\/\/[^/]+\.bandcamp\.comhttps:\/\//i

export function repairBandcampLinkUri(uri) {
  const src = String(uri || '').trim()
  const match = src.match(DOUBLED_BANDCAMP_ORIGIN_RE)
  if (!match) return src
  return 'https://' + src.slice(match[0].length)
}

export function isBandcampLinkUri(uri) {
  const src = repairBandcampLinkUri(uri)
  if (!src || !/^https?:\/\//i.test(src)) return false
  try {
    const host = new URL(src).hostname.toLowerCase().replace(/^www\./, '')
    return host === 'bandcamp.com' || host.endsWith('.bandcamp.com')
  } catch (e) {
    return false
  }
}

