/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import PlayWithQueueDropdown from './PlayWithQueueDropdown'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('PlayWithQueueDropdown', function() {
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
    document.querySelectorAll('.play-with-queue-dropdown-menu--portal').forEach(function(node) {
      node.remove()
    })
  })

  test('closes the queue menu after choosing an action', function() {
    const onAddToQueue = jest.fn(function(event) {
      event.stopPropagation()
    })

    act(function() {
      root.render(React.createElement(PlayWithQueueDropdown, {
        variant: 'toolbar',
        playIcon: '▶',
        playLabel: 'Play All',
        onPlay: jest.fn(),
        onAddToQueue: onAddToQueue,
        onPlayNext: jest.fn(),
        addToQueueLabel: 'Add all to queue',
        playNextLabel: 'Play all next',
      }))
    })

    const toggle = container.querySelector('.play-with-queue-dropdown-toggle')
    expect(toggle).toBeTruthy()

    act(function() {
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    let menu = document.querySelector('.play-with-queue-dropdown-menu--portal')
    expect(menu).toBeTruthy()

    const item = Array.from(menu.querySelectorAll('.dropdown-item')).find(function(node) {
      return node.textContent === 'Add all to queue'
    })
    expect(item).toBeTruthy()

    act(function() {
      item.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onAddToQueue).toHaveBeenCalledTimes(1)
    expect(document.querySelector('.play-with-queue-dropdown-menu--portal')).toBeFalsy()
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
  })
})
