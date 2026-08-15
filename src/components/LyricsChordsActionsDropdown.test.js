/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import LyricsChordsActionsDropdown from './LyricsChordsActionsDropdown'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

jest.mock('react-bootstrap', function() {
  function Dropdown(props) {
    return <div data-testid="dropdown">{props.children}</div>
  }
  Dropdown.Toggle = function Toggle(props) {
    return (
      <button type="button" title={props.title} data-testid={props['data-testid']}>
        {props.children}
      </button>
    )
  }
  Dropdown.Menu = function Menu(props) {
    return <div>{props.children}</div>
  }
  Dropdown.Item = function Item(props) {
    return (
      <button type="button" data-testid={props['data-testid']} onClick={props.onClick}>
        {props.children}
      </button>
    )
  }
  Dropdown.ItemText = function ItemText(props) {
    const Tag = props.as || 'div'
    return (
      <Tag
        type={props.type}
        data-testid={props['data-testid']}
        className={props.className}
        aria-pressed={props['aria-pressed']}
        title={props.title}
        onClick={props.onClick}
        onMouseDown={props.onMouseDown}
      >
        {props.children}
      </Tag>
    )
  }
  function Button(props) {
    return (
      <button
        type={props.type || 'button'}
        data-testid={props['data-testid']}
        aria-label={props['aria-label']}
        title={props.title}
        onClick={props.onClick}
      >
        {props.children}
      </button>
    )
  }
  function ButtonGroup(props) {
    return <div className={props.className}>{props.children}</div>
  }
  function FormCheck(props) {
    return (
      <input
        type="checkbox"
        role="switch"
        id={props.id}
        data-testid={props.id}
        checked={!!props.checked}
        aria-labelledby={props['aria-labelledby']}
        title={props.title}
        onClick={function() {
          if (typeof props.onChange === 'function') {
            props.onChange({ target: { checked: !props.checked } })
          }
        }}
        onChange={props.onChange}
      />
    )
  }
  const Form = { Check: FormCheck }
  return { Dropdown: Dropdown, Button: Button, ButtonGroup: ButtonGroup, Form: Form }
})

describe('LyricsChordsActionsDropdown', function() {
  test('offers remove, from notation, and lyric-text transpose controls', function() {
    const container = document.createElement('div')
    const root = createRoot(container)
    const onRemoveChords = jest.fn()
    const onChordsFromNotation = jest.fn()
    const onTransposeLyrics = jest.fn()
    const onTransposePreviewChange = jest.fn()
    act(function() {
      root.render(
        <LyricsChordsActionsDropdown
          tunebook={{ icons: { eraser: 'eraser' } }}
          onRemoveChords={onRemoveChords}
          onChordsFromNotation={onChordsFromNotation}
          onTransposeLyrics={onTransposeLyrics}
          transposePreview={false}
          onTransposePreviewChange={onTransposePreviewChange}
        />
      )
    })
    expect(container.querySelector('[data-testid="lyrics-chords-remove-chords"]').textContent)
      .toBe('Remove chords')
    expect(container.querySelector('[data-testid="lyrics-chords-from-notation"]').textContent)
      .toBe('Chords from notation')
    expect(container.querySelector('[data-testid="lyrics-chords-transpose"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="lyrics-chords-transpose-down"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="lyrics-chords-transpose-up"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="lyrics-chords-transpose-preview"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="lyrics-chords-transpose-preview-switch"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="lyrics-chords-remove-timing"]')).toBeNull()
    expect(container.querySelector('[data-testid="lyrics-chords-write-to-lyrics"]')).toBeNull()
    expect(container.textContent).not.toContain('Remove timing')
    expect(container.textContent).not.toContain('Write chords to lyrics')
    act(function() {
      container.querySelector('[data-testid="lyrics-chords-remove-chords"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
      container.querySelector('[data-testid="lyrics-chords-from-notation"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
      container.querySelector('[data-testid="lyrics-chords-transpose-down"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
      container.querySelector('[data-testid="lyrics-chords-transpose-up"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
      container.querySelector('[data-testid="lyrics-chords-transpose-preview"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onRemoveChords).toHaveBeenCalledTimes(1)
    expect(onChordsFromNotation).toHaveBeenCalledTimes(1)
    expect(onTransposeLyrics.mock.calls).toEqual([[-1], [1]])
    expect(onTransposePreviewChange).toHaveBeenCalledWith(true)
    act(function() { root.unmount() })
  })
})
