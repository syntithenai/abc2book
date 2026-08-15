/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import NotationSearchButton from './NotationSearchButton'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mockStartSearch = jest.fn()
const mockCancel = jest.fn()
const mockDismiss = jest.fn()
const mockApplyNotationSearchCandidate = jest.fn()
let capturedOnAwaiting = null
let mockActiveJob = null
let lastNotationPickerProps = null

jest.mock('../useMediaResolverHealth', function() {
  return function() { return { available: true } }
})

jest.mock('../useFieldLookupSearchJob', function() {
  return {
    useFieldLookupSearchJob: function(options) {
      capturedOnAwaiting = options && options.onAwaiting
      return {
        busy: false,
        progressPercent: 0,
        progressMessage: '',
        activeJob: mockActiveJob,
        startSearch: mockStartSearch,
        cancel: mockCancel,
        dismiss: mockDismiss,
      }
    },
  }
})

jest.mock('../useMediaQuery', function() {
  return {
    useIsNarrowViewport: function() { return false },
  }
})

jest.mock('../useAbcjsParser', function() {
  return function() { return {} }
})

jest.mock('../notationMidiImport', function() {
  return {
    isDeferredMidiNotationCandidate: function(candidate) {
      return !!(candidate && (candidate.importFormat === 'midi' || candidate.midiBytes))
    },
    applyNotationSearchCandidate: function() {
      return mockApplyNotationSearchCandidate.apply(null, arguments)
    },
  }
})

jest.mock('./ManualCandidatesFeedback', function() {
  const React = require('react')
  return function MockManual(props) {
    if (!props.manualCandidates || !props.manualCandidates.length) return null
    return React.createElement('div', { 'data-testid': 'notation-manual-feedback' },
      String(props.manualCandidates.length) + ' manuals')
  }
})

jest.mock('./LockedSourcePasteModal', function() {
  return function MockLocked() { return null }
})

jest.mock('./FieldSearchModeDialog', function() {
  const React = require('react')
  return function MockModeDialog(props) {
    if (!props.show) return null
    return React.createElement('div', { 'data-testid': 'mode-dialog' }, 'mode')
  }
})

jest.mock('./MelodyAnalysisRefineModal', function() {
  return function MockRefine() { return null }
})

jest.mock('./SearchResultPickerModal', function() {
  const React = require('react')
  return function MockPicker(props) {
    if (props.title === 'Choose notation') lastNotationPickerProps = props
    if (!props.show) return null
    const id = props.title === 'External notation search'
      ? 'notation-external-picker'
      : 'notation-picker'
    return React.createElement('div', {
      'data-testid': id,
      onClick: function() {
        if (typeof props.onSelect === 'function' && props.items && props.items[0]) {
          props.onSelect(props.items[0], 0)
        }
      },
    }, String((props.items && props.items.length) || 0) + ' items')
  }
})

describe('NotationSearchButton', function() {
  let container
  let root

  beforeEach(function() {
    mockStartSearch.mockClear()
    mockCancel.mockClear()
    mockDismiss.mockClear()
    mockApplyNotationSearchCandidate.mockReset()
    mockApplyNotationSearchCandidate.mockResolvedValue({ result: { abc: 'X:1\nK:C\nC' } })
    mockStartSearch.mockReturnValue('job-1')
    capturedOnAwaiting = null
    mockActiveJob = null
    lastNotationPickerProps = null
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(function() {
    act(function() { root.unmount() })
    container.remove()
  })

  function renderButton(extraProps) {
    act(function() {
      root.render(
        React.createElement(NotationSearchButton, Object.assign({
          tuneId: 't1',
          title: 'Demo',
          artist: 'Anon',
          tunebook: {
            icons: {
              search: React.createElement('span', null, 'S'),
              externallink: React.createElement('span', null, 'E'),
            },
          },
        }, extraProps || {}))
      )
    })
  }

  function clickSearch() {
    const searchBtn = Array.from(container.querySelectorAll('button')).find(function(btn) {
      return (btn.textContent || '').indexOf('Search') >= 0
    })
    act(function() { searchBtn.click() })
  }

  test('searches in review mode without Auto/Review dialog', function() {
    renderButton()
    clickSearch()
    expect(container.querySelector('[data-testid="mode-dialog"]')).toBeNull()
    expect(mockStartSearch).toHaveBeenCalledTimes(1)
    const args = mockStartSearch.mock.calls[0][0]
    expect(args.options.searchMode).toBe('review')
    expect(args.options.alwaysPick).toBe(true)
  })

  test('opens picker even when leaveAwaiting is true', function() {
    renderButton({ leaveAwaiting: true })
    expect(typeof capturedOnAwaiting).toBe('function')
    act(function() {
      capturedOnAwaiting({
        candidates: [{ title: 'Demo', abc: 'X:1\nK:C\nC', source: 'test' }],
      })
    })
    expect(container.querySelector('[data-testid="notation-picker"]')).not.toBeNull()
  })

  test('does not show Suggestions chrome', function() {
    renderButton({ leaveAwaiting: true })
    expect(container.querySelector('[data-testid="field-suggestions-open"]')).toBeNull()
  })

  test('shows MuseScore manual feedback when only locked scores are awaiting', function() {
    renderButton()
    expect(typeof capturedOnAwaiting).toBe('function')
    act(function() {
      capturedOnAwaiting({
        candidates: [],
        manualCandidates: [{
          url: 'https://musescore.com/user/1/scores/2',
          title: 'Demo',
          source: 'musescore.com',
          contentType: 'notation',
        }],
      })
    })
    expect(container.querySelector('[data-testid="notation-picker"]')).toBeNull()
    expect(container.querySelector('[data-testid="notation-manual-feedback"]')).not.toBeNull()
  })

  test('external link opens one-shot chooser dialog', function() {
    const openSpy = jest.fn()
    const originalOpen = window.open
    window.open = openSpy
    renderButton()
    const externalBtn = container.querySelector('[data-testid="notation-external-menu"]')
    expect(externalBtn).toBeTruthy()
    act(function() { externalBtn.click() })
    const picker = container.querySelector('[data-testid="notation-external-picker"]')
    expect(picker).toBeTruthy()
    act(function() { picker.click() })
    expect(openSpy).toHaveBeenCalled()
    expect(String(openSpy.mock.calls[0][0] || '')).toMatch(/^https?:\/\//)
    window.open = originalOpen
  })

  test('selecting a deferred MIDI candidate opens the import wizard', async function() {
    const onNotation = jest.fn()
    mockApplyNotationSearchCandidate.mockImplementation(function(candidate, options) {
      if (options && options.onAbc) {
        options.onAbc('X:1\nT:Moonlight Sonata\nK:C#m\nC', '', candidate)
      }
      return Promise.resolve({ result: { abc: 'X:1\nT:Moonlight Sonata\nK:C#m\nC' } })
    })
    renderButton({ onNotation: onNotation })
    expect(typeof capturedOnAwaiting).toBe('function')
    act(function() {
      capturedOnAwaiting({
        kind: 'notation',
        candidates: [{
          title: 'Moonlight Sonata',
          artist: 'Beethoven',
          importFormat: 'midi',
          source: 'midi-resources',
          sourceUrl: '/midi-resources/Various Artists/Moonlight Sonata (Beethoven).mid',
        }],
      })
    })
    expect(container.querySelector('[data-testid="notation-picker"]')).not.toBeNull()
    expect(lastNotationPickerProps).toBeTruthy()
    await act(async function() {
      lastNotationPickerProps.onSelect(lastNotationPickerProps.items[1], 1)
    })
    expect(mockApplyNotationSearchCandidate).toHaveBeenCalled()
    const applied = mockApplyNotationSearchCandidate.mock.calls[0][0]
    expect(applied.importFormat).toBe('midi')
    expect(applied.sourceUrl).toContain('/midi-resources/')
    expect(onNotation).toHaveBeenCalled()
    expect(onNotation.mock.calls[0][0].abc).toMatch(/K:/)
  })
})
