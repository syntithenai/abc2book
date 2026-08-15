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

  test('widens only short lyric fragments that sit under closely adjacent chords', function() {
    const tune = {
      name: 'Test',
      key: 'C',
      words: ['[Cmaj7]I [G]am Amazing', '[G]Amazing grace how [C]sweet'],
      voices: {},
    }

    act(function() {
      root.render(React.createElement(TimedLyricsChordsView, {
        tune: tune,
        suppressLeadingTitle: true,
      }))
    })

    const tokens = Array.from(container.querySelectorAll('.chordpro-token'))
    const labeled = tokens.map(function(token) {
      const chord = token.querySelector('.chordpro-chord--symbol')
      return {
        chord: chord ? chord.textContent : '',
        needsGap: token.classList.contains('chordpro-token--needs-gap'),
        overflow: !!token.querySelector('.chordpro-chord--overflow'),
      }
    }).filter(function(item) { return !!item.chord })

    expect(labeled).toEqual([
      { chord: 'Cmaj7', needsGap: true, overflow: false },
      { chord: 'G', needsGap: false, overflow: true },
      { chord: 'G', needsGap: true, overflow: false },
      { chord: 'C', needsGap: false, overflow: true },
    ])
  })
})
