import { searchChordsLight, CHORDS_LIGHT_ERROR } from './chordsSearchLight'
import * as localAbcCollectionSearch from './localAbcCollectionSearch'
import * as textSearchIndexUtils from './textSearchIndexUtils'

jest.mock('./localAbcCollectionSearch', function() {
  return {
    loadTextSearchIndexFromResource: jest.fn(function() {
      return Promise.resolve({ tokens: { test: ['0-1-0'] }, lookups: { '0-1-0': 'Test Reel' } })
    }),
    searchLocalCollection: jest.fn(function() { return [] }),
    searchLocalCollectionChords: jest.fn(function() { return Promise.resolve([]) }),
  }
})

describe('searchChordsLight', function() {
  beforeEach(function() {
    localAbcCollectionSearch.loadTextSearchIndexFromResource.mockReset()
    localAbcCollectionSearch.loadTextSearchIndexFromResource.mockResolvedValue({
      tokens: { test: ['0-1-0'] },
      lookups: { '0-1-0': 'Test Reel' },
    })
    localAbcCollectionSearch.searchLocalCollection.mockReset()
    localAbcCollectionSearch.searchLocalCollection.mockReturnValue([])
    localAbcCollectionSearch.searchLocalCollectionChords.mockReset()
    localAbcCollectionSearch.searchLocalCollectionChords.mockResolvedValue([])
    jest.spyOn(textSearchIndexUtils, 'isStrongLocalMatch').mockReturnValue(false)
  })

  afterEach(function() {
    textSearchIndexUtils.isStrongLocalMatch.mockRestore()
  })

  test('requires abcTools and renderChords for local chord search', async function() {
    await expect(searchChordsLight({ title: 'Test Reel' }))
      .rejects.toThrow(CHORDS_LIGHT_ERROR)
    await expect(searchChordsLight({ title: 'Test Reel', abcTools: {} }))
      .rejects.toThrow(CHORDS_LIGHT_ERROR)
  })

  test('returns local chord candidate when collection match has embedded chords', async function() {
    const candidate = {
      sheetLines: ['Am E Am E'],
      chordText: 'Am E Am E|',
      lyricLines: [],
      lyricText: '',
      title: 'Test Reel',
      artist: '',
      source: 'The Session',
      sourceUrl: '',
      preview: 'Am E Am E|',
    }
    localAbcCollectionSearch.searchLocalCollectionChords.mockResolvedValue([candidate])

    const result = await searchChordsLight({
      title: 'Test Reel',
      abcTools: {},
      renderChords: function() { return 'Am E Am E|' },
    })

    expect(result.multiple).toBe(false)
    expect(result.chordText).toContain('Am')
    expect(result.source).toBe('The Session')
  })

  test('ignores wrong-artist local ABC when a specific artist is requested', async function() {
    localAbcCollectionSearch.searchLocalCollectionChords.mockResolvedValue([{
      sheetLines: ['D G Bm A'],
      chordText: 'D G Bm A|',
      lyricLines: [],
      lyricText: '',
      title: 'Gumboots',
      artist: 'John Clarke, alias Fred Dagg',
      source: 'FolkTuneFinder',
      sourceUrl: '',
      preview: 'D G Bm A|',
    }])

    await expect(searchChordsLight({
      title: 'Gumboots',
      artist: 'Paul Simon',
      abcTools: {},
      renderChords: function() { return 'D G Bm A|' },
    })).rejects.toThrow(CHORDS_LIGHT_ERROR)
  })

  test('throws when no local chord matches exist', async function() {
    await expect(searchChordsLight({
      title: 'Obscure Song',
      abcTools: {},
      renderChords: function() { return '' },
    })).rejects.toThrow(CHORDS_LIGHT_ERROR)
  })

  test('skipColdIndexLoad misses fast when index loader returns empty', async function() {
    localAbcCollectionSearch.loadTextSearchIndexFromResource.mockResolvedValue({})
    await expect(searchChordsLight({
      title: 'Under African Skies',
      artist: 'Paul Simon',
      abcTools: {},
      renderChords: function() { return '' },
      skipColdIndexLoad: true,
    })).rejects.toThrow(CHORDS_LIGHT_ERROR)
    expect(localAbcCollectionSearch.loadTextSearchIndexFromResource).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ skipColdLoad: true })
    )
  })
})
