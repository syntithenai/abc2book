import {
  createQueue,
  isQueueActive,
  getCurrentTuneId,
  advanceQueue,
  setFollowTune,
  setQueueIndex,
  resolvePlaybackForItem,
  shouldSuppressFollowNavigate,
  startPreviewOnce,
  endPreviewOnce,
  getQueuePositionLabel,
  suspendQueue,
  resumeQueue,
  removeQueueItem,
  loadActiveQueue,
  persistActiveQueue,
} from './nowPlayingQueue'

describe('nowPlayingQueue', function() {
  const tunebook = {
    hasNotesOrChords: function(t) { return !!(t && t.notes) },
    hasLinks: function(t) { return !!(t && t.links && t.links.length) },
  }

  test('createQueue and getCurrentTuneId', function() {
    const q = createQueue({ tuneIds: ['a', 'b', 'c'], name: 'Test' })
    expect(isQueueActive(q)).toBe(true)
    expect(getCurrentTuneId(q)).toBe('a')
    expect(getQueuePositionLabel(q)).toBe('1/3')
  })

  test('advanceQueue wraps with loop', function() {
    const q = createQueue({ tuneIds: ['a', 'b'], loop: true, currentIndex: 1 })
    const next = advanceQueue(q, 1)
    expect(next.queue.currentIndex).toBe(0)
    expect(next.atEdge).toBe(false)
  })

  test('advanceQueue stops at end without loop', function() {
    const q = createQueue({ tuneIds: ['a', 'b'], currentIndex: 1 })
    const next = advanceQueue(q, 1)
    expect(next.atEdge).toBe(true)
    expect(next.edge).toBe('end')
  })

  test('setFollowTune', function() {
    const q = createQueue({ tuneIds: ['a'] })
    const updated = setFollowTune(q, true)
    expect(updated.followTune).toBe(true)
  })

  test('resolvePlaybackForItem prefers media when links exist', function() {
    const tune = { id: '1', notes: true, links: [{ link: 'http://x' }] }
    expect(resolvePlaybackForItem(tune, { tuneId: '1', prefer: 'auto' }, tunebook)).toEqual({
      type: 'media',
      linkNum: 0,
    })
  })

  test('resolvePlaybackForItem midi only', function() {
    const tune = { id: '1', notes: true }
    expect(resolvePlaybackForItem(tune, { tuneId: '1', prefer: 'midi' }, tunebook)).toEqual({
      type: 'midi',
      linkNum: null,
    })
  })

  test('shouldSuppressFollowNavigate in editor and gig', function() {
    expect(shouldSuppressFollowNavigate({ pathname: '/editor/abc' })).toBe(true)
    expect(shouldSuppressFollowNavigate({ pathname: '/gig/set-1' })).toBe(true)
    expect(shouldSuppressFollowNavigate({ pathname: '/tunes/abc' })).toBe(false)
    expect(shouldSuppressFollowNavigate({
      pathname: '/tunes/abc',
      setPlaylist: { tunes: [{ id: 'x' }] },
    })).toBe(true)
  })

  test('preview once restores index', function() {
    const q = createQueue({ tuneIds: ['a', 'b', 'c'], currentIndex: 1 })
    const preview = startPreviewOnce(q, 'z')
    expect(preview.previewOnce.returnIndex).toBe(1)
    const restored = endPreviewOnce(preview)
    expect(restored.currentIndex).toBe(1)
    expect(restored.previewOnce).toBe(null)
  })

  test('setQueueIndex clamps', function() {
    const q = createQueue({ tuneIds: ['a', 'b'] })
    expect(setQueueIndex(q, 99).currentIndex).toBe(1)
    expect(setQueueIndex(q, -5).currentIndex).toBe(0)
  })

  test('suspendQueue stores playback resume in snapshot', function() {
    const q = createQueue({ tuneIds: ['a', 'b'] })
    const playbackResume = {
      tuneId: 'a',
      routeMode: 'media',
      linkIndex: 0,
      positionSeconds: 42,
      resumeMode: 'paused',
    }
    const suspended = suspendQueue(q, playbackResume)
    expect(suspended.queue.suspendSnapshot.playbackResume).toEqual(playbackResume)
    const restored = resumeQueue(suspended.queue)
    expect(restored.playbackResume).toEqual(playbackResume)
    expect(restored.suspendSnapshot).toBe(null)
  })

  test('removeQueueItem removes tune and adjusts currentIndex', function() {
    const q = createQueue({ tuneIds: ['a', 'b', 'c'], currentIndex: 2 })
    const next = removeQueueItem(q, 0)
    expect(next.items.map(function(item) { return item.tuneId })).toEqual(['b', 'c'])
    expect(next.currentIndex).toBe(1)
  })

  test('removeQueueItem clears queue when last item removed', function() {
    const q = createQueue({ tuneIds: ['a'] })
    expect(removeQueueItem(q, 0)).toBeNull()
  })

  test('persistActiveQueue survives reload', function() {
    localStorage.clear()
    const q = createQueue({ tuneIds: ['a', 'b'], name: 'Sticky', currentIndex: 1 })
    q.previewOnce = { tuneId: 'z', returnIndex: 1 }
    persistActiveQueue(q)
    const loaded = loadActiveQueue()
    expect(loaded.name).toBe('Sticky')
    expect(loaded.currentIndex).toBe(1)
    expect(loaded.items).toHaveLength(2)
    expect(loaded.previewOnce).toBeUndefined()
    persistActiveQueue(null)
    expect(loadActiveQueue()).toBeNull()
  })
})
