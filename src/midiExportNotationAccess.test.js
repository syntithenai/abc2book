import { getMidiExportNotationAccess, getLinkPlayRangeAccess } from './midiExportNotationAccess'

describe('getMidiExportNotationAccess', function() {
  test('hides export until resolver health is checked', function() {
    const access = getMidiExportNotationAccess({
      resolverChecked: false,
      resolverAvailable: false,
      resolverStatus: null,
    })
    expect(access.showButton).toBe(false)
    expect(access.needsLogin).toBe(false)
  })

  test('shows export when resolver is available', function() {
    const access = getMidiExportNotationAccess({
      resolverChecked: true,
      resolverAvailable: true,
      resolverStatus: { available: true },
      accessToken: 'token',
    })
    expect(access.showButton).toBe(true)
    expect(access.needsLogin).toBe(false)
    expect(access.canExport).toBe(true)
  })

  test('shows login export when resolver is reachable but needs auth', function() {
    const access = getMidiExportNotationAccess({
      resolverChecked: true,
      resolverAvailable: false,
      accessToken: null,
      resolverStatus: {
        available: false,
        candidates: [{
          base: 'https://resolver.example',
          reachable: true,
          available: false,
          requireAuth: true,
          authReason: 'login_required',
        }],
      },
    })
    expect(access.showButton).toBe(true)
    expect(access.needsLogin).toBe(true)
    expect(access.canExport).toBe(false)
  })

  test('hides export when no resolver is reachable', function() {
    const access = getMidiExportNotationAccess({
      resolverChecked: true,
      resolverAvailable: false,
      resolverStatus: {
        available: false,
        candidates: [{
          base: 'http://localhost:3001',
          reachable: false,
          available: false,
          requireAuth: false,
        }],
      },
    })
    expect(access.showButton).toBe(false)
    expect(access.needsLogin).toBe(false)
  })
})

describe('getLinkPlayRangeAccess', function() {
  test('hides play range until resolver health is checked', function() {
    const access = getLinkPlayRangeAccess({
      resolverChecked: false,
      resolverAvailable: false,
      features: { whisper: true },
    })
    expect(access.showButton).toBe(false)
  })

  test('shows play range when resolver has whisper', function() {
    const access = getLinkPlayRangeAccess({
      resolverChecked: true,
      resolverAvailable: true,
      features: { whisper: true },
      accessToken: 'token',
      resolverStatus: { available: true },
    })
    expect(access.showButton).toBe(true)
    expect(access.needsLogin).toBe(false)
    expect(access.canOpen).toBe(true)
  })

  test('hides play range when resolver lacks whisper', function() {
    const access = getLinkPlayRangeAccess({
      resolverChecked: true,
      resolverAvailable: true,
      features: { whisper: false },
      accessToken: 'token',
      resolverStatus: { available: true },
    })
    expect(access.showButton).toBe(false)
  })

  test('shows login play range when resolver is reachable but needs auth', function() {
    const access = getLinkPlayRangeAccess({
      resolverChecked: true,
      resolverAvailable: false,
      features: { whisper: true },
      accessToken: null,
      resolverStatus: {
        available: false,
        candidates: [{
          base: 'https://resolver.example',
          reachable: true,
          available: false,
          requireAuth: true,
          authReason: 'login_required',
        }],
      },
    })
    expect(access.showButton).toBe(true)
    expect(access.needsLogin).toBe(true)
    expect(access.canOpen).toBe(false)
  })
})
