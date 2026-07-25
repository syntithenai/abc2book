import { getResolverLoginWarning, isMediaProxyConfigured } from './mediaProxyClient'
import { isYoutubeExtensionConnected, isYoutubeExtensionConnectedSync } from './youtubeExtensionClient'
import { isWebshareProxyConfigured } from './webshareProxySettings'

function resolverYoutubeBytesAvailable(features) {
  if (!features || !features.proxy) return false
  if (features.youtubeAudio === true) return true
  if (!features.lightMode && !features.youtubeEgressRequired) return true
  if ((features.lightMode || features.youtubeEgressRequired) && isWebshareProxyConfigured()) return true
  return false
}

/**
 * Whether linked YouTube/audio media can be downloaded for pitch shift / filters.
 * ABC/MIDI pitch does not use this path.
 */
export function linkedMediaPitchPathAvailableSync(options) {
  const opts = options || {}
  const srcType = opts.srcType
  if (srcType !== 'youtube' && srcType !== 'audio') return false

  const features = opts.resolverFeatures || null
  const resolverStatus = opts.resolverStatus || null
  const accessToken = opts.accessToken || null

  if (srcType === 'youtube' && isYoutubeExtensionConnectedSync()) {
    return true
  }

  if (!isMediaProxyConfigured()) return false
  if (getResolverLoginWarning(resolverStatus, accessToken)) return false
  if (!resolverStatus || !resolverStatus.available) return false
  if (!features || !features.proxy) return false

  if (srcType === 'youtube') {
    return resolverYoutubeBytesAvailable(features)
  }

  return true
}

export async function linkedMediaPitchPathAvailable(options) {
  const opts = options || {}
  if (linkedMediaPitchPathAvailableSync(opts)) return true
  if (opts.srcType === 'youtube' && (await isYoutubeExtensionConnected())) {
    return true
  }
  return false
}
