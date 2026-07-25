import { getScratchpadNotationImportAccess } from './scratchpadNotationImportAccess'

describe('getScratchpadNotationImportAccess', function() {
  test('waits for resolver health before enabling import', function() {
    const access = getScratchpadNotationImportAccess({
      resolverChecked: false,
      resolverAvailable: false,
    })
    expect(access.mode).toBe('loading')
    expect(access.canPickFile).toBe(false)
  })

  test('offers ABC-only import when no resolver is reachable', function() {
    const access = getScratchpadNotationImportAccess({
      resolverChecked: true,
      resolverAvailable: false,
      resolverStatus: {
        available: false,
        candidates: [{
          base: 'http://localhost:3001',
          reachable: false,
          available: false,
        }],
      },
    })
    expect(access.mode).toBe('abcOnly')
    expect(access.importLabel).toBe('Import ABC')
    expect(access.fileAccept).toContain('.abc')
    expect(access.fileAccept).not.toContain('.mid')
    expect(access.canPickFile).toBe(true)
  })

  test('offers ABC import plus login button when resolver needs auth', function() {
    const access = getScratchpadNotationImportAccess({
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
    expect(access.mode).toBe('login')
    expect(access.importLabel).toBe('Import ABC')
    expect(access.loginImportLabel).toBe('Login to Import MusicXML/MIDI')
    expect(access.needsLogin).toBe(true)
    expect(access.canPickFile).toBe(true)
    expect(access.abcOnly).toBe(true)
    expect(access.fileAccept).toContain('.abc')
    expect(access.fileAccept).not.toContain('.mid')
  })

  test('offers full import when resolver is available', function() {
    const access = getScratchpadNotationImportAccess({
      resolverChecked: true,
      resolverAvailable: true,
      accessToken: 'token',
      resolverStatus: { available: true },
    })
    expect(access.mode).toBe('full')
    expect(access.importLabel).toBe('Import ABC/MusicXML/MIDI')
    expect(access.fileAccept).toContain('.mid')
    expect(access.canPickFile).toBe(true)
  })
})
