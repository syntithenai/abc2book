/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import FieldSuggestionsChangesStrip from './FieldSuggestionsChangesStrip'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('FieldSuggestionsChangesStrip', function() {
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

  test('renders Clear Suggestions left of Suggestions label in danger style', function() {
    const onOpen = jest.fn()
    const onClearAll = jest.fn()
    act(function() {
      root.render(
        React.createElement(FieldSuggestionsChangesStrip, {
          items: [
            { jobId: 'j1', kind: 'lyrics', count: 2 },
            { jobId: 'j2', kind: 'genre', count: 1 },
          ],
          onOpen: onOpen,
          onClearAll: onClearAll,
        })
      )
    })
    const strip = container.querySelector('[data-testid="field-suggestions-changes-strip"]')
    expect(strip).toBeTruthy()
    expect(strip.textContent).toContain('Suggestions')
    expect(strip.textContent).toContain('Lyrics')
    expect(strip.textContent).toContain('Genre')
    expect(strip.textContent).toContain('Clear Suggestions')
    expect(container.querySelector('[data-testid="suggestions-accept-all"]')).toBeFalsy()

    const clear = container.querySelector('[data-testid="suggestions-clear-all"]')
    expect(clear).toBeTruthy()
    expect(clear.className).toMatch(/btn-danger/)
    expect(clear.className).toMatch(/field-suggestions-clear-all/)
    expect(strip.firstElementChild).toBe(clear)
    const label = Array.from(strip.children).find(function(el) {
      return el.tagName === 'STRONG' && el.textContent === 'Suggestions'
    })
    expect(label).toBeTruthy()
    expect(
      Array.from(strip.children).indexOf(clear)
    ).toBeLessThan(Array.from(strip.children).indexOf(label))

    act(function() {
      container.querySelector('[data-testid="suggestions-open-lyrics"]').click()
    })
    expect(onOpen).toHaveBeenCalled()
    act(function() {
      clear.click()
    })
    expect(onClearAll).toHaveBeenCalled()
  })
})
