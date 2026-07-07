import {
  applyColorScheme,
  COLOR_SCHEMES,
  DEFAULT_COLOR_SCHEME,
  getColorScheme,
  isNightColorScheme,
  normalizeColorScheme,
  setColorScheme,
  toggleNightColorScheme,
} from './colorSchemeSettings'

describe('colorSchemeSettings', function() {
  beforeEach(function() {
    localStorage.clear()
    document.documentElement.removeAttribute('data-color-scheme')
  })

  it('defaults to blue', function() {
    expect(getColorScheme()).toBe('blue')
    expect(normalizeColorScheme(null)).toBe('blue')
    expect(normalizeColorScheme('invalid')).toBe('blue')
  })

  it('persists and applies a color scheme', function() {
    setColorScheme('purple')
    expect(getColorScheme()).toBe('purple')
    expect(document.documentElement.getAttribute('data-color-scheme')).toBe('purple')
  })

  it('lists all supported schemes', function() {
    expect(COLOR_SCHEMES.map(function(scheme) { return scheme.id })).toEqual([
      'blue',
      'green',
      'red',
      'purple',
      'orange',
      'yellow',
      'pink',
      'night',
    ])
  })

  it('applyColorScheme does not write storage', function() {
    applyColorScheme('night')
    expect(document.documentElement.getAttribute('data-color-scheme')).toBe('night')
    expect(getColorScheme()).toBe(DEFAULT_COLOR_SCHEME)
  })

  it('toggleNightColorScheme switches to night and back', function() {
    setColorScheme('green')
    expect(toggleNightColorScheme()).toBe('night')
    expect(getColorScheme()).toBe('night')
    expect(isNightColorScheme()).toBe(true)
    expect(toggleNightColorScheme()).toBe('green')
    expect(getColorScheme()).toBe('green')
    expect(isNightColorScheme()).toBe(false)
  })

  it('toggleNightColorScheme restores default when no prior scheme stored', function() {
    setColorScheme('night')
    expect(toggleNightColorScheme()).toBe(DEFAULT_COLOR_SCHEME)
  })
})
