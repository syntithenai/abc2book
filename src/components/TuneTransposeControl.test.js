/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import TuneTransposeControl, { TRANSPOSE_DEBOUNCE_MS } from './TuneTransposeControl'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('TuneTransposeControl', function() {
  let container
  let root

  beforeEach(function() {
    jest.useFakeTimers()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(function() {
    act(function() { root.unmount() })
    container.remove()
    jest.useRealTimers()
  })

  test('updates the label immediately without calling onCommit until debounce', function() {
    const onCommit = jest.fn()

    act(function() {
      root.render(React.createElement(TuneTransposeControl, {
        value: 0,
        onCommit: onCommit,
      }))
    })

    const buttons = container.querySelectorAll('button')
    // − | label | +
    expect(buttons[1].textContent).toBe('+0')

    act(function() {
      buttons[2].click()
      buttons[2].click()
      buttons[0].click()
    })

    expect(buttons[1].textContent).toBe('+1')
    expect(onCommit).not.toHaveBeenCalled()

    act(function() {
      jest.advanceTimersByTime(TRANSPOSE_DEBOUNCE_MS - 1)
    })
    expect(onCommit).not.toHaveBeenCalled()

    act(function() {
      jest.advanceTimersByTime(1)
    })
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith(1)
  })

  test('does not re-commit when parent value catches up after onCommit', function() {
    const onCommit = jest.fn()
    let value = 0

    function Harness() {
      return React.createElement(TuneTransposeControl, {
        value: value,
        onCommit: function(next) {
          onCommit(next)
          value = next
        },
      })
    }

    act(function() {
      root.render(React.createElement(Harness))
    })

    act(function() {
      container.querySelectorAll('button')[2].click()
      container.querySelectorAll('button')[2].click()
    })

    act(function() {
      jest.advanceTimersByTime(TRANSPOSE_DEBOUNCE_MS)
    })
    expect(onCommit).toHaveBeenCalledWith(2)

    act(function() {
      root.render(React.createElement(Harness))
    })

    expect(container.querySelectorAll('button')[1].textContent).toBe('+2')
    expect(onCommit).toHaveBeenCalledTimes(1)
  })
})
