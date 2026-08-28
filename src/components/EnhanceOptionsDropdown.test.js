/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { EnhanceOptionsMenu } from './EnhanceOptionsDropdown'
import { createEmptyEnhanceSelection, setEnhanceGroupSelection } from '../enhanceOptions'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('EnhanceOptionsMenu', function() {
  let container
  let root

  beforeEach(function() {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(function() {
    act(function() { root.unmount() })
    container.remove()
  })

  test('renders grouped tickboxes with none selected and start disabled', function() {
    act(function() {
      root.render(React.createElement(EnhanceOptionsMenu, {
        selection: createEmptyEnhanceSelection(),
        onToggleOption: jest.fn(),
        onSetGroup: jest.fn(),
        onStart: jest.fn(),
      }))
    })
    expect(container.textContent).toContain('Lookup')
    expect(container.textContent).not.toContain('Research')
    expect(container.textContent).toContain('Audio Analysis')
    expect(container.textContent).toContain('Composer')
    expect(container.textContent).toContain('Lyrics')
    expect(container.textContent).toContain('Background info')
    expect(container.textContent).toContain('Discover playable media links')
    expect(container.textContent).toContain('Play range')
    expect(container.textContent).toContain('Tempo')
    expect(container.textContent).toContain('Start Enhancement')
    const checks = container.querySelectorAll('input[type="checkbox"]')
    expect(checks.length).toBe(14)
    checks.forEach(function(check) {
      expect(check.checked).toBe(false)
    })
    expect(container.querySelector('[data-testid="enhance-start"]').disabled).toBe(true)
  })

  test('group All selects that group and enables start', function() {
    const onSetGroup = jest.fn()
    const selection = setEnhanceGroupSelection(createEmptyEnhanceSelection(), 'lookup', true)
    act(function() {
      root.render(React.createElement(EnhanceOptionsMenu, {
        selection: createEmptyEnhanceSelection(),
        onToggleOption: jest.fn(),
        onSetGroup: onSetGroup,
        onStart: jest.fn(),
      }))
    })
    act(function() {
      container.querySelector('[data-testid="enhance-group-lookup-all"]').click()
    })
    expect(onSetGroup).toHaveBeenCalledWith('lookup', true)

    act(function() {
      root.render(React.createElement(EnhanceOptionsMenu, {
        selection: selection,
        onToggleOption: jest.fn(),
        onSetGroup: onSetGroup,
        onStart: jest.fn(),
      }))
    })
    expect(container.querySelector('[data-testid="enhance-start"]').disabled).toBe(false)
    expect(container.querySelector('#enhance-option-composer').checked).toBe(true)
  })

  test('Start Enhancement calls onStart when something is ticked', function() {
    const onStart = jest.fn()
    const selection = createEmptyEnhanceSelection()
    selection.aliases = true
    act(function() {
      root.render(React.createElement(EnhanceOptionsMenu, {
        selection: selection,
        onToggleOption: jest.fn(),
        onSetGroup: jest.fn(),
        onStart: onStart,
      }))
    })
    act(function() {
      container.querySelector('[data-testid="enhance-start"]').click()
    })
    expect(onStart).toHaveBeenCalled()
  })

  test('background, youtube, and audio analysis stay selectable without availability context', function() {
    act(function() {
      root.render(React.createElement(EnhanceOptionsMenu, {
        selection: createEmptyEnhanceSelection(),
        onToggleOption: jest.fn(),
        onSetGroup: jest.fn(),
        onStart: jest.fn(),
      }))
    })
    expect(container.querySelector('#enhance-option-background').disabled).toBe(false)
    expect(container.querySelector('#enhance-option-youtube').disabled).toBe(false)
    expect(container.querySelector('#enhance-option-playRange').disabled).toBe(false)
    expect(container.querySelector('#enhance-option-key').disabled).toBe(false)
    expect(container.querySelector('#enhance-option-tempo').disabled).toBe(false)
    expect(container.querySelector('#enhance-option-notation').disabled).toBe(false)
    expect(container.querySelector('#enhance-option-chords').disabled).toBe(false)
    expect(container.querySelector('#enhance-option-lyrics').disabled).toBe(false)
    expect(container.querySelector('#enhance-option-lookupLyrics').disabled).toBe(false)
  })

  test('availability context disables unavailable options', function() {
    act(function() {
      root.render(React.createElement(EnhanceOptionsMenu, {
        selection: createEmptyEnhanceSelection(),
        onToggleOption: jest.fn(),
        onSetGroup: jest.fn(),
        onStart: jest.fn(),
        availabilityContext: {
          resolverAvailable: true,
          features: { whisper: true },
          canResearchBackground: false,
        },
      }))
    })
    expect(container.querySelector('#enhance-option-playRange').disabled).toBe(false)
    expect(container.querySelector('#enhance-option-lyrics').disabled).toBe(false)
    expect(container.querySelector('#enhance-option-key').disabled).toBe(true)
    expect(container.querySelector('#enhance-option-tempo').disabled).toBe(true)
    expect(container.querySelector('#enhance-option-notation').disabled).toBe(true)
    expect(container.querySelector('#enhance-option-youtube').disabled).toBe(false)
    expect(container.querySelector('#enhance-option-background').disabled).toBe(true)
  })

  test('needsLogin shows warning, login button, and disables options', function() {
    const onLogin = jest.fn()
    act(function() {
      root.render(React.createElement(EnhanceOptionsMenu, {
        selection: createEmptyEnhanceSelection(),
        onToggleOption: jest.fn(),
        onSetGroup: jest.fn(),
        onStart: jest.fn(),
        onLogin: onLogin,
        availabilityContext: {
          resolverAvailable: true,
          features: { practiceAnalysis: true, whisper: true },
          needsLogin: true,
          loginWarning: { message: 'Login to continue', showLoginButton: true },
        },
      }))
    })
    expect(container.querySelector('[data-testid="enhance-access-warning"]').textContent)
      .toContain('Login to continue')
    expect(container.querySelector('#enhance-option-lookupLyrics').disabled).toBe(true)
    expect(container.querySelector('[data-testid="enhance-start"]').disabled).toBe(true)
    act(function() {
      container.querySelector('[data-testid="enhance-login-button"]').click()
    })
    expect(onLogin).toHaveBeenCalled()
  })

  test('group All with availability context only requests available options', function() {
    const onSetGroup = jest.fn()
    act(function() {
      root.render(React.createElement(EnhanceOptionsMenu, {
        selection: createEmptyEnhanceSelection(),
        onToggleOption: jest.fn(),
        onSetGroup: onSetGroup,
        onStart: jest.fn(),
        availabilityContext: {
          resolverAvailable: true,
          features: { whisper: true },
        },
      }))
    })
    act(function() {
      container.querySelector('[data-testid="enhance-group-audio-all"]').click()
    })
    expect(onSetGroup).toHaveBeenCalledWith('audio', true)
  })

  test('shows media source picker when multiple scannable sources exist', function() {
    act(function() {
      root.render(React.createElement(EnhanceOptionsMenu, {
        selection: createEmptyEnhanceSelection(),
        onToggleOption: jest.fn(),
        onSetGroup: jest.fn(),
        onStart: jest.fn(),
        mediaSources: [
          { id: 'link-0', linkIndex: 0, label: 'YouTube clip' },
          { id: 'link-1', linkIndex: 1, label: 'Band recording' },
        ],
        selectedMediaLinkIndex: 0,
        onMediaLinkIndexChange: jest.fn(),
        availabilityContext: {
          resolverAvailable: true,
          features: { practiceAnalysis: true, whisper: true },
          hasScannableLinkedMedia: true,
        },
      }))
    })
    expect(container.querySelector('[data-testid="enhance-media-source"]')).toBeTruthy()
    expect(container.textContent).toContain('YouTube clip')
    expect(container.textContent).toContain('Band recording')
  })

  test('disables audio analysis when no scannable linked media', function() {
    act(function() {
      root.render(React.createElement(EnhanceOptionsMenu, {
        selection: createEmptyEnhanceSelection(),
        onToggleOption: jest.fn(),
        onSetGroup: jest.fn(),
        onStart: jest.fn(),
        availabilityContext: {
          resolverAvailable: true,
          features: { practiceAnalysis: true, whisper: true },
          hasScannableLinkedMedia: false,
        },
      }))
    })
    expect(container.querySelector('[data-testid="enhance-audio-unavailable"]')).toBeTruthy()
    expect(container.querySelector('#enhance-option-key').disabled).toBe(true)
    expect(container.querySelector('[data-testid="enhance-group-audio-all"]').disabled).toBe(true)
  })

})