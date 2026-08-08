import axios from 'axios'
import {
  fetchArtistAlbumDiscography,
  fetchArtistAlbumTracks,
} from './artistAlbumDiscographyClient'

jest.mock('axios')

describe('artistAlbumDiscographyClient', function() {
  beforeEach(function() {
    axios.get.mockReset()
  })

  test('fetchArtistAlbumDiscography loads release groups for artist', async function() {
    axios.get
      .mockResolvedValueOnce({
        data: {
          artists: [{ id: 'mbid-1', name: 'Altan' }],
        },
      })
      .mockResolvedValueOnce({
        data: {
          'release-group-count': 1,
          'release-groups': [{
            id: 'rg-1',
            title: 'The Gap',
            'first-release-date': '1994',
            'primary-type': 'Album',
            'artist-credit': [{ name: 'Altan' }],
          }],
        },
      })

    const result = await fetchArtistAlbumDiscography('Altan', { pageDelayMs: 0 })
    expect(result.artistMbid).toBe('mbid-1')
    expect(result.albums).toHaveLength(1)
    expect(result.albums[0].title).toBe('The Gap')
    expect(result.albums[0].year).toBe('1994')
  })

  test('fetchArtistAlbumTracks delegates to album discography client', async function() {
    axios.get
      .mockResolvedValueOnce({
        data: {
          releases: [{ id: 'rel-1', title: 'The Gap', status: 'Official', date: '1994' }],
        },
      })
      .mockResolvedValueOnce({
        data: {
          media: [{
            tracks: [{ title: 'Sally Gardens' }, { title: 'Drowsy Maggie' }],
          }],
        },
      })

    const result = await fetchArtistAlbumTracks({
      releaseGroupId: 'rg-1',
      title: 'The Gap',
      year: '1994',
    }, 'Altan', { pageDelayMs: 0 })

    expect(result.titles).toEqual(['Drowsy Maggie', 'Sally Gardens'])
    expect(result.albumName).toBe('The Gap')
  })
})
