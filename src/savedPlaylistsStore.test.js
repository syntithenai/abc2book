import {
  listSavedPlaylists,
  getSavedPlaylist,
  savePlaylistFromQueue,
  appendTunesToPlaylist,
  deleteSavedPlaylist,
  queueFromSavedPlaylist,
} from './savedPlaylistsStore'
import { createQueue } from './nowPlayingQueue'

describe('savedPlaylistsStore', function() {
  beforeEach(function() {
    localStorage.clear()
  })

  test('save and list playlists', function() {
    const queue = createQueue({ tuneIds: ['a', 'b'], name: 'Morning set', followTune: true })
    const saved = savePlaylistFromQueue(queue)
    expect(saved).toBeTruthy()
    expect(saved.name).toBe('Morning set')
    expect(saved.items).toEqual([
      { tuneId: 'a' },
      { tuneId: 'b' },
    ])
    expect(saved.followTune).toBe(true)

    const listed = listSavedPlaylists()
    expect(listed).toHaveLength(1)
    expect(listed[0].id).toBe(saved.id)
    expect(getSavedPlaylist(saved.id).name).toBe('Morning set')
  })

  test('updates existing playlist when id is provided', function() {
    const queue = createQueue({ tuneIds: ['a'], name: 'V1' })
    const first = savePlaylistFromQueue(queue)
    const updatedQueue = createQueue({ tuneIds: ['a', 'b'], name: 'V2' })
    const second = savePlaylistFromQueue(updatedQueue, { id: first.id, name: 'V2' })
    expect(second.id).toBe(first.id)
    expect(listSavedPlaylists()).toHaveLength(1)
    expect(getSavedPlaylist(first.id).items).toEqual([
      { tuneId: 'a' },
      { tuneId: 'b' },
    ])
  })

  test('queueFromSavedPlaylist drops missing tunes', function() {
    const queue = createQueue({
      tuneIds: ['a', 'missing', 'b'],
      name: 'Partial',
      loop: true,
    })
    queue.items[0].prefer = 'midi'
    queue.items[0].linkIndex = 1
    const saved = savePlaylistFromQueue(queue)
    const active = queueFromSavedPlaylist(saved, {
      a: { id: 'a', name: 'A' },
      b: { id: 'b', name: 'B' },
    })
    expect(active).toBeTruthy()
    expect(active.name).toBe('Partial')
    expect(active.savedPlaylistId).toBe(saved.id)
    expect(active.loop).toBe(true)
    expect(active.items).toEqual([
      { tuneId: 'a', prefer: 'midi', linkIndex: 1 },
      { tuneId: 'b', prefer: 'auto' },
    ])
  })

  test('queueFromSavedPlaylist returns null when no tunes remain', function() {
    const queue = createQueue({ tuneIds: ['gone'], name: 'Empty' })
    const saved = savePlaylistFromQueue(queue)
    expect(queueFromSavedPlaylist(saved, {})).toBeNull()
  })

  test('appendTunesToPlaylist appends tune ids', function() {
    const queue = createQueue({ tuneIds: ['a'], name: 'Append me' })
    const saved = savePlaylistFromQueue(queue)
    const updated = appendTunesToPlaylist(saved.id, ['b', 'c'])
    expect(updated.items).toEqual([
      { tuneId: 'a' },
      { tuneId: 'b' },
      { tuneId: 'c' },
    ])
    expect(getSavedPlaylist(saved.id).items).toEqual(updated.items)
  })

  test('appendTunesToPlaylist returns null for missing playlist', function() {
    expect(appendTunesToPlaylist('missing', ['a'])).toBeNull()
  })

  test('deleteSavedPlaylist removes entry', function() {
    const queue = createQueue({ tuneIds: ['a'], name: 'Gone' })
    const saved = savePlaylistFromQueue(queue)
    deleteSavedPlaylist(saved.id)
    expect(listSavedPlaylists()).toHaveLength(0)
    expect(getSavedPlaylist(saved.id)).toBeNull()
  })

  test('savePlaylistFromQueue returns null for empty queue', function() {
    expect(savePlaylistFromQueue(null)).toBeNull()
    expect(savePlaylistFromQueue(createQueue({ tuneIds: [] }))).toBeNull()
  })
})
