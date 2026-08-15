import { fieldLookupAutomaticLookup } from './fieldLookupResolverAccess'

describe('fieldLookupResolverAccess', function() {
  test('blocks automatic lookup when shared resolver needs login', function() {
    expect(fieldLookupAutomaticLookup('composer', {
      needsLogin: true,
      resolverAvailable: true,
      features: {},
    })).toBe(false)
  })

  test('allows composer lookup when logged in', function() {
    expect(fieldLookupAutomaticLookup('composer', {
      needsLogin: false,
      resolverAvailable: false,
      features: {},
    })).toBe(true)
  })

  test('background lookup needs resolver LLM', function() {
    expect(fieldLookupAutomaticLookup('background', {
      needsLogin: false,
      resolverAvailable: false,
      features: {},
    })).toBe(false)
  })

  test('blocks automatic lookup when offline', function() {
    const originalOnLine = navigator.onLine
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    try {
      expect(fieldLookupAutomaticLookup('composer', {
        needsLogin: false,
        resolverAvailable: true,
        features: {},
      })).toBe(false)
    } finally {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: originalOnLine })
    }
  })
})
