/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import PlayRangeButtonGroup from './PlayRangeButtonGroup'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('PlayRangeButtonGroup', function() {
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

  test('shows start and end seconds in a group with the Play Range button', function() {
    const onClick = jest.fn()
    act(function() {
      root.render(React.createElement(PlayRangeButtonGroup, {
        link: { startAt: '12.5', endAt: '200' },
        onClick: onClick,
      }))
    })
    const group = container.querySelector('[aria-label="Play range"]')
    expect(group).toBeTruthy()
    expect(group.textContent).toContain('12.5')
    expect(group.textContent).toContain('200')
    expect(group.textContent).toContain('Play Range')
    expect(group.textContent).not.toMatch(/\d+:\d+/)
  })

  test('uses start/end placeholders when bounds are unset', function() {
    act(function() {
      root.render(React.createElement(PlayRangeButtonGroup, {
        link: { startAt: '', endAt: '' },
        onClick: function() {},
      }))
    })
    const group = container.querySelector('[aria-label="Play range"]')
    expect(group.textContent).toContain('start')
    expect(group.textContent).toContain('end')
    expect(group.textContent).toContain('Play Range')
  })

  test('invokes onClick from the Play Range button', function() {
    const onClick = jest.fn()
    act(function() {
      root.render(React.createElement(PlayRangeButtonGroup, {
        link: { startAt: '8', endAt: '' },
        onClick: onClick,
      }))
    })
    const button = container.querySelector('[aria-label="Play Range"]')
    act(function() { button.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
