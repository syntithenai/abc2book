import { useEffect, useRef } from 'react'

export const DEFAULT_PINCH_STEP_RATIO = 1.12
const WHEEL_END_DELAY_MS = 250
// Chromium reports a trackpad pinch as ctrl+wheel where scale = exp(-deltaY / 100).
const WHEEL_DELTA_PER_LOG_SCALE = 100

/**
 * Turns a continuous scale ratio (1 = start of gesture) into whole zoom steps.
 * update() returns the steps to apply since the last call (+ = larger).
 */
export function createPinchStepTracker(stepRatio) {
  const logStep = Math.log(stepRatio > 1 ? stepRatio : DEFAULT_PINCH_STEP_RATIO)
  let applied = 0
  return {
    update(ratio) {
      if (!(ratio > 0)) return 0
      const target = Math.round(Math.log(ratio) / logStep)
      const delta = target - applied
      applied = target
      return delta
    },
    reset() {
      applied = 0
    },
  }
}

/**
 * Accumulates ctrl+wheel deltas (trackpad pinch or ctrl+mouse wheel) into at
 * most one step per event, so a mouse notch is one step and a pinch is smooth.
 */
export function createWheelStepAccumulator(stepRatio) {
  const logStep = Math.log(stepRatio > 1 ? stepRatio : DEFAULT_PINCH_STEP_RATIO)
  let accum = 0
  return {
    push(deltaY) {
      accum += -deltaY / WHEEL_DELTA_PER_LOG_SCALE
      accum = Math.max(-logStep, Math.min(logStep, accum))
      if (accum >= logStep * 0.5) {
        accum -= logStep
        return 1
      }
      if (accum <= -logStep * 0.5) {
        accum += logStep
        return -1
      }
      return 0
    },
    reset() {
      accum = 0
    },
  }
}

function touchDistance(a, b) {
  const dx = a.clientX - b.clientX
  const dy = a.clientY - b.clientY
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Pinch (two-finger touch, Safari gesture events) and ctrl+wheel on targetRef
 * become discrete zoom steps.
 *
 * options.targetRef        ref to the element to listen on
 * options.target           or the element itself (use when it mounts later)
 * options.onStep(dir, pt)  dir is +1 (larger) or -1 (smaller); pt has clientX/clientY
 * options.onEnd()          called once the gesture finishes
 * options.enabled          default true
 * options.isEligibleTarget optional filter on the event target
 * options.wheelMode        'ctrl' (default): only ctrl/meta+wheel zooms;
 *                          'always': any vertical wheel zooms one step per event
 * options.stepRatio        scale change per step (default 1.12)
 */
export default function usePinchZoomSteps(options) {
  const optionsRef = useRef(options)
  optionsRef.current = options
  const targetRef = options.targetRef
  const enabled = options.enabled !== false
  const hasExplicitTarget = options.target !== undefined
  const target = hasExplicitTarget ? options.target : (targetRef ? targetRef.current : null)

  useEffect(function() {
    const el = hasExplicitTarget ? target : (targetRef && targetRef.current)
    if (!el || !enabled) return undefined

    const stepRatio = optionsRef.current.stepRatio || DEFAULT_PINCH_STEP_RATIO
    const pinchTracker = createPinchStepTracker(stepRatio)
    const gestureTracker = createPinchStepTracker(stepRatio)
    const wheelAccumulator = createWheelStepAccumulator(stepRatio)
    let pinchStartDist = 0
    let pinchActive = false
    let wheelEndTimer = null

    function eligible(eventTarget) {
      const filter = optionsRef.current.isEligibleTarget
      return filter ? !!filter(eventTarget) : true
    }

    function emit(steps, point) {
      const onStep = optionsRef.current.onStep
      if (!onStep || !steps) return
      const dir = steps > 0 ? 1 : -1
      for (let i = 0; i < Math.abs(steps); i += 1) onStep(dir, point)
    }

    function end() {
      const onEnd = optionsRef.current.onEnd
      if (onEnd) onEnd()
    }

    function onTouchStart(e) {
      if (!e.touches || e.touches.length !== 2) return
      if (!eligible(e.target)) return
      pinchStartDist = touchDistance(e.touches[0], e.touches[1])
      pinchActive = pinchStartDist > 0
      pinchTracker.reset()
    }

    function onTouchMove(e) {
      if (!pinchActive || !e.touches || e.touches.length !== 2) return
      if (e.cancelable) e.preventDefault()
      const a = e.touches[0]
      const b = e.touches[1]
      const steps = pinchTracker.update(touchDistance(a, b) / pinchStartDist)
      emit(steps, { clientX: (a.clientX + b.clientX) / 2, clientY: (a.clientY + b.clientY) / 2 })
    }

    function onTouchEnd(e) {
      if (!pinchActive) return
      if (e.touches && e.touches.length >= 2) return
      pinchActive = false
      pinchStartDist = 0
      end()
    }

    function onGestureStart(e) {
      if (!eligible(e.target)) return
      e.preventDefault()
      gestureTracker.reset()
    }

    function onGestureChange(e) {
      if (!eligible(e.target)) return
      e.preventDefault()
      emit(gestureTracker.update(e.scale), { clientX: e.clientX, clientY: e.clientY })
    }

    function onGestureEnd(e) {
      if (!eligible(e.target)) return
      e.preventDefault()
      end()
    }

    function onWheel(e) {
      if (!eligible(e.target)) return
      const mode = optionsRef.current.wheelMode || 'ctrl'
      const modifier = e.ctrlKey || e.metaKey
      const point = { clientX: e.clientX, clientY: e.clientY }
      if (mode === 'always') {
        const horizontalDominant = Math.abs(e.deltaX) > Math.abs(e.deltaY)
        if (horizontalDominant && !modifier) return
        e.preventDefault()
        const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX
        if (delta === 0) return
        emit(delta < 0 ? 1 : -1, point)
      } else {
        if (!modifier) return
        e.preventDefault()
        emit(wheelAccumulator.push(e.deltaY), point)
      }
      if (wheelEndTimer) clearTimeout(wheelEndTimer)
      wheelEndTimer = setTimeout(function() {
        wheelEndTimer = null
        wheelAccumulator.reset()
        end()
      }, WHEEL_END_DELAY_MS)
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    el.addEventListener('touchcancel', onTouchEnd, { passive: true })
    el.addEventListener('gesturestart', onGestureStart, { passive: false })
    el.addEventListener('gesturechange', onGestureChange, { passive: false })
    el.addEventListener('gestureend', onGestureEnd, { passive: false })
    el.addEventListener('wheel', onWheel, { passive: false })

    return function() {
      if (wheelEndTimer) clearTimeout(wheelEndTimer)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
      el.removeEventListener('gesturestart', onGestureStart)
      el.removeEventListener('gesturechange', onGestureChange)
      el.removeEventListener('gestureend', onGestureEnd)
      el.removeEventListener('wheel', onWheel)
    }
  }, [targetRef, target, hasExplicitTarget, enabled])
}
