/**
 * @jest-environment jsdom
 */
import axios from 'axios'
import { fetchAlbumDiscography } from './albumDiscographyClient'

jest.mock('axios')

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
          releases: [{
            id: 'release-1',
            title: 'Abbey Road',
            status: 'Official',
            date: '1969-09-26',
            'release-group': { 'primary-type': 'Album' },
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
  })

  test('fetchAlbumDiscography returns empty list when album not found', async function() {
    axios.get
      .mockResolvedValueOnce({ data: { artists: [{ id: 'artist-1', name: 'Artist' }] } })
      .mockResolvedValueOnce({ data: { releases: [] } })

    const result = await fetchAlbumDiscography('Missing Album', 'Artist')
    expect(result.titles).toEqual([])
  })
})
