/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { MemoryRouter } from 'react-router-dom'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

jest.mock('../useMediaResolverHealth', function() {
  return {
    __esModule: true,
    default: function() {
      return {
        refreshMediaResolverHealth: jest.fn(function() { return Promise.resolve() }),
      }
    },
  }
})

jest.mock('../creditClient', function() {
  return {
    fetchBillingBalance: jest.fn(function() {
      return Promise.resolve({ balanceCents: 500, creditUnlimited: false })
    }),
    formatCreditCents: function(cents) {
      return '$' + (Number(cents) / 100).toFixed(2)
    },
  }
})

import BillingCheckoutPage from './BillingCheckoutPage'

function renderPage(path, props) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(function() {
    root.render(
      React.createElement(
        MemoryRouter,
        { initialEntries: [path] },
        React.createElement(BillingCheckoutPage, props)
      )
    )
  })
  return {
    container: container,
    cleanup: function() {
      act(function() { root.unmount() })
      container.remove()
    },
  }
}

describe('BillingCheckoutPage', function() {
  test('renders payment received confirmation with session id', function() {
    const view = renderPage('/billing/success?session_id=cs_test_abc', {
      outcome: 'success',
      token: null,
      login: jest.fn(),
    })
    expect(view.container.textContent).toMatch(/Payment received/)
    expect(view.container.textContent).toMatch(/cs_test_abc/)
    expect(view.container.textContent).toMatch(/Sign in with the same Google account/)
    view.cleanup()
  })

  test('renders checkout cancelled message', function() {
    const view = renderPage('/billing/cancel', {
      outcome: 'cancel',
      token: null,
      login: jest.fn(),
    })
    expect(view.container.textContent).toMatch(/Checkout cancelled/)
    expect(view.container.textContent).toMatch(/No charge was made/)
    view.cleanup()
  })
})
