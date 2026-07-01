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

export function startTunePlayback(mediaController, tunebook, navigate, location) {
    const tune = mediaController.tune
    if (!tune) return false
    const target = resolvePlaybackTarget(mediaController, tunebook, location, tune)
    if (!target) return false

    if (target.type === 'midi') {
        mediaController.setMediaLinkNumber(null)
        const path = '/tunes/' + tune.id + '/playMidi'
        if (location.pathname !== path) navigate(path)
    } else {
        mediaController.setMediaLinkNumber(target.linkNum)
        const path = '/tunes/' + tune.id + '/playMedia/' + target.linkNum
        if (location.pathname !== path) navigate(path)
    }
    if (mediaController.playFromUserGesture) {
        mediaController.playFromUserGesture()
    } else {
        mediaController.play()
    }
    return true
}

export function startPracticeTunePlayback(mediaController, tunebook, navigate, tune, step) {
    if (!tune || !step) return false
    mediaController.setTune(tune)
    if (step.route === 'media' && tunebook.hasLinks(tune)) {
        const linkIndex = step.linkIndex != null ? step.linkIndex : 0
        mediaController.setMediaLinkNumber(linkIndex)
        const path = '/tunes/' + tune.id + '/playMedia/' + linkIndex
        if (navigate) navigate(path)
    } else {
        mediaController.setMediaLinkNumber(null)
        const path = '/tunes/' + tune.id + '/playMidi'
        if (navigate) navigate(path)
    }
    if (mediaController.playFromUserGesture) {
        mediaController.playFromUserGesture()
    } else {
        mediaController.play()
    }
    return true
}

export function toggleTunePlayback(mediaController, tunebook, navigate, location) {
    const tune = mediaController.tune
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
    return startTunePlayback(mediaController, tunebook, navigate, location)
}
