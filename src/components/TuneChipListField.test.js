/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

function setInputValue(input, value) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  ).set
  nativeInputValueSetter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
import TuneChipListField from './TuneChipListField'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

jest.mock('../useMusicBrainzArtistOptions', function() {
  return function useMusicBrainzArtistOptions() { return { options: ['Gamma'], loading: false } }
})

describe('TuneChipListField', function() {
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

  test('uses editable datalist suggestions without a dropdown button', function() {
    act(function() {
      root.render(React.createElement(TuneChipListField, {
        value: [],
        onChange: jest.fn(),
        controlId: 'artists',
        searchResults: ['Alpha', 'Beta'],
      }))
    })

    const input = container.querySelector('#artists')
    const listId = input && input.getAttribute('list')
    expect(listId).toBe('artists-suggestions')
    expect(container.querySelector('datalist#artists-suggestions')).toBeTruthy()
    expect(container.querySelector('[data-testid="chip-list-musicbrainz-dropdown"]')).toBeFalsy()
  })

  test('excludes already-added items from datalist suggestions', function() {
    act(function() {
      root.render(React.createElement(TuneChipListField, {
        value: ['Alpha'],
        onChange: jest.fn(),
        controlId: 'artists',
        searchResults: ['Alpha', 'Beta'],
      }))
    })

    const options = Array.from(
      container.querySelectorAll('datalist#artists-suggestions option')
    ).map(function(option) { return option.value })
    expect(options).toContain('Beta')
    expect(options).not.toContain('Alpha')
  })

  test('adds cached search candidate immediately as a chip', function() {
    const onChange = jest.fn()
    act(function() {
      root.render(React.createElement(TuneChipListField, {
        value: [],
        onChange: onChange,
        controlId: 'artists',
        searchResultCandidates: [{ artist: 'Lang Lang' }],
      }))
    })

    const caret = container.querySelector('[data-testid="chip-list-search-results-caret"]')
    expect(caret).toBeTruthy()
    act(function() { caret.click() })
    const item = Array.from(document.querySelectorAll('.dropdown-item')).find(function(node) {
      return String(node.textContent || '').indexOf('Lang Lang') >= 0
    })
    expect(item).toBeTruthy()
    act(function() { item.click() })
    expect(onChange).toHaveBeenCalledWith(['Lang Lang'])
  })

  test('does not create an item on blur', function() {
    const onChange = jest.fn()
    act(function() {
      root.render(React.createElement(TuneChipListField, {
        value: [],
        onChange: onChange,
        controlId: 'artists',
      }))
    })

    const input = container.querySelector('#artists')
    act(function() {
      input.value = 'Blur Artist'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(function() {
      input.dispatchEvent(new Event('blur', { bubbles: true }))
    })

    expect(onChange).not.toHaveBeenCalled()
  })

  test('clicking a chip calls onSelectItem', function() {
    const onSelectItem = jest.fn()
    act(function() {
      root.render(React.createElement(TuneChipListField, {
        value: ['The Dubliners'],
        onChange: jest.fn(),
        controlId: 'artists',
        onSelectItem: onSelectItem,
      }))
    })

    const chip = container.querySelector('[data-testid="chip-list-select-item"]')
    expect(chip).toBeTruthy()
    act(function() { chip.click() })
    expect(onSelectItem).toHaveBeenCalledWith('The Dubliners', 0)
  })

  test('shows waiting icon while loading suggestions', function() {
    act(function() {
      root.render(React.createElement(TuneChipListField, {
        value: [],
        onChange: jest.fn(),
        controlId: 'artists',
        loading: true,
      }))
    })

    expect(container.querySelector('[data-testid="chip-list-loading"]')).toBeTruthy()
  })

  test('prepends new chips and collapses to two visible by default', function() {
    const onChange = jest.fn()
    act(function() {
      root.render(React.createElement(TuneChipListField, {
        value: ['Alpha', 'Beta', 'Gamma'],
        onChange: onChange,
        controlId: 'artists',
      }))
    })

    expect(container.querySelectorAll('.tune-chip-list-item')).toHaveLength(2)
    expect(container.textContent).toMatch(/\+1 more/)

    const input = container.querySelector('#artists')
    act(function() {
      setInputValue(input, 'Delta')
    })
    const addButton = container.querySelector('.tune-chip-list-add')
    act(function() { addButton.click() })

    expect(onChange).toHaveBeenCalledWith(['Delta', 'Alpha', 'Beta', 'Gamma'])
  })
})
