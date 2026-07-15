/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import ImportFieldSuggestion from './ImportFieldSuggestion'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

jest.mock('./SuggestionPreviewDialog', function() {
  const React = require('react')
  return function MockPreview(props) {
    if (!props.show) return null
    return React.createElement('div', { 'data-testid': 'suggestion-preview' },
      React.createElement('span', null, props.kind),
      React.createElement('button', { type: 'button', onClick: props.onCancel }, 'Cancel'),
      React.createElement('button', { type: 'button', onClick: props.onConfirm }, 'Use this value')
    )
  }
})

jest.mock('./SearchResultPickerModal', function() {
  const React = require('react')
  return function MockPicker(props) {
    if (!props.show) return null
    return React.createElement('div', { 'data-testid': 'notation-gallery', 'data-layout': props.layout },
      (props.items || []).map(function(item, index) {
        return React.createElement('button', {
          type: 'button',
          key: index,
          onClick: function() { props.onSelect(item, index) },
        }, item.title)
      })
    )
  }
})

jest.mock('react-bootstrap', function() {
  const React = require('react')
  function Dropdown(props) {
    return React.createElement('div', { className: props.className }, props.children)
  }
  Dropdown.Toggle = function Toggle(props) {
    return React.createElement('button', {
      type: 'button',
      'aria-label': props['aria-label'],
    }, props.children)
  }
  Dropdown.Menu = function Menu(props) {
    return React.createElement('div', { className: props.className }, props.children)
  }
  Dropdown.Item = function Item(props) {
    return React.createElement('button', {
      type: 'button',
      className: props.className,
      onClick: props.onClick,
    }, props.children)
  }
  function Button(props) {
    return React.createElement('button', {
      type: 'button',
      className: props.className,
      onClick: props.onClick,
      'aria-label': props['aria-label'],
    }, props.children)
  }
  return { Dropdown: Dropdown, Button: Button }
})

describe('ImportFieldSuggestion', function() {
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

  test('opens preview dialog for lyrics before apply', function() {
    const onSelectChoice = jest.fn()
    act(function() {
      root.render(
        React.createElement(ImportFieldSuggestion, {
          formKey: 'lyrics',
          fieldKey: 'words',
          label: 'Lyrics',
          suggestion: { key: 'words', formKey: 'lyrics', value: 'new' },
          choices: [
            { id: 'current', label: 'Current value', preview: 'old', value: 'old' },
            { id: 'imported', label: 'Imported', preview: 'new', value: 'new' },
          ],
          onSelectChoice: onSelectChoice,
        })
      )
    })
    const imported = Array.from(container.querySelectorAll('button')).find(function(btn) {
      return (btn.textContent || '').indexOf('Imported') >= 0
    })
    act(function() { imported.click() })
    expect(container.querySelector('[data-testid="suggestion-preview"]')).toBeTruthy()
    expect(onSelectChoice).not.toHaveBeenCalled()

    const confirm = Array.from(container.querySelectorAll('button')).find(function(btn) {
      return btn.textContent === 'Use this value'
    })
    act(function() { confirm.click() })
    expect(onSelectChoice).toHaveBeenCalledTimes(1)
    expect(onSelectChoice.mock.calls[0][0].id).toBe('imported')
  })

  test('opens notation gallery instead of dropdown', function() {
    const onSelectChoice = jest.fn()
    act(function() {
      root.render(
        React.createElement(ImportFieldSuggestion, {
          formKey: 'notes',
          fieldKey: 'voices',
          label: 'Notation',
          suggestion: { key: 'voices', formKey: 'notes', value: 'CDEF|' },
          choices: [
            { id: 'current', label: 'Current value', preview: 'OLD|', value: 'OLD|' },
            { id: 'imported', label: 'Imported', preview: 'CDEF|', value: 'CDEF|' },
          ],
          onSelectChoice: onSelectChoice,
        })
      )
    })
    expect(container.querySelector('[data-testid="notation-gallery"]')).toBeNull()
    const toggle = Array.from(container.querySelectorAll('button')).find(function(btn) {
      return (btn.textContent || '').indexOf('Use import') >= 0
    })
    act(function() { toggle.click() })
    const gallery = container.querySelector('[data-testid="notation-gallery"]')
    expect(gallery).toBeTruthy()
    expect(gallery.getAttribute('data-layout')).toBe('notation')
    const imported = Array.from(gallery.querySelectorAll('button')).find(function(btn) {
      return (btn.textContent || '').indexOf('Imported') >= 0
    })
    act(function() { imported.click() })
    expect(onSelectChoice).toHaveBeenCalledTimes(1)
    expect(onSelectChoice.mock.calls[0][0].id).toBe('imported')
  })

  test('applies scalar fields immediately without preview', function() {
    const onSelectChoice = jest.fn()
    act(function() {
      root.render(
        React.createElement(ImportFieldSuggestion, {
          formKey: 'rhythm',
          fieldKey: 'rhythm',
          label: 'Rhythm',
          suggestion: { key: 'rhythm', formKey: 'rhythm', value: 'jig' },
          choices: [
            { id: 'current', label: 'Current value', preview: 'reel', value: 'reel' },
            { id: 'imported', label: 'Imported', preview: 'jig', value: 'jig' },
          ],
          onSelectChoice: onSelectChoice,
        })
      )
    })
    const imported = Array.from(container.querySelectorAll('button')).find(function(btn) {
      return (btn.textContent || '').indexOf('Imported') >= 0
    })
    act(function() { imported.click() })
    expect(container.querySelector('[data-testid="suggestion-preview"]')).toBeNull()
    expect(onSelectChoice).toHaveBeenCalledTimes(1)
  })
})
