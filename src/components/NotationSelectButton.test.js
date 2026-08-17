/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import NotationSelectButton from './NotationSelectButton'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mockRunNotationFileImport = jest.fn()
const mockRequestImportReview = jest.fn()
const mockShowImportReviewUi = jest.fn()
const mockSetPendingAbcImportBatch = jest.fn()
const mockToastError = jest.fn()

jest.mock('../useMediaResolverHealth', function() {
  return function() { return { available: true } }
})

jest.mock('../useAbcjsParser', function() {
  return function() { return {} }
})

jest.mock('../useMediaQuery', function() {
  return {
    useIsNarrowViewport: function() { return false },
  }
})

jest.mock('../notationFileImport', function() {
  return {
    runNotationFileImport: function() {
      return mockRunNotationFileImport.apply(null, arguments)
    },
  }
})

jest.mock('../importReviewSessionStore', function() {
  return {
    requestImportReview: function() {
      return mockRequestImportReview.apply(null, arguments)
    },
    showImportReviewUi: function() {
      return mockShowImportReviewUi.apply(null, arguments)
    },
  }
})

jest.mock('../abcImportBatchStore', function() {
  return {
    setPendingAbcImportBatch: function() {
      return mockSetPendingAbcImportBatch.apply(null, arguments)
    },
  }
})

jest.mock('react-toastify', function() {
  return {
    toast: {
      error: function() { return mockToastError.apply(null, arguments) },
    },
  }
})

describe('NotationSelectButton', function() {
  let container
  let root

  beforeEach(function() {
    mockRunNotationFileImport.mockReset()
    mockRequestImportReview.mockReset()
    mockShowImportReviewUi.mockReset()
    mockSetPendingAbcImportBatch.mockReset()
    mockToastError.mockReset()
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
        React.createElement(NotationSelectButton, Object.assign({
          tune: { id: 't1', name: 'Demo' },
          tunebook: {
            icons: {
              folderin: React.createElement('span', null, 'F'),
            },
          },
        }, extraProps || {}))
      )
    })
  }

  test('renders Select next to a hidden file input', function() {
    renderButton()
    const button = container.querySelector('[data-testid="notation-select-button"]')
    expect(button).toBeTruthy()
    expect(button.textContent).toContain('Select')
    expect(container.querySelector('[data-testid="notation-select-file-input"]')).toBeTruthy()
  })

  test('applies a single imported candidate', async function() {
    const onNotation = jest.fn()
    const candidate = { sourceKind: 'abc', tune: { voices: { '1': { notes: ['C'] } } } }
    mockRunNotationFileImport.mockResolvedValue({ action: 'apply', candidate: candidate })
    renderButton({ onNotation: onNotation })
    const input = container.querySelector('[data-testid="notation-select-file-input"]')
    const file = new File(['X:1\nK:C\nC'], 'tune.abc', { type: 'text/plain' })
    await act(async function() {
      Object.defineProperty(input, 'files', { value: [file], configurable: true })
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(mockRunNotationFileImport).toHaveBeenCalled()
    expect(onNotation).toHaveBeenCalledWith(candidate)
    expect(mockRequestImportReview).not.toHaveBeenCalled()
  })

  test('opens import review when merge is needed', async function() {
    const candidates = [{ mergeTargetId: 't1', tune: { name: 'Imported' } }]
    mockRunNotationFileImport.mockResolvedValue({ action: 'review', candidates: candidates })
    renderButton()
    const input = container.querySelector('[data-testid="notation-select-file-input"]')
    const file = new File(['X:1\nK:C\nC'], 'tune.abc', { type: 'text/plain' })
    await act(async function() {
      Object.defineProperty(input, 'files', { value: [file], configurable: true })
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(mockRequestImportReview).toHaveBeenCalledWith(candidates, { entryMode: 'import' })
    expect(mockShowImportReviewUi).toHaveBeenCalled()
  })

  test('toasts import errors', async function() {
    mockRunNotationFileImport.mockResolvedValue({ action: 'error', message: 'MIDI import needs the media resolver.' })
    renderButton()
    const input = container.querySelector('[data-testid="notation-select-file-input"]')
    const file = new File(['x'], 'tune.mid', { type: 'audio/midi' })
    await act(async function() {
      Object.defineProperty(input, 'files', { value: [file], configurable: true })
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(mockToastError).toHaveBeenCalledWith('MIDI import needs the media resolver.')
  })
})
