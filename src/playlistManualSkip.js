import {
  isQueueActive,
  getCurrentItem,
  isExternalQueueItem,
  isLessonExternalMedia,
  shouldSuppressFollowNavigate,
} from './nowPlayingQueue'
import {
  playQueueItem,
  navigateToQueueTune,
  resolveQueueTune,
} from './nowPlayingQueuePlayback'
import { advanceQueueToNextPlayable, stopPlaylistPlayback } from './playlistPlaybackResilience'
import { playLessonYoutube } from './lessonYoutubePlayer'
import { playExternalMediaItem } from './standaloneMediaPlayback'
import { queuePlaylistTrackAnnouncement } from './playlistTitleAnnouncement'

export const MANUAL_SKIP_ENDED_IGNORE_MS = 800
export const KEEP_PLAYING_ENDED_IGNORE_MS = 5000
export const SKIP_STARTED_ENDED_TAIL_MS = 250

const session = {
  active: false,
  keepPlaying: false,
  pendingSteps: 0,
  lastDirection: 1,
  loopInFlight: false,
  needsIndexSync: false,
  ignoreEndedUntil: 0,
}

function currentSession() {
  return session
}

export function resetManualPlaylistSkipForTests() {
  session.active = false
  session.keepPlaying = false
  session.pendingSteps = 0
  session.lastDirection = 1
  session.loopInFlight = false
  session.needsIndexSync = false
  session.ignoreEndedUntil = 0
}

export function getManualPlaylistSkipSession() {
  return currentSession()
}

export function isManualPlaylistSkipActive() {
  return session.active
}

export function shouldIgnorePlaybackEndForManualSkip() {
  if (session.loopInFlight || session.active) return true
  return Date.now() < session.ignoreEndedUntil
}

export function shouldIgnorePlaybackFailureForManualSkip() {
  return session.active && session.loopInFlight
}

export function hasPendingManualPlaylistSkip() {
  return session.pendingSteps !== 0
}

export function enqueueManualPlaylistSkip(direction, keepPlaying) {
  const wasActive = session.active
  session.active = true
  session.lastDirection = direction >= 0 ? 1 : -1
  session.pendingSteps += session.lastDirection
  if (keepPlaying) session.keepPlaying = true
  if (!wasActive) session.needsIndexSync = true
  return session
}

export function consumeManualPlaylistSkipStep() {
  if (session.pendingSteps === 0) return 0
  const step = session.pendingSteps > 0 ? 1 : -1
  session.pendingSteps -= step
  return step
}

export function finishManualPlaylistSkip() {
  const keepPlaying = session.keepPlaying
  session.active = false
  session.keepPlaying = false
  session.pendingSteps = 0
  session.needsIndexSync = false
  session.ignoreEndedUntil = Date.now() + (
    keepPlaying ? KEEP_PLAYING_ENDED_IGNORE_MS : MANUAL_SKIP_ENDED_IGNORE_MS
  )
}

export function noteManualPlaylistSkipPlaybackStarted() {
  if (session.active || session.loopInFlight) return
  if (session.ignoreEndedUntil <= 0) return
  session.ignoreEndedUntil = Date.now() + SKIP_STARTED_ENDED_TAIL_MS
}

function queueItemTuneId(item) {
  return item && item.tuneId != null ? String(item.tuneId) : null
}

function sameTuneId(a, b) {
  if (a == null || b == null) return false
  return String(a) === String(b)
}

function syncQueueToCurrentSong(queue, currentSongId, forceNavigate) {
  if (!isQueueActive(queue)) return queue
  let syncIndex = queue.currentIndex
  if (currentSongId) {
    const found = queue.items.findIndex(function(item) {
      return sameTuneId(queueItemTuneId(item), currentSongId)
    })
    if (found !== -1) syncIndex = found
  }
  return Object.assign({}, queue, {
    currentIndex: syncIndex,
    previewOnce: forceNavigate ? null : queue.previewOnce,
    stopAfterCurrent: false,
  })
}

function armKeepPlaying(mediaController) {
  if (!mediaController) return
  if (mediaController.unlockAudioFromUserGesture) {
    mediaController.unlockAudioFromUserGesture()
  } else if (mediaController.preparePlaybackFromUserGesture) {
    mediaController.preparePlaybackFromUserGesture()
  }
  if (mediaController.armPlaybackIntent) {
    mediaController.armPlaybackIntent({ fresh: true, fromUserGesture: true })
  }
}

function landExternalItem(deps, item, keepPlaying) {
  const mediaController = deps.mediaController
  if (mediaController && keepPlaying && mediaController.abortPlayingIntent) {
    mediaController.abortPlayingIntent()
  }
  if (!keepPlaying) return true
  if (isLessonExternalMedia(item.externalMedia)) {
    playLessonYoutube({ fromUserGesture: true })
    return true
  }
  playExternalMediaItem(item.externalMedia, mediaController, {
    play: true,
    fromUserGesture: true,
  }).catch(function() {
    enqueueManualPlaylistSkip(session.lastDirection, true)
    runPlaylistQueueSkip(deps)
  })
  return true
}

function landQueueItem(deps, result, keepPlaying) {
  const item = result && result.item
  if (!item) return false
  if (isExternalQueueItem(item)) {
    return landExternalItem(deps, item, keepPlaying)
  }

  const tuneId = queueItemTuneId(item)
  const tune = result.tune || resolveQueueTune(deps.tunes, deps.tunebook, tuneId)
  if (deps.announceOpening) deps.announceOpening(tune)

  const mediaController = deps.mediaController
  let started = !keepPlaying
  if (mediaController && keepPlaying && tune) {
    started = playQueueItem(mediaController, deps.tunebook, tune, item, {
      fromUserGesture: true,
      playbackTarget: result.playbackTarget,
    })
    if (started) queuePlaylistTrackAnnouncement(tune)
  }

  const nextQueue = result.queue
  const liveQueue = typeof deps.getQueue === 'function' ? deps.getQueue() : nextQueue
  const forceNavigate = !!deps.forceNavigate
  const shouldFollow = forceNavigate || !!(liveQueue && liveQueue.followTune)
  const allowFollow = forceNavigate
    ? !deps.practiceSessionActive
    : !shouldSuppressFollowNavigate({
      pathname: deps.locationPathname,
      setPlaylist: deps.setPlaylist,
      practiceSessionActive: deps.practiceSessionActive,
    })
  const nav = deps.navigate
  if (shouldFollow && nav && allowFollow && tuneId) {
    if (deps.setCurrentTune) deps.setCurrentTune(tuneId)
    if (keepPlaying || !forceNavigate) {
      navigateToQueueTune(nav, tuneId, item, deps.tunebook, deps.tunes, result.playbackTarget)
    } else {
      nav('/tunes/' + tuneId)
    }
  }
  return started
}

async function pumpPlaylistQueueSkip(deps) {
  const mediaController = deps.mediaController
  const keepPlaying = session.keepPlaying
  const getTunes = typeof deps.getTunes === 'function'
    ? deps.getTunes
    : function() { return deps.tunes }

  if (keepPlaying) {
    armKeepPlaying(mediaController)
  } else if (mediaController && deps.stopPlayback) {
    deps.stopPlayback(mediaController)
  }

  let workingQueue = deps.getQueue()
  if (session.needsIndexSync) {
    session.needsIndexSync = false
    workingQueue = syncQueueToCurrentSong(
      workingQueue,
      deps.currentSongId,
      !!deps.forceNavigate
    )
  }

  let lastResult = {
    queue: workingQueue,
    item: getCurrentItem(workingQueue),
    tune: null,
    atEnd: !isQueueActive(workingQueue),
  }
  let failedPlays = 0
  const maxFailedPlays = (workingQueue && workingQueue.items ? workingQueue.items.length : 0) + 1

  while (true) {
    const tunes = getTunes()
    const step = consumeManualPlaylistSkipStep()
    if (step !== 0) {
      const result = await advanceQueueToNextPlayable(workingQueue, tunes, deps.tunebook, {
        direction: step,
        advanceFirst: true,
        wrapManualNavigation: true,
        isYoutubeLink: deps.isYoutubeLink,
        playbackMode: deps.playbackMode || 'auto',
      })
      if (result.atEnd || !result.item) {
        if (keepPlaying) stopPlaylistPlayback(mediaController)
        if (deps.failCallback) deps.failCallback(step > 0 ? 'end' : 'start')
        return false
      }
      workingQueue = result.queue
      lastResult = result
      if (deps.setQueue) deps.setQueue(workingQueue)
      continue
    }

    lastResult = Object.assign({}, lastResult, {
      tune: lastResult.tune || resolveQueueTune(tunes, deps.tunebook, queueItemTuneId(lastResult.item)),
    })
    deps.tunes = tunes
    const landed = landQueueItem(deps, lastResult, keepPlaying)
    if (landed) return true
    if (!keepPlaying) return true

    failedPlays += 1
    if (failedPlays >= maxFailedPlays) {
      stopPlaylistPlayback(mediaController)
      if (deps.failCallback) deps.failCallback('end')
      return false
    }
    enqueueManualPlaylistSkip(session.lastDirection, true)
  }
}

/**
 * Coalesce rapid next/prev clicks into one skip session and keep playlist
 * audio armed until the landed track starts.
 */
export function runPlaylistQueueSkip(deps) {
  if (!deps || typeof deps.getQueue !== 'function') return Promise.resolve(false)
  if (session.loopInFlight) return Promise.resolve(true)
  session.loopInFlight = true
  return pumpPlaylistQueueSkip(deps).then(function(ok) {
    return ok
  }, function() {
    if (session.keepPlaying) stopPlaylistPlayback(deps.mediaController)
    return false
  }).then(function(ok) {
    session.loopInFlight = false
    if (ok && hasPendingManualPlaylistSkip()) {
      return runPlaylistQueueSkip(deps)
    }
    finishManualPlaylistSkip()
    return ok
  })
}
