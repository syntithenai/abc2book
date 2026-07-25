/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import TuneListFilterChips from './TuneListFilterChips'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

jest.mock('../platformUtils', function() {
  return {
    isMobilePlatform: jest.fn(function() { return false }),
  }
})

const { isMobilePlatform } = require('../platformUtils')

describe('TuneListFilterChips', function() {
  let container
  let root

  beforeEach(function() {
    isMobilePlatform.mockReturnValue(false)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(function() {
    act(function() { root.unmount() })
    container.remove()
  })

  function renderChips(props) {
    act(function() {
      root.render(React.createElement(TuneListFilterChips, props))
    })
  }

  test('shows books and tags that are not part of the active search filter', function() {
    renderChips({
      books: ['Folk', 'Session'],
      tags: ['jig', 'reel'],
      currentTuneBook: 'Folk',
      tagFilter: ['jig'],
      onBookClick: jest.fn(),
      onTagClick: jest.fn(),
    })

    expect(container.querySelector('button')).toBeTruthy()
    expect(container.textContent).toContain('Session')
    expect(container.textContent).not.toContain('Folk')
    expect(container.textContent).toContain('reel')
    expect(container.textContent).not.toContain('jig')
  })

  test('triggers search filter handlers on desktop', function() {
    const onBookClick = jest.fn()
    const onTagClick = jest.fn()

    renderChips({
      books: ['Session'],
      tags: ['reel'],
      currentTuneBook: '',
      tagFilter: [],
      onBookClick: onBookClick,
      onTagClick: onTagClick,
    })

    const buttons = container.querySelectorAll('button')
    act(function() {
      buttons[0].click()
      buttons[1].click()
    })

    expect(onBookClick).toHaveBeenCalledWith('Session')
    expect(onTagClick).toHaveBeenCalledWith('reel')
  })

  test('renders non-clickable chips on mobile platforms', function() {
    isMobilePlatform.mockReturnValue(true)

    const onBookClick = jest.fn()
    const onTagClick = jest.fn()

    renderChips({
      books: ['Session'],
      tags: ['reel'],
      currentTuneBook: '',
      tagFilter: [],
      onBookClick: onBookClick,
      onTagClick: onTagClick,
    })

    const buttons = container.querySelectorAll('button')
    expect(buttons[0].disabled).toBe(true)
    expect(buttons[1].disabled).toBe(true)
    expect(buttons[0].getAttribute('title')).toBe('Filtering from the list is available on desktop')

    act(function() {
      buttons[0].click()
      buttons[1].click()
    })

    expect(onBookClick).not.toHaveBeenCalled()
    expect(onTagClick).not.toHaveBeenCalled()
  })
})
