/**
 * "Now Playing" queue — single source of truth for list-mode continuous playback.
 * Active queue is persisted in localStorage so it survives refresh and navigation.
 */

const ACTIVE_QUEUE_STORAGE_KEY = 'bookstorage_now_playing_queue'

export function createQueueId() {
  return 'queue-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9)
}

export function createQueue(options) {
  const opts = options || {}
  const tuneIds = Array.isArray(opts.tuneIds) ? opts.tuneIds.filter(Boolean) : []
  const items = tuneIds.map(function(tuneId) {
    return { tuneId: tuneId, prefer: 'auto' }
  })
  return {
    id: opts.id || createQueueId(),
    name: opts.name || 'Playlist',
    source: opts.source || 'manual',
    items: items,
    currentIndex: typeof opts.currentIndex === 'number' ? opts.currentIndex : 0,
    followTune: opts.followTune !== undefined ? !!opts.followTune : true,
    autoAdvance: opts.autoAdvance !== false,
    loop: !!opts.loop,
    suspendSnapshot: null,
    previewOnce: null,
  }
}

export function isQueueActive(queue) {
  return !!(queue && Array.isArray(queue.items) && queue.items.length > 0)
}

export function getCurrentItem(queue) {
  if (!isQueueActive(queue)) return null
  const idx = typeof queue.currentIndex === 'number' && queue.currentIndex >= 0
    ? queue.currentIndex
    : 0
  return queue.items[idx] || null
}

export function getCurrentTuneId(queue) {
  const item = getCurrentItem(queue)
  return item && item.tuneId ? item.tuneId : null
}

export function getQueuePositionLabel(queue) {
  if (!isQueueActive(queue)) return ''
  const idx = typeof queue.currentIndex === 'number' ? queue.currentIndex : 0
  return (idx + 1) + '/' + queue.items.length
}

export function advanceQueue(queue, direction) {
  const dir = direction >= 0 ? 1 : -1
  if (!isQueueActive(queue)) {
    return { queue: null, atEdge: true, edge: dir > 0 ? 'end' : 'start' }
  }
  const idx = typeof queue.currentIndex === 'number' ? queue.currentIndex : 0
  const nextIndex = idx + dir
  if (nextIndex < 0) {
    return { queue: Object.assign({}, queue, { currentIndex: 0 }), atEdge: true, edge: 'start' }
  }
  if (nextIndex >= queue.items.length) {
    if (queue.loop) {
      return { queue: Object.assign({}, queue, { currentIndex: 0 }), atEdge: false }
    }
    return { queue: queue, atEdge: true, edge: 'end' }
  }
  return { queue: Object.assign({}, queue, { currentIndex: nextIndex }), atEdge: false }
}

export function setQueueIndex(queue, index) {
  if (!isQueueActive(queue)) return null
  const clamped = Math.max(0, Math.min(index, queue.items.length - 1))
  return Object.assign({}, queue, { currentIndex: clamped })
}

export function setQueueItemPlayback(queue, index, playback) {
  if (!isQueueActive(queue)) return null
  const nextItems = queue.items.map(function(item, i) {
    if (i !== index) return item
    return Object.assign({}, item, playback)
  })
  return Object.assign({}, queue, { items: nextItems, currentIndex: index })
}

export function setFollowTune(queue, followTune) {
  if (!queue) return null
  return Object.assign({}, queue, { followTune: !!followTune })
}

export function setAutoAdvance(queue, autoAdvance) {
  if (!queue) return null
  return Object.assign({}, queue, { autoAdvance: !!autoAdvance })
}

export function clearQueue() {
  return null
}

export function removeQueueItem(queue, index) {
  if (!isQueueActive(queue)) return null
  if (typeof index !== 'number' || index < 0 || index >= queue.items.length) return queue
  const nextItems = queue.items.slice()
  nextItems.splice(index, 1)
  if (nextItems.length === 0) return null
  let currentIndex = typeof queue.currentIndex === 'number' ? queue.currentIndex : 0
  if (index < currentIndex) {
    currentIndex -= 1
  } else if (index === currentIndex && currentIndex >= nextItems.length) {
    currentIndex = nextItems.length - 1
  }
  return Object.assign({}, queue, { items: nextItems, currentIndex: currentIndex })
}

export function loadActiveQueue() {
  try {
    const raw = localStorage.getItem(ACTIVE_QUEUE_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!isQueueActive(parsed)) return null
    return parsed
  } catch (e) {
    return null
  }
}

export function persistActiveQueue(queue) {
  try {
    if (!isQueueActive(queue)) {
      localStorage.removeItem(ACTIVE_QUEUE_STORAGE_KEY)
      return
    }
    // Do not persist transient preview/suspend playback fields that can go stale.
    const toStore = Object.assign({}, queue)
    delete toStore.previewOnce
    delete toStore.playbackResume
    localStorage.setItem(ACTIVE_QUEUE_STORAGE_KEY, JSON.stringify(toStore))
  } catch (e) {
    // ignore quota / private mode failures
  }
}

export function suspendQueue(queue, playbackResume) {
  if (!isQueueActive(queue)) return { queue: null, snapshot: null }
  const snapshot = JSON.parse(JSON.stringify(queue))
  if (playbackResume) {
    snapshot.playbackResume = playbackResume
  }
  return {
    queue: Object.assign({}, queue, { suspendSnapshot: snapshot }),
    snapshot: snapshot,
  }
}

export function resumeQueue(queue) {
  if (!queue || !queue.suspendSnapshot) return queue
  return Object.assign({}, queue.suspendSnapshot, { suspendSnapshot: null, previewOnce: null })
}

export function startPreviewOnce(queue, tuneId) {
  if (!isQueueActive(queue)) return null
  return Object.assign({}, queue, {
    previewOnce: {
      tuneId: tuneId,
      returnIndex: typeof queue.currentIndex === 'number' ? queue.currentIndex : 0,
    },
  })
}

export function endPreviewOnce(queue) {
  if (!queue || !queue.previewOnce) return queue
  const returnIndex = queue.previewOnce.returnIndex
  return Object.assign({}, queue, {
    previewOnce: null,
    currentIndex: returnIndex,
  })
}

export function isPreviewingTune(queue, tuneId) {
  return !!(queue && queue.previewOnce && queue.previewOnce.tuneId === tuneId)
}

export function resolvePlaybackForItem(tune, item, tunebook) {
  if (!tune || !item || !tunebook) return null
  const prefer = item.prefer || 'auto'
  const hasMusic = tunebook.hasNotesOrChords(tune)
  const hasLinks = tunebook.hasLinks(tune)

  if (item.linkIndex != null && hasLinks) {
    return { type: 'media', linkNum: item.linkIndex }
  }
  if (prefer === 'midi' && hasMusic) return { type: 'midi', linkNum: null }
  if (prefer === 'media' && hasLinks) return { type: 'media', linkNum: 0 }
  if (hasLinks) return { type: 'media', linkNum: 0 }
  if (hasMusic) return { type: 'midi', linkNum: null }
  return null
}

export function buildPlaybackPath(tuneId, target) {
  if (!tuneId || !target) return '/tunes/' + tuneId
  if (target.type === 'midi') return '/tunes/' + tuneId + '/playMidi'
  return '/tunes/' + tuneId + '/playMedia/' + (target.linkNum != null ? target.linkNum : 0)
}

export function shouldSuppressFollowNavigate(context) {
  const ctx = context || {}
  const pathname = ctx.pathname || ''
  if (ctx.practiceSessionActive) return true
  if (ctx.setPlaylist && Array.isArray(ctx.setPlaylist.tunes) && ctx.setPlaylist.tunes.length > 0) {
    return true
  }
  if (pathname.indexOf('/editor/') !== -1) return true
  if (pathname.indexOf('/print') !== -1) return true
  if (pathname.indexOf('/gig/') !== -1) return true
  return false
}

export function sortTunesForQueue(tunes, hasNotesOrChords, hasLinks) {
  const list = Array.isArray(tunes) ? tunes.slice() : []
  return list
    .filter(function(tune) {
      if (!tune || !tune.id) return false
      return hasNotesOrChords(tune) || hasLinks(tune)
    })
    .sort(function(a, b) {
      return (a && b && a.boost && b.boost && a.boost > b.boost) ? 1 : -1
    })
}

export function tuneIdsFromTunes(tunes, limit) {
  const max = typeof limit === 'number' ? limit : 30
  return tunes.slice(0, max).map(function(t) { return t.id }).filter(Boolean)
}

export function getQueueTunes(queue, tunesMap) {
  if (!isQueueActive(queue)) return []
  return queue.items.map(function(item) {
    return tunesMap && item.tuneId ? tunesMap[item.tuneId] : null
  }).filter(Boolean)
}

export function getNextQueueItem(queue) {
  if (!isQueueActive(queue)) return null
  const result = advanceQueue(queue, 1)
  if (result.atEdge && result.edge === 'end' && !queue.loop) return null
  const nextQueue = result.queue
  return getCurrentItem(nextQueue)
}
