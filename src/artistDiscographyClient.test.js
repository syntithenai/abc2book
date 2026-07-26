/**
 * @jest-environment jsdom
 */
import axios from 'axios'
import {
  dedupeDiscographyTitles,
  discographyTitlesMatch,
  fetchArtistDiscography,
  resolveArtistMbid,
} from './artistDiscographyClient'

jest.mock('axios')

describe('artistDiscographyClient', function() {
  beforeEach(function() {
    axios.get.mockReset()
  })

  test('dedupeDiscographyTitles keeps one entry per normalized title and sorts', function() {
    expect(dedupeDiscographyTitles([
      'Yesterday',
      'yesterday',
      'Let It Be',
      'Yesterday',
    ])).toEqual(['Let It Be', 'Yesterday'])
  })

  test('dedupeDiscographyTitles collapses live versions and minor spelling variants', function() {
    expect(dedupeDiscographyTitles([
      'Log Cabin Fever',
      'Log Cabin Fever (Live From The Capitol Theatre Sydney, July 1982)',
      'Hermit McDermit',
      'Hermit McDermitt',
      'Hard Act to Follow',
      'Hard Act To Follow (Live From Logan Campbell Centre Auckland, December 1984)',
    ])).toEqual([
      'Hard Act to Follow',
      'Hermit McDermit',
      'Log Cabin Fever',
    ])
  })

  test('discographyTitlesMatch treats live suffix and one-letter typos as duplicates', function() {
    expect(discographyTitlesMatch(
      'Log Cabin Fever',
      'Log Cabin Fever (Live From The Capitol Theatre Sydney, July 1982)'
    )).toBe(true)
    expect(discographyTitlesMatch('Hermit McDermit', 'Hermit McDermitt')).toBe(true)
    expect(discographyTitlesMatch('Song A', 'Completely Different')).toBe(false)
  })

  test('resolveArtistMbid prefers exact name match', async function() {
    axios.get.mockResolvedValueOnce({
      data: {
        artists: [
          { id: 'other', name: 'Beatles Tribute' },
          { id: 'real', name: 'The Beatles' },
        ],
      },
    })

    const result = await resolveArtistMbid('The Beatles')
    expect(result).toEqual({ id: 'real', name: 'The Beatles' })
  })

  test('resolveArtistMbid returns null when no artists found', async function() {
    axios.get.mockResolvedValueOnce({ data: { artists: [] } })
    const result = await resolveArtistMbid('Nobody')
    expect(result).toBeNull()
  })

  test('fetchArtistDiscography merges recordings and works with dedupe and pagination', async function() {
    axios.get.mockImplementation(function(url, config) {
      const params = (config && config.params) || {}
      if (String(url).endsWith('/artist')) {
        return Promise.resolve({
          data: { artists: [{ id: 'mbid-1', name: 'Artist One' }] },
        })
      }
      if (String(url).endsWith('/recording')) {
        if (params.offset === 0) {
          return Promise.resolve({
            data: {
              'recording-count': 150,
              recordings: [
                { title: 'Song A' },
                { title: 'Song B' },
              ],
            },
          })
        }
        return Promise.resolve({
          data: {
            'recording-count': 150,
            recordings: [{ title: 'Song C' }],
          },
        })
      }
      if (String(url).endsWith('/work')) {
        return Promise.resolve({
          data: {
            'work-count': 2,
            works: [
              { title: 'Song B' },
              { title: 'Song D' },
            ],
          },
        })
      }
      return Promise.resolve({ data: {} })
    })

    const result = await fetchArtistDiscography('Artist One', {
      pageDelayMs: 0,
      pageSize: 2,
    })
    expect(result.artistMbid).toBe('mbid-1')
    expect(result.artistName).toBe('Artist One')
    expect(result.titles).toEqual(['Song A', 'Song B', 'Song C', 'Song D'])
  })

  test('fetchArtistDiscography emits progress events', async function() {
    const progress = []
    axios.get.mockImplementation(function(url) {
      if (String(url).endsWith('/artist')) {
        return Promise.resolve({
          data: { artists: [{ id: 'mbid-1', name: 'Artist One' }] },
        })
      }
      if (String(url).endsWith('/recording')) {
        return Promise.resolve({
          data: {
            'recording-count': 1,
            recordings: [{ title: 'Song A' }],
          },
        })
      }
      if (String(url).endsWith('/work')) {
        return Promise.resolve({
          data: {
            'work-count': 0,
            works: [],
          },
        })
      }
      return Promise.resolve({ data: {} })
    })

    await fetchArtistDiscography('Artist One', {
      pageDelayMs: 0,
      onProgress: function(message) {
        progress.push(message)
      },
    })
    expect(progress.length).toBeGreaterThan(1)
    expect(progress[0]).toMatch(/Looking up artist/i)
    expect(progress[progress.length - 1]).toMatch(/Found 1 song/i)
  })

  test('fetchArtistDiscography returns empty titles when artist is not found', async function() {
    axios.get.mockResolvedValueOnce({ data: { artists: [] } })
    const result = await fetchArtistDiscography('Missing Artist', { pageDelayMs: 0 })
    expect(result.titles).toEqual([])
    expect(result.artistMbid).toBe('')
  })
})
