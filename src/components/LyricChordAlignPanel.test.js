/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import LyricChordAlignPanel from './LyricChordAlignPanel'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

jest.mock('react-bootstrap', function() {
  function Modal(props) {
    if (!props.show) return null
    return <div data-testid={props['data-testid'] || 'modal'}>{props.children}</div>
  }
  Modal.Header = function Header(props) { return <div>{props.children}</div> }
  Modal.Title = function Title(props) { return <div>{props.children}</div> }
  Modal.Body = function Body(props) { return <div>{props.children}</div> }
  Modal.Footer = function Footer(props) { return <div>{props.children}</div> }
  const Form = {
    Group: function Group(props) { return <div>{props.children}</div> },
    Label: function Label(props) { return <label>{props.children}</label> },
    Control: require('react').forwardRef(function Control(props, ref) {
      const Tag = props.as === 'textarea' ? 'textarea' : 'input'
      return (
        <Tag
          ref={ref}
          data-testid={props['data-testid']}
          value={props.value || ''}
          placeholder={props.placeholder}
          onChange={props.onChange}
          onKeyDown={props.onKeyDown}
        />
      )
    }),
  }
  function Button(props) {
    return (
      <button
        type="button"
        data-testid={props['data-testid']}
        disabled={props.disabled}
        onClick={props.onClick}
      >
        {props.children}
      </button>
    )
  }
  return { Modal: Modal, Form: Form, Button: Button }
})

describe('LyricChordAlignPanel', function() {
  test('shows lyrics and add-chord buttons when there are no chords', function() {
    const container = document.createElement('div')
    const root = createRoot(container)
    act(function() {
      root.render(
        <LyricChordAlignPanel lyricsText={'Amazing grace how sweet'} />
      )
    })
    expect(container.querySelector('[data-testid="lyric-chord-align-empty"]')).toBeNull()
    expect(container.querySelector('[data-testid="lyric-chord-align-panel"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="lyric-chord-align-line"]')).toBeTruthy()
    expect(container.textContent.replace(/[\s+]/g, '')).toContain('Amazinggracehowsweet')
    const addButtons = container.querySelectorAll('[data-testid="lyric-chord-add"]')
    expect(addButtons.length).toBe(8)
    expect(container.querySelectorAll('[data-testid="lyric-chord-align-trailing-pad"]').length).toBe(4)
    act(function() { root.unmount() })
  })

  test('add-chord button opens the edit dialog', function() {
    const container = document.createElement('div')
    const root = createRoot(container)
    const onChange = jest.fn()
    act(function() {
      root.render(
        <LyricChordAlignPanel lyricsText={'Amazing grace'} onChange={onChange} />
      )
    })
    const addButtons = container.querySelectorAll('[data-testid="lyric-chord-add"]')
    act(function() {
      addButtons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.querySelector('[data-testid="lyric-chord-edit-dialog"]')).toBeTruthy()
    expect(container.textContent).toContain('Add chord')
    act(function() { root.unmount() })
  })

  test('hides the song title line and beat-marker slashes', function() {
    const container = document.createElement('div')
    const root = createRoot(container)
    act(function() {
      root.render(
        <LyricChordAlignPanel
          title="My Song Title"
          lyricsText={'My Song Title\n\nhello /there'}
        />
      )
    })
    const compact = container.textContent.replace(/[\s+]/g, '')
    expect(compact).not.toContain('MySongTitle')
    expect(container.textContent).not.toContain('/')
    expect(compact).toContain('hellothere')
    expect(container.querySelectorAll('[data-testid="lyric-chord-add"]').length).toBe(6)
    act(function() { root.unmount() })
  })

  test('can add, edit, and delete lyric lines', function() {
    const container = document.createElement('div')
    const root = createRoot(container)
    const onChange = jest.fn()
    act(function() {
      root.render(
        <LyricChordAlignPanel lyricsText={'Amazing grace'} onChange={onChange} />
      )
    })
    expect(container.querySelectorAll('[data-testid="lyric-chord-align-line"]').length).toBe(1)
    act(function() {
      container.querySelector('[data-testid="lyric-chord-align-add-line"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.querySelector('[data-testid="lyric-chord-text-dialog"]')).toBeTruthy()
    expect(container.textContent).toContain('New lyric line')

    act(function() {
      container.querySelector('[data-testid="lyric-chord-align-edit-line"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.textContent).toContain('Edit lyric line')

    act(function() {
      container.querySelector('[data-testid="lyric-chord-align-add-section-end"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.textContent).toContain('New section')

    act(function() {
      container.querySelector('[data-testid="lyric-chord-align-delete-line"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onChange).toHaveBeenCalled()
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][0]).toBe('')
    act(function() { root.unmount() })
  })

  test('clicking a trailing pad opens the add-chord dialog', function() {
    const container = document.createElement('div')
    const root = createRoot(container)
    act(function() {
      root.render(
        <LyricChordAlignPanel lyricsText={'Amazing'} />
      )
    })
    const pads = container.querySelectorAll('[data-testid="lyric-chord-align-trailing-pad"]')
    expect(pads.length).toBe(4)
    const addOnPad = pads[0].querySelector('[data-testid="lyric-chord-add"]')
    act(function() {
      addOnPad.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.querySelector('[data-testid="lyric-chord-edit-dialog"]')).toBeTruthy()
    act(function() { root.unmount() })
  })

  test('transpose preview shows sounding chord names without rewriting lyrics', function() {
    const container = document.createElement('div')
    const root = createRoot(container)
    const onChange = jest.fn()
    act(function() {
      root.render(
        <LyricChordAlignPanel
          lyricsText={'[C]Amazing'}
          onChange={onChange}
          chordTranspose={2}
          sourceKey="C"
        />
      )
    })
    expect(container.querySelector('[data-testid="lyric-chord-align-chord-label"]').textContent).toBe('D')
    expect(onChange).not.toHaveBeenCalled()
    act(function() { root.unmount() })
  })

  test('saving a chord while transpose preview is on stores concert-pitch names', function() {
    const container = document.createElement('div')
    const root = createRoot(container)
    const onChange = jest.fn()
    act(function() {
      root.render(
        <LyricChordAlignPanel
          lyricsText={'Amazing'}
          onChange={onChange}
          chordTranspose={2}
          sourceKey="C"
        />
      )
    })
    const addButtons = container.querySelectorAll('[data-testid="lyric-chord-add"]')
    act(function() {
      addButtons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const input = container.querySelector('[data-testid="lyric-chord-symbol-input"]')
    act(function() {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      ).set
      nativeInputValueSetter.call(input, 'D')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(function() {
      container.querySelector('[data-testid="lyric-chord-dialog-save"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onChange).toHaveBeenCalled()
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][0]).toBe('[C]Amazing')
    act(function() { root.unmount() })
  })

  test('keeps window scroll position after a focused align change', function() {
    const raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(function(cb) {
      cb()
      return 1
    })
    const originalScrollTo = window.scrollTo
    const scrollTo = jest.fn()
    window.scrollTo = scrollTo
    Object.defineProperty(window, 'scrollX', { configurable: true, writable: true, value: 0 })
    Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 640 })

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const onChange = jest.fn()
    act(function() {
      root.render(
        <LyricChordAlignPanel lyricsText={'Amazing grace'} onChange={onChange} />
      )
    })
    const deleteBtn = container.querySelector('[data-testid="lyric-chord-align-delete-line"]')
    act(function() {
      deleteBtn.focus()
      deleteBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onChange).toHaveBeenCalled()
    expect(scrollTo).toHaveBeenCalledWith(0, 640)

    act(function() { root.unmount() })
    document.body.removeChild(container)
    window.scrollTo = originalScrollTo
    raf.mockRestore()
  })
})
