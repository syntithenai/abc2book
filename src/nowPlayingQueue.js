/**
 * "Now Playing" queue — single source of truth for list-mode continuous playback.
 * Active queue is persisted in localStorage so it survives refresh and navigation.
 */

import { PLAYLIST_MAX_ITEMS } from './tuneScaleConstants'
import { externalMediaFromCandidate } from './mediaSearchExternalMedia'

const ACTIVE_QUEUE_STORAGE_KEY = 'bookstorage_now_playing_queue'

export const REPEAT_MODES = ['off', 'playlist', 'track']

export function getRepeatMode(queue) {
  if (!queue) return 'off'
  if (queue.repeatMode && REPEAT_MODES.indexOf(queue.repeatMode) !== -1) {
    return queue.repeatMode
  }
  if (queue.repeatTrack) return 'track'
  if (queue.loop) return 'playlist'
  return 'off'
}

export function isRepeatPlaylist(queue) {
  return getRepeatMode(queue) === 'playlist'
}

export function isRepeatTrack(queue) {
  return getRepeatMode(queue) === 'track'
}

function queueWithRepeatMode(queue, repeatMode) {
  const mode = REPEAT_MODES.indexOf(repeatMode) !== -1 ? repeatMode : 'off'
  return Object.assign({}, queue, {
    repeatMode: mode,
    loop: mode === 'playlist',
    repeatTrack: mode === 'track',
  })
}

export function setRepeatMode(queue, repeatMode) {
  if (!queue) return null
  return queueWithRepeatMode(queue, repeatMode)
}

export function cycleRepeatMode(queue) {
  if (!queue) return null
  const current = getRepeatMode(queue)
  const index = REPEAT_MODES.indexOf(current)
  const next = REPEAT_MODES[(index + 1) % REPEAT_MODES.length]
  return setRepeatMode(queue, next)
}

export function createQueueId() {
  return 'queue-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9)
}

export function isExternalQueueItem(item) {
  return !!(item && item.externalMedia && (
    item.externalMedia.youtubeId
    || item.externalMedia.uri
    || item.externalMedia.collectionLink
    || item.externalMedia.collectionPath
    || item.externalMedia.mediaLink
  ))
}

export function isLessonExternalMedia(externalMedia) {
  return !!(externalMedia && externalMedia.youtubeId)
}

export function isStandaloneExternalQueueItem(item) {
  return isExternalQueueItem(item) && !isLessonExternalMedia(item.externalMedia)
}

export function isLessonQueue(queue) {
  return !!(queue && queue.source === 'lesson')
}

export function getQueueItemLabel(item, tunesMap) {
  if (!item) return 'Missing item'
  if (isExternalQueueItem(item)) {
    const em = item.externalMedia
    if (em.youtubeId) {
      if (em.subtitle) return em.subtitle + ' — ' + em.title
      return em.title || 'Lesson track'
    }
    if (em.artist && em.title) return em.title + ' — ' + em.artist
    return em.title || 'Media track'
  }
  const tune = item.tuneId && tunesMap ? tunesMap[item.tuneId] : null
  if (tune && tune.name) return tune.name
  return item.tuneId ? 'Missing tune (' + item.tuneId + ')' : 'Missing tune'
}

export function createLessonQueueFromItems(options) {
  const opts = options || {}
  const rawItems = Array.isArray(opts.items) ? opts.items.slice(0, PLAYLIST_MAX_ITEMS) : []
  const items = rawItems.map(function(item) {
    if (!item || !item.externalMedia || !item.externalMedia.youtubeId) return null
    return {
      tuneId: null,
      prefer: 'external',
      externalMedia: Object.assign({}, item.externalMedia),
    }
  }).filter(Boolean)
  return {
    id: opts.id || createQueueId(),
    name: opts.name || 'Lesson playlist',
    source: 'lesson',
    lessonId: opts.lessonId || null,
    items: items,
    currentIndex: typeof opts.currentIndex === 'number' ? opts.currentIndex : 0,
    followTune: false,
    autoAdvance: opts.autoAdvance !== false,
    loop: !!opts.loop,
    shuffle: false,
    shuffleOrder: null,
    suspendSnapshot: null,
    previewOnce: null,
  }
}

export function createQueue(options) {
  const opts = options || {}
  const tuneIds = clampTuneIds(Array.isArray(opts.tuneIds) ? opts.tuneIds.filter(Boolean) : [])
  const items = tuneIds.map(function(tuneId) {
    return { tuneId: tuneId, prefer: 'auto' }
  })
  const repeatMode = opts.repeatMode
    || (opts.repeatTrack ? 'track' : (opts.loop ? 'playlist' : 'off'))
  const queue = {
    id: opts.id || createQueueId(),
    name: opts.name || 'Playlist',
    source: opts.source || 'manual',
    items: items,
    currentIndex: typeof opts.currentIndex === 'number' ? opts.currentIndex : 0,
    followTune: opts.followTune !== undefined ? !!opts.followTune : true,
    autoAdvance: opts.autoAdvance !== false,
    shuffle: !!opts.shuffle,
    shuffleOrder: null,
    suspendSnapshot: null,
    previewOnce: null,
  }
  return queueWithRepeatMode(queue, repeatMode)
}

export function buildShuffleOrder(length, startIndex) {
  const indices = []
  for (let i = 0; i < length; i++) indices.push(i)
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = indices[i]
    indices[i] = indices[j]
    indices[j] = tmp
  }
  const start = typeof startIndex === 'number' ? startIndex : 0
  if (start > 0 && start < length) {
    const pos = indices.indexOf(start)
    if (pos > 0) {
      indices.splice(pos, 1)
      indices.unshift(start)
    }
  }
  return indices
}

function getShufflePosition(queue) {
  if (!queue.shuffle || !Array.isArray(queue.shuffleOrder) || !queue.shuffleOrder.length) {
    return null
  }
  const idx = typeof queue.currentIndex === 'number' ? queue.currentIndex : 0
  const pos = queue.shuffleOrder.indexOf(idx)
  return pos >= 0 ? pos : 0
}

function ensureShuffleOrder(queue) {
  const idx = typeof queue.currentIndex === 'number' ? queue.currentIndex : 0
  if (Array.isArray(queue.shuffleOrder) && queue.shuffleOrder.length === queue.items.length) {
    return queue
  }
  return Object.assign({}, queue, {
    shuffleOrder: buildShuffleOrder(queue.items.length, idx),
  })
}

function advanceQueueShuffled(queue, direction) {
  const dir = direction >= 0 ? 1 : -1
  let active = ensureShuffleOrder(queue)
  const order = active.shuffleOrder
  const pos = getShufflePosition(active)

  if (dir > 0) {
    if (pos + 1 < order.length) {
      return {
        queue: Object.assign({}, active, { currentIndex: order[pos + 1] }),
        atEdge: false,
      }
    }
    if (isRepeatPlaylist(active)) {
      const newOrder = buildShuffleOrder(active.items.length, order[pos])
      return {
        queue: Object.assign({}, active, {
          shuffleOrder: newOrder,
          currentIndex: newOrder[0],
        }),
        atEdge: false,
      }
    }
    return { queue: active, atEdge: true, edge: 'end' }
  }

  if (pos > 0) {
    return {
      queue: Object.assign({}, active, { currentIndex: order[pos - 1] }),
      atEdge: false,
    }
  }
  if (isRepeatPlaylist(active)) {
    return {
      queue: Object.assign({}, active, { currentIndex: order[order.length - 1] }),
      atEdge: false,
    }
  }
  return { queue: Object.assign({}, active, { currentIndex: order[0] }), atEdge: true, edge: 'start' }
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
  if (item && item.tuneId) return item.tuneId
  return null
}

export function getCurrentExternalMedia(queue) {
  const item = getCurrentItem(queue)
  return item && item.externalMedia ? item.externalMedia : null
}

export function findQueueIndexForTuneId(queue, tuneId) {
  if (!isQueueActive(queue) || tuneId == null) return -1
  const targetId = String(tuneId)
  return queue.items.findIndex(function(item) {
    return item && item.tuneId != null && String(item.tuneId) === targetId
  })
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
  if (queue.shuffle) {
    return advanceQueueShuffled(queue, direction)
  }
  const idx = typeof queue.currentIndex === 'number' ? queue.currentIndex : 0
  const nextIndex = idx + dir
  if (nextIndex < 0) {
    return { queue: Object.assign({}, queue, { currentIndex: 0 }), atEdge: true, edge: 'start' }
  }
  if (nextIndex >= queue.items.length) {
    if (isRepeatPlaylist(queue)) {
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

export function setLoop(queue, loop) {
  if (!queue) return null
  return setRepeatMode(queue, loop ? 'playlist' : 'off')
}

export function setShuffle(queue, shuffle) {
  if (!queue) return null
  const enabled = !!shuffle
  if (!enabled) {
    return Object.assign({}, queue, { shuffle: false, shuffleOrder: null })
  }
  const idx = typeof queue.currentIndex === 'number' ? queue.currentIndex : 0
  return Object.assign({}, queue, {
    shuffle: true,
    shuffleOrder: buildShuffleOrder(queue.items.length, idx),
  })
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
  let next = Object.assign({}, queue, { items: nextItems, currentIndex: currentIndex })
  if (next.shuffle) {
    next = Object.assign({}, next, {
      shuffleOrder: buildShuffleOrder(next.items.length, currentIndex),
    })
  }
  return next
}

function buildQueueItem(tuneId, options) {
  const opts = options || {}
  const item = {
    tuneId: tuneId,
    prefer: opts.prefer || 'auto',
  }
  if (opts.linkIndex != null) item.linkIndex = opts.linkIndex
  return item
}

/** Append a tune to the end of the queue (or start a new queue). */
export function appendTuneToQueue(queue, tuneId, options) {
  if (!tuneId) return queue
  const item = buildQueueItem(tuneId, options)
  if (!isQueueActive(queue)) {
    return createQueue({
      tuneIds: [tuneId],
      source: (options && options.source) || 'manual',
      name: (options && options.name) || 'Playlist',
    })
  }
  if (queue.items.length >= PLAYLIST_MAX_ITEMS) return queue
  return Object.assign({}, queue, {
    items: queue.items.concat([item]),
  })
}

/** Insert a tune immediately after the current queue index. */
export function insertTuneAfterCurrentInQueue(queue, tuneId, options) {
  if (!tuneId) return queue
  const item = buildQueueItem(tuneId, options)
  if (!isQueueActive(queue)) {
    return createQueue({
      tuneIds: [tuneId],
      source: (options && options.source) || 'manual',
      name: (options && options.name) || 'Playlist',
    })
  }
  if (queue.items.length >= PLAYLIST_MAX_ITEMS) return queue
  const idx = typeof queue.currentIndex === 'number' ? queue.currentIndex : 0
  const nextItems = queue.items.slice()
  nextItems.splice(idx + 1, 0, item)
  let next = Object.assign({}, queue, { items: nextItems })
  if (next.shuffle) {
    next = Object.assign({}, next, {
      shuffleOrder: buildShuffleOrder(next.items.length, next.currentIndex),
    })
  }
  return next
}

/** Append multiple tunes to the end of the queue. */
export function appendTunesToQueue(queue, tuneIds, options) {
  if (!tuneIds || !tuneIds.length) return queue
  let next = queue
  tuneIds.forEach(function(tuneId) {
    next = appendTuneToQueue(next, tuneId, options)
  })
  return next
}

/** Insert multiple tunes immediately after the current queue index (preserves order). */
export function insertTunesAfterCurrentInQueue(queue, tuneIds, options) {
  if (!tuneIds || !tuneIds.length) return queue
  let next = queue
  tuneIds.slice().reverse().forEach(function(tuneId) {
    next = insertTuneAfterCurrentInQueue(next, tuneId, options)
  })
  return next
}

function buildExternalQueueItem(externalMedia, options) {
  const opts = options || {}
  if (!externalMedia) return null
  return {
    tuneId: null,
    prefer: 'external',
    externalMedia: Object.assign({}, externalMedia),
    source: opts.source || 'media-search',
  }
}

export function appendMediaCandidateToQueue(queue, candidate, options) {
  const externalMedia = requireExternalMediaFromCandidate(candidate)
  if (!externalMedia) return queue
  const item = buildExternalQueueItem(externalMedia, options)
  if (!item) return queue
  if (!isQueueActive(queue)) {
    return {
      id: createQueueId(),
      name: (options && options.name) || 'Media playlist',
      source: (options && options.source) || 'media-search',
      items: [item],
      currentIndex: 0,
      followTune: false,
      autoAdvance: options && options.autoAdvance !== false,
      loop: !!(options && options.loop),
      shuffle: false,
      shuffleOrder: null,
      suspendSnapshot: null,
      previewOnce: null,
    }
  }
  if (queue.items.length >= PLAYLIST_MAX_ITEMS) return queue
  return Object.assign({}, queue, {
    items: queue.items.concat([item]),
  })
}

export function insertMediaCandidateAfterCurrentInQueue(queue, candidate, options) {
  const externalMedia = requireExternalMediaFromCandidate(candidate)
  if (!externalMedia) return queue
  const item = buildExternalQueueItem(externalMedia, options)
  if (!item) return queue
  if (!isQueueActive(queue)) {
    return appendMediaCandidateToQueue(null, candidate, options)
  }
  if (queue.items.length >= PLAYLIST_MAX_ITEMS) return queue
  const idx = typeof queue.currentIndex === 'number' ? queue.currentIndex : 0
  const nextItems = queue.items.slice()
  nextItems.splice(idx + 1, 0, item)
  let next = Object.assign({}, queue, { items: nextItems })
  if (next.shuffle) {
    next = Object.assign({}, next, {
      shuffleOrder: buildShuffleOrder(next.items.length, next.currentIndex),
    })
  }
  return next
}

function requireExternalMediaFromCandidate(candidate) {
  return externalMediaFromCandidate(candidate)
}

function isRecordingLink(link) {
  if (!link) return false
  if (link.recordingId) return true
  const uri = link.link || ''
  return /^abcbook-recording:|^recording:/.test(uri)
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
    delete toStore.shuffleOrder
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
  if (!item) return null
  if (isExternalQueueItem(item)) {
    if (item.externalMedia && item.externalMedia.youtubeId) {
      return { type: 'external', youtubeId: item.externalMedia.youtubeId }
    }
    return { type: 'external', externalMedia: item.externalMedia }
  }
  if (!tune || !tunebook) return null
  const prefer = item.prefer || 'auto'
  const hasMusic = tunebook.hasNotesOrChords(tune)
  const hasLinks = tunebook.hasLinks(tune)

  if (item.linkIndex != null && hasLinks) {
    return { type: 'media', linkNum: item.linkIndex }
  }
  if (prefer === 'midi' && hasMusic) return { type: 'midi', linkNum: null }
  if (prefer === 'media' && hasLinks) return { type: 'media', linkNum: 0 }
  if (prefer === 'auto' && hasMusic && hasLinks) {
    const firstLink = tune.links[0]
    if (isRecordingLink(firstLink)) {
      return { type: 'midi', linkNum: null }
    }
  }
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
  if (pathname.indexOf('/scratchpad') !== -1) return true
  if (pathname.indexOf('/print') !== -1) return true
  if (pathname.indexOf('/gig/') !== -1) return true
  if (pathname.indexOf('/lessons') !== -1) return true
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
  const max = typeof limit === 'number' ? limit : PLAYLIST_MAX_ITEMS
  return tunes.slice(0, max).map(function(t) { return t.id }).filter(Boolean)
}

export function clampTuneIds(tuneIds, limit) {
  const max = typeof limit === 'number' ? limit : PLAYLIST_MAX_ITEMS
  if (!Array.isArray(tuneIds)) return []
  return tuneIds.filter(Boolean).slice(0, max)
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
  if (result.atEdge && result.edge === 'end' && !isRepeatPlaylist(queue)) return null
  const nextQueue = result.queue
  return getCurrentItem(nextQueue)
}
