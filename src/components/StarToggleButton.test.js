/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import StarToggleButton from './StarToggleButton'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('StarToggleButton', function() {
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

  test('toggles starred state in place without waiting for a parent remount', function() {
    const tune = { id: 't1', starred: false }
    const saveTune = jest.fn()
    act(function() {
      root.render(React.createElement(StarToggleButton, {
        tune: tune,
        tunebook: {
          saveTune: saveTune,
          icons: { star: '☆', starfilled: '★' },
        },
      }))
    })

    const button = container.querySelector('button')
    expect(button.getAttribute('aria-pressed')).toBe('false')
    expect(button.getAttribute('aria-label')).toBe('Star tune')

    act(function() {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(tune.starred).toBe(true)
    expect(saveTune).toHaveBeenCalledWith(tune)
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(button.getAttribute('aria-label')).toBe('Unstar tune')
  })
})
