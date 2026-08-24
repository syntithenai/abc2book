/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import PlayalongIncompleteTakeModal from './PlayalongIncompleteTakeModal'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('PlayalongIncompleteTakeModal', function() {
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

  test('Keep and Discard call the matching handlers', function() {
    const onKeep = jest.fn()
    const onDiscard = jest.fn()
    act(function() {
      root.render(React.createElement(PlayalongIncompleteTakeModal, {
        show: true,
        onKeep: onKeep,
        onDiscard: onDiscard,
      }))
    })

    expect(document.querySelector('[data-testid="playalong-incomplete-take-modal"]')).toBeTruthy()
    act(function() {
      document.querySelector('[data-testid="playalong-incomplete-keep"]').click()
    })
    expect(onKeep).toHaveBeenCalledTimes(1)
    act(function() {
      document.querySelector('[data-testid="playalong-incomplete-discard"]').click()
    })
    expect(onDiscard).toHaveBeenCalledTimes(1)
  })
})
