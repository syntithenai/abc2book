import {useEffect,useState, useRef} from 'react'
import ExternalMediaPitchTempo from './externalMediaPitchTempo'
import { getPlaybackSettings, playbackNeedsExternalProcessing } from './pitchTempoUtils'
import { parseMsToSeconds, getActivePlaybackLoop, getLinkRegionStart, getLinkRegionEnd, syncLegacyLinkLoopFields, ensureSingleActiveLoop } from './mediaPlaybackUtils'
import { downloadAndCacheExternalMedia, isExternalMediaCached, getExternalMediaMp3Blob } from './externalMediaAudioCache'
import useMediaResolverHealth from './useMediaResolverHealth'
import { isMediaProxyConfigured } from './mediaProxyClient'
import { syncPlaybackRoute } from './playbackRouteSync'
import {
    hasActivePlaybackIntent as intentHasActivePlayback,
    isPlaybackSupposedToBeRunning as intentIsPlaybackSupposedToBeRunning,
    isSeekGuardActive as intentIsSeekGuardActive,
    shouldSuppressSpuriousPause as intentShouldSuppressSpuriousPause,
    shouldIgnoreNativePlaybackEvents as intentShouldIgnoreNativePlaybackEvents,
    shouldBlockAutoplayDuringSeek as intentShouldBlockAutoplayDuringSeek,
    shouldBlockPlayDuringSeek as intentShouldBlockPlayDuringSeek,
    youtubeAutoplayAppearsBlocked as intentYoutubeAutoplayAppearsBlocked,
    shouldShowTapToPlayFromYoutubePoll as intentShouldShowTapToPlayFromYoutubePoll,
    shouldTriggerAutoplayRecovery as intentShouldTriggerAutoplayRecovery,
    canResumePlayback as intentCanResumePlayback,
    shouldConfirmPlayingStarted as intentShouldConfirmPlayingStarted,
    clampSeekRatio,
    resolveDisplaySeconds,
    beginSeekHold as computeSeekHoldUntil,
} from './playbackStateLogic'
import { trackAbcPlay, trackMediaPlay } from './analytics'
    
export default function useTuneBookMediaController(props) {
    const [currentTime, setCurrentTimeState] = useState(0)
    const currentTimeRef = useRef(0)
    function setCurrentTime(t) {
        const v = parseFloat(t) || 0
        currentTimeRef.current = v
        setCurrentTimeState(v)
    }
    const [clickSeek, setClickSeek] = useState(0)
    const [duration, setDuration] = useState(0) 
    var durationRef = null
    
    const [tune, setTuneState] = useState(null)
    var tuneRef = useRef(null)
    var regionEndGuardUntilRef = useRef(0)
    var onExternalTimeUpdateRef = useRef(null)
    var onExternalEndedRef = useRef(null)

    function commitTuneState(nextTune) {
        tuneRef.current = nextTune
        setTuneState(nextTune)
    }
    var [mediaLinkNumber, setMediaLinkNumberState] = useState(null)
    var mediaLinkNumberRef = useRef(null)
    var playbackRouteRef = useRef({ mode: 'none', mediaLinkNumber: null, playState: null })
    const [tapToPlay, setTapToPlay] = useState(false)
    const [playCancelled, setPlayCancelled] = useState(false)
    
    const [isPlaying, setIsPlaying] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [isReady, setIsReady] = useState(false)
    const [playbackSpeed, setPlaybackSpeed] = useState(1)
    
    var playerRef = useRef()
    var ytPlayerRef = useRef()
    
    var youtubeProgressInterval = useRef()
    var progressIntervalRef = useRef(null)
    var applyPlaybackSettingsLiveRef = useRef(null)
    var applyMidiTempoRef = useRef(null)
    var resumeSynthAudioContextRef = useRef(null)
    var pauseSynthRef = useRef(null)
    var stopMidiSynthRef = useRef(null)
    var playMidiRef = useRef(null)
    var resumeMidiAfterSeekRef = useRef(null)
    var seekMidiRef = useRef(null)
    var getMidiPlaybackSecondsRef = useRef(null)
    var userGesturePlayRef = useRef(false)
    var externalMediaRef = useRef(null)
    var sharedExternalAudioContextRef = useRef(null)
    var externalLoadToken = useRef(0)
    var externalLoadingRef = useRef(false)
    var externalLoadingSrcRef = useRef(null)
    var externalLoadedSrcRef = useRef(null)
    var externalLoadingPromiseRef = useRef(null)
    var pendingExternalSettingsRef = useRef(null)
    var externalMediaActiveRef = useRef(false)
    var externalHandoffGuardUntilRef = useRef(0)
    var seekGuardUntilRef = useRef(0)
    var seekInProgressRef = useRef(false)
    var seekWasPlayingRef = useRef(false)
    var seekTargetSecondsRef = useRef(0)
    var seekFromSecondsRef = useRef(0)
    var seekHoldUntilRef = useRef(0)
    var playingIntentRef = useRef(false)
    var userPausedRef = useRef(false)
    var routeReadyRef = useRef(false)
    var suppressNativePlaybackEventsRef = useRef(false)
    var youtubePlayPollTokenRef = useRef(0)
    const [externalMediaActive, setExternalMediaActive] = useState(false)
    const { available: mediaResolverAvailable, checked: mediaResolverChecked, refreshMediaResolverHealth } = useMediaResolverHealth()

    function getIntentSnapshot() {
        return {
            playingIntent: playingIntentRef.current,
            userPaused: userPausedRef.current,
            isPlayingUi: isPlaying,
            playCancelled: playCancelled,
            seekWasPlaying: seekWasPlayingRef.current,
            seekInProgress: seekInProgressRef.current,
            seekGuardUntil: seekGuardUntilRef.current,
        }
    }
    
    function hasPlayingIntent() {
        return playingIntentRef.current
    }

    function hasActivePlaybackIntent() {
        return intentHasActivePlayback(getIntentSnapshot())
    }

    function isPlaybackSupposedToBeRunning() {
        return intentIsPlaybackSupposedToBeRunning(getIntentSnapshot())
    }

    function captureSeekPlaybackIntent() {
        const wasPlaying = isPlaybackSupposedToBeRunning()
        seekWasPlayingRef.current = wasPlaying
        if (wasPlaying) {
            playingIntentRef.current = true
        }
        return wasPlaying
    }

    function holdPlayingStateDuringSeek(wasPlaying) {
        if (!wasPlaying || userPausedRef.current) return
        playingIntentRef.current = true
        confirmPlayingStarted()
    }

    function shouldBlockAutoplayDuringSeek(opts) {
        return intentShouldBlockAutoplayDuringSeek(getIntentSnapshot(), opts)
    }

    function syncPlaybackIntentFromUi() {
        if (isPlaying && !userPausedRef.current) {
            playingIntentRef.current = true
        }
    }

    function isSeekGuardActive() {
        return intentIsSeekGuardActive(getIntentSnapshot())
    }

    function markSeekGuard(ms) {
        const duration = ms || 3000
        seekGuardUntilRef.current = Date.now() + duration
    }

    function beginSeekOperation(ms) {
        seekInProgressRef.current = true
        markSeekGuard(ms)
    }

    function endSeekOperation() {
        seekInProgressRef.current = false
    }

    // Pin the displayed position to the seek target for a short window so the
    // bar cannot snap back while the active engine settles on the new position.
    function beginSeekHold(seconds, ms) {
        seekFromSecondsRef.current = currentTimeRef.current
        seekTargetSecondsRef.current = Math.max(0, parseFloat(seconds) || 0)
        seekHoldUntilRef.current = computeSeekHoldUntil(Date.now(), ms || 800)
    }

    function getSeekSettlement() {
        if (Date.now() < seekHoldUntilRef.current || isSeekGuardActive()) {
            return {
                target: seekTargetSecondsRef.current,
                from: seekFromSecondsRef.current,
            }
        }
        return null
    }

    function isMidiPlaybackRoute() {
        return playbackRouteRef.current.mode === 'midi'
    }

    function isMediaPlaybackRoute() {
        return playbackRouteRef.current.mode === 'media'
    }

    function getActiveMediaLinkNumber() {
        return mediaLinkNumberRef.current
    }

    function stopMidiPlayback() {
        if (pauseSynthRef.current) {
            pauseSynthRef.current()
        }
    }

    function stopLinkedMediaPlayback() {
        cleanupTimers()
        destroyExternalMedia()
        if (playerRef && playerRef.current) {
            try {
                playerRef.current.pause()
            } catch (e) {}
        }
        if (ytPlayerRef && ytPlayerRef.current) {
            try {
                ytPlayerRef.current.pauseVideo()
            } catch (e) {}
        }
    }

    function enforceExclusivePlayback(mode) {
        if (mode === 'media') {
            stopMidiPlayback()
        } else if (mode === 'midi') {
            stopLinkedMediaPlayback()
        }
    }

    function commitPlaybackRoute(result, playState) {
        mediaLinkNumberRef.current = result.mediaLinkNumber
        playbackRouteRef.current = {
            mode: result.mode,
            mediaLinkNumber: result.mediaLinkNumber,
            playState: playState,
        }
        setMediaLinkNumberState(result.mediaLinkNumber)
        enforceExclusivePlayback(result.mode)
    }

    function setMediaLinkNumber(linkIndex) {
        const mode = linkIndex === null ? 'midi' : 'media'
        commitPlaybackRoute({
            mode: mode,
            mediaLinkNumber: linkIndex,
            src: linkIndex === null ? '' : (tune ? getSrc(tune, linkIndex) : null),
        }, mode === 'midi' ? 'playMidi' : 'playMedia')
    }

    function applyPlaybackRoute(playState, mediaLinkNumberParam, tune, tunebook) {
        routeReadyRef.current = false
        const result = syncPlaybackRoute({
            playState: playState,
            mediaLinkNumberParam: mediaLinkNumberParam,
            tune: tune,
            hasNotesOrChords: function(t) { return tunebook.hasNotesOrChords(t) },
            getSrc: getSrc,
        })
        commitPlaybackRoute(result, playState)
        routeReadyRef.current = true
        return result
    }

    function maybeAutostart(playState, changeType, isFirstTuneLoad) {
        if (!routeReadyRef.current || playCancelled) return
        if (playState !== 'playMidi' && playState !== 'playMedia') return
        if (playbackRouteRef.current.mode === 'none') return

        if (changeType === 'playState') {
            if (!playingIntentRef.current) {
                playingIntentRef.current = true
                play()
            }
            return
        }

        if (changeType === 'tune' && (playingIntentRef.current || isFirstTuneLoad)) {
            playingIntentRef.current = true
            play()
            return
        }

        if (changeType === 'link' && playingIntentRef.current && !userPausedRef.current) {
            play()
        }
    }

    function cleanupTimers() {
        //console.log('CLEANUP TIMERS')
        clearInterval(youtubeProgressInterval.current)
        youtubeProgressInterval.current = null
        clearInterval(progressIntervalRef.current)
        progressIntervalRef.current = null
        cancelYoutubePlayPoll()
    }

    function cancelYoutubePlayPoll() {
        youtubePlayPollTokenRef.current += 1
    }

    // Sole writer of currentTime during media playback. getCurrentPlaybackSeconds
    // already pins the seek target during the hold window and ignores inactive
    // engines, so no extra guards are needed here.
    function syncPlaybackProgressFromSource() {
        if (!hasActivePlaybackIntent()) return
        const seconds = getCurrentPlaybackSeconds()
        if (seconds >= 0 && isFinite(seconds)) {
            setCurrentTime(seconds)
        }
    }

    function startProgressSync() {
        if (progressIntervalRef.current) return
        progressIntervalRef.current = setInterval(syncPlaybackProgressFromSource, 80)
    }

    function stopProgressSync() {
        clearInterval(progressIntervalRef.current)
        progressIntervalRef.current = null
    }

    function getGoogleAccessToken() {
        return props.token && props.token.access_token ? props.token.access_token : null
    }

    function canUseExternalPitchTempo(settings) {
        if (mediaLinkNumber === null || !tune) return false
        const src = getSrc(tune, mediaLinkNumber)
        const srcType = getSrcType(src)
        if (srcType !== 'audio' && srcType !== 'youtube') return false
        const resolved = settings || getPlaybackSettings(tune)
        if (!playbackNeedsExternalProcessing(resolved)) return false
        if (!isMediaProxyConfigured()) return false
        if (mediaResolverChecked && !mediaResolverAvailable) return false
        return true
    }

    function usesExternalPitchTempo() {
        return canUseExternalPitchTempo()
    }

    function needsExternalPitchTempoSettings(tempo, pitch, fineTune) {
        return playbackNeedsExternalProcessing({ tempo: tempo, pitch: pitch, fineTune: fineTune })
    }

    function applyNativeMediaPlaybackSettings(tempo) {
        const rate = parseFloat(tempo > 0 ? tempo : 1)
        if (playerRef.current) {
            playerRef.current.playbackRate = rate
        }
        if (ytPlayerRef.current) {
            try {
                ytPlayerRef.current.setPlaybackRate(rate)
            } catch (e) {}
        }
    }

    function setExternalMediaActiveState(active) {
        externalMediaActiveRef.current = active
        setExternalMediaActive(active)
    }

    function shouldIgnoreNativePlaybackEvents() {
        return intentShouldIgnoreNativePlaybackEvents(getIntentSnapshot(), {
            externalMediaActive: externalMediaActiveRef.current,
            suppressNativePlaybackEvents: suppressNativePlaybackEventsRef.current,
        })
    }

    function shouldSuppressSpuriousPause() {
        return intentShouldSuppressSpuriousPause(getIntentSnapshot())
    }

    function isExternalMediaConnected() {
        const processor = externalMediaRef.current
        if (!processor) return false
        if (typeof processor.isConnected === 'function') {
            return processor.isConnected()
        }
        if (typeof processor.connected === 'boolean') {
            return processor.connected
        }
        return !!externalMediaActiveRef.current
    }

    function acquireExternalAudioContext() {
        const Ctx = window.AudioContext || window.webkitAudioContext
        if (!Ctx) return null
        if (!sharedExternalAudioContextRef.current
            || sharedExternalAudioContextRef.current.state === 'closed') {
            sharedExternalAudioContextRef.current = new Ctx()
        }
        return sharedExternalAudioContextRef.current
    }

    // Returns a promise that resolves once outstanding resume() calls settle, so
    // callers can await a genuinely-running context before connecting. SoundTouch
    // can only be connected to a running AudioContext; resume() is async, so
    // checking ctx.state synchronously right after firing it always loses the race.
    function resumeExternalAudioContextFromGesture() {
        const pending = []
        try {
            const shared = acquireExternalAudioContext()
            if (shared && shared.state === 'suspended') {
                pending.push(shared.resume())
            }
            if (externalMediaRef.current && externalMediaRef.current.audioContext) {
                const processorCtx = externalMediaRef.current.audioContext
                if (processorCtx.state === 'suspended') {
                    pending.push(processorCtx.resume())
                }
            }
        } catch (e) {}
        if (pending.length === 0) return Promise.resolve()
        return Promise.all(pending.map(function(p) {
            return p && typeof p.then === 'function' ? p.catch(function() {}) : Promise.resolve()
        }))
    }

    // Poll the external AudioContext state until it is running or the timeout
    // elapses. Unlike awaiting resume(), this never hangs when there is no valid
    // user gesture (it simply times out and the caller falls back).
    function waitForExternalContextRunning(timeoutMs) {
        const deadline = Date.now() + (timeoutMs || 2000)
        return new Promise(function(resolve) {
            function check() {
                const ctx = externalMediaRef.current && externalMediaRef.current.audioContext
                    ? externalMediaRef.current.audioContext
                    : null
                if (!ctx) return resolve(false)
                if (ctx.state === 'running') return resolve(true)
                if (Date.now() >= deadline) return resolve(ctx.state === 'running')
                if (ctx.state === 'suspended') {
                    try { ctx.resume() } catch (e) {}
                }
                setTimeout(check, 100)
            }
            check()
        })
    }

    function destroyExternalMedia() {
        externalLoadToken.current++
        externalLoadingRef.current = false
        externalLoadingSrcRef.current = null
        externalLoadingPromiseRef.current = null
        pendingExternalSettingsRef.current = null
        externalLoadedSrcRef.current = null
        setExternalMediaActiveState(false)
        if (externalMediaRef.current) {
            externalMediaRef.current.destroy()
            externalMediaRef.current = null
        }
        unmuteNativePlayers()
    }

    function getActiveLink() {
        const currentTune = tuneRef.current || tune
        const linkIndex = mediaLinkNumberRef.current !== null && mediaLinkNumberRef.current !== undefined
            ? mediaLinkNumberRef.current
            : mediaLinkNumber
        if (currentTune && Array.isArray(currentTune.links) && currentTune.links.length > linkIndex && currentTune.links[linkIndex]) {
            return currentTune.links[linkIndex]
        }
        return null
    }

    function getLinkPlaybackStartOffset() {
        return getLinkRegionStart(getActiveLink())
    }

    function getLinkStartAt() {
        return getLinkRegionStart(getActiveLink())
    }

    function getLinkEndAt() {
        return getLinkRegionEnd(getActiveLink())
    }

    function getLinkPlaybackLoop() {
        return !!getActivePlaybackLoop(getActiveLink())
    }

    function getExternalPlaybackDuration() {
        if (externalMediaRef.current && externalMediaRef.current.duration > 0) {
            return externalMediaRef.current.duration
        }
        return 0
    }

    function shouldRouteMediaThroughExternal() {
        return !!(canUseExternalPitchTempo() && externalMediaRef.current && getExternalPlaybackDuration() > 0)
    }

    function readExternalPlaybackSeconds() {
        if (!externalMediaRef.current) return null
        const extDuration = getExternalPlaybackDuration()
        if (extDuration <= 0) return null
        const ratio = externalMediaRef.current.getPlaybackRatio()
        if (!isFinite(ratio) || ratio < 0) return null
        return ratio * extDuration
    }

    function getNativePlaybackDuration() {
        if (ytPlayerRef && ytPlayerRef.current) {
            try {
                const ytDuration = ytPlayerRef.current.getDuration()
                if (ytDuration > 0) return ytDuration
            } catch (e) {}
        }
        if (playerRef && playerRef.current && playerRef.current.duration > 0) {
            return playerRef.current.duration
        }
        return duration > 0 ? duration : 0
    }

    function resolvePlaybackDuration() {
        if (shouldRouteMediaThroughExternal()) {
            const ext = getExternalPlaybackDuration()
            if (ext > 0) return ext
        }
        const native = getNativePlaybackDuration()
        if (native > 0) return native
        const stateDuration = parseFloat(duration)
        return stateDuration > 0 ? stateDuration : 0
    }

    function seekToSeconds(seconds, seekOpts) {
        const routeOpts = seekOpts || {}
        const clamped = Math.max(0, parseFloat(seconds) || 0)
        const wasPlaying = routeOpts.wasPlaying !== undefined
            ? routeOpts.wasPlaying
            : captureSeekPlaybackIntent()
        if (!routeOpts.skipSeekOperation) {
            beginSeekOperation()
        }
        suppressRegionEndHandlers(2000)
        syncPlaybackIntentFromUi()
        holdPlayingStateDuringSeek(wasPlaying)
        beginSeekHold(clamped)
        setCurrentTime(clamped)

        if (isMidiPlaybackRoute()) {
            const total = resolvePlaybackDuration()
            const ratio = total > 0 ? Math.min(1, clamped / total) : 0
            if (ratio >= 0) {
                if (seekMidiRef.current) {
                    seekMidiRef.current(ratio)
                }
                setClickSeek(ratio)
            }
            if (wasPlaying) {
                startProgressSync()
                if (resumeMidiAfterSeekRef.current) {
                    resumeMidiAfterSeekRef.current()
                }
            }
            finalizeMediaSeek(wasPlaying, 'midi')
            return
        }

        if (shouldRouteMediaThroughExternal()) {
            externalHandoffGuardUntilRef.current = Date.now() + 2000
            regionEndGuardUntilRef.current = Date.now() + 2000
            const extDuration = getExternalPlaybackDuration()
            const ratio = extDuration > 0 ? Math.min(1, clamped / extDuration) : 0
            if (extDuration > 0) {
                if (isExternalMediaConnected()) {
                    externalMediaRef.current.disconnect()
                    setExternalMediaActiveState(false)
                }
                externalMediaRef.current.seek(ratio)
            }
            setClickSeek(ratio)
            if (wasPlaying) {
                resumeExternalAudioContextFromGesture()
                startProgressSync()
            }
            finalizeMediaSeek(wasPlaying, 'external')
            return
        }

        const nativeDuration = getNativePlaybackDuration()
        if (nativeDuration <= 0) {
            endSeekOperation()
            return
        }
        if (playerRef && playerRef.current) {
            playerRef.current.currentTime = clamped
            if (wasPlaying) {
                startProgressSync()
            }
            resumeMediaOutputSync('audio')
            finalizeMediaSeek(wasPlaying, 'audio')
            return
        }
        if (ytPlayerRef && ytPlayerRef.current) {
            try {
                ytPlayerRef.current.seekTo(clamped, true)
            } catch (e) {}
            if (wasPlaying) {
                startProgressSync()
            }
            resumeMediaOutputSync('youtube')
            finalizeMediaSeek(wasPlaying, 'youtube')
            return
        }
        endSeekOperation()
    }

    // The single engine that actually owns the playback clock right now.
    // Anything else (e.g. a muted native element while external processing is
    // active) is ignored so it cannot corrupt the position.
    function getActivePlaybackEngine() {
        if (playbackRouteRef.current.mode === 'midi') return 'midi'
        if (shouldRouteMediaThroughExternal()) {
            return isExternalOutputActive() ? 'external' : 'pending'
        }
        if (isExternalMediaConnected() && externalMediaRef.current && getExternalPlaybackDuration() > 0) {
            return 'external'
        }
        if (ytPlayerRef && ytPlayerRef.current && isYoutubePlayerReady()) return 'youtube'
        if (playerRef && playerRef.current) return 'audio'
        return 'none'
    }

    // Live clock reading from whichever engine is active. Returns null when the
    // active engine has no usable reading yet (caller falls back to stored).
    function readActiveEngineSeconds() {
        const engine = getActivePlaybackEngine()
        if (engine === 'midi') {
            return getMidiPlaybackSecondsRef.current ? getMidiPlaybackSecondsRef.current() : null
        }
        if (engine === 'external') {
            return readExternalPlaybackSeconds()
        }
        if (engine === 'youtube') {
            try {
                const t = ytPlayerRef.current.getCurrentTime()
                return isFinite(t) ? t : null
            } catch (e) {
                return null
            }
        }
        if (engine === 'audio') {
            const t = playerRef.current.currentTime
            return isFinite(t) ? t : null
        }
        return null
    }

    function readLivePlaybackSeconds() {
        const seconds = readActiveEngineSeconds()
        return seconds === null || seconds === undefined ? currentTimeRef.current : seconds
    }

    // Single source of truth for the displayed position. Every reader (progress
    // interval, slider, snapshots) routes through here.
    function getCurrentPlaybackSeconds() {
        return resolveDisplaySeconds({
            now: Date.now(),
            seekHoldUntil: seekHoldUntilRef.current,
            seekGuardUntil: seekGuardUntilRef.current,
            seekTargetSeconds: seekTargetSecondsRef.current,
            seekFromSeconds: seekFromSecondsRef.current,
            userPaused: userPausedRef.current,
            playingIntent: playingIntentRef.current,
            storedSeconds: currentTimeRef.current,
            engineSeconds: readActiveEngineSeconds(),
        })
    }

    function snapshotPlaybackPosition() {
        const seconds = readLivePlaybackSeconds()
        if (seconds >= 0 && isFinite(seconds)) {
            setCurrentTime(seconds)
            const total = resolvePlaybackDuration()
            if (total > 0) {
                setClickSeek(Math.min(1, seconds / total))
            }
        }
    }

    function resumeOutputAfterSeek() {
        if (userPausedRef.current) return
        syncPlaybackIntentFromUi()
        if (!seekWasPlayingRef.current && !isPlaybackSupposedToBeRunning()) return
        if (isMidiPlaybackRoute()) {
            return
        }
        startProgressSync()
        setIsPlaying(true)
        if (shouldRouteMediaThroughExternal()) {
            if (!isExternalMediaConnected()) {
                trySyncExternalHandoff({ seek: false })
            }
            confirmPlayingStarted()
            return
        }
        const linkIndex = mediaLinkNumberRef.current !== null && mediaLinkNumberRef.current !== undefined
            ? mediaLinkNumberRef.current
            : mediaLinkNumber
        const currentTune = tuneRef.current || tune
        const srcType = getSrcType(getSrc(currentTune, linkIndex))
        if (srcType === 'audio' && playerRef && playerRef.current) {
            try {
                if (playerRef.current.paused) {
                    playerRef.current.play().then(function() {
                        confirmPlayingStarted()
                    }).catch(function(e) {
                        if (isAutoplayBlockedError(e)) setTapToPlay(true)
                    })
                } else {
                    confirmPlayingStarted()
                }
            } catch (e) {}
            return
        }
        if (srcType === 'youtube' && isYoutubePlayerReady()) {
            resumeYoutubeAfterSeek()
        }
    }

    function canResumePlayback() {
        return intentCanResumePlayback(playbackRouteRef.current.mode, userPausedRef.current)
    }

    function restartPlaybackFromStart() {
        userPausedRef.current = false
        stopProgressSync()
        if (isMidiPlaybackRoute()) {
            setClickSeek(0)
            setCurrentTime(0)
            currentTimeRef.current = 0
            if (seekMidiRef.current) {
                // Reset synth position without starting audio — play() will run the
                // metronome count-in via startPrimedTune.
                seekMidiRef.current(0, { skipAutoResume: true })
            }
        } else if (isMediaPlaybackRoute()) {
            const startAt = getLinkStartAt()
            const total = resolvePlaybackDuration()
            const ratio = total > 0 ? startAt / total : 0
            setClickSeek(ratio)
            setCurrentTime(startAt)
            seekToSeconds(startAt)
        }
        playingIntentRef.current = true
        setPlayCancelled(false)
        resumeSynthAudioContextFromGesture()
        resumeExternalAudioContextFromGesture()
        play({ restart: true })
    }

    function loopCurrentRegion() {
        const startAt = getLinkStartAt()
        seekToSeconds(startAt)
        if (!playingIntentRef.current) return
        if (externalMediaRef.current) {
            if (!isExternalMediaConnected()) {
                playExternalMedia()
            }
            return
        }
        const src = getSrc(tune, mediaLinkNumber)
        const srcType = getSrcType(src)
        if (srcType === 'audio' && playerRef && playerRef.current) {
            try {
                if (playerRef.current.paused) playerRef.current.play()
            } catch (e) {}
        } else if (srcType === 'youtube' && ytPlayerRef && ytPlayerRef.current) {
            try {
                ytPlayerRef.current.playVideo()
            } catch (e) {}
        }
    }

    function pauseAtRegionStart() {
        playingIntentRef.current = false
        userGesturePlayRef.current = false
        setIsPlaying(false)
        setIsLoading(false)
        cleanupTimers()
        const startAt = getLinkStartAt()
        if (externalMediaRef.current) {
            externalMediaRef.current.disconnect()
            const extDuration = getExternalPlaybackDuration()
            if (extDuration > 0) {
                externalMediaRef.current.seek(startAt / extDuration)
            } else {
                externalMediaRef.current.seek(0)
            }
        }
        setCurrentTime(startAt)
        if (playerRef && playerRef.current) {
            playerRef.current.pause()
            playerRef.current.currentTime = startAt
            playerRef.current.volume = 1
        }
        if (ytPlayerRef && ytPlayerRef.current) {
            try {
                ytPlayerRef.current.pauseVideo()
            } catch (e) {}
            try {
                ytPlayerRef.current.seekTo(startAt, true)
            } catch (e) {}
            try {
                ytPlayerRef.current.unMute()
            } catch (e) {}
        }
    }

    function suppressRegionEndHandlers(ms) {
        regionEndGuardUntilRef.current = Date.now() + (ms || 500)
    }

    function handlePlaybackRegionEnd() {
        if (Date.now() < regionEndGuardUntilRef.current) {
            return false
        }
        if (getLinkPlaybackLoop()) {
            suppressRegionEndHandlers()
            loopCurrentRegion()
            return true
        }
        pauseAtRegionStart()
        return true
    }

    function updateLinkPlaybackLoops(linkIndex, playbackLoops) {
        const currentTune = tuneRef.current || tune
        if (!currentTune || !Array.isArray(currentTune.links) || !currentTune.links[linkIndex]) return
        const normalized = ensureSingleActiveLoop(playbackLoops.map(function(loop) {
            return Object.assign({}, loop)
        }))
        const links = currentTune.links.map(function(link, idx) {
            if (idx !== linkIndex) return link
            return syncLegacyLinkLoopFields(Object.assign({}, link, {
                playbackLoops: normalized,
            }))
        })
        const updated = Object.assign({}, currentTune, { links: links })
        const linkWithLoops = links[linkIndex]
        const active = getActivePlaybackLoop(linkWithLoops)
        commitTuneState(updated)
        if (!active) {
            suppressRegionEndHandlers(800)
            return
        }
        const activeLinkIndex = mediaLinkNumberRef.current !== null && mediaLinkNumberRef.current !== undefined
            ? mediaLinkNumberRef.current
            : mediaLinkNumber
        if (activeLinkIndex !== linkIndex || !playingIntentRef.current) return

        const endAt = getLinkRegionEnd(linkWithLoops)
        const now = getCurrentPlaybackSeconds()
        if (endAt > 0 && now >= endAt) {
            seekToSeconds(getLinkRegionStart(linkWithLoops))
        }
    }

    async function downloadExternalMedia(linkIndex) {
        if (!tune) throw new Error('No tune loaded')
        const idx = linkIndex !== undefined && linkIndex !== null ? linkIndex : mediaLinkNumber
        if (idx === null || !tune.links || !tune.links[idx] || !tune.links[idx].link) {
            throw new Error('No media link available')
        }
        const src = tune.links[idx].link
        const srcType = getSrcType(src)
        if (srcType === 'abc') throw new Error('Nothing to download for ABC playback')
        const safeName = (tune.name ? tune.name.trim().replace(/[^\w\-]+/g, '_') : 'tune') || 'tune'
        return downloadAndCacheExternalMedia({
            tuneId: tune.id,
            linkIndex: idx,
            src: src,
            srcType: srcType,
            youtubeGetId: props.tunebook.utils.YouTubeGetID,
            filename: safeName + '-link-' + (parseInt(idx, 10) + 1) + '.mp3',
            accessToken: getGoogleAccessToken(),
        })
    }

    async function checkExternalMediaCached(linkIndex) {
        if (!tune) return false
        const idx = linkIndex !== undefined && linkIndex !== null ? linkIndex : mediaLinkNumber
        if (idx === null || !tune.links || !tune.links[idx] || !tune.links[idx].link) {
            return false
        }
        const src = tune.links[idx].link
        return isExternalMediaCached(tune.id, idx, src)
    }

    async function saveExternalMediaToFile(linkIndex) {
        if (!tune) throw new Error('No tune loaded')
        const idx = linkIndex !== undefined && linkIndex !== null ? linkIndex : mediaLinkNumber
        if (idx === null || !tune.links || !tune.links[idx] || !tune.links[idx].link) {
            throw new Error('No media link available')
        }
        const src = tune.links[idx].link
        const srcType = getSrcType(src)
        if (srcType === 'abc') throw new Error('Nothing to download for ABC playback')
        const safeName = (tune.name ? tune.name.trim().replace(/[^\w\-]+/g, '_') : 'tune') || 'tune'
        const filename = safeName + '-link-' + (parseInt(idx, 10) + 1) + '.mp3'
        const result = await getExternalMediaMp3Blob({
            tuneId: tune.id,
            linkIndex: idx,
            src: src,
            srcType: srcType,
            youtubeGetId: props.tunebook.utils.YouTubeGetID,
            accessToken: getGoogleAccessToken(),
        })
        if (!result || !result.blob) throw new Error('Could not prepare audio file')
        const url = window.URL.createObjectURL(result.blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.setAttribute('download', filename)
        document.body.appendChild(anchor)
        anchor.click()
        document.body.removeChild(anchor)
        window.URL.revokeObjectURL(url)
        return true
    }

    function unmuteNativePlayers() {
        if (playerRef && playerRef.current) {
            playerRef.current.volume = 1
        }
        if (ytPlayerRef && ytPlayerRef.current) {
            try {
                ytPlayerRef.current.unMute()
            } catch (e) {}
        }
    }

    function isYoutubePlayerReady() {
        return !!(ytPlayerRef && ytPlayerRef.current && typeof ytPlayerRef.current.playVideo === 'function')
    }

    function resumeMediaOutputSync(mediaKind) {
        if (!seekWasPlayingRef.current || userPausedRef.current) return
        playingIntentRef.current = true

        if (mediaKind === 'youtube') {
            if (!isYoutubePlayerReady() || isExternalOutputActive()) return
            try {
                ytPlayerRef.current.playVideo()
                confirmPlayingStarted()
            } catch (e) {}
            return
        }

        if (mediaKind === 'audio' && playerRef && playerRef.current) {
            try {
                if (playerRef.current.paused) {
                    const playPromise = playerRef.current.play()
                    if (playPromise && playPromise.then) {
                        playPromise.then(function() {
                            confirmPlayingStarted()
                        }).catch(function(e) {
                            if (isAutoplayBlockedError(e)) setTapToPlay(true)
                        })
                    }
                } else {
                    confirmPlayingStarted()
                }
            } catch (e) {}
            return
        }

        if (mediaKind === 'external') {
            resumeExternalAudioContextFromGesture()
            if (!isExternalMediaConnected()) {
                trySyncExternalHandoff({ seek: false })
            }
            confirmPlayingStarted()
        }
    }

    function resumeYoutubeAfterSeek() {
        if (!isYoutubePlayerReady()) return
        if (userPausedRef.current || !hasActivePlaybackIntent()) return
        if (isExternalOutputActive()) return

        function tryResume() {
            if (!isYoutubePlayerReady() || userPausedRef.current || !hasActivePlaybackIntent()) return
            try {
                const state = ytPlayerRef.current.getPlayerState()
                if (state === 1) {
                    confirmPlayingStarted()
                } else if (state === 3) {
                    pollConfirmYoutubePlaying()
                } else if (state === 2 || state === 5) {
                    ytPlayerRef.current.playVideo()
                    pollConfirmYoutubePlaying()
                }
            } catch (e) {}
        }

        setTimeout(tryResume, 100)
        setTimeout(tryResume, 300)
        setTimeout(tryResume, 600)
    }

    function finalizeMediaSeek(wasPlaying, mediaKind) {
        if (!wasPlaying) {
            setTimeout(function() {
                endSeekOperation()
                seekWasPlayingRef.current = false
            }, 0)
            return
        }
        function resumeAfterSeek() {
            endSeekOperation()
            if (mediaKind === 'external' && isExternalMediaConnected()) {
                confirmPlayingStarted()
                return
            }
            resumeMediaOutputSync(mediaKind)
            if (mediaKind === 'youtube') {
                resumeYoutubeAfterSeek()
            }
        }
        setTimeout(resumeAfterSeek, 0)
        setTimeout(function() {
            if (!seekWasPlayingRef.current || userPausedRef.current) return
            if (mediaKind === 'external' && isExternalMediaConnected()) {
                confirmPlayingStarted()
                return
            }
            resumeMediaOutputSync(mediaKind)
            if (mediaKind === 'youtube') {
                resumeYoutubeAfterSeek()
            }
        }, 250)
        setTimeout(function() {
            seekWasPlayingRef.current = false
        }, 3000)
    }

    function isAutoplayBlockedError(err) {
        if (!err) return false
        if (err.name === 'NotAllowedError' || err.name === 'SecurityError') return true
        return typeof err.message === 'string'
            && /not allowed|user (?:didn't|did not) interact|autoplay/i.test(err.message)
    }

    function youtubeAutoplayAppearsBlocked() {
        if (!isYoutubePlayerReady()) return false
        try {
            const state = ytPlayerRef.current.getPlayerState()
            return intentYoutubeAutoplayAppearsBlocked(getIntentSnapshot(), state)
        } catch (e) {
            return false
        }
    }

    function ensureYoutubeProgressPolling() {
        if (!isYoutubePlayerReady() || isExternalOutputActive()) return
        if (youtubeProgressInterval.current) return
        youtubeProgressInterval.current = setInterval(function() {
            onYtTimeUpdate()
        }, 100)
    }

    function trackPlaybackStart(routeMode) {
        if (!userGesturePlayRef.current) return
        if (routeMode === 'midi') trackAbcPlay()
        else if (routeMode === 'media') trackMediaPlay()
    }

    function confirmPlayingStarted() {
        userGesturePlayRef.current = false
        setTapToPlay(false)
        if (!intentShouldConfirmPlayingStarted(getIntentSnapshot())) {
            setIsLoading(false)
            return
        }
        setIsPlaying(true)
        setIsLoading(false)
        startProgressSync()
        ensureYoutubeProgressPolling()
    }

    function pollConfirmYoutubePlaying() {
        const pollToken = youtubePlayPollTokenRef.current
        const delays = [100, 300, 600, 1200, 2500, 4000]
        delays.forEach(function(delay, index) {
            setTimeout(function() {
                if (pollToken !== youtubePlayPollTokenRef.current) return
                if (!playingIntentRef.current || playCancelled || userPausedRef.current) return
                try {
                    if (!isYoutubePlayerReady()) return
                    const state = ytPlayerRef.current.getPlayerState()
                    if (state === 1) {
                        confirmPlayingStarted()
                    } else if (intentShouldShowTapToPlayFromYoutubePoll(
                        getIntentSnapshot(),
                        pollToken,
                        youtubePlayPollTokenRef.current,
                        state,
                        index === delays.length - 1
                    )) {
                        setTapToPlay(true)
                        setIsLoading(false)
                    }
                } catch (e) {}
            }, delay)
        })
    }

    function abortPlayingIntent() {
        playingIntentRef.current = false
        userGesturePlayRef.current = false
        setIsPlaying(false)
        setIsLoading(false)
    }

    function resumeSynthAudioContextFromGesture() {
        if (resumeSynthAudioContextRef.current) {
            resumeSynthAudioContextRef.current()
        } else {
            try {
                var Ctx = window.AudioContext || window.webkitAudioContext
                if (Ctx) {
                    var probe = new Ctx()
                    if (probe.state === 'suspended') {
                        probe.resume()
                    }
                }
            } catch (e) {}
        }
    }

    function playFromUserGesture(options) {
        const opts = options || {}
        userGesturePlayRef.current = true
        setTapToPlay(false)
        setPlayCancelled(false)
        resumeSynthAudioContextFromGesture()
        resumeExternalAudioContextFromGesture()
        play(opts)
    }

    async function resumeAudioContextAndPlay() {
        setTapToPlay(false)
        setPlayCancelled(false)
        userGesturePlayRef.current = true
        resumeSynthAudioContextFromGesture()
        resumeExternalAudioContextFromGesture()
        play({ restart: false })
    }

    function muteNativePlayers() {
        suppressNativePlaybackEventsRef.current = true
        if (playerRef && playerRef.current) {
            playerRef.current.volume = 0
            playerRef.current.pause()
        }
        if (ytPlayerRef && ytPlayerRef.current) {
            try {
                ytPlayerRef.current.mute()
                ytPlayerRef.current.pauseVideo()
            } catch (e) {}
        }
        suppressNativePlaybackEventsRef.current = false
    }

    function applyNativeTempoBridge(settings) {
        if (settings.pitch === 0 && settings.fineTune === 0) {
            applyNativeMediaPlaybackSettings(settings.tempo)
        }
    }

    function trySyncExternalHandoff(options) {
        const opts = options || {}
        if (!externalMediaRef.current) {
            return { ok: false, reason: 'no-processor' }
        }
        if (isExternalMediaConnected()) {
            return { ok: true, alreadyConnected: true }
        }

        resumeExternalAudioContextFromGesture()
        const ctx = externalMediaRef.current.audioContext
        if (!ctx || ctx.state !== 'running') {
            return { ok: false, reason: 'context-not-running' }
        }

        if (opts.seek !== false) {
            const extDuration = getExternalPlaybackDuration()
            const now = getCurrentPlaybackSeconds()
            if (extDuration > 0 && now >= 0) {
                externalMediaRef.current.seek(Math.min(1, now / extDuration))
                setCurrentTime(now)
            }
        }

        if (!externalMediaRef.current.connectIfRunning()) {
            return { ok: false, reason: 'connect-failed' }
        }

        externalHandoffGuardUntilRef.current = Date.now() + 2000
        setExternalMediaActiveState(true)
        suppressNativePlaybackEventsRef.current = true
        muteNativePlayers()
        suppressNativePlaybackEventsRef.current = false
        return { ok: true }
    }

    // Position is owned by the progress interval (single writer). This handler
    // only drives region-end / loop detection.
    function onExternalTimeUpdate(time) {
        if (!hasActivePlaybackIntent()) return
        const endAt = getLinkEndAt()
        if (endAt > 0 && time >= endAt) {
            handlePlaybackRegionEnd()
        }
    }
    onExternalTimeUpdateRef.current = onExternalTimeUpdate

    function onExternalEnded() {
        if (isSeekGuardActive()) {
            return
        }
        if (seekWasPlayingRef.current && hasActivePlaybackIntent()) {
            return
        }
        if (Date.now() < externalHandoffGuardUntilRef.current) {
            return
        }
        if (Date.now() < regionEndGuardUntilRef.current) {
            return
        }
        if (userPausedRef.current) {
            return
        }
        if (getLinkPlaybackLoop()) {
            suppressRegionEndHandlers()
            loopCurrentRegion()
            return
        }
        if (getLinkEndAt() > 0) {
            pauseAtRegionStart()
            return
        }
        onEnded()
    }
    onExternalEndedRef.current = onExternalEnded

    function applyExternalMediaSettings(settings, options) {
        if (!externalMediaRef.current) return false
        const opts = options || {}
        const wasConnected = isExternalMediaConnected()
        const wantsOutput = hasActivePlaybackIntent()
            && opts.resumePlayback !== false
            && (opts.forcePlay || wasConnected || externalMediaActiveRef.current)

        if (wasConnected || playingIntentRef.current) {
            externalHandoffGuardUntilRef.current = Date.now() + 2000
        }
        externalMediaRef.current.applySettings(settings.tempo, settings.pitch, settings.fineTune)

        if (!wantsOutput) {
            return true
        }

        if (wasConnected) {
            setExternalMediaActiveState(true)
            confirmPlayingStarted()
            return true
        }

        const handoff = trySyncExternalHandoff()
        if (handoff.ok) {
            confirmPlayingStarted()
            return true
        }

        applyNativeTempoBridge(settings)
        if (handoff.reason === 'context-not-running') {
            return true
        }
        if (playingIntentRef.current && !userPausedRef.current) {
            setTapToPlay(true)
        }
        return false
    }

    async function prepareExternalMedia(forceSrc, playbackSettings, options) {
        const settings = playbackSettings || getPlaybackSettings(tune)
        if (!canUseExternalPitchTempo(settings)) {
            destroyExternalMedia()
            return false
        }
        const src = forceSrc || getSrc(tune, mediaLinkNumber)
        const srcType = getSrcType(src)
        if (!src || srcType === 'abc') return false
        const opts = options || {}

        if (externalMediaRef.current && externalLoadedSrcRef.current === src) {
            return applyExternalMediaSettings(settings, opts)
        }

        if (externalLoadingRef.current && externalLoadingSrcRef.current === src) {
            pendingExternalSettingsRef.current = settings
            if (externalLoadingPromiseRef.current) {
                return externalLoadingPromiseRef.current
            }
        }

        if (externalLoadedSrcRef.current !== src) {
            destroyExternalMedia()
        }

        const resumeAtLoadStart = getCurrentPlaybackSeconds()
        const token = ++externalLoadToken.current
        externalLoadingRef.current = true
        externalLoadingSrcRef.current = src
        pendingExternalSettingsRef.current = settings
        if (opts.showLoading !== false && !isPlaying) {
            setIsLoading(true)
        }

        const loadPromise = (async function() {
            try {
                const processor = new ExternalMediaPitchTempo(
                    function(time) {
                        if (onExternalTimeUpdateRef.current) onExternalTimeUpdateRef.current(time)
                    },
                    function() {
                        if (onExternalEndedRef.current) onExternalEndedRef.current()
                    },
                    acquireExternalAudioContext()
                )
                const youtubeGetId = props.tunebook.utils.YouTubeGetID
                const loadedDuration = await processor.load(src, srcType, youtubeGetId, {
                    tuneId: tune.id,
                    linkIndex: mediaLinkNumber,
                    accessToken: getGoogleAccessToken(),
                })
                if (token !== externalLoadToken.current) {
                    processor.destroy()
                    return false
                }
                if (!loadedDuration) {
                    processor.destroy()
                    return false
                }

                const finalSettings = pendingExternalSettingsRef.current || settings
                pendingExternalSettingsRef.current = null
                processor.applySettings(finalSettings.tempo, finalSettings.pitch, finalSettings.fineTune)
                let seekSeconds = getCurrentPlaybackSeconds()
                if (seekSeconds <= 0) seekSeconds = resumeAtLoadStart
                if (seekSeconds <= 0) seekSeconds = getLinkPlaybackStartOffset()
                if (loadedDuration > 0 && seekSeconds > 0) {
                    processor.seek(Math.min(1, seekSeconds / loadedDuration))
                }

                externalMediaRef.current = processor
                externalLoadedSrcRef.current = src
                setDuration(loadedDuration)
                setCurrentTime(seekSeconds)
                setIsReady(true)

                if (opts.autoPlay !== false && hasActivePlaybackIntent()) {
                    const applied = applyExternalMediaSettings(finalSettings, {
                        resumePlayback: true,
                        forcePlay: true,
                    })
                    if (!applied && opts.fallbackNative !== false && hasActivePlaybackIntent()) {
                        setExternalMediaActiveState(false)
                        playNativeMedia(srcType)
                        applyNativeMediaPlaybackSettings(finalSettings.tempo)
                    }
                    return applied
                }

                return true
            } catch (e) {
                console.log('External pitch/tempo load failed, using native playback', e)
                if (token === externalLoadToken.current) {
                    setExternalMediaActiveState(false)
                    unmuteNativePlayers()
                    if (opts.fallbackNative !== false && hasActivePlaybackIntent()) {
                        playNativeMedia(srcType)
                    }
                }
                return false
            } finally {
                if (token === externalLoadToken.current) {
                    externalLoadingRef.current = false
                    externalLoadingSrcRef.current = null
                    externalLoadingPromiseRef.current = null
                    setIsLoading(false)
                }
            }
        })()

        externalLoadingPromiseRef.current = loadPromise
        return loadPromise
    }

    function resolvePlaybackPositionSeconds(opts) {
        const o = opts || {}
        if (o.resumeAt !== undefined && o.resumeAt !== null) {
            return o.resumeAt
        }
        return Math.max(0, currentTimeRef.current)
    }

    function shouldPreservePlaybackPosition(opts, positionSeconds) {
        const o = opts || {}
        if (o.restart) return false
        if (o.preservePosition === false) return false
        if (o.preservePosition === true || o.resumeAt !== undefined || o.userResume) return true
        const regionStart = getLinkStartAt()
        return !!(playingIntentRef.current && !userPausedRef.current && positionSeconds > regionStart + 0.05)
    }

    async function playExternalMedia(options) {
        if (!externalMediaRef.current) return false
        const opts = options || {}
        if (shouldBlockAutoplayDuringSeek(opts)) {
            return true
        }
        try {
            const extDuration = getExternalPlaybackDuration()
            const regionStart = getLinkStartAt()
            const endAt = getLinkEndAt()
            const now = resolvePlaybackPositionSeconds(opts)
            const preservePosition = shouldPreservePlaybackPosition(opts, now)

            if (isExternalOutputActive() && preservePosition && !opts.restart && !opts.forceReconnect) {
                confirmPlayingStarted()
                return true
            }
            const finished = !preservePosition && (endAt > 0
                ? now >= endAt - 0.05
                : (extDuration > 0 && now >= extDuration - 0.25))
            if (extDuration > 0) {
                if (finished) {
                    externalMediaRef.current.seek(regionStart / extDuration)
                    setCurrentTime(regionStart)
                } else {
                    const targetRatio = Math.min(1, Math.max(0, now / extDuration))
                    externalMediaRef.current.seek(targetRatio)
                    setCurrentTime(now)
                }
            }
            resumeExternalAudioContextFromGesture()
            let handoff = trySyncExternalHandoff({ seek: false })
            if (!handoff.ok && handoff.reason === 'context-not-running') {
                // resume() is async: the context often becomes 'running' a few
                // hundred ms after the gesture. Poll (without blocking the UI on a
                // resume promise that may never resolve outside a gesture) and retry.
                const running = await waitForExternalContextRunning(2500)
                if (!playingIntentRef.current || userPausedRef.current) {
                    return false
                }
                if (running) {
                    handoff = trySyncExternalHandoff({ seek: false })
                }
            }
            if (!handoff.ok) {
                unmuteNativePlayers()
                if (handoff.reason === 'context-not-running' && playingIntentRef.current && !userPausedRef.current) {
                    setTapToPlay(true)
                }
                return false
            }
            externalHandoffGuardUntilRef.current = Date.now() + 2000
            confirmPlayingStarted()
            return true
        } catch (e) {
            console.log('External pitch/tempo play failed', e)
            unmuteNativePlayers()
            if (playingIntentRef.current) {
                setTapToPlay(true)
            }
            return false
        }
    }
    
    var midiHash = useRef()
    function forceMidiChange() {
        midiHash.current = Math.random()* 1000000000
    }
    //forceMidiChange()
    useEffect(function() {
         const snapshot = getIntentSnapshot()
         if (intentIsSeekGuardActive(snapshot)) return
         if (intentShouldTriggerAutoplayRecovery(snapshot, { tapToPlay: tapToPlay, isLoading: isLoading })) {
             play({ preservePosition: true })
         }
     },[tapToPlay, playCancelled, mediaLinkNumber, isPlaying, isLoading])
    
    function getSrc(tune, mediaLinkNumber) {
        if (tune) {
            if (mediaLinkNumber !== null && parseInt(mediaLinkNumber) != NaN) {
                if (Array.isArray(tune.links) && tune.links.length > mediaLinkNumber && tune.links[mediaLinkNumber] && tune.links[mediaLinkNumber].link) {
                    //console.log('GETSRC GOT ',mediaLinkNumber,tune.links[mediaLinkNumber].link)
                    return tune.links[mediaLinkNumber].link
                } else {
                    //console.log('GETSRC mediaLinkNumber not available',mediaLinkNumber,tune.links)
                    if (Array.isArray(tune.links) && tune.links.length > 0 && tune.links[0] && tune.links[0].link) {
                        //console.log('GETSRC fallback ',0,tune.links[0].link)
                        return tune.links[0].link
                    } else {
                        return ''
                    }
                }
            } else {
                //console.log('GETSRC mediaLinkNumber not a number',mediaLinkNumber)
                return ''
            }
        } else {
            //console.log('GETSRC no tune',mediaLinkNumber)
            return ''
        }
    }
    
    function getSrcType(src) {
        if (src && src.trim()) {
            return props.tunebook.utils.isYoutubeLink(src) ? 'youtube' : 'audio'
        } else {
            return 'abc'
        }
    }
    
    function setTune(t) {
        commitTuneState(t)
        if (t) {
            const tempo = t.playbackTempo > 0 ? parseFloat(t.playbackTempo) : 1
            setPlaybackSpeed(tempo)
        }
    }

    function updateTunePlaybackSettings(tempo, pitch, fineTune) {
        const currentTune = tuneRef.current || tune
        if (!currentTune) return
        const settings = {
            tempo: tempo,
            pitch: pitch,
            fineTune: fineTune,
        }
        const updated = Object.assign({}, currentTune, {
            playbackTempo: tempo,
            playbackPitch: pitch,
            playbackFineTune: fineTune,
        })
        commitTuneState(updated)
        setPlaybackSpeed(tempo)

        if (isMidiPlaybackRoute()) {
            if (applyMidiTempoRef.current) {
                applyMidiTempoRef.current(tempo, pitch, fineTune)
            }
            return
        }

        if (!isMediaPlaybackRoute()) {
            return
        }

        if (playbackNeedsExternalProcessing(settings)) {
            resumeExternalAudioContextFromGesture()
        }

        const linkIndex = mediaLinkNumberRef.current !== null && mediaLinkNumberRef.current !== undefined
            ? mediaLinkNumberRef.current
            : mediaLinkNumber
        const currentSrc = getSrc(currentTune, linkIndex)
        const srcType = getSrcType(currentSrc)
        const wantsExternal = canUseExternalPitchTempo(settings)
        const playingNow = playingIntentRef.current

        if (externalMediaRef.current && externalLoadedSrcRef.current === currentSrc) {
            applyExternalMediaSettings(settings, { resumePlayback: true, forcePlay: playingNow })
            return
        }

        if (wantsExternal) {
            const resumeAt = getCurrentPlaybackSeconds()
            const tempoOnly = settings.pitch === 0 && settings.fineTune === 0
            if (tempoOnly && playingNow && !isExternalMediaConnected()) {
                applyNativeMediaPlaybackSettings(tempo)
                if (!externalLoadingRef.current) {
                    prepareExternalMedia(undefined, settings, {
                        autoPlay: false,
                        showLoading: false,
                        fallbackNative: false,
                    })
                } else {
                    pendingExternalSettingsRef.current = settings
                }
                return
            }
            prepareExternalMedia(undefined, settings, {
                autoPlay: playingNow,
                showLoading: false,
                fallbackNative: true,
            }).then(function(loaded) {
                if (!loaded && playingNow) {
                    playNativeMedia(srcType)
                    applyNativeMediaPlaybackSettings(tempo)
                    if (resumeAt > 0) seekToSeconds(resumeAt)
                }
            })
        } else {
            if (externalMediaRef.current || externalMediaActiveRef.current) {
                const resumeAt = getCurrentPlaybackSeconds()
                destroyExternalMedia()
                if (playingNow) {
                    playNativeMedia(srcType)
                    if (resumeAt > 0 && duration > 0) {
                        seekToSeconds(resumeAt)
                    }
                }
            }
            applyNativeMediaPlaybackSettings(tempo)
        }
    }

    function onAbcTimeUpdate(time) {
        if (Date.now() < seekHoldUntilRef.current) return
        if (isExternalOutputActive()) return
        if (hasActivePlaybackIntent()) {
            setCurrentTime(time)
        }
    }
  
    // Position is owned by the progress interval (single writer). This handler
    // only drives region-end / loop detection for the native audio element.
    function onTimeUpdate() {
        if (!playerRef.current || !hasActivePlaybackIntent()) return
        if (tune && Array.isArray(tune.links) && tune.links.length > mediaLinkNumber) {
            if (tune.links[mediaLinkNumber] && getLinkEndAt() > 0 && playerRef.current.currentTime >= getLinkEndAt()) {
                handlePlaybackRegionEnd()
            }
        }
    }
   
    
    // Position is owned by the progress interval (single writer). This handler
    // only drives region-end / loop detection for the YouTube player.
    function onYtTimeUpdate() {
        if (!ytPlayerRef.current || !hasActivePlaybackIntent()) return
        const endAt = getLinkEndAt()
        if (endAt > 0 && ytPlayerRef.current.getCurrentTime() >= endAt) {
            handlePlaybackRegionEnd()
        }
    }
    
    
    function onEnded() { 
        cleanupTimers()
        if (mediaLinkNumber !== null && getLinkEndAt() > 0) {
            pauseAtRegionStart()
            return
        }
        props.tunebook.navigateToNextSong(null,function() {
            stop()
            setIsLoading(false)
        })
    }
    
    function onError(e) {
        console.log('ERROR',e)
        setIsPlaying(false)
        setIsLoading(false)
        cleanupTimers()
    }
    
    
    function onMediaReady(e) {
        cleanupTimers()
        if (isSeekGuardActive()) {
            setIsReady(true)
            return
        }
        if (externalMediaActiveRef.current && externalMediaRef.current) {
            setIsReady(true)
            if (hasActivePlaybackIntent()) {
                playExternalMedia()
            }
            return
        }
        const extDuration = getExternalPlaybackDuration()
        if (extDuration > 0) {
            setDuration(extDuration)
        } else if (e.target && e.target.duration > 0) {
            setDuration(e.target.duration)
        }
        if (hasActivePlaybackIntent() && !externalMediaActiveRef.current) {
            if (externalMediaRef.current && canUseExternalPitchTempo()) {
                playExternalMedia().then(function(ok) {
                    if (!ok && hasActivePlaybackIntent()) {
                        playNativeMedia(getSrcType(getSrc(tune, mediaLinkNumber)))
                    }
                })
                return
            }
            playNativeMedia(getSrcType(getSrc(tune, mediaLinkNumber)))
        }
        if (!externalMediaActiveRef.current) {
            setIsReady(true)
            applyNativeMediaPlaybackSettings(playbackSpeed)
        }
    }

    function onYtReady(e) {
        if (ytPlayerRef.current) {
            cleanupTimers()
            ytPlayerRef.current = e.target
            if (isSeekGuardActive()) {
                setIsReady(true)
                return
            }
            if (externalMediaActiveRef.current && externalMediaRef.current) {
                setIsReady(true)
                if (hasActivePlaybackIntent()) {
                    playExternalMedia()
                }
                return
            }
            setIsReady(true)
            applyNativeMediaPlaybackSettings(playbackSpeed)
            const extDuration = getExternalPlaybackDuration()
            if (extDuration > 0) {
                setDuration(extDuration)
            } else {
                setDuration(e.target.getDuration())
            }
            setCurrentTime(getLinkStartAt())
            if (hasActivePlaybackIntent()) {
                if (externalMediaRef.current && canUseExternalPitchTempo()) {
                    playExternalMedia().then(function(ok) {
                        if (!ok && hasActivePlaybackIntent()) {
                            playNativeMedia('youtube')
                        }
                    })
                } else {
                    playNativeMedia('youtube')
                }
            }
        }
        ytPlayerRef.current = e.target
    }
    
    
    function isExternalOutputActive() {
        return isExternalMediaConnected() || externalMediaActiveRef.current
    }

    function onYtStateChange(e) {
         if (isExternalOutputActive()) {
             if (e.data === 3) {
                 setIsLoading(true)
             } else {
                 setIsLoading(false)
             }
             return
         }
         if (isSeekGuardActive() && (e.data === 0 || e.data === -1 || e.data === 5)) {
             return
         }
         if (isSeekGuardActive() && e.data === 2) {
             if (seekWasPlayingRef.current && hasActivePlaybackIntent() && !isExternalOutputActive()) {
                 try {
                     ytPlayerRef.current.playVideo()
                     confirmPlayingStarted()
                 } catch (err) {}
             }
             return
         }
         if (ytPlayerRef.current && !externalMediaActiveRef.current) {
             applyNativeMediaPlaybackSettings(playbackSpeed)
         }
        if (e.data === 1) {
            cleanupTimers()
            youtubeProgressInterval.current = setInterval(function() {
                onYtTimeUpdate()
            }, 100)
            confirmPlayingStarted()
        } else if (e.data === -1) {
            cleanupTimers()
            setIsLoading(false)
            if (playingIntentRef.current && !userPausedRef.current) {
                const resumePos = currentTimeRef.current
                playNativeMedia('youtube', {
                    preservePosition: resumePos > 0.05,
                    userResume: resumePos > 0.05,
                })
            }
        } else if (e.data === 0) {
            cleanupTimers()
            if (Date.now() < regionEndGuardUntilRef.current) {
                return
            }
            if (getLinkPlaybackLoop()) {
                suppressRegionEndHandlers()
                loopCurrentRegion()
            } else if (getLinkEndAt() > 0) {
                pauseAtRegionStart()
            } else {
                onEnded()
            }
        } else if (e.data === 2) {
            if (shouldSuppressSpuriousPause()) {
                if (!isSeekGuardActive() && hasActivePlaybackIntent() && !isExternalOutputActive()) {
                    resumeYoutubeAfterSeek()
                }
                return
            }
            cleanupTimers()
            setIsLoading(false)
            if (userPausedRef.current || !playingIntentRef.current) {
                setIsPlaying(false)
            }
        } else if (e.data === 3) {
            setIsLoading(true)
        } else if (e.data === 5) {
            cleanupTimers()
            setIsLoading(false)
            if (playingIntentRef.current && !userPausedRef.current) {
                playNativeMedia('youtube', { preservePosition: true, userResume: true })
            }
        }
        
    }
    

    // PLAYBACK CONTROLS

    function play(options) {
        const opts = options || {}
        if (intentShouldBlockPlayDuringSeek(getIntentSnapshot(), opts)) {
            return
        }
        // Idempotency guard: if we are already actively playing this content,
        // ignore redundant play() calls so they can never stack concurrent
        // outputs (multiple MIDI voices, double audio, etc.). Resume-from-pause
        // (userPaused), restart, and fresh starts are explicitly allowed through.
        if (!opts.restart && !opts.fresh
            && playingIntentRef.current
            && isPlaying
            && !userPausedRef.current) {
            return
        }
        if (opts.fresh) {
            userPausedRef.current = false
        }
        const useTune = tuneRef.current || tune
        const route = playbackRouteRef.current
        const linkIndex = getActiveMediaLinkNumber()

        if (userPausedRef.current && !opts.restart) {
            const resumeAt = currentTimeRef.current
            userPausedRef.current = false
            playingIntentRef.current = true
            setPlayCancelled(false)
            setTapToPlay(false)
            cancelYoutubePlayPoll()
            setIsLoading(true)

            if (route.mode === 'midi') {
                resumeSynthAudioContextFromGesture()
                if (playMidiRef.current) {
                    playMidiRef.current()
                } else {
                    forceMidiChange()
                }
                return
            }

            if (route.mode === 'media') {
                const srcType = getSrcType(getSrc(useTune, linkIndex))
                resumeSynthAudioContextFromGesture()
                resumeExternalAudioContextFromGesture()
                if (canUseExternalPitchTempo() && externalMediaRef.current) {
                    playExternalMedia({ resumeAt: resumeAt, preservePosition: true, userResume: true }).then(function(ok) {
                        if (!ok && hasActivePlaybackIntent()) {
                            playNativeMedia(srcType, { preservePosition: true, userResume: true })
                        } else if (!ok) {
                            setIsPlaying(false)
                            setIsLoading(false)
                        }
                    })
                    return
                }
                playNativeMedia(srcType, { preservePosition: true, userResume: true })
                return
            }
            setIsLoading(false)
            return
        }

        userPausedRef.current = false
        playingIntentRef.current = true
        setPlayCancelled(false)
        if (props.forceRefresh) props.forceRefresh()

        if (route.mode === 'midi') {
            stopLinkedMediaPlayback()
            if (resumeSynthAudioContextRef.current) {
                resumeSynthAudioContextRef.current()
            }
            trackPlaybackStart('midi')
            setIsLoading(true)
            if (playMidiRef.current) {
                playMidiRef.current()
            } else {
                forceMidiChange()
            }
            return
        }

        if (route.mode !== 'media') {
            return
        }

        trackPlaybackStart('media')

        stopMidiPlayback()
        const src = getSrc(useTune, linkIndex)
        const srcType = getSrcType(src)

        setIsLoading(true)

        if (canUseExternalPitchTempo()) {
            const preserveMediaPosition = !opts.restart && opts.preservePosition !== false
            if (externalMediaRef.current) {
                playExternalMedia({ preservePosition: preserveMediaPosition }).then(function(ok) {
                    if (!ok && playingIntentRef.current) {
                        playNativeMedia(srcType, { preservePosition: preserveMediaPosition })
                    }
                })
                return
            }
            if (externalLoadingRef.current && externalLoadingPromiseRef.current) {
                externalLoadingPromiseRef.current.then(function(loaded) {
                    if (loaded && playingIntentRef.current) {
                        playExternalMedia({ preservePosition: preserveMediaPosition }).then(function(ok) {
                            if (!ok && playingIntentRef.current) {
                                playNativeMedia(srcType, { preservePosition: preserveMediaPosition })
                            }
                        })
                    } else if (!loaded && playingIntentRef.current) {
                        playNativeMedia(srcType, { preservePosition: preserveMediaPosition })
                    }
                })
                return
            }
            prepareExternalMedia(src, undefined, { autoPlay: true, showLoading: true }).then(function(loaded) {
                if (!loaded && playingIntentRef.current) {
                    playNativeMedia(srcType, { preservePosition: preserveMediaPosition })
                }
            })
            return
        }

        if (externalMediaActiveRef.current || externalMediaRef.current) {
            destroyExternalMedia()
        }
        playNativeMedia(srcType, { preservePosition: false })
    }

    function playNativeMedia(srcType, options) {
        const opts = options || {}
        if (shouldBlockAutoplayDuringSeek(opts)) {
            return
        }
        unmuteNativePlayers()
        if (srcType === 'audio' && playerRef && playerRef.current) {
            try {
                const regionStart = getLinkStartAt()
                const currentPos = playerRef.current.currentTime
                const preserve = opts.preservePosition
                    || (playingIntentRef.current && !userPausedRef.current && currentPos > regionStart + 0.05)
                if (!preserve) {
                    if (playerRef.current.ended) {
                        playerRef.current.currentTime = regionStart
                        setCurrentTime(regionStart)
                    } else if (regionStart > 0 && currentPos < regionStart - 0.05) {
                        playerRef.current.currentTime = regionStart
                        setCurrentTime(regionStart)
                    }
                }
                playerRef.current.play().then(
                    function() {
                        confirmPlayingStarted()
                    }).catch(function(e) {
                        if (isAutoplayBlockedError(e)) {
                            setTapToPlay(true)
                        }
                        setIsPlaying(false)
                        setIsLoading(false)
                    })
            } catch (e) {
                abortPlayingIntent()
                console.log(e)
            }
        } else if (srcType === 'youtube') {
            if (isYoutubePlayerReady()) {
                try {
                    const regionStart = getLinkStartAt()
                    ytPlayerRef.current.unMute()
                    let currentPos = 0
                    try {
                        currentPos = ytPlayerRef.current.getCurrentTime()
                    } catch (e) {}
                    const preserve = opts.preservePosition
                        || (playingIntentRef.current && !userPausedRef.current && currentPos > regionStart + 0.05)
                    if (!preserve) {
                        if (regionStart > 0 && currentPos < regionStart - 0.05) {
                            ytPlayerRef.current.seekTo(regionStart, true)
                            setCurrentTime(regionStart)
                        }
                    }
                    ytPlayerRef.current.playVideo()
                    pollConfirmYoutubePlaying()
                } catch (e) {
                    console.log("YT play err", e)
                    if (isAutoplayBlockedError(e)) {
                        setTapToPlay(true)
                    }
                    setIsLoading(false)
                }
            } else if (playingIntentRef.current) {
                // Iframe still loading — onYtReady will call playNativeMedia when ready.
                setIsLoading(true)
            } else {
                setIsLoading(false)
            }
        } else {
            setIsLoading(false)
        }
    }
    
    function pause() {
        seekWasPlayingRef.current = false
        userPausedRef.current = true
        cancelYoutubePlayPoll()
        setTapToPlay(false)
        stopProgressSync()
        cleanupTimers()
        snapshotPlaybackPosition()
        userGesturePlayRef.current = false
        setIsPlaying(false)
        setIsLoading(false)
        if (isMidiPlaybackRoute() && pauseSynthRef.current) {
            pauseSynthRef.current()
        }
        if (externalMediaRef.current) {
            externalMediaRef.current.disconnect()
            setExternalMediaActiveState(false)
        }
        if (playerRef && playerRef.current) {
            try {
                playerRef.current.pause()
                playerRef.current.volume = 1
            } catch (e) {}
        }
        if (ytPlayerRef && ytPlayerRef.current) {
            try {
                ytPlayerRef.current.pauseVideo()
            } catch (e) {}
        }
    }

    function stop() {
        seekWasPlayingRef.current = false
        playingIntentRef.current = false
        userPausedRef.current = false
        userGesturePlayRef.current = false
        stopProgressSync()
        setIsPlaying(false)
        setIsLoading(false)
        cleanupTimers()
        const startAt = getLinkStartAt()
        if (mediaLinkNumber === null && stopMidiSynthRef.current) {
            stopMidiSynthRef.current()
        }
        if (externalMediaRef.current) {
            externalMediaRef.current.disconnect()
            const extDuration = getExternalPlaybackDuration()
            if (extDuration > 0) {
                externalMediaRef.current.seek(startAt / extDuration)
            } else {
                externalMediaRef.current.seek(0)
            }
        }
        setCurrentTime(startAt)
        if (playerRef && playerRef.current) {
            playerRef.current.pause()
            playerRef.current.currentTime = startAt
            playerRef.current.volume = 1
        }
        if (ytPlayerRef && ytPlayerRef.current) {
            try {
                ytPlayerRef.current.pauseVideo()
            } catch (e) {}
            try {
                ytPlayerRef.current.seekTo(startAt, true)
            } catch (e) {}
            try {
                ytPlayerRef.current.unMute()
            } catch (e) {}
        }
    }
    
    function seek(val) {
        const clamped = clampSeekRatio(val)
        if (clamped === null) return
        const wasPlaying = captureSeekPlaybackIntent()
        beginSeekOperation()
        syncPlaybackIntentFromUi()
        if (wasPlaying) {
            resumeSynthAudioContextFromGesture()
            resumeExternalAudioContextFromGesture()
        }
        holdPlayingStateDuringSeek(wasPlaying)

        if (isMidiPlaybackRoute()) {
            suppressRegionEndHandlers(2000)
            const total = resolvePlaybackDuration()
            if (total > 0) {
                beginSeekHold(total * clamped)
                setCurrentTime(total * clamped)
            }
            if (seekMidiRef.current) {
                seekMidiRef.current(clamped)
            }
            setClickSeek(clamped)
            if (wasPlaying) {
                startProgressSync()
                if (resumeMidiAfterSeekRef.current) {
                    resumeMidiAfterSeekRef.current()
                }
            }
            finalizeMediaSeek(wasPlaying, 'midi')
            return
        }

        const total = resolvePlaybackDuration()
        if (total <= 0) {
            endSeekOperation()
            return
        }
        seekToSeconds(total * clamped, { wasPlaying: wasPlaying, skipSeekOperation: true })
    }

    function rewindToStart() {
        const wasActive = hasActivePlaybackIntent() || isPlaying
        if (wasActive) {
            restartPlaybackFromStart()
            return
        }
        const startAt = playbackRouteRef.current.mode === 'media' ? getLinkStartAt() : 0
        const ratio = duration > 0 ? startAt / duration : 0
        seek(ratio)
    }

    function getPlaybackProgress() {
        const total = resolvePlaybackDuration()
        const rawTime = getCurrentPlaybackSeconds()
        const time = parseFloat(rawTime)
        const safeTime = isNaN(time) || !isFinite(time) ? 0 : Math.max(0, time)
        return {
            currentTime: safeTime,
            duration: total,
            ratio: total > 0 ? Math.max(0, Math.min(1, safeTime / total)) : 0,
        }
    }
    
    function checkAudioContext() {
        // check if AudioContext is supported in the browser
        if (typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined') {
          // create a temporary AudioContext to test if it's allowed
          var context = new (window.AudioContext || window.webkitAudioContext)();
          // check if the context was successfully created
          return (context.state === 'running') 
        } else {
          console.log('AudioContext is not supported in this browser.');
          return false
        }
    }

    useEffect(function() {
        if (process.env.NODE_ENV !== 'development') return undefined
        window.__abc2bookPlaybackTest = {
            seek: seek,
            rewindToStart: rewindToStart,
            restartPlaybackFromStart: restartPlaybackFromStart,
            getProgress: getPlaybackProgress,
            debug: function() {
                return {
                    progress: getPlaybackProgress(),
                    engine: getActivePlaybackEngine(),
                    engineSeconds: readActiveEngineSeconds(),
                    routeMode: playbackRouteRef.current.mode,
                    routeExternal: shouldRouteMediaThroughExternal(),
                    seekHoldRemaining: Math.max(0, seekHoldUntilRef.current - Date.now()),
                    playingIntent: playingIntentRef.current,
                    userPaused: userPausedRef.current,
                    isPlayingUi: isPlaying,
                    externalConnected: isExternalMediaConnected(),
                    externalActive: externalMediaActiveRef.current,
                    seekGuard: isSeekGuardActive(),
                    isLoading: isLoading,
                    tapToPlay: tapToPlay,
                }
            },
        }
        return function() {
            delete window.__abc2bookPlaybackTest
        }
    })
    
    
    return {play, playFromUserGesture, stop, pause, restartPlaybackFromStart, canResumePlayback, seek, rewindToStart, getPlaybackProgress, getSeekSettlement, currentTime,setCurrentTime, duration, setDuration, playerRef,ytPlayerRef, onEnded, onError, onTimeUpdate,onAbcTimeUpdate, onYtTimeUpdate ,onYtStateChange,  onYtReady, onMediaReady, isPlaying, setIsPlaying, isLoading, setIsLoading, isReady, setIsReady,  tune, setTune, updateTunePlaybackSettings, applyPlaybackSettingsLiveRef, applyMidiTempoRef, resumeSynthAudioContextRef, pauseSynthRef, stopMidiSynthRef, playMidiRef, resumeMidiAfterSeekRef, seekMidiRef, getMidiPlaybackSecondsRef, userGesturePlayRef, mediaLinkNumber, setMediaLinkNumber, getSrc, getSrcType, playbackSpeed, setPlaybackSpeed, clickSeek, setClickSeek, checkAudioContext, forceMidiChange, midiHash, cleanupTimers, tapToPlay, setTapToPlay, playCancelled, setPlayCancelled, prepareExternalMedia, destroyExternalMedia, updateLinkPlaybackLoops, downloadExternalMedia, checkExternalMediaCached, saveExternalMediaToFile, getLinkStartAt, getLinkEndAt, getLinkPlaybackLoop, externalMediaActive, shouldIgnoreNativePlaybackEvents, shouldSuppressSpuriousPause, usesExternalPitchTempo, mediaResolverAvailable, mediaResolverChecked, mediaResolverFeaturesEnabled: isMediaProxyConfigured() && (mediaResolverAvailable || !mediaResolverChecked), refreshMediaResolverHealth, resumeAudioContextAndPlay, confirmPlayingStarted, abortPlayingIntent, hasPlayingIntent, hasActivePlaybackIntent, isSeekGuardActive, isMidiPlaybackRoute, isMediaPlaybackRoute, applyPlaybackRoute, maybeAutostart}
   //srcSelection, setSrcSelection, src, setSrc,
}
 
