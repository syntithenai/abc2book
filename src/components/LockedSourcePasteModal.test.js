/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { NOTATION_DOWNLOAD_FILE_ACCEPT } from '../importSourceParse'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mockDispatchAddImport = jest.fn()

jest.mock('../addImportDispatch', function() {
  return {
    buildImportContext: function(opts) { return opts || {} },
    dispatchAddImport: function() {
      return mockDispatchAddImport.apply(null, arguments)
    },
  }
})

jest.mock('../importReviewSessionStore', function() {
  return {
    requestImportReview: jest.fn(),
    showImportReviewUi: jest.fn(),
  }
})

import LockedSourcePasteModal from './LockedSourcePasteModal'

describe('LockedSourcePasteModal notation file pick', function() {
  let container
  let root

  beforeEach(function() {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    mockDispatchAddImport.mockReset()
  })

  afterEach(function() {
    act(function() { root.unmount() })
    container.remove()
  })

  test('accepts MusicXML and related MuseScore download formats', function() {
    act(function() {
      root.render(React.createElement(LockedSourcePasteModal, {
        show: true,
        allowNotationFile: true,
        candidate: {
          contentType: 'notation',
          source: 'MuseScore',
          url: 'https://musescore.com/user/score/1',
          title: 'Demo',
        },
        tunebook: {},
      }))
    })

    const input = document.querySelector('[data-testid="locked-source-notation-file-input"]')
    expect(input).toBeTruthy()
    expect(input.getAttribute('accept')).toBe(NOTATION_DOWNLOAD_FILE_ACCEPT)
    expect(NOTATION_DOWNLOAD_FILE_ACCEPT).toContain('.musicxml')
    expect(NOTATION_DOWNLOAD_FILE_ACCEPT).toContain('.mxl')
    expect(NOTATION_DOWNLOAD_FILE_ACCEPT).toContain('.mscz')
    expect(NOTATION_DOWNLOAD_FILE_ACCEPT).toContain('.mid')
    expect(document.querySelector('[data-testid="locked-source-choose-file"]').textContent)
      .toMatch(/Choose score file/)
  })

  test('imports selected MusicXML via dispatchAddImport', async function() {
    mockDispatchAddImport.mockResolvedValue({
      action: 'review',
      candidates: [{ tune: { name: 'Demo', voices: {} }, sourceKind: 'musicxml' }],
    })
    const onImportCandidates = jest.fn().mockResolvedValue(undefined)

    act(function() {
      root.render(React.createElement(LockedSourcePasteModal, {
        show: true,
        allowNotationFile: true,
        candidate: {
          contentType: 'notation',
          source: 'MuseScore',
          url: 'https://musescore.com/user/score/1',
          title: 'Demo',
        },
        tunebook: {},
        onImportCandidates: onImportCandidates,
      }))
    })

    const input = document.querySelector('[data-testid="locked-source-notation-file-input"]')
    expect(input).toBeTruthy()
    const file = new File(['<score-partwise/>'], 'demo.musicxml', { type: 'application/xml' })
    await act(async function() {
      Object.defineProperty(input, 'files', { value: [file], configurable: true })
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(mockDispatchAddImport).toHaveBeenCalled()
    expect(mockDispatchAddImport.mock.calls[0][0]).toBe(file)
    expect(onImportCandidates).toHaveBeenCalled()
    expect(onImportCandidates.mock.calls[0][0][0].tune.name).toBe('Demo')
  })
})
