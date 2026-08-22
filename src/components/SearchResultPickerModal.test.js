/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act, Simulate } from 'react-dom/test-utils'
import SearchResultPickerModal from './SearchResultPickerModal'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

jest.mock('./AbcSnippetPreview', function() {
  const React = require('react')
  return function MockAbcSnippet(props) {
    return React.createElement('div', { 'data-testid': 'abc-snippet' }, 'staff preview')
  }
})

jest.mock('react-bootstrap', function() {
  const React = require('react')
  function Modal(props) {
    if (!props.show) return null
    return React.createElement('div', { 'data-testid': 'modal' }, props.children)
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
    return React.createElement('div', { 'data-testid': 'footer' }, props.children)
  }
  function Button(props) {
    return React.createElement('button', {
      type: 'button',
      className: props.className,
      onClick: props.onClick,
      'aria-label': props['aria-label'],
      'aria-pressed': props['aria-pressed'],
      disabled: props.disabled,
    }, props.children)
  }
  function ListGroup(props) {
    return React.createElement('div', null, props.children)
  }
  ListGroup.Item = function Item(props) {
    return React.createElement('button', {
      type: 'button',
      onClick: props.onClick,
      'data-active': props.active ? '1' : '0',
    }, props.children)
  }
  function FormCheck(props) {
    return React.createElement('div', { className: props.className }, props.children)
  }
  FormCheck.Input = function CheckInput(props) {
    return React.createElement('input', {
      type: 'checkbox',
      checked: !!props.checked,
      onChange: props.onChange,
      'aria-label': props['aria-label'],
    })
  }
  FormCheck.Label = function CheckLabel(props) {
    return React.createElement('label', null, props.children)
  }
  const Form = { Check: FormCheck }
  return { Modal: Modal, Button: Button, ListGroup: ListGroup, Form: Form }
})

describe('SearchResultPickerModal multiSelect', function() {
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

  test('keeps calling onSelect without requiring close between picks', function() {
    const onSelect = jest.fn()
    const onDone = jest.fn()
    const onHide = jest.fn()
    const items = [
      { title: 'Alice', source: 'a' },
      { title: 'Bob', source: 'b' },
    ]

    act(function() {
      root.render(
        React.createElement(SearchResultPickerModal, {
          show: true,
          multiSelect: true,
          selectedIndexes: [0],
          items: items,
          onSelect: onSelect,
          onDone: onDone,
          onHide: onHide,
        })
      )
    })

    expect(container.textContent).toMatch(/Done/)
    expect(container.textContent).toMatch(/Added/)

    const buttons = Array.from(container.querySelectorAll('button'))
    const bob = buttons.find(function(btn) {
      return (btn.textContent || '').indexOf('Bob') >= 0
    })
    act(function() { bob.click() })
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onHide).not.toHaveBeenCalled()

    const done = buttons.find(function(btn) { return btn.textContent === 'Done' })
    act(function() { done.click() })
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  test('renders select-all toggle and calls bulk handlers', function() {
    const onSelectAll = jest.fn()
    const onSelectNone = jest.fn()
    const items = [{ title: 'Alice', source: 'a' }]
    act(function() {
      root.render(
        React.createElement(SearchResultPickerModal, {
          show: true,
          multiSelect: true,
          selectedIndexes: [],
          items: items,
          onSelect: function() {},
          onHide: function() {},
          onSelectAll: onSelectAll,
          onSelectNone: onSelectNone,
        })
      )
    })
    const bulk = container.querySelector('[data-testid="search-result-picker-bulk-actions"]')
    expect(bulk).toBeTruthy()
    const toggle = bulk.querySelector('button[aria-label="Select all results"]')
    expect(toggle).toBeTruthy()
    act(function() { Simulate.click(toggle) })
    expect(onSelectAll).toHaveBeenCalledTimes(1)
    act(function() {
      root.render(
        React.createElement(SearchResultPickerModal, {
          show: true,
          multiSelect: true,
          selectedIndexes: [0],
          items: items,
          onSelect: function() {},
          onHide: function() {},
          onSelectAll: onSelectAll,
          onSelectNone: onSelectNone,
        })
      )
    })
    const toggleAfterSelect = container.querySelector('[data-testid="search-result-picker-bulk-actions"] button[aria-label="Select all results"]')
    act(function() { Simulate.click(toggleAfterSelect) })
    expect(onSelectNone).toHaveBeenCalledTimes(1)
  })

  test('renders optional header comment', function() {
    act(function() {
      root.render(
        React.createElement(SearchResultPickerModal, {
          show: true,
          multiSelect: true,
          items: [{ title: 'Alice', source: 'a' }],
          comment: 'Composer was empty, so it was set to "Debussy".',
          onSelect: function() {},
          onHide: function() {},
        })
      )
    })
    const note = container.querySelector('[data-testid="search-result-picker-comment"]')
    expect(note).toBeTruthy()
    expect(note.textContent).toContain('Composer was empty')
    expect(note.textContent).toContain('Debussy')
  })

  test('list layout shows original and suggestion text previews', function() {
    act(function() {
      root.render(
        React.createElement(SearchResultPickerModal, {
          show: true,
          layout: 'lyrics',
          items: [
            {
              title: 'Original Value',
              preview: 'Line one\nLine two',
              matchType: 'Original Value',
              __current: true,
            },
            {
              title: 'Suggested lyrics',
              preview: 'New line one\nNew line two',
              source: 'media-analysis',
              matchType: 'media-analysis',
            },
          ],
          onSelect: function() {},
          onHide: function() {},
        })
      )
    })
    expect(container.querySelector('[data-testid="search-result-original-preview"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="search-result-original-preview"]').textContent)
      .toContain('Line one')
    expect(container.querySelector('[data-testid="search-result-suggestion-preview"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="search-result-suggestion-preview"]').textContent)
      .toContain('New line one')
    expect(container.querySelector('[data-testid="search-result-suggestion-compare"]')).toBeTruthy()
    expect(container.textContent).toContain('Compare with current')
  })

  test('notation layout labels local MIDI without ABC preview', function() {
    act(function() {
      root.render(
        React.createElement(SearchResultPickerModal, {
          show: true,
          layout: 'notation',
          items: [{
            title: 'Moonlight Sonata',
            artist: 'Beethoven',
            source: 'midi-resources',
            matchType: 'midi-resources',
            importFormat: 'midi',
            midiBytes: 'YQ==',
            preview: 'MIDI file (wizard import)',
          }, {
            title: 'Moonlight Sonata',
            source: 'musescore.com',
            matchType: 'musescore.com',
            abc: 'X:1\nK:C\nC D E F|',
          }],
          onSelect: function() {},
          onHide: function() {},
        })
      )
    })
    expect(container.textContent).toContain('Local MIDI — import with wizard')
    expect(container.textContent).toMatch(/Local MIDI/)
    expect(container.textContent).toContain('MuseScore')
    expect(container.querySelector('[data-testid="abc-snippet"]')).toBeTruthy()
    const midiCard = Array.from(container.querySelectorAll('button.search-result-notation-card')).find(function(btn) {
      return (btn.textContent || '').indexOf('import with wizard') >= 0
    })
    expect(midiCard).toBeTruthy()
    expect(midiCard.querySelector('[data-testid="abc-snippet"]')).toBeNull()
  })
})
