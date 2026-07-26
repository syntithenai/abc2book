/**
 * @jest-environment jsdom
 */
import axios from 'axios'
import {
  fetchAlbumDiscography,
  fetchAlbumTracks,
  searchAlbumsByName,
} from './albumDiscographyClient'
import { scoreAlbumTitleMatch } from './bibliographicSearchUtils'

jest.mock('axios')

describe('bibliographicSearchUtils scoreAlbumTitleMatch', function() {
  test('matches with or without leading article', function() {
    expect(scoreAlbumTitleMatch('The Dark Side of the Moon', 'Dark Side of the Moon')).toBe(100)
    expect(scoreAlbumTitleMatch('Abbey Road', 'Abbey Rd')).toBe(0)
  })
})

describe('albumDiscographyClient', function() {
  beforeEach(function() {
    axios.get.mockReset()
  })

  test('fetchAlbumDiscography returns deduped track titles for a release', async function() {
    axios.get
      .mockResolvedValueOnce({
        data: {
          artists: [{ id: 'artist-1', name: 'The Beatles' }],
        },
      })
      .mockResolvedValueOnce({
        data: {
          'release-groups': [{
            id: 'rg-abbey',
            title: 'Abbey Road',
            score: 100,
            'primary-type': 'Album',
            'first-release-date': '1969-09-26',
            'artist-credit': [{ name: 'The Beatles' }],
          }],
        },
      })
      .mockResolvedValueOnce({
        data: {
          releases: [{
            id: 'release-1',
            title: 'Abbey Road',
            status: 'Official',
            date: '1969-09-26',
            'release-group': { 'primary-type': 'Album', title: 'Abbey Road' },
          }],
        },
      })
      .mockResolvedValueOnce({
        data: {
          media: [{
            tracks: [
              { title: 'Come Together' },
              { title: 'Something' },
              { title: 'Come Together' },
            ],
          }],
        },
      })

    const result = await fetchAlbumDiscography('Abbey Road', 'The Beatles')
    expect(result.albumName).toBe('Abbey Road')
    expect(result.artistName).toBe('The Beatles')
    expect(result.titles).toEqual(['Come Together', 'Something'])
    expect(result.needsPicker).toBe(false)
  })

  test('searchAlbumsByName auto-picks famous album without artist hint', async function() {
    axios.get
      .mockResolvedValueOnce({
        data: {
          'release-groups': [{
            id: 'rg-dsotm',
            title: 'The Dark Side of the Moon',
            score: 100,
            'primary-type': 'Album',
            'first-release-date': '1973-03-01',
            'artist-credit': [{ name: 'Pink Floyd' }],
          }],
        },
      })

    const result = await searchAlbumsByName('Dark Side of the Moon', '')
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0].artistName).toBe('Pink Floyd')
    expect(result.candidates[0].confidence).toBe('high')
    expect(result.autoPick).toBeTruthy()
    expect(result.needsPicker).toBe(false)
  })

  test('searchAlbumsByName returns picker when multiple close matches', async function() {
    axios.get.mockResolvedValueOnce({
      data: {
        'release-groups': [
          {
            id: 'rg-1',
            title: 'Greatest Hits',
            score: 95,
            'primary-type': 'Album',
            'first-release-date': '1980',
            'artist-credit': [{ name: 'Artist A' }],
          },
          {
            id: 'rg-2',
            title: 'Greatest Hits',
            score: 94,
            'primary-type': 'Album',
            'first-release-date': '1990',
            'artist-credit': [{ name: 'Artist B' }],
          },
        ],
      },
    })

    const result = await searchAlbumsByName('Greatest Hits', '')
    expect(result.candidates.length).toBeGreaterThan(1)
    expect(result.needsPicker).toBe(true)
    expect(result.autoPick).toBeNull()
  })

  test('fetchAlbumDiscography returns needsPicker for ambiguous matches', async function() {
    axios.get.mockResolvedValueOnce({
      data: {
        'release-groups': [
          {
            id: 'rg-1',
            title: 'Greatest Hits',
            score: 95,
            'primary-type': 'Album',
            'first-release-date': '1980',
            'artist-credit': [{ name: 'Artist A' }],
          },
          {
            id: 'rg-2',
            title: 'Greatest Hits',
            score: 94,
            'primary-type': 'Album',
            'first-release-date': '1990',
            'artist-credit': [{ name: 'Artist B' }],
          },
        ],
      },
    })

    const result = await fetchAlbumDiscography('Greatest Hits', '')
    expect(result.needsPicker).toBe(true)
    expect(result.candidates).toHaveLength(2)
    expect(result.titles).toEqual([])
  })

  test('fetchAlbumTracks loads tracks for a chosen candidate', async function() {
    axios.get
      .mockResolvedValueOnce({
        data: {
          releases: [{
            id: 'release-1',
            title: 'Abbey Road',
            status: 'Official',
            date: '1969-09-26',
            'release-group': { 'primary-type': 'Album', title: 'Abbey Road' },
          }],
        },
      })
      .mockResolvedValueOnce({
        data: {
          media: [{ tracks: [{ title: 'Here Comes the Sun' }] }],
        },
      })

    const result = await fetchAlbumTracks({
      releaseGroupId: 'rg-abbey',
      albumName: 'Abbey Road',
      artistName: 'The Beatles',
    }, 'Abbey Road')
    expect(result.titles).toEqual(['Here Comes the Sun'])
  })

  test('fetchAlbumDiscography returns empty list when album not found', async function() {
    axios.get
      .mockResolvedValueOnce({ data: { artists: [{ id: 'artist-1', name: 'Artist' }] } })
      .mockResolvedValueOnce({ data: { 'release-groups': [] } })

    const result = await fetchAlbumDiscography('Missing Album', 'Artist')
    expect(result.titles).toEqual([])
  })
})
