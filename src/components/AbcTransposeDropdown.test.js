/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import AbcTransposeDropdown from './AbcTransposeDropdown'

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

describe('AbcTransposeDropdown', function() {
  test('offers +/− notation transpose and a transpose preview toggle', function() {
    const container = document.createElement('div')
    const root = createRoot(container)
    const onTransposeAbc = jest.fn()
    const onTransposePreviewChange = jest.fn()
    act(function() {
      root.render(
        <AbcTransposeDropdown
          tunebook={{ icons: { music: 'music' } }}
          onTransposeAbc={onTransposeAbc}
          transposePreview={false}
          onTransposePreviewChange={onTransposePreviewChange}
        />
      )
    })
    expect(container.querySelector('[data-testid="abc-transpose-actions"]').textContent)
      .toContain('Transpose')
    expect(container.querySelector('[data-testid="abc-transpose"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="abc-transpose-down"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="abc-transpose-up"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="abc-transpose-preview"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="abc-transpose-preview-switch"]')).toBeTruthy()
    act(function() {
      container.querySelector('[data-testid="abc-transpose-down"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
      container.querySelector('[data-testid="abc-transpose-up"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
      container.querySelector('[data-testid="abc-transpose-preview"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onTransposeAbc.mock.calls).toEqual([[-1], [1]])
    expect(onTransposePreviewChange).toHaveBeenCalledWith(true)
    act(function() { root.unmount() })
  })
})
