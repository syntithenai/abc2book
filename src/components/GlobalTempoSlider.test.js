/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import GlobalTempoSlider from './GlobalTempoSlider'
import { getGlobalTempoPercent, setGlobalTempoPercent } from '../globalTempoSettings'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

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

  test('starts off and forces a percent when the slider moves', function() {
    act(function() {
      root.render(React.createElement(GlobalTempoSlider, {}))
    })
    expect(container.querySelector('[data-testid="global-tempo-value"]').textContent).toBe('Off')
    const slider = container.querySelector('[data-testid="global-tempo-slider"]')
    act(function() {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      ).set
      nativeInputValueSetter.call(slider, '80')
      slider.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(getGlobalTempoPercent()).toBe(80)
    expect(container.querySelector('[data-testid="global-tempo-value"]').textContent).toBe('80%')
  })

  test('applies live playback through the media controller', function() {
    const setGlobalPlaybackTempo = jest.fn()
    act(function() {
      root.render(React.createElement(GlobalTempoSlider, {
        mediaController: { setGlobalPlaybackTempo: setGlobalPlaybackTempo },
      }))
    })
    const offButton = Array.from(container.querySelectorAll('button')).find(function(button) {
      return button.textContent === 'Off'
    })
    const slowButton = Array.from(container.querySelectorAll('button')).find(function(button) {
      return button.textContent === 'Slow 75%'
    })
    act(function() { slowButton.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(setGlobalPlaybackTempo).toHaveBeenCalledWith(75)
    act(function() { offButton.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(setGlobalPlaybackTempo).toHaveBeenCalledWith(0)
  })
})
