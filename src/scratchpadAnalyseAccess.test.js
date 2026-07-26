import {
  getScratchpadAnalyseAccess,
  getScratchpadAnalyseUseLabel,
  getScratchpadAnalyseChoices,
  getScratchpadAnalyseBackgroundStartMessage,
} from './scratchpadAnalyseAccess'

function fullResolverFeatures() {
  return {
    sheetImageOcr: true,
    sheetImage: true,
    sheetImageOmr: true,
    practiceAnalysis: true,
    whisper: true,
  }
}

function lightResolverFeatures() {
  return {
    sheetImageOcr: true,
    sheetImage: true,
    sheetImageOmr: false,
    practiceAnalysis: false,
    whisper: true,
  }
}

describe('scratchpadAnalyseAccess', function() {
  test('hides analyse option when resolver has not been checked', function() {
    const access = getScratchpadAnalyseAccess({
      resolverChecked: false,
      resolverAvailable: true,
      features: fullResolverFeatures(),
    }, 'image')
    expect(access.showOption).toBe(false)
    expect(getScratchpadAnalyseUseLabel(access)).toBe('')
  })

  test('hides analyse option when resolver is unavailable and not auth-blocked', function() {
    const access = getScratchpadAnalyseAccess({
      resolverChecked: true,
      resolverAvailable: false,
      resolverStatus: { available: false, candidates: [] },
      features: {},
    }, 'audio')
    expect(access.showOption).toBe(false)
  })

  test('shows Login to For Optical Recognition when image resolver is auth-blocked', function() {
    const access = getScratchpadAnalyseAccess({
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
    }, 'image')
    expect(access.showOption).toBe(true)
    expect(access.needsLogin).toBe(true)
    expect(getScratchpadAnalyseUseLabel(access)).toBe('Login to For Optical Recognition')
    expect(getScratchpadAnalyseChoices(access).map(function(c) { return c.id })).toEqual(['ocr', 'omr'])
  })

  test('shows Login to Analyse when audio resolver is auth-blocked', function() {
    const access = getScratchpadAnalyseAccess({
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
    }, 'audio')
    expect(getScratchpadAnalyseUseLabel(access)).toBe('Login to Analyse')
  })

  test('image on light resolver offers OCR but not OMR', function() {
    const access = getScratchpadAnalyseAccess({
      resolverChecked: true,
      resolverAvailable: true,
      features: lightResolverFeatures(),
    }, 'image')
    expect(access.showOption).toBe(true)
    expect(access.canUse).toBe(true)
    expect(getScratchpadAnalyseUseLabel(access)).toBe('For Optical Recognition')
    expect(getScratchpadAnalyseChoices(access).map(function(c) { return c.id })).toEqual(['ocr'])
    expect(access.unavailableHelperText).toMatch(/OMR/)
  })

  test('audio on light resolver offers chords and lyrics but not melody', function() {
    const access = getScratchpadAnalyseAccess({
      resolverChecked: true,
      resolverAvailable: true,
      features: lightResolverFeatures(),
    }, 'audio')
    expect(getScratchpadAnalyseChoices(access).map(function(c) { return c.id })).toEqual(['chords', 'lyrics'])
    expect(access.unavailableHelperText).toMatch(/Melody/)
  })

  test('full resolver offers all image and audio choices', function() {
    const imageAccess = getScratchpadAnalyseAccess({
      resolverChecked: true,
      resolverAvailable: true,
      features: fullResolverFeatures(),
    }, 'image')
    expect(getScratchpadAnalyseChoices(imageAccess).map(function(c) { return c.id })).toEqual(['ocr', 'omr'])

    const audioAccess = getScratchpadAnalyseAccess({
      resolverChecked: true,
      resolverAvailable: true,
      features: fullResolverFeatures(),
    }, 'audio')
    expect(getScratchpadAnalyseChoices(audioAccess).map(function(c) { return c.id })).toEqual(['chords', 'melody', 'lyrics'])
  })

  test('getScratchpadAnalyseBackgroundStartMessage explains background run and completion toast', function() {
    expect(getScratchpadAnalyseBackgroundStartMessage('image', 'ocr')).toMatch(/OCR is running in the background/)
    expect(getScratchpadAnalyseBackgroundStartMessage('image', 'omr')).toMatch(/OMR is running in the background/)
    expect(getScratchpadAnalyseBackgroundStartMessage('audio', 'chords')).toMatch(/Chord analysis is running in the background/)
    expect(getScratchpadAnalyseBackgroundStartMessage('audio', 'melody')).toMatch(/Melody analysis is running in the background/)
    expect(getScratchpadAnalyseBackgroundStartMessage('audio', 'lyrics')).toMatch(/Lyrics transcription is running in the background/)
    expect(getScratchpadAnalyseBackgroundStartMessage('audio', 'chords')).toMatch(/notification/)
  })
})
