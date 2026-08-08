import { pruneDeletedTunesFromPlaylists } from './playlistTunePrune'
import { createQueue } from './nowPlayingQueue'
import { savePlaylistFromQueue, getSavedPlaylist } from './savedPlaylistsStore'

describe('playlistTunePrune', function() {
  beforeEach(function() {
    localStorage.clear()
  })

  test('pruneDeletedTunesFromPlaylists updates active queue and saved playlists', function() {
    const queue = createQueue({ tuneIds: ['a', 'b', 'c'], currentIndex: 2 })
    const saved = savePlaylistFromQueue(createQueue({ tuneIds: ['a', 'b'], name: 'Saved' }))
    const setNowPlayingQueue = jest.fn()

    pruneDeletedTunesFromPlaylists(['b', 'missing'], queue, setNowPlayingQueue)

    expect(setNowPlayingQueue).toHaveBeenCalledTimes(1)
    const nextQueue = setNowPlayingQueue.mock.calls[0][0]
    expect(nextQueue.items.map(function(item) { return item.tuneId })).toEqual(['a', 'c'])
    expect(nextQueue.currentIndex).toBe(1)
    expect(getSavedPlaylist(saved.id).items).toEqual([{ tuneId: 'a' }])
  })
})
