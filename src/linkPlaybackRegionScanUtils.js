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
