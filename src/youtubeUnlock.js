import { isYoutubeExtensionConnected } from './youtubeExtensionClient'
import {
  getSavedWebshareProxyUrl,
  isWebshareProxyConfigured,
} from './webshareProxySettings'

/**
 * Sync cheap check used for early UI decisions (may underestimate extension).
 */
export function youtubeAudioBytesAvailableSync(options) {
  const features = (options && options.resolverFeatures) || null
  const proxyOk = !!(features && features.proxy)
  const lightMode = !!(features && features.lightMode)
  const youtubeAudio = features && features.youtubeAudio === true
  const egressRequired = !!(features && features.youtubeEgressRequired)

  if (youtubeAudio === true) return true
  if (proxyOk && !lightMode && !egressRequired) return true
  if (proxyOk && (egressRequired || lightMode) && isWebshareProxyConfigured()) return true
  return false
}

/**
 * Full check including extension discovery.
 */
export async function youtubeAudioBytesAvailable(options) {
  if (youtubeAudioBytesAvailableSync(options)) return true
  if (await isYoutubeExtensionConnected()) return true
  return false
}

/** Headers for resolver YouTube fetches when user configured Webshare egress. */
export function getYoutubeEgressHeaders() {
  const url = getSavedWebshareProxyUrl()
  if (!url) return {}
  return { 'X-Tunebook-Ytdlp-Proxy': url }
}
