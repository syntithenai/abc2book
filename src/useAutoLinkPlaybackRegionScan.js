import { useCallback, useRef } from 'react'
import useMediaResolverHealth from './useMediaResolverHealth'
import { usePlaybackRegionScanDeps, requestPlaybackRegionScan } from './usePlaybackRegionScan'
import { canAutoScanPlaybackRegion, isScannableLink } from './linkPlaybackRegionScanUtils'

export function useAutoLinkPlaybackRegionScan() {
  const deps = usePlaybackRegionScanDeps()
  const { available, checked, features } = useMediaResolverHealth()
  const lastScannedRef = useRef({})

  const maybeAutoScan = useCallback(function(tuneId, linkIndex, link, options) {
    const opts = options || {}
    if (!deps || !tuneId) return Promise.resolve(null)
    if (!checked || !available || !features.whisper) return Promise.resolve(null)

    const url = link && link.link ? String(link.link).trim() : ''
    if (!isScannableLink(url)) return Promise.resolve(null)

    const dedupeKey = tuneId + ':' + linkIndex
    if (!opts.force && lastScannedRef.current[dedupeKey] === url) {
      return Promise.resolve(null)
    }
    lastScannedRef.current[dedupeKey] = url

    const scanLink = Object.assign({}, link, { link: url })
    return requestPlaybackRegionScan(deps, tuneId, linkIndex, scanLink, opts)
  }, [deps, checked, available, features.whisper])

  return { maybeAutoScan }
}

export function autoScanLinkPlaybackRegionIfAvailable(deps, tuneId, linkIndex, link, options) {
  if (!deps || !tuneId) return Promise.resolve(null)
  if (!canAutoScanPlaybackRegion()) return Promise.resolve(null)

  const url = link && link.link ? String(link.link).trim() : ''
  if (!isScannableLink(url)) return Promise.resolve(null)

  const scanLink = Object.assign({}, link, { link: url })
  return requestPlaybackRegionScan(deps, tuneId, linkIndex, scanLink, options || {})
}
