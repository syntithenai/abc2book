import {useEffect,useState, useRef} from 'react'
import { flushSync } from 'react-dom'
import { toast } from 'react-toastify'
import ExternalMediaPitchTempo from './externalMediaPitchTempo'
import { getMediaPlaybackSettings, getPlaybackSettings, getAudioFilterSettings, normalizeAudioFilters, playbackNeedsExternalProcessing, audioFiltersAreNeutral, getAudioFilterKeysForStemNames, getAudioFilterKeysForDemucsModel, pitchShiftIsActive } from './pitchTempoUtils'
import { buildFilteredMediaBlob, getNativeFilteredBlobCacheKey } from './nativeFilteredMedia'
import { getCachedStemSet, getStemSourceCacheKey } from './audioStemCache'
import { getMediaResolverHealthState } from './mediaResolverHealthStore'
import { getResolverFeaturesFromStatus } from './resolverFeatures'
import { parseMsToSeconds, getActivePlaybackLoop, getLinkRegionStart, getLinkRegionEnd, syncLegacyLinkLoopFields, ensureSingleActiveLoop } from './mediaPlaybackUtils'
import { isExternalMediaCached, getCachedExternalMediaBlob, getExternalMediaCacheKey } from './externalMediaAudioCache'
import { getLinkTrimBounds } from './mediaAudioTrim'
import { loadOfflineMediaSettings } from './offlineMediaSettings'
import { resolveActiveLinkForTune } from './mediaLinkResolve'
import * as mediaCacheQueue from './mediaCacheQueue'
import useMediaResolverHealth from './useMediaResolverHealth'
import { isMediaProxyConfigured } from './mediaProxyClient'
import useGoogleDocument from './useGoogleDocument'
import {
    isOwnedMediaLinkUri,
    resolveRecordingLinkAudio,
    cacheOwnedMediaLinkIfNeeded,
} from './linkRecording'
import { registerStemSeparationJob } from './longRunningJobRegistry'
import { syncPlaybackRoute } from './playbackRouteSync'
import { isQueueActive, getCurrentTuneId } from './nowPlayingQueue'
import { handleQueueAdvanceOnEnded } from './nowPlayingQueuePlayback'
import { playbackModeFromPathname } from './offlinePlayback'
import { isTuneListPath, getAppPathname } from './playbackNavigationUtils'
import {
    getPlaybackVolume,
    setPlaybackVolume as persistPlaybackVolume,
    adjustPlaybackVolume as persistAdjustPlaybackVolume,
    PLAYBACK_VOLUME_STEP,
} from './playbackVolumeSettings'
import {
    pendingRequestMatchesRoute,
    routeMatchesPendingRequest,
    shouldKeepIntentWhenRouteNotReady,
} from './playbackRequestLogic'
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
    shouldUseExistingPlayer,
    clampSeekRatio,
    resolveDisplaySeconds,
    beginSeekHold as computeSeekHoldUntil,
} from './playbackStateLogic'
import { trackAbcPlay, trackMediaPlay } from './analytics'
import {
    registerMediaSessionHandlers,
    clearMediaSessionHandlersRegistration,
} from './mediaSessionActions'
    
export default function useTuneBookMediaController(props) {
    const driveDocs = useGoogleDocument(props.token, function() {})
    const [currentTime, setCurrentTimeState] = useState(0)
    const currentTimeRef = useRef(0)
    function setCurrentTime(t, options) {
        const v = parseFloat(t) || 0
        currentTimeRef.current = v
        const forceUi = options && options.forceUi
        if (forceUi || !practiceSessionActiveRef.current) {
            setCurrentTimeState(v)
        }
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
    var [playbackRouteMode, setPlaybackRouteMode] = useState('none')
    var [requestedPlayState, setRequestedPlayState] = useState(null)
    var mediaLinkNumberRef = useRef(null)
    var playbackRouteRef = useRef({ mode: 'none', mediaLinkNumber: null, playState: null })
    const [tapToPlay, setTapToPlay] = useState(false)
    const [playCancelled, setPlayCancelled] = useState(false)
    
    const [isPlaying, setIsPlaying] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [isReady, setIsReady] = useState(false)
    const [playbackSpeed, setPlaybackSpeed] = useState(1)
    const [playbackVolume, setPlaybackVolumeState] = useState(getPlaybackVolume)
    
    var playerRef = useRef()
    var filteredPlayerRef = useRef()
    var ytPlayerRef = useRef()
    var ytPlayerLoadedSrcRef = useRef(null)
    // Bounds the number of automatic YouTube playVideo() retries when the player
    // keeps returning to an unstarted/cued state (autoplay blocked by the
    // browser). Once exhausted we surface the tap-to-play prompt instead of
    // retrying forever.
    var youtubeAutoplayAttemptRef = useRef(0)
    // Time-based backstop: once we intend to autostart a YouTube video we arm a
    // watchdog. If playback is not confirmed within the window (autoplay blocked,
    // or the player is churning through unstarted/ready cycles during a cold
    // start from e.g. the books page) we surface the tap-to-play prompt so a
    // single click can start playback instead of spinning forever.
    var youtubeAutostartWatchdogRef = useRef(null)
    
    var youtubeProgressInterval = useRef()
    var progressIntervalRef = useRef(null)
    var applyPlaybackSettingsLiveRef = useRef(null)
    var applyMidiTempoRef = useRef(null)
    var applyPlaybackVolumeRef = useRef(null)
    var resumeSynthAudioContextRef = useRef(null)
    var pauseSynthRef = useRef(null)
    var stopMidiSynthRef = useRef(null)
    var playMidiRef = useRef(null)
    var pendingMidiPlayRef = useRef(null)
    var resumeMidiAfterSeekRef = useRef(null)
    var seekMidiRef = useRef(null)
    var getMidiPlaybackSecondsRef = useRef(null)
    var practiceSessionHandlerRef = useRef(null)
    var practiceSessionActiveRef = useRef(false)
    var queuePlaybackResumeRef = useRef(null)
    var userGesturePlayRef = useRef(false)
    var wakeLockRef = useRef(null)
    var isPlayingRef = useRef(false)
    var externalMediaRef = useRef(null)
    var sharedExternalAudioContextRef = useRef(null)
    var externalLoadToken = useRef(0)
    var externalLoadingRef = useRef(false)
    var externalLoadingSrcRef = useRef(null)
    var externalLoadedSrcRef = useRef(null)
    var externalLoadingPromiseRef = useRef(null)
    var externalLoadingProcessorRef = useRef(null)
    var pendingExternalSettingsRef = useRef(null)
    var externalMediaActiveRef = useRef(false)
    var nativeFilteredActiveRef = useRef(false)
    var nativeFilteredBlobUrlRef = useRef(null)
    var nativeFilteredDurationRef = useRef(0)
    var nativeFilteredLoadTokenRef = useRef(0)
    var nativeFilteredBlobCacheRef = useRef(new Map())
    var cachedNativeBlobUrlRef = useRef(null)
    const [nativePlaybackSrcOverride, setNativePlaybackSrcOverride] = useState(null)
    const [nativePlaybackFallbackRequired, setNativePlaybackFallbackRequired] = useState(false)
    var nativeFilteredCacheKeyRef = useRef(null)
    var externalHandoffGuardUntilRef = useRef(0)
    var seekGuardUntilRef = useRef(0)
    var seekInProgressRef = useRef(false)
    var seekWasPlayingRef = useRef(false)
    var seekTargetSecondsRef = useRef(0)
    var seekFromSecondsRef = useRef(0)
    var seekHoldUntilRef = useRef(0)
    var playingIntentRef = useRef(false)
    var pendingPlayRequestRef = useRef(null)
    var playbackStartedRef = useRef(false)
    var userPausedRef = useRef(false)
    var routeReadyRef = useRef(false)
    var suppressNativePlaybackEventsRef = useRef(false)
    var youtubePlayPollTokenRef = useRef(0)
    const [externalMediaActive, setExternalMediaActive] = useState(false)
    const [stemSeparationActive, setStemSeparationActive] = useState(false)
    const [stemAnalysisProgress, setStemAnalysisProgress] = useState({
        active: false,
        progress: 0,
        message: '',
    })
    const [stemsReadyForMedia, setStemsReadyForMedia] = useState(false)
    const [availableStemNames, setAvailableStemNames] = useState([])
    const [pitchShiftPreparing, setPitchShiftPreparing] = useState(false)
    var stemAnalysisAbortRef = useRef(null)
    var stemAnalysisTokenRef = useRef(0)
    var pitchShiftPrepareTokenRef = useRef(0)
    var pitchShiftPrepareTimeoutRef = useRef(null)
    var lastNotifiedPitchRef = useRef({ pitch: 0, fineTune: 0 })
    var finishPitchShiftPrepareRef = useRef(function() {})
    const { available: mediaResolverAvailable, checked: mediaResolverChecked, status: mediaResolverStatus, refreshMediaResolverHealth } = useMediaResolverHealth()
    const resolverFeatures = getResolverFeaturesFromStatus(mediaResolverStatus)
    const stemJobActive = stemSeparationActive || !!(stemAnalysisProgress && stemAnalysisProgress.active)
    const cancelStemAnalysisRef = useRef(function() {})

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

    useEffect(function() {
        isPlayingRef.current = !!isPlaying
    }, [isPlaying])

    async function requestScreenWakeLock() {
        if (typeof navigator === 'undefined' || !navigator.wakeLock || typeof navigator.wakeLock.request !== 'function') {
            return false
        }
        if (wakeLockRef.current) {
            return true
        }
        try {
            const lock = await navigator.wakeLock.request('screen')
            wakeLockRef.current = lock
            if (lock && typeof lock.addEventListener === 'function') {
                lock.addEventListener('release', function() {
                    if (wakeLockRef.current === lock) {
                        wakeLockRef.current = null
                    }
                })
            }
            return true
        } catch (e) {
            return false
        }
    }

    async function releaseScreenWakeLock() {
        const lock = wakeLockRef.current
        wakeLockRef.current = null
        if (!lock || typeof lock.release !== 'function') return
        try {
            await lock.release()
        } catch (e) {}
    }

    function updateMediaSessionMetadata() {
        if (typeof navigator === 'undefined' || !navigator.mediaSession) return
        const activeTune = tuneRef.current || tune
        const activeLink = getActiveLink()
        const title = activeTune && activeTune.name ? activeTune.name : 'ABC Tune Book'
        const artist = activeTune && activeTune.composer ? activeTune.composer : 'Tune playback'
        const album = activeLink && activeLink.title
            ? activeLink.title
            : (playbackRouteRef.current.mode === 'midi' ? 'Generated playback' : 'Linked media')

        if (typeof window !== 'undefined' && typeof window.MediaMetadata === 'function') {
            try {
                navigator.mediaSession.metadata = new window.MediaMetadata({
                    title: title,
                    artist: artist,
                    album: album,
                })
            } catch (e) {}
        }
    }

    function updateMediaSessionState() {
        if (typeof navigator === 'undefined' || !navigator.mediaSession) return
        try {
            navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'
        } catch (e) {}
    }

    function updateMediaSessionPosition(seconds, totalDuration) {
        if (typeof navigator === 'undefined' || !navigator.mediaSession) return
        if (typeof navigator.mediaSession.setPositionState !== 'function') return
        const durationValue = parseFloat(totalDuration)
        const positionValue = parseFloat(seconds)
        if (!(durationValue > 0) || !isFinite(durationValue)) return
        if (!isFinite(positionValue) || positionValue < 0) return
        try {
            navigator.mediaSession.setPositionState({
                duration: durationValue,
                position: Math.max(0, Math.min(durationValue, positionValue)),
                playbackRate: Math.max(0.25, parseFloat(playbackSpeed) || 1),
            })
        } catch (e) {}
    }

    function getMediaSessionPathname() {
        if (typeof window === 'undefined') return ''
        return (window.location.hash || '').replace(/^#/, '')
    }

    function buildMediaSessionNavigationController() {
        return {
            stop: stop,
            isPlaying: isPlaying,
            isLoading: isLoading,
            hasActivePlaybackIntent: hasActivePlaybackIntent,
            setTune: setTune,
            setMediaLinkNumber: setMediaLinkNumber,
            applyPlaybackRoute: applyPlaybackRoute,
            play: play,
            playFromUserGesture: playFromUserGesture,
        }
    }

    function navigateMediaSessionTrack(direction) {
        if (!props || !props.tunebook) return
        const tunebook = props.tunebook
        const activeTune = tuneRef.current || tune
        const activeTuneId = activeTune && activeTune.id ? activeTune.id : null
        const pathname = getMediaSessionPathname()
        const mediaController = buildMediaSessionNavigationController()

        if (direction >= 0) {
            if (typeof tunebook.navigateToNextSong !== 'function') return
            tunebook.navigateToNextSong(
                activeTuneId,
                null,
                function(path) { tunebook.navigate(path) },
                pathname,
                { mediaController: mediaController }
            )
            return
        }

        if (typeof tunebook.navigateToPreviousSong !== 'function') return
        tunebook.navigateToPreviousSong(
            activeTuneId,
            function(path) { tunebook.navigate(path) },
            pathname,
            { mediaController: mediaController }
        )
    }

    function installMediaSessionHandlers() {
        if (typeof navigator === 'undefined' || !navigator.mediaSession || typeof navigator.mediaSession.setActionHandler !== 'function') {
            return
        }
        registerMediaSessionHandlers(navigator.mediaSession, {
            play: function() { playFromUserGesture({ preservePosition: true, userResume: true }) },
            pause: function() { pause() },
            stop: function() { stop() },
            seekbackward: function(details) {
                const step = details && details.seekOffset ? details.seekOffset : 10
                seekBySeconds(-Math.abs(step))
            },
            seekforward: function(details) {
                const step = details && details.seekOffset ? details.seekOffset : 10
                seekBySeconds(Math.abs(step))
            },
            seekto: function(details) {
                if (!details || details.seekTime === undefined || details.seekTime === null) return
                seekToSeconds(details.seekTime)
            },
            nexttrack: function() {
                navigateMediaSessionTrack(1)
            },
            previoustrack: function() {
                navigateMediaSessionTrack(-1)
            },
        })
    }

    function clearMediaSessionHandlers() {
        if (typeof navigator === 'undefined' || !navigator.mediaSession || typeof navigator.mediaSession.setActionHandler !== 'function') {
            return
        }
        clearMediaSessionHandlersRegistration(navigator.mediaSession)
    }

    useEffect(function() {
        installMediaSessionHandlers()
        return function() {
            clearMediaSessionHandlers()
        }
    }, [])

    useEffect(function() {
        updateMediaSessionMetadata()
    }, [tune && tune.id, mediaLinkNumber, playbackRouteMode, tune])

    useEffect(function() {
        updateMediaSessionState()
    }, [isPlaying])

    useEffect(function() {
        if (typeof document === 'undefined') return undefined
        function onVisibilityChange() {
            if (!document.hidden && isPlayingRef.current && playingIntentRef.current && !userPausedRef.current) {
                requestScreenWakeLock()
            }
        }
        document.addEventListener('visibilitychange', onVisibilityChange)
        return function() {
            document.removeEventListener('visibilitychange', onVisibilityChange)
        }
    }, [])

    useEffect(function() {
        if (isPlaying && playingIntentRef.current && !userPausedRef.current) {
            requestScreenWakeLock()
        } else {
            releaseScreenWakeLock()
        }
    }, [isPlaying])

    useEffect(function() {
        return function() {
            releaseScreenWakeLock()
        }
    }, [])

    function applyPlaybackVolumeToActiveRoute(volume) {
        const level = Math.max(0, Math.min(1, parseFloat(volume) || 0))
        if (playerRef && playerRef.current) {
            playerRef.current.volume = level
        }
        if (filteredPlayerRef && filteredPlayerRef.current) {
            filteredPlayerRef.current.volume = level
        }
        if (ytPlayerRef && ytPlayerRef.current) {
            try {
                if (level <= 0) {
                    ytPlayerRef.current.mute()
                } else {
                    ytPlayerRef.current.unMute()
                    ytPlayerRef.current.setVolume(Math.round(level * 100))
                }
            } catch (e) {}
        }
        if (externalMediaRef.current) {
            externalMediaRef.current.setOutputVolume(level)
        }
        if (applyPlaybackVolumeRef.current) {
            applyPlaybackVolumeRef.current(level)
        }
    }

    function setPlaybackVolume(volume) {
        const next = persistPlaybackVolume(volume)
        setPlaybackVolumeState(next)
        applyPlaybackVolumeToActiveRoute(next)
        return next
    }

    function adjustPlaybackVolume(delta) {
        const next = persistAdjustPlaybackVolume(delta)
        setPlaybackVolumeState(next)
        applyPlaybackVolumeToActiveRoute(next)
        return next
    }

    function seekBySeconds(delta) {
        const progress = getPlaybackProgress()
        const total = progress.duration
        if (!(total > 0)) return
        const step = parseFloat(delta) || 0
        const nextTime = Math.max(0, Math.min(total, progress.currentTime + step))
        seek(total > 0 ? nextTime / total : 0)
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
        clearCachedNativePlaybackUrl()
        destroyExternalMedia()
        destroyNativeFilteredPlayback()
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
        setPlaybackRouteMode(result.mode)
        enforceExclusivePlayback(result.mode)
        // setMediaLinkNumber and applyPlaybackRoute both commit here; pending
        // play requests from the media-controls dialog match on routeReady.
        routeReadyRef.current = true
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
        if (playState === 'playMidi' || playState === 'playMedia') {
            setRequestedPlayState(playState)
        }
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
        if (userPausedRef.current) return
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
            const regionStart = getLinkStartAt()
            const preserve = currentTimeRef.current > regionStart + 0.05
                && (playingIntentRef.current || userPausedRef.current)
            play(preserve ? { preservePosition: true } : {})
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
            updateMediaSessionPosition(seconds, resolvePlaybackDuration())
        }
    }

    function startProgressSync() {
        if (progressIntervalRef.current) return
        const intervalMs = practiceSessionActiveRef.current ? 500 : 80
        progressIntervalRef.current = setInterval(syncPlaybackProgressFromSource, intervalMs)
    }

    function stopProgressSync() {
        clearInterval(progressIntervalRef.current)
        progressIntervalRef.current = null
    }

    function getGoogleAccessToken() {
        return props.token && props.token.access_token ? props.token.access_token : null
    }

    function getDemucsModel() {
        const health = getMediaResolverHealthState()
        if (health && health.status && health.status.demucsModel) {
            return health.status.demucsModel
        }
        return 'htdemucs'
    }

    function getAvailableStemNames() {
        if (externalMediaRef.current && typeof externalMediaRef.current.getStemBufferNames === 'function') {
            const live = externalMediaRef.current.getStemBufferNames()
            if (live.length > 0) {
                return live
            }
        }
        return availableStemNames
    }

    function getAvailableAudioFilterKeys() {
        const stemNames = getAvailableStemNames()
        if (stemNames.length > 0) {
            return getAudioFilterKeysForStemNames(stemNames)
        }
        const health = getMediaResolverHealthState()
        if (health && health.status && Array.isArray(health.status.demucsStems) && health.status.demucsStems.length > 0) {
            return getAudioFilterKeysForStemNames(health.status.demucsStems)
        }
        return getAudioFilterKeysForDemucsModel(getDemucsModel())
    }

    function getExternalMediaCacheOptions(currentTune, linkIndex) {
        const resolvedTune = currentTune || tuneRef.current || tune
        const resolvedLink = linkIndex !== null && linkIndex !== undefined
            ? linkIndex
            : mediaLinkNumberRef.current
        if (!resolvedTune || resolvedLink === null || resolvedLink === undefined) {
            return null
        }
        const src = getSrc(resolvedTune, resolvedLink)
        if (!src) return null
        return {
            tuneId: resolvedTune.id,
            linkIndex: resolvedLink,
            src: src,
            srcType: getSrcType(src),
            label: resolvedTune.links && resolvedTune.links[resolvedLink]
                ? resolvedTune.links[resolvedLink].label || ''
                : '',
            accessToken: getGoogleAccessToken(),
            demucsModel: getDemucsModel(),
        }
    }

    async function refreshStemsReadyState(currentTune, linkIndex) {
        const cacheOptions = getExternalMediaCacheOptions(currentTune, linkIndex)
        if (!cacheOptions) {
            setStemsReadyForMedia(false)
            setAvailableStemNames([])
            return false
        }
        const model = cacheOptions.demucsModel || ''
        const cacheKey = getStemSourceCacheKey(
            cacheOptions.tuneId,
            cacheOptions.linkIndex,
            cacheOptions.src,
            model
        )
        let cached = await getCachedStemSet(cacheKey)
        if (!cached) {
            cached = await getCachedStemSet(getStemSourceCacheKey(
                cacheOptions.tuneId,
                cacheOptions.linkIndex,
                cacheOptions.src,
                ''
            ))
        }
        const ready = !!(cached && cached.stemBuffers)
        setStemsReadyForMedia(ready)
        if (cached && cached.stemBuffers) {
            setAvailableStemNames(Object.keys(cached.stemBuffers))
        } else if (cached && cached.separation && cached.separation.stems) {
            setAvailableStemNames(Object.keys(cached.separation.stems))
        } else {
            setAvailableStemNames([])
        }
        return ready
    }

    function hasStemsForCurrentMedia() {
        return stemsReadyForMedia
            || !!(externalMediaRef.current && externalMediaRef.current.hasStemBuffers())
    }

    function cancelStemAnalysis() {
        stemAnalysisTokenRef.current += 1
        if (stemAnalysisAbortRef.current) {
            stemAnalysisAbortRef.current.abort()
            stemAnalysisAbortRef.current = null
        }
        setStemSeparationActive(false)
        setStemAnalysisProgress({
            active: false,
            progress: 0,
            message: '',
        })
    }
    cancelStemAnalysisRef.current = cancelStemAnalysis

    useEffect(function() {
        if (!stemJobActive) return undefined
        return registerStemSeparationJob({
            label: 'Current media stem separation',
            onCancel: function() {
                cancelStemAnalysisRef.current()
            },
        })
    }, [stemJobActive])

    function updateStemAnalysisProgress(message, progress) {
        setStemAnalysisProgress({
            active: true,
            progress: Math.max(0, Math.min(100, parseFloat(progress) || 0)),
            message: message || '',
        })
    }

    async function analyseMediaStems(options) {
        if (!resolverFeatures.stems) {
            throw new Error('Stem separation is not available on this resolver')
        }
        const opts = options || {}
        const currentTune = tuneRef.current || tune
        const linkIndex = mediaLinkNumberRef.current !== null && mediaLinkNumberRef.current !== undefined
            ? mediaLinkNumberRef.current
            : mediaLinkNumber
        const cacheOptions = getExternalMediaCacheOptions(currentTune, linkIndex)
        if (!cacheOptions) {
            throw new Error('No linked media source selected')
        }

        cancelStemAnalysis()
        const token = ++stemAnalysisTokenRef.current
        const controller = new AbortController()
        stemAnalysisAbortRef.current = controller
        setStemSeparationActive(true)
        updateStemAnalysisProgress(opts.forceRefresh ? 'Re-analysing stems...' : 'Analysing stems...', 0)

        const progressHandlers = {
            signal: controller.signal,
            forceRefresh: !!opts.forceRefresh,
            onProgress: function(message, progress) {
                if (token !== stemAnalysisTokenRef.current) return
                updateStemAnalysisProgress(message, progress)
            },
            onStatus: function(status) {
                if (token !== stemAnalysisTokenRef.current || !status) return
                const message = status.message || 'Separating stems...'
                updateStemAnalysisProgress(message, status.progress)
            },
        }

        try {
            const { loadStemBuffersForSource } = await import('./nativeFilteredMedia')
            const loaded = await loadStemBuffersForSource(cacheOptions, Object.assign({}, progressHandlers, {
                allowNetworkSeparation: true,
            }))
            if (token !== stemAnalysisTokenRef.current) {
                return { cancelled: true }
            }
            if (!loaded || !loaded.stemBuffers) {
                throw new Error('Stem analysis produced no audio stems')
            }

            if (externalMediaRef.current) {
                externalMediaRef.current.setStemBuffers(loaded.separation, loaded.stemBuffers)
            }

            setAvailableStemNames(Object.keys(loaded.stemBuffers))
            setStemsReadyForMedia(true)
            updateStemAnalysisProgress('Stems ready', 100)

            const settings = getMediaPlaybackSettings(currentTune)
            if (!audioFiltersAreNeutral(settings.audioFilters)) {
                await applyLinkedMediaPlaybackSettings(settings)
            }

            return {
                separation: loaded.separation,
                fromCache: !!loaded.fromCache,
            }
        } finally {
            if (token === stemAnalysisTokenRef.current) {
                stemAnalysisAbortRef.current = null
                setStemSeparationActive(false)
                setStemAnalysisProgress(function(prev) {
                    return Object.assign({}, prev, { active: false })
                })
            }
        }
    }

    function beginPitchShiftPrepare() {
        const token = ++pitchShiftPrepareTokenRef.current
        setPitchShiftPreparing(true)
        if (pitchShiftPrepareTimeoutRef.current) {
            clearTimeout(pitchShiftPrepareTimeoutRef.current)
        }
        pitchShiftPrepareTimeoutRef.current = setTimeout(function() {
            finishPitchShiftPrepare(token)
        }, 120000)
        return token
    }

    function finishPitchShiftPrepare(token) {
        if (token != null && token !== pitchShiftPrepareTokenRef.current) return
        if (pitchShiftPrepareTimeoutRef.current) {
            clearTimeout(pitchShiftPrepareTimeoutRef.current)
            pitchShiftPrepareTimeoutRef.current = null
        }
        setPitchShiftPreparing(false)
    }

    finishPitchShiftPrepareRef.current = function(token) {
        finishPitchShiftPrepare(token)
    }

    function pitchShiftWillApply(settings) {
        if (!pitchShiftIsActive(settings.pitch, settings.fineTune)) return false
        if (isMidiPlaybackRoute()) return true
        if (canUseExternalPitchTempo(settings)) return true
        if (externalMediaRef.current && externalLoadedSrcRef.current) return true
        return false
    }

    function notePitchShiftApplyStarted(settings) {
        const prev = lastNotifiedPitchRef.current
        const changed = prev.pitch !== settings.pitch || prev.fineTune !== settings.fineTune
        if (changed) {
            lastNotifiedPitchRef.current = {
                pitch: settings.pitch,
                fineTune: settings.fineTune,
            }
        }
        if (!changed || !pitchShiftWillApply(settings) || !hasActivePlaybackIntent()) {
            return null
        }
        return beginPitchShiftPrepare()
    }

    function settingsRequireExternalMediaProcessor(settings) {
        if (!settings) return false
        if (settings.pitch !== 0 || settings.fineTune !== 0) return true
        return !!(settings.audioFilters && !audioFiltersAreNeutral(settings.audioFilters))
    }

    // Practice mode uses native players + playbackRate only. The external pitch/tempo
    // processor is too heavy to load during sessions (Aw Snap). ABC playback still
    // applies practice-key pitch; linked media keeps its original pitch.
    function practiceUsesNativePlaybackOnly(settings) {
        return practiceSessionActiveRef.current
    }

    function canUseExternalPitchTempo(settings) {
        if (mediaLinkNumber === null || !tune) return false
        const src = getSrc(tune, mediaLinkNumber)
        const srcType = getSrcType(src)
        if (srcType !== 'audio' && srcType !== 'youtube') return false
        const resolved = settings || getActivePlaybackSettings(tuneRef.current || tune)
        if (!settingsRequireExternalMediaProcessor(resolved)) return false
        if (practiceSessionActiveRef.current && practiceUsesNativePlaybackOnly(resolved)) {
            return false
        }
        if (!isMediaProxyConfigured()) return false
        if (mediaResolverChecked && !mediaResolverAvailable) return false
        if (mediaResolverChecked && !resolverFeatures.proxy) return false
        return true
    }

    function clearCachedNativePlaybackUrl() {
        if (cachedNativeBlobUrlRef.current) {
            URL.revokeObjectURL(cachedNativeBlobUrlRef.current)
            cachedNativeBlobUrlRef.current = null
        }
        setNativePlaybackSrcOverride(null)
    }

    function applyNativePlaybackBlobUrl(blobUrl) {
        if (cachedNativeBlobUrlRef.current && cachedNativeBlobUrlRef.current !== blobUrl) {
            URL.revokeObjectURL(cachedNativeBlobUrlRef.current)
        }
        cachedNativeBlobUrlRef.current = blobUrl
        // Apply the blob URL to the controlled <audio> src before waiting/playing.
        // Without flushSync, imperative player.src assignment races the subsequent
        // React re-render and the first play() is lost.
        flushSync(function() {
            setNativePlaybackSrcOverride(blobUrl)
        })
    }

    function getNextQueuePrefetchTune() {
        const queue = props.nowPlayingQueue
        if (!isQueueActive(queue) || !Array.isArray(queue.items) || queue.items.length === 0) {
            return null
        }
        const currentTuneIndex = typeof queue.currentIndex === 'number' && queue.currentIndex >= 0
            ? queue.currentIndex
            : 0
        const nextIndex = (currentTuneIndex + 1) % queue.items.length
        const item = queue.items[nextIndex]
        if (!item || !item.tuneId) return null
        return props.tunes && props.tunes[item.tuneId] ? props.tunes[item.tuneId] : null
    }

    function scheduleOfflineMediaQueueJobs(useTune, linkIndex, src, srcType) {
        if (practiceSessionActiveRef.current) return
        const settings = loadOfflineMediaSettings()
        const accessToken = getGoogleAccessToken()
        const youtubeGetId = props.tunebook.utils.YouTubeGetID

        if (srcType === 'recording' && useTune && Array.isArray(useTune.links) && useTune.links[linkIndex]) {
            if (settings.autocacheOnPlay) {
                cacheOwnedMediaLinkIfNeeded(useTune.id, linkIndex, useTune.links[linkIndex], {
                    accessToken: accessToken,
                    driveApi: driveDocs,
                }).catch(function() {})
            }
            return
        }

        if (settings.autocacheOnPlay && useTune && src) {
            isExternalMediaCached(useTune.id, linkIndex, src).then(function(cached) {
                if (cached) return
                mediaCacheQueue.enqueueCacheJob({
                    tuneId: useTune.id,
                    linkIndex: linkIndex,
                    src: src,
                    srcType: srcType,
                    tuneName: useTune.name || '',
                    linkTitle: useTune.links && useTune.links[linkIndex] ? (useTune.links[linkIndex].title || '') : '',
                    youtubeGetId: youtubeGetId,
                    accessToken: accessToken,
                })
                if (!mediaCacheQueue.getState().running) {
                    mediaCacheQueue.start()
                }
            }).catch(function() {})
        }

        if (settings.prefetchNextTrack) {
            const nextTune = getNextQueuePrefetchTune()
            if (!nextTune) return
            const resolved = resolveActiveLinkForTune(nextTune, null, props.tunebook.utils.isYoutubeLink)
            if (!resolved) return
            isExternalMediaCached(nextTune.id, resolved.linkIndex, resolved.src).then(function(cached) {
                if (cached) return
                mediaCacheQueue.enqueueCacheJob({
                    tuneId: nextTune.id,
                    linkIndex: resolved.linkIndex,
                    src: resolved.src,
                    srcType: resolved.srcType,
                    tuneName: nextTune.name || '',
                    linkTitle: resolved.linkTitle || '',
                    youtubeGetId: youtubeGetId,
                    accessToken: accessToken,
                })
                if (!mediaCacheQueue.getState().running) {
                    mediaCacheQueue.start()
                }
            }).catch(function() {})
        }
    }

    async function playCachedNativeMedia(srcType, options) {
        const opts = options || {}
        const useTune = tuneRef.current || tune
        const linkIndex = getActiveMediaLinkNumber()
        const src = getSrc(useTune, linkIndex)
        if (!useTune || !src) return false

        const cached = await getCachedExternalMediaBlob(getExternalMediaCacheKey(useTune.id, linkIndex, src))
        if (!cached || !cached.blob) return false

        const blobUrl = URL.createObjectURL(cached.blob)
        applyNativePlaybackBlobUrl(blobUrl)
        if (cached.duration) {
            setDuration(cached.duration)
        }
        const player = playerRef && playerRef.current
        if (player) {
            const ready = await waitForMediaElementReady(player)
            if (!ready) return false
        }
        setIsReady(true)
        playNativeMedia('audio', opts)
        return true
    }

    function getActivePlaybackSettings(useTune) {
        const base = getMediaPlaybackSettings(useTune || tuneRef.current || tune)
        if (practiceSessionActiveRef.current && pendingExternalSettingsRef.current) {
            return Object.assign({}, base, pendingExternalSettingsRef.current)
        }
        return base
    }

    async function startLinkedMediaPlayback(useTune, linkIndex, src, srcType, opts) {
        const settings = getActivePlaybackSettings(useTune)
        const preserveMediaPosition = !opts.restart && !opts.fresh && opts.preservePosition !== false

        if (practiceUsesNativePlaybackOnly(settings) && srcType !== 'recording') {
            if (externalMediaRef.current || externalMediaActiveRef.current) {
                destroyExternalMedia()
            }
            applyNativeMediaPlaybackSettings(settings.tempo)
            playNativeMedia(srcType, {
                preservePosition: preserveMediaPosition,
            })
            return
        }

        if (srcType === 'recording') {
            const activeLink = useTune && useTune.links ? useTune.links[linkIndex] : null
            if (!activeLink) {
                toast.error('Recording link is not available.')
                setIsLoading(false)
                abortPlayingIntent()
                return
            }
            try {
                const resolved = await resolveRecordingLinkAudio(activeLink, useTune.id, linkIndex, {
                    accessToken: getGoogleAccessToken(),
                    driveApi: driveDocs,
                    forPlayback: true,
                })
                const blobUrl = URL.createObjectURL(resolved.blob)
                await attachNativeBlobUrlForPlayback(blobUrl, resolved.duration, settings)
                if (!hasActivePlaybackIntent()) {
                    setIsLoading(false)
                    return
                }

                if (playbackNeedsExternalProcessing(settings) && !practiceUsesNativePlaybackOnly(settings)) {
                    prepareExternalMedia(blobUrl, settings, {
                        autoPlay: true,
                        showLoading: true,
                        allowCachedOnly: true,
                    }).then(function(loaded) {
                        if (!loaded && playingIntentRef.current) {
                            playNativeMedia('audio', { preservePosition: preserveMediaPosition })
                        } else if (loaded) {
                            scheduleOfflineMediaQueueJobs(useTune, linkIndex, src, srcType)
                        }
                    })
                    return
                }

                playNativeMedia('audio', opts)
                scheduleOfflineMediaQueueJobs(useTune, linkIndex, src, srcType)
                return
            } catch (e) {
                toast.error(e && e.message ? e.message : 'Recording is not available for playback.')
                setIsLoading(false)
                abortPlayingIntent()
                return
            }
        }

        const cached = await isExternalMediaCached(useTune.id, linkIndex, src)

        if ((srcType === 'audio' || srcType === 'youtube') && cached) {
            if (playbackNeedsExternalProcessing(settings) && !practiceUsesNativePlaybackOnly(settings)) {
                prepareExternalMedia(src, settings, {
                    autoPlay: true,
                    showLoading: true,
                    allowCachedOnly: true,
                }).then(function(loaded) {
                    if (!loaded && playingIntentRef.current) {
                        playCachedNativeMedia(srcType, { preservePosition: preserveMediaPosition }).then(function(ok) {
                            if (!ok && playingIntentRef.current) {
                                playNativeMedia(srcType, { preservePosition: preserveMediaPosition })
                            } else if (!ok) {
                                setIsLoading(false)
                            }
                        })
                    } else if (loaded) {
                        scheduleOfflineMediaQueueJobs(useTune, linkIndex, src, srcType)
                    }
                })
                return
            }
            const played = await playCachedNativeMedia(srcType, opts)
            if (played) {
                scheduleOfflineMediaQueueJobs(useTune, linkIndex, src, srcType)
                return
            }
        }

        if ((srcType === 'audio' || srcType === 'youtube') && typeof navigator !== 'undefined' && navigator.onLine === false) {
            toast.error('This media is not cached for offline playback.')
            setIsLoading(false)
            abortPlayingIntent()
            return
        }

        clearCachedNativePlaybackUrl()

        if (canUseNativeFilteredPlayback()) {
            if (isNativeFilteredActive()) {
                playNativeFilteredMedia({ preservePosition: preserveMediaPosition })
                scheduleOfflineMediaQueueJobs(useTune, linkIndex, src, srcType)
                return
            }
            applyNativeFilteredPlayback(settings, {
                play: true,
                resumeAt: preserveMediaPosition ? getCurrentPlaybackSeconds() : getLinkStartAt(),
                forcePlay: true,
            })
            scheduleOfflineMediaQueueJobs(useTune, linkIndex, src, srcType)
            return
        }

        if (canUseExternalPitchTempo(settings)) {
            if (externalMediaRef.current && externalLoadedSrcRef.current === src) {
                playExternalMedia({ preservePosition: preserveMediaPosition }).then(function(ok) {
                    if (!ok && playingIntentRef.current) {
                        playNativeMedia(srcType, { preservePosition: preserveMediaPosition })
                    } else if (ok) {
                        scheduleOfflineMediaQueueJobs(useTune, linkIndex, src, srcType)
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
                            } else if (ok) {
                                scheduleOfflineMediaQueueJobs(useTune, linkIndex, src, srcType)
                            }
                        })
                    } else if (!loaded && playingIntentRef.current) {
                        playNativeMedia(srcType, { preservePosition: preserveMediaPosition })
                    }
                })
                return
            }
            prepareExternalMedia(src, settings, { autoPlay: true, showLoading: true }).then(function(loaded) {
                if (!loaded && playingIntentRef.current) {
                    playNativeMedia(srcType, { preservePosition: preserveMediaPosition })
                } else if (loaded) {
                    scheduleOfflineMediaQueueJobs(useTune, linkIndex, src, srcType)
                }
            })
            return
        }

        if (externalMediaActiveRef.current || externalMediaRef.current) {
            destroyExternalMedia()
        }
        playNativeMedia(srcType, { preservePosition: false })
        scheduleOfflineMediaQueueJobs(useTune, linkIndex, src, srcType)
    }

    function settingsUseNativeFilteredPlayback(settings) {
        return false
    }

    function canUseNativeFilteredPlayback(settings) {
        if (mediaLinkNumber === null || !tune) return false
        const src = getSrc(tune, mediaLinkNumber)
        const srcType = getSrcType(src)
        if (srcType !== 'audio' && srcType !== 'youtube') return false
        const resolved = settings || getMediaPlaybackSettings(tune)
        if (!settingsUseNativeFilteredPlayback(resolved)) return false
        if (!isMediaProxyConfigured()) return false
        if (mediaResolverChecked && !mediaResolverAvailable) return false
        if (mediaResolverChecked && !resolverFeatures.proxy) return false
        return true
    }

    function isNativeFilteredActive() {
        return !!nativeFilteredActiveRef.current && !!filteredPlayerRef.current
    }

    function destroyNativeFilteredPlayback() {
        nativeFilteredLoadTokenRef.current++
        nativeFilteredActiveRef.current = false
        nativeFilteredDurationRef.current = 0
        nativeFilteredCacheKeyRef.current = null
        if (nativeFilteredBlobUrlRef.current) {
            URL.revokeObjectURL(nativeFilteredBlobUrlRef.current)
            nativeFilteredBlobUrlRef.current = null
        }
        if (filteredPlayerRef.current) {
            try {
                filteredPlayerRef.current.pause()
                filteredPlayerRef.current.removeAttribute('src')
                filteredPlayerRef.current.load()
            } catch (e) {}
        }
        unmuteNativePlayers()
    }

    function applyTempoToNativeElement(element, tempo) {
        if (!element) return
        const rate = parseFloat(tempo > 0 ? tempo : 1)
        element.preservesPitch = true
        element.mozPreservesPitch = true
        element.webkitPreservesPitch = true
        element.playbackRate = rate
    }

    function waitForMediaElementReady(element) {
        if (!element) return Promise.resolve(false)
        if (element.readyState >= 3) return Promise.resolve(true)
        return new Promise(function(resolve) {
            function done(ok) {
                element.removeEventListener('canplaythrough', onReady)
                element.removeEventListener('error', onError)
                resolve(ok)
            }
            function onReady() { done(true) }
            function onError() { done(false) }
            element.addEventListener('canplaythrough', onReady)
            element.addEventListener('error', onError)
        })
    }

    async function attachNativeFilteredPlayback(blobUrl, duration, settings, options) {
        const opts = options || {}
        const player = filteredPlayerRef.current
        if (!player) return false

        muteNativePlayers()
        nativeFilteredBlobUrlRef.current = blobUrl
        nativeFilteredActiveRef.current = true
        nativeFilteredDurationRef.current = duration
        setDuration(duration)
        setIsReady(true)

        const resumeAt = opts.resumeAt !== undefined && opts.resumeAt !== null
            ? Math.max(0, parseFloat(opts.resumeAt) || 0)
            : 0
        player.src = blobUrl
        player.load()
        await waitForMediaElementReady(player)
        applyTempoToNativeElement(player, settings.tempo)
        if (duration > 0) {
            player.currentTime = Math.min(resumeAt, Math.max(0, duration - 0.05))
            setCurrentTime(player.currentTime)
        }

        if (opts.play !== false && hasActivePlaybackIntent()) {
            try {
                await player.play()
                confirmPlayingStarted()
            } catch (e) {
                if (isAutoplayBlockedError(e)) {
                    setTapToPlay(true)
                }
                setIsPlaying(false)
                setIsLoading(false)
                return false
            }
        }
        return true
    }

    async function applyNativeFilteredPlayback(settings, options) {
        const opts = options || {}
        if (!canUseNativeFilteredPlayback(settings)) {
            destroyNativeFilteredPlayback()
            return false
        }

        destroyExternalMedia()

        const cacheOptions = getExternalMediaCacheOptions(tuneRef.current || tune, mediaLinkNumberRef.current)
        if (!cacheOptions) return false

        const token = ++nativeFilteredLoadTokenRef.current
        const playingNow = opts.play !== false
            && (opts.forcePlay || (playingIntentRef.current && !userPausedRef.current))

        setIsLoading(true)
        try {
            let blob = null
            let duration = 0
            let cacheKey = null

            const existingSeparationKey = nativeFilteredCacheKeyRef.current
            if (existingSeparationKey) {
                const cachedBlob = nativeFilteredBlobCacheRef.current.get(
                    getNativeFilteredBlobCacheKey(cacheOptions, existingSeparationKey, settings.audioFilters)
                )
                if (cachedBlob) {
                    blob = cachedBlob.blob
                    duration = cachedBlob.duration
                    cacheKey = existingSeparationKey
                }
            }

            if (!blob) {
                const built = await buildFilteredMediaBlob(cacheOptions, settings.audioFilters)
                if (token !== nativeFilteredLoadTokenRef.current) return false
                blob = built.blob
                duration = built.duration
                cacheKey = built.separation.cacheId
                nativeFilteredBlobCacheRef.current.set(
                    getNativeFilteredBlobCacheKey(cacheOptions, cacheKey, settings.audioFilters),
                    { blob: blob, duration: duration }
                )
            }

            nativeFilteredCacheKeyRef.current = cacheKey

            if (nativeFilteredBlobUrlRef.current) {
                URL.revokeObjectURL(nativeFilteredBlobUrlRef.current)
            }
            const blobUrl = URL.createObjectURL(blob)

            return await attachNativeFilteredPlayback(blobUrl, duration, settings, {
                resumeAt: opts.resumeAt !== undefined ? opts.resumeAt : getCurrentPlaybackSeconds(),
                play: playingNow,
            })
        } catch (e) {
            console.log('Native filtered playback failed', e)
            destroyNativeFilteredPlayback()
            return false
        } finally {
            if (token === nativeFilteredLoadTokenRef.current) {
                setIsLoading(false)
            }
        }
    }

    function playNativeFilteredMedia(options) {
        const opts = options || {}
        if (!isNativeFilteredActive()) return Promise.resolve(false)
        if (shouldBlockAutoplayDuringSeek(opts)) {
            return Promise.resolve(true)
        }

        muteNativePlayers()
        const player = filteredPlayerRef.current
        const settings = getMediaPlaybackSettings(tuneRef.current || tune)
        applyTempoToNativeElement(player, settings.tempo)

        const regionStart = getLinkStartAt()
        const currentPos = player.currentTime
        const preserve = opts.preservePosition
            || (playingIntentRef.current && !userPausedRef.current && currentPos > regionStart + 0.05)
        if (!preserve) {
            if (player.ended || (regionStart > 0 && currentPos < regionStart - 0.05)) {
                player.currentTime = regionStart
                setCurrentTime(regionStart)
            }
        }

        return player.play().then(function() {
            confirmPlayingStarted()
            return true
        }).catch(function(e) {
            if (isAutoplayBlockedError(e)) {
                setTapToPlay(true)
            }
            setIsPlaying(false)
            setIsLoading(false)
            return false
        })
    }

    function usesExternalPitchTempo() {
        if (practiceSessionActiveRef.current) return false
        return canUseExternalPitchTempo(getActivePlaybackSettings())
    }

    function needsExternalPitchTempoSettings(tempo, pitch, fineTune) {
        const currentTune = tuneRef.current || tune
        return playbackNeedsExternalProcessing({
            tempo: tempo,
            pitch: pitch,
            fineTune: fineTune,
            audioFilters: getAudioFilterSettings(currentTune),
        })
    }

    function applyNativeMediaPlaybackSettings(tempo) {
        const rate = parseFloat(tempo > 0 ? tempo : 1)
        applyTempoToNativeElement(playerRef.current, rate)
        if (isNativeFilteredActive()) {
            applyTempoToNativeElement(filteredPlayerRef.current, rate)
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
        setNativePlaybackFallbackRequired(false)
        finishPitchShiftPrepare()
        if (externalLoadingProcessorRef.current) {
            externalLoadingProcessorRef.current.abort()
            externalLoadingProcessorRef.current.destroy()
            externalLoadingProcessorRef.current = null
        }
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
        if (isNativeFilteredActive() && filteredPlayerRef.current && filteredPlayerRef.current.duration > 0) {
            return filteredPlayerRef.current.duration
        }
        if (nativeFilteredDurationRef.current > 0) {
            return nativeFilteredDurationRef.current
        }
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

        if (isNativeFilteredActive() && filteredPlayerRef.current) {
            filteredPlayerRef.current.currentTime = clamped
            setClickSeek(nativeFilteredDurationRef.current > 0
                ? Math.min(1, clamped / nativeFilteredDurationRef.current)
                : 0)
            if (wasPlaying) {
                startProgressSync()
                playNativeFilteredMedia({ preservePosition: true })
            }
            finalizeMediaSeek(wasPlaying, 'nativeFiltered')
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
        if (isNativeFilteredActive()) return 'nativeFiltered'
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
        if (engine === 'nativeFiltered') {
            const player = filteredPlayerRef.current
            if (!player) return null
            const t = player.currentTime
            return isFinite(t) ? t : null
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
        const srcType = toNativePlayerSrcType(getSrcType(getSrc(currentTune, linkIndex)))
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
        seekWasPlayingRef.current = false
        seekInProgressRef.current = false
        seekGuardUntilRef.current = 0
        seekHoldUntilRef.current = 0
        stopProgressSync()
        playingIntentRef.current = true
        setPlayCancelled(false)
        resumeSynthAudioContextFromGesture()
        resumeExternalAudioContextFromGesture()

        if (isMidiPlaybackRoute()) {
            setClickSeek(0)
            setCurrentTime(0)
            currentTimeRef.current = 0
            beginSeekHold(0, 1200)
            // Do not setIsPlaying(false) or pause the synth here. The shared
            // useAbcSynth isPlaying effect treats false as "pause output", which
            // races play({ restart: true }) and leaves MIDI stuck after rewind.
            if (!isPlaying) {
                setIsLoading(true)
            }
            play({ restart: true })
            return
        }

        if (isMediaPlaybackRoute()) {
            const startAt = getLinkStartAt()
            const total = resolvePlaybackDuration()
            const ratio = total > 0 ? startAt / total : 0
            setClickSeek(ratio)
            setCurrentTime(startAt)
            seekToSeconds(startAt)
        }
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
        const srcType = toNativePlayerSrcType(getSrcType(src))
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
            playerRef.current.volume = playbackVolume
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
        handleMediaPlaybackCompleted()
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
        if (srcType === 'abc') throw new Error('Nothing to cache for ABC playback')
        const alreadyCached = await isExternalMediaCached(tune.id, idx, src)
        if (alreadyCached) {
            return { cached: true, duration: null, queued: false }
        }
        const jobId = mediaCacheQueue.enqueueCacheJob({
            tuneId: tune.id,
            linkIndex: idx,
            src: src,
            srcType: srcType,
            tuneName: tune.name || '',
            linkTitle: tune.links[idx].title || '',
            youtubeGetId: props.tunebook.utils.YouTubeGetID,
            accessToken: getGoogleAccessToken(),
        })
        if (!jobId) {
            return { cached: true, duration: null, queued: false }
        }
        mediaCacheQueue.start()
        return { cached: false, duration: null, queued: true, jobId: jobId }
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
        const jobId = mediaCacheQueue.enqueueDownloadJob({
            tuneId: tune.id,
            linkIndex: idx,
            src: src,
            srcType: srcType,
            tuneName: tune.name || '',
            linkTitle: tune.links[idx].title || '',
            tune: tune,
            filename: filename,
            youtubeGetId: props.tunebook.utils.YouTubeGetID,
            accessToken: getGoogleAccessToken(),
            demucsModel: getDemucsModel(),
        })
        if (!jobId) {
            throw new Error('Could not queue download')
        }
        mediaCacheQueue.start()
        return { queued: true, jobId: jobId }
    }

    async function saveProcessedMediaToFile(linkIndex) {
        return saveExternalMediaToFile(linkIndex)
    }

    function unmuteNativePlayers() {
        applyPlaybackVolumeToActiveRoute(playbackVolume)
    }

    function isYoutubePlayerDomAttached() {
        if (!ytPlayerRef || !ytPlayerRef.current) return false
        try {
            if (typeof ytPlayerRef.current.getIframe === 'function') {
                const iframe = ytPlayerRef.current.getIframe()
                return !!(iframe && iframe.parentNode)
            }
        } catch (e) {
            return false
        }
        return true
    }

    function isYoutubePlayerReady() {
        return !!(ytPlayerRef && ytPlayerRef.current
            && typeof ytPlayerRef.current.playVideo === 'function'
            && isYoutubePlayerDomAttached())
    }

    function getActiveMediaSrc() {
        return getSrc(tuneRef.current || tune, mediaLinkNumberRef.current)
    }

    function isYoutubePlayerReadyForActiveSrc() {
        return shouldUseExistingPlayer(
            ytPlayerLoadedSrcRef.current,
            getActiveMediaSrc(),
            isYoutubePlayerReady()
        )
    }

    function notifyYoutubeSrcChanged() {
        ytPlayerLoadedSrcRef.current = null
        youtubeAutoplayAttemptRef.current = 0
        clearYoutubeAutostartWatchdog()
        setNativePlaybackFallbackRequired(false)
    }

    function clearYoutubePlayerRef() {
        cancelYoutubePlayPoll()
        if (ytPlayerRef) {
            ytPlayerRef.current = null
        }
        ytPlayerLoadedSrcRef.current = null
    }

    function pauseYoutubeOutputOnly() {
        cancelYoutubePlayPoll()
        if (ytPlayerRef && ytPlayerRef.current) {
            try {
                ytPlayerRef.current.pauseVideo()
            } catch (e) {}
            try {
                ytPlayerRef.current.mute()
            } catch (e) {}
        }
    }

    function silencePlaybackOutputs() {
        cancelYoutubePlayPoll()
        if (externalMediaRef.current) {
            try {
                externalMediaRef.current.disconnect()
            } catch (e) {}
            setExternalMediaActiveState(false)
        }
        if (filteredPlayerRef && filteredPlayerRef.current && nativeFilteredActiveRef.current) {
            try {
                filteredPlayerRef.current.pause()
            } catch (e) {}
        }
        if (playerRef && playerRef.current) {
            try {
                playerRef.current.pause()
            } catch (e) {}
        }
        pauseYoutubeOutputOnly()
    }

    function shouldAdvanceQueueOnPlaybackEnd() {
        const queue = props.nowPlayingQueue
        return isQueueActive(queue) && queue.autoAdvance !== false && !!props.setNowPlayingQueue
    }

    function handleMediaPlaybackCompleted() {
        if (shouldAdvanceQueueOnPlaybackEnd()) {
            onEnded()
            return
        }
        pauseAtRegionStart()
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
        youtubeAutoplayAttemptRef.current = 0
        clearYoutubeAutostartWatchdog()
        setTapToPlay(false)
        if (!intentShouldConfirmPlayingStarted(getIntentSnapshot())) {
            setIsLoading(false)
            return
        }
        playbackStartedRef.current = true
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
        playbackStartedRef.current = false
        userGesturePlayRef.current = false
        pendingMidiPlayRef.current = null
        pendingPlayRequestRef.current = null
        setRequestedPlayState(null)
        clearYoutubeAutostartWatchdog()
        setIsPlaying(false)
        setIsLoading(false)
        silencePlaybackOutputs()
    }

    function armPlaybackIntent(options) {
        const opts = options || {}
        userPausedRef.current = false
        playingIntentRef.current = true
        playbackStartedRef.current = false
        userGesturePlayRef.current = false
        youtubeAutoplayAttemptRef.current = 0
        setPlayCancelled(false)
        setTapToPlay(false)
        setIsPlaying(false)
        if (opts.showLoading !== false) {
            setIsLoading(true)
        }
    }

    function isYoutubeDetachedError(err) {
        const msg = err && err.message ? String(err.message) : String(err || '')
        return /not attached to the DOM/i.test(msg)
            || /Cannot read properties of null \(reading 'playVideo'\)/.test(msg)
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
        youtubeAutoplayAttemptRef.current = 0
        setTapToPlay(false)
        setPlayCancelled(false)
        resumeSynthAudioContextFromGesture()
        resumeExternalAudioContextFromGesture()
        play(opts)
    }

    // Clear YouTube/autoplay residue when a practice session ends so the next
    // session gets a clean media engine (stale yt refs block the second start).
    function resetPracticeMediaPlayback() {
        cancelYoutubePlayPoll()
        clearYoutubeAutostartWatchdog()
        youtubeAutoplayAttemptRef.current = 0
        notifyYoutubeSrcChanged()
        clearYoutubePlayerRef()
        setTapToPlay(false)
        setPlayCancelled(false)
        setNativePlaybackFallbackRequired(false)
        playbackStartedRef.current = false
        if (externalMediaRef.current || externalMediaActiveRef.current) {
            destroyExternalMedia()
        }
        clearCachedNativePlaybackUrl()
    }

    // Arm playback inside a click handler when the play route is about to mount.
    // Unlocks audio contexts and records intent, but does not call play() yet —
    // players are not mounted on pages like /books, and calling play() there
    // leaves isLoading stuck on the waiting spinner.
    function preparePlaybackFromUserGesture() {
        userPausedRef.current = false
        playingIntentRef.current = true
        playbackStartedRef.current = false
        userGesturePlayRef.current = true
        pendingMidiPlayRef.current = null
        currentTimeRef.current = 0
        setPlayCancelled(false)
        setTapToPlay(false)
        setIsPlaying(false)
        setIsLoading(false)
        setIsReady(false)
        setCurrentTime(0)
        setClickSeek(0)
        setDuration(0)
        cleanupTimers()
        resumeSynthAudioContextFromGesture()
        resumeExternalAudioContextFromGesture()
    }

    function getPendingRouteSnapshot() {
        const useTune = tuneRef.current || tune
        return {
            routeReady: routeReadyRef.current,
            activeTuneId: useTune ? useTune.id : null,
            routeMode: playbackRouteRef.current.mode,
            activeLinkNum: getActiveMediaLinkNumber(),
        }
    }

    function requestPlayback(options) {
        const opts = options || {}
        const tuneId = opts.tuneId
        const playState = opts.playState
        if (!tuneId || !playState) return false

        userPausedRef.current = false
        playingIntentRef.current = true
        playbackStartedRef.current = false
        setPlayCancelled(false)
        setTapToPlay(false)
        setRequestedPlayState(playState)

        if (opts.fromUserGesture !== false) {
            userGesturePlayRef.current = true
            resumeSynthAudioContextFromGesture()
            resumeExternalAudioContextFromGesture()
        }

        pendingPlayRequestRef.current = {
            tuneId: tuneId,
            playState: playState,
            linkNum: playState === 'playMedia' ? (opts.linkNum != null ? opts.linkNum : 0) : null,
            fresh: opts.fresh !== false,
            restart: !!opts.restart,
        }

        setIsLoading(true)

        if (routeMatchesPendingRequest(pendingPlayRequestRef.current, getPendingRouteSnapshot())) {
            return consumePendingPlayRequest(tuneId, playState, opts.linkNum)
        }
        return true
    }

    function consumePendingPlayRequest(tuneId, playState, linkNum) {
        const pending = pendingPlayRequestRef.current
        if (!pendingRequestMatchesRoute(pending, tuneId, playState, linkNum)) {
            return false
        }
        pendingPlayRequestRef.current = null

        const playOpts = {}
        if (pending.restart) {
            playOpts.restart = true
        } else if (pending.fresh) {
            playOpts.fresh = true
        }
        play(playOpts)
        return true
    }

    async function resumeAudioContextAndPlay() {
        setTapToPlay(false)
        setPlayCancelled(false)
        userGesturePlayRef.current = true
        youtubeAutoplayAttemptRef.current = 0
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
            handleMediaPlaybackCompleted()
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
        const cacheOptions = getExternalMediaCacheOptions(tuneRef.current || tune, mediaLinkNumberRef.current)

        if (wasConnected || playingIntentRef.current) {
            externalHandoffGuardUntilRef.current = Date.now() + 2000
        }

        const filtersActive = !!(settings.audioFilters && !audioFiltersAreNeutral(settings.audioFilters))

        const finalize = async function() {
            if (!wantsOutput) {
                finishPitchShiftPrepareRef.current()
                return true
            }

            if (wasConnected) {
                setExternalMediaActiveState(true)
                confirmPlayingStarted()
                return true
            }

            let handoff = trySyncExternalHandoff()
            if (!handoff.ok && handoff.reason === 'context-not-running') {
                const running = await waitForExternalContextRunning(2500)
                if (running && hasActivePlaybackIntent()) {
                    handoff = trySyncExternalHandoff()
                }
            }
            if (handoff.ok) {
                confirmPlayingStarted()
                return true
            }

            applyNativeTempoBridge(settings)
            finishPitchShiftPrepareRef.current()
            if (!filtersActive && handoff.reason === 'context-not-running') {
                return true
            }
            if (playingIntentRef.current && !userPausedRef.current) {
                setTapToPlay(true)
            }
            return false
        }

        return externalMediaRef.current.applySettings(
            settings.tempo,
            settings.pitch,
            settings.fineTune,
            settings.audioFilters,
            cacheOptions
        ).then(finalize).catch(function(e) {
            console.log('External media settings failed', e)
            finishPitchShiftPrepareRef.current()
            return false
        })
    }

    async function prepareExternalMedia(forceSrc, playbackSettings, options) {
        const settings = playbackSettings || getMediaPlaybackSettings(tune)
        const opts = options || {}
        if (practiceUsesNativePlaybackOnly(settings)) {
            return false
        }
        if (practiceSessionActiveRef.current
            && !userGesturePlayRef.current
            && !playingIntentRef.current
            && !opts.forcePracticePrep) {
            pendingExternalSettingsRef.current = settings
            return false
        }
        const src = forceSrc || getSrc(tune, mediaLinkNumber)
        const cacheAvailable = tune && src
            ? await isExternalMediaCached(tune.id, mediaLinkNumber, src)
            : false
        if (!canUseExternalPitchTempo(settings) && !(opts.allowCachedOnly && cacheAvailable && settingsRequireExternalMediaProcessor(settings))) {
            destroyExternalMedia()
            return false
        }
        const srcType = getSrcType(src)
        if (!src || srcType === 'abc') return false

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
            let processor = null
            try {
                processor = new ExternalMediaPitchTempo(
                    function(time) {
                        if (onExternalTimeUpdateRef.current) onExternalTimeUpdateRef.current(time)
                    },
                    function() {
                        if (onExternalEndedRef.current) onExternalEndedRef.current()
                    },
                    acquireExternalAudioContext(),
                    function() {
                        finishPitchShiftPrepareRef.current()
                    }
                )
                externalLoadingProcessorRef.current = processor
                const youtubeGetId = props.tunebook.utils.YouTubeGetID
                const activeLink = getActiveLink()
                const trimBounds = activeLink ? getLinkTrimBounds(activeLink) : null
                const loadedDuration = await processor.load(src, srcType, youtubeGetId, {
                    tuneId: tune.id,
                    linkIndex: mediaLinkNumber,
                    accessToken: getGoogleAccessToken(),
                    trimBounds: trimBounds,
                })
                if (token !== externalLoadToken.current) {
                    processor.destroy()
                    externalLoadingProcessorRef.current = null
                    return false
                }
                if (!loadedDuration) {
                    processor.destroy()
                    externalLoadingProcessorRef.current = null
                    return false
                }

                const finalSettings = pendingExternalSettingsRef.current || settings
                pendingExternalSettingsRef.current = null
                await processor.applySettings(
                    finalSettings.tempo,
                    finalSettings.pitch,
                    finalSettings.fineTune,
                    finalSettings.audioFilters,
                    {
                        tuneId: tune.id,
                        linkIndex: mediaLinkNumber,
                        src: src,
                        srcType: srcType,
                        accessToken: getGoogleAccessToken(),
                    }
                )
                let seekSeconds = getCurrentPlaybackSeconds()
                if (seekSeconds <= 0) seekSeconds = resumeAtLoadStart
                if (seekSeconds <= 0) seekSeconds = getLinkPlaybackStartOffset()
                const trimStart = trimBounds && trimBounds.startSec > 0 ? trimBounds.startSec : 0
                if (trimStart > 0) {
                    seekSeconds = Math.max(0, seekSeconds - trimStart)
                }
                if (loadedDuration > 0 && seekSeconds > 0) {
                    processor.seek(Math.min(1, seekSeconds / loadedDuration))
                }

                externalMediaRef.current = processor
                externalLoadingProcessorRef.current = null
                externalLoadedSrcRef.current = src
                setDuration(loadedDuration)
                setCurrentTime(seekSeconds)
                setIsReady(true)

                if (opts.autoPlay !== false && hasActivePlaybackIntent()) {
                    const applied = await applyExternalMediaSettings(finalSettings, {
                        resumePlayback: true,
                        forcePlay: true,
                    })
                    if (!applied && opts.fallbackNative !== false && hasActivePlaybackIntent()) {
                        setExternalMediaActiveState(false)
                        if (practiceSessionActiveRef.current && srcType === 'youtube') {
                            setNativePlaybackFallbackRequired(true)
                        }
                        playNativeMedia(srcType)
                        applyNativeMediaPlaybackSettings(finalSettings.tempo)
                    }
                    return applied
                }

                return true
            } catch (e) {
                console.log('External pitch/tempo load failed, using native playback', e)
                finishPitchShiftPrepareRef.current()
                if (processor) {
                    processor.destroy()
                }
                externalLoadingProcessorRef.current = null
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

            if (isExternalMediaConnected() && preservePosition && !opts.restart && !opts.forceReconnect) {
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
    const tuneId = tune ? tune.id : null
    const mediaLinkUrl = tune && tune.links && mediaLinkNumber !== null && tune.links[mediaLinkNumber]
        ? tune.links[mediaLinkNumber].link
        : null

    useEffect(function() {
         if (practiceSessionActiveRef.current) return
         const snapshot = getIntentSnapshot()
         if (intentIsSeekGuardActive(snapshot)) return
         if (isTuneListPath(getAppPathname()) && !isPlaying && !isLoading) return
         if (intentShouldTriggerAutoplayRecovery(snapshot, { tapToPlay: tapToPlay, isLoading: isLoading })) {
             play({ preservePosition: true })
         }
     // eslint-disable-next-line react-hooks/exhaustive-deps -- autoplay recovery reads latest intent snapshot and play()
     },[tapToPlay, playCancelled, mediaLinkNumber, isPlaying, isLoading])

    useEffect(function() {
        let cancelled = false
        if (!tune || mediaLinkNumber === null || mediaLinkNumber === undefined) {
            setStemsReadyForMedia(false)
            setAvailableStemNames([])
            return undefined
        }
        refreshStemsReadyState(tune, mediaLinkNumber).then(function(ready) {
            if (!cancelled) {
                setStemsReadyForMedia(!!ready)
            }
        })
        return function() {
            cancelled = true
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh stems when tune/link changes
    }, [
        tuneId,
        mediaLinkNumber,
        mediaLinkUrl,
        tune,
    ])
    
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
            if (isOwnedMediaLinkUri(src)) return 'recording'
            return props.tunebook.utils.isYoutubeLink(src) ? 'youtube' : 'audio'
        } else {
            return 'abc'
        }
    }

    function toNativePlayerSrcType(srcType) {
        return srcType === 'recording' ? 'audio' : srcType
    }

    async function attachNativeBlobUrlForPlayback(blobUrl, duration, settings) {
        applyNativePlaybackBlobUrl(blobUrl)
        if (duration) {
            setDuration(duration)
        }
        const player = playerRef && playerRef.current
        if (player) {
            const tempo = settings && settings.tempo > 0 ? settings.tempo : playbackSpeed
            applyNativeMediaPlaybackSettings(tempo)
            applyPlaybackVolumeToActiveRoute(playbackVolume)
            const ready = await waitForMediaElementReady(player)
            if (!ready) {
                throw new Error('Recording audio failed to load')
            }
        }
        setIsReady(true)
    }
    
    function setTune(t) {
        commitTuneState(t)
        if (t) {
            const playback = getPlaybackSettings(t)
            lastNotifiedPitchRef.current = {
                pitch: playback.pitch,
                fineTune: playback.fineTune,
            }
            const tempo = t.playbackTempo > 0 ? parseFloat(t.playbackTempo) : 1
            setPlaybackSpeed(tempo)
        } else {
            finishPitchShiftPrepare()
            lastNotifiedPitchRef.current = { pitch: 0, fineTune: 0 }
        }
    }

    function applyLinkedMediaPlaybackSettings(settings, options) {
        notePitchShiftApplyStarted(settings)

        if (isMidiPlaybackRoute()) {
            if (applyMidiTempoRef.current) {
                applyMidiTempoRef.current(settings.tempo, settings.pitch, settings.fineTune, options)
            }
            return
        }

        if (!isMediaPlaybackRoute()) {
            return
        }

        const opts = options || {}

        if (opts.liveTempoOnly) {
            setPlaybackSpeed(settings.tempo)
            const currentTune = tuneRef.current || tune
            const linkIndex = mediaLinkNumberRef.current !== null && mediaLinkNumberRef.current !== undefined
                ? mediaLinkNumberRef.current
                : mediaLinkNumber
            const currentSrc = getSrc(currentTune, linkIndex)
            if (externalMediaRef.current
                && externalLoadedSrcRef.current === currentSrc
                && isExternalMediaConnected()) {
                applyExternalMediaSettings(settings, {
                    resumePlayback: true,
                    forcePlay: playingIntentRef.current,
                })
                return
            }
            applyNativeMediaPlaybackSettings(settings.tempo)
            return
        }

        if (settingsRequireExternalMediaProcessor(settings)) {
            resumeExternalAudioContextFromGesture()
        }

        const currentTune = tuneRef.current || tune
        const linkIndex = mediaLinkNumberRef.current !== null && mediaLinkNumberRef.current !== undefined
            ? mediaLinkNumberRef.current
            : mediaLinkNumber
        const currentSrc = getSrc(currentTune, linkIndex)
        const srcType = getSrcType(currentSrc)
        const wantsNativeFiltered = canUseNativeFilteredPlayback(settings)
        const wantsExternal = canUseExternalPitchTempo(settings)
        const playingNow = playingIntentRef.current

        if (practiceUsesNativePlaybackOnly(settings)) {
            pendingExternalSettingsRef.current = null
            setPlaybackSpeed(settings.tempo)
            applyNativeMediaPlaybackSettings(settings.tempo)
            return
        }

        if (practiceSessionActiveRef.current && !playingNow
            && !(externalMediaRef.current && externalLoadedSrcRef.current === currentSrc)) {
            pendingExternalSettingsRef.current = settings
            setPlaybackSpeed(settings.tempo)
            if (settings.pitch === 0 && settings.fineTune === 0
                && audioFiltersAreNeutral(settings.audioFilters)) {
                applyNativeMediaPlaybackSettings(settings.tempo)
            }
            return
        }

        if (wantsNativeFiltered) {
            return applyNativeFilteredPlayback(settings, {
                play: playingNow,
                resumePlayback: true,
                forcePlay: playingNow,
            })
        }

        if (nativeFilteredActiveRef.current) {
            destroyNativeFilteredPlayback()
        }

        if (externalMediaRef.current && externalLoadedSrcRef.current === currentSrc) {
            return applyExternalMediaSettings(settings, { resumePlayback: true, forcePlay: playingNow })
        }

        if (wantsExternal) {
            const resumeAt = getCurrentPlaybackSeconds()
            const tempoOnly = settings.pitch === 0
                && settings.fineTune === 0
                && audioFiltersAreNeutral(settings.audioFilters)
            if (tempoOnly && playingNow && !isExternalMediaConnected()) {
                applyNativeMediaPlaybackSettings(settings.tempo)
                if (!practiceSessionActiveRef.current && !externalLoadingRef.current) {
                    prepareExternalMedia(undefined, settings, {
                        autoPlay: false,
                        showLoading: false,
                        fallbackNative: false,
                    })
                } else if (!practiceSessionActiveRef.current) {
                    pendingExternalSettingsRef.current = settings
                }
                return
            }
            if (practiceSessionActiveRef.current && playingNow && externalMediaRef.current
                && externalLoadedSrcRef.current === currentSrc) {
                applyExternalMediaSettings(settings, {
                    resumePlayback: true,
                    forcePlay: true,
                })
                return
            }
            return prepareExternalMedia(undefined, settings, {
                autoPlay: playingNow,
                showLoading: false,
                fallbackNative: true,
            }).then(function(loaded) {
                if (!loaded && playingNow) {
                    playNativeMedia(srcType)
                    applyNativeMediaPlaybackSettings(settings.tempo)
                    if (resumeAt > 0) seekToSeconds(resumeAt)
                }
            })
        } else {
            const resumeAt = getCurrentPlaybackSeconds()
            const playingNow = playingIntentRef.current
            if (externalMediaRef.current || externalMediaActiveRef.current) {
                destroyExternalMedia()
                if (playingNow) {
                    playNativeMedia(srcType)
                    if (resumeAt > 0 && duration > 0) {
                        seekToSeconds(resumeAt)
                    }
                }
            } else if (nativeFilteredActiveRef.current) {
                destroyNativeFilteredPlayback()
                if (playingNow) {
                    playNativeMedia(srcType)
                    if (resumeAt > 0 && duration > 0) {
                        seekToSeconds(resumeAt)
                    }
                }
            }
            applyNativeMediaPlaybackSettings(settings.tempo)
        }
    }

    function updateTunePlaybackSettings(tempo, pitch, fineTune) {
        const currentTune = tuneRef.current || tune
        if (!currentTune) return
        const settings = {
            tempo: tempo,
            pitch: pitch,
            fineTune: fineTune,
            audioFilters: getAudioFilterSettings(currentTune),
        }
        const updated = Object.assign({}, currentTune, {
            playbackTempo: tempo,
            playbackPitch: pitch,
            playbackFineTune: fineTune,
        })
        commitTuneState(updated)
        setPlaybackSpeed(tempo)
        applyLinkedMediaPlaybackSettings(settings)
    }

    function applyLivePlaybackSettings(tempo, pitch, fineTune, options) {
        const currentTune = tuneRef.current || tune
        if (!currentTune) return
        const settings = {
            tempo: tempo,
            pitch: pitch,
            fineTune: fineTune,
            audioFilters: getAudioFilterSettings(currentTune),
        }
        setPlaybackSpeed(tempo)
        return applyLinkedMediaPlaybackSettings(settings, options)
    }

    function updateTuneAudioFilterSettings(filters) {
        const currentTune = tuneRef.current || tune
        if (!currentTune) return
        const normalized = normalizeAudioFilters(filters)
        const playback = getPlaybackSettings(currentTune)
        const settings = {
            tempo: playback.tempo,
            pitch: playback.pitch,
            fineTune: playback.fineTune,
            audioFilters: normalized,
        }
        const updated = Object.assign({}, currentTune, {
            playbackAudioFilters: normalized,
        })
        commitTuneState(updated)

        if (audioFiltersAreNeutral(normalized) || !isMediaPlaybackRoute()) {
            return applyLinkedMediaPlaybackSettings(settings)
        }

        if (!hasStemsForCurrentMedia()) {
            return
        }

        return applyLinkedMediaPlaybackSettings(settings)
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
        const nativePlayer = isNativeFilteredActive() ? filteredPlayerRef.current : playerRef.current
        if (!nativePlayer || !hasActivePlaybackIntent()) return
        if (tune && Array.isArray(tune.links) && tune.links.length > mediaLinkNumber) {
            if (tune.links[mediaLinkNumber] && getLinkEndAt() > 0 && nativePlayer.currentTime >= getLinkEndAt()) {
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
        if (mediaLinkNumber !== null && getLinkEndAt() > 0 && !shouldAdvanceQueueOnPlaybackEnd()) {
            pauseAtRegionStart()
            return
        }
        if (practiceSessionHandlerRef.current) {
            practiceSessionHandlerRef.current()
            return
        }
        const playingId = tuneRef.current && tuneRef.current.id ? tuneRef.current.id : null
        const pathname = typeof window !== 'undefined' ? (window.location.hash || '').replace(/^#/, '') : ''
        const failCallback = function(reason) {
            stop()
            setIsLoading(false)
        }
        if (isQueueActive(props.nowPlayingQueue) && props.setNowPlayingQueue) {
            const playbackMode = playbackRouteRef.current.mode === 'midi'
                ? 'midi'
                : (playbackRouteRef.current.mode === 'media' ? 'media' : playbackModeFromPathname(pathname))
            const advanced = handleQueueAdvanceOnEnded({
                queue: props.nowPlayingQueue,
                setQueue: props.setNowPlayingQueue,
                tunes: props.tunes,
                tunebook: props.tunebook,
                mediaController: {
                    setTune: setTune,
                    setMediaLinkNumber: setMediaLinkNumber,
                    applyPlaybackRoute: applyPlaybackRoute,
                    play: play,
                    playFromUserGesture: playFromUserGesture,
                    armPlaybackIntent: armPlaybackIntent,
                },
                navigate: function(path) { props.tunebook.navigate(path) },
                location: { pathname: pathname },
                setPlaylist: props.setPlaylist,
                practiceSessionActive: props.practiceSessionActiveRef && props.practiceSessionActiveRef.current,
                currentPlayingTuneId: playingId,
                failCallback: failCallback,
                playbackMode: playbackMode,
                isYoutubeLink: props.tunebook.utils && props.tunebook.utils.isYoutubeLink,
            })
            if (advanced) return
        }
        props.tunebook.navigateToNextSong(playingId, failCallback, function(path) {
            props.tunebook.navigate(path)
        }, pathname)
    }

    function setPracticeSessionHandler(handler) {
        practiceSessionHandlerRef.current = typeof handler === 'function' ? handler : null
    }

    function setPracticeSessionActive(active) {
        const wasActive = practiceSessionActiveRef.current
        practiceSessionActiveRef.current = !!active
        if (wasActive && !active) {
            setCurrentTimeState(currentTimeRef.current)
        } else if (!wasActive && active && progressIntervalRef.current) {
            stopProgressSync()
            startProgressSync()
        }
    }

    function captureSuspendedQueuePlayback(queue) {
        const playingId = getCurrentTuneId(queue)
        const activeTune = tuneRef.current
        if (!playingId || !activeTune || activeTune.id !== playingId) return null
        const route = playbackRouteRef.current
        if (!route || route.mode === 'none') return null

        let resumeMode = 'idle'
        if (hasActivePlaybackIntent()) {
            resumeMode = 'playing'
        } else if (userPausedRef.current && hasPlayingIntent()) {
            resumeMode = 'paused'
        } else if (userPausedRef.current) {
            resumeMode = 'paused'
        }

        return {
            tuneId: playingId,
            linkIndex: mediaLinkNumber,
            routeMode: route.mode,
            positionSeconds: currentTimeRef.current,
            resumeMode: resumeMode,
        }
    }

    function restoreSuspendedQueuePlayback(playbackResume, tunes, tunebook) {
        if (!playbackResume || !tunes || !tunebook) return false
        const tune = tunes[playbackResume.tuneId]
        if (!tune) return false

        queuePlaybackResumeRef.current = {
            tuneId: playbackResume.tuneId,
            positionSeconds: playbackResume.positionSeconds,
            resumeMode: playbackResume.resumeMode,
        }

        setTune(tune)
        if (playbackResume.routeMode === 'media') {
            setMediaLinkNumber(playbackResume.linkIndex != null ? playbackResume.linkIndex : 0)
        } else {
            setMediaLinkNumber(null)
        }

        const playState = playbackResume.routeMode === 'midi' ? 'playMidi' : 'playMedia'
        const linkParam = playbackResume.routeMode === 'media'
            ? String(playbackResume.linkIndex != null ? playbackResume.linkIndex : 0)
            : '0'
        applyPlaybackRoute(playState, linkParam, tune, tunebook)

        const pos = typeof playbackResume.positionSeconds === 'number' ? playbackResume.positionSeconds : 0
        setCurrentTime(pos)
        currentTimeRef.current = pos
        const total = resolvePlaybackDuration()
        if (total > 0) {
            setClickSeek(pos / total)
        }

        if (playbackResume.resumeMode === 'playing') {
            playingIntentRef.current = true
            userPausedRef.current = false
            setIsPlaying(false)
            setIsLoading(true)
        } else if (playbackResume.resumeMode === 'paused') {
            playingIntentRef.current = true
            userPausedRef.current = true
            setIsPlaying(false)
            setIsLoading(false)
        } else {
            playingIntentRef.current = false
            userPausedRef.current = false
            setIsPlaying(false)
            setIsLoading(false)
        }
        return true
    }

    function consumeQueuePlaybackResume(tuneId) {
        const pending = queuePlaybackResumeRef.current
        if (!pending || pending.tuneId !== tuneId) return null
        queuePlaybackResumeRef.current = null
        return pending.positionSeconds
    }

    function getActivePreparedMediaSrc() {
        if (externalLoadedSrcRef.current) return externalLoadedSrcRef.current
        const activeTune = tuneRef.current
        if (!activeTune || playbackRouteRef.current.mode !== 'media') return null
        return getSrc(activeTune, getActiveMediaLinkNumber())
    }

    function shouldPreserveMediaEngineOnHostHandoff() {
        if (playbackRouteRef.current.mode !== 'media') return false
        return hasActivePlaybackIntent()
    }

    function getPlaybackHandoffPosition(tuneId) {
        if (!tuneId || queuePlaybackResumeRef.current) return null
        const activeTune = tuneRef.current
        if (!activeTune || activeTune.id !== tuneId) return null
        if (playbackRouteRef.current.mode === 'none') return null

        const shouldPreserve = userPausedRef.current
            || hasActivePlaybackIntent()
            || (hasPlayingIntent() && currentTimeRef.current > getLinkStartAt() + 0.05)

        if (!shouldPreserve) return null
        return currentTimeRef.current
    }

    function applyPreservedPlaybackPosition(seconds) {
        const pos = typeof seconds === 'number' ? seconds : 0
        setCurrentTime(pos)
        currentTimeRef.current = pos
        const total = resolvePlaybackDuration()
        if (total > 0) {
            setClickSeek(pos / total)
        }
    }

    function invokePracticeSessionHandler() {
        if (practiceSessionHandlerRef.current) {
            practiceSessionHandlerRef.current()
            return true
        }
        return false
    }
    
    function onError(e) {
        console.log('ERROR',e)
        if (practiceSessionActiveRef.current && playingIntentRef.current) {
            setTapToPlay(true)
        }
        abortPlayingIntent()
        cleanupTimers()
    }
    
    
    function onMediaReady(e) {
        cleanupTimers()
        if (isSeekGuardActive()) {
            setIsReady(true)
            return
        }
        if (isNativeFilteredActive()) {
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
            if (externalLoadingRef.current) {
                setIsReady(true)
                return
            }
            const regionStart = getLinkStartAt()
            const preservePosition = currentTimeRef.current > regionStart + 0.05
            if (externalMediaRef.current && canUseExternalPitchTempo()) {
                playExternalMedia({ preservePosition: preservePosition }).then(function(ok) {
                    if (!ok && hasActivePlaybackIntent() && !externalLoadingRef.current) {
                        playNativeMedia(
                            toNativePlayerSrcType(getSrcType(getSrc(tune, mediaLinkNumber))),
                            { preservePosition: preservePosition }
                        )
                    }
                })
                return
            }
            playNativeMedia(
                toNativePlayerSrcType(getSrcType(getSrc(tune, mediaLinkNumber))),
                { preservePosition: preservePosition }
            )
        }
        if (!externalMediaActiveRef.current) {
            setIsReady(true)
            applyNativeMediaPlaybackSettings(playbackSpeed)
        }
    }

    function onYtReady(e) {
        cleanupTimers()
        ytPlayerRef.current = e.target
        ytPlayerLoadedSrcRef.current = getActiveMediaSrc()

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
        const regionStart = getLinkStartAt()
        const preservePosition = currentTimeRef.current > regionStart + 0.05
        if (!preservePosition) {
            setCurrentTime(regionStart)
        }
        if (hasActivePlaybackIntent()) {
            if (externalMediaRef.current && canUseExternalPitchTempo()) {
                playExternalMedia({ preservePosition: preservePosition }).then(function(ok) {
                    if (!ok && hasActivePlaybackIntent()) {
                        playNativeMedia('youtube', { preservePosition: preservePosition })
                    }
                })
            } else {
                playNativeMedia('youtube', { preservePosition: preservePosition })
            }
        }
    }
    
    
    function isExternalOutputActive() {
        return isExternalMediaConnected() || externalMediaActiveRef.current
    }

    // Maximum number of automatic playVideo() retries before we give up and ask
    // the user to tap. Cold-start playback (e.g. from the books page) has no
    // gesture inside the freshly created iframe, so the browser can refuse to
    // autoplay and the player bounces between unstarted/buffering states.
    var MAX_YT_AUTOPLAY_ATTEMPTS = 2

    function clearYoutubeAutostartWatchdog() {
        if (youtubeAutostartWatchdogRef.current) {
            clearTimeout(youtubeAutostartWatchdogRef.current)
            youtubeAutostartWatchdogRef.current = null
        }
    }

    function armYoutubeAutostartWatchdog() {
        // Only arm once per autostart episode. Deliberately NOT cleared by
        // cleanupTimers so it survives the unstarted/ready churn of a cold start.
        if (youtubeAutostartWatchdogRef.current) return
        if (!playingIntentRef.current || userPausedRef.current) return
        youtubeAutostartWatchdogRef.current = setTimeout(function() {
            youtubeAutostartWatchdogRef.current = null
            if (playbackStartedRef.current) return
            if (!playingIntentRef.current || userPausedRef.current) return
            try {
                if (isYoutubePlayerReady()) {
                    const state = ytPlayerRef.current.getPlayerState()
                    // Still loading or already playing — do not prompt tap-to-play yet.
                    if (state === 1 || state === 3) return
                }
            } catch (e) {}
            // Playback never confirmed — the browser refused to autoplay. Ask the
            // user to tap to start.
            cancelYoutubePlayPoll()
            setTapToPlay(true)
            setIsLoading(false)
        }, 3500)
    }

    function retryYoutubeAutostartOrPromptTap(opts) {
        if (!playingIntentRef.current || userPausedRef.current) return
        if (youtubeAutoplayAttemptRef.current >= MAX_YT_AUTOPLAY_ATTEMPTS) {
            // The browser is blocking autoplay — stop retrying and surface the
            // tap-to-play prompt so a single click can start playback.
            cancelYoutubePlayPoll()
            setTapToPlay(true)
            setIsLoading(false)
            return
        }
        youtubeAutoplayAttemptRef.current += 1
        playNativeMedia('youtube', opts)
    }

    function onYtStateChange(e) {
         if (isExternalOutputActive() || isNativeFilteredActive()) {
             if (e.data === 3) {
                 if (!practiceSessionActiveRef.current || !playbackStartedRef.current) {
                     setIsLoading(true)
                 }
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
            if (!userPausedRef.current && playingIntentRef.current) {
                confirmPlayingStarted()
            }
         } else if (e.data === -1) {
            cleanupTimers()
            setIsLoading(false)
            if (playingIntentRef.current && !userPausedRef.current) {
                const resumePos = currentTimeRef.current
                retryYoutubeAutostartOrPromptTap({
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
                handleMediaPlaybackCompleted()
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
            if (!practiceSessionActiveRef.current || !playbackStartedRef.current) {
                setIsLoading(true)
            }
        } else if (e.data === 5) {
            cleanupTimers()
            setIsLoading(false)
            if (playingIntentRef.current && !userPausedRef.current) {
                retryYoutubeAutostartOrPromptTap({ preservePosition: true, userResume: true })
            }
        }
        
    }
    

    function hasActivePlaybackOutput() {
        if (isMidiPlaybackRoute()) {
            return false
        }
        if (isExternalOutputActive() || isNativeFilteredActive()) {
            return true
        }
        if (playerRef && playerRef.current) {
            try {
                if (!playerRef.current.paused && !playerRef.current.ended) return true
            } catch (e) {}
        }
        if (isYoutubePlayerReadyForActiveSrc()) {
            try {
                const state = ytPlayerRef.current.getPlayerState()
                return state === 1 || state === 3
            } catch (e) {}
        }
        return false
    }

    // PLAYBACK CONTROLS

    function play(options) {
        const opts = options || {}
        applyPlaybackVolumeToActiveRoute(playbackVolume)
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
            && !userPausedRef.current
            && hasActivePlaybackOutput()) {
            return
        }
        if (opts.fresh) {
            userPausedRef.current = false
        }
        const useTune = tuneRef.current || tune
        const route = playbackRouteRef.current
        const linkIndex = getActiveMediaLinkNumber()

        if (opts.fresh && route.mode === 'media') {
            const startAt = getLinkStartAt()
            currentTimeRef.current = startAt
            setCurrentTime(startAt)
            setClickSeek(0)
        }

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
                    playMidiRef.current({ resume: true })
                } else {
                    pendingMidiPlayRef.current = { resume: true }
                    forceMidiChange()
                }
                return
            }

            if (route.mode === 'media') {
                const srcType = getSrcType(getSrc(useTune, linkIndex))
                resumeSynthAudioContextFromGesture()
                resumeExternalAudioContextFromGesture()
                if (canUseExternalPitchTempo() && externalMediaRef.current
                    && externalLoadedSrcRef.current === getSrc(useTune, linkIndex)) {
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
        if (props.forceRefresh && !practiceSessionActiveRef.current && !opts.restart) {
            props.forceRefresh()
        }

        if (route.mode === 'midi') {
            stopLinkedMediaPlayback()
            if (resumeSynthAudioContextRef.current) {
                resumeSynthAudioContextRef.current()
            }
            trackPlaybackStart('midi')
            setIsLoading(true)
            if (playMidiRef.current) {
                playMidiRef.current(opts)
            } else {
                pendingMidiPlayRef.current = opts
                forceMidiChange()
            }
            return
        }

        if (route.mode !== 'media') {
            if (shouldKeepIntentWhenRouteNotReady(pendingPlayRequestRef.current, route.mode)) {
                return
            }
            playingIntentRef.current = false
            setIsLoading(false)
            return
        }

        trackPlaybackStart('media')

        stopMidiPlayback()
        const src = getSrc(useTune, linkIndex)
        const srcType = getSrcType(src)

        setIsLoading(true)
        startLinkedMediaPlayback(useTune, linkIndex, src, srcType, opts)
    }

    function playNativeMedia(srcType, options) {
        const opts = options || {}
        srcType = toNativePlayerSrcType(srcType)
        if (shouldBlockAutoplayDuringSeek(opts)) {
            return
        }
        if (!hasActivePlaybackIntent()) {
            setIsLoading(false)
            return
        }
        unmuteNativePlayers()
        if (srcType === 'audio' && playerRef && playerRef.current) {
            try {
                const regionStart = getLinkStartAt()
                const currentPos = playerRef.current.currentTime
                const preservedPos = currentTimeRef.current
                const preserve = opts.preservePosition
                    || (playingIntentRef.current && !userPausedRef.current && preservedPos > regionStart + 0.05)
                if (preserve && preservedPos > regionStart + 0.05
                    && Math.abs(currentPos - preservedPos) > 0.25) {
                    // Fresh media element after host handoff starts at 0; seek to
                    // the position we preserved in controller state.
                    playerRef.current.currentTime = preservedPos
                    setCurrentTime(preservedPos)
                } else if (!preserve) {
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
            setNativePlaybackFallbackRequired(true)
            if (playingIntentRef.current && !userPausedRef.current) {
                armYoutubeAutostartWatchdog()
            }
            if (isYoutubePlayerReadyForActiveSrc()) {
                try {
                    const regionStart = getLinkStartAt()
                    ytPlayerRef.current.unMute()
                    let currentPos = 0
                    try {
                        currentPos = ytPlayerRef.current.getCurrentTime()
                    } catch (e) {}
                    const preservedPos = currentTimeRef.current
                    const preserve = opts.preservePosition
                        || (playingIntentRef.current && !userPausedRef.current && preservedPos > regionStart + 0.05)
                    if (preserve && preservedPos > regionStart + 0.05
                        && Math.abs(currentPos - preservedPos) > 0.25) {
                        // Fresh iframe after host handoff starts at 0; seek to
                        // the position we preserved in controller state.
                        ytPlayerRef.current.seekTo(preservedPos, true)
                        setCurrentTime(preservedPos)
                    } else if (!preserve) {
                        if (regionStart > 0 && currentPos < regionStart - 0.05) {
                            ytPlayerRef.current.seekTo(regionStart, true)
                            setCurrentTime(regionStart)
                        }
                    }
                    ytPlayerRef.current.playVideo()
                    pollConfirmYoutubePlaying()
                } catch (e) {
                    console.log("YT play err", e)
                    if (isYoutubeDetachedError(e)) {
                        clearYoutubePlayerRef()
                    }
                    if (isAutoplayBlockedError(e)) {
                        setTapToPlay(true)
                        setIsLoading(false)
                    } else if (playingIntentRef.current) {
                        setIsLoading(true)
                    } else {
                        setIsLoading(false)
                    }
                }
            } else if (playingIntentRef.current) {
                // Iframe still loading — onYtReady will call playNativeMedia when ready.
                setNativePlaybackFallbackRequired(true)
                setIsLoading(true)
            } else {
                setIsLoading(false)
            }
        } else if (srcType === 'audio' && playingIntentRef.current) {
            // Audio element not mounted yet — onMediaReady will retry playback.
            setIsLoading(true)
        } else {
            setIsLoading(false)
        }
    }
    
    function pause() {
        seekWasPlayingRef.current = false
        userPausedRef.current = true
        playingIntentRef.current = false
        playbackStartedRef.current = false
        pendingPlayRequestRef.current = null
        cancelYoutubePlayPoll()
        clearYoutubeAutostartWatchdog()
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
        silencePlaybackOutputs()
    }

    function stop() {
        seekWasPlayingRef.current = false
        playingIntentRef.current = false
        playbackStartedRef.current = false
        userPausedRef.current = false
        userGesturePlayRef.current = false
        pendingPlayRequestRef.current = null
        setRequestedPlayState(null)
        stopProgressSync()
        setIsPlaying(false)
        setIsLoading(false)
        setTapToPlay(false)
        setPlayCancelled(false)
        clearYoutubeAutostartWatchdog()
        cleanupTimers()
        const startAt = getLinkStartAt()
        if (mediaLinkNumber === null && stopMidiSynthRef.current) {
            stopMidiSynthRef.current()
        }
        if (externalMediaRef.current) {
            externalMediaRef.current.disconnect()
            setExternalMediaActiveState(false)
            const extDuration = getExternalPlaybackDuration()
            if (extDuration > 0) {
                externalMediaRef.current.seek(startAt / extDuration)
            } else {
                externalMediaRef.current.seek(0)
            }
        }
        if (filteredPlayerRef && filteredPlayerRef.current && nativeFilteredActiveRef.current) {
            try {
                filteredPlayerRef.current.pause()
                filteredPlayerRef.current.currentTime = startAt
            } catch (e) {}
        }
        setCurrentTime(startAt)
        if (playerRef && playerRef.current) {
            playerRef.current.pause()
            playerRef.current.currentTime = startAt
            playerRef.current.volume = playbackVolume
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
    
    
    return {play, playFromUserGesture, preparePlaybackFromUserGesture, requestPlayback, consumePendingPlayRequest, stop, pause, restartPlaybackFromStart, canResumePlayback, seek, seekToSeconds, seekBySeconds, rewindToStart, getPlaybackProgress, getSeekSettlement, currentTime,setCurrentTime, duration, setDuration, playerRef, filteredPlayerRef, ytPlayerRef, onEnded, onError, onTimeUpdate,onAbcTimeUpdate, onYtTimeUpdate ,onYtStateChange,  onYtReady, onMediaReady, isPlaying, setIsPlaying, isLoading, setIsLoading, isReady, setIsReady,  tune, setTune, updateTunePlaybackSettings, applyLivePlaybackSettings, updateTuneAudioFilterSettings, stemSeparationActive, stemAnalysisProgress, stemsReadyForMedia, hasStemsForCurrentMedia, analyseMediaStems, cancelStemAnalysis, saveProcessedMediaToFile, getDemucsModel, getAvailableAudioFilterKeys, getAvailableStemNames, availableStemNames, pitchShiftPreparing, finishPitchShiftPrepareRef, applyPlaybackSettingsLiveRef, applyMidiTempoRef, applyPlaybackVolumeRef, resumeSynthAudioContextRef, pauseSynthRef, stopMidiSynthRef, playMidiRef, pendingMidiPlayRef, resumeMidiAfterSeekRef, seekMidiRef, getMidiPlaybackSecondsRef, userGesturePlayRef, mediaLinkNumber, playbackRouteMode, requestedPlayState, setMediaLinkNumber, getSrc, getSrcType, playbackSpeed, setPlaybackSpeed, playbackVolume, setPlaybackVolume, adjustPlaybackVolume, playbackVolumeStep: PLAYBACK_VOLUME_STEP, clickSeek, setClickSeek, checkAudioContext, forceMidiChange, midiHash, cleanupTimers, tapToPlay, setTapToPlay, playCancelled, setPlayCancelled, prepareExternalMedia, destroyExternalMedia, notifyYoutubeSrcChanged, clearYoutubePlayerRef, resetPracticeMediaPlayback, pauseYoutubeOutputOnly, silencePlaybackOutputs, updateLinkPlaybackLoops, downloadExternalMedia, checkExternalMediaCached, saveExternalMediaToFile, getLinkStartAt, getLinkEndAt, getLinkPlaybackLoop, externalMediaActive, nativePlaybackFallbackRequired, shouldIgnoreNativePlaybackEvents, shouldSuppressSpuriousPause, usesExternalPitchTempo, mediaResolverAvailable, mediaResolverChecked, resolverFeatures, mediaResolverFeaturesEnabled: resolverFeatures.stems, refreshMediaResolverHealth, resumeAudioContextAndPlay, confirmPlayingStarted, abortPlayingIntent, armPlaybackIntent, hasPlayingIntent, hasActivePlaybackIntent, isSeekGuardActive, isMidiPlaybackRoute, isMediaPlaybackRoute, applyPlaybackRoute, maybeAutostart, setPracticeSessionHandler, setPracticeSessionActive, invokePracticeSessionHandler, captureSuspendedQueuePlayback, restoreSuspendedQueuePlayback, consumeQueuePlaybackResume, getPlaybackHandoffPosition, applyPreservedPlaybackPosition, getActivePreparedMediaSrc, shouldPreserveMediaEngineOnHostHandoff, nativePlaybackSrcOverride, clearCachedNativePlaybackUrl}
   //srcSelection, setSrcSelection, src, setSrc,
}
 
