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
    return (
      <div data-testid={props['data-testid'] || 'modal'}>
        {typeof props.onHide === 'function' ? (
          <button type="button" data-testid="modal-hide" onClick={props.onHide} />
        ) : null}
        {props.children}
      </div>
    )
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
          onFocus={props.onFocus}
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
        className={props.className}
        data-testid={props['data-testid']}
        disabled={props.disabled}
        title={props.title}
        aria-label={props['aria-label']}
        onClick={props.onClick}
        onMouseDown={props.onMouseDown}
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
    expect(addButtons.length).toBe(10)
    expect(container.querySelectorAll('[data-testid="lyric-chord-align-leading-pad"]').length).toBe(2)
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
    const dialog = container.querySelector('[data-testid="lyric-chord-edit-dialog"]')
    expect(dialog).toBeTruthy()
    expect(dialog.textContent).toContain('Add chord')
    expect(dialog.querySelector('[data-testid="lyric-chord-dialog-save"]')).toBeNull()
    expect(dialog.textContent).not.toMatch(/\bCancel\b/)
    expect(dialog.textContent).not.toMatch(/\bAdd\b(?! chord)/)
    act(function() { root.unmount() })
  })

  test('clicking a lyric letter opens the line editor at that caret', function() {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(function() {
      root.render(
        <LyricChordAlignPanel lyricsText={'Amazing grace'} />
      )
    })
    const letters = container.querySelectorAll('[data-testid="lyric-chord-align-lyric-char"]')
    const z = Array.prototype.find.call(letters, function(el) {
      return el.getAttribute('data-offset') === '3'
    })
    expect(z).toBeTruthy()
    z.getBoundingClientRect = function() {
      return { left: 10, right: 20, top: 0, bottom: 12, width: 10, height: 12 }
    }
    act(function() {
      z.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 12, clientY: 6 }))
    })
    expect(container.querySelector('[data-testid="lyric-chord-text-dialog"]')).toBeNull()
    expect(container.querySelector('[data-testid="lyric-chord-align-lyric-char"]')).toBeNull()
    const input = container.querySelector('[data-testid="lyric-chord-text-input"]')
    expect(input).toBeTruthy()
    expect(input.closest('[data-testid="lyric-chord-align-line"]')).toBeTruthy()
    expect(document.activeElement).toBe(input)
    expect(input.selectionStart).toBe(3)
    expect(input.selectionEnd).toBe(3)
    act(function() { root.unmount() })
    document.body.removeChild(container)
  })

  test('clicking the right half of a lyric letter places the caret after it', function() {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(function() {
      root.render(
        <LyricChordAlignPanel lyricsText={'Amazing'} />
      )
    })
    const letters = container.querySelectorAll('[data-testid="lyric-chord-align-lyric-char"]')
    const z = Array.prototype.find.call(letters, function(el) {
      return el.getAttribute('data-offset') === '3'
    })
    z.getBoundingClientRect = function() {
      return { left: 10, right: 20, top: 0, bottom: 12, width: 10, height: 12 }
    }
    act(function() {
      z.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 17, clientY: 6 }))
    })
    const input = container.querySelector('[data-testid="lyric-chord-text-input"]')
    expect(document.activeElement).toBe(input)
    expect(input.selectionStart).toBe(4)
    expect(input.selectionEnd).toBe(4)
    act(function() { root.unmount() })
    document.body.removeChild(container)
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
    expect(container.querySelectorAll('[data-testid="lyric-chord-add"]').length).toBe(8)
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
    expect(container.querySelector('[data-testid="lyric-chord-align-edit-line"]')).toBeNull()
    const addLine = container.querySelector('[data-testid="lyric-chord-align-add-line"]')
    expect(addLine.getAttribute('aria-label')).toBe('Add line')
    expect(addLine.textContent).not.toContain('Line')
    expect(container.querySelector('[data-testid="lyric-chord-align-delete-line"]').getAttribute('aria-label')).toBe('Delete line')
    act(function() {
      addLine.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.querySelector('[data-testid="lyric-chord-text-dialog"]')).toBeNull()
    expect(container.querySelector('[data-testid="lyric-chord-text-input"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="lyric-chord-align-line-editor"]')).toBeTruthy()

    const letter = container.querySelector('[data-testid="lyric-chord-align-lyric-char"]')
    act(function() {
      letter.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 0 }))
    })
    const lineInput = container.querySelector('[data-testid="lyric-chord-text-input"]')
    expect(lineInput).toBeTruthy()
    expect(lineInput.value).toBe('Amazing grace')
    expect(container.querySelector('[data-testid="lyric-chord-align-lyric-char"]')).toBeNull()
    expect(container.querySelector('[data-testid="lyric-chord-text-dialog"]')).toBeNull()
    expect(container.querySelector('[data-testid="lyric-chord-text-save"]')).toBeNull()
    expect(container.querySelector('[data-testid="lyric-chord-text-cancel"]')).toBeNull()
    expect(container.querySelector('[data-testid="lyric-chord-align-add-line-end"]')).toBeNull()

    act(function() {
      container.querySelector('[data-testid="lyric-chord-align-add-section-end"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.querySelector('[data-testid="lyric-chord-text-dialog"]')).toBeTruthy()
    expect(container.textContent).toContain('New section')
    expect(container.querySelector('[data-testid="lyric-chord-section-input"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="lyric-chord-text-save"]').disabled).toBe(true)

    act(function() {
      container.querySelector('[data-testid="lyric-chord-align-delete-line"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onChange).toHaveBeenCalled()
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][0]).toBe('')
    act(function() { root.unmount() })
  })

  test('clicking a section title edits it inline', function() {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(function() {
      root.render(
        <LyricChordAlignPanel lyricsText={'[Verse]\nAmazing grace'} />
      )
    })
    expect(container.querySelector('[data-testid="lyric-chord-align-edit-section"]')).toBeNull()
    const headerRow = container.querySelector('[data-testid="lyric-chord-align-header"]')
    const headerAddLine = headerRow.querySelector('[data-testid="lyric-chord-align-add-line"]')
    expect(headerAddLine).toBeTruthy()
    expect(headerAddLine.getAttribute('aria-label')).toBe('Add line')
    const header = container.querySelector('[data-testid="lyric-chord-align-header-label"]')
    expect(header).toBeTruthy()
    expect(header.textContent).toContain('Verse')
    act(function() {
      header.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 0 }))
    })
    expect(container.querySelector('[data-testid="lyric-chord-text-dialog"]')).toBeNull()
    const input = container.querySelector('[data-testid="lyric-chord-section-input"]')
    expect(input).toBeTruthy()
    expect(input.value).toBe('Verse')
    expect(document.activeElement).toBe(input)
    expect(container.querySelector('[data-testid="lyric-chord-text-save"]')).toBeNull()
    expect(container.querySelector('[data-testid="lyric-chord-text-cancel"]')).toBeNull()
    act(function() {
      headerAddLine.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.querySelector('[data-testid="lyric-chord-align-line-editor"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="lyric-chord-text-input"]')).toBeTruthy()
    act(function() { root.unmount() })
    document.body.removeChild(container)
  })

  test('toolbar add section asks for a name in a dialog', function() {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const onChange = jest.fn()
    const originalScrollTo = window.scrollTo
    window.scrollTo = jest.fn()
    act(function() {
      root.render(
        <LyricChordAlignPanel lyricsText={'Amazing grace'} onChange={onChange} />
      )
    })
    expect(container.querySelector('[data-testid="lyric-chord-align-add-line-end"]')).toBeNull()
    act(function() {
      container.querySelector('[data-testid="lyric-chord-align-add-section-end"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const dialog = container.querySelector('[data-testid="lyric-chord-text-dialog"]')
    expect(dialog).toBeTruthy()
    expect(dialog.textContent).toContain('New section')
    const input = container.querySelector('[data-testid="lyric-chord-section-input"]')
    expect(input).toBeTruthy()
    expect(document.activeElement).toBe(input)
    const save = container.querySelector('[data-testid="lyric-chord-text-save"]')
    expect(save.disabled).toBe(true)
    act(function() {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      ).set
      nativeInputValueSetter.call(input, 'Chorus')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(container.querySelector('[data-testid="lyric-chord-text-save"]').disabled).toBe(false)
    act(function() {
      container.querySelector('[data-testid="lyric-chord-text-save"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.querySelector('[data-testid="lyric-chord-text-dialog"]')).toBeNull()
    expect(onChange).toHaveBeenCalled()
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][0]).toContain('[Chorus]')
    expect(container.querySelector('[data-testid="lyric-chord-align-header-label"]').textContent).toContain('Chorus')
    act(function() { root.unmount() })
    document.body.removeChild(container)
    window.scrollTo = originalScrollTo
  })

  test('inline lyric edits save on blur', function() {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const onChange = jest.fn()
    const raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(function(cb) {
      cb()
      return 1
    })
    const originalScrollTo = window.scrollTo
    window.scrollTo = jest.fn()
    act(function() {
      root.render(
        <LyricChordAlignPanel lyricsText={'Amazing grace'} onChange={onChange} />
      )
    })
    const letter = container.querySelector('[data-testid="lyric-chord-align-lyric-char"]')
    act(function() {
      letter.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 0 }))
    })
    const input = container.querySelector('[data-testid="lyric-chord-text-input"]')
    act(function() {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      ).set
      nativeInputValueSetter.call(input, 'Hello world')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(function() {
      input.blur()
    })
    expect(onChange).toHaveBeenCalled()
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][0]).toBe('Hello world')
    act(function() { root.unmount() })
    document.body.removeChild(container)
    window.scrollTo = originalScrollTo
    raf.mockRestore()
  })

  test('alternates lyric row colors', function() {
    const container = document.createElement('div')
    const root = createRoot(container)
    act(function() {
      root.render(
        <LyricChordAlignPanel lyricsText={'first line\nsecond line'} />
      )
    })
    const rows = container.querySelectorAll('[data-testid="lyric-chord-align-line-row"]')
    expect(rows.length).toBe(2)
    expect(rows[0].className).toContain('lyric-chord-align-line-row--even')
    expect(rows[1].className).toContain('lyric-chord-align-line-row--odd')
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

  test('clicking a leading pad opens the add-chord dialog', function() {
    const container = document.createElement('div')
    const root = createRoot(container)
    act(function() {
      root.render(
        <LyricChordAlignPanel lyricsText={'Amazing'} />
      )
    })
    const pads = container.querySelectorAll('[data-testid="lyric-chord-align-leading-pad"]')
    expect(pads.length).toBe(2)
    const addOnPad = pads[0].querySelector('[data-testid="lyric-chord-add"]')
    act(function() {
      addOnPad.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.querySelector('[data-testid="lyric-chord-edit-dialog"]')).toBeTruthy()
    act(function() { root.unmount() })
  })

  test('closing the add-chord dialog autosaves a leading-pad chord', function() {
    const container = document.createElement('div')
    const root = createRoot(container)
    const onChange = jest.fn()
    act(function() {
      root.render(
        <LyricChordAlignPanel lyricsText={'Amazing'} onChange={onChange} />
      )
    })
    const pads = container.querySelectorAll('[data-testid="lyric-chord-align-leading-pad"]')
    const addOnPad = pads[0].querySelector('[data-testid="lyric-chord-add"]')
    act(function() {
      addOnPad.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const input = container.querySelector('[data-testid="lyric-chord-symbol-input"]')
    act(function() {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      ).set
      nativeInputValueSetter.call(input, 'G')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(function() {
      container.querySelector('[data-testid="modal-hide"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onChange).toHaveBeenCalled()
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][0]).toBe('[G]  Amazing')
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

  test('gives adjacent letter chords a slot wide enough to keep them apart', function() {
    const container = document.createElement('div')
    const root = createRoot(container)
    act(function() {
      root.render(
        <LyricChordAlignPanel lyricsText={'[Cmaj7]A[G7sus4]mazing'} />
      )
    })
    const labels = container.querySelectorAll('[data-testid="lyric-chord-align-chord-label"]')
    expect(labels.length).toBe(2)
    expect(labels[0].textContent).toBe('Cmaj7')
    expect(labels[1].textContent).toBe('G7sus4')
    const firstSlot = labels[0].closest('.lyric-chord-align-letter--chord-gap')
    const secondSlot = labels[1].closest('.lyric-chord-align-letter')
    expect(firstSlot).toBeTruthy()
    expect(firstSlot.style.getPropertyValue('--chord-label-ch')).toBe('6')
    expect(secondSlot.classList.contains('lyric-chord-align-letter--chord-gap')).toBe(false)
    act(function() { root.unmount() })
  })

  test('does not stretch a word under an isolated chord', function() {
    const container = document.createElement('div')
    const root = createRoot(container)
    act(function() {
      root.render(
        <LyricChordAlignPanel lyricsText={'[Cmaj7]Amazing'} />
      )
    })
    const label = container.querySelector('[data-testid="lyric-chord-align-chord-label"]')
    const slot = label.closest('.lyric-chord-align-letter')
    expect(slot.classList.contains('lyric-chord-align-letter--chord-gap')).toBe(false)
    expect(slot.classList.contains('lyric-chord-align-letter--has-chord')).toBe(false)
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
    const firstWordAdd = container.querySelector(
      '.lyric-chord-align-letter:not(.lyric-chord-align-letter--pad) [data-testid="lyric-chord-add"]'
    )
    act(function() {
      firstWordAdd.dispatchEvent(new MouseEvent('click', { bubbles: true }))
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
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
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

  test('hides chords-from-notation until notation chords are offered', function() {
    const container = document.createElement('div')
    const root = createRoot(container)
    act(function() {
      root.render(
        <LyricChordAlignPanel lyricsText={'Amazing grace'} />
      )
    })
    expect(container.querySelector('[data-testid="lyric-chord-align-chords-from-notation"]')).toBeNull()
    act(function() { root.unmount() })
  })

  test('shows chords-from-notation at the top and calls the dropdown action', function() {
    const container = document.createElement('div')
    const root = createRoot(container)
    const onChordsFromNotation = jest.fn()
    act(function() {
      root.render(
        <LyricChordAlignPanel
          lyricsText={'Amazing grace'}
          showChordsFromNotation={true}
          onChordsFromNotation={onChordsFromNotation}
        />
      )
    })
    const button = container.querySelector('[data-testid="lyric-chord-align-chords-from-notation"]')
    expect(button).toBeTruthy()
    expect(button.textContent).toBe('Chords From Notation')
    const panel = container.querySelector('[data-testid="lyric-chord-align-panel"]')
    expect(panel.firstElementChild.classList.contains('lyric-chord-align-from-notation')).toBe(true)
    act(function() {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onChordsFromNotation).toHaveBeenCalledTimes(1)
    act(function() { root.unmount() })
  })
})
