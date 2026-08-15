/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import TimedLyricsChordsView from './TimedLyricsChordsView'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

beforeAll(function() {
  if (typeof global.ResizeObserver === 'undefined') {
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
})

describe('TimedLyricsChordsView transpose', function() {
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

  test('applies chordTranspose to passthrough chord-over-words charts', function() {
    const tune = {
      name: 'Test',
      key: 'C',
      words: ['C    G', 'hello there', '', 'Am   F', 'second line'],
      voices: {},
    }

    act(function() {
      root.render(React.createElement(TimedLyricsChordsView, {
        tune: tune,
        chordTranspose: 2,
        chordsOnly: true,
        forceBlockLayout: true,
        suppressLeadingTitle: true,
      }))
    })

    const text = container.textContent
    expect(text).toMatch(/\bD\b/)
    expect(text).toMatch(/\bA\b/)
    expect(text).not.toMatch(/\bC\b/)
  })
})
