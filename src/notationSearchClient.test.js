import {
  normalizeNotationSearch,
  handleNotationSearchStreamEvent,
  searchNotation,
  searchNotationViaResolver,
} from './notationSearchClient'
import { searchNotationLight } from './notationSearchLight'
import * as mediaProxyClient from './mediaProxyClient'
import * as mediaResolverHealthStore from './mediaResolverHealthStore'

jest.mock('./notationSearchLight', function() {
  return {
    searchNotationLight: jest.fn(function() {
      return Promise.resolve({
        abc: 'X:1\nK:G\nGAB|',
        source: 'local',
        multiple: false,
      })
    }),
  }
})

jest.mock('./mediaProxyClient', function() {
  const actual = jest.requireActual('./mediaProxyClient')
  return Object.assign({}, actual, {
    fetchViaMediaProxy: jest.fn(),
    isMediaProxyConfigured: jest.fn(function() { return true }),
  })
})

jest.mock('./mediaResolverHealthStore', function() {
  return {
    getMediaResolverHealthState: jest.fn(function() {
      return { checked: true, available: true }
    }),
  }
})

describe('notationSearchClient', function() {
    test('normalizeNotationSearch builds abc candidate', function() {
    const result = normalizeNotationSearch({
      abc: 'X:1\nT:Drowsy Maggie\nM:4/4\nL:1/8\nK:Edor\n|:E2|',
      source: 'thesession.org',
      sourceUrl: 'https://thesession.org/tunes/123',
      title: 'Drowsy Maggie',
      tuneMeta: {
        composer: 'Traditional',
        srcUrl: 'https://thesession.org/tunes/123',
      },
    })

    expect(result.abc).toContain('K:Edor')
    expect(result.source).toBe('thesession.org')
    expect(result.artist).toBe('Traditional')
    expect(result.tuneMeta.composer).toBe('Traditional')
    expect(result.multiple).toBe(false)
  })

  test('normalizeNotationSearch handles multiple candidates', function() {
    const result = normalizeNotationSearch({
      multiple: true,
      candidates: [
        {
          abc: 'X:1\nK:G\nGAB|',
          source: 'thesession.org',
          title: 'Tune A',
        },
        {
          abc: 'X:2\nK:D\nDEF|',
          source: 'abcnotation.com',
          title: 'Tune B',
        },
      ],
    })

    expect(result.multiple).toBe(true)
    expect(result.candidates).toHaveLength(2)
  })

  test('normalizeNotationSearch rejects empty abc', function() {
    expect(function() {
      normalizeNotationSearch({ abc: '' })
    }).toThrow('Notation search returned no usable ABC')
  })

  test('normalizeNotationSearch returns empty manualCandidates without throwing', function() {
    const result = normalizeNotationSearch({
      empty: true,
      found: false,
      manualCandidates: [{
        url: 'https://example.com/tune',
        title: 'Drowsy Maggie',
        source: 'example.com',
        host: 'example.com',
        reason: 'blocked',
        contentType: 'notation',
      }],
    })
    expect(result.multiple).toBe(false)
    expect(result.empty).toBe(true)
    expect(result.found).toBe(false)
    expect(result.manualCandidates).toHaveLength(1)
    expect(result.manualCandidates[0].contentType).toBe('notation')
  })

  test('handleNotationSearchStreamEvent forwards progress', function() {
    const updates = []
    handleNotationSearchStreamEvent({
      type: 'progress',
      message: 'Searching The Session...',
      progress: 0.2,
      stage: 'thesession',
    }, function(message, progress, stage) {
      updates.push({ message: message, progress: progress, stage: stage })
    })
    expect(updates).toEqual([{
      message: 'Searching The Session...',
      progress: 0.2,
      stage: 'thesession',
    }])
  })

  describe('searchNotation facade', function() {
    const lightResult = {
      abc: 'X:1\nK:G\nGAB|',
      source: 'local',
      multiple: false,
    }

    beforeEach(function() {
      mediaProxyClient.fetchViaMediaProxy.mockReset()
      searchNotationLight.mockReset()
      searchNotationLight.mockResolvedValue(lightResult)
      mediaProxyClient.isMediaProxyConfigured.mockReturnValue(true)
      mediaResolverHealthStore.getMediaResolverHealthState.mockReturnValue({
        checked: true,
        available: true,
      })
    })

    test('uses lightweight search when resolverAvailable is false', async function() {
      const result = await searchNotation({
        title: 'Wild Rover',
        resolverAvailable: false,
      })

      expect(mediaProxyClient.fetchViaMediaProxy).not.toHaveBeenCalled()
      expect(searchNotationLight).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Wild Rover',
      }))
      expect(result.source).toBe('local')
    })

    test('falls back to lightweight search on resolver infrastructure errors', async function() {
      mediaProxyClient.fetchViaMediaProxy.mockRejectedValue(
        new Error('Could not reach the media resolver')
      )

      const result = await searchNotation({ title: 'Wild Rover' })

      expect(mediaProxyClient.fetchViaMediaProxy).toHaveBeenCalled()
      expect(searchNotationLight).toHaveBeenCalled()
      expect(result.source).toBe('local')
    })

    test('rethrows non-infrastructure resolver errors', async function() {
      mediaProxyClient.fetchViaMediaProxy.mockRejectedValue(
        new Error('Notation search failed: invalid query')
      )

      await expect(searchNotation({ title: 'Wild Rover' }))
        .rejects.toThrow('Notation search failed: invalid query')
      expect(searchNotationLight).not.toHaveBeenCalled()
    })

    test('uses resolver when available and returns normalized result', async function() {
      mediaProxyClient.fetchViaMediaProxy.mockResolvedValue({
        ok: true,
        json: async function() {
          return {
            abc: 'X:1\nT:Drowsy Maggie\nK:Edor\n|:E2|',
            source: 'thesession.org',
            title: 'Drowsy Maggie',
          }
        },
      })

      const result = await searchNotationViaResolver({ title: 'Drowsy Maggie' })

      expect(searchNotationLight).not.toHaveBeenCalled()
      expect(result.abc).toContain('K:Edor')
      expect(result.source).toBe('thesession.org')
    })
  })
})
