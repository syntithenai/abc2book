import { getMediaResolverHealthState } from './mediaResolverHealthStore'
import { resolverHasFeature } from './resolverFeatures'

export function isScannableLink(url) {
  if (!url || typeof url !== 'string') return false
  const trimmed = url.trim()
  if (!trimmed) return false
  if (trimmed.startsWith('data:audio/')) return true
  if (trimmed.startsWith('data:')) return false
  return trimmed.indexOf('http://') === 0 || trimmed.indexOf('https://') === 0
}

export function canAutoScanPlaybackRegion(healthState) {
  const health = healthState || getMediaResolverHealthState()
  return !!(
    health
    && health.checked
    && health.available
    && resolverHasFeature(health.status, 'whisper')
  )
}

/** True when the link already has a Start At and/or End At play range. */
export function linkHasConfiguredPlayRange(link) {
  if (!link) return false
  const hasStart = link.startAt != null && String(link.startAt).trim() !== ''
  const hasEnd = link.endAt != null && String(link.endAt).trim() !== ''
  return hasStart || hasEnd
}
