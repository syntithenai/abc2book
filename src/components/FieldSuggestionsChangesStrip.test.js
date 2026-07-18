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

  test('renders Clear Suggestions and Accept All left of Suggestions label', function() {
    const onOpen = jest.fn()
    const onClearAll = jest.fn()
    const onAcceptAll = jest.fn()
    act(function() {
      root.render(
        React.createElement(FieldSuggestionsChangesStrip, {
          items: [
            { jobId: 'j1', kind: 'lyrics' },
            { jobId: 'j2', kind: 'genre' },
          ],
          onOpen: onOpen,
          onClearAll: onClearAll,
          showAcceptAll: true,
          onAcceptAll: onAcceptAll,
        })
      )
    })
    const strip = container.querySelector('[data-testid="field-suggestions-changes-strip"]')
    expect(strip).toBeTruthy()
    expect(strip.textContent).toContain('Suggestions')
    expect(strip.textContent).toContain('Lyrics')
    expect(strip.textContent).toContain('Genre')
    expect(strip.textContent).toContain('Clear Suggestions')
    expect(strip.textContent).toContain('Accept All')
    expect(strip.textContent).not.toMatch(/\d/)

    const clear = container.querySelector('[data-testid="suggestions-clear-all"]')
    const acceptAll = container.querySelector('[data-testid="suggestions-accept-all"]')
    expect(clear).toBeTruthy()
    expect(acceptAll).toBeTruthy()
    expect(clear.className).toMatch(/btn-danger/)
    expect(acceptAll.className).toMatch(/btn-success/)
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
    act(function() {
      acceptAll.click()
    })
    expect(onAcceptAll).toHaveBeenCalled()
  })
})
