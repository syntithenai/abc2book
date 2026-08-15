import {
  normalizeChordsSearch,
  handleChordsSearchStreamEvent,
  searchChords,
  searchChordsViaResolver,
} from './chordsSearchClient'
import { searchChordsLight, CHORDS_LIGHT_ERROR } from './chordsSearchLight'
import * as mediaProxyClient from './mediaProxyClient'
import * as mediaResolverHealthStore from './mediaResolverHealthStore'
import { sheetLinesToLyricLines, sheetLinesToWizardChords } from './chordSheetImportUtils'

jest.mock('./chordsSearchLight', function() {
  return {
    CHORDS_LIGHT_ERROR: 'No chord sheet found in local collections (Ultimate Guitar and similar sites require the media resolver)',
    searchChordsLight: jest.fn(function() {
      return Promise.reject(new Error('No chord sheet found in local collections (Ultimate Guitar and similar sites require the media resolver)'))
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

describe('chordSheetImportUtils', function() {
  test('sheetLinesToWizardChords preserves section breaks and strips lyrics', function() {
    expect(sheetLinesToWizardChords([
      '[Verse 1]',
      'G C G',
      'Amazing Grace, how sweet the sound,',
      'G D G',
      'That saved a wretch like me:',
      '',
      '[Verse 2]',
      'G C G',
      'I once was lost but now am found,',
    ])).toBe('G C G | G D G |\n\nG C G |')
  })

  test('sheetLinesToLyricLines preserves headers and blanks', function() {
    expect(sheetLinesToLyricLines([
      '[Verse 1]',
      'G C G',
      'Amazing Grace, how sweet the sound,',
      '',
      '[Verse 2]',
      'G D G',
      'That saved a wretch like me:',
    ])).toEqual([
      '[Verse 1]',
      'Amazing Grace, how sweet the sound,',
      '',
      '[Verse 2]',
      'That saved a wretch like me:',
    ])
  })
})

describe('chordsSearchClient', function() {
  test('normalizeChordsSearch builds chord and lyric imports', function() {
    const result = normalizeChordsSearch({
      sheetLines: [
        '[Verse 1]',
        'G C G',
        'Amazing Grace, how sweet the sound,',
        'G D G',
        'That saved a wretch like me:',
      ],
      source: 'azchords.com',
      sourceUrl: 'https://www.azchords.com/j/johnnewton-tabs-47762/amazinggrace-tabs-895397.html',
      title: 'Amazing Grace',
      artist: 'John Newton',
    })

    expect(result.chordText).toBe('G C G | G D G |')
    expect(result.lyricLines).toEqual([
      '[Verse 1]',
      'Amazing Grace, how sweet the sound,',
      'That saved a wretch like me:',
    ])
    expect(Array.isArray(result.chordSheetAlignment)).toBe(true)
    expect(result.chordSheetAlignment.length).toBeGreaterThan(0)
    expect(result.source).toBe('azchords.com')
  })

  test('normalizeChordsSearch rejects empty sheetLines', function() {
    expect(function() {
      normalizeChordsSearch({ sheetLines: [] })
    }).toThrow('Chords search returned no chord sheet')
  })

  test('normalizeChordsSearch returns empty manualCandidates without throwing', function() {
    const result = normalizeChordsSearch({
      empty: true,
      found: false,
      manualCandidates: [{
        url: 'https://tabs.ultimate-guitar.com/tab/example',
        title: 'Amazing Grace',
        source: 'ultimate-guitar.com',
        host: 'tabs.ultimate-guitar.com',
        reason: 'blocked',
        contentType: 'chords',
      }],
    })
    expect(result.multiple).toBe(false)
    expect(result.empty).toBe(true)
    expect(result.found).toBe(false)
    expect(result.manualCandidates).toHaveLength(1)
    expect(result.manualCandidates[0]).toEqual({
      url: 'https://tabs.ultimate-guitar.com/tab/example',
      title: 'Amazing Grace',
      source: 'ultimate-guitar.com',
      host: 'tabs.ultimate-guitar.com',
      reason: 'blocked',
      contentType: 'chords',
    })
  })

  test('normalizeChordsSearch passes through capo key tuning tempo', function() {
    const result = normalizeChordsSearch({
      sheetLines: ['G C G', 'Amazing Grace'],
      source: 'azchords.com',
      capo: 2,
      key: 'G',
      tuning: 'E A D G B E',
      tempo: 90,
    })
    expect(result.capo).toBe(2)
    expect(result.key).toBe('G')
    expect(result.tuning).toBe('E A D G B E')
    expect(result.tempo).toBe(90)
  })

  test('handleChordsSearchStreamEvent forwards progress', function() {
    const updates = []
    handleChordsSearchStreamEvent({
      type: 'progress',
      message: 'Trying azchords.com...',
      progress: 0.45,
      stage: 'extract',
    }, function(message, progress, stage) {
      updates.push({ message: message, progress: progress, stage: stage })
    })
    expect(updates).toEqual([{
      message: 'Trying azchords.com...',
      progress: 0.45,
      stage: 'extract',
    }])
  })

  test('handleChordsSearchStreamEvent returns result events', function() {
    const result = handleChordsSearchStreamEvent({
      type: 'result',
      body: {
        sheetLines: ['G C G', 'Amazing Grace'],
        source: 'azchords.com',
      },
    }, function() {})
    expect(result.chordText).toBe('G C G |')
    expect(result.source).toBe('azchords.com')
  })

  test('handleChordsSearchStreamEvent throws on error events', function() {
    expect(function() {
      handleChordsSearchStreamEvent({
        type: 'error',
        message: 'No chords found for this song',
      }, function() {})
    }).toThrow('No chords found for this song')
  })

  describe('searchChords facade', function() {
    beforeEach(function() {
      mediaProxyClient.fetchViaMediaProxy.mockReset()
      searchChordsLight.mockReset()
      searchChordsLight.mockRejectedValue(new Error(CHORDS_LIGHT_ERROR))
      mediaProxyClient.isMediaProxyConfigured.mockReturnValue(true)
      mediaResolverHealthStore.getMediaResolverHealthState.mockReturnValue({
        checked: true,
        available: true,
      })
    })

    test('light path throws clear message when resolver unavailable', async function() {
      await expect(searchChords({ title: 'Amazing Grace', resolverAvailable: false }))
        .rejects.toThrow(CHORDS_LIGHT_ERROR)
      expect(mediaProxyClient.fetchViaMediaProxy).not.toHaveBeenCalled()
    })

    test('falls back to light path on infrastructure errors', async function() {
      mediaProxyClient.fetchViaMediaProxy.mockRejectedValue(
        new Error('Could not reach the media resolver')
      )

      await expect(searchChords({ title: 'Amazing Grace' }))
        .rejects.toThrow(CHORDS_LIGHT_ERROR)
    })

    test('uses resolver when available', async function() {
      mediaProxyClient.fetchViaMediaProxy.mockResolvedValue({
        ok: true,
        headers: { get: function() { return 'application/json' } },
        json: async function() {
          return {
            sheetLines: ['G C G', 'Amazing Grace'],
            source: 'azchords.com',
          }
        },
      })

      const result = await searchChordsViaResolver({ title: 'Amazing Grace' })

      expect(searchChordsLight).not.toHaveBeenCalled()
      expect(result.chordText).toBe('G C G |')
    })
  })
})
