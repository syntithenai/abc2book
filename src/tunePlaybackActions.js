import {
  isQueueActive,
  getCurrentItem,
  getCurrentTuneId,
  findQueueIndexForTuneId,
  resolvePlaybackForItem,
  isExternalQueueItem,
  isLessonExternalMedia,
  appendTuneToQueue,
  createQueue,
  endStopAfterCurrent,
  setPreferMidi,
} from './nowPlayingQueue'
import { playQueueItem, navigateToQueueTune, playCurrentQueueItem } from './nowPlayingQueuePlayback'
import { advanceQueueToNextPlayable, isQueueItemPlayable, stopPlaylistPlayback } from './playlistPlaybackResilience'
import {
  isQueuePlaybackEngaged,
  isTuneListPath,
  isTuneSingleViewPath,
  getAppPathname,
} from './playbackNavigationUtils'
import { shouldSuppressFollowNavigate } from './nowPlayingQueue'
import { hasFilteredPlaybackVoices } from './abcVoiceViewSettings'
import { playExternalMediaItem } from './standaloneMediaPlayback'

export { isQueuePlaybackEngaged }

/**
 * When nothing is currently playing, jump to the newly inserted "play next"
 * item and start the queue. No-op if playback is already engaged.
 */
export function startQueueItemIfPlaybackIdle(mediaController, tunebook, queue) {
  if (!isQueueActive(queue)) return false
  if (isQueuePlaybackEngaged(mediaController, { queue: queue })) return false
  if (!tunebook || !tunebook.startNowPlayingQueue) return false
  if (mediaController && mediaController.preparePlaybackFromUserGesture) {
    mediaController.preparePlaybackFromUserGesture()
  }
  tunebook.startNowPlayingQueue(queue, null, {
    startPlayback: true,
    mediaController: mediaController,
    navigate: false,
  })
  return true
}

export function finalizePlayNextQueue(mediaController, tunebook, priorQueue, nextQueue, setQueue) {
  if (!setQueue || !nextQueue) return nextQueue
  const wasEngaged = isQueuePlaybackEngaged(mediaController, { queue: priorQueue })
  const priorIndex = isQueueActive(priorQueue) ? (priorQueue.currentIndex || 0) : -1
  let resolved = nextQueue
  if (!wasEngaged) {
    resolved = Object.assign({}, nextQueue, {
      currentIndex: priorIndex >= 0 ? priorIndex + 1 : 0,
    })
  }
  setQueue(resolved)
  if (!wasEngaged) {
    startQueueItemIfPlaybackIdle(mediaController, tunebook, resolved)
  }
  return resolved
}

function shouldNavigateWithQueue(queue, options) {
    if (!queue || !queue.followTune) return false
    const opts = options || {}
    return !shouldSuppressFollowNavigate({
        pathname: opts.pathname || getAppPathname(),
        setPlaylist: opts.setPlaylist,
        practiceSessionActive: opts.practiceSessionActive,
    })
}

function resolveTuneForPlayback(mediaController, location, queueContext) {
    const ctx = queueContext || {}
    const tunes = ctx.tunes
    if (ctx.playTuneId && tunes && tunes[ctx.playTuneId]) {
        return tunes[ctx.playTuneId]
    }
    if (tunes && location && location.pathname) {
        const match = location.pathname.match(/\/(?:tunes|editor)\/([^/]+)/)
        if (match && tunes[match[1]]) {
            return tunes[match[1]]
        }
    }
    return mediaController.tune
}

export function resolvePlaybackTarget(mediaController, tunebook, location, tune) {
    const hasMusic = tunebook.hasNotesOrChords(tune)
    const hasLinks = Array.isArray(tune.links) && tune.links.length > 0
    if (!hasMusic && !hasLinks) return null

    if (location.pathname.indexOf('/playMedia') >= 0 && hasLinks) {
        const parts = location.pathname.split('/playMedia/')
        const parsed = parts.length > 1 ? parseInt(parts[1], 10) : 0
        const linkNum = !isNaN(parsed) ? parsed : 0
        return { type: 'media', linkNum: linkNum }
    }
    if (location.pathname.indexOf('/playMidi') >= 0 && hasMusic) {
        return { type: 'midi' }
    }

    if (mediaController.requestedPlayState === 'playMedia' && hasLinks) {
        const linkNum = mediaController.mediaLinkNumber !== null && mediaController.mediaLinkNumber !== undefined
            ? mediaController.mediaLinkNumber : 0
        return { type: 'media', linkNum: linkNum }
    }
    if (mediaController.requestedPlayState === 'playMidi' && hasMusic) {
        return { type: 'midi' }
    }

    if (mediaController.isMediaPlaybackRoute && mediaController.isMediaPlaybackRoute() && hasLinks) {
        const linkNum = mediaController.mediaLinkNumber !== null && mediaController.mediaLinkNumber !== undefined
            ? mediaController.mediaLinkNumber : 0
        return { type: 'media', linkNum: linkNum }
    }

    if (hasMusic && hasLinks && hasFilteredPlaybackVoices(tune)
        && mediaController.requestedPlayState !== 'playMedia'
        && !(mediaController.isMediaPlaybackRoute && mediaController.isMediaPlaybackRoute())) {
        return { type: 'midi' }
    }

    if (hasLinks) {
        const linkNum = mediaController.mediaLinkNumber !== null && mediaController.mediaLinkNumber !== undefined
            ? mediaController.mediaLinkNumber : 0
        return { type: 'media', linkNum: linkNum }
    }
    if (hasMusic) {
        return { type: 'midi' }
    }
    return null
}

function buildPlaybackPath(tuneId, target) {
    if (target.type === 'midi') {
        return '/tunes/' + tuneId + '/playMidi'
    }
    return '/tunes/' + tuneId + '/playMedia/' + target.linkNum
}

function applyPlaybackSetup(mediaController, tunebook, tune, target) {
    const playState = target.type === 'midi' ? 'playMidi' : 'playMedia'
    if (mediaController.setTune) {
        mediaController.setTune(tune)
    }
    if (target.type === 'midi') {
        mediaController.setMediaLinkNumber(null)
    } else {
        mediaController.setMediaLinkNumber(target.linkNum)
    }
    if (mediaController.applyPlaybackRoute) {
        mediaController.applyPlaybackRoute(
            playState,
            target.type === 'media' ? String(target.linkNum != null ? target.linkNum : 0) : null,
            tune,
            tunebook
        )
    }
    return playState
}

function requestPlaybackForTarget(mediaController, tune, target, playState) {
    if (mediaController.requestPlayback) {
        if (mediaController.requestPlayback({
            tuneId: tune.id,
            playState: playState,
            linkNum: target.type === 'media' ? target.linkNum : null,
            fromUserGesture: true,
            fresh: true,
        })) {
            return
        }
        if (mediaController.hasPendingPlayRequest && mediaController.hasPendingPlayRequest()) {
            return
        }
    }
    if (mediaController.playFromUserGesture) {
        mediaController.playFromUserGesture({ fresh: true })
    } else if (mediaController.play) {
        mediaController.play({ fresh: true })
    }
}

export function requestNavigatePlayback(mediaController, tunebook, navigate, tune, target) {
    const playState = applyPlaybackSetup(mediaController, tunebook, tune, target)
    requestPlaybackForTarget(mediaController, tune, target, playState)
    if (navigate) {
        navigate(buildPlaybackPath(tune.id, target))
    }
}

function beginPlayback(mediaController, tunebook, navigate, location, tune, target) {
    const path = buildPlaybackPath(tune.id, target)
    const currentPath = location && location.pathname ? location.pathname : ''
    const needsNavigate = currentPath !== path

    if (needsNavigate && navigate) {
        requestNavigatePlayback(mediaController, tunebook, navigate, tune, target)
        return
    }

    const playState = applyPlaybackSetup(mediaController, tunebook, tune, target)
    requestPlaybackForTarget(mediaController, tune, target, playState)

    if (navigate && location && location.pathname !== path) {
        navigate(path)
    }
}

function requestQueueItemPlayback(mediaController, tunebook, navigate, location, tune, item, options) {
    const opts = options || {}
    const target = resolvePlaybackForItem(tune, item, tunebook, { preferMidi: !!opts.preferMidi })
    if (!target || target.type === 'external') return false
    const normalizedTarget = target.type === 'midi'
        ? { type: 'midi' }
        : { type: 'media', linkNum: target.linkNum != null ? target.linkNum : 0 }
    const path = buildPlaybackPath(tune.id, normalizedTarget)
    const currentPath = location && location.pathname ? location.pathname : ''
    if (currentPath !== path && navigate) {
        requestNavigatePlayback(mediaController, tunebook, navigate, tune, normalizedTarget)
    } else {
        beginPlayback(mediaController, tunebook, navigate, location || { pathname: '' }, tune, normalizedTarget)
    }
    return true
}

export function playTuneNow(mediaController, tunebook, navigate, tune) {
    if (!mediaController || !tunebook || !tune) return false
    const hasMusic = tunebook.hasNotesOrChords && tunebook.hasNotesOrChords(tune)
    const hasLinks = tunebook.hasLinks
        ? tunebook.hasLinks(tune)
        : (Array.isArray(tune.links) && tune.links.length > 0)
    let target = null
    if (hasLinks && !(hasMusic && hasFilteredPlaybackVoices(tune))) {
        target = { type: 'media', linkNum: 0 }
    } else if (hasMusic) {
        target = { type: 'midi' }
    }
    if (!target) {
        if (navigate) navigate('/tunes/' + tune.id)
        return false
    }
    beginPlayback(mediaController, tunebook, navigate, { pathname: '' }, tune, target)
    return true
}

/**
 * Append a tune to the active queue (or create one), jump to it, and start playback.
 * Used by header play and viewed-focus fullscreen play.
 *
 * On a single-tune page, playback stops after this track instead of auto-advancing.
 * An existing playlist is kept — if the viewed tune is already on it, jump there.
 */
export function enqueueTuneInQueueAndPlay(mediaController, tunebook, navigate, location, tune, context) {
    const ctx = context || {}
    const setQueue = ctx.setNowPlayingQueue
    if (!mediaController || !tunebook || !tune || !tune.id || !setQueue) return false

    let queue = ctx.nowPlayingQueue
    const tuneId = tune.id
    const pathname = location && location.pathname ? location.pathname : ''
    const playOnceAndStop = ctx.playOnceAndStop === true || isTuneSingleViewPath(pathname)
    const existingIndex = findQueueIndexForTuneId(queue, tuneId)

    if (existingIndex !== -1) {
        queue = Object.assign({}, queue, {
            currentIndex: existingIndex,
            previewOnce: null,
        })
    } else if (isQueueActive(queue)) {
        queue = appendTuneToQueue(queue, tuneId)
        queue = Object.assign({}, queue, {
            currentIndex: queue.items.length - 1,
            previewOnce: null,
        })
    } else {
        queue = createQueue({
            tuneIds: [tuneId],
            followTune: false,
            repeatMode: 'off',
            preferMidi: !!ctx.preferMidi,
        })
    }

    if (ctx.preferMidi && !queue.preferMidi) {
        queue = setPreferMidi(queue, true)
    }

    if (playOnceAndStop) {
        queue = Object.assign({}, queue, {
            stopAfterCurrent: true,
            previewOnce: null,
        })
    } else if (queue.stopAfterCurrent) {
        queue = endStopAfterCurrent(queue)
    }

    setQueue(queue)
    if (ctx.setCurrentTune) ctx.setCurrentTune(tuneId)

    const item = queue.items[queue.currentIndex]
    if (!item) return false

    if (mediaController.preparePlaybackFromUserGesture) {
        mediaController.preparePlaybackFromUserGesture()
    }

    const preferMidi = !!queue.preferMidi
    if (isTuneListPath(pathname) && !queue.followTune) {
        playQueueItem(mediaController, tunebook, tune, item, {
          fromUserGesture: true,
          preferMidi: preferMidi,
          queue: queue,
        })
        return true
    }

    if (requestQueueItemPlayback(mediaController, tunebook, navigate, location, tune, item, {
      preferMidi: preferMidi,
    })) {
        return true
    }

    playQueueItem(mediaController, tunebook, tune, item, {
      fromUserGesture: true,
      preferMidi: preferMidi,
      queue: queue,
    })
    return true
}

export function resumeTunePlayback(mediaController, viewedTuneId, options) {
    if (!mediaController) return false
    const opts = options || {}
    // Never resume paused/pending playback that belongs to a different tune
    // than the one the user is looking at — that silently restarts the old
    // tune's media and looks like the play button is broken.
    if (viewedTuneId) {
        if (!mediaController.tune || mediaController.tune.id !== viewedTuneId) {
            return false
        }
        const queue = opts.queue
        if (isQueueActive(queue)) {
            const queueTuneId = getCurrentTuneId(queue)
            if (queueTuneId && queueTuneId !== viewedTuneId) {
                return false
            }
        }
    }
    if (mediaController.canResumePlayback && mediaController.canResumePlayback()) {
        if (mediaController.playFromUserGesture) {
            mediaController.playFromUserGesture()
        } else {
            mediaController.play()
        }
        return true
    }
    if (mediaController.hasActivePlaybackIntent && mediaController.hasActivePlaybackIntent()) {
        if (mediaController.playFromUserGesture) {
            mediaController.playFromUserGesture()
        } else {
            mediaController.play()
        }
        return true
    }
    return false
}

export function startTunePlayback(mediaController, tunebook, navigate, location, queueContext) {
    const ctx = queueContext || {}
    const tune = resolveTuneForPlayback(mediaController, location, queueContext)
    if (!tune) return false

    if (resumeTunePlayback(mediaController, tune.id, { queue: ctx.nowPlayingQueue })) {
        return true
    }

    const target = resolvePlaybackTarget(mediaController, tunebook, location, tune)
    if (!target) return false

    if (ctx.setNowPlayingQueue) {
        return enqueueTuneInQueueAndPlay(mediaController, tunebook, navigate, location, tune, ctx)
    }

    beginPlayback(mediaController, tunebook, navigate, location, tune, target)
    return true
}

export function configurePracticeTunePlayback(mediaController, tunebook, tune, step) {
    if (!tune || !step) return false
    mediaController.setTune(tune)
    const isMediaRoute = step.route === 'media' && tunebook.hasLinks(tune)
    if (isMediaRoute) {
        const linkIndex = step.linkIndex != null ? step.linkIndex : 0
        mediaController.setMediaLinkNumber(linkIndex)
    } else {
        mediaController.setMediaLinkNumber(null)
    }
    if (mediaController.applyPlaybackRoute) {
        const playState = isMediaRoute ? 'playMedia' : 'playMidi'
        const linkParam = isMediaRoute
            ? String(step.linkIndex != null ? step.linkIndex : 0)
            : '0'
        mediaController.applyPlaybackRoute(playState, linkParam, tune, tunebook)
    }
    return true
}

/** @deprecated use configurePracticeTunePlayback — playback starts from PracticeSessionPlaybackHost */
export function startPracticeTunePlayback(mediaController, tunebook, navigate, tune, step) {
    if (!configurePracticeTunePlayback(mediaController, tunebook, tune, step)) {
        return false
    }
    if (mediaController.playFromUserGesture) {
        mediaController.playFromUserGesture({ fresh: true })
    } else {
        mediaController.play({ fresh: true })
    }
    return true
}

export function toggleTunePlayback(mediaController, tunebook, navigate, location, queueContext) {
    const tune = resolveTuneForPlayback(mediaController, location, queueContext)
    if (!tune) return false
    const hasMusic = tunebook.hasNotesOrChords(tune)
    const hasLinks = Array.isArray(tune.links) && tune.links.length > 0
    if (!hasMusic && !hasLinks) return false

    if (mediaController.isLoading) {
        mediaController.pause()
        mediaController.setIsLoading(false)
        mediaController.setIsReady(false)
        return true
    }
    if (mediaController.isPlaying) {
        mediaController.pause()
        return true
    }
    if (resumeTunePlayback(mediaController, tune.id, { queue: queueContext && queueContext.nowPlayingQueue })) {
        return true
    }
    return startTunePlayback(mediaController, tunebook, navigate, location, queueContext)
}

export function resumePlaylistPlayback(mediaController, tunebook, navigate, queue, tunes, setNowPlayingQueue, options) {
    if (!isQueueActive(queue)) return false
    const navOpts = options || {}
    if (queue.stopAfterCurrent) {
        queue = endStopAfterCurrent(queue)
        if (setNowPlayingQueue) setNowPlayingQueue(queue)
    }
    const tuneId = getCurrentTuneId(queue)
    const item = getCurrentItem(queue)
    const tune = tuneId && tunes ? tunes[tuneId] : null

    if (item && isExternalQueueItem(item) && !isLessonExternalMedia(item.externalMedia)) {
        playExternalMediaItem(item.externalMedia, mediaController, { play: true, fromUserGesture: true })
        return true
    }

    function tryResumeCurrent() {
        const navOptsForPrefer = { queue: queue, preferMidi: !!queue.preferMidi }
        if (tuneId && navigate && shouldNavigateWithQueue(queue, navOpts)) {
            navigateToQueueTune(navigate, tuneId, item, tunebook, tunes, null, navOptsForPrefer)
        }
        const preferMidi = !!queue.preferMidi
        const onMidi = mediaController
          && mediaController.isMidiPlaybackRoute
          && mediaController.isMidiPlaybackRoute()
        // When MIDI preference is on, start MIDI instead of resuming a media route.
        if (preferMidi && !onMidi) {
            return playCurrentQueueItem(mediaController, tunebook, tunes, queue, { fromUserGesture: true })
        }
        if (mediaController && mediaController.canResumePlayback && mediaController.canResumePlayback()) {
            if (mediaController.playFromUserGesture) {
                mediaController.playFromUserGesture()
            } else {
                mediaController.play()
            }
            return true
        }
        return playCurrentQueueItem(mediaController, tunebook, tunes, queue, { fromUserGesture: true })
    }

    function finishResumeAt(result) {
        if (result.atEnd || !result.item) {
            stopPlaylistPlayback(mediaController)
            return
        }
        if (isExternalQueueItem(result.item) && !isLessonExternalMedia(result.item.externalMedia)) {
            if (setNowPlayingQueue) setNowPlayingQueue(result.queue)
            playExternalMediaItem(result.item.externalMedia, mediaController, { play: true, fromUserGesture: true })
            return
        }
        if (!result.tune) {
            stopPlaylistPlayback(mediaController)
            return
        }
        if (setNowPlayingQueue) {
            setNowPlayingQueue(result.queue)
        }
        const nextItem = result.item
        const nextTune = result.tune
        const preferOpts = { queue: result.queue, preferMidi: !!(result.queue && result.queue.preferMidi) }
        if (navigate && shouldNavigateWithQueue(result.queue, navOpts)) {
            navigateToQueueTune(navigate, nextItem.tuneId, nextItem, tunebook, tunes, result.playbackTarget, preferOpts)
        }
        playQueueItem(mediaController, tunebook, nextTune, nextItem, Object.assign({
          fromUserGesture: true,
          playbackTarget: result.playbackTarget,
        }, preferOpts))
    }

    // Always settle on a fully-playable item (skips uncached library links when
    // resolver login is required) before resuming.
    const resumePlayability = {
        direction: 1,
        advanceFirst: false,
    }
    if (navOpts.accessToken !== undefined) {
        resumePlayability.accessToken = navOpts.accessToken
    } else if (mediaController && typeof mediaController.getGoogleAccessToken === 'function') {
        resumePlayability.accessToken = mediaController.getGoogleAccessToken()
    }
    if (navOpts.resolverStatus !== undefined) {
        resumePlayability.resolverStatus = navOpts.resolverStatus
    }
    advanceQueueToNextPlayable(queue, tunes, tunebook, resumePlayability).then(function(result) {
        if (
            tune
            && item
            && isQueueItemPlayable(tune, item, tunebook)
            && !result.atEnd
            && result.item
            && result.queue
            && result.queue.currentIndex === queue.currentIndex
        ) {
            tryResumeCurrent()
            return
        }
        finishResumeAt(result)
    })

    return true
}
