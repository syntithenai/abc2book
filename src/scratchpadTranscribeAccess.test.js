import {
  getScratchpadTranscribeAccess,
  getScratchpadTranscribeUseLabel,
  getScratchpadTranscribeBackgroundStartMessage,
} from './scratchpadTranscribeAccess'

describe('scratchpadTranscribeAccess', function() {
  test('hides transcribe option when resolver has not been checked', function() {
    const access = getScratchpadTranscribeAccess({
      resolverChecked: false,
      resolverAvailable: true,
      features: { whisper: true },
    })
    expect(access.showOption).toBe(false)
    expect(getScratchpadTranscribeUseLabel(access)).toBe('')
  })

  test('hides transcribe option when resolver is unavailable and not auth-blocked', function() {
    const access = getScratchpadTranscribeAccess({
      resolverChecked: true,
      resolverAvailable: false,
      resolverStatus: { available: false, candidates: [] },
      features: {},
    })
    expect(access.showOption).toBe(false)
  })

  test('shows Login to Transcribe when resolver is auth-blocked', function() {
    const access = getScratchpadTranscribeAccess({
      resolverChecked: true,
      resolverAvailable: false,
      resolverStatus: {
        available: false,
        candidates: [{
          reachable: true,
          requireAuth: true,
          available: false,
          authReason: 'login_required',
        }],
      },
      features: {},
      accessToken: null,
    })
    expect(access.showOption).toBe(true)
    expect(access.needsLogin).toBe(true)
    expect(getScratchpadTranscribeUseLabel(access)).toBe('Login to Transcribe')
  })

  test('shows Transcribe when whisper is available', function() {
    const access = getScratchpadTranscribeAccess({
      resolverChecked: true,
      resolverAvailable: true,
      features: { whisper: true },
    })
    expect(access.showOption).toBe(true)
    expect(access.canUse).toBe(true)
    expect(getScratchpadTranscribeUseLabel(access)).toBe('Transcribe')
  })

  test('hides transcribe when whisper feature is unavailable', function() {
    const access = getScratchpadTranscribeAccess({
      resolverChecked: true,
      resolverAvailable: true,
      features: { whisper: false },
    })
    expect(access.showOption).toBe(false)
  })

  test('merges credit affordance into access', function() {
    const access = getScratchpadTranscribeAccess({
      resolverChecked: true,
      resolverAvailable: true,
      features: { whisper: true },
      affordance: {
        checked: true,
        affordable: false,
        estimateCents: 12,
        availableCents: 5,
        shortfallCents: 7,
      },
    })
    expect(access.canUse).toBe(false)
    expect(access.needsCredit).toBe(true)
    expect(access.cannotAfford).toBe(true)
    expect(getScratchpadTranscribeUseLabel(access)).toBe('Buy Credit to Transcribe')
  })

  test('getScratchpadTranscribeBackgroundStartMessage explains background run', function() {
    expect(getScratchpadTranscribeBackgroundStartMessage()).toMatch(/Transcription is running in the background/)
    expect(getScratchpadTranscribeBackgroundStartMessage()).toMatch(/notification/)
  })
})
