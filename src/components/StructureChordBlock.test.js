/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import StructureChordBlock from './StructureChordBlock'

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

describe('StructureChordBlock height-fit sections', function() {
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

  test('marks heading-only repeated stanzas so they are excluded from the height fit', function() {
    const tune = {
      name: 'Test Song',
      words: [
        '[Verse 1]',
        'first verse line',
        '',
        '[Verse 2]',
        'second verse line',
        '',
        '[Verse 3]',
        'third verse line',
      ],
    }

    act(function() {
      root.render(React.createElement(StructureChordBlock, {
        chords: 'C G Am F',
        tune: tune,
        fitHeight: true,
      }))
    })

    const sections = container.querySelectorAll('.structure-section')
    expect(sections.length).toBe(3)

    // First verse carries the chart and counts toward the fit.
    expect(sections[0].querySelector('.chord-block-line')).toBeTruthy()
    expect(sections[0].classList.contains('structure-section--no-chart')).toBe(false)

    // Repeated verses show only their heading and are excluded from the fit.
    for (let i = 1; i < sections.length; i++) {
      expect(sections[i].querySelector('.chord-block-line')).toBeFalsy()
      expect(sections[i].classList.contains('structure-section--no-chart')).toBe(true)
      expect(sections[i].textContent).toContain('Verse ' + (i + 1))
    }
  })
})
