/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import PlayalongRecordConfigModal from './PlayalongRecordConfigModal'
import {
  DEFAULT_PLAYALONG_SETTINGS,
  clampPlayalongRepeats,
} from '../playalongSettings'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('PlayalongRecordConfigModal', function() {
  let container
  let root

  beforeEach(function() {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(function() {
    act(function() { root.unmount() })
    container.remove()
  })

  test('renders cutoff, volume, and instrument fields with help buttons', function() {
    const onStart = jest.fn()
    act(function() {
      root.render(React.createElement(PlayalongRecordConfigModal, {
        show: true,
        tempoBpm: 100,
        settings: DEFAULT_PLAYALONG_SETTINGS,
        canClear: false,
        onStart: onStart,
      }))
    })

    expect(document.querySelector('[data-testid="playalong-tempo-slider"]')).toBeTruthy()
    expect(document.querySelector('[data-testid="playalong-cutoff-slider"]')).toBeTruthy()
    expect(document.querySelector('[data-testid="playalong-volume-slider"]')).toBeTruthy()
    const instrument = document.querySelector('[data-testid="playalong-instrument-select"]')
    expect(instrument).toBeTruthy()
    expect(instrument.value).toBe('whistle')
    expect(instrument.textContent).toMatch(/Tin whistle \(low D\)/)
    expect(instrument.textContent).toMatch(/Tin whistle \(high D\) \/ recorder/)
    expect(instrument.textContent).toMatch(/Guitar \(melody\)/)
    expect(document.body.textContent).toMatch(/one melody line/)

    expect(document.querySelector('[aria-label="Help: Cutoff"]')).toBeTruthy()
    expect(document.querySelector('[aria-label="Help: Playback volume"]')).toBeTruthy()
    expect(document.querySelector('[aria-label="Help: Instrument"]')).toBeTruthy()
  })

  test('Space starts recording when the dialog is open', function() {
    const onStart = jest.fn()
    act(function() {
      root.render(React.createElement(PlayalongRecordConfigModal, {
        show: true,
        tempoBpm: 100,
        settings: DEFAULT_PLAYALONG_SETTINGS,
        canClear: false,
        onStart: onStart,
      }))
    })

    act(function() {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }))
    })
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  test('renders repeats input when takes can be cleared', function() {
    act(function() {
      root.render(React.createElement(PlayalongRecordConfigModal, {
        show: true,
        tempoBpm: 100,
        settings: Object.assign({}, DEFAULT_PLAYALONG_SETTINGS, { repeats: 3 }),
        canClear: true,
      }))
    })

    const repeats = document.querySelector('[data-testid="playalong-repeats-input"]')
    expect(repeats).toBeTruthy()
    expect(repeats.value).toBe('3')
    expect(document.querySelector('[data-testid="playalong-compare-existing"]')).toBeFalsy()
    expect(clampPlayalongRepeats('12')).toBe(10)
  })
})
