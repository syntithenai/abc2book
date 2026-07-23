import {
  isYoutubeExtensionConnected,
  isYoutubeExtensionConnectedSync,
} from './youtubeExtensionClient'
import {
  getSavedWebshareProxyUrl,
  isWebshareProxyConfigured,
} from './webshareProxySettings'

/**
 * Cloud / slim resolver that cannot reliably fetch YouTube audio without
 * residential egress or the TuneBook Helper extension.
 */
export function isCloudYoutubeProxyBlocked(resolverFeatures) {
  const features = resolverFeatures || null
  if (!features || !features.proxy) return false
  if (features.youtubeAudio === true) return false
  const lightMode = !!features.lightMode
  const egressRequired = !!features.youtubeEgressRequired
  if (!lightMode && !egressRequired) return false
  if (isWebshareProxyConfigured()) return false
  if (isYoutubeExtensionConnectedSync()) return false
  return true
}

/**
 * Sync cheap check used for early UI decisions. Includes the extension's DOM
 * marker / cached ping, but may still miss the extension right after page
 * load; the async check below is authoritative.
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
  if (isYoutubeExtensionConnectedSync()) return true
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
