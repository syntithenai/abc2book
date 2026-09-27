/**
 * @jest-environment jsdom
 */
import React, { useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import usePinchZoomSteps, {
  createPinchStepTracker,
  createWheelStepAccumulator,
} from './usePinchZoomSteps'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('createPinchStepTracker', function() {
  it('emits one step per 12% scale change in either direction', function() {
    const tracker = createPinchStepTracker(1.12)
    expect(tracker.update(1.05)).toBe(0)
    expect(tracker.update(1.12)).toBe(1)
    expect(tracker.update(1.12 * 1.12)).toBe(1)
    expect(tracker.update(1)).toBe(-2)
    expect(tracker.update(1 / 1.12)).toBe(-1)
  })

  it('restarts from zero after reset', function() {
    const tracker = createPinchStepTracker(1.12)
    tracker.update(1.3)
    tracker.reset()
    expect(tracker.update(1.12)).toBe(1)
  })
})

describe('createWheelStepAccumulator', function() {
  it('treats a mouse notch as exactly one step', function() {
    const acc = createWheelStepAccumulator(1.12)
    expect(acc.push(-100)).toBe(1)
    expect(acc.push(100)).toBe(-1)
  })

  it('accumulates small trackpad pinch deltas', function() {
    const acc = createWheelStepAccumulator(1.12)
    expect(acc.push(-2)).toBe(0)
    expect(acc.push(-2)).toBe(0)
    expect(acc.push(-2)).toBe(1)
  })
})

describe('usePinchZoomSteps', function() {
  let container
  let root

  function Harness(props) {
    const ref = useRef(null)
    usePinchZoomSteps({
      targetRef: ref,
      onStep: props.onStep,
      onEnd: props.onEnd,
      wheelMode: props.wheelMode,
    })
    return <div ref={ref} data-testid="target" />
  }

  function render(props) {
    act(function() {
      root.render(<Harness {...props} />)
    })
    return container.querySelector('[data-testid="target"]')
  }

  function wheel(el, init) {
    const event = new WheelEvent('wheel', Object.assign({ bubbles: true, cancelable: true }, init))
    el.dispatchEvent(event)
    return event
  }

  beforeEach(function() {
    jest.useFakeTimers()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(function() {
    act(function() { root.unmount() })
    document.body.removeChild(container)
    jest.useRealTimers()
  })

  it('zooms on ctrl+wheel and ignores plain wheel by default', function() {
    const onStep = jest.fn()
    const onEnd = jest.fn()
    const el = render({ onStep: onStep, onEnd: onEnd })

    const plain = wheel(el, { deltaY: -100 })
    expect(onStep).not.toHaveBeenCalled()
    expect(plain.defaultPrevented).toBe(false)

    const pinch = wheel(el, { deltaY: -100, ctrlKey: true })
    expect(pinch.defaultPrevented).toBe(true)
    expect(onStep).toHaveBeenCalledTimes(1)
    expect(onStep.mock.calls[0][0]).toBe(1)

    wheel(el, { deltaY: 100, ctrlKey: true })
    expect(onStep.mock.calls[1][0]).toBe(-1)

    expect(onEnd).not.toHaveBeenCalled()
    act(function() { jest.advanceTimersByTime(300) })
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it('zooms on any vertical wheel in always mode', function() {
    const onStep = jest.fn()
    const el = render({ onStep: onStep, wheelMode: 'always' })
    wheel(el, { deltaY: 30 })
    expect(onStep).toHaveBeenCalledWith(-1, expect.any(Object))
    wheel(el, { deltaX: 50, deltaY: 1 })
    expect(onStep).toHaveBeenCalledTimes(1)
  })

  it('turns a two-finger touch pinch into steps and ends on release', function() {
    const onStep = jest.fn()
    const onEnd = jest.fn()
    const el = render({ onStep: onStep, onEnd: onEnd })

    function touchEvent(type, touches) {
      const event = new Event(type, { bubbles: true, cancelable: true })
      event.touches = touches
      el.dispatchEvent(event)
      return event
    }

    touchEvent('touchstart', [{ clientX: 100, clientY: 100 }, { clientX: 200, clientY: 100 }])
    const move = touchEvent('touchmove', [{ clientX: 80, clientY: 100 }, { clientX: 220, clientY: 100 }])
    expect(move.defaultPrevented).toBe(true)
    // 140 / 100 = 1.4 → round(log(1.4) / log(1.12)) = 3 steps larger
    expect(onStep).toHaveBeenCalledTimes(3)
    expect(onStep.mock.calls.every(function(call) { return call[0] === 1 })).toBe(true)

    touchEvent('touchend', [{ clientX: 80, clientY: 100 }])
    expect(onEnd).toHaveBeenCalledTimes(1)
  })
})
