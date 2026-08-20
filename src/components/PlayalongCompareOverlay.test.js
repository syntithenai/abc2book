/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import PlayalongCompareOverlay from './PlayalongCompareOverlay'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('PlayalongCompareOverlay', function() {
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

  test('renders compare header with take count', function() {
    act(function() {
      root.render(React.createElement(PlayalongCompareOverlay, {
        tune: {
          meter: '4/4',
          noteLength: '1/8',
          key: 'C',
          voices: { '1': { meta: '', notes: ['CDEF |', 'GABc |'] } },
        },
        takes: [{
          recordingId: 'r1',
          duration: 4,
          musicStartOffsetSeconds: 2,
          tempoBpm: 120,
          peaks: [{ min: -0.2, max: 0.3 }, { min: -0.1, max: 0.2 }],
        }],
        peaksById: {
          r1: [{ min: -0.2, max: 0.3 }, { min: -0.1, max: 0.2 }],
        },
        onClose: function() {},
      }))
    })
    const rootEl = container.querySelector('[data-testid="playalong-compare"]')
    expect(rootEl).toBeTruthy()
    expect(rootEl.textContent).toMatch(/1 take/)
    expect(rootEl.textContent).toMatch(/Line 1/)
    expect(rootEl.textContent).not.toMatch(/Delete latest/)
    expect(rootEl.textContent).not.toMatch(/Close/)
  })

  test('shows recording loop progress in the compare header', function() {
    act(function() {
      root.render(React.createElement(PlayalongCompareOverlay, {
        tune: {
          meter: '4/4',
          noteLength: '1/8',
          key: 'C',
          voices: { '1': { meta: '', notes: ['CDEF |'] } },
        },
        takes: [{
          recordingId: 'r1',
          duration: 4,
          musicStartOffsetSeconds: 2,
          tempoBpm: 120,
        }],
        peaksById: { r1: [{ min: -0.2, max: 0.3 }] },
        isRecording: true,
        takeNumber: 2,
        takeMax: 10,
        onClose: function() {},
      }))
    })
    expect(container.querySelector('[data-testid="playalong-compare"]').textContent).toMatch(/recording 2\/10/)
  })

  test('falls back to a whole-tune strip when line extraction is empty', function() {
    act(function() {
      root.render(React.createElement(PlayalongCompareOverlay, {
        tune: {
          meter: '4/4',
          noteLength: '1/8',
          key: 'C',
          voices: {},
        },
        takes: [{
          recordingId: 'r1',
          duration: 4,
          musicStartOffsetSeconds: 1,
          tempoBpm: 120,
        }],
        peaksById: {
          r1: [{ min: -0.2, max: 0.3 }, { min: -0.1, max: 0.2 }],
        },
        onClose: function() {},
      }))
    })
    expect(container.querySelector('[data-testid="playalong-compare"]').textContent).toMatch(/Whole tune/)
  })
})
