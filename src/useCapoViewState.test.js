/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { useCapoViewState, resetCapoViewSessionForTests } from './useCapoViewState'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

function CapoHarness(props) {
  const state = useCapoViewState(props.tuneId, props.storedCapo)
  return (
    <div>
      <span data-testid="enabled">{state.capoEnabled ? 'on' : 'off'}</span>
      <span data-testid="offset">{String(state.capoOffset)}</span>
      <span data-testid="effective">{String(state.effectiveCapo)}</span>
      <button type="button" data-testid="toggle" onClick={state.toggleCapo}>toggle</button>
    </div>
  )
}

describe('useCapoViewState session', function() {
  let container
  let root

  beforeEach(function() {
    resetCapoViewSessionForTests()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(function() {
    act(function() { root.unmount() })
    container.remove()
    resetCapoViewSessionForTests()
  })

  test('defaults to on when the tune stores a capo', function() {
    act(function() {
      root.render(React.createElement(CapoHarness, { tuneId: 'a', storedCapo: 5 }))
    })
    expect(container.querySelector('[data-testid="enabled"]').textContent).toBe('on')
    expect(container.querySelector('[data-testid="offset"]').textContent).toBe('5')
    expect(container.querySelector('[data-testid="effective"]').textContent).toBe('5')
  })

  test('keeps capo off after navigating away and back', function() {
    act(function() {
      root.render(React.createElement(CapoHarness, { tuneId: 'howdy', storedCapo: 5 }))
    })
    act(function() {
      container.querySelector('[data-testid="toggle"]').click()
    })
    expect(container.querySelector('[data-testid="enabled"]').textContent).toBe('off')
    expect(container.querySelector('[data-testid="effective"]').textContent).toBe('0')

    act(function() {
      root.render(React.createElement(CapoHarness, { tuneId: 'other', storedCapo: 2 }))
    })
    expect(container.querySelector('[data-testid="enabled"]').textContent).toBe('on')
    expect(container.querySelector('[data-testid="offset"]').textContent).toBe('2')

    act(function() {
      root.render(React.createElement(CapoHarness, { tuneId: 'howdy', storedCapo: 5 }))
    })
    expect(container.querySelector('[data-testid="enabled"]').textContent).toBe('off')
    expect(container.querySelector('[data-testid="offset"]').textContent).toBe('5')
    expect(container.querySelector('[data-testid="effective"]').textContent).toBe('0')
  })
})
