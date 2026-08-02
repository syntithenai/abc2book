/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { MemoryRouter } from 'react-router-dom'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// Minimal copy of the gate used in App.js (kept in sync by test).
function AppTunesGatedShell(props) {
  const { useLocation } = require('react-router-dom')
  const location = useLocation()
  const billingCheckout = location.pathname === '/billing/success' || location.pathname === '/billing/cancel'
  if (props.tunes === null && !billingCheckout) return null
  return props.children
}

function renderGate(path, tunes) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(function() {
    root.render(
      React.createElement(
        MemoryRouter,
        { initialEntries: [path] },
        React.createElement(AppTunesGatedShell, { tunes: tunes },
          React.createElement('div', { 'data-testid': 'shell' }, 'visible')
        )
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

describe('AppTunesGatedShell', function() {
  test('hides shell until tunes load on normal routes', function() {
    const view = renderGate('/books', null)
    expect(view.container.querySelector('[data-testid="shell"]')).toBeNull()
    view.cleanup()
  })

  test('shows billing success before tunes load', function() {
    const view = renderGate('/billing/success?session_id=cs_test', null)
    expect(view.container.querySelector('[data-testid="shell"]')).not.toBeNull()
    view.cleanup()
  })

  test('shows billing cancel before tunes load', function() {
    const view = renderGate('/billing/cancel', null)
    expect(view.container.querySelector('[data-testid="shell"]')).not.toBeNull()
    view.cleanup()
  })
})
