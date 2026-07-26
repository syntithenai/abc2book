jest.mock('axios', function() {
  return { get: jest.fn() }
})

jest.mock('./artistDiscographyClient', function() {
  return {
    resolveArtistMbid: jest.fn(),
  }
})

import axios from 'axios'
import { resolveArtistMbid } from './artistDiscographyClient'
import { searchArtists } from './artistsSearchClient'
import { BIBLIO_CONFIDENCE_HIGH, BIBLIO_CONFIDENCE_LOW } from './bibliographicSearchUtils'

function mockWorkWritersEmpty() {
  return { data: { works: [] } }
}

describe('artistsSearchClient', function() {
  beforeEach(function() {
    axios.get.mockReset()
    resolveArtistMbid.mockReset()
    resolveArtistMbid.mockResolvedValue({ id: 'artist-1', name: 'The Beatles' })
  })

  test('returns empty without title', async function() {
    const result = await searchArtists({ title: '' })
    expect(result.empty).toBe(true)
    expect(result.candidates).toEqual([])
    expect(axios.get).not.toHaveBeenCalled()
  })

  test('marks work writers as high confidence when prominent', async function() {
    axios.get
      .mockResolvedValueOnce({
        data: {
          works: [{
            id: 'work-1',
            title: 'Yesterday',
            score: 100,
            'recording-count': 500,
          }],
        },
      })
      .mockResolvedValueOnce({
        data: {
          relations: [{
            type: 'composer',
            artist: { name: 'Paul McCartney' },
          }],
        },
      })
      .mockResolvedValueOnce({ data: { recordings: [] } })

    const result = await searchArtists({
      title: 'Yesterday',
      artist: 'Paul McCartney',
    })
    expect(result.empty).toBe(false)
    const writers = (result.candidates || [result]).filter(function(candidate) {
      return candidate.role === 'writer'
    })
    expect(writers.length).toBeGreaterThan(0)
    expect(writers[0].confidence).toBe(BIBLIO_CONFIDENCE_HIGH)
    expect(writers[0].matchType).toBe('Work · writer')
  })

  test('uses scoped recording search before broad fallback', async function() {
    axios.get
      .mockResolvedValueOnce(mockWorkWritersEmpty())
      .mockResolvedValueOnce({
        data: {
          recordings: [{
            id: 'rec-1',
            title: 'Yesterday',
            'artist-credit': [{ name: 'The Beatles' }],
          }],
        },
      })

    const result = await searchArtists({
      title: 'Yesterday',
      artist: 'The Beatles',
    })
    expect(result.empty).toBe(false)
    const performers = (result.candidates || [result]).filter(function(candidate) {
      return candidate.role === 'performer'
    })
    expect(performers.some(function(candidate) {
      return candidate.artist === 'The Beatles' && candidate.confidence === BIBLIO_CONFIDENCE_HIGH
    })).toBe(true)
    const recordingCalls = axios.get.mock.calls.filter(function(call) {
      return String(call[0]).indexOf('/recording') >= 0
    })
    expect(recordingCalls.length).toBe(1)
    expect(recordingCalls[0][1].params.query).toContain('arid:artist-1')
  })

  test('broad fallback marks homonym performers as low confidence', async function() {
    resolveArtistMbid.mockResolvedValue(null)
    axios.get
      .mockResolvedValueOnce(mockWorkWritersEmpty())
      .mockResolvedValueOnce({
        data: {
          recordings: [{
            id: 'rec-1',
            title: 'Home',
            'artist-credit': [{ name: 'Someone Else' }],
          }],
        },
      })

    const result = await searchArtists({
      title: 'Home',
      artist: '',
    })
    expect(result.empty).toBe(false)
    const candidates = result.candidates || [result]
    expect(candidates.some(function(candidate) {
      return candidate.confidence === BIBLIO_CONFIDENCE_LOW
    })).toBe(true)
  })
})
