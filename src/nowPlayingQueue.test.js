import {
  createQueue,
  isQueueActive,
  getCurrentTuneId,
  advanceQueue,
  setFollowTune,
  setLoop,
  setShuffle,
  cycleRepeatMode,
  getRepeatMode,
  buildShuffleOrder,
  setQueueIndex,
  resolvePlaybackForItem,
  shouldSuppressFollowNavigate,
  startPreviewOnce,
  endPreviewOnce,
  getQueuePositionLabel,
  suspendQueue,
  resumeQueue,
  removeQueueItem,
  removeTunesFromQueue,
  loadActiveQueue,
  persistActiveQueue,
  findQueueIndexForTuneId,
  createLessonQueueFromItems,
  appendMediaCandidateToQueue,
  insertMediaCandidateAfterCurrentInQueue,
  isExternalQueueItem,
  isLessonQueue,
  getQueueItemLabel,
} from './nowPlayingQueue'

describe('nowPlayingQueue', function() {
  const tunebook = {
    hasNotesOrChords: function(t) { return !!(t && t.notes) },
    hasLinks: function(t) { return !!(t && t.links && t.links.length) },
  }

  test('findQueueIndexForTuneId matches string ids', function() {
    const q = createQueue({ tuneIds: ['a', 'b', 'c'] })
    expect(findQueueIndexForTuneId(q, 'b')).toBe(1)
    expect(findQueueIndexForTuneId(q, 'missing')).toBe(-1)
  })

  test('createQueue and getCurrentTuneId', function() {
    const q = createQueue({ tuneIds: ['a', 'b', 'c'], name: 'Test' })
    expect(isQueueActive(q)).toBe(true)
    expect(getCurrentTuneId(q)).toBe('a')
    expect(getQueuePositionLabel(q)).toBe('1/3')
    expect(q.followTune).toBe(false)
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

  test('advanceQueue wraps on manual navigation when repeat off', function() {
    const q = createQueue({ tuneIds: ['a', 'b'], currentIndex: 1 })
    const next = advanceQueue(q, 1, { wrap: true })
    expect(next.atEdge).toBe(false)
    expect(next.queue.currentIndex).toBe(0)
    const back = advanceQueue(createQueue({ tuneIds: ['a', 'b'], currentIndex: 0 }), -1, { wrap: true })
    expect(back.atEdge).toBe(false)
    expect(back.queue.currentIndex).toBe(1)
  })

  test('setLoop toggles repeat flag', function() {
    const q = createQueue({ tuneIds: ['a', 'b'] })
    expect(setLoop(q, true).loop).toBe(true)
    expect(getRepeatMode(setLoop(q, true))).toBe('playlist')
    expect(setLoop(q, false).loop).toBe(false)
    expect(getRepeatMode(setLoop(q, false))).toBe('off')
  })

  test('cycleRepeatMode advances off, playlist, track', function() {
    const q = createQueue({ tuneIds: ['a', 'b'] })
    const playlist = cycleRepeatMode(q)
    expect(getRepeatMode(playlist)).toBe('playlist')
    expect(playlist.loop).toBe(true)
    const track = cycleRepeatMode(playlist)
    expect(getRepeatMode(track)).toBe('track')
    expect(track.repeatTrack).toBe(true)
    expect(track.loop).toBe(false)
    const off = cycleRepeatMode(track)
    expect(getRepeatMode(off)).toBe('off')
  })

  test('setShuffle builds order with current tune first', function() {
    const q = createQueue({ tuneIds: ['a', 'b', 'c', 'd'], currentIndex: 2 })
    const shuffled = setShuffle(q, true)
    expect(shuffled.shuffle).toBe(true)
    expect(shuffled.shuffleOrder).toHaveLength(4)
    expect(shuffled.shuffleOrder[0]).toBe(2)
    expect(setShuffle(shuffled, false).shuffle).toBe(false)
    expect(setShuffle(shuffled, false).shuffleOrder).toBeNull()
  })

  test('advanceQueue with shuffle follows shuffle order', function() {
    const q = Object.assign(createQueue({
      tuneIds: ['a', 'b', 'c', 'd'],
      currentIndex: 0,
      shuffle: true,
    }), { shuffleOrder: [0, 2, 1, 3] })
    const next = advanceQueue(q, 1)
    expect(next.queue.currentIndex).toBe(2)
    expect(next.atEdge).toBe(false)
    const back = advanceQueue(next.queue, -1)
    expect(back.queue.currentIndex).toBe(0)
  })

  test('buildShuffleOrder keeps start index first', function() {
    const order = buildShuffleOrder(5, 3)
    expect(order).toHaveLength(5)
    expect(order[0]).toBe(3)
    expect(new Set(order).size).toBe(5)
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

  test('resolvePlaybackForItem prefers midi when first link is a recording', function() {
    const tune = {
      id: '1',
      notes: true,
      links: [{ link: 'recording:r1', recordingId: 'r1' }],
    }
    expect(resolvePlaybackForItem(tune, { tuneId: '1', prefer: 'auto' }, tunebook)).toEqual({
      type: 'midi',
      linkNum: null,
    })
  })

  test('resolvePlaybackForItem midi only', function() {
    const tune = { id: '1', notes: true }
    expect(resolvePlaybackForItem(tune, { tuneId: '1', prefer: 'midi' }, tunebook)).toEqual({
      type: 'midi',
      linkNum: null,
    })
  })

  test('shouldSuppressFollowNavigate in editor, scratchpad, and gig', function() {
    expect(shouldSuppressFollowNavigate({ pathname: '/editor/abc' })).toBe(true)
    expect(shouldSuppressFollowNavigate({ pathname: '/scratchpad/item-1' })).toBe(true)
    expect(shouldSuppressFollowNavigate({ pathname: '/gig/set-1' })).toBe(true)
    expect(shouldSuppressFollowNavigate({ pathname: '/lessons/foo' })).toBe(true)
    expect(shouldSuppressFollowNavigate({ pathname: '/tunes/abc' })).toBe(false)
    expect(shouldSuppressFollowNavigate({
      pathname: '/tunes/abc',
      setPlaylist: { tunes: [{ id: 'x' }] },
    })).toBe(true)
  })

  test('resolvePlaybackForItem external branch', function() {
    const item = {
      tuneId: null,
      prefer: 'external',
      externalMedia: { youtubeId: 'abc123XYZ12', title: 'Demo' },
    }
    expect(resolvePlaybackForItem(null, item, tunebook)).toEqual({
      type: 'external',
      youtubeId: 'abc123XYZ12',
    })
    expect(isExternalQueueItem(item)).toBe(true)
  })

  test('createLessonQueueFromItems sets lesson source', function() {
    const queue = createLessonQueueFromItems({
      lessonId: 'lesson-1',
      name: 'Lesson',
      items: [{ externalMedia: { youtubeId: 'abc123XYZ12', title: 'A' } }],
    })
    expect(isLessonQueue(queue)).toBe(true)
    expect(getQueueItemLabel(queue.items[0], {})).toContain('A')
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

  test('removeTunesFromQueue removes multiple tunes and adjusts currentIndex', function() {
    const q = createQueue({ tuneIds: ['a', 'b', 'c', 'd'], currentIndex: 3 })
    const next = removeTunesFromQueue(q, ['b', 'd'])
    expect(next.items.map(function(item) { return item.tuneId })).toEqual(['a', 'c'])
    expect(next.currentIndex).toBe(1)
  })

  test('removeTunesFromQueue returns null when queue becomes empty', function() {
    const q = createQueue({ tuneIds: ['a', 'b'] })
    expect(removeTunesFromQueue(q, ['a', 'b'])).toBeNull()
  })

  test('removeTunesFromQueue is a no-op when ids are not in queue', function() {
    const q = createQueue({ tuneIds: ['a', 'b'] })
    expect(removeTunesFromQueue(q, ['missing'])).toBe(q)
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

  test('appendMediaCandidateToQueue stores Internet Archive media as mediaLink', function() {
    const candidate = {
      source: 'internet-archive',
      title: 'Archive Song',
      artist: 'Old Timer',
      link: 'https://archive.org/details/foo',
    }
    const q = appendMediaCandidateToQueue(null, candidate)
    expect(isQueueActive(q)).toBe(true)
    expect(q.items).toHaveLength(1)
    expect(isExternalQueueItem(q.items[0])).toBe(true)
    expect(q.items[0].externalMedia.mediaLink).toBe('https://archive.org/details/foo')
    expect(q.items[0].externalMedia.collectionLink).toBeUndefined()
    expect(getQueueItemLabel(q.items[0], {})).toBe('Archive Song — Old Timer')
  })

  test('appendMediaCandidateToQueue stores standalone media', function() {
    const candidate = {
      source: 'device-file',
      title: 'Phone Song',
      artist: 'Local Artist',
      uri: 'content://media/1',
    }
    const q = appendMediaCandidateToQueue(null, candidate)
    expect(isQueueActive(q)).toBe(true)
    expect(q.items).toHaveLength(1)
    expect(isExternalQueueItem(q.items[0])).toBe(true)
    expect(getQueueItemLabel(q.items[0], {})).toBe('Phone Song — Local Artist')
  })

  test('insertMediaCandidateAfterCurrentInQueue inserts after current index', function() {
    const base = createQueue({ tuneIds: ['a', 'b'], currentIndex: 0 })
    const candidate = {
      source: 'music-collection',
      title: 'Library Song',
      link: '/music-collection/a.mp3',
      path: 'a.mp3',
    }
    const next = insertMediaCandidateAfterCurrentInQueue(base, candidate)
    expect(next.items).toHaveLength(3)
    expect(next.items[1].externalMedia.title).toBe('Library Song')
  })
})
