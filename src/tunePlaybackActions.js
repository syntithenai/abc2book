import {
  isQueueActive,
  startPreviewOnce,
  getCurrentItem,
  getCurrentTuneId,
} from './nowPlayingQueue'
import { playQueueItem, navigateToQueueTune, playCurrentQueueItem } from './nowPlayingQueuePlayback'
import { isQueuePlaybackEngaged } from './playbackNavigationUtils'

export { isQueuePlaybackEngaged }

function resolveTuneForPlayback(mediaController, location, queueContext) {
    const ctx = queueContext || {}
    const tunes = ctx.tunes
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

    if (mediaController.isMidiPlaybackRoute && mediaController.isMidiPlaybackRoute() && hasMusic) {
        return { type: 'midi' }
    }
    if (mediaController.isMediaPlaybackRoute && mediaController.isMediaPlaybackRoute() && hasLinks) {
        const linkNum = mediaController.mediaLinkNumber !== null && mediaController.mediaLinkNumber !== undefined
            ? mediaController.mediaLinkNumber : 0
        return { type: 'media', linkNum: linkNum }
    }
    if (location.pathname.indexOf('/playMidi') >= 0 && hasMusic) {
        return { type: 'midi' }
    }
    if (location.pathname.indexOf('/playMedia') >= 0 && hasLinks) {
        const parts = location.pathname.split('/playMedia/')
        const parsed = parts.length > 1 ? parseInt(parts[1], 10) : 0
        const linkNum = !isNaN(parsed) ? parsed : 0
        return { type: 'media', linkNum: linkNum }
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

function beginPlayback(mediaController, tunebook, navigate, location, tune, target) {
    const playState = target.type === 'midi' ? 'playMidi' : 'playMedia'
    const path = target.type === 'midi'
        ? '/tunes/' + tune.id + '/playMidi'
        : '/tunes/' + tune.id + '/playMedia/' + target.linkNum

    // NowPlayingHost reads mediaController.tune to mount the engine; set it
    // before arming intent so the host can appear without a MusicSingle mount.
    if (mediaController.setTune) {
        mediaController.setTune(tune)
    }
    if (target.type === 'midi') {
        mediaController.setMediaLinkNumber(null)
    } else {
        mediaController.setMediaLinkNumber(target.linkNum)
    }

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
    } else {
        mediaController.play({ fresh: true })
    }

    if (location.pathname !== path) {
        navigate(path)
    }
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
    if (hasLinks) target = { type: 'media', linkNum: 0 }
    else if (hasMusic) target = { type: 'midi' }
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
        const playingId = queue.items[queue.currentIndex] && queue.items[queue.currentIndex].tuneId
        if (playingId && playingId !== tune.id && !isQueuePlaybackEngaged(mediaController)) {
            // The queue exists (persisted across reloads) but nothing is
            // playing or paused. Asking "a playlist is already playing" would
            // be wrong, and leaving the queue active hands playback to the
            // background host so the viewed tune can never start. Discard the
            // idle queue and play the tune the user asked for.
            if (ctx.setNowPlayingQueue) {
                ctx.setNowPlayingQueue(null)
            }
        } else if (playingId && playingId !== tune.id) {
            if (ctx.skipQueueConfirm) {
                const previewQueue = startPreviewOnce(queue, tune.id)
                if (ctx.setNowPlayingQueue) ctx.setNowPlayingQueue(previewQueue)
                const item = {
                    tuneId: tune.id,
                    prefer: target.type === 'midi' ? 'midi' : 'media',
                    linkIndex: target.type === 'media' ? target.linkNum : undefined,
                }
                playQueueItem(mediaController, tunebook, tune, item, { fromUserGesture: true })
                return true
            }
            setQueuePlayConfirm({
                tuneId: tune.id,
                tuneName: tune.name || '',
                onPlayThisTune: function() {
                    const previewQueue = startPreviewOnce(queue, tune.id)
                    if (ctx.setNowPlayingQueue) ctx.setNowPlayingQueue(previewQueue)
                    const item = { tuneId: tune.id, prefer: target.type === 'midi' ? 'midi' : 'media', linkIndex: target.type === 'media' ? target.linkNum : undefined }
                    playQueueItem(mediaController, tunebook, tune, item, { fromUserGesture: true })
                },
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

export function resumePlaylistPlayback(mediaController, tunebook, navigate, queue, tunes) {
    if (!isQueueActive(queue)) return false
    const tuneId = getCurrentTuneId(queue)
    const item = getCurrentItem(queue)
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
