import { searchChordsLight, CHORDS_LIGHT_ERROR } from './chordsSearchLight'
import * as mediaProxyClient from './mediaProxyClient'
import * as mediaResolverHealthStore from './mediaResolverHealthStore'
import * as youtubeExtensionClient from './youtubeExtensionClient'
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

jest.mock('./youtubeExtensionClient', function() {
  return {
    isUltimateGuitarPageUrl: jest.fn(function(url) {
      return String(url || '').indexOf('ultimate-guitar.com') >= 0
    }),
    isYoutubeExtensionConnected: jest.fn(function() {
      return Promise.resolve(false)
    }),
    fetchPageHtmlViaExtension: jest.fn(function() {
      return Promise.reject(new Error('not connected'))
    }),
  }
})

import {
  normalizeChordsSearch,
  handleChordsSearchStreamEvent,
  searchChords,
  searchChordsViaResolver,
  sortChordsCandidatesPreferInline,
} from './chordsSearchClient'

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
  test('normalizeChordsSearch keeps chords-over-words lyric lines as captured', function() {
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
      'G C G',
      'Amazing Grace, how sweet the sound,',
      'G D G',
      'That saved a wretch like me:',
    ])
    expect(Array.isArray(result.chordSheetAlignment)).toBe(true)
    expect(result.chordSheetAlignment.length).toBeGreaterThan(0)
    expect(result.source).toBe('azchords.com')
  })

  test('normalizeChordsSearch soft-ranks inline ChordPro ahead of chords-over-words', function() {
    const result = normalizeChordsSearch({
      multiple: true,
      candidates: [
        {
          sheetLines: ['C G', 'plain cow lyric'],
          source: 'azchords.com',
          sourceUrl: 'https://www.azchords.com/a/x',
        },
        {
          sheetLines: ['[Am]inline [G]lyric'],
          source: 'example.com',
          sourceUrl: 'https://example.com/x',
        },
        {
          sheetLines: ['G', 'hello'],
          source: 'tabs.ultimate-guitar.com',
          sourceUrl: 'https://tabs.ultimate-guitar.com/tab/x',
        },
      ],
    })
    expect(result.multiple).toBe(true)
    expect(result.candidates).toHaveLength(3)
    expect(result.candidates[0].lyricLines[0]).toContain('[Am]')
    // Within chords-over-words tier, Ultimate Guitar sorts ahead.
    expect(result.candidates[1].source).toBe('tabs.ultimate-guitar.com')
    expect(result.candidates[2].source).toBe('azchords.com')
  })

  test('sortChordsCandidatesPreferInline keeps relative order within a tier', function() {
    const sorted = sortChordsCandidatesPreferInline([
      { source: 'e-chords.com', sourceUrl: 'https://e-chords.com/a', lyricLines: ['C G', 'lyric'] },
      { source: 'cifraclub.com', sourceUrl: 'https://cifraclub.com/a', lyricLines: ['D A', 'lyric'] },
    ])
    expect(sorted.map(function(c) { return c.source })).toEqual([
      'e-chords.com',
      'cifraclub.com',
    ])
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
      youtubeExtensionClient.isYoutubeExtensionConnected.mockReset()
      youtubeExtensionClient.isYoutubeExtensionConnected.mockResolvedValue(false)
      youtubeExtensionClient.fetchPageHtmlViaExtension.mockReset()
      youtubeExtensionClient.fetchPageHtmlViaExtension.mockRejectedValue(new Error('not connected'))
      youtubeExtensionClient.isUltimateGuitarPageUrl.mockImplementation(function(url) {
        return String(url || '').indexOf('ultimate-guitar.com') >= 0
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

    test('prefers extension HTML for Ultimate Guitar URLs', async function() {
      youtubeExtensionClient.isYoutubeExtensionConnected.mockResolvedValue(true)
      youtubeExtensionClient.fetchPageHtmlViaExtension.mockResolvedValue({
        html: '<html>ug</html>',
        finalUrl: 'https://tabs.ultimate-guitar.com/tab/oasis/wonderwall-chords-27596',
        status: 200,
        via: 'extension',
      })
      mediaProxyClient.fetchViaMediaProxy.mockResolvedValue({
        ok: true,
        headers: { get: function() { return 'application/json' } },
        json: async function() {
          return {
            sheetLines: ['Em G', 'Today is gonna be the day'],
            source: 'tabs.ultimate-guitar.com',
            sourceUrl: 'https://tabs.ultimate-guitar.com/tab/oasis/wonderwall-chords-27596',
          }
        },
      })

      await searchChordsViaResolver({
        url: 'https://tabs.ultimate-guitar.com/tab/oasis/wonderwall-chords-27596',
      })

      expect(youtubeExtensionClient.fetchPageHtmlViaExtension).toHaveBeenCalled()
      const body = JSON.parse(mediaProxyClient.fetchViaMediaProxy.mock.calls[0][2].body)
      expect(body.pageHtml).toContain('ug')
    })
  })
})

test('normalizeChordsSearch skips unusable candidates in a multiple result', function() {
  const result = normalizeChordsSearch({
    multiple: true,
    candidates: [
      {
        sheetLines: ['D G Bm A', "I'm going to Graceland"],
        source: 'tabs.ultimate-guitar.com',
        sourceUrl: 'https://tabs.ultimate-guitar.com/tab/paul-simon/graceland-chords-1',
      },
      {
        // Bass/guitar tab only — no COW or ChordPro chords the client can use.
        sheetLines: [
          'Intro',
          'G-----------------------------------------------------------------------',
          'D-----------------------------------------------------------------------',
          'A-----------------------------------------------------------------------',
          'E---5--5/12--0-----5/12--0----------------------------------------------',
        ],
        source: 'azchords.com',
        sourceUrl: 'https://www.azchords.com/p/paulsimon-tabs-9369/graceland1-tabs-414923.html',
      },
      {
        sheetLines: ['[Em]Today is [G]gonna be the day'],
        source: 'example.com',
        sourceUrl: 'https://example.com/graceland',
      },
    ],
  })
  expect(result.multiple).toBe(true)
  expect(result.candidates).toHaveLength(2)
  expect(result.candidates[0].lyricLines[0]).toContain('[Em]')
  expect(result.candidates.map(function(c) { return c.source })).toEqual([
    'example.com',
    'tabs.ultimate-guitar.com',
  ])
})

test('normalizeChordsSearch throws when every multiple candidate is unusable', function() {
  expect(function() {
    normalizeChordsSearch({
      multiple: true,
      candidates: [{
        sheetLines: [
          'G-----------------------------------------------------------------------',
          'E---5--5/12--0----------------------------------------------------------',
        ],
        source: 'azchords.com',
      }],
    })
  }).toThrow('Chords search returned no candidates')
})
