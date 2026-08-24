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
    expect(document.body.querySelector('[data-testid="account-playalong-details-button"]')).toBeNull()
  })

  test('shows average without listing individual scores', function() {
    recordPlayalongTopScore({ recordingId: 'a', pitchPct: 80, title: 'Tune A', tuneId: 't1' })
    recordPlayalongTopScore({ recordingId: 'b', pitchPct: 90, title: 'Tune B', tuneId: 't2' })
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
    expect(block.textContent).not.toContain('Tune A')
    expect(block.textContent).not.toContain('Tune B')
    expect(block.querySelector('ol')).toBeNull()
    expect(document.body.querySelector('[data-testid="account-playalong-details-button"]')).toBeTruthy()
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
    expect(block.textContent).not.toContain('Tune B')
    expect(block.textContent).not.toContain('Tune A')
  })

  test('Details closes profile and shows per-tune table with min max average', function() {
    let accountShow = true
    function renderModal() {
      root.render(React.createElement(AccountModal, {
        show: accountShow,
        onHide: function() { accountShow = false },
        user: { name: 'Pat' },
        tunes: {
          t1: {
            name: "Cooley's",
            playalongTakes: [
              { recordingId: 'a', pitchPct: 80 },
              { recordingId: 'b', pitchPct: 90 },
            ],
          },
          t2: {
            name: 'Kesh',
            playalongTakes: [
              { recordingId: 'c', pitchPct: 70 },
            ],
          },
        },
      }))
    }
    act(renderModal)
    const detailsBtn = document.body.querySelector('[data-testid="account-playalong-details-button"]')
    expect(detailsBtn).toBeTruthy()
    act(function() {
      detailsBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      renderModal()
    })
    expect(accountShow).toBe(false)
    expect(document.body.textContent).toContain('Play Along Details')
    const summaries = document.body.querySelector('[data-testid="account-playalong-tune-summaries"]')
    expect(summaries).toBeTruthy()
    expect(summaries.tagName).toBe('TABLE')
    const headers = Array.prototype.map.call(
      summaries.querySelectorAll('thead th'),
      function(th) { return th.textContent.trim() }
    )
    expect(headers).toEqual(expect.arrayContaining(['Takes', 'Min', 'Max', 'Average']))
    expect(summaries.textContent).toContain("Cooley's")
    expect(summaries.textContent).toContain('80%')
    expect(summaries.textContent).toContain('90%')
    expect(summaries.textContent).toContain('85%')
    expect(summaries.textContent).toContain('Kesh')
    expect(summaries.textContent).toContain('70%')
    expect(document.body.querySelector('[data-testid="account-playalong-reset-all-button"]')).toBeTruthy()
    expect(document.body.querySelectorAll('[data-testid="account-playalong-reset-tune-button"]').length).toBe(2)
  })

  test('Reset all confirms then clears scores', function() {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true)
    recordPlayalongTopScore({ recordingId: 'a', pitchPct: 80, title: 'Tune A', tuneId: 't1' })
    let accountShow = true
    function renderModal() {
      root.render(React.createElement(AccountModal, {
        show: accountShow,
        onHide: function() { accountShow = false },
        user: { name: 'Pat' },
      }))
    }
    act(renderModal)
    act(function() {
      document.body.querySelector('[data-testid="account-playalong-details-button"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
      renderModal()
    })
    act(function() {
      document.body.querySelector('[data-testid="account-playalong-reset-all-button"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(confirmSpy).toHaveBeenCalled()
    expect(document.body.querySelector('[data-testid="account-playalong-tune-summaries"]')).toBeNull()
    expect(document.body.textContent).toContain('No scored play-along takes yet')
    confirmSpy.mockRestore()
  })

  test('Reset tune confirms then removes only that tune', function() {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true)
    recordPlayalongTopScore({ recordingId: 'a', pitchPct: 80, title: 'Tune A', tuneId: 't1' })
    recordPlayalongTopScore({ recordingId: 'b', pitchPct: 90, title: 'Tune B', tuneId: 't2' })
    let accountShow = true
    function renderModal() {
      root.render(React.createElement(AccountModal, {
        show: accountShow,
        onHide: function() { accountShow = false },
        user: { name: 'Pat' },
      }))
    }
    act(renderModal)
    act(function() {
      document.body.querySelector('[data-testid="account-playalong-details-button"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
      renderModal()
    })
    act(function() {
      document.body.querySelectorAll('[data-testid="account-playalong-reset-tune-button"]')[0]
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(confirmSpy).toHaveBeenCalled()
    const summaries = document.body.querySelector('[data-testid="account-playalong-tune-summaries"]')
    expect(summaries).toBeTruthy()
    expect(summaries.querySelectorAll('tbody tr').length).toBe(1)
    confirmSpy.mockRestore()
  })
})
