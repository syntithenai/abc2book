/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import SuggestionPreviewDialog, {
  buildAbcFromChoice,
  lyricsTextFromChoice,
} from './SuggestionPreviewDialog'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

jest.mock('abcjs', function() {
  return { renderAbc: jest.fn() }
})

jest.mock('react-bootstrap', function() {
  const React = require('react')
  function Modal(props) {
    if (!props.show) return null
    return React.createElement('div', { 'data-testid': 'preview-modal' }, props.children)
  }
  Modal.Header = function Header(props) {
    return React.createElement('div', null, props.children)
  }
  Modal.Title = function Title(props) {
    return React.createElement('h2', null, props.children)
  }
  Modal.Body = function Body(props) {
    return React.createElement('div', null, props.children)
  }
  Modal.Footer = function Footer(props) {
    return React.createElement('div', null, props.children)
  }
  function Button(props) {
    return React.createElement('button', {
      type: 'button',
      onClick: props.onClick,
    }, props.children)
  }
  const Form = {
    Control: React.forwardRef(function Control(props, ref) {
      return React.createElement('textarea', {
        ref: ref,
        className: props.className,
        'aria-label': props['aria-label'],
        value: props.value,
        rows: props.rows,
        style: props.style,
        onChange: props.onChange,
        // jsdom Event('input') does not always hit React's onChange path; bridge for tests.
        onInput: function(event) {
          if (typeof props.onChange === 'function') {
            props.onChange({
              target: event.target,
              currentTarget: event.target,
            })
          }
        },
      })
    }),
  }
  return { Modal: Modal, Button: Button, Form: Form }
})

describe('SuggestionPreviewDialog helpers', function() {
  test('lyricsTextFromChoice reads string and lines', function() {
    expect(lyricsTextFromChoice({ value: 'hello' })).toBe('hello')
    expect(lyricsTextFromChoice({ value: { lines: ['a', 'b'] } })).toBe('a\nb')
    expect(lyricsTextFromChoice({ preview: 'fallback' })).toBe('fallback')
  })

  test('buildAbcFromChoice wraps note previews', function() {
    const abc = buildAbcFromChoice({
      preview: 'CDEF|',
      value: null,
    }, { meter: '4/4', noteLength: '1/8', key: 'G' })
    expect(abc).toContain('M:4/4')
    expect(abc).toContain('K:G')
    expect(abc).toContain('CDEF|')
  })
})

describe('SuggestionPreviewDialog lyrics editing', function() {
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

  test('renders editable textarea and confirms draft text', function() {
    const onConfirm = jest.fn()
    act(function() {
      root.render(
        React.createElement(SuggestionPreviewDialog, {
          show: true,
          kind: 'lyrics',
          choice: { id: 'imported', label: 'Imported', value: 'line one\nline two', source: 'import' },
          onCancel: jest.fn(),
          onConfirm: onConfirm,
        })
      )
    })

    const textarea = container.querySelector('textarea.suggestion-preview-lyrics')
    expect(textarea).toBeTruthy()
    expect(textarea.value).toBe('line one\nline two')
    expect(textarea.getAttribute('aria-label')).toBe('Edit lyrics')

    act(function() {
      const tracker = textarea._valueTracker
      if (tracker) tracker.setValue('line one\nline two')
      textarea.value = 'edited verse'
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(textarea.value).toBe('edited verse')

    const confirm = Array.from(container.querySelectorAll('button')).find(function(btn) {
      return btn.textContent === 'Use this value'
    })
    act(function() { confirm.click() })
    expect(onConfirm).toHaveBeenCalledWith('edited verse')
  })

  test('confirm without edits keeps original lyrics', function() {
    const onConfirm = jest.fn()
    act(function() {
      root.render(
        React.createElement(SuggestionPreviewDialog, {
          show: true,
          kind: 'lyrics',
          choice: { value: 'original' },
          onCancel: jest.fn(),
          onConfirm: onConfirm,
        })
      )
    })
    const confirm = Array.from(container.querySelectorAll('button')).find(function(btn) {
      return btn.textContent === 'Use this value'
    })
    act(function() { confirm.click() })
    expect(onConfirm).toHaveBeenCalledWith('original')
  })
})
