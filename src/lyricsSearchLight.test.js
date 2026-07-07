import { parsePlainLyricsText, isNoiseLine } from './lyricsParseUtils'
import {
  buildGoogleLyricsSearchUrl,
} from './components/LyricsSearchButton'
import { searchLyricsLight } from './lyricsSearchLight'
import * as localAbcCollectionSearch from './localAbcCollectionSearch'
import * as recordingArtistsClient from './recordingArtistsClient'
import * as lyricsOvhClient from './lyricsOvhClient'
import * as textSearchIndexUtils from './textSearchIndexUtils'

jest.mock('./localAbcCollectionSearch', function() {
  return {
    loadTextSearchIndexFromResource: jest.fn(function() {
      return Promise.resolve({ tokens: {} })
    }),
    searchLocalCollection: jest.fn(function() { return [] }),
    searchLocalCollectionLyrics: jest.fn(function() { return Promise.resolve([]) }),
  }
})

jest.mock('./recordingArtistsClient', function() {
  return {
    discoverRecordingArtists: jest.fn(function() { return Promise.resolve(['The Beatles']) }),
    isGenericArtist: jest.fn(function(artist) {
      return !String(artist || '').trim() || String(artist).toLowerCase() === 'traditional'
    }),
  }
})

jest.mock('./lyricsOvhClient', function() {
  return {
    searchLyricsOvhForArtists: jest.fn(function() { return Promise.resolve([]) }),
    fetchLyricsOvh: jest.fn(function() { return Promise.resolve(null) }),
  }
})

describe('lyricsParseUtils', function() {
  test('parsePlainLyricsText strips noise lines', function() {
    const text = 'Wild Rover\n\nContributors\nVerse one line'
    const parsed = parsePlainLyricsText(text)
    expect(parsed[1]).toContain('Wild Rover')
    expect(parsed[1]).toContain('Verse one line')
    expect(parsed[1].join('\n')).not.toMatch(/contributors/i)
  })

  test('isNoiseLine rejects contributor chrome', function() {
    expect(isNoiseLine('12 Contributors')).toBe(true)
    expect(isNoiseLine('Verse one')).toBe(false)
  })
})

describe('searchLyricsLight', function() {
  beforeEach(function() {
    localAbcCollectionSearch.searchLocalCollection.mockReset()
    localAbcCollectionSearch.searchLocalCollection.mockReturnValue([])
    localAbcCollectionSearch.searchLocalCollectionLyrics.mockReset()
    localAbcCollectionSearch.searchLocalCollectionLyrics.mockResolvedValue([])
    lyricsOvhClient.searchLyricsOvhForArtists.mockReset()
    lyricsOvhClient.searchLyricsOvhForArtists.mockResolvedValue([])
    jest.spyOn(textSearchIndexUtils, 'isStrongLocalMatch').mockReturnValue(false)
  })

  afterEach(function() {
    textSearchIndexUtils.isStrongLocalMatch.mockRestore()
  })

  test('requires a title', async function() {
    await expect(searchLyricsLight({ title: '' })).rejects.toThrow('Song title is required')
  })

  test('short-circuits on strong local match', async function() {
    const localCandidate = {
      text: 'Rare bog\nA rattlin bog',
      lines: ['Rare bog', 'A rattlin bog'],
      stanzas: [],
      title: 'Rattlin Bog',
      artist: '',
      source: 'Folkinfo',
    }
    localAbcCollectionSearch.searchLocalCollection.mockReturnValue([{ name: 'Rattlin Bog' }])
    localAbcCollectionSearch.searchLocalCollectionLyrics.mockResolvedValue([localCandidate])
    textSearchIndexUtils.isStrongLocalMatch.mockReturnValue(true)

    const result = await searchLyricsLight({
      title: 'Rattlin Bog',
      abcTools: {},
    })

    expect(lyricsOvhClient.searchLyricsOvhForArtists).not.toHaveBeenCalled()
    expect(result.multiple).toBe(false)
    expect(result.text).toContain('Rare bog')
  })

  test('queries lyrics.ovh when local match is not strong', async function() {
    lyricsOvhClient.searchLyricsOvhForArtists.mockResolvedValue([{
      text: 'Yesterday\nAll my troubles seemed so far away',
      lines: ['Yesterday', 'All my troubles seemed so far away'],
      stanzas: [],
      title: 'Yesterday',
      artist: 'The Beatles',
      source: 'lyrics.ovh',
      sourceUrl: 'https://api.lyrics.ovh/v1/The%20Beatles/Yesterday',
    }])

    const result = await searchLyricsLight({ title: 'Yesterday', artist: 'The Beatles' })

    expect(recordingArtistsClient.discoverRecordingArtists).not.toHaveBeenCalled()
    expect(result.text).toContain('Yesterday')
    expect(result.source).toBe('lyrics.ovh')
  })

  test('throws when no lyrics are found', async function() {
    await expect(searchLyricsLight({ title: 'Obscure Song XYZ' }))
      .rejects.toThrow('No lyrics found for this song')
  })
})

describe('LyricsSearchButton helpers', function() {
  test('buildGoogleLyricsSearchUrl includes title and artist', function() {
    expect(buildGoogleLyricsSearchUrl('Wild Rover', 'Dubliners', ''))
      .toContain('lyrics')
    expect(buildGoogleLyricsSearchUrl('Wild Rover', 'Dubliners', ''))
      .toContain('Wild Rover')
  })
})
