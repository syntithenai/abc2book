/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import LinksEditorModal from './LinksEditorModal'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

jest.mock('../useResponsiveModalProps', function() {
  return {
    useResponsiveModalProps: function() { return {} },
  }
})

jest.mock('react-bootstrap', function() {
  const React = require('react')
  function passthrough(tag) {
    return function Mock(props) {
      const { children, show, onHide, closeButton, dialogClassName, size, variant, bg, ...rest } = props
      if (tag === 'modal' && show === false) return null
      return React.createElement(tag === 'modal' ? 'div' : tag, rest, children)
    }
  }
  const Modal = passthrough('modal')
  Modal.Header = function Header(props) {
    return React.createElement('div', null, props.children)
  }
  Modal.Title = function Title(props) {
    return React.createElement('h2', null, props.children)
  }
  Modal.Body = function Body(props) {
    return React.createElement('div', null, props.children)
  }
  const Button = function Button(props) {
    return React.createElement('button', {
      type: 'button',
      className: props.className,
      'aria-label': props['aria-label'],
      onClick: props.onClick,
    }, props.children)
  }
  const Badge = function Badge(props) {
    return React.createElement('span', null, props.children)
  }
  return { Modal: Modal, Button: Button, Badge: Badge }
})

jest.mock('./LinksEditor', function() {
  const React = require('react')
  return function LinksEditor(props) {
    return React.createElement('div', { 'data-testid': 'links-editor' },
      React.createElement('div', { 'data-testid': 'editor-tune-id' }, props.tuneId || ''),
      React.createElement('div', { 'data-testid': 'editor-tune-name' }, props.tune && props.tune.name ? props.tune.name : ''),
      React.createElement('button', {
        type: 'button',
        'data-testid': 'add-link',
        onClick: function() {
          const nextLinks = (Array.isArray(props.links) ? props.links : []).concat([{
            title: 'Added',
            link: 'https://example.com/added',
          }])
          if (typeof props.onTuneChange === 'function') {
            props.onTuneChange(Object.assign({}, props.tune, {
              id: 'wrong-current-tune',
              name: 'Wrong Current Tune',
              links: nextLinks,
            }))
          } else {
            props.onChange(nextLinks)
          }
        },
      }, 'Add link'),
      React.createElement('button', {
        type: 'button',
        'data-testid': 'close-editor',
        onClick: props.handleClose,
      }, 'Close')
    )
  }
})

describe('LinksEditorModal', function() {
  let container
  let root
  const tunebook = { icons: { link: 'L' } }

  beforeEach(function() {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(function() {
    act(function() { root.unmount() })
    container.remove()
  })

  test('keeps added links on the tune that opened the editor after the current tune changes', async function() {
    const onChange = jest.fn()
    const onTuneChange = jest.fn()
    const firstTune = { id: 'tune-a', name: 'Maud McQuillan', links: [] }
    const secondTune = { id: 'tune-b', name: 'Other Reel', links: [] }

    await act(async function() {
      root.render(React.createElement(LinksEditorModal, {
        hideTrigger: true,
        show: true,
        tunebook: tunebook,
        tune: firstTune,
        onChange: onChange,
        onTuneChange: onTuneChange,
      }))
    })

    expect(container.querySelector('[data-testid="editor-tune-id"]').textContent).toBe('tune-a')

    await act(async function() {
      root.render(React.createElement(LinksEditorModal, {
        hideTrigger: true,
        show: true,
        tunebook: tunebook,
        tune: secondTune,
        onChange: onChange,
        onTuneChange: onTuneChange,
      }))
    })

    expect(container.querySelector('[data-testid="editor-tune-id"]').textContent).toBe('tune-a')
    expect(container.querySelector('[data-testid="editor-tune-name"]').textContent).toBe('Maud McQuillan')

    await act(async function() {
      container.querySelector('[data-testid="add-link"]').click()
    })

    expect(onTuneChange).toHaveBeenCalledWith(expect.objectContaining({
      id: 'tune-a',
      name: 'Maud McQuillan',
      links: [expect.objectContaining({ link: 'https://example.com/added' })],
    }))

    await act(async function() {
      container.querySelector('[data-testid="close-editor"]').click()
    })

    expect(onChange).toHaveBeenCalledWith(
      [expect.objectContaining({ link: 'https://example.com/added' })],
      'tune-a'
    )
  })
})
