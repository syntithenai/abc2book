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

  test('renders Accept, Clear, Open and bulk actions', function() {
    const onAccept = jest.fn()
    const onClear = jest.fn()
    const onOpen = jest.fn()
    const onAcceptAll = jest.fn()
    const onClearAll = jest.fn()
    act(function() {
      root.render(
        React.createElement(FieldSuggestionsChangesStrip, {
          items: [{ jobId: 'j1', kind: 'lyrics', count: 2 }],
          onAccept: onAccept,
          onClear: onClear,
          onOpen: onOpen,
          onAcceptAll: onAcceptAll,
          onClearAll: onClearAll,
        })
      )
    })
    const strip = container.querySelector('[data-testid="field-suggestions-changes-strip"]')
    expect(strip).toBeTruthy()
    act(function() {
      strip.querySelector('[data-testid="suggestions-row-lyrics"] button').click()
    })
    expect(onAccept).toHaveBeenCalled()
    act(function() {
      container.querySelector('[data-testid="suggestions-accept-all"]').click()
      container.querySelector('[data-testid="suggestions-clear-all"]').click()
    })
    expect(onAcceptAll).toHaveBeenCalled()
    expect(onClearAll).toHaveBeenCalled()
  })
})
