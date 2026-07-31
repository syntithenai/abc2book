/**
 * Artwork URL for the now-playing UI (YouTube thumb, tag image, etc.).
 */
import { archiveArtworkUrlFromUri, isArchiveOrgLinkUri } from './archiveOrgLinkUtils'
import { isOwnedMediaLink, isOwnedMediaLinkUri } from './linkRecording'
import { musicCollectionArtProxyPathFromUrl } from './musicCollectionLinkUtils'
import { linkUriString } from './tuneLinkUri'

export function youtubeIdFromUrl(url) {
  if (!url || typeof url !== 'string') return null
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))((\w|-){11})/)
  return match ? match[1] : null
}

export function youtubeArtworkFromUrl(url) {
  const ytId = youtubeIdFromUrl(url)
  if (!ytId) return null
  return 'https://i.ytimg.com/vi/' + ytId + '/hqdefault.jpg'
}

export function artworkFromLinkImage(link) {
  if (!link || !link.image) return null
  const image = String(link.image).trim()
  return image || null
}

function isYoutubeLinkUrl(url, tunebook) {
  if (!url) return false
  if (tunebook && tunebook.utils && typeof tunebook.utils.isYoutubeLink === 'function') {
    return tunebook.utils.isYoutubeLink(url)
  }
  return /youtube\.com|youtu\.be/.test(url)
}

function resolveLinkArtworkUrl(link, tunebook) {
  if (!link) return null

  const storedImage = artworkFromLinkImage(link)
  if (storedImage) return storedImage

  const uri = linkUriString(link)
  if (!uri) return null

  if (isYoutubeLinkUrl(uri, tunebook)) {
    return youtubeArtworkFromUrl(uri)
  }

  if (isArchiveOrgLinkUri(uri)) {
    return archiveArtworkUrlFromUri(uri) || null
  }

  return null
}

function normalizeLinkIndex(linkIndex) {
  if (linkIndex === null || linkIndex === undefined || linkIndex === '') return null
  const parsed = parseInt(linkIndex, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function activeLink(tune, linkIndex) {
  if (!tune || !Array.isArray(tune.links)) return null
  const index = normalizeLinkIndex(linkIndex)
  if (index == null || index < 0 || index >= tune.links.length) return null
  return tune.links[index] || null
}

export function needsOwnedRecordingArtwork(link) {
  if (!link) return false
  if (isOwnedMediaLink(link)) {
    const uri = linkUriString(link)
    if (uri && isOwnedMediaLinkUri(uri)) return true
  }
  return false
}

export function hasTuneArtwork(tune, tunebook, options) {
  const opts = options || {}
  if (!tune) return false

  const linkIndex = normalizeLinkIndex(opts.linkIndex)
  if (linkIndex != null) {
    const link = activeLink(tune, linkIndex)
    if (!link) return false
    if (resolveLinkArtworkUrl(link, tunebook)) return true
    if (needsOwnedRecordingArtwork(link)) return true
    const uri = linkUriString(link)
    if (uri && musicCollectionArtProxyPathFromUrl(uri)) return true
    return false
  }

  if (!Array.isArray(tune.links)) return false
  for (let i = 0; i < tune.links.length; i++) {
    if (resolveLinkArtworkUrl(tune.links[i], tunebook)) return true
    if (needsOwnedRecordingArtwork(tune.links[i])) return true
  }
  return false
}

export function getTuneArtworkUrl(tune, tunebook, options) {
  const opts = options || {}
  if (!tune) return null

  const linkIndex = normalizeLinkIndex(opts.linkIndex)
  if (linkIndex != null) {
    return resolveLinkArtworkUrl(activeLink(tune, linkIndex), tunebook)
  }

  if (!Array.isArray(tune.links)) return null
  for (let i = 0; i < tune.links.length; i++) {
    const url = resolveLinkArtworkUrl(tune.links[i], tunebook)
    if (url) return url
  }

  return null
}

export function isMusicCollectionArtworkUrl(url) {
  return !!musicCollectionArtProxyPathFromUrl(url)
}

export function isYoutubeArtworkUrl(url) {
  return !!(url && /^https:\/\/i\.ytimg\.com\/vi\/[^/]+\/hqdefault\.jpg$/.test(url))
}

export function youtubeArtworkMaxResUrl(url) {
  if (!isYoutubeArtworkUrl(url)) return null
  return url.replace(/\/hqdefault\.jpg$/, '/maxresdefault.jpg')
}
