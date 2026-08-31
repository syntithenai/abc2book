/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import AppErrorBoundary from './AppErrorBoundary'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

function Boom() {
  throw new Error('render boom')
}

describe('AppErrorBoundary', function() {
  let container
  let root
  let consoleError

  beforeEach(function() {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    consoleError = console.error
    console.error = function() {}
  })

  afterEach(function() {
    console.error = consoleError
    act(function() { root.unmount() })
    container.remove()
  })

  test('renders fallback instead of crashing', function() {
    act(function() {
      root.render(React.createElement(AppErrorBoundary, null,
        React.createElement(Boom)
      ))
    })
    expect(container.querySelector('[data-testid="app-error-boundary"]')).toBeTruthy()
    expect(container.textContent).toContain('Something went wrong')
    expect(container.textContent).toContain('render boom')
  })
})
