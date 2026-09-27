import { isMobilePlatform } from './platformUtils'

export const CHROME_ZOOM_GUARD_SELECTORS = [
  '.App-header',
  '.music-buttons',
  '.music-editor-chrome-stack',
  '.music-editor-buttons',
  '.notation-editing-controls',
  '.notation-nonstaff-controls-main',
  '.abc-editor-lyrics-toolbar',
  '.links-editor-toolbar',
  '.chords-wizard-toolbar',
  '.scratchpad-editor-chrome',
]

export const CHROME_ZOOM_GUARD_SELECTOR = CHROME_ZOOM_GUARD_SELECTORS.join(', ')

export const CHROME_VV_SCALE_VAR = '--chrome-vv-scale'
export const CHROME_VV_ZOOM_VAR = '--chrome-vv-zoom'

let teardownFn = null
let baseline = null
let lastAppliedScale = null

export function resetZoomBaseline() {
  if (typeof window === 'undefined') {
    baseline = null
    return
  }
  baseline = {
    dpr: window.devicePixelRatio || 1,
  }
}

/**
 * Browser zoom (Ctrl +/-) relative to the DPR seen at startup. Pinch-zoom is
 * disabled for the page and routed to in-app zoom, so visualViewport.scale and
 * window size changes are deliberately ignored here.
 */
export function readPageZoomScale() {
  if (!baseline) resetZoomBaseline()
  if (!baseline || !(baseline.dpr > 0)) return 1

  const dpr = window.devicePixelRatio || 1
  const dprScale = dpr / baseline.dpr
  if (Math.abs(dprScale - 1) > 0.01) return dprScale
  return 1
}

export function updateChromeViewportScale() {
  if (typeof document === 'undefined') return 1
  const scale = readPageZoomScale()

  // Avoid re-applying CSS zoom on every visualViewport scroll tick.
  // Some browsers can report tiny scale fluctuations during normal scrolling
  // (e.g. address bar / layout changes) which makes the notation look like it
  // "zooms" even though the user isn't pinch-zooming.
  if (lastAppliedScale != null && Math.abs(scale - lastAppliedScale) <= 0.001) {
    return scale
  }
  lastAppliedScale = scale

  document.documentElement.style.setProperty(CHROME_VV_SCALE_VAR, String(scale))
  document.documentElement.style.setProperty(CHROME_VV_ZOOM_VAR, String(1 / scale))
  return scale
}

function onViewportChange() {
  updateChromeViewportScale()
}

// Page pinch-zoom is off everywhere; usePinchZoomSteps turns pinches into app zoom.
function onGesture(event) {
  event.preventDefault()
}

function onTouchMove(event) {
  if (event.touches && event.touches.length >= 2) {
    event.preventDefault()
  }
}

export function initChromeZoomGuard() {
  teardownChromeZoomGuard()
  resetZoomBaseline()
  lastAppliedScale = null
  updateChromeViewportScale()

  const visualViewport = typeof window !== 'undefined' ? window.visualViewport : null
  if (visualViewport) {
    visualViewport.addEventListener('resize', onViewportChange)
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', onViewportChange)
  }

  // Safari (iOS and macOS trackpad) pinch arrives as gesture* events.
  if (typeof document !== 'undefined') {
    document.addEventListener('gesturestart', onGesture, { passive: false })
    document.addEventListener('gesturechange', onGesture, { passive: false })
    document.addEventListener('gestureend', onGesture, { passive: false })
  }
  const useMobileTouchGuards = isMobilePlatform()
  if (useMobileTouchGuards && typeof document !== 'undefined') {
    document.addEventListener('touchmove', onTouchMove, { passive: false })
  }

  teardownFn = function() {
    if (visualViewport) {
      visualViewport.removeEventListener('resize', onViewportChange)
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', onViewportChange)
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('gesturestart', onGesture)
      document.removeEventListener('gesturechange', onGesture)
      document.removeEventListener('gestureend', onGesture)
    }
    if (useMobileTouchGuards && typeof document !== 'undefined') {
      document.removeEventListener('touchmove', onTouchMove)
    }
    if (typeof document !== 'undefined') {
      document.documentElement.style.removeProperty(CHROME_VV_SCALE_VAR)
      document.documentElement.style.removeProperty(CHROME_VV_ZOOM_VAR)
    }
    baseline = null
    lastAppliedScale = null
    teardownFn = null
  }

  return teardownFn
}

export function teardownChromeZoomGuard() {
  if (teardownFn) teardownFn()
  lastAppliedScale = null
}
