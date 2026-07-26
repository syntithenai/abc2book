/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import SearchResultPickerModal from './SearchResultPickerModal'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

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
      onClick: props.onClick,
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
  return { Modal: Modal, Button: Button, ListGroup: ListGroup }
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

  test('renders select all and select none actions', function() {
    const onSelectAll = jest.fn()
    const onSelectNone = jest.fn()
    act(function() {
      root.render(
        React.createElement(SearchResultPickerModal, {
          show: true,
          multiSelect: true,
          items: [{ title: 'Alice', source: 'a' }],
          onSelect: function() {},
          onHide: function() {},
          onSelectAll: onSelectAll,
          onSelectNone: onSelectNone,
        })
      )
    })
    const bulk = container.querySelector('[data-testid="search-result-picker-bulk-actions"]')
    expect(bulk).toBeTruthy()
    const buttons = Array.from(bulk.querySelectorAll('button'))
    const selectAll = buttons.find(function(btn) { return btn.textContent === 'Select all' })
    const selectNone = buttons.find(function(btn) { return btn.textContent === 'Select none' })
    act(function() { selectAll.click() })
    act(function() { selectNone.click() })
    expect(onSelectAll).toHaveBeenCalledTimes(1)
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
})
