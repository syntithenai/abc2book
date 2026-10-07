/**
 * Chooses the URL encoded in the QR code on printed tune pages.
 */

import { extractYoutubeVideoId, youtubeWatchUrl } from './lessonYoutube'
import { buildTunePublicShareLink, qrSafeShareLink } from './publicScrapeShare'
import { buildShareImportLink } from './shareTunebookUtils'
import { linkUriString } from './tuneLinkUri'

export const PRINT_QR_TARGET_YOUTUBE = 'youtube'
export const PRINT_QR_TARGET_TUNEBOOK = 'tunebook'
export const PRINT_QR_TARGETS = [PRINT_QR_TARGET_YOUTUBE, PRINT_QR_TARGET_TUNEBOOK]

const PRINT_QR_TARGET_KEY = 'bookstorage_print_qr_target'
const PRINTED_SHARE_ORIGIN = 'https://tunebook.net'

export function getSavedPrintQrTarget() {
  try {
    const saved = localStorage.getItem(PRINT_QR_TARGET_KEY)
    if (PRINT_QR_TARGETS.indexOf(saved) !== -1) return saved
  } catch (e) { /* storage unavailable */ }
  return PRINT_QR_TARGET_YOUTUBE
}

export function setSavedPrintQrTarget(target) {
  if (PRINT_QR_TARGETS.indexOf(target) === -1) return
  try {
    localStorage.setItem(PRINT_QR_TARGET_KEY, target)
  } catch (e) { /* storage unavailable */ }
}

/** Paper outlives the session, so QR codes must point at the public site, not a native/webview origin. */
function printedShareOrigin() {
  if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined' && window.location) {
    return window.location.origin
  }
  return PRINTED_SHARE_ORIGIN
}

function isYoutubeUrl(url) {
  return /(^|\/\/|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be)\//i.test(url)
}

export function firstYoutubeLinkForTune(tune) {
  const links = tune && Array.isArray(tune.links) ? tune.links : []
  for (let i = 0; i < links.length; i += 1) {
    const url = String(linkUriString(links[i]) || '').trim()
    if (!url || !isYoutubeUrl(url)) continue
    const videoId = extractYoutubeVideoId(url)
    if (videoId) return youtubeWatchUrl(videoId)
  }
  return ''
}

export function tunebookLinkForTune(tune, options) {
  if (!tune || tune.id == null) return ''
  const opts = options || {}
  const origin = opts.origin || printedShareOrigin()
  const publicLink = buildTunePublicShareLink({ tune: tune, origin: origin, includeFreshParam: false })
  if (publicLink) return qrSafeShareLink(publicLink)
  if (!opts.googleDocumentId) return ''
  return qrSafeShareLink(buildShareImportLink({
    googleDocumentId: opts.googleDocumentId,
    shareKind: 'tune',
    tuneId: tune.id,
    origin: origin,
    includeFreshParam: false,
  }))
}

export function printQrLinkForTune(tune, target, options) {
  if (target === PRINT_QR_TARGET_TUNEBOOK) return tunebookLinkForTune(tune, options)
  return firstYoutubeLinkForTune(tune)
}
