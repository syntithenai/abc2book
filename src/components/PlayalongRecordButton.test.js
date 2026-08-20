/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import PlayalongRecordButton from './PlayalongRecordButton'
import { shouldShowPlayalongRecordButton } from '../playalongTakes'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('PlayalongRecordButton', function() {
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

  test('icon opens the config dialog when there are no recordings', function() {
    const onOpenConfig = jest.fn()
    const onToggle = jest.fn()
    act(function() {
      root.render(React.createElement(PlayalongRecordButton, {
        tunebook: { icons: { pianoroll: 'roll' } },
        hasTakes: false,
        onOpenConfig: onOpenConfig,
        onTogglePianoRoll: onToggle,
      }))
    })
    const button = container.querySelector('[data-testid="playalong-record-button"]')
    expect(button).toBeTruthy()
    expect(button.getAttribute('aria-label')).toBe('Record play-along')
    expect(container.querySelector('[data-testid="playalong-record-config"]')).toBeTruthy()

    act(function() {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onOpenConfig).toHaveBeenCalled()
    expect(onToggle).not.toHaveBeenCalled()
  })

  test('icon toggles piano roll visibility when takes exist', function() {
    const onToggle = jest.fn()
    const onOpenConfig = jest.fn()
    act(function() {
      root.render(React.createElement(PlayalongRecordButton, {
        tunebook: { icons: { pianoroll: 'roll' } },
        hasTakes: true,
        pianoRollVisible: false,
        onOpenConfig: onOpenConfig,
        onTogglePianoRoll: onToggle,
      }))
    })
    const button = container.querySelector('[data-testid="playalong-record-button"]')
    expect(button.getAttribute('aria-label')).toBe('Show piano roll')

    act(function() {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onToggle).toHaveBeenCalledWith(true)
    expect(onOpenConfig).not.toHaveBeenCalled()

    act(function() {
      root.render(React.createElement(PlayalongRecordButton, {
        tunebook: { icons: { pianoroll: 'roll' } },
        hasTakes: true,
        pianoRollVisible: true,
        onOpenConfig: onOpenConfig,
        onTogglePianoRoll: onToggle,
      }))
    })
    const hideButton = container.querySelector('[data-testid="playalong-record-button"]')
    expect(hideButton.getAttribute('aria-label')).toBe('Hide piano roll')
    act(function() {
      hideButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onToggle).toHaveBeenCalledWith(false)
  })

  test('caret always opens the recording config dialog', function() {
    const onOpenConfig = jest.fn()
    const onToggle = jest.fn()
    act(function() {
      root.render(React.createElement(PlayalongRecordButton, {
        tunebook: { icons: { pianoroll: 'roll' } },
        hasTakes: true,
        pianoRollVisible: true,
        onOpenConfig: onOpenConfig,
        onTogglePianoRoll: onToggle,
      }))
    })
    const caret = container.querySelector('[data-testid="playalong-record-config"]')
    expect(caret).toBeTruthy()
    expect(caret.getAttribute('aria-label')).toBe('Record play-along settings')
    expect(container.querySelector('.dropdown-menu')).toBe(null)

    act(function() {
      caret.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onOpenConfig).toHaveBeenCalled()
    expect(onToggle).not.toHaveBeenCalled()
  })

  test('icon does not toggle while recording', function() {
    const onToggle = jest.fn()
    const onOpenConfig = jest.fn()
    act(function() {
      root.render(React.createElement(PlayalongRecordButton, {
        tunebook: { icons: { pianoroll: 'roll' } },
        hasTakes: true,
        isRecording: true,
        pianoRollVisible: true,
        onOpenConfig: onOpenConfig,
        onTogglePianoRoll: onToggle,
      }))
    })
    const button = container.querySelector('[data-testid="playalong-record-button"]')
    act(function() {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onToggle).not.toHaveBeenCalled()
    expect(onOpenConfig).not.toHaveBeenCalled()
    expect(container.querySelector('[data-testid="playalong-record-config"]')).toBeTruthy()
  })

  test('shows a waiting icon in the toolbar button while the graph is processing', function() {
    act(function() {
      root.render(React.createElement(PlayalongRecordButton, {
        tunebook: { icons: { pianoroll: 'roll', waiting: 'wait' } },
        hasTakes: true,
        pianoRollVisible: true,
        isWaiting: true,
        onOpenConfig: function() {},
        onTogglePianoRoll: function() {},
      }))
    })
    const button = container.querySelector('[data-testid="playalong-record-button"]')
    expect(button.getAttribute('aria-busy')).toBe('true')
    expect(button.getAttribute('aria-label')).toBe('Processing play-along recording')
    expect(button.querySelector('.playalong-record-btn-icon.is-waiting')).toBeTruthy()
    expect(button.textContent).toMatch(/wait/)
  })

  test('visibility helper hides when the tune has no MIDI notes', function() {
    const tunebook = { hasNotes: function() { return false } }
    expect(shouldShowPlayalongRecordButton({ id: 't' }, tunebook, false)).toBe(false)
  })
})
