/**
 * Public playlist share links encode ordered scrape tune refs so recipients can
 * import without signing in or reading the sharer's Google tunebook.
 */

import { appendFreshLoadParam } from './appFreshLoadUtils'
import { shareOrigin } from './shareTunebookUtils'
import {
  PUBLIC_SCRAPE_SHARE_VERSION,
  PUBLIC_SCRAPE_SHARE_VERSION_V1,
  QR_CODE_MAX_BINARY_CHARS,
  analyzePlaylistPublishedShare,
  analyzeShareMediaForPlaylist,
  buildPublicScrapeSharePayload,
  buildPublishedShareWarning,
  buildShareMediaWarning,
  classifyShareMediaLinkSource,
  curatedScrapeUrlForShareRef,
  decodePublicScrapeSharePayload,
  defaultShareVariant,
  encodePublicScrapeSharePayload,
  groupPublicRefsByScrapeFile,
  isQrEncodableShareLink,
  itemsFromPlaylistOrQueue,
  qrSafeShareLink,
  resolveTunePublishedScrapeRef,
  scrapeFilenameFromUrl,
  shareOffersVariantChoice,
} from './publicScrapeShare'

export const PLAYLIST_PUBLIC_SHARE_VERSION = PUBLIC_SCRAPE_SHARE_VERSION
export const PLAYLIST_PUBLIC_SHARE_VERSION_V1 = PUBLIC_SCRAPE_SHARE_VERSION_V1
export { QR_CODE_MAX_BINARY_CHARS }

export {
  scrapeFilenameFromUrl,
  resolveTunePublishedScrapeRef,
  analyzePlaylistPublishedShare,
  isQrEncodableShareLink,
  qrSafeShareLink,
}

export function playlistItemsFromRecordOrQueue(playlistOrQueue) {
  return itemsFromPlaylistOrQueue(playlistOrQueue)
}

export function classifyPlaylistMediaLinkSource(link) {
  return classifyShareMediaLinkSource(link)
}

export function analyzePlaylistShareMediaPlayability(playlistOrQueue, tunes) {
  return analyzeShareMediaForPlaylist(playlistOrQueue, tunes)
}

export function playlistShareOffersVariantChoice(publishedAnalysis) {
  return shareOffersVariantChoice(publishedAnalysis)
}

export function defaultPlaylistShareVariant(mediaAnalysis) {
  return defaultShareVariant(mediaAnalysis)
}

export function buildPlaylistShareMediaWarning(issues) {
  return buildShareMediaWarning(issues)
}

export function buildPlaylistPublishedShareWarning(missing) {
  return buildPublishedShareWarning(missing)
}

export function buildPlaylistPublicSharePayload(name, refs) {
  return buildPublicScrapeSharePayload(name, refs, 'Playlist')
}

export function encodePlaylistPublicSharePayload(payload) {
  return encodePublicScrapeSharePayload(payload)
}

export function decodePlaylistPublicSharePayload(encoded) {
  return decodePublicScrapeSharePayload(encoded, 'Playlist')
}

export function buildPlaylistPublicShareLink(options) {
  const opts = options || {}
  const analysis = opts.analysis || analyzePlaylistPublishedShare(opts.playlist, opts.tunes)
  if (!analysis || !analysis.ok) return ''
  const payload = buildPlaylistPublicSharePayload(
    opts.name || (opts.playlist && opts.playlist.name),
    analysis.refs
  )
  const encoded = encodePlaylistPublicSharePayload(payload)
  if (!encoded) return ''
  const base = shareOrigin(opts.origin)
  const link = base + '/#/importplaylist/' + encoded
  return opts.includeFreshParam === false ? link : appendFreshLoadParam(link)
}

export function groupPlaylistPublicRefsByScrapeFile(refs) {
  return groupPublicRefsByScrapeFile(refs)
}

export function curatedScrapeUrlForPlaylistRef(scrapeFile) {
  return curatedScrapeUrlForShareRef(scrapeFile)
}
