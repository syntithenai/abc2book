/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import AccountModal from './AccountModal'
import {
  clearPlayalongTopScores,
  recordPlayalongTopScore,
} from '../playalongTopScores'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('AccountModal playalong top scores', function() {
  let container
  let root

  beforeEach(function() {
    clearPlayalongTopScores()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(function() {
    act(function() { root.unmount() })
    container.remove()
    clearPlayalongTopScores()
  })

  test('shows empty state when there are no scores', function() {
    act(function() {
      root.render(React.createElement(AccountModal, {
        show: true,
        onHide: function() {},
        user: { name: 'Pat', email: 'pat@example.com' },
      }))
    })
    const block = document.body.querySelector('[data-testid="account-playalong-top-scores"]')
    expect(block).toBeTruthy()
    expect(block.textContent).toContain('No scored play-along takes yet')
  })

  test('shows average and ranked list when scores exist', function() {
    recordPlayalongTopScore({ recordingId: 'a', pitchPct: 80, title: 'Tune A' })
    recordPlayalongTopScore({ recordingId: 'b', pitchPct: 90, title: 'Tune B' })
    act(function() {
      root.render(React.createElement(AccountModal, {
        show: true,
        onHide: function() {},
        user: { name: 'Pat' },
      }))
    })
    const block = document.body.querySelector('[data-testid="account-playalong-top-scores"]')
    expect(block.textContent).toContain('85%')
    expect(block.textContent).toContain('average')
    expect(block.textContent).toContain('90%')
    expect(block.textContent).toContain('Tune B')
    expect(block.textContent).toContain('80%')
    expect(block.textContent).toContain('Tune A')
  })

  test('shows average from pitchPct on tune playalongTakes', function() {
    act(function() {
      root.render(React.createElement(AccountModal, {
        show: true,
        onHide: function() {},
        user: { name: 'Pat' },
        tunes: {
          t1: {
            name: 'Tune A',
            playalongTakes: [{ recordingId: 'a', pitchPct: 80 }],
          },
          t2: {
            name: 'Tune B',
            playalongTakes: [{ recordingId: 'b', pitchPct: 90 }],
          },
        },
      }))
    })
    const block = document.body.querySelector('[data-testid="account-playalong-top-scores"]')
    expect(block.textContent).toContain('85%')
    expect(block.textContent).toContain('Tune B')
    expect(block.textContent).toContain('Tune A')
  })
})
