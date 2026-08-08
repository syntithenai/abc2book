import { groupCollectionEntriesByAlbum, loadArtistMediaAlbums } from './artistDiscographyCatalog'
import { browseMusicCollection } from './musicCollectionCuratorClient'

jest.mock('./musicCollectionCuratorClient', function() {
  return {
    browseMusicCollection: jest.fn(),
  }
})

describe('artistDiscographyCatalog', function() {
  beforeEach(function() {
    browseMusicCollection.mockReset()
  })

  test('groupCollectionEntriesByAlbum groups tracks by album', function() {
    const albums = groupCollectionEntriesByAlbum([
      { id: '1', title: 'Track A', artist: 'Altan', album: 'The Gap', year: '1994', path: 'a.mp3' },
      { id: '2', title: 'Track B', artist: 'Altan', album: 'The Gap', path: 'b.mp3' },
      { id: '3', title: 'Other', artist: 'Altan', album: 'Another', path: 'c.mp3' },
    ])
    expect(albums).toHaveLength(2)
    expect(albums[0].title).toBe('The Gap')
    expect(albums[0].tracks).toHaveLength(2)
    expect(albums[1].title).toBe('Another')
  })

  test('groupCollectionEntriesByAlbum dedupes duplicate tracks within an album', function() {
    const albums = groupCollectionEntriesByAlbum([
      { id: '1', title: 'Enter Sandman', artist: 'Metallica', album: 'Black Album', path: 'Metallica/black/enter.mp3' },
      { id: '2', title: 'Enter Sandman (Live)', artist: 'Metallica', album: 'Black Album', path: 'Metallica/black/enter-live.mp3' },
      { id: '3', title: 'Nothing Else Matters', artist: 'Metallica', album: 'Black Album', path: 'Metallica/black/nem.mp3' },
    ])
    expect(albums).toHaveLength(1)
    expect(albums[0].tracks).toHaveLength(2)
  })

  test('loadArtistMediaAlbums filters entries to matching artist', async function() {
    browseMusicCollection.mockResolvedValue({
      entries: [
        { id: '1', title: 'Mine', artist: 'Altan', album: 'The Gap', path: 'mine.mp3' },
        { id: '2', title: 'Wrong', artist: 'Other Band', album: 'Mine', path: 'wrong.mp3' },
      ],
    })
    const result = await loadArtistMediaAlbums('Altan', { accessToken: 'token' })
    expect(result.albums).toHaveLength(1)
    expect(result.albums[0].title).toBe('The Gap')
    expect(result.albums[0].tracks).toHaveLength(1)
    expect(result.albums[0].tracks[0].title).toBe('Mine')
  })

  test('loadArtistMediaAlbums dedupes duplicate collection files', async function() {
    browseMusicCollection.mockResolvedValue({
      entries: [
        { id: '1', title: 'Song', artist: 'Metallica', album: 'Album A', path: 'Metallica/song.mp3' },
        { id: '2', title: 'Song', artist: 'Metallica', album: 'Album B', path: 'Metallica/song.mp3' },
      ],
    })
    const result = await loadArtistMediaAlbums('Metallica', { accessToken: 'token' })
    const trackCount = result.albums.reduce(function(sum, album) {
      return sum + album.tracks.length
    }, 0)
    expect(trackCount).toBe(1)
  })

  test('loadArtistMediaAlbums dedupes same artist/title on different paths', async function() {
    browseMusicCollection.mockResolvedValue({
      entries: [
        { id: '1', title: 'Enter Sandman', artist: 'Metallica', album: 'Black Album', path: 'Metallica/black/enter.mp3' },
        { id: '2', title: 'Enter Sandman (Live)', artist: 'Metallica', album: 'Live', path: 'Metallica/live/enter.mp3' },
      ],
    })
    const result = await loadArtistMediaAlbums('Metallica', { accessToken: 'token' })
    const trackCount = result.albums.reduce(function(sum, album) {
      return sum + album.tracks.length
    }, 0)
    expect(trackCount).toBe(1)
  })

  test('dedupeMediaSearchCandidates folds diacritics and capitalization', function() {
    const { dedupeMediaSearchCandidates } = require('./artistDiscographyCatalog')
    const deduped = dedupeMediaSearchCandidates([
      { source: 'music-collection', id: '1', title: 'Après un rêve', artist: 'Fauré', path: 'faure/apres.mp3' },
      { source: 'music-collection', id: '2', title: 'APRES UN REVE', artist: 'faure', path: 'faure/apres-alt.mp3' },
    ])
    expect(deduped).toHaveLength(1)
  })
})
