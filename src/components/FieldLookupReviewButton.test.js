/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import FieldLookupReviewButton from './FieldLookupReviewButton'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mockGetAwaitingJob = jest.fn()

jest.mock('../useTuneFieldLookupQueue', function() {
  return function useTuneFieldLookupQueue() {
    return {
      getAwaitingJob: mockGetAwaitingJob,
      state: { jobs: [] },
    }
  }
})

jest.mock('../tuneFieldLookupQueue', function() {
  return {
    applyFieldLookupChoice: jest.fn(),
    dismissFieldLookup: jest.fn(),
    getAwaitingJob: function() { return mockGetAwaitingJob.apply(null, arguments) },
    shouldDeferFieldLookupSave: function() { return true },
  }
})

jest.mock('./ImportFieldSuggestion', function() {
  const React = require('react')
  return function MockSuggestion(props) {
    const current = (props.choices || []).find(function(choice) {
      return choice && choice.id === 'current'
    })
    return React.createElement('div', { 'data-testid': 'suggestion' },
      React.createElement('span', { 'data-testid': 'current-preview' }, current && current.preview),
      React.createElement('button', {
        type: 'button',
        'data-testid': 'pick-import',
        onClick: function() {
          const imported = (props.choices || []).find(function(choice) {
            return choice && choice.id !== 'current'
          })
          if (typeof props.onSelectChoice === 'function') props.onSelectChoice(imported)
        },
      }, 'Pick')
    )
  }
})

describe('FieldLookupReviewButton frozen current value', function() {
  let container
  let root
  let applied

  beforeEach(function() {
    applied = null
    mockGetAwaitingJob.mockReset()
    mockGetAwaitingJob.mockReturnValue({
      id: 'job-1',
      status: 'awaiting',
      title: 'Song',
      candidates: [{ text: 'imported lyrics', source: 'web' }],
      options: { searchMode: 'review' },
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(function() {
    act(function() { root.unmount() })
    container.remove()
  })

  test('Current value stays frozen after applying a search result', function() {
    function Harness(props) {
      return React.createElement(FieldLookupReviewButton, {
        candidateId: 'c1',
        kind: 'lyrics',
        currentValue: props.currentValue,
        onApply: function(result) { applied = result },
      })
    }

    act(function() {
      root.render(React.createElement(Harness, { currentValue: '(empty baseline)' }))
    })
    act(function() {
      // flush freeze effect
      root.render(React.createElement(Harness, { currentValue: '(empty baseline)' }))
    })
    expect(container.querySelector('[data-testid="current-preview"]').textContent)
      .toBe('(empty baseline)')

    act(function() {
      container.querySelector('[data-testid="pick-import"]').click()
    })
    expect(applied && applied.text).toBe('imported lyrics')

    act(function() {
      root.render(React.createElement(Harness, { currentValue: 'imported lyrics' }))
    })
    expect(container.querySelector('[data-testid="current-preview"]').textContent)
      .toBe('(empty baseline)')
  })
})
