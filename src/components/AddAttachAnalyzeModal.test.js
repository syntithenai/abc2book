/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import AddAttachAnalyzeModal from './AddAttachAnalyzeModal'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('AddAttachAnalyzeModal', function() {
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

  test('Skip is the primary default for sheet images', function() {
    const onSkip = jest.fn()
    const onOcr = jest.fn()
    act(function() {
      root.render(
        React.createElement(AddAttachAnalyzeModal, {
          show: true,
          kind: 'sheetImage',
          fileName: 'page.png',
          onSkip: onSkip,
          onOcr: onOcr,
          onCancel: jest.fn(),
        })
      )
    })
    const skip = document.body.querySelector('[data-testid="add-attach-skip"]')
    const ocr = document.body.querySelector('[data-testid="add-attach-ocr"]')
    expect(skip).toBeTruthy()
    expect(ocr).toBeTruthy()
    act(function() { skip.click() })
    expect(onSkip).toHaveBeenCalled()
    expect(onOcr).not.toHaveBeenCalled()
  })

  test('media dialog offers Analyze', function() {
    act(function() {
      root.render(
        React.createElement(AddAttachAnalyzeModal, {
          show: true,
          kind: 'media',
          fileName: 'clip.mp3',
          onSkip: jest.fn(),
          onAnalyze: jest.fn(),
          onCancel: jest.fn(),
        })
      )
    })
    expect(document.body.querySelector('[data-testid="add-attach-analyze"]')).toBeTruthy()
  })
})
