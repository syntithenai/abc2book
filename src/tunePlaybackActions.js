import {
  isQueueActive,
  startPreviewOnce,
  getCurrentItem,
  getCurrentTuneId,
  findQueueIndexForTuneId,
  resolvePlaybackForItem,
} from './nowPlayingQueue'
import { playQueueItem, navigateToQueueTune, playCurrentQueueItem } from './nowPlayingQueuePlayback'
import { advanceQueueToNextPlayable, isQueueItemPlayable, stopPlaylistPlayback } from './playlistPlaybackResilience'
import { isQueuePlaybackEngaged } from './playbackNavigationUtils'
import { hasFilteredPlaybackVoices } from './abcVoiceViewSettings'

export { isQueuePlaybackEngaged }

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
        mediaController.requestPlayback({
            tuneId: tune.id,
            playState: playState,
            linkNum: target.type === 'media' ? target.linkNum : null,
            fromUserGesture: true,
            fresh: true,
        })
    } else if (mediaController.playFromUserGesture) {
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

function requestQueueItemPlayback(mediaController, tunebook, navigate, location, tune, item) {
    const target = resolvePlaybackForItem(tune, item, tunebook)
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

/**
 * Start the given tune (media preferred, else midi).
 * Used by header next/prev when continuing an already-playing session.
 */
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

export function resumeTunePlayback(mediaController, viewedTuneId) {
    if (!mediaController) return false
    // Never resume paused/pending playback that belongs to a different tune
    // than the one the user is looking at — that silently restarts the old
    // tune's media and looks like the play button is broken.
    if (viewedTuneId && mediaController.tune && mediaController.tune.id !== viewedTuneId) {
        return false
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
    const tune = resolveTuneForPlayback(mediaController, location, queueContext)
    if (!tune) return false

    if (resumeTunePlayback(mediaController, tune.id)) {
        return true
    }

    const target = resolvePlaybackTarget(mediaController, tunebook, location, tune)
    if (!target) return false

    const ctx = queueContext || {}
    const queue = ctx.nowPlayingQueue
    const setQueuePlayConfirm = ctx.setQueuePlayConfirm

    if (isQueueActive(queue) && setQueuePlayConfirm) {
        const playingId = getCurrentTuneId(queue)
        const queueIndex = findQueueIndexForTuneId(queue, tune.id)

        if (queueIndex !== -1) {
            let activeQueue = queue
            if (ctx.setNowPlayingQueue) {
                const needsUpdate = queueIndex !== queue.currentIndex || queue.previewOnce
                if (needsUpdate) {
                    activeQueue = Object.assign({}, queue, {
                        currentIndex: queueIndex,
                        previewOnce: null,
                    })
                    ctx.setNowPlayingQueue(activeQueue)
                }
            }
            const item = activeQueue.items[queueIndex]
            requestQueueItemPlayback(
                mediaController,
                tunebook,
                navigate,
                location,
                tune,
                item
            )
            return true
        }

        if (playingId && playingId !== tune.id) {
            function startOutsideQueuePreview() {
                const previewQueue = startPreviewOnce(queue, tune.id)
                if (ctx.setNowPlayingQueue) ctx.setNowPlayingQueue(previewQueue)
                const item = {
                    tuneId: tune.id,
                    prefer: target.type === 'midi' ? 'midi' : 'media',
                    linkIndex: target.type === 'media' ? target.linkNum : undefined,
                }
                requestQueueItemPlayback(
                    mediaController,
                    tunebook,
                    navigate,
                    location,
                    tune,
                    item
                )
            }
            if (ctx.skipQueueConfirm || !isQueuePlaybackEngaged(mediaController)) {
                startOutsideQueuePreview()
                return true
            }
            setQueuePlayConfirm({
                tuneId: tune.id,
                tuneName: tune.name || '',
                onPlayThisTune: startOutsideQueuePreview,
                onResumePlaylist: function() {
                    // Navigation back to the current playlist tune is handled by AppQueueLayer.
                },
            })
            return true
        }
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
    if (resumeTunePlayback(mediaController, tune.id)) {
        return true
    }
    return startTunePlayback(mediaController, tunebook, navigate, location, queueContext)
}

export function resumePlaylistPlayback(mediaController, tunebook, navigate, queue, tunes, setNowPlayingQueue) {
    if (!isQueueActive(queue)) return false
    const tuneId = getCurrentTuneId(queue)
    const item = getCurrentItem(queue)
    const tune = tuneId && tunes ? tunes[tuneId] : null

    function tryResumeCurrent() {
        if (tuneId && navigate) {
            navigateToQueueTune(navigate, tuneId, item, tunebook, tunes)
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

    if (tune && item && isQueueItemPlayable(tune, item, tunebook)) {
        return tryResumeCurrent()
    }

    advanceQueueToNextPlayable(queue, tunes, tunebook, {
        direction: 1,
        advanceFirst: false,
    }).then(function(result) {
        if (result.atEnd || !result.tune || !result.item) {
            stopPlaylistPlayback(mediaController)
            return
        }
        if (setNowPlayingQueue) {
            setNowPlayingQueue(result.queue)
        }
        const nextItem = result.item
        const nextTune = result.tune
        if (navigate) {
            navigateToQueueTune(navigate, nextItem.tuneId, nextItem, tunebook, tunes)
        }
        playQueueItem(mediaController, tunebook, nextTune, nextItem, { fromUserGesture: true })
    })

    return true
}
