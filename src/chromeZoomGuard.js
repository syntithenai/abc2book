import { isMobilePlatform } from './platformUtils'

export const CHROME_ZOOM_GUARD_SELECTORS = [
  '.App-header',
  '.music-buttons',
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

const OUTER_WIDTH_RESIZE_THRESHOLD = 8

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
    innerWidth: window.innerWidth,
    outerWidth: window.outerWidth,
  }
}

function readVisualViewportScale() {
  if (typeof window === 'undefined' || !window.visualViewport) return null
  const scale = window.visualViewport.scale
  if (!(scale > 0)) return null
  if (Math.abs(scale - 1) <= 0.01) return null
  return scale
}

export function readPageZoomScale() {
  const visualScale = readVisualViewportScale()
  if (visualScale) return visualScale

  if (!baseline) resetZoomBaseline()
  if (!baseline) return 1

  const dpr = window.devicePixelRatio || 1
  if (baseline.dpr > 0) {
    const dprScale = dpr / baseline.dpr
    if (Math.abs(dprScale - 1) > 0.01) return dprScale
  }

  if (baseline.innerWidth > 0 && window.innerWidth > 0) {
    const innerScale = baseline.innerWidth / window.innerWidth
    if (Math.abs(innerScale - 1) > 0.01) return innerScale
  }

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

function isChromeZoomTarget(target) {
  return Boolean(target && target.closest && target.closest(CHROME_ZOOM_GUARD_SELECTOR))
}

function onVisualViewportChange() {
  updateChromeViewportScale()
}

function onWindowResize() {
  if (!baseline) resetZoomBaseline()
  if (baseline) {
    const outerDelta = Math.abs(window.outerWidth - baseline.outerWidth)
    if (outerDelta > OUTER_WIDTH_RESIZE_THRESHOLD) {
      resetZoomBaseline()
    }
  }
  updateChromeViewportScale()
}

function onGesture(event) {
  if (isChromeZoomTarget(event.target)) {
    event.preventDefault()
  }
}

function onTouchMove(event) {
  if (event.touches && event.touches.length >= 2 && isChromeZoomTarget(event.target)) {
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
    visualViewport.addEventListener('resize', onVisualViewportChange)
    // visualViewport 'scroll' can fire during normal scrolling even when the
    // browser zoom level didn't change. Reacting to it can cause UI zoom jitter.
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', onWindowResize)
  }

  const useMobileTouchGuards = isMobilePlatform()
  if (useMobileTouchGuards && typeof document !== 'undefined') {
    document.addEventListener('gesturestart', onGesture, { passive: false })
    document.addEventListener('gesturechange', onGesture, { passive: false })
    document.addEventListener('gestureend', onGesture, { passive: false })
    document.addEventListener('touchmove', onTouchMove, { passive: false })
  }

  teardownFn = function() {
    if (visualViewport) {
      visualViewport.removeEventListener('resize', onVisualViewportChange)
      visualViewport.removeEventListener('scroll', onVisualViewportChange)
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', onWindowResize)
    }
    if (useMobileTouchGuards && typeof document !== 'undefined') {
      document.removeEventListener('gesturestart', onGesture)
      document.removeEventListener('gesturechange', onGesture)
      document.removeEventListener('gestureend', onGesture)
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
