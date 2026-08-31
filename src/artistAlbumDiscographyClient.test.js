import axios from 'axios'
import {
  albumTypeCategory,
  fetchArtistAlbumDiscography,
  fetchArtistAlbumTracks,
  filterAlbumsByTypeCategories,
} from './artistAlbumDiscographyClient'

jest.mock('axios')

describe('artistAlbumDiscographyClient', function() {
  beforeEach(function() {
    axios.get.mockReset()
  })

  test('albumTypeCategory maps release-group types', function() {
    expect(albumTypeCategory({ primaryType: 'Album', secondaryTypes: [] })).toBe('Album')
    expect(albumTypeCategory({ primaryType: 'Album', secondaryTypes: ['Compilation'] })).toBe('Compilation')
    expect(albumTypeCategory({ primaryType: 'EP', secondaryTypes: [] })).toBe('EP')
    expect(albumTypeCategory({ primaryType: 'Single', secondaryTypes: [] })).toBe('Single')
    expect(albumTypeCategory({ primaryType: 'Broadcast', secondaryTypes: [] })).toBe('Other')
  })

  test('filterAlbumsByTypeCategories keeps selected types', function() {
    const albums = [
      { title: 'Studio', primaryType: 'Album', secondaryTypes: [] },
      { title: 'Hits', primaryType: 'Album', secondaryTypes: ['Compilation'] },
      { title: 'A-side', primaryType: 'Single', secondaryTypes: [] },
    ]
    expect(filterAlbumsByTypeCategories(albums, ['Album']).map(function(a) { return a.title })).toEqual(['Studio'])
    expect(filterAlbumsByTypeCategories(albums, ['Compilation', 'Single']).map(function(a) {
      return a.title
    })).toEqual(['Hits', 'A-side'])
    expect(filterAlbumsByTypeCategories(albums, []).length).toBe(3)
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

  test('fetchArtistAlbumDiscography respects maxAlbums', async function() {
    const groups = []
    for (let i = 0; i < 5; i += 1) {
      groups.push({
        id: 'rg-' + i,
        title: 'Album ' + i,
        'first-release-date': '200' + i,
        'primary-type': 'Album',
        'artist-credit': [{ name: 'Artist' }],
      })
    }
    axios.get
      .mockResolvedValueOnce({
        data: { artists: [{ id: 'mbid-1', name: 'Artist' }] },
      })
      .mockResolvedValueOnce({
        data: {
          'release-group-count': 5,
          'release-groups': groups,
        },
      })

    const result = await fetchArtistAlbumDiscography('Artist', {
      pageDelayMs: 0,
      maxAlbums: 2,
    })
    expect(result.albums).toHaveLength(2)
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
