import * as mediaProxyClient from './mediaProxyClient'
import {
  lookupAlliteration,
  lookupDictionary,
  lookupLookupHub,
  lookupPhraseIdeas,
  lookupReverseDictionary,
  lookupRhymes,
  lookupThesaurus,
  resolveDictionaryWord,
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
    global.fetch = jest.fn().mockImplementation(async function(url) {
      if (url.includes('/sug?')) return mockJsonResponse([])
      if (url.includes('rel_jja=phone')) {
        return mockJsonResponse([{ word: 'funny', score: 100 }, { word: 'vivid', score: 90 }])
      }
      if (url.includes('sp=f*')) {
        return mockJsonResponse([{ word: 'fancy', score: 80 }])
      }
      if (url.includes('sl=phone')) return mockJsonResponse([])
      return mockJsonResponse([])
    })

    const result = await lookupAlliteration('phone')

    expect(result.alliterative[0].word).toBe('funny')
    expect(result.alliterative.some(function(item) { return item.word === 'fancy' })).toBe(true)
    expect(result.related.some(function(item) { return item.word === 'vivid' })).toBe(true)
  })

  test('fuzzy dictionary resolution picks the closest dictionary match', async function() {
    mediaProxyClient.fetchViaMediaProxy.mockRejectedValue(new Error('Could not reach any media resolver'))
    global.fetch = jest.fn().mockImplementation(async function(url) {
      if (/\/entries\/en\/courag$/.test(url)) {
        return { ok: false, text: async function() { return '{"title":"No Definitions Found"}' } }
      }
      if (/\/entries\/en\/courage$/.test(url)) {
        return mockJsonResponse([{ word: 'courage', meanings: [] }])
      }
      if (url.includes('/sug?s=courag')) {
        return mockJsonResponse([{ word: 'courage', score: 1000 }])
      }
      return mockJsonResponse([])
    })

    const result = await resolveDictionaryWord('courag')

    expect(result.matchType).toBe('fuzzy')
    expect(result.resolvedWord).toBe('courage')
    expect(result.dictionary[0].word).toBe('courage')
  })

  test('falls back to Wikipedia encyclopedia when dictionary has no entry', async function() {
    mediaProxyClient.fetchViaMediaProxy.mockRejectedValue(new Error('Could not reach any media resolver'))
    global.fetch = jest.fn().mockImplementation(async function(url) {
      if (url.includes('/entries/en/')) {
        return { ok: false, text: async function() { return '{"title":"No Definitions Found"}' } }
      }
      if (url.includes('/page/summary/Acacia_melanoxylon')) {
        return mockJsonResponse({
          type: 'standard',
          title: 'Acacia melanoxylon',
          description: 'Species of legume',
          extract: 'Acacia melanoxylon, commonly known as the Australian blackwood, is an Acacia species native to south-eastern Australia.',
          thumbnail: {
            source: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f6/Acacia_melanoxylon.jpg/330px-Acacia_melanoxylon.jpg',
            width: 330,
            height: 219,
          },
          content_urls: {
            desktop: { page: 'https://en.wikipedia.org/wiki/Acacia_melanoxylon' },
          },
        })
      }
      return mockJsonResponse([])
    })

    const result = await resolveDictionaryWord('Acacia melanoxylon', null, 'Acacia melanoxylon', {
      allowFuzzy: false,
    })

    expect(result.matchType).toBe('encyclopedia')
    expect(result.resolvedWord).toBe('Acacia melanoxylon')
    expect(result.dictionary[0].source).toBe('wikipedia')
    expect(result.dictionary[0].meanings[0].definitions[0].definition).toContain('Australian blackwood')
    expect(result.image.url).toContain('Acacia_melanoxylon.jpg')
  })

  test('lookup hub uses resolved dictionary word for thesaurus and original text for rhymes', async function() {
    mediaProxyClient.fetchViaMediaProxy.mockRejectedValue(new Error('Could not reach any media resolver'))
    global.fetch = jest.fn().mockImplementation(async function(url) {
      if (/\/entries\/en\/flimflam$/.test(url)) {
        return { ok: false, text: async function() { return '{"title":"No Definitions Found"}' } }
      }
      if (url.includes('/sug?s=flimflam')) return mockJsonResponse([])
      if (url.includes('sp=flimflam*')) return mockJsonResponse([])
      if (url.includes('wikipedia.org')) {
        return { ok: false, text: async function() { return '{"type":"https://mediawiki.org/wiki/HyperSwitch/errors/not_found"}' } }
      }
      if (url.includes('rel_syn=flimflam')) return mockJsonResponse([{ word: 'nonsense', score: 10 }])
      if (url.includes('rel_ant=flimflam')) return mockJsonResponse([])
      if (url.includes('rel_trg=flimflam')) return mockJsonResponse([])
      if (url.includes('rel_jja=flimflam')) return mockJsonResponse([{ word: 'flimsy', score: 90 }])
      if (url.includes('sp=fl*')) return mockJsonResponse([{ word: 'flimsy', score: 80 }])
      if (url.includes('sl=flimflam')) return mockJsonResponse([{ word: 'dimflam', score: 70 }])
      if (url.includes('rel_rhy=flimflam')) return mockJsonResponse([])
      if (url.includes('rel_nry=flimflam')) return mockJsonResponse([])
      return mockJsonResponse([])
    })

    const result = await lookupLookupHub('flimflam')

    expect(result.dictionaryMatch).toBe('none')
    expect(result.thesaurus.synonyms[0].word).toBe('nonsense')
    expect(result.alliteration.alliterative.some(function(item) { return item.word === 'flimsy' })).toBe(true)
    expect(result.rhyme.perfect[0].word).toBe('dimflam')
  })

  test('lookup hub prefers Wikipedia meaning for the original multi-word query', async function() {
    mediaProxyClient.fetchViaMediaProxy.mockRejectedValue(new Error('Could not reach any media resolver'))
    global.fetch = jest.fn().mockImplementation(async function(url) {
      if (url.includes('ml=') && url.includes('Acacia')) {
        return mockJsonResponse([{ word: 'lightwood', score: 100 }])
      }
      if (url.includes('topics=') && url.includes('Acacia')) return mockJsonResponse([])
      if (url.includes('sp=Acacia')) return mockJsonResponse([])
      if (url.includes('/entries/en/')) {
        return { ok: false, text: async function() { return '{"title":"No Definitions Found"}' } }
      }
      if (url.includes('/page/summary/Acacia_melanoxylon')) {
        return mockJsonResponse({
          type: 'standard',
          title: 'Acacia melanoxylon',
          description: 'Species of legume',
          extract: 'Acacia melanoxylon, commonly known as the Australian blackwood, is an Acacia species native to south-eastern Australia and an invasive species in other regions of the globe.',
          thumbnail: {
            source: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f6/Acacia_melanoxylon.jpg/330px-Acacia_melanoxylon.jpg',
            width: 330,
            height: 219,
          },
          content_urls: {
            desktop: { page: 'https://en.wikipedia.org/wiki/Acacia_melanoxylon' },
          },
        })
      }
      if (url.includes('rel_syn=lightwood')) return mockJsonResponse([{ word: 'kindling', score: 10 }])
      if (url.includes('rel_ant=lightwood')) return mockJsonResponse([])
      if (url.includes('rel_trg=lightwood')) return mockJsonResponse([])
      if (url.includes('rel_jja=Acacia')) return mockJsonResponse([])
      if (url.includes('sl=Acacia')) return mockJsonResponse([])
      if (url.includes('rel_rhy=lightwood')) return mockJsonResponse([{ word: 'firewood', score: 70 }])
      if (url.includes('rel_nry=lightwood')) return mockJsonResponse([])
      return mockJsonResponse([])
    })

    const result = await lookupLookupHub('Acacia melanoxylon')

    expect(result.dictionaryMatch).toBe('encyclopedia')
    expect(result.dictionary[0].word).toBe('Acacia melanoxylon')
    expect(result.dictionaryImage.url).toContain('Acacia_melanoxylon.jpg')
    expect(result.reverseMatchWord).toBe('lightwood')
    expect(result.selectedReverseWord).toBe('')
    expect(result.thesaurus.synonyms[0].word).toBe('kindling')
    expect(result.rhyme.perfect[0].word).toBe('firewood')
  })

  test('lookup hub uses reverse dictionary for multi-word phrases', async function() {
    mediaProxyClient.fetchViaMediaProxy.mockRejectedValue(new Error('Could not reach any media resolver'))
    global.fetch = jest.fn().mockImplementation(async function(url) {
      if (url.includes('ml=') && url.includes('bittersweet')) {
        return mockJsonResponse([{ word: 'wistful', score: 100 }])
      }
      if (url.includes('topics=') && url.includes('bittersweet')) return mockJsonResponse([])
      if (url.includes('sp=bittersweet')) return mockJsonResponse([])
      if (url.includes('/entries/en/')) {
        if (/\/entries\/en\/wistful$/.test(url)) {
          return mockJsonResponse([{ word: 'wistful', meanings: [] }])
        }
        return { ok: false, text: async function() { return '{"title":"No Definitions Found"}' } }
      }
      if (url.includes('wikipedia.org')) {
        return mockJsonResponse({ type: 'disambiguation', title: 'Bittersweet', extract: 'short' })
      }
      if (url.includes('rel_syn=wistful')) return mockJsonResponse([{ word: 'melancholy', score: 10 }])
      if (url.includes('rel_ant=wistful')) return mockJsonResponse([])
      if (url.includes('rel_trg=wistful')) return mockJsonResponse([])
      if (url.includes('rel_jja=bittersweet')) return mockJsonResponse([])
      if (url.includes('sl=bittersweet')) return mockJsonResponse([])
      if (url.includes('rel_rhy=wistful')) return mockJsonResponse([{ word: 'fistful', score: 70 }])
      if (url.includes('rel_nry=wistful')) return mockJsonResponse([])
      return mockJsonResponse([])
    })

    const result = await lookupLookupHub('bittersweet glowing')

    expect(result.reverseMatchWord).toBe('wistful')
    expect(result.selectedReverseWord).toBe('wistful')
    expect(result.reverseCandidates[0].word).toBe('wistful')
    expect(result.dictionary[0].word).toBe('wistful')
    expect(result.thesaurus.synonyms[0].word).toBe('melancholy')
    expect(result.rhyme.perfect[0].word).toBe('fistful')
  })

  test('lookup hub honors a selected reverse dictionary word', async function() {
    mediaProxyClient.fetchViaMediaProxy.mockRejectedValue(new Error('Could not reach any media resolver'))
    global.fetch = jest.fn().mockImplementation(async function(url) {
      if (url.includes('ml=') && url.includes('bittersweet')) {
        return mockJsonResponse([
          { word: 'wistful', score: 100 },
          { word: 'hopeful', score: 90 },
        ])
      }
      if (url.includes('topics=') && url.includes('bittersweet')) return mockJsonResponse([])
      if (url.includes('sp=bittersweet')) return mockJsonResponse([])
      if (/\/entries\/en\/hopeful$/.test(url)) {
        return mockJsonResponse([{ word: 'hopeful', meanings: [] }])
      }
      if (url.includes('/entries/en/')) {
        return { ok: false, text: async function() { return '{"title":"No Definitions Found"}' } }
      }
      if (url.includes('wikipedia.org')) {
        return mockJsonResponse({ type: 'disambiguation', title: 'Bittersweet', extract: 'short' })
      }
      if (url.includes('rel_syn=hopeful')) return mockJsonResponse([{ word: 'optimistic', score: 10 }])
      if (url.includes('rel_ant=hopeful')) return mockJsonResponse([])
      if (url.includes('rel_trg=hopeful')) return mockJsonResponse([])
      if (url.includes('rel_jja=bittersweet')) return mockJsonResponse([])
      if (url.includes('sl=bittersweet')) return mockJsonResponse([])
      if (url.includes('rel_rhy=hopeful')) return mockJsonResponse([{ word: 'dopeful', score: 70 }])
      if (url.includes('rel_nry=hopeful')) return mockJsonResponse([])
      return mockJsonResponse([])
    })

    const reverseResult = {
      meaning: [{ word: 'wistful', score: 100 }, { word: 'hopeful', score: 90 }],
      topic: [],
      examples: [],
    }
    const result = await lookupLookupHub('bittersweet glowing', null, {
      selectedWord: 'hopeful',
      reverseResult: reverseResult,
      preferSelectedWord: true,
    })

    expect(result.selectedReverseWord).toBe('hopeful')
    expect(result.dictionaryQuery).toBe('hopeful')
    expect(result.dictionary[0].word).toBe('hopeful')
    expect(result.thesaurus.synonyms[0].word).toBe('optimistic')
    expect(result.rhyme.perfect[0].word).toBe('dopeful')
  })

  test('lookup hub updates Wikipedia meaning when a reverse word is picked', async function() {
    mediaProxyClient.fetchViaMediaProxy.mockRejectedValue(new Error('Could not reach any media resolver'))
    global.fetch = jest.fn().mockImplementation(async function(url) {
      if (url.includes('ml=') && url.includes('Acacia')) {
        return mockJsonResponse([
          { word: 'lightwood', score: 100 },
          { word: 'blackwood', score: 90 },
        ])
      }
      if (url.includes('topics=') && url.includes('Acacia')) return mockJsonResponse([])
      if (url.includes('sp=Acacia')) return mockJsonResponse([])
      if (url.includes('/entries/en/')) {
        return { ok: false, text: async function() { return '{"title":"No Definitions Found"}' } }
      }
      if (url.includes('/page/summary/blackwood') || url.includes('/page/summary/Blackwood')) {
        return mockJsonResponse({
          type: 'standard',
          title: 'Blackwood',
          description: 'Common name for trees',
          extract: 'Blackwood is a common name for several trees that produce dark timber, including Acacia melanoxylon.',
          thumbnail: {
            source: 'https://upload.wikimedia.org/wikipedia/commons/thumb/example/blackwood.jpg/330px-blackwood.jpg',
            width: 330,
            height: 220,
          },
          content_urls: {
            desktop: { page: 'https://en.wikipedia.org/wiki/Blackwood' },
          },
        })
      }
      if (url.includes('/page/summary/Acacia_melanoxylon')) {
        return mockJsonResponse({
          type: 'standard',
          title: 'Acacia melanoxylon',
          description: 'Species of legume',
          extract: 'Acacia melanoxylon, commonly known as the Australian blackwood, is an Acacia species native to south-eastern Australia and an invasive species in other regions of the globe.',
          content_urls: {
            desktop: { page: 'https://en.wikipedia.org/wiki/Acacia_melanoxylon' },
          },
        })
      }
      if (url.includes('rel_syn=blackwood')) return mockJsonResponse([{ word: 'timber', score: 10 }])
      if (url.includes('rel_ant=blackwood')) return mockJsonResponse([])
      if (url.includes('rel_trg=blackwood')) return mockJsonResponse([])
      if (url.includes('rel_jja=Acacia')) return mockJsonResponse([])
      if (url.includes('sl=Acacia')) return mockJsonResponse([])
      if (url.includes('rel_rhy=blackwood')) return mockJsonResponse([{ word: 'rosewood', score: 70 }])
      if (url.includes('rel_nry=blackwood')) return mockJsonResponse([])
      return mockJsonResponse([])
    })

    const reverseResult = {
      meaning: [{ word: 'lightwood', score: 100 }, { word: 'blackwood', score: 90 }],
      topic: [],
      examples: [],
    }
    const result = await lookupLookupHub('Acacia melanoxylon', null, {
      selectedWord: 'blackwood',
      reverseResult: reverseResult,
      preferSelectedWord: true,
    })

    expect(result.selectedReverseWord).toBe('blackwood')
    expect(result.dictionaryQuery).toBe('blackwood')
    expect(result.dictionaryMatch).toBe('encyclopedia')
    expect(result.dictionary[0].word).toBe('Blackwood')
    expect(result.dictionary[0].meanings[0].definitions[0].definition).toContain('dark timber')
    expect(result.dictionaryImage.url).toContain('blackwood.jpg')
  })
})
