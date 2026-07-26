jest.mock('axios', function() {
  return {
    get: jest.fn(),
  }
})

import axios from 'axios'
import {
  fetchAlbumsForSong,
  isAmbiguousTitle,
  scoreRecordingTitleMatch,
  ALBUM_CONFIDENCE_HIGH,
  ALBUM_CONFIDENCE_LOW,
} from './songAlbumsClient'

jest.mock('./artistDiscographyClient', function() {
  return {
    resolveArtistMbid: jest.fn().mockResolvedValue({ id: 'artist-1', name: 'The Beatles' }),
  }
})

function mockWorkSearchEmpty() {
  return { data: { works: [] } }
}

describe('songAlbumsClient', function() {
  beforeEach(function() {
    axios.get.mockReset()
    const { resolveArtistMbid } = require('./artistDiscographyClient')
    resolveArtistMbid.mockReset()
    resolveArtistMbid.mockResolvedValue({ id: 'artist-1', name: 'The Beatles' })
  })

  test('returns empty albums without title', async function() {
    const result = await fetchAlbumsForSong('', 'Artist')
    expect(result.albums).toEqual([])
    expect(result.candidates).toEqual([])
    expect(axios.get).not.toHaveBeenCalled()
  })

  test('isAmbiguousTitle flags short or single-word titles', function() {
    expect(isAmbiguousTitle('Home')).toBe(true)
    expect(isAmbiguousTitle('Copper Kettle')).toBe(false)
  })

  test('scoreRecordingTitleMatch prefers exact titles', function() {
    expect(scoreRecordingTitleMatch({ title: 'Yesterday' }, 'Yesterday')).toBe(100)
    expect(scoreRecordingTitleMatch({ title: 'Yesterday (live)' }, 'Yesterday')).toBe(70)
  })

  test('collects deduped album titles with years from releases', async function() {
    axios.get
      .mockResolvedValueOnce(mockWorkSearchEmpty())
      .mockResolvedValueOnce({
        data: {
          recordings: [{
            id: 'rec-1',
            title: 'Yesterday',
            'artist-credit': [{ name: 'The Beatles' }],
          }],
        },
      })
      .mockResolvedValueOnce({
        data: {
          releases: [{
            id: 'rel-1',
            title: 'Help!',
            date: '1965-08-06',
            'release-group': { id: 'rg-help', title: 'Help!', 'first-release-date': '1965' },
          }, {
            id: 'rel-2',
            title: 'Help! (Remaster)',
            date: '2009',
            'release-group': { id: 'rg-help', title: 'Help!', 'first-release-date': '1965' },
          }],
        },
      })

    const result = await fetchAlbumsForSong('Yesterday', 'The Beatles')
    expect(result.albums).toEqual(['Help! (1965)'])
    expect(result.autoApply).toHaveLength(1)
    expect(result.autoApply[0].confidence).toBe(ALBUM_CONFIDENCE_HIGH)
  })

  test('uses performer-scoped search before broad title fallback', async function() {
    const { resolveArtistMbid } = require('./artistDiscographyClient')
    resolveArtistMbid
      .mockResolvedValueOnce({ id: 'composer-1', name: 'Albert Frank Beddoe' })
      .mockResolvedValueOnce({ id: 'performer-1', name: 'Joan Baez' })

    axios.get
      .mockResolvedValueOnce(mockWorkSearchEmpty())
      .mockResolvedValueOnce({ data: { recordings: [] } })
      .mockResolvedValueOnce({
        data: {
          recordings: [{ id: 'rec-cover', title: 'Copper Kettle', 'artist-credit': [{ name: 'Joan Baez' }] }],
        },
      })
      .mockResolvedValueOnce({
        data: {
          releases: [{
            id: 'rel-1',
            title: 'Joan Baez',
            date: '1960',
            'release-group': { id: 'rg-joan', title: 'Joan Baez', 'first-release-date': '1960' },
          }],
        },
      })

    const result = await fetchAlbumsForSong('Copper Kettle', 'Albert Frank Beddoe', {
      performers: ['Joan Baez'],
    })
    expect(result.albums).toEqual(['Joan Baez (1960)'])
    expect(result.autoApply[0].matchType).toBe('Performer match')

    const recordingQueries = axios.get.mock.calls
      .filter(function(call) { return call[0].indexOf('/recording') >= 0 && call[1].params.query })
      .map(function(call) { return call[1].params.query })
    expect(recordingQueries.some(function(query) { return query.indexOf('arid:composer-1') >= 0 })).toBe(true)
    expect(recordingQueries.some(function(query) { return query.indexOf('arid:performer-1') >= 0 })).toBe(true)
    expect(recordingQueries.some(function(query) { return query.indexOf('arid:') < 0 })).toBe(false)
  })

  test('broad title fallback returns low-confidence suggestions only', async function() {
    const { resolveArtistMbid } = require('./artistDiscographyClient')
    resolveArtistMbid.mockResolvedValue(null)

    axios.get
      .mockResolvedValueOnce(mockWorkSearchEmpty())
      .mockResolvedValueOnce({
        data: {
          recordings: [{ id: 'rec-other', title: 'Home', 'artist-credit': [{ name: 'Someone Else' }] }],
        },
      })
      .mockResolvedValueOnce({
        data: {
          releases: [{
            id: 'rel-1',
            title: 'Other Album',
            date: '2001',
            'release-group': { id: 'rg-other', title: 'Other Album', 'first-release-date': '2001' },
          }],
        },
      })

    const result = await fetchAlbumsForSong('Home', '')
    expect(result.autoApply).toEqual([])
    expect(result.suggestions).toHaveLength(1)
    expect(result.suggestions[0].confidence).toBe(ALBUM_CONFIDENCE_LOW)
  })
})
