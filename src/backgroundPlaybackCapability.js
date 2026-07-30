import { prefersNativeMediaPlayback, isAndroidApp } from './platformUtils'
import { playbackNeedsExternalProcessing } from './pitchTempoUtils'
import { linkedMediaPitchPathAvailableSync } from './linkedMediaPitchPath'

/**
 * Whether the current track can continue in background on this platform.
 */
export function isBackgroundCapablePlayback(options) {
  const opts = options || {}
  if (!prefersNativeMediaPlayback()) {
    return true
  }

  const routeMode = opts.routeMode || 'media'
  const srcType = opts.srcType || ''
  const settings = opts.settings || {}

  if (routeMode === 'midi') {
    return !!opts.hasNativeAbcCache || !!opts.nativeActive
  }

  if (srcType === 'midifile') {
    return !!opts.hasNativeMidiCache || !!opts.nativeActive
  }

  if (srcType === 'audio' || srcType === 'youtube' || srcType === 'recording') {
    if (opts.nativeActive) return true
    if (!playbackNeedsExternalProcessing(settings)) return true
    if (opts.hasPreRenderedBlob) return true
    if (isAndroidApp() && (srcType === 'audio' || srcType === 'youtube')) return true
    return linkedMediaPitchPathAvailableSync(opts.pitchPathOptions || {})
  }

  return false
}
