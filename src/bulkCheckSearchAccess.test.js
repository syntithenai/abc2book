import {
  getBulkCheckActionAccess,
  getBulkCheckSearchActionAccess,
  getBulkCheckResolverLoginWarning,
} from './bulkCheckSearchAccess'

describe('bulkCheckSearchAccess', function() {
  const tune = { id: 1, name: 'Wild Rover', composer: '' }

  test('searchArtist allows lightweight lookup when resolver is offline', function() {
    const access = getBulkCheckSearchActionAccess('searchArtist', {
      tune: tune,
      resolverAvailable: false,
      resolverStatus: { available: false, candidates: [] },
      accessToken: null,
    })
    expect(access.automaticLookup).toBe(true)
    expect(access.showExternalOnly).toBe(false)
  })

  test('searchArtist is blocked when shared resolver needs login', function() {
    const access = getBulkCheckSearchActionAccess('searchArtist', {
      tune: tune,
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
      accessToken: null,
    })
    expect(access.needsLogin).toBe(true)
    expect(access.automaticLookup).toBe(false)
    expect(access.searchDisabled).toBe(true)
    expect(access.externalUrl).toContain('google.com')
  })

  test('backgroundInfo falls back to external search without resolver LLM', function() {
    const access = getBulkCheckSearchActionAccess('backgroundInfo', {
      tune: tune,
      resolverAvailable: false,
      resolverStatus: { available: false, candidates: [] },
      accessToken: null,
      features: {},
    })
    expect(access.automaticLookup).toBe(false)
    expect(access.showExternalOnly).toBe(true)
    expect(access.externalUrl).toContain('google.com')
  })

  test('searchChordsLyrics can use local chord tools without resolver', function() {
    const access = getBulkCheckSearchActionAccess('searchChordsLyrics', {
      tune: tune,
      tunebook: { abcTools: {} },
      resolverAvailable: false,
      resolverStatus: { available: false, candidates: [] },
      accessToken: null,
    })
    expect(access.automaticLookup).toBe(true)
  })

  test('getBulkCheckResolverLoginWarning surfaces login message', function() {
    const warning = getBulkCheckResolverLoginWarning({
      resolverStatus: {
        available: false,
        candidates: [{
          reachable: true,
          requireAuth: true,
          available: false,
          authReason: 'login_required',
        }],
      },
      accessToken: null,
    })
    expect(warning).not.toBeNull()
    expect(warning.message).toBe('Login to continue')
    expect(warning.showLoginButton).toBe(true)
  })

  test('scanLinkRegion requires resolver with whisper', function() {
    const access = getBulkCheckActionAccess('scanLinkRegion', {
      tune: tune,
      resolverAvailable: false,
      resolverStatus: { available: false, candidates: [] },
      accessToken: null,
      features: {},
    })
    expect(access.automaticLookup).toBe(false)
    expect(access.canRunAutomatic).toBe(false)
    expect(access.showExternalOnly).toBe(false)
    expect(access.unavailableReason).toMatch(/Whisper/i)
  })

  test('scanLinkRegion is available when resolver has whisper', function() {
    const access = getBulkCheckActionAccess('scanLinkRegion', {
      tune: tune,
      resolverAvailable: true,
      resolverStatus: { available: true, candidates: [] },
      accessToken: 'token',
      features: { whisper: true },
    })
    expect(access.canRunAutomatic).toBe(true)
  })
})
