import * as mediaProxyClient from './mediaProxyClient'
import {
  lookupAlliteration,
  lookupDictionary,
  lookupPhraseIdeas,
  lookupReverseDictionary,
  lookupRhymes,
  lookupThesaurus,
} from './lyricsWordToolsApi'

jest.mock('./mediaProxyClient', function() {
  return {
    fetchViaMediaProxy: jest.fn(),
  }
})

const originalFetch = global.fetch

function mockJsonResponse(payload, ok = true) {
  return {
    ok: ok,
    text: async function() {
      return JSON.stringify(payload)
    },
    json: async function() {
      return payload
    },
  }
}

describe('lyricsWordToolsApi', function() {
  beforeEach(function() {
    jest.resetAllMocks()
  })

  afterEach(function() {
    global.fetch = originalFetch
  })

  test('falls back to direct dictionary lookup when resolver is unreachable', async function() {
    mediaProxyClient.fetchViaMediaProxy.mockRejectedValue(new Error('Could not reach any media resolver'))
    global.fetch = jest.fn().mockResolvedValue(mockJsonResponse([
      { word: 'courage', meanings: [] },
    ]))

    const result = await lookupDictionary('courage')

    expect(mediaProxyClient.fetchViaMediaProxy).toHaveBeenCalled()
    expect(global.fetch).toHaveBeenCalled()
    expect(result[0].word).toBe('courage')
  })

  test('falls back to direct Datamuse lookup for thesaurus', async function() {
    mediaProxyClient.fetchViaMediaProxy.mockRejectedValue(new Error('Could not reach any media resolver'))
    global.fetch = jest.fn().mockResolvedValue(mockJsonResponse([{ word: 'glad', score: 100 }]))

    const result = await lookupThesaurus('happy')

    expect(result.synonyms[0].word).toBe('glad')
  })

  test('falls back to direct Datamuse lookup for rhymes', async function() {
    mediaProxyClient.fetchViaMediaProxy.mockRejectedValue(new Error('Could not reach any media resolver'))
    global.fetch = jest.fn().mockResolvedValue(mockJsonResponse([{ word: 'moon', score: 100 }]))

    const result = await lookupRhymes('tune')

    expect(result.perfect[0].word).toBe('moon')
  })

  test('falls back to direct Datamuse lookup for reverse dictionary', async function() {
    mediaProxyClient.fetchViaMediaProxy.mockRejectedValue(new Error('Could not reach any media resolver'))
    global.fetch = jest.fn().mockResolvedValue(mockJsonResponse([{ word: 'wistful', score: 100 }]))

    const result = await lookupReverseDictionary('sad but hopeful')

    expect(result.meaning[0].word).toBe('wistful')
  })

  test('falls back to direct Datamuse lookup for phrase ideas', async function() {
    mediaProxyClient.fetchViaMediaProxy.mockRejectedValue(new Error('Could not reach any media resolver'))
    global.fetch = jest.fn().mockImplementation(async function(url) {
      if (url.includes('rel_bga=marriage')) return mockJsonResponse([{ word: 'ceremony', score: 100 }])
      if (url.includes('rel_bgb=abscond')) return mockJsonResponse([{ word: 'elope', score: 95 }])
      if (url.includes('rel_trg=abscond+girl+marriage')) return mockJsonResponse([{ word: 'stable', score: 90 }])
      if (url.includes('sp=abscond*girl*marriage*') || url.includes('sp=abscond%2Agirl%2Amarriage%2A')) return mockJsonResponse([{ word: 'towering', score: 80 }])
      return mockJsonResponse([])
    })

    const result = await lookupPhraseIdeas('abscond with girl marriage')
    const calledUrls = global.fetch.mock.calls.map(function(call) { return call[0] })

    expect(calledUrls.some(function(url) { return url.includes('rc=abscond+with+girl+marriage') })).toBe(true)
    expect(calledUrls.some(function(url) { return url.includes('rel_bga=marriage') })).toBe(true)
    expect(calledUrls.some(function(url) { return url.includes('lc=abscond+with+girl+marriage') })).toBe(true)
    expect(calledUrls.some(function(url) { return url.includes('rel_bgb=abscond') })).toBe(true)
    expect(result.followContext[0].word).toBe('ceremony')
    expect(result.precedeContext[0].word).toBe('elope')
    expect(result.related[0].word).toBe('stable')
    expect(result.spelling[0].word).toBe('towering')
  })

  test('falls back to direct Datamuse lookup for alliteration', async function() {
    mediaProxyClient.fetchViaMediaProxy.mockRejectedValue(new Error('Could not reach any media resolver'))
    global.fetch = jest.fn().mockResolvedValue(mockJsonResponse([
      { word: 'funny', score: 100 },
      { word: 'vivid', score: 90 },
    ]))

    const result = await lookupAlliteration('phone')

    expect(global.fetch.mock.calls[0][0]).toContain('rel_jja=phone')
    expect(result.alliterative[0].word).toBe('funny')
    expect(result.alliterative).toHaveLength(1)
    expect(result.related[1].word).toBe('vivid')
  })
})