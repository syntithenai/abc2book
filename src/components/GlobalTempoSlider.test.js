/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import GlobalTempoSlider from './GlobalTempoSlider'
import { getGlobalTempoPercent, setGlobalTempoPercent } from '../globalTempoSettings'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

function toggleCheckbox(input) {
  act(function() {
    input.click()
  })
}

function setSliderValue(slider, nextValue) {
  act(function() {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    ).set
    nativeInputValueSetter.call(slider, String(nextValue))
    slider.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('GlobalTempoSlider', function() {
  let container
  let root

  beforeEach(function() {
    localStorage.clear()
    setGlobalTempoPercent(0)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(function() {
    act(function() { root.unmount() })
    container.remove()
    localStorage.clear()
  })

  test('checkbox enables override and slider sets the percent', function() {
    act(function() {
      root.render(React.createElement(GlobalTempoSlider, {}))
    })
    expect(container.textContent).toContain('Tempo')
    const enable = container.querySelector('[data-testid="global-tempo-enable"]')
    const slider = container.querySelector('[data-testid="global-tempo-slider"]')
    const value = container.querySelector('[data-testid="global-tempo-value"]')
    expect(enable.checked).toBe(false)
    expect(slider.disabled).toBe(true)
    expect(value.textContent).toBe('100')

    toggleCheckbox(enable)
    expect(getGlobalTempoPercent()).toBe(100)
    expect(slider.disabled).toBe(false)

    setSliderValue(slider, 80)
    expect(getGlobalTempoPercent()).toBe(80)
    expect(value.textContent).toBe('80')
  })

  test('unchecking disables override and remembers the last value', function() {
    setGlobalTempoPercent(90)
    act(function() {
      root.render(React.createElement(GlobalTempoSlider, {}))
    })
    const enable = container.querySelector('[data-testid="global-tempo-enable"]')
    expect(enable.checked).toBe(true)

    toggleCheckbox(enable)
    expect(getGlobalTempoPercent()).toBe(0)
    expect(container.querySelector('[data-testid="global-tempo-value"]').textContent).toBe('90')

    toggleCheckbox(enable)
    expect(getGlobalTempoPercent()).toBe(90)
  })

  test('applies live playback through the media controller', function() {
    const setGlobalPlaybackTempo = jest.fn()
    act(function() {
      root.render(React.createElement(GlobalTempoSlider, {
        mediaController: { setGlobalPlaybackTempo: setGlobalPlaybackTempo },
      }))
    })
    const enable = container.querySelector('[data-testid="global-tempo-enable"]')
    toggleCheckbox(enable)
    expect(setGlobalPlaybackTempo).toHaveBeenCalledWith(100)
  })
})
