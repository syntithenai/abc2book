jest.mock('./composerLookupUtils', function() {
  return {
    discoverComposerIfNeeded: jest.fn(),
  }
})
jest.mock('./artistsSearchClient', function() {
  return { searchArtists: jest.fn() }
})
jest.mock('./albumsSearchClient', function() {
  return { searchAlbumsForSong: jest.fn() }
})
jest.mock('./genreSearchClient', function() {
  return { searchGenreLight: jest.fn() }
})

import { discoverComposerIfNeeded } from './composerLookupUtils'
import { searchArtists } from './artistsSearchClient'
import { searchAlbumsForSong } from './albumsSearchClient'
import { searchGenreLight } from './genreSearchClient'
import { enrichTuneMetadataFromMusicBrainz } from './tuneMetadataEnhance'

describe('tuneMetadataEnhance', function() {
  beforeEach(function() {
    discoverComposerIfNeeded.mockReset()
    searchArtists.mockReset()
    searchAlbumsForSong.mockReset()
    searchGenreLight.mockReset()
  })

  test('skips filled fields', async function() {
    const tune = {
      name: 'Song',
      composer: 'Artist',
      artists: ['Artist'],
      albums: ['Album (1970)'],
      genres: ['Rock'],
    }
    const result = await enrichTuneMetadataFromMusicBrainz(tune, {
      title: 'Song',
      artist: 'Artist',
    })
    expect(result.applied).toEqual({})
    expect(discoverComposerIfNeeded).not.toHaveBeenCalled()
    expect(searchArtists).not.toHaveBeenCalled()
    expect(searchAlbumsForSong).not.toHaveBeenCalled()
    expect(searchGenreLight).not.toHaveBeenCalled()
  })

  test('fills empty composer, artists, albums, and genre', async function() {
    discoverComposerIfNeeded.mockResolvedValue('The Beatles')
    searchArtists.mockResolvedValue({
      multiple: true,
      candidates: [{ artist: 'The Beatles', confidence: 'high' }, { artist: 'Paul McCartney', confidence: 'medium' }],
      autoApply: [{ artist: 'The Beatles', confidence: 'high' }],
      suggestions: [{ artist: 'Paul McCartney', confidence: 'medium' }],
    })
    searchAlbumsForSong.mockResolvedValue({
      albums: ['Abbey Road (1969)'],
      autoApply: [
        { album: 'Abbey Road (1969)', confidence: 'high' },
        { album: 'Let It Be (1970)', confidence: 'high' },
      ],
      candidates: [
        { album: 'Abbey Road (1969)', confidence: 'high' },
        { album: 'Let It Be (1970)', confidence: 'high' },
        { album: 'Maybe Wrong (1980)', confidence: 'low' },
      ],
    })
    searchGenreLight.mockResolvedValue({
      genre: 'Rock',
      confidence: 'high',
      autoApply: [{ genre: 'Rock', confidence: 'high' }],
    })

    const tune = { name: 'Yesterday', composer: '', artists: [], albums: [], genres: [] }
    const result = await enrichTuneMetadataFromMusicBrainz(tune, {
      title: 'Yesterday',
      artist: '',
      onProgress: jest.fn(),
    })

    expect(tune.composer).toBe('The Beatles')
    expect(tune.artists).toEqual(['The Beatles'])
    expect(tune.albums).toEqual(['Abbey Road (1969)', 'Let It Be (1970)'])
    expect(tune.genres).toEqual(['Rock'])
    expect(result.applied.composer).toBe('The Beatles')
    expect(result.applied.albums).toEqual(['Abbey Road (1969)', 'Let It Be (1970)'])
    expect(searchAlbumsForSong).toHaveBeenCalledWith(
      'Yesterday',
      'The Beatles',
      expect.objectContaining({ performers: ['The Beatles'] })
    )
  })
})
