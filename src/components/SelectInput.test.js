/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import SelectInput from './SelectInput'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('SelectInput', function() {
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
      root.render(React.createElement(SelectInput, {
        value: '',
        options: ['Alpha', 'Beta'],
        onChange: jest.fn(),
        'data-testid': 'select-input',
      }))
    })

    const input = container.querySelector('[data-testid="select-input"]')
    const listId = input && input.getAttribute('list')
    expect(listId).toBeTruthy()
    expect(container.querySelector('datalist#' + listId)).toBeTruthy()
    expect(container.querySelector('[data-testid="select-input-options-dropdown"]')).toBeFalsy()
  })

  test('shows waiting icon while loading', function() {
    act(function() {
      root.render(React.createElement(SelectInput, {
        value: 'Bach',
        options: [],
        loading: true,
        onChange: jest.fn(),
        'data-testid': 'select-input',
      }))
    })

    expect(container.querySelector('[data-testid="select-input-loading"]')).toBeTruthy()
  })
})
