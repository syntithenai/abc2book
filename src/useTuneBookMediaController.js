import {useEffect,useState, useRef} from 'react'
import { isYoutubeDetachedPlayerError } from './youtubePlayerErrors'
import { flushSync } from 'react-dom'
import { toast } from 'react-toastify'
import { App } from '@capacitor/app'
import ExternalMediaPitchTempo from './externalMediaPitchTempo'
import { getMediaPlaybackSettings, getPlaybackSettings, getTunePlaybackSettings, getAudioFilterSettings, normalizeAudioFilters, playbackNeedsExternalProcessing, audioFiltersAreNeutral, getAudioFilterKeysForStemNames, getAudioFilterKeysForDemucsModel, pitchShiftIsActive, combinedPitchSemitones } from './pitchTempoUtils'
import { resolvePlaybackTempo, setGlobalTempoPercent } from './globalTempoSettings'
import { buildFilteredMediaBlob, getNativeFilteredBlobCacheKey } from './nativeFilteredMedia'
import { buildNativePlaybackBlob } from './nativePlaybackBlob'
import { isMobilePlatform, isAndroidApp, prefersNativeMediaPlayback } from './platformUtils'
import {
    shouldUseAndroidNativePlayer,
    ensureAndroidNativeListeners,
    teardownAndroidNativeListeners,
    playAndroidNativeBlobUrl,
    playAndroidNativeUri,
    playAndroidNativeBlob,
    pauseAndroidNativePlayer,
    playAndroidNativePlayer,
    seekAndroidNativePlayer,
    stopAndroidNativePlayer,
    isAndroidNativePlayerActive,
    resumeAndroidNativePlayback,
    getNativePlayerState,
    playAndroidNativeYoutube,
    renderAndPlayAbcNative,
    cancelAbcNativePlayback,
    isAbcNativePlayInFlight,
} from './androidNativePlayback'
import { loadCachedStemSetForMedia } from './audioStemCache'
import { resampleBufferToContextRate } from './audioStemMixer'
import { normalizeStemBufferMap } from './pitchTempoUtils'
import { getMediaResolverHealthState } from './mediaResolverHealthStore'
import { getResolverFeaturesFromStatus } from './resolverFeatures'
import { isStemsCapabilityAvailable, loadProviderSettings } from './providerSettings'
import { parseMsToSeconds, getActivePlaybackLoop, getLinkRegionStart, getLinkRegionEnd, syncLegacyLinkLoopFields, ensureSingleActiveLoop, getActiveLinkIndex, getFirstPlayableMediaLinkIndex } from './mediaPlaybackUtils'
import { isExternalMediaCached, getCachedExternalMediaBlob, getExternalMediaCacheKey, cacheExternalMediaBytes, putExternalMediaCache } from './externalMediaAudioCache'
import { tryRestoreCachedMediaFromThisAccount } from './mediaCacheDriveBackup'
import { shouldAutoCacheMediaLink } from './mediaLinkAutoCache'
import { getLinkTrimBounds } from './mediaAudioTrim'
import { loadOfflineMediaSettings } from './offlineMediaSettings'
import { resolveActiveLinkForTune } from './mediaLinkResolve'
import { buildTuneMediaExportFilename } from './mediaExportUtils'
import * as mediaCacheQueue from './mediaCacheQueue'
import useMediaResolverHealth from './useMediaResolverHealth'
import {
    isMediaProxyConfigured,
    requiresResolverProxiedPlayback,
    fetchDirectOrProxy,
    blobForHtmlAudioPlayback,
    looksLikeAlacAudio,
    getResolverProxiedPlaybackBlock,
    getResolverLoginWarning,
} from './mediaProxyClient'
import {
    setResolverLoginToastBeforeLogin,
    showResolverLoginToast,
} from './resolverLoginToast'
import { linkedMediaPitchPathAvailableSync } from './linkedMediaPitchPath'
import { maybeNotifyYoutubeProxyLimitation } from './youtubeProxyLimitationToast'
import { openCreditSettings } from './resolverCreditAccess'
import { fetchYoutubeAudioViaNative } from './youtubeNativeClient'
import useGoogleDocument from './useGoogleDocument'
import {
    isOwnedMediaLinkUri,
    resolveRecordingLinkAudio,
    resolveTuneLinkCacheSrc,
    findCachedExternalMediaForLink,
    isLinkMediaCached,
    cacheOwnedMediaLinkIfNeeded,
} from './linkRecording'
import { resolveLinkPlaybackSrcType, resolveUriPlaybackSrcType } from './mediaLinkSrcType'
import { linkUriString } from './tuneLinkUri'
import { registerStemSeparationJob } from './longRunningJobRegistry'
import {
  clearStemAnalysisJob,
  getStemAnalysisJobSnapshot,
  updateStemAnalysisJob,
} from './stemAnalysisJobStore'
import { syncPlaybackRoute } from './playbackRouteSync'
import { isQueueActive, getCurrentTuneId, getCurrentItem, isStandaloneExternalQueueItem, isExternalQueueItem, endStopAfterCurrent } from './nowPlayingQueue'
import { isQueueItemPlayable, getResolverProxiedMediaAuthBlock } from './playlistPlaybackResilience'
import { handleQueueAdvanceOnEnded, advanceQueueToPlayableAndStart } from './nowPlayingQueuePlayback'
import { prefetchUpcomingQueueItem } from './queueMediaPrefetch'
import {
    cancelPlaylistTitleAnnouncement,
    confirmQueuedPlaylistTrackAnnouncement,
} from './playlistTitleAnnouncement'
import {
  findNextPlayableLinkIndex,
  getCurrentQueueItemLinkIndex,
  queueItemHasAlternateMediaLinks,
} from './playlistPlaybackSkip'
import {
  shouldIgnorePlaybackEndForManualSkip,
  shouldIgnorePlaybackFailureForManualSkip,
  noteManualPlaylistSkipPlaybackStarted,
} from './playlistManualSkip'
import { isBackgroundCapablePlayback } from './backgroundPlaybackCapability'
import { logPlaybackDebug, isPlaybackDebugEnabled, agentDebugLog } from './playbackDebug'
import { capturePlaybackSnapshot } from './playbackRouterContext'
import {
  isRouterEnforcedForPath,
  ROUTER_ENFORCE_KEYS,
  shouldAttemptSnapcastDefault,
  shouldUseMidiNativePath,
  shouldUseMediaNativePath,
  shouldUseExternalProcessorPath,
  prefersAndroidNativeAudioPath,
  shouldBlockNativeFilteredPath,
} from './playbackRouterParity'
import {
  PLAYBACK_ROUTE_PHASE,
  recordPlaybackRouteParity,
  resolvePlaybackRouteForEnforce,
} from './playbackRouterRecord'
import {
    hardSilenceWebViewOutputs,
    isAndroidNativeOutputOwned,
    shouldBlockWebViewAudioPlay,
} from './androidPlaybackGate'
import { startAndroidProcessedBlobPlayback } from './androidProcessedPlayback'
import { isStandaloneExternalPlaybackEngaged, stopStandaloneMediaPlayback, getStandaloneHtmlAudioElement } from './standaloneMediaPlayback'
import {
    shouldAdvancePlaybackOnEnd,
    isTuneListPath,
    isPlaybackBrowsePath,
    isPlaybackAdministrativePath,
    getAppPathname,
    isQueuePlaybackEngaged,
} from './playbackNavigationUtils'
import { playbackModeFromPathname } from './offlinePlayback'
import {
    getPlaybackVolume,
    setPlaybackVolume as persistPlaybackVolume,
    adjustPlaybackVolume as persistAdjustPlaybackVolume,
    PLAYBACK_VOLUME_STEP,
} from './playbackVolumeSettings'
import {
  getOutputDeviceId,
  setOutputDeviceId,
  notifyOutputDeviceChanged,
  OUTPUT_DEVICE_CHANGED_EVENT,
} from './outputDeviceSettings';
import {
    applyOutputDeviceToAudioContext,
    applyOutputDeviceToElement,
    createPlaybackAudioContext,
    ensurePermittedOutputDeviceId,
    isSelectAudioOutputSupported,
} from './outputDeviceSupport'
import {
    pendingRequestMatchesRoute,
    routeMatchesPendingRequest,
    shouldKeepIntentWhenRouteNotReady,
    shouldBlockMidiStartForMediaRequest,
} from './playbackRequestLogic'
import {
    hasActivePlaybackIntent as intentHasActivePlayback,
    isPlaybackSupposedToBeRunning as intentIsPlaybackSupposedToBeRunning,
    isSeekGuardActive as intentIsSeekGuardActive,
    shouldSuppressSpuriousPause as intentShouldSuppressSpuriousPause,
    shouldIgnoreNativePlaybackEvents as intentShouldIgnoreNativePlaybackEvents,
    shouldBlockAutoplayDuringSeek as intentShouldBlockAutoplayDuringSeek,
    shouldBlockPlayDuringSeek as intentShouldBlockPlayDuringSeek,
    resolvePlaybackHandoffPosition,
    youtubeAutoplayAppearsBlocked as intentYoutubeAutoplayAppearsBlocked,
    shouldShowTapToPlayFromYoutubePoll as intentShouldShowTapToPlayFromYoutubePoll,
    shouldSuppressTapToPlayDuringQueueAdvance as intentShouldSuppressTapToPlayDuringQueueAdvance,
    shouldKeepPlayingThroughAutoplayBlock as intentShouldKeepPlayingThroughAutoplayBlock,
    resolvePlaylistAutoplayRetryAction,
    shouldAllowPlaybackEndDespiteGuards,
    shouldTriggerAutoplayRecovery as intentShouldTriggerAutoplayRecovery,
    canResumePlayback as intentCanResumePlayback,
    shouldConfirmPlayingStarted as intentShouldConfirmPlayingStarted,
    shouldUseExistingPlayer,
    resolveMediaSessionPlaybackState,
    shouldRecoverUnexpectedNativePause as intentShouldRecoverUnexpectedNativePause,
    shouldResumePlaybackOnVisible as intentShouldResumePlaybackOnVisible,
    clampSeekRatio,
    resolveDisplaySeconds,
    beginSeekHold as computeSeekHoldUntil,
} from './playbackStateLogic'
import { trackAbcPlay, trackMediaPlay } from './analytics'
import {
    registerMediaSessionHandlers,
    clearMediaSessionHandlersRegistration,
} from './mediaSessionActions'
import { createPlaybackKeepAlive } from './playbackKeepAlive'
    
export default function useTuneBookMediaController(props) {
    const driveDocs = useGoogleDocument(props.token, function() {})
    const [currentTime, setCurrentTimeState] = useState(0)
    const currentTimeRef = useRef(0)
    const lastUiTimeRef = useRef(0)
    function setCurrentTime(t, options) {
        const v = parseFloat(t) || 0
        currentTimeRef.current = v
        playbackClockTuneIdRef.current = tuneRef.current && tuneRef.current.id
            ? tuneRef.current.id
            : null
        const forceUi = options && options.forceUi
        if (forceUi || !practiceSessionActiveRef.current) {
            if (!forceUi && Math.abs(v - lastUiTimeRef.current) < 0.05) return
            lastUiTimeRef.current = v
            setCurrentTimeState(v)
        }
    }
    const [clickSeek, setClickSeek] = useState(0)
    const [duration, setDuration] = useState(0) 
    var durationRef = null
    
    const [tune, setTuneState] = useState(null)
    var nowPlayingQueueRef = useRef(props.nowPlayingQueue)
    nowPlayingQueueRef.current = props.nowPlayingQueue
    var tuneRef = useRef(null)
    var regionEndGuardUntilRef = useRef(0)
    var playbackEndLatchUntilRef = useRef(0)
    /** Suppress "Could not load notation playback" after stop/end cancels an in-flight prime. */
    var midiPrimeQuietUntilRef = useRef(0)
    var deferredRegionEndTimerRef = useRef(null)
    var onExternalTimeUpdateRef = useRef(null)
    var onExternalEndedRef = useRef(null)

    function commitTuneState(nextTune) {
        tuneRef.current = nextTune
        setTuneState(nextTune)
    }
    var [mediaLinkNumber, setMediaLinkNumberState] = useState(null)
    var [playbackRouteMode, setPlaybackRouteMode] = useState('none')
    var [requestedPlayState, setRequestedPlayStateState] = useState(null)
    var requestedPlayStateRef = useRef(null)
    function setRequestedPlayState(playState) {
        requestedPlayStateRef.current = playState
        setRequestedPlayStateState(playState)
    }
    var mediaLinkNumberRef = useRef(null)
    var playbackRouteRef = useRef({ mode: 'none', mediaLinkNumber: null, playState: null })
    const [tapToPlay, setTapToPlayState] = useState(false)
    const [tapToPlayReason, setTapToPlayReason] = useState(null)
    const tapToPlayReasonRef = useRef(null)
    const [playlistStalled, setPlaylistStalled] = useState(false)
    const [playCancelled, setPlayCancelled] = useState(false)
    const [notationMidiOwner, setNotationMidiOwnerState] = useState(false)

    function setTapToPlay(value) {
        setTapToPlayState(!!value)
        if (!value) {
            setTapToPlayReason(null)
            tapToPlayReasonRef.current = null
        }
    }

    function showPlaybackPrompt(reason) {
        const normalized = reason === 'loadFailed' ? 'loadFailed' : 'autoplay'
        if (tapToPlayReasonRef.current === normalized) return
        tapToPlayReasonRef.current = normalized
        setTapToPlayReason(normalized)
        setTapToPlayState(true)
    }

    function getPlaylistYoutubeLinkChecker() {
        return props.tunebook && props.tunebook.utils
            ? props.tunebook.utils.isYoutubeLink
            : undefined
    }

    function noteTriedMediaLink(tuneId, linkIndex) {
        if (triedMediaLinkTuneIdRef.current !== tuneId) {
            triedMediaLinkTuneIdRef.current = tuneId
            triedMediaLinkIndexesRef.current = {}
        }
        if (typeof linkIndex === 'number' && linkIndex >= 0) {
            triedMediaLinkIndexesRef.current[linkIndex] = true
        }
        return triedMediaLinkIndexesRef.current
    }

    function tryNextMediaLinkOnCurrentTune() {
        const currentTune = tuneRef.current || tune
        if (!currentTune || !isMediaPlaybackRoute()) return false
        const queue = props.nowPlayingQueue
        const item = queue && isQueueActive(queue) ? getCurrentItem(queue) : null
        if (item && isExternalQueueItem(item)) return false
        const linkIndex = getCurrentQueueItemLinkIndex(item, getActiveMediaLinkNumber())
        const skipIndexes = noteTriedMediaLink(currentTune.id, linkIndex)
        const nextLink = findNextPlayableLinkIndex(currentTune, props.tunebook, linkIndex, {
            skipIndexes: skipIndexes,
            isYoutubeLink: getPlaylistYoutubeLinkChecker(),
        })
        if (nextLink < 0) return false
        queuePlaybackErrorRetryRef.current = false
        setMediaLinkNumber(nextLink)
        if (applyPlaybackRoute) {
            applyPlaybackRoute('playMedia', String(nextLink), currentTune, props.tunebook)
        }
        if (armPlaybackIntent) {
            armPlaybackIntent({ fresh: true })
        } else if (playFromUserGesture) {
            playFromUserGesture({ fresh: true })
        } else {
            play({ fresh: true })
        }
        return true
    }

    function handleMediaPlaybackFailure() {
        if (shouldIgnorePlaybackFailureForManualSkip()) {
            if (tryNextMediaLinkOnCurrentTune()) {
                return
            }
            return
        }
        const shouldSkipAhead = !!(
            playingIntentRef.current
            || hasActivePlaybackIntent()
            || isLoading
        )
        cleanupTimers()
        clearQueueAdvanceAutoplayRetry()
        if (pausePlaybackForAdministrativeRoute()) {
            abortPlayingIntent()
            return
        }
        if (shouldSkipAhead) {
            if (tryRecoverQueuePlaybackFromError()) {
                return
            }
            if (tryNextMediaLinkOnCurrentTune()) {
                return
            }
            if (shouldAdvanceQueueOnPlaybackEnd()) {
                advanceQueueOnPlaybackEnd()
                return
            }
            if (isStandaloneExternalPlaybackEngaged()) {
                setIsLoading(false)
                return
            }
        }
        abortPlayingIntent()
        setIsLoading(false)
        setIsPlaying(false)
        showPlaybackPrompt('loadFailed')
    }

    function dismissLoadFailurePrompt() {
        setTapToPlay(false)
        if (isPlaybackAdministrativePath(getAppPathname())) {
            pausePlaylistForStall()
            return
        }
        if (shouldAdvanceQueueOnPlaybackEnd()) {
            advanceQueueOnPlaybackEnd()
        }
    }

    function setNotationMidiOwner(active) {
        setNotationMidiOwnerState(!!active)
    }
    
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
    var getSynthAudioContextRef = useRef(null)
    var resumeMidiFileAudioContextRef = useRef(null)
    var getMidiFileAudioContextRef = useRef(null)
    var pauseSynthRef = useRef(null)
    var suspendSynthAudioContextForNativeRef = useRef(null)
    var stopMetronomeRef = useRef(null)
    var invalidatePendingMidiStartsRef = useRef(null)
    var abortMidiEnginesRef = useRef(null)
    var isMidiKickoffActiveRef = useRef(null)
    var armPlaybackFromZeroRef = useRef(null)
    var getRhythmPlaybackPhaseRef = useRef(null)
    var getRhythmDiagnosticsRef = useRef(null)
    var stopMidiSynthRef = useRef(null)
    var playMidiRef = useRef(null)
    var pendingMidiPlayRef = useRef(null)
    var midiEngineWaitTimeoutRef = useRef(null)
  /** Seconds to seek when notation play starts (survives async engine registration). */
    var notationPlaybackStartSecondsRef = useRef(null)
    /** Beat/tempo seek target until the MIDI engine applies it. */
    var notationPlaybackSeekRef = useRef(null)
    var notationStaffCursorRef = useRef(null)
    var resumeMidiAfterSeekRef = useRef(null)
    var seekMidiRef = useRef(null)
    var getMidiPlaybackSecondsRef = useRef(null)
    var getMidiCursorSecondsRef = useRef(null)
    var getAudibleMsPerMeasureRef = useRef(null)
    var playMidiFileRef = useRef(null)
    var pauseMidiFileRef = useRef(null)
    var seekMidiFileRef = useRef(null)
    var getMidiFilePlaybackSecondsRef = useRef(null)
    var applyMidiFileTempoRef = useRef(null)
    var prepareMidiFileLinkRef = useRef(null)
    var stopMidiFileRef = useRef(null)
    var pendingMidiFilePlayRef = useRef(null)
    var practiceSessionHandlerRef = useRef(null)
    var practiceSessionActiveRef = useRef(false)
    var queuePlaybackResumeRef = useRef(null)
    var playbackClockTuneIdRef = useRef(null)
    var freshPlaybackIntentRef = useRef(false)
    var queueAdvanceGuardUntilRef = useRef(0)
    var queueAdvanceAutoplayRetryTimerRef = useRef(null)
    var queueAdvanceAutoplayAttemptRef = useRef(0)
    var autoplayBlockSkipCountRef = useRef(0)
    var playbackKickoffTimerRef = useRef(null)
    var queuePlaybackErrorRetryRef = useRef(false)
    var triedMediaLinkTuneIdRef = useRef(null)
    var triedMediaLinkIndexesRef = useRef({})
    var queuePrefetchTrackIdRef = useRef(null)
    var queuePrefetchLateRef = useRef(false)
    var autoplayRecoveryGuardUntilRef = useRef(0)
    var playlistStallStartedAtRef = useRef(0)
    const PLAYLIST_STALL_MS = 120000
    var userGesturePlayRef = useRef(false)
    var wakeLockRef = useRef(null)
    var playbackKeepAliveRef = useRef(null)
    var backgroundResumeTimerRef = useRef(null)
    var lastBackgroundResumeAtRef = useRef(0)
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
    var proxiedNativeBlobSrcRef = useRef(null)
    var proxiedNativeBlobPromiseRef = useRef(null)
    var nativeBlobAttachInFlightRef = useRef(false)
    var unplayableExternalCacheSrcRef = useRef(null)
    var linkedMediaPlaybackInFlightRef = useRef(false)
    var linkedMediaPlaybackGenerationRef = useRef(0)
    var linkedMediaPlaybackSrcRef = useRef(null)
    const [nativePlaybackSrcOverride, setNativePlaybackSrcOverride] = useState(null)
    const [nativePlaybackFallbackRequired, setNativePlaybackFallbackRequired] = useState(false)
    var nativeFilteredCacheKeyRef = useRef(null)
    var androidNativeActiveRef = useRef(false)
    var youtubeNativeCacheRef = useRef({ videoId: null, filePath: null })
    var youtubeNativeHandoffRef = useRef(null)
    var ytIframeEventSuppressUntilRef = useRef(0)
    var externalHandoffGuardUntilRef = useRef(0)
    var remoteOutputEngineRef = useRef(null)
    var remoteOutputHandlersRef = useRef(null)
    var snapcastOutputHandlersRef = useRef(null)
    var preferredOutputCoordinatorRef = useRef(null)
    var seekGuardUntilRef = useRef(0)
    var seekInProgressRef = useRef(false)
    var seekWasPlayingRef = useRef(false)
    var seekTargetSecondsRef = useRef(0)
    var seekFromSecondsRef = useRef(0)
    var seekHoldUntilRef = useRef(0)
    var playingIntentRef = useRef(false)
    var pendingPlaybackAfterLoginRef = useRef(null)
    var pendingPlayRequestRef = useRef(null)
    var playbackKickoffNeededRef = useRef(false)
    var playbackStartedRef = useRef(false)
    var userPausedRef = useRef(false)
    var routeReadyRef = useRef(false)
    var suppressNativePlaybackEventsRef = useRef(false)
    var nativePlaybackEventSuppressUntilRef = useRef(0)
    var nativePlaybackLoadInFlightRef = useRef(false)
    var nativePlaybackPendingRetryRef = useRef(null)
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
    var inFlightStemAnalysisRef = useRef(null)
    var lastStemProgressRef = useRef(0)
    var pitchShiftPrepareTokenRef = useRef(0)
    var pitchShiftPrepareTimeoutRef = useRef(null)
    var lastExternalMediaLoadErrorRef = useRef(null)
    var lastNotifiedPitchRef = useRef({ pitch: 0, fineTune: 0 })
    var finishPitchShiftPrepareRef = useRef(function() {})
    const { available: mediaResolverAvailable, checked: mediaResolverChecked, status: mediaResolverStatus, refreshMediaResolverHealth } = useMediaResolverHealth()
    const resolverFeatures = getResolverFeaturesFromStatus(mediaResolverStatus)
    const stemsCapabilityAvailable = isStemsCapabilityAvailable(
      resolverFeatures,
      loadProviderSettings(),
      mediaResolverStatus
    )
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
            navigator.mediaSession.playbackState = resolveMediaSessionPlaybackState(getIntentSnapshot())
        } catch (e) {}
    }

    function getPlaybackKeepAlive() {
        if (!playbackKeepAliveRef.current) {
            playbackKeepAliveRef.current = createPlaybackKeepAlive()
        }
        return playbackKeepAliveRef.current
    }

    function startPlaybackKeepAlive() {
        if (prefersNativeMediaPlayback()) {
            return
        }
        try {
            getPlaybackKeepAlive().start()
        } catch (e) {}
    }

    function stopPlaybackKeepAlive() {
        if (!playbackKeepAliveRef.current) return
        try {
            playbackKeepAliveRef.current.stop()
        } catch (e) {}
    }

    function bindAudioContextBackgroundResume(ctx) {
        if (!ctx || typeof ctx.addEventListener !== 'function') return
        if (ctx._tunebookBackgroundResumeBound) return
        ctx._tunebookBackgroundResumeBound = true
        ctx.addEventListener('statechange', function() {
            if (ctx.state !== 'suspended') return
            if (!hasActivePlaybackIntent()) return
            startPlaybackKeepAlive()
            try {
                ctx.resume().catch(function() {})
            } catch (e) {}
        })
    }

    function scheduleBackgroundPlaybackResume(options) {
        const now = Date.now()
        if (now - lastBackgroundResumeAtRef.current < 400) return
        if (backgroundResumeTimerRef.current) {
            clearTimeout(backgroundResumeTimerRef.current)
        }
        backgroundResumeTimerRef.current = setTimeout(function() {
            backgroundResumeTimerRef.current = null
            lastBackgroundResumeAtRef.current = Date.now()
            resumePlaybackAfterInterruption(options)
        }, 50)
    }

    function isActiveYoutubeMediaRoute() {
        if (!isMediaPlaybackRoute()) return false
        const useTune = tuneRef.current || tune
        const linkIndex = getActiveMediaLinkNumber()
        const src = getSrc(useTune, linkIndex)
        return getSrcType(src) === 'youtube'
    }

    function shouldUseAndroidNativeYoutubeFetch() {
        return prefersNativeMediaPlayback() && isActiveYoutubeMediaRoute()
    }

    function shouldPreferAndroidNativeYoutube(settings) {
        if (!shouldUseAndroidNativeYoutubeFetch()) return false
        if (isExternalOutputActive()) return false
        if (hasActivePlaybackIntent() && playbackNeedsExternalProcessing(settings || getActivePlaybackSettings())) {
            return false
        }
        return !canUseExternalPitchTempo(settings || getActivePlaybackSettings())
    }

    function shouldUseAndroidNativeYoutubeOutput(settings) {
        if (!shouldUseAndroidNativeYoutubeFetch()) return false
        if (isExternalOutputActive()) return false
        if (playbackNeedsExternalProcessing(settings || getActivePlaybackSettings())) {
            return canUseNativeFilteredPlayback(settings)
        }
        return true
    }

    function shouldUseExternalMediaForPlayIntent(settings) {
        if (prefersNativeMediaPlayback() && hasActivePlaybackIntent()) {
            return false
        }
        return canUseExternalPitchTempo(settings)
    }

    function getBackgroundCapabilityContext(settings) {
        const useTune = tuneRef.current || tune
        const linkIndex = getActiveMediaLinkNumber()
        const src = getSrc(useTune, linkIndex)
        const srcType = getSrcType(src)
        return {
            routeMode: playbackRouteRef.current.mode,
            srcType: srcType,
            settings: settings || getActivePlaybackSettings(useTune),
            nativeActive: androidNativeActiveRef.current || isAndroidNativePlayerActive(),
            hasPreRenderedBlob: !!(nativeFilteredBlobUrlRef.current || cachedNativeBlobUrlRef.current),
            hasNativeAbcCache: playbackRouteRef.current.mode === 'midi'
                && (androidNativeActiveRef.current || isAndroidNativePlayerActive()),
            hasNativeMidiCache: srcType === 'midifile',
      pitchPathOptions: {
                srcType: srcType,
                resolverFeatures: resolverFeatures,
                resolverStatus: mediaResolverStatus,
                accessToken: getGoogleAccessToken(),
            },
        }
    }

    function isCurrentPlaybackBackgroundCapable(settings) {
        return isBackgroundCapablePlayback(getBackgroundCapabilityContext(settings))
    }

    function skipBackgroundIncapableTrack(reason) {
        logPlaybackDebug('skip', { reason: reason })
        setIsLoading(false)
        setIsPlaying(false)
        toast.info('Skipped — not available for background playback.', { autoClose: 2500 })
        if (hasActivePlaybackIntent()) {
            advanceQueueOnPlaybackEnd()
        } else {
            pauseAtRegionStart()
            updateMediaSessionState()
        }
    }

    function isAndroidNativeYoutubeOutputActive() {
        return androidNativeActiveRef.current
            || isAndroidNativePlayerActive()
            || !!youtubeNativeHandoffRef.current
    }

    function shouldIgnoreYoutubeIframeEvents() {
        if (!isActiveYoutubeMediaRoute()) return false
        if (isAndroidNativeYoutubeOutputActive()) return true
        if (shouldUseAndroidNativeYoutubeFetch() && !nativePlaybackFallbackRequired) return true
        return false
    }

    function rememberYoutubeNativeCache(videoId, filePath) {
        if (!videoId || !filePath) return
        youtubeNativeCacheRef.current = { videoId: videoId, filePath: filePath }
    }

    function getCachedYoutubeNativePath(videoId) {
        const cache = youtubeNativeCacheRef.current
        if (!cache || cache.videoId !== videoId) return null
        return cache.filePath || null
    }

    function handoffYoutubeToNativePlayback(options) {
        const opts = options || {}
        if (!shouldUseAndroidNativeYoutubeFetch()) {
            return Promise.resolve(false)
        }
        if (androidNativeActiveRef.current) {
            return resumeAndroidNativePlaybackAfterInterruption()
        }
        if (youtubeNativeHandoffRef.current) {
            return youtubeNativeHandoffRef.current
        }
        const useTune = tuneRef.current || tune
        const linkIndex = getActiveMediaLinkNumber()
        const src = getSrc(useTune, linkIndex)
        const youtubeGetId = props.tunebook.utils.YouTubeGetID
        const videoId = youtubeGetId(src)
        if (!videoId) return Promise.resolve(false)

        let positionSec = currentTimeRef.current
        if (opts.preservePosition !== false) {
            if (ytPlayerRef && ytPlayerRef.current && isYoutubePlayerReadyForActiveSrc()) {
                try {
                    positionSec = ytPlayerRef.current.getCurrentTime()
                } catch (e) {}
            }
        } else {
            positionSec = getLinkStartAt()
        }

        muteNativePlayers()
        setIsLoading(true)
        const settings = getActivePlaybackSettings(useTune)
        const handoffPromise = playAndroidNativeYoutube(src, {
            youtubeGetId: youtubeGetId,
            title: useTune && useTune.name ? useTune.name : 'Tunebook',
            artist: useTune && useTune.composer ? useTune.composer : '',
            positionSec: positionSec,
            tempo: settings.tempo,
            filePath: getCachedYoutubeNativePath(videoId),
            accessToken: getGoogleAccessToken(),
        }).then(function(result) {
            setIsLoading(false)
            youtubeNativeHandoffRef.current = null
            if (result && result.ok) {
                rememberYoutubeNativeCache(result.videoId, result.filePath)
                setNativePlaybackFallbackRequired(false)
                currentTimeRef.current = positionSec
                setCurrentTime(positionSec)
                return true
            }
            return false
        }).catch(function() {
            setIsLoading(false)
            youtubeNativeHandoffRef.current = null
            return false
        })
        youtubeNativeHandoffRef.current = handoffPromise
        return handoffPromise
    }

    function handoffActivePlaybackToNativeOnBackground(options) {
        if (!prefersNativeMediaPlayback()) return Promise.resolve(false)
        if (!hasActivePlaybackIntent()) return Promise.resolve(false)
        if (androidNativeActiveRef.current || isAndroidNativePlayerActive()) {
            logPlaybackDebug('background-native-active', null)
            return Promise.resolve(true)
        }
        return Promise.resolve(false)
    }

    function onAppBackgrounded() {
        if (!hasActivePlaybackIntent()) return
        const nativeRefActive = androidNativeActiveRef.current
        const nativePluginActive = isAndroidNativePlayerActive()
        if (prefersNativeMediaPlayback()) {
            return
        }
        logPlaybackDebug('minimize', { native: false })
        if (!isCurrentPlaybackBackgroundCapable()) {
            skipBackgroundIncapableTrack('background-incapable')
            return
        }
        startPlaybackKeepAlive()
        scheduleBackgroundPlaybackResume({ preservePosition: true })
    }

    function resumeAndroidNativePlaybackAfterInterruption() {
        if (!shouldUseAndroidNativePlayer()) return Promise.resolve(false)
        if (!androidNativeActiveRef.current && !isAndroidNativePlayerActive()) {
            return Promise.resolve(false)
        }
        if (!hasActivePlaybackIntent()) return Promise.resolve(false)
        return resumeAndroidNativePlayback().then(function(resumed) {
            if (!hasActivePlaybackIntent()) return resumed
            if (resumed) {
                confirmPlayingStarted()
            }
            return resumed
        }).catch(function() {
            return false
        })
    }

    function resumePlaybackAfterInterruption(options) {
        const opts = options || {}
        if (!hasActivePlaybackIntent()) return
        if (prefersNativeMediaPlayback()) {
            return
        }
        if (shouldBlockNativeResumeAfterEnd()) {
            return
        }
        if (androidNativeActiveRef.current || isAndroidNativePlayerActive()) {
            resumeAndroidNativePlaybackAfterInterruption()
            return
        }
        if (shouldUseAndroidNativeYoutubeFetch()) {
            handoffYoutubeToNativePlayback({ preservePosition: opts.preservePosition !== false })
            return
        }
        startPlaybackKeepAlive()
        resumeSynthAudioContextFromGesture()
        const shared = acquireExternalAudioContext()
        bindAudioContextBackgroundResume(shared)
        if (externalMediaRef.current && externalMediaRef.current.audioContext) {
            bindAudioContextBackgroundResume(externalMediaRef.current.audioContext)
        }
        resumeExternalAudioContextFromGesture().then(async function() {
            if (!hasActivePlaybackIntent()) return
            if (isExternalOutputActive()) {
                const handoff = await trySyncExternalHandoff({ seek: opts.preservePosition !== false })
                if (handoff && handoff.ok) {
                    confirmPlayingStarted()
                    return
                }
            }
            if (isMidiPlaybackRoute()) {
                if (resumeMidiAfterSeekRef.current) {
                    resumeMidiAfterSeekRef.current()
                } else if (playMidiRef.current) {
                    playMidiRef.current({ resume: true })
                }
                return
            }
            if (playerRef && playerRef.current) {
                try {
                    if (playerRef.current.ended) {
                        return
                    }
                    if (playerRef.current.paused) {
                        playerRef.current.play().then(function() {
                            confirmPlayingStarted()
                        }).catch(function() {})
                    } else {
                        confirmPlayingStarted()
                    }
                    return
                } catch (e) {}
            }
            if (isYoutubePlayerReady()) {
                try {
                    const state = ytPlayerRef.current.getPlayerState()
                    if (state !== 1) {
                        ytPlayerRef.current.playVideo()
                    }
                    confirmPlayingStarted()
                } catch (e) {}
            }
        })
    }

    function recoverUnexpectedNativePause() {
        if (prefersNativeMediaPlayback()) {
            return
        }
        if (shouldHoldLoadingForPlaybackKickoff()) {
            return
        }
        if (shouldBlockNativeResumeAfterEnd()) {
            return
        }
        if (!intentShouldRecoverUnexpectedNativePause(getIntentSnapshot(), {
            externalMediaActive: externalMediaActiveRef.current,
            suppressNativePlaybackEvents: suppressNativePlaybackEventsRef.current,
        })) {
            return
        }
        scheduleBackgroundPlaybackResume({ preservePosition: true })
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
        const useQueueNavigation = isQueueActive(props.nowPlayingQueue)
            && isQueuePlaybackEngaged(mediaController)
        const navOpts = { mediaController: mediaController, useQueueNavigation: useQueueNavigation }

        if (direction >= 0) {
            if (typeof tunebook.navigateToNextSong !== 'function') return
            tunebook.navigateToNextSong(
                activeTuneId,
                null,
                function(path) { tunebook.navigate(path) },
                pathname,
                navOpts
            )
            return
        }

        if (typeof tunebook.navigateToPreviousSong !== 'function') return
        tunebook.navigateToPreviousSong(
            activeTuneId,
            function(path) { tunebook.navigate(path) },
            pathname,
            navOpts
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
        if (!shouldUseAndroidNativePlayer()) return undefined
        ensureAndroidNativeListeners({
            onStateChange: function(event) {
                if (!androidNativeActiveRef.current
                    && !isAndroidNativePlayerActive()
                    && !nativePlaybackLoadInFlightRef.current) {
                    return
                }
                const positionSec = (event.positionMs || 0) / 1000
                const durationSec = (event.durationMs || 0) / 1000
                if (durationSec > 0) {
                    setDuration(durationSec)
                    setIsReady(true)
                }
                setCurrentTime(positionSec)
                currentTimeRef.current = positionSec
                if (event.isPlaying) {
                    setIsPlaying(true)
                    setIsLoading(false)
                    androidNativeActiveRef.current = true
                    nativePlaybackLoadInFlightRef.current = false
                    confirmPlayingStarted()
                } else if (!playbackStartedRef.current) {
                    if (!shouldHoldLoadingForPlaybackKickoff()) {
                        setIsLoading(false)
                    }
                }
            },
            onEnded: function() {
                if (!androidNativeActiveRef.current) return
                agentDebugLog('useTuneBookMediaController.js:nativeListener', 'exo-ended', {
                    positionSec: currentTimeRef.current,
                    durationSec: duration,
                }, 'H-A');
                androidNativeActiveRef.current = false
                onEnded()
            },
            onError: function(event) {
                if (!androidNativeActiveRef.current
                    && !nativePlaybackLoadInFlightRef.current
                    && !isAndroidNativePlayerActive()) {
                    return
                }
                androidNativeActiveRef.current = false
                nativePlaybackLoadInFlightRef.current = false
                setIsPlaying(false)
                setIsLoading(false)
                if (event && event.message) {
                    let errMsg = String(event.message)
                    if (errMsg.toLowerCase().indexOf('source error') >= 0
                        || errMsg.indexOf('403') >= 0) {
                        errMsg = 'Could not play YouTube audio (stream blocked)'
                    }
                    toast.error(errMsg)
                }
            },
        })
        return function() {
            teardownAndroidNativeListeners()
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
            if (document.hidden) {
                onAppBackgrounded()
                return
            }
            if (intentShouldResumePlaybackOnVisible(getIntentSnapshot())) {
                requestScreenWakeLock()
                if (!prefersNativeMediaPlayback()) {
                    scheduleBackgroundPlaybackResume({ preservePosition: true })
                }
            }
        }
        document.addEventListener('visibilitychange', onVisibilityChange)
        return function() {
            document.removeEventListener('visibilitychange', onVisibilityChange)
        }
    }, [])

    useEffect(function() {
        if (!shouldUseAndroidNativePlayer()) return undefined
        let listenerHandle = null
        App.addListener('appStateChange', function(state) {
            if (!hasActivePlaybackIntent()) return
            if (!state.isActive) {
                onAppBackgrounded()
                return
            }
            if (!androidNativeActiveRef.current && !isAndroidNativePlayerActive()) return
            getNativePlayerState().then(function(nativeState) {
                if (!hasActivePlaybackIntent()) return
                const positionSec = (nativeState.positionMs || 0) / 1000
                const durationSec = (nativeState.durationMs || 0) / 1000
                if (durationSec > 0) {
                    setDuration(durationSec)
                }
                setCurrentTime(positionSec)
                currentTimeRef.current = positionSec
                setIsPlaying(!!nativeState.isPlaying)
                if (nativeState.isPlaying) {
                    confirmPlayingStarted()
                }
            }).catch(function() {})
        }).then(function(handle) {
            listenerHandle = handle
        }).catch(function() {})
        return function() {
            if (listenerHandle && typeof listenerHandle.remove === 'function') {
                listenerHandle.remove()
            }
        }
    }, [])

    useEffect(function() {
        const usingAndroidNative = androidNativeActiveRef.current || isAndroidNativePlayerActive()
        if (isPlaying && playingIntentRef.current && !userPausedRef.current) {
            if (!usingAndroidNative) {
                requestScreenWakeLock()
                startPlaybackKeepAlive()
            }
        } else if (!playingIntentRef.current || userPausedRef.current) {
            releaseScreenWakeLock()
            if (userPausedRef.current || !playingIntentRef.current) {
                stopPlaybackKeepAlive()
            }
        }
        updateMediaSessionState()
    }, [isPlaying])

    useEffect(function() {
        return function() {
            releaseScreenWakeLock()
            stopPlaybackKeepAlive()
            if (playbackKeepAliveRef.current) {
                playbackKeepAliveRef.current.destroy()
                playbackKeepAliveRef.current = null
            }
            if (backgroundResumeTimerRef.current) {
                clearTimeout(backgroundResumeTimerRef.current)
                backgroundResumeTimerRef.current = null
            }
        }
    }, [])

    function collectPlaybackAudioContexts() {
        const contexts = []
        function addContext(ctx) {
            if (!ctx || ctx.state === 'closed') return
            if (contexts.indexOf(ctx) >= 0) return
            contexts.push(ctx)
        }
        addContext(sharedExternalAudioContextRef.current)
        if (externalMediaRef.current && externalMediaRef.current.audioContext) {
            addContext(externalMediaRef.current.audioContext)
        }
        if (getSynthAudioContextRef.current) {
            addContext(getSynthAudioContextRef.current())
        }
        if (getMidiFileAudioContextRef.current) {
            addContext(getMidiFileAudioContextRef.current())
        }
        return contexts
    }

    async function applyStoredOutputDeviceToActiveRoute(options) {
        const opts = options || {}
        const sinkId = opts.deviceId !== undefined ? (opts.deviceId || '') : getOutputDeviceId()
        const elements = []
        if (playerRef && playerRef.current) elements.push(playerRef.current)
        if (filteredPlayerRef && filteredPlayerRef.current) elements.push(filteredPlayerRef.current)
        const standaloneEl = getStandaloneHtmlAudioElement()
        if (standaloneEl) elements.push(standaloneEl)
        const contexts = collectPlaybackAudioContexts()
        let applied = 0
        let lastError = null
        for (let i = 0; i < elements.length; i++) {
            try {
                if (await applyOutputDeviceToElement(elements[i], sinkId)) {
                    applied += 1
                }
            } catch (e) {
                lastError = e
            }
        }
        for (let j = 0; j < contexts.length; j++) {
            try {
                if (await applyOutputDeviceToAudioContext(contexts[j], sinkId)) {
                    applied += 1
                }
            } catch (e) {
                lastError = e
            }
        }
        if (opts.throwOnError && applied === 0 && lastError) {
            throw lastError
        }
        return { applied: applied, deviceId: sinkId }
    }

    async function reapplyStoredOutputDevice() {
        return applyStoredOutputDeviceToActiveRoute()
    }

    async function applyOutputDevice(deviceId) {
        if (deviceId === undefined) {
            return reapplyStoredOutputDevice()
        }
        const sinkId = setOutputDeviceId(deviceId || '')

        async function tryApply(id, throwOnError) {
            return applyStoredOutputDeviceToActiveRoute({
                deviceId: id,
                throwOnError: !!throwOnError,
            })
        }

        let result = await tryApply(sinkId, false)

        if (result.applied === 0 && sinkId && isSelectAudioOutputSupported()) {
            try {
                const permittedId = await ensurePermittedOutputDeviceId(sinkId)
                const nextId = setOutputDeviceId(permittedId || sinkId)
                result = await tryApply(nextId, false)
            } catch (err) {
                if (err && err.name === 'NotAllowedError') {
                    throw err
                }
            }
        }

        if (result.applied === 0 && sinkId) {
            result = await tryApply(getOutputDeviceId(), true)
        }

        return Object.assign({}, result, { deviceId: getOutputDeviceId() })
    }

    useEffect(function() {
        function onOutputDeviceChanged() {
            reapplyStoredOutputDevice().catch(function() {})
        }
        window.addEventListener(OUTPUT_DEVICE_CHANGED_EVENT, onOutputDeviceChanged)
        return function() {
            window.removeEventListener(OUTPUT_DEVICE_CHANGED_EVENT, onOutputDeviceChanged)
        }
    }, [])

    function getPlaybackAudioContexts() {
        return collectPlaybackAudioContexts()
    }

    function applyPlaybackVolumeToActiveRoute(volume) {
        const level = Math.max(0, Math.min(1, parseFloat(volume) || 0))
        const externalOwnsOutput = !!(externalMediaActiveRef.current || isExternalMediaConnected())
        if (!externalOwnsOutput) {
            if (playerRef && playerRef.current) {
                playerRef.current.volume = level
            }
            if (filteredPlayerRef && filteredPlayerRef.current) {
                filteredPlayerRef.current.volume = level
            }
            if (ytPlayerRef && ytPlayerRef.current && isYoutubePlayerDomAttached()) {
                try {
                    if (level <= 0) {
                        ytPlayerRef.current.mute()
                    } else {
                        ytPlayerRef.current.unMute()
                        ytPlayerRef.current.setVolume(Math.round(level * 100))
                    }
                } catch (e) {}
            }
        } else {
            pauseNativeOutputsOnly()
            if (playerRef && playerRef.current) {
                playerRef.current.volume = 0
            }
            if (filteredPlayerRef && filteredPlayerRef.current) {
                filteredPlayerRef.current.volume = 0
            }
            if (ytPlayerRef && ytPlayerRef.current && isYoutubePlayerDomAttached()) {
                try {
                    ytPlayerRef.current.mute()
                } catch (e) {}
            }
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

    function needsPlaybackKickoff() {
        return playbackKickoffNeededRef.current
            && !playbackStartedRef.current
            && !userPausedRef.current
    }

    function shouldHoldLoadingForPlaybackKickoff() {
        return needsPlaybackKickoff()
            || (isPlaybackTransitionGuardActive()
                && hasActivePlaybackIntent()
                && !playbackStartedRef.current
                && !userPausedRef.current)
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

    function getAndroidPlaybackGateContext() {
        return {
            playerRef: playerRef,
            filteredPlayerRef: filteredPlayerRef,
            stopPlaybackKeepAlive: stopPlaybackKeepAlive,
            silencePlaybackOutputs: silencePlaybackOutputs,
            pauseYoutubeOutputOnly: pauseYoutubeOutputOnly,
            isMidiPlaybackRoute: isMidiPlaybackRoute,
            isMediaPlaybackRoute: isMediaPlaybackRoute,
        }
    }

    function isAndroidNativeOutputActive() {
        return androidNativeActiveRef.current || isAndroidNativePlayerActive()
            || nativePlaybackLoadInFlightRef.current || isAbcNativePlayInFlight()
    }

    function isAndroidNativePlaybackStarting() {
        return nativePlaybackLoadInFlightRef.current || isAbcNativePlayInFlight()
    }

    function resolveActiveNotationTune() {
        const direct = tuneRef.current || tune
        if (direct && direct.id) return direct
        const clockId = playbackClockTuneIdRef.current
        if (clockId && props.tunes && props.tunes[clockId]) {
            return props.tunes[clockId]
        }
        const queueTuneId = getCurrentTuneId(props.nowPlayingQueue)
        if (queueTuneId && props.tunes && props.tunes[queueTuneId]) {
            return props.tunes[queueTuneId]
        }
        return null
    }

    function shouldSuppressHtml5AudioSrc() {
        const useTune = tuneRef.current || tune
        const linkIndex = getActiveMediaLinkNumber()
        const activeSrc = getSrc(useTune, linkIndex)
        if (activeSrc && requiresResolverProxiedPlayback(activeSrc)
            && !cachedNativeBlobUrlRef.current
            && !nativePlaybackSrcOverride) {
            return true
        }
        if (!prefersNativeMediaPlayback() || !isMediaPlaybackRoute()) return false
        const activeLink = useTune && useTune.links ? useTune.links[linkIndex] : null
        const srcType = getSrcType(activeSrc, activeLink)
        if (srcType === 'audio' && !nativeFilteredActiveRef.current) return true
        if (srcType === 'youtube' && shouldUseAndroidNativeYoutubeOutput(getActivePlaybackSettings(useTune))) {
            return true
        }
        return false
    }

    function shouldSuppressYoutubeEmbed() {
        if ((cachedNativeBlobUrlRef.current || nativePlaybackSrcOverride) && isMediaPlaybackRoute()) {
            return true
        }
        if (!prefersNativeMediaPlayback() || !isMediaPlaybackRoute()) return false
        const useTune = tuneRef.current || tune
        const linkIndex = getActiveMediaLinkNumber()
        const activeLink = useTune && useTune.links ? useTune.links[linkIndex] : null
        const srcType = getSrcType(getSrc(useTune, linkIndex), activeLink)
        if (srcType !== 'youtube') return false
        if (practiceSessionActiveRef.current) return false
        return shouldUseAndroidNativeYoutubeOutput(getActivePlaybackSettings(useTune))
            && !nativePlaybackFallbackRequired
    }

    function getActiveMediaLinkNumber() {
        if (mediaLinkNumberRef.current !== null && mediaLinkNumberRef.current !== undefined) {
            return mediaLinkNumberRef.current
        }
        return mediaLinkNumber
    }

    function isMidiFileMediaRoute() {
        if (!isMediaPlaybackRoute()) return false
        const currentTune = tuneRef.current || tune
        const linkIndex = getActiveMediaLinkNumber()
        const link = currentTune && Array.isArray(currentTune.links)
            ? currentTune.links[linkIndex]
            : null
        if (!link) return false
        return resolveLinkPlaybackSrcType(link, props.tunebook.utils.isYoutubeLink) === 'midifile'
    }

    function stopMidiFilePlayback() {
        if (stopMidiFileRef.current) {
            stopMidiFileRef.current()
        }
    }

    function stopMidiPlayback() {
        if (abortMidiEnginesRef.current) {
            abortMidiEnginesRef.current()
        } else if (invalidatePendingMidiStartsRef.current) {
            invalidatePendingMidiStartsRef.current()
        }
        if (pauseSynthRef.current) {
            pauseSynthRef.current()
        }
    }

    function isLinkedMediaPlaybackInFlight() {
        return linkedMediaPlaybackInFlightRef.current
    }

    function stopLinkedMediaPlayback(options) {
        const opts = options || {}
        cleanupTimers()
        linkedMediaPlaybackGenerationRef.current += 1
        linkedMediaPlaybackInFlightRef.current = false
        linkedMediaPlaybackSrcRef.current = null
        if (opts.clearCachedBlob) {
            clearCachedNativePlaybackUrl()
        }
        destroyExternalMedia()
        destroyNativeFilteredPlayback()
        stopMidiFilePlayback()
        if (androidNativeActiveRef.current || isAndroidNativePlayerActive()) {
            if (isStandaloneExternalPlaybackEngaged()
                && !androidNativeActiveRef.current
                && !isAbcNativePlayInFlight()
                && !nativePlaybackLoadInFlightRef.current) {
                // Keep ExoPlayer running for device/search media until notation takes over.
            } else {
                androidNativeActiveRef.current = false
                stopAndroidNativePlayer()
            }
        }
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

    function suppressNativePlaybackEventsBriefly(ms) {
        const duration = ms || 800
        suppressNativePlaybackEventsRef.current = true
        nativePlaybackEventSuppressUntilRef.current = Date.now() + duration
        ytIframeEventSuppressUntilRef.current = Date.now() + duration
        setTimeout(function() {
            suppressNativePlaybackEventsRef.current = false
        }, duration)
    }

    function beginMidiRouteHandoff(options) {
        const opts = options || {}
        const kickoffActive = isMidiKickoffActiveRef.current
            && isMidiKickoffActiveRef.current()
        suppressNativePlaybackEventsBriefly()
        if (!kickoffActive || hasActivePlaybackIntent()) {
            setIsLoading(true)
        }
        stopLinkedMediaPlayback({ clearCachedBlob: true })
        if (opts.resumeSynth && resumeSynthAudioContextRef.current) {
            resumeSynthAudioContextRef.current()
        }
    }

    function enforceExclusivePlayback(mode) {
        if (mode === 'media') {
            stopMidiPlayback()
        } else if (mode === 'midi') {
            if (nativePlaybackLoadInFlightRef.current || isAbcNativePlayInFlight()
                || androidNativeActiveRef.current || isAndroidNativePlayerActive()) {
                agentDebugLog('useTuneBookMediaController.js:enforceExclusivePlayback', 'skip-stop-linked-native', {
                    loadInFlight: nativePlaybackLoadInFlightRef.current,
                    abcInFlight: isAbcNativePlayInFlight(),
                    nativeActive: androidNativeActiveRef.current,
                }, 'H-I')
                stopMidiPlayback()
                return
            }
            suppressNativePlaybackEventsBriefly()
            stopLinkedMediaPlayback({ clearCachedBlob: true })
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
        // Notation editor owns the ABC synth engine; MidiFilePlaybackHost and
        // other always-mounted route effects must not overwrite playMidi with
        // playMedia when setTune runs for a scratchpad/editor snapshot.
        if (notationMidiOwner) {
            if (playState === 'playMedia') {
                routeReadyRef.current = true
                return playbackRouteRef.current
            }
            if (playState === 'playMidi' && tune) {
                setRequestedPlayState('playMidi')
                const midiResult = { mode: 'midi', mediaLinkNumber: null, src: '' }
                commitPlaybackRoute(midiResult, playState)
                routeReadyRef.current = true
                return midiResult
            }
        }
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
        if (linkedMediaPlaybackInFlightRef.current) {
            if (needsPlaybackKickoff()) {
                schedulePlaybackKickoffIfNeeded()
            }
            return
        }
        if (shouldBlockMidiStartForMediaRequest(
            playbackRouteRef.current.mode,
            requestedPlayStateRef.current
        )) {
            return
        }
        if (userPausedRef.current) return
        if (playState !== 'playMidi' && playState !== 'playMedia') return
        if (playbackRouteRef.current.mode === 'none') return

        const needsKickoff = playbackKickoffNeededRef.current
            && !playbackStartedRef.current
            && !userPausedRef.current

        if (changeType === 'playState') {
            if (needsKickoff) {
                playingIntentRef.current = true
                const kickoffOpts = freshPlaybackIntentRef.current ? { fresh: true } : {}
                if (freshPlaybackIntentRef.current) {
                    freshPlaybackIntentRef.current = false
                }
                play(kickoffOpts)
                return
            }
            if (!playingIntentRef.current) {
                playingIntentRef.current = true
                play()
            }
            return
        }

        if (changeType === 'tune' && (playingIntentRef.current || isFirstTuneLoad)) {
            if (needsKickoff) {
                playingIntentRef.current = true
                if (freshPlaybackIntentRef.current) {
                    freshPlaybackIntentRef.current = false
                    play({ fresh: true })
                    return
                }
                const regionStart = getLinkStartAt()
                const preserve = currentTimeRef.current > regionStart + 0.05
                    && (playingIntentRef.current || userPausedRef.current)
                play(preserve ? { preservePosition: true } : {})
                return
            }
            // play() already started and is waiting on the media engine (YouTube iframe, etc.).
            if (isLoading && playingIntentRef.current && !playbackStartedRef.current) {
                if (shouldAdvanceQueueOnPlaybackEnd() || needsKickoff) {
                    if (freshPlaybackIntentRef.current || shouldAdvanceQueueOnPlaybackEnd()) {
                        if (freshPlaybackIntentRef.current) {
                            freshPlaybackIntentRef.current = false
                        }
                        play({ fresh: true, skipNotationRefresh: true })
                        return
                    }
                    schedulePlaybackKickoffIfNeeded()
                }
                scheduleQueueAdvanceAutoplayRetry()
                return
            }
            playingIntentRef.current = true
            if (freshPlaybackIntentRef.current) {
                freshPlaybackIntentRef.current = false
                play({ fresh: true })
                return
            }
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
        clearInterval(youtubeProgressInterval.current)
        youtubeProgressInterval.current = null
        clearInterval(progressIntervalRef.current)
        progressIntervalRef.current = null
        cancelYoutubePlayPoll()
        clearDeferredRegionEndCheck()
        if (midiEngineWaitTimeoutRef.current) {
            clearTimeout(midiEngineWaitTimeoutRef.current)
            midiEngineWaitTimeoutRef.current = null
        }
    }

    function clearPendingMidiPlayAfterEngineAcceptance() {
        const kickoffActive = !!(isMidiKickoffActiveRef.current
            && isMidiKickoffActiveRef.current())
        if (!kickoffActive || playbackStartedRef.current) {
            pendingMidiPlayRef.current = null
        }
    }

    function scheduleMidiEngineRegistrationFallback() {
        if (midiEngineWaitTimeoutRef.current) {
            clearTimeout(midiEngineWaitTimeoutRef.current)
        }
        midiEngineWaitTimeoutRef.current = setTimeout(function() {
            midiEngineWaitTimeoutRef.current = null
            if (!hasActivePlaybackIntent()) return
            if (playbackStartedRef.current || isPlaying) return
            // Engine registered — synth render/count-in can exceed 12s.
            if (playMidiRef.current) {
                if (isLoading) {
                    const kickoffActive = !!(isMidiKickoffActiveRef.current
                        && isMidiKickoffActiveRef.current())
                    if (kickoffActive) {
                        setIsLoading(false)
                        if (hasActivePlaybackIntent()) {
                            toast.error('Notation playback is still loading. Try Play again.')
                        }
                        return
                    }
                    schedulePlaybackKickoffIfNeeded()
                    scheduleQueueAdvanceAutoplayRetry()
                    return
                }
                if (isMidiKickoffActiveRef.current && isMidiKickoffActiveRef.current()) {
                    return
                }
            }
            setIsLoading(false)
            if (hasActivePlaybackIntent()) {
                toast.error('Could not start notation playback')
            }
        }, 45000)
    }

    function clearMidiEngineRegistrationFallback() {
        if (midiEngineWaitTimeoutRef.current) {
            clearTimeout(midiEngineWaitTimeoutRef.current)
            midiEngineWaitTimeoutRef.current = null
        }
    }

    function cancelYoutubePlayPoll() {
        youtubePlayPollTokenRef.current += 1
    }

    // Sole writer of currentTime during media playback. getCurrentPlaybackSeconds
    // already pins the seek target during the hold window and ignores inactive
    // engines, so no extra guards are needed here.
    function syncPlaybackProgressFromSource() {
        if (!hasActivePlaybackIntent()) return
        if (!isPlaying && !playingIntentRef.current) return
        maybeRecoverStalledRegionEnd()
        if (!hasActivePlaybackIntent()) return
        if (isMidiPlaybackRoute() && isAndroidNativeOutputActive()) {
            getNativePlayerState().then(function(state) {
                if (!hasActivePlaybackIntent()) return
                const seconds = (state.positionMs || 0) / 1000
                const durationSec = (state.durationMs || 0) / 1000
                if (durationSec > 0) {
                    setDuration(durationSec)
                }
                if (seconds >= 0 && isFinite(seconds)) {
                    setCurrentTime(seconds)
                    currentTimeRef.current = seconds
                    updateMediaSessionPosition(seconds, resolvePlaybackDuration())
                }
            }).catch(function() {})
            return
        }
        const seconds = getCurrentPlaybackSeconds()
        if (seconds >= 0 && isFinite(seconds)) {
            if (Math.abs(seconds - lastUiTimeRef.current) < 0.05) return
            setCurrentTime(seconds)
            updateMediaSessionPosition(seconds, resolvePlaybackDuration())
            const durationSec = resolvePlaybackDuration()
            if (durationSec > 0) {
                if (seconds >= durationSec * 0.75 || (durationSec > 30 && seconds >= durationSec - 30)) {
                    maybePrefetchNextQueueTrack(true)
                }
            }
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

    function blockProxiedPlaybackForInsufficientCredit(src) {
        if (!src || !requiresResolverProxiedPlayback(src)) return false
        const block = getResolverProxiedPlaybackBlock(mediaResolverStatus, getGoogleAccessToken())
        if (!block) return false
        toast.error(block.message, {
            onClick: openCreditSettings,
        })
        setIsLoading(false)
        abortPlayingIntent()
        return true
    }

    function getLinkedMediaResolveOptions() {
        return {
            accessToken: getGoogleAccessToken(),
            driveApi: driveDocs,
        }
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
        let resolvedLink = linkIndex !== null && linkIndex !== undefined
            ? linkIndex
            : mediaLinkNumberRef.current
        if (resolvedLink === null || resolvedLink === undefined) {
            resolvedLink = getFirstPlayableMediaLinkIndex(
                resolvedTune,
                null,
                props.tunebook.utils && props.tunebook.utils.isYoutubeLink
            )
        }
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
        const cached = await loadCachedStemSetForMedia(cacheOptions)
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
        inFlightStemAnalysisRef.current = null
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
        clearStemAnalysisJob()
    }
    cancelStemAnalysisRef.current = cancelStemAnalysis

    useEffect(function() {
        if (!stemJobActive) return undefined
        const liveJob = getStemAnalysisJobSnapshot()
        const label = liveJob.tuneName
            ? 'Stem separation: ' + liveJob.tuneName
            : 'Current media stem separation'
        return registerStemSeparationJob({
            label: label,
            onCancel: function() {
                cancelStemAnalysisRef.current()
            },
        })
    }, [stemJobActive])

    function updateStemAnalysisProgress(message, progress, jobMeta) {
        const normalizedProgress = Math.max(0, Math.min(100, parseFloat(progress) || 0))
        lastStemProgressRef.current = normalizedProgress
        const nextProgress = {
            active: true,
            progress: normalizedProgress,
            message: message || '',
        }
        setStemAnalysisProgress(nextProgress)
        const meta = jobMeta || {}
        updateStemAnalysisJob(Object.assign({
            active: true,
            progress: nextProgress.progress,
            message: nextProgress.message,
            error: '',
        }, meta.tuneId != null ? { tuneId: meta.tuneId } : {}, meta.linkIndex != null ? { linkIndex: meta.linkIndex } : {}, meta.tuneName ? { tuneName: meta.tuneName } : {}))
    }

    function getStemAnalysisSourceKey(cacheOptions) {
        if (!cacheOptions) return ''
        return [
            cacheOptions.tuneId || '',
            cacheOptions.linkIndex != null ? String(cacheOptions.linkIndex) : '',
            cacheOptions.src || '',
            cacheOptions.demucsModel || '',
        ].join('|')
    }

    async function analyseMediaStems(options) {
        if (!stemsCapabilityAvailable) {
            throw new Error('Stem separation is not available on this resolver')
        }
        const opts = options || {}
        let currentTune = opts.tune || tuneRef.current || tune
        if ((!currentTune || !currentTune.id) && props.tunes) {
            const tuneId = (currentTune && currentTune.id)
                || (opts.tuneId)
                || (tuneRef.current && tuneRef.current.id)
                || (tune && tune.id)
            if (tuneId && props.tunes[tuneId]) {
                currentTune = props.tunes[tuneId]
            }
        }
        if (!currentTune || !currentTune.id) {
            throw new Error('No tune selected')
        }
        let linkIndex = mediaLinkNumberRef.current !== null && mediaLinkNumberRef.current !== undefined
            ? mediaLinkNumberRef.current
            : mediaLinkNumber
        if (linkIndex === null || linkIndex === undefined) {
            linkIndex = getFirstPlayableMediaLinkIndex(
                currentTune,
                null,
                props.tunebook.utils && props.tunebook.utils.isYoutubeLink
            )
        }
        if (linkIndex !== null && linkIndex !== undefined
            && (mediaLinkNumber === null || mediaLinkNumber === undefined)) {
            setMediaLinkNumber(linkIndex)
            mediaLinkNumberRef.current = linkIndex
        }
        const cacheOptions = getExternalMediaCacheOptions(currentTune, linkIndex)
        if (!cacheOptions) {
            throw new Error('No linked media source selected')
        }

        const sourceKey = getStemAnalysisSourceKey(cacheOptions)
        if (!opts.forceRefresh
            && inFlightStemAnalysisRef.current
            && inFlightStemAnalysisRef.current.key === sourceKey
            && inFlightStemAnalysisRef.current.promise) {
            return inFlightStemAnalysisRef.current.promise
        }

        cancelStemAnalysis()
        const token = ++stemAnalysisTokenRef.current
        const controller = new AbortController()
        stemAnalysisAbortRef.current = controller
        const tuneName = currentTune && currentTune.name && currentTune.name.trim()
            ? currentTune.name.trim()
            : (currentTune ? 'Untitled Song' : '')
        const jobMeta = {
            tuneId: cacheOptions.tuneId,
            linkIndex: cacheOptions.linkIndex,
            tuneName: tuneName,
        }
        setStemSeparationActive(true)
        updateStemAnalysisProgress(
            opts.forceRefresh ? 'Re-analysing stems...' : 'Analysing stems...',
            0,
            jobMeta
        )

        const progressHandlers = {
            signal: controller.signal,
            forceRefresh: !!opts.forceRefresh,
            onProgress: function(message, progress) {
                if (token !== stemAnalysisTokenRef.current) return
                updateStemAnalysisProgress(message, progress, jobMeta)
            },
            onStatus: function(status) {
                if (token !== stemAnalysisTokenRef.current || !status) return
                const message = status.message || 'Separating stems...'
                updateStemAnalysisProgress(message, status.progress, jobMeta)
            },
        }

        const analysisPromise = (async function() {
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
                updateStemAnalysisProgress('Stems ready', 100, jobMeta)
                updateStemAnalysisJob({
                    active: false,
                    progress: 100,
                    message: 'Stems ready',
                    error: '',
                    tuneId: jobMeta.tuneId,
                    linkIndex: jobMeta.linkIndex,
                    tuneName: jobMeta.tuneName,
                })

                const settings = getMediaPlaybackSettings(currentTune)
                if (!audioFiltersAreNeutral(settings.audioFilters)
                    && (externalMediaRef.current || nativeFilteredActiveRef.current)) {
                    await applyLinkedMediaPlaybackSettings(settings)
                } else if (isMediaPlaybackRoute()) {
                    prepareExternalMedia(undefined, settings, {
                        autoPlay: false,
                        showLoading: false,
                        warmStemProcessor: true,
                    }).catch(function() {})
                }

                return {
                    separation: loaded.separation,
                    fromCache: !!loaded.fromCache,
                }
            } catch (err) {
                if (token === stemAnalysisTokenRef.current) {
                    const message = err && err.message ? err.message : 'Stem analysis failed'
                    if (!(err && err.name === 'AbortError')) {
                        updateStemAnalysisJob({
                            active: false,
                            progress: lastStemProgressRef.current,
                            message: message,
                            error: message,
                            tuneId: jobMeta.tuneId,
                            linkIndex: jobMeta.linkIndex,
                            tuneName: jobMeta.tuneName,
                        })
                    }
                }
                throw err
            } finally {
                if (token === stemAnalysisTokenRef.current) {
                    stemAnalysisAbortRef.current = null
                    setStemSeparationActive(false)
                    setStemAnalysisProgress(function(prev) {
                        return Object.assign({}, prev, { active: false })
                    })
                    if (inFlightStemAnalysisRef.current
                        && inFlightStemAnalysisRef.current.key === sourceKey) {
                        inFlightStemAnalysisRef.current = null
                    }
                }
            }
        })()

        inFlightStemAnalysisRef.current = {
            key: sourceKey,
            promise: analysisPromise,
        }
        return analysisPromise
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

    function notifyPitchShiftApplyFailed(message) {
        finishPitchShiftPrepare()
        const text = message || 'Pitch shift could not be applied. Tap play to try again.'
        toast.warning(text, { toastId: 'pitch-shift-apply-failed' })
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

    function notifyYoutubeProxyLimitationIfNeeded(settings) {
        if (!isMediaPlaybackRoute()) return
        if (practiceUsesNativePlaybackOnly(settings)) return
        const currentTune = tuneRef.current || tune
        const linkIndex = mediaLinkNumberRef.current !== null && mediaLinkNumberRef.current !== undefined
            ? mediaLinkNumberRef.current
            : mediaLinkNumber
        const currentSrc = getSrc(currentTune, linkIndex)
        const srcType = getSrcType(currentSrc)
        const externalAlreadyLoaded = !!(externalMediaRef.current && externalLoadedSrcRef.current === currentSrc)
        maybeNotifyYoutubeProxyLimitation({
            settings: settings,
            srcType: srcType,
            resolverFeatures: resolverFeatures,
            resolverStatus: mediaResolverStatus,
            accessToken: getGoogleAccessToken(),
            tuneId: currentTune && currentTune.id,
            linkIndex: linkIndex,
            practiceNativeOnly: practiceUsesNativePlaybackOnly(settings),
            activated: true,
            externalPitchUnavailable: !canUseExternalPitchTempo(settings) && !externalAlreadyLoaded,
        })
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
        if (changed && pitchShiftIsActive(settings.pitch, settings.fineTune)) {
            notifyYoutubeProxyLimitationIfNeeded(settings)
        }
        if (!changed || !pitchShiftWillApply(settings)) {
            return null
        }
        // MIDI retunes in place; a preparing spinner re-renders the tree and
        // starves the ScriptProcessor during live pitch changes.
        if (isMidiPlaybackRoute()) {
            return null
        }
        if (!hasActivePlaybackIntent()) {
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
        const linkIndex = mediaLinkNumberRef.current !== null && mediaLinkNumberRef.current !== undefined
            ? mediaLinkNumberRef.current
            : mediaLinkNumber
        if (linkIndex === null || !tune) return false
        const activeLink = Array.isArray(tune.links) && tune.links[linkIndex]
            ? tune.links[linkIndex]
            : null
        const src = getSrc(tune, linkIndex)
        const srcType = getSrcType(src, activeLink)
        if (srcType !== 'audio' && srcType !== 'youtube' && srcType !== 'recording') return false
        const resolved = settings || getActivePlaybackSettings(tuneRef.current || tune)
        if (!settingsRequireExternalMediaProcessor(resolved)) return false
        if (practiceSessionActiveRef.current && practiceUsesNativePlaybackOnly(resolved)) {
            return false
        }
        if (externalMediaRef.current && externalLoadedSrcRef.current === src) {
            return true
        }
        if (srcType === 'recording') {
            return true
        }
        if (srcType === 'youtube') {
            return linkedMediaPitchPathAvailableSync({
                srcType: 'youtube',
                resolverFeatures: resolverFeatures,
                resolverStatus: mediaResolverStatus,
                accessToken: getGoogleAccessToken(),
            })
        }
        if (!mediaResolverChecked) {
            return false
        }
        return linkedMediaPitchPathAvailableSync({
            srcType: 'audio',
            resolverFeatures: resolverFeatures,
            resolverStatus: mediaResolverStatus,
            accessToken: getGoogleAccessToken(),
        })
    }

    function maybePrefetchYoutubeExternalAudio(useTune, linkIndex, src, srcType) {
        if (practiceSessionActiveRef.current) return
        if (srcType !== 'youtube' || !src || !useTune) return
        if (!linkedMediaPitchPathAvailableSync({
            srcType: 'youtube',
            resolverFeatures: resolverFeatures,
            resolverStatus: mediaResolverStatus,
            accessToken: getGoogleAccessToken(),
        })) return
        if (externalLoadingRef.current && externalLoadingSrcRef.current === src) return
        if (externalMediaRef.current && externalLoadedSrcRef.current === src) return
        const settings = getMediaPlaybackSettings(useTune)
        prepareExternalMedia(src, settings, {
            autoPlay: false,
            showLoading: false,
            fallbackNative: false,
            prefetchOnly: true,
        })
    }

    function maybePrefetchYoutubeNativeAudio(useTune, linkIndex, src, srcType) {
        if (practiceSessionActiveRef.current) return
        if (srcType !== 'youtube' || !src || !useTune) return
        const settings = getMediaPlaybackSettings(useTune)
        if (!shouldUseAndroidNativeYoutubeFetch()) return
        const youtubeGetId = props.tunebook.utils.YouTubeGetID
        const videoId = youtubeGetId(src)
        if (!videoId || getCachedYoutubeNativePath(videoId)) return
        fetchYoutubeAudioViaNative(videoId).then(function(fetched) {
            rememberYoutubeNativeCache(videoId, fetched.filePath)
        }).catch(function() {})
    }

    function prefetchTuneMediaLink(useTune, linkIndex, src, srcType) {
        maybePrefetchYoutubeExternalAudio(useTune, linkIndex, src, srcType)
        maybePrefetchYoutubeNativeAudio(useTune, linkIndex, src, srcType)
        return true
    }

    function maybePrefetchNextQueueTrack(latePrefetch) {
        if (!isQueueActive(props.nowPlayingQueue)) return
        const currentId = tuneRef.current && tuneRef.current.id
        if (!currentId) return
        if (!latePrefetch) {
            if (queuePrefetchTrackIdRef.current === currentId) return
            queuePrefetchTrackIdRef.current = currentId
            queuePrefetchLateRef.current = false
        } else if (queuePrefetchLateRef.current) {
            return
        } else {
            queuePrefetchLateRef.current = true
        }
        prefetchUpcomingQueueItem(
            props.nowPlayingQueue,
            props.tunes,
            props.tunebook,
            {
                prefetchTuneMediaLink: prefetchTuneMediaLink,
                prepareExternalMedia: prepareExternalMedia,
            }
        )
    }

    function clearCachedNativePlaybackUrl() {
        if (cachedNativeBlobUrlRef.current) {
            URL.revokeObjectURL(cachedNativeBlobUrlRef.current)
            cachedNativeBlobUrlRef.current = null
        }
        proxiedNativeBlobSrcRef.current = null
        proxiedNativeBlobPromiseRef.current = null
        setNativePlaybackSrcOverride(null)
    }

    function applyNativePlaybackBlobUrl(blobUrl) {
        if (cachedNativeBlobUrlRef.current && cachedNativeBlobUrlRef.current !== blobUrl) {
            URL.revokeObjectURL(cachedNativeBlobUrlRef.current)
        }
        cachedNativeBlobUrlRef.current = blobUrl
        cancelYoutubePlayPoll()
        clearYoutubeAutostartWatchdog()
        pauseYoutubeOutputOnly()
        setNativePlaybackFallbackRequired(false)
        if (prefersNativeMediaPlayback()) {
            setNativePlaybackSrcOverride(blobUrl)
            return
        }
        flushSync(function() {
            setNativePlaybackSrcOverride(blobUrl)
        })
        const player = playerRef && playerRef.current
        if (player && blobUrl && player.getAttribute('src') !== blobUrl) {
            player.src = blobUrl
        }
    }

    function handleResolverLoginRequired(loginWarning) {
        const warning = loginWarning && loginWarning.message
            ? loginWarning
            : (getResolverLoginWarning(mediaResolverStatus, getGoogleAccessToken()) || {
                message: 'Login to continue',
                showLoginButton: true,
            })
        pendingPlaybackAfterLoginRef.current = { at: Date.now() }
        playingIntentRef.current = true
        userPausedRef.current = false
        setPlayCancelled(false)
        setTapToPlay(false)
        setIsLoading(false)
        showResolverLoginToast(warning, { autoClose: 12000 })
    }

    function preparePlaybackGestureForLogin() {
        if (!pendingPlaybackAfterLoginRef.current && !playingIntentRef.current) {
            return
        }
        pendingPlaybackAfterLoginRef.current = pendingPlaybackAfterLoginRef.current || { at: Date.now() }
        playingIntentRef.current = true
        userPausedRef.current = false
        userGesturePlayRef.current = true
        setPlayCancelled(false)
        setTapToPlay(false)
        resumeSynthAudioContextFromGesture()
        resumeExternalAudioContextFromGesture()
    }

    async function ensureProxiedNativeAudioBlob(src) {
        if (!src || !requiresResolverProxiedPlayback(src)) {
            return true
        }
        if (cachedNativeBlobUrlRef.current && proxiedNativeBlobSrcRef.current === src) {
            return true
        }
        if (proxiedNativeBlobPromiseRef.current && proxiedNativeBlobSrcRef.current === src) {
            return proxiedNativeBlobPromiseRef.current
        }
        const useTune = tuneRef.current || tune
        const linkIndex = getActiveMediaLinkNumber()
        proxiedNativeBlobSrcRef.current = src
        const loadPromise = (async function() {
            try {
                // Prefer a local cache before any login/credit gate so playlists can keep
                // playing downloaded tracks after mid-session logout.
                if (useTune && linkIndex !== null && linkIndex !== undefined) {
                    const cacheKey = getExternalMediaCacheKey(useTune.id, linkIndex, src)
                    const cached = await getCachedExternalMediaBlob(cacheKey)
                    if (proxiedNativeBlobSrcRef.current !== src) return false
                    const forceRefetchUnplayable = unplayableExternalCacheSrcRef.current === src
                    if (cached && cached.blob && !forceRefetchUnplayable) {
                        const settings = getActivePlaybackSettings(useTune)
                        const playBlob = await blobForHtmlAudioPlayback(
                            cached.blob,
                            cached.audioFormat || cached.blob.type
                        )
                        const blobUrl = URL.createObjectURL(playBlob)
                        await attachNativeBlobUrlForPlayback(blobUrl, cached.duration, settings)
                        return hasActivePlaybackIntent()
                    }
                    if (!forceRefetchUnplayable) {
                        const restored = await tryRestoreCachedMediaFromThisAccount(
                            useTune.id,
                            src,
                            cacheKey
                        )
                        if (proxiedNativeBlobSrcRef.current !== src) return false
                        if (restored && restored.blob) {
                            const settings = getActivePlaybackSettings(useTune)
                            const playBlob = await blobForHtmlAudioPlayback(
                                restored.blob,
                                restored.audioFormat || restored.blob.type
                            )
                            const blobUrl = URL.createObjectURL(playBlob)
                            await attachNativeBlobUrlForPlayback(blobUrl, restored.duration, settings)
                            return hasActivePlaybackIntent()
                        }
                    }
                    if (!forceRefetchUnplayable && await isLinkMediaCached(useTune, linkIndex)) {
                        if (proxiedNativeBlobSrcRef.current !== src) return false
                        const played = await playCachedNativeMedia('audio', { preservePosition: false })
                        if (played) return hasActivePlaybackIntent()
                    }
                }
                if (cachedNativeBlobUrlRef.current && proxiedNativeBlobSrcRef.current === src
                    && unplayableExternalCacheSrcRef.current !== src) {
                    return true
                }
                if (blockProxiedPlaybackForInsufficientCredit(src)) {
                    return false
                }
                if (isRouterEnforcedForPath(ROUTER_ENFORCE_KEYS.resolverPrecheck)
                    && unplayableExternalCacheSrcRef.current !== src) {
                    const routeSnapshot = captureCurrentPlaybackSnapshot({})
                    const route = resolvePlaybackRouteForEnforce(routeSnapshot)
                    if (route.resolverRequired) {
                        const loginWarning = getResolverLoginWarning(mediaResolverStatus, getGoogleAccessToken())
                        if (loginWarning && loginWarning.message) {
                            handleResolverLoginRequired(loginWarning)
                            return 'login_required'
                        }
                    }
                }
                const loginWarning = getResolverLoginWarning(mediaResolverStatus, getGoogleAccessToken())
                const forceRefetchUnplayable = unplayableExternalCacheSrcRef.current === src
                if (loginWarning && loginWarning.message && !forceRefetchUnplayable) {
                    handleResolverLoginRequired(loginWarning)
                    return 'login_required'
                }
                const settings = getActivePlaybackSettings(tuneRef.current || tune)
                const { response } = await fetchDirectOrProxy({
                    src: src,
                    srcType: 'audio',
                    youtubeGetId: props.tunebook.utils.YouTubeGetID,
                    accessToken: getGoogleAccessToken(),
                    collectionLink: useTune && Array.isArray(useTune.links)
                        ? useTune.links[linkIndex]
                        : null,
                })
                if (proxiedNativeBlobSrcRef.current !== src) return false
                const rawBlob = await response.blob()
                if (proxiedNativeBlobSrcRef.current !== src) return false
                const mime = response.headers && typeof response.headers.get === 'function'
                    ? response.headers.get('Content-Type')
                    : null
                const blob = await blobForHtmlAudioPlayback(rawBlob, mime)
                const blobUrl = URL.createObjectURL(blob)
                await attachNativeBlobUrlForPlayback(blobUrl, null, settings)
                if (useTune && linkIndex !== null && linkIndex !== undefined) {
                    const cacheKey = getExternalMediaCacheKey(useTune.id, linkIndex, src)
                    if (unplayableExternalCacheSrcRef.current === src) {
                        putExternalMediaCache(cacheKey, blob, null, blob.type).catch(function() {})
                        unplayableExternalCacheSrcRef.current = null
                    } else if (
                        shouldAutoCacheMediaLink(src, props.tunebook.utils.isYoutubeLink)
                        || loadOfflineMediaSettings().autocacheOnPlay
                    ) {
                        blob.arrayBuffer().then(function(arrayBuffer) {
                            return cacheExternalMediaBytes(cacheKey, arrayBuffer, mime)
                        }).catch(function() {})
                    }
                }
                return hasActivePlaybackIntent()
            } catch (e) {
                if (unplayableExternalCacheSrcRef.current === src) {
                    unplayableExternalCacheSrcRef.current = null
                }
                toast.error(e && e.message ? e.message : 'Could not load library audio.')
                return false
            } finally {
                if (proxiedNativeBlobSrcRef.current === src) {
                    proxiedNativeBlobPromiseRef.current = null
                }
            }
        })()
        proxiedNativeBlobPromiseRef.current = loadPromise
        return loadPromise
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

    function scheduleMediaLinkCacheJob(useTune, linkIndex, src, srcType, accessToken, youtubeGetId) {
        if (!useTune || !src || (srcType !== 'audio' && srcType !== 'youtube')) return
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
            if (srcType === 'youtube'
                && !linkedMediaPitchPathAvailableSync({
                    srcType: 'youtube',
                    resolverFeatures: resolverFeatures,
                    resolverStatus: mediaResolverStatus,
                    accessToken: accessToken,
                })) {
                return
            }
            scheduleMediaLinkCacheJob(useTune, linkIndex, src, srcType, accessToken, youtubeGetId)
        } else if (useTune && src && shouldAutoCacheMediaLink(src, props.tunebook.utils.isYoutubeLink)) {
            scheduleMediaLinkCacheJob(useTune, linkIndex, src, srcType, accessToken, youtubeGetId)
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
            maybePrefetchNativeFilteredForQueue(nextTune, resolved)
        }
    }

    function maybePrefetchNativeFilteredForQueue(nextTune, resolved) {
        if (!prefersNativeMediaPlayback() || !nextTune || !resolved) return
        const nextSettings = getMediaPlaybackSettings(nextTune)
        if (!playbackNeedsExternalProcessing(nextSettings)) return
        const cacheOptions = {
            tuneId: nextTune.id,
            linkIndex: resolved.linkIndex,
            src: resolved.src,
            srcType: resolved.srcType,
            accessToken: getGoogleAccessToken(),
            demucsModel: getDemucsModel(),
            youtubeGetId: props.tunebook.utils.YouTubeGetID,
        }
        const cacheKey = getNativeFilteredBlobCacheKey(cacheOptions, 'prefetch', nextSettings.audioFilters)
        if (nativeFilteredBlobCacheRef.current.has(cacheKey)) return
        buildNativePlaybackBlob(cacheOptions, nextSettings, {
            allowNetworkSeparation: true,
        }).then(function(built) {
            nativeFilteredBlobCacheRef.current.set(cacheKey, {
                blob: built.blob,
                duration: built.duration,
            })
            logPlaybackDebug('queue-prefetch-hit', { tuneId: nextTune.id })
        }).catch(function() {})
    }

    async function playCachedNativeMedia(srcType, options) {
        const opts = options || {}
        const useTune = tuneRef.current || tune
        const linkIndex = getActiveMediaLinkNumber()
        const cacheSrc = resolveTuneLinkCacheSrc(useTune, linkIndex)
        if (!useTune || !cacheSrc) return false

        const activeLink = useTune.links && useTune.links[linkIndex]
        const cached = activeLink && isOwnedMediaLinkUri(cacheSrc)
            ? await findCachedExternalMediaForLink(
                useTune.id,
                linkIndex,
                activeLink,
                useTune.links ? useTune.links.length : 0
            )
            : await getCachedExternalMediaBlob(getExternalMediaCacheKey(useTune.id, linkIndex, cacheSrc))
        if (!cached || !cached.blob) return false
        const playBlob = await blobForHtmlAudioPlayback(
            cached.blob,
            cached.audioFormat || cached.blob.type
        )

        if (prefersNativeMediaPlayback()) {
            const blobUrl = URL.createObjectURL(playBlob)
            const settings = getActivePlaybackSettings(useTune)
            const regionStart = getLinkStartAt()
            const positionSec = opts.preservePosition ? getCurrentPlaybackSeconds() : regionStart
            muteNativePlayers()
            setIsLoading(true)
            try {
                await playAndroidNativeBlob(playBlob, {
                    title: useTune && useTune.name ? useTune.name : 'Tunebook',
                    artist: useTune && useTune.composer ? useTune.composer : '',
                    positionSec: positionSec,
                    tempo: settings.tempo,
                    play: true,
                })
                if (cached.duration) {
                    setDuration(cached.duration)
                }
                setIsReady(true)
                setIsLoading(false)
                return true
            } catch (e) {
                setIsLoading(false)
                URL.revokeObjectURL(blobUrl)
                return false
            }
        }
        return playLocalMediaBlob(playBlob, cached.duration, cacheSrc, opts)
    }

    function getActivePlaybackSettings(useTune) {
        const base = getMediaPlaybackSettings(useTune || tuneRef.current || tune)
        if (practiceSessionActiveRef.current && pendingExternalSettingsRef.current) {
            return Object.assign({}, base, pendingExternalSettingsRef.current)
        }
        return base
    }

    function resumeMidiFileAudioContextFromGesture() {
        if (resumeMidiFileAudioContextRef.current) {
            resumeMidiFileAudioContextRef.current()
        }
    }

    async function flushPendingMidiFilePlay() {
        const pending = pendingMidiFilePlayRef.current
        if (!pending || !hasActivePlaybackIntent()) return false
        if (!prepareMidiFileLinkRef.current || !playMidiFileRef.current) return false
        pendingMidiFilePlayRef.current = null
        const useTune = tuneRef.current || tune
        const linkIndex = pending.linkIndex != null
            ? pending.linkIndex
            : getActiveMediaLinkNumber()
        const src = pending.src
            || (useTune && useTune.links && useTune.links[linkIndex] && useTune.links[linkIndex].link)
        if (!useTune) return false
        try {
            setIsLoading(true)
            resumeMidiFileAudioContextFromGesture()
            await prepareMidiFileLinkRef.current(useTune, linkIndex, src, getLinkedMediaResolveOptions())
            if (!hasActivePlaybackIntent()) {
                setIsLoading(false)
                return false
            }
            const settings = getActivePlaybackSettings(useTune)
            applyMidiFileTempoRef.current && applyMidiFileTempoRef.current(settings.tempo)
            const midiOk = await playMidiFileRef.current(pending)
            if (!hasActivePlaybackIntent()) {
                setIsLoading(false)
                return false
            }
            if (midiOk !== false) {
                confirmPlayingStarted()
            }
            return midiOk !== false
        } catch (e) {
            toast.error(e && e.message ? e.message : 'MIDI file is not available for playback.')
            handleMediaPlaybackFailure()
            return false
        }
    }

    async function startLinkedMediaPlayback(useTune, linkIndex, src, srcType, opts) {
        if (linkedMediaPlaybackInFlightRef.current) {
            if (src && linkedMediaPlaybackSrcRef.current === src) {
                if (proxiedNativeBlobPromiseRef.current && proxiedNativeBlobSrcRef.current === src) {
                    logPlaybackDebug('linked-media-reuse-inflight', {
                        tuneId: useTune && useTune.id,
                        linkIndex: linkIndex,
                        srcType: srcType,
                    })
                    return proxiedNativeBlobPromiseRef.current
                }
                logPlaybackDebug('linked-media-skip-inflight', {
                    tuneId: useTune && useTune.id,
                    linkIndex: linkIndex,
                    srcType: srcType,
                })
                return
            }
            logPlaybackDebug('linked-media-replace-inflight', {
                tuneId: useTune && useTune.id,
                linkIndex: linkIndex,
                srcType: srcType,
            })
        }
        const playbackGeneration = ++linkedMediaPlaybackGenerationRef.current
        linkedMediaPlaybackSrcRef.current = src || null
        if (proxiedNativeBlobSrcRef.current && proxiedNativeBlobSrcRef.current !== src) {
            clearCachedNativePlaybackUrl()
        }
        linkedMediaPlaybackInFlightRef.current = true
        let releaseInflightOnSyncExit = true
        function deferLinkedMediaInflightRelease() {
            releaseInflightOnSyncExit = false
        }
        function releaseLinkedMediaInflight() {
            if (linkedMediaPlaybackGenerationRef.current === playbackGeneration) {
                linkedMediaPlaybackInFlightRef.current = false
                if (linkedMediaPlaybackSrcRef.current === src) {
                    linkedMediaPlaybackSrcRef.current = null
                }
            }
        }
        function scheduleLinkedMediaInflightRelease() {
            deferLinkedMediaInflightRelease()
            const startedAt = Date.now()
            function poll() {
                if (linkedMediaPlaybackGenerationRef.current !== playbackGeneration) return
                if (!linkedMediaPlaybackInFlightRef.current) return
                if (playbackStartedRef.current || Date.now() - startedAt > 10000) {
                    releaseLinkedMediaInflight()
                    return
                }
                setTimeout(poll, 50)
            }
            setTimeout(poll, 50)
        }
        function holdInflightUntilProxiedBlobSettles() {
            const pending = proxiedNativeBlobPromiseRef.current
            if (!pending) return false
            deferLinkedMediaInflightRelease()
            pending.finally(function() {
                releaseLinkedMediaInflight()
            })
            return true
        }
        try {
        const settings = getActivePlaybackSettings(useTune)
        const preserveMediaPosition = !opts.restart && !opts.fresh && opts.preservePosition !== false
        if (prefersNativeMediaPlayback() && (srcType === 'audio' || srcType === 'youtube' || srcType === 'recording')) {
            hardSilenceWebViewOutputs(getAndroidPlaybackGateContext())
        }
        if (src && blockProxiedPlaybackForInsufficientCredit(src)) {
            setIsLoading(false)
            return
        }

        if (srcType === 'midifile') {
            try {
                resumeMidiFileAudioContextFromGesture()
                // MediaPlayerMidiFile may not be mounted yet (e.g. Links preview on
                // /editor/). Keep intent + loading and let the engine flush pending.
                if (!prepareMidiFileLinkRef.current || !playMidiFileRef.current) {
                    pendingMidiFilePlayRef.current = Object.assign({}, opts, {
                        tuneId: useTune && useTune.id,
                        linkIndex: linkIndex,
                        src: src,
                    })
                    setIsLoading(true)
                    queueMicrotask(function() {
                        flushPendingMidiFilePlay()
                    })
                    return
                }
                await prepareMidiFileLinkRef.current(useTune, linkIndex, src, {
                    accessToken: getGoogleAccessToken(),
                    driveApi: driveDocs,
                })
                if (!hasActivePlaybackIntent()) {
                    setIsLoading(false)
                    return
                }
                applyMidiFileTempoRef.current && applyMidiFileTempoRef.current(settings.tempo)
                const midiOk = await playMidiFileRef.current(opts)
                if (!hasActivePlaybackIntent()) {
                    setIsLoading(false)
                    return
                }
                if (midiOk !== false) {
                    confirmPlayingStarted()
                }
                return
            } catch (e) {
                toast.error(e && e.message ? e.message : 'MIDI file is not available for playback.')
                handleMediaPlaybackFailure()
                return
            }
        }

        if (practiceUsesNativePlaybackOnly(settings) && srcType !== 'recording') {
            if (externalMediaRef.current || externalMediaActiveRef.current) {
                destroyExternalMedia()
            }
            applyNativeMediaPlaybackSettings(settings.tempo)
            playNativeMedia(srcType, {
                preservePosition: preserveMediaPosition,
            })
            if (!holdInflightUntilProxiedBlobSettles()) {
                scheduleLinkedMediaInflightRelease()
            }
            return
        }

        const cached = await isLinkMediaCached(useTune, linkIndex)

        if ((srcType === 'audio' || srcType === 'youtube' || srcType === 'recording') && cached) {
            const cachedMediaSnapshot = capturePlaybackSnapshot({
                tune: useTune,
                routeMode: 'media',
                linkIndex: linkIndex,
                src: src,
                srcType: srcType,
                needsExternalProcessing: playbackNeedsExternalProcessing(settings),
                canUseNativeFiltered: canUseNativeFilteredPlayback(settings),
                prefersNative: prefersNativeMediaPlayback(),
                remoteOutputActive: isSnapcastRemoteActive() || isCastSdkRemoteActive(),
            })
            if (playbackNeedsExternalProcessing(settings) && !practiceUsesNativePlaybackOnly(settings)) {
                if (canUseNativeFilteredPlayback(settings) && !shouldBlockNativeFilteredPath(cachedMediaSnapshot)) {
                    deferLinkedMediaInflightRelease()
                    applyNativeFilteredPlayback(settings, {
                        play: true,
                        resumeAt: preserveMediaPosition ? getCurrentPlaybackSeconds() : getLinkStartAt(),
                        forcePlay: true,
                    }).then(function(ok) {
                        if (!ok && hasActivePlaybackIntent()) {
                            skipBackgroundIncapableTrack('cached-processed-failed')
                        } else if (ok) {
                            scheduleOfflineMediaQueueJobs(useTune, linkIndex, src, srcType)
                        }
                    }).finally(releaseLinkedMediaInflight)
                    return
                }
                if (prefersNativeMediaPlayback()) {
                    skipBackgroundIncapableTrack('cached-processed-unavailable')
                    return
                }
                deferLinkedMediaInflightRelease()
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
                }).finally(releaseLinkedMediaInflight)
                return
            }
            const played = await playCachedNativeMedia(srcType, opts)
            if (played) {
                scheduleOfflineMediaQueueJobs(useTune, linkIndex, src, srcType)
                return
            }
            // Cache was present but could not start (often an unplayable ALAC/mp4).
            // Do not prompt login — a local copy already exists. Fall through to
            // refetch a browser-playable stream unless credit/availability blocks.
            if (src && requiresResolverProxiedPlayback(src)) {
                const authBlock = getResolverProxiedMediaAuthBlock({
                    resolverStatus: mediaResolverStatus,
                    accessToken: getGoogleAccessToken(),
                })
                if (authBlock && authBlock.kind !== 'login') {
                    handleMediaPlaybackFailure()
                    return
                }
            }
        }

        if (srcType === 'recording') {
            const activeLink = useTune && useTune.links ? useTune.links[linkIndex] : null
            if (!activeLink) {
                toast.error('Recording link is not available.')
                handleMediaPlaybackFailure()
                return
            }
            try {
                const resolved = await resolveRecordingLinkAudio(activeLink, useTune.id, linkIndex, {
                    accessToken: getGoogleAccessToken(),
                    driveApi: driveDocs,
                    forPlayback: true,
                    tune: useTune,
                    linkCount: useTune.links ? useTune.links.length : 0,
                })
                if (!hasActivePlaybackIntent()) {
                    setIsLoading(false)
                    return
                }

                const cacheSrc = resolveTuneLinkCacheSrc(useTune, linkIndex) || src

                if (!playbackNeedsExternalProcessing(settings) || practiceUsesNativePlaybackOnly(settings)) {
                    const played = await playLocalMediaBlob(
                        resolved.blob,
                        resolved.duration,
                        cacheSrc,
                        opts
                    )
                    if (played) {
                        scheduleOfflineMediaQueueJobs(useTune, linkIndex, src, srcType)
                        return
                    }
                }

                const blobUrl = URL.createObjectURL(resolved.blob)
                await attachNativeBlobUrlForPlayback(blobUrl, resolved.duration, settings)
                if (!hasActivePlaybackIntent()) {
                    setIsLoading(false)
                    return
                }

                if (playbackNeedsExternalProcessing(settings) && !practiceUsesNativePlaybackOnly(settings)) {
                    if (prefersNativeMediaPlayback()) {
                        setIsLoading(true)
                        deferLinkedMediaInflightRelease()
                        startAndroidProcessedBlobPlayback({
                            sourceBlob: resolved.blob,
                            settings: settings,
                            metadata: {
                                title: useTune && useTune.name ? useTune.name : 'Tunebook',
                                artist: useTune && useTune.composer ? useTune.composer : '',
                            },
                            resumeAt: preserveMediaPosition ? getCurrentPlaybackSeconds() : getLinkStartAt(),
                            play: true,
                        }).then(function() {
                            if (!hasActivePlaybackIntent()) {
                                setIsLoading(false)
                                return
                            }
                            androidNativeActiveRef.current = true
                            confirmPlayingStarted()
                            setIsLoading(false)
                            scheduleOfflineMediaQueueJobs(useTune, linkIndex, src, srcType)
                        }).catch(function() {
                            setIsLoading(false)
                            if (hasActivePlaybackIntent()) {
                                skipBackgroundIncapableTrack('recording-processed-failed')
                            }
                        }).finally(releaseLinkedMediaInflight)
                        return
                    }
                    deferLinkedMediaInflightRelease()
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
                    }).finally(releaseLinkedMediaInflight)
                    return
                }

                playNativeMedia('audio', opts)
                scheduleOfflineMediaQueueJobs(useTune, linkIndex, src, srcType)
                return
            } catch (e) {
                toast.error(e && e.message ? e.message : 'Recording is not available for playback.')
                handleMediaPlaybackFailure()
                return
            }
        }

        if ((srcType === 'audio' || srcType === 'youtube') && typeof navigator !== 'undefined' && navigator.onLine === false) {
            toast.error('This media is not cached for offline playback.')
            handleMediaPlaybackFailure()
            return
        }

        if (!(cachedNativeBlobUrlRef.current && proxiedNativeBlobSrcRef.current === src)
            && !(proxiedNativeBlobPromiseRef.current && proxiedNativeBlobSrcRef.current === src)) {
            clearCachedNativePlaybackUrl()
        }

        if (canUseNativeFilteredPlayback(settings) && !shouldBlockNativeFilteredPath(capturePlaybackSnapshot({
            tune: useTune,
            routeMode: 'media',
            src: src,
            srcType: srcType,
            needsExternalProcessing: playbackNeedsExternalProcessing(settings),
            canUseNativeFiltered: true,
            prefersNative: prefersNativeMediaPlayback(),
        }))) {
            if (isNativeFilteredActive()) {
                scheduleLinkedMediaInflightRelease()
                playNativeFilteredMedia({ preservePosition: preserveMediaPosition })
                scheduleOfflineMediaQueueJobs(useTune, linkIndex, src, srcType)
                return
            }
            deferLinkedMediaInflightRelease()
            applyNativeFilteredPlayback(settings, {
                play: true,
                resumeAt: preserveMediaPosition ? getCurrentPlaybackSeconds() : getLinkStartAt(),
                forcePlay: true,
            }).then(function(ok) {
                if (!ok && hasActivePlaybackIntent()) {
                    skipBackgroundIncapableTrack('native-filter-failed')
                } else if (ok) {
                    scheduleOfflineMediaQueueJobs(useTune, linkIndex, src, srcType)
                }
            }).finally(releaseLinkedMediaInflight)
            return
        }

        if (shouldUseExternalMediaForPlayIntent(settings)) {
            if (externalMediaRef.current && externalLoadedSrcRef.current === src) {
                deferLinkedMediaInflightRelease()
                playExternalMedia({ preservePosition: preserveMediaPosition }).then(function(ok) {
                    if (!ok && playingIntentRef.current) {
                        playNativeMedia(srcType, { preservePosition: preserveMediaPosition })
                    } else if (ok) {
                        scheduleOfflineMediaQueueJobs(useTune, linkIndex, src, srcType)
                    }
                }).finally(releaseLinkedMediaInflight)
                return
            }
            if (externalLoadingRef.current && externalLoadingPromiseRef.current) {
                deferLinkedMediaInflightRelease()
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
                }).finally(releaseLinkedMediaInflight)
                return
            }
            deferLinkedMediaInflightRelease()
            prepareExternalMedia(src, settings, { autoPlay: true, showLoading: true }).then(function(loaded) {
                if (!loaded && playingIntentRef.current) {
                    playNativeMedia(srcType, { preservePosition: preserveMediaPosition })
                } else if (loaded) {
                    scheduleOfflineMediaQueueJobs(useTune, linkIndex, src, srcType)
                }
            }).finally(releaseLinkedMediaInflight)
            return
        }

        if (prefersNativeMediaPlayback() && (srcType === 'audio' || srcType === 'youtube')) {
            logPlaybackDebug('plain-native', { srcType: srcType })
            playNativeMedia(srcType, Object.assign({}, opts, { preservePosition: preserveMediaPosition }))
            scheduleOfflineMediaQueueJobs(useTune, linkIndex, src, srcType)
            if (!holdInflightUntilProxiedBlobSettles()) {
                scheduleLinkedMediaInflightRelease()
            }
            return
        }

        if (externalMediaActiveRef.current || externalMediaRef.current) {
            destroyExternalMedia()
        }
        if ((srcType === 'youtube' || srcType === 'audio') && hasStemsForCurrentMedia()) {
            primeStemPlaybackEngine(useTune, linkIndex, src)
        }
        if (srcType === 'youtube') {
            maybePrefetchYoutubeExternalAudio(useTune, linkIndex, src, srcType)
            maybePrefetchYoutubeNativeAudio(useTune, linkIndex, src, srcType)
        }
        playNativeMedia(srcType, { preservePosition: false })
        scheduleOfflineMediaQueueJobs(useTune, linkIndex, src, srcType)
        if (!holdInflightUntilProxiedBlobSettles()) {
            scheduleLinkedMediaInflightRelease()
        }
        } finally {
            if (releaseInflightOnSyncExit) {
                releaseLinkedMediaInflight()
            }
        }
    }

    function settingsUseNativeFilteredPlayback(settings) {
        if (!settings) return false
        if (prefersNativeMediaPlayback()) {
            return playbackNeedsExternalProcessing(settings)
        }
        if (isMobilePlatform()) {
            return playbackNeedsExternalProcessing(settings)
        }
        if (settings.audioFilters && !audioFiltersAreNeutral(settings.audioFilters)) {
            return true
        }
        return false
    }

    function canUseNativeFilteredPlayback(settings) {
        if (mediaLinkNumber === null || !tune) return false
        const src = getSrc(tune, mediaLinkNumber)
        const srcType = getSrcType(src)
        if (srcType !== 'audio' && srcType !== 'youtube') return false
        const resolved = settings || getMediaPlaybackSettings(tune)
        if (!settingsUseNativeFilteredPlayback(resolved)) return false
        if (prefersNativeMediaPlayback() || isMobilePlatform()) {
            return linkedMediaPitchPathAvailableSync({
                srcType: srcType,
                resolverFeatures: resolverFeatures,
                resolverStatus: mediaResolverStatus,
                accessToken: getGoogleAccessToken(),
            }) || isAndroidApp()
        }
        if (!isMediaProxyConfigured()) return false
        if (mediaResolverChecked && !mediaResolverAvailable) return false
        if (mediaResolverChecked && !resolverFeatures.proxy) return false
        return true
    }

    function isNativeFilteredActive() {
        return (!!nativeFilteredActiveRef.current && !!filteredPlayerRef.current)
            || androidNativeActiveRef.current
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

    function isPlayerElementLive(element) {
        return !!(element && element.isConnected)
    }

    function waitForLivePlayerElement(timeoutMs) {
        const existing = playerRef && playerRef.current
        if (isPlayerElementLive(existing)) return Promise.resolve(existing)
        const deadline = Date.now() + (timeoutMs || 4000)
        return new Promise(function(resolve) {
            function poll() {
                const el = playerRef && playerRef.current
                if (isPlayerElementLive(el)) {
                    resolve(el)
                    return
                }
                if (Date.now() >= deadline) {
                    resolve(isPlayerElementLive(el) ? el : null)
                    return
                }
                setTimeout(poll, 50)
            }
            poll()
        })
    }

    function waitForMediaElementReady(element, timeoutMs, expectedSrc) {
        if (!element) return Promise.resolve(false)
        if (element.readyState >= 3) {
            const current = element.currentSrc || element.src || ''
            if (!expectedSrc || !current || current === expectedSrc || current.indexOf(expectedSrc) >= 0) {
                return Promise.resolve(true)
            }
        }
        const deadline = Date.now() + (timeoutMs || 8000)
        return new Promise(function(resolve) {
            let settled = false
            function done(ok) {
                if (settled) return
                settled = true
                element.removeEventListener('canplaythrough', onReady)
                element.removeEventListener('loadeddata', onReady)
                element.removeEventListener('canplay', onReady)
                element.removeEventListener('error', onError)
                clearInterval(pollTimer)
                resolve(ok)
            }
            function srcMatches() {
                if (!expectedSrc) return true
                const src = element.currentSrc || element.src || ''
                if (!src) return false
                return src === expectedSrc || src.indexOf(expectedSrc) >= 0
            }
            function onReady() {
                if (srcMatches()) done(true)
            }
            function onError() {
                if (!isPlayerElementLive(element)) {
                    done(false)
                    return
                }
                const src = element.currentSrc || element.src || ''
                if (expectedSrc && (!src || (src !== expectedSrc && src.indexOf(expectedSrc) < 0))) {
                    return
                }
                if (!src) return
                done(false)
            }
            element.addEventListener('canplaythrough', onReady)
            element.addEventListener('loadeddata', onReady)
            element.addEventListener('canplay', onReady)
            element.addEventListener('error', onError)
            const pollTimer = setInterval(function() {
                if (!isPlayerElementLive(element)) {
                    done(false)
                    return
                }
                if (element.readyState >= 2 && srcMatches()) {
                    done(true)
                } else if (Date.now() >= deadline) {
                    done(element.readyState >= 2 && srcMatches())
                }
            }, 50)
        })
    }

    async function playLocalMediaBlob(blob, duration, cacheSrc, options) {
        const opts = options || {}
        if (!blob || !hasActivePlaybackIntent()) return false
        nativeBlobAttachInFlightRef.current = true
        try {
            let playBlob = await blobForHtmlAudioPlayback(blob, blob.type)
            const prefixSlice = playBlob.slice ? playBlob.slice(0, 262144) : playBlob
            const prefixBuffer = prefixSlice.arrayBuffer
                ? await prefixSlice.arrayBuffer()
                : await playBlob.arrayBuffer()
            const alac = looksLikeAlacAudio(new Uint8Array(prefixBuffer || []))
            if (alac) {
                if (cacheSrc) unplayableExternalCacheSrcRef.current = cacheSrc
                return false
            }
            proxiedNativeBlobSrcRef.current = cacheSrc
            let blobUrl = URL.createObjectURL(playBlob)
            applyNativePlaybackBlobUrl(blobUrl)
            if (duration) {
                setDuration(duration)
            }
            let player = await waitForLivePlayerElement(4000)
            if (!player) {
                clearCachedNativePlaybackUrl()
                return false
            }
            if ((player.getAttribute('src') || player.src) !== blobUrl) {
                player.src = blobUrl
            }
            let ready = await waitForMediaElementReady(player, 8000, blobUrl)
            if (!ready && !isPlayerElementLive(player)) {
                player = await waitForLivePlayerElement(4000)
                if (!player) {
                    clearCachedNativePlaybackUrl()
                    return false
                }
                player.src = blobUrl
                ready = await waitForMediaElementReady(player, 8000, blobUrl)
            }
            if (!ready) {
                if (cacheSrc) unplayableExternalCacheSrcRef.current = cacheSrc
                clearCachedNativePlaybackUrl()
                return false
            }
            unplayableExternalCacheSrcRef.current = null
            setIsReady(true)
            playNativeMedia('audio', opts)
            return true
        } finally {
            nativeBlobAttachInFlightRef.current = false
        }
    }

    async function attachNativeFilteredPlayback(blobUrl, duration, settings, options) {
        const opts = options || {}
        const resumeAt = opts.resumeAt !== undefined && opts.resumeAt !== null
            ? Math.max(0, parseFloat(opts.resumeAt) || 0)
            : 0

        muteNativePlayers()
        nativeFilteredBlobUrlRef.current = blobUrl
        nativeFilteredActiveRef.current = true
        nativeFilteredDurationRef.current = duration
        setDuration(duration)
        setIsReady(true)

        if (opts.play !== false && hasActivePlaybackIntent() && prefersNativeMediaPlayback()) {
            try {
                const blob = opts.blob || await fetch(blobUrl).then(function(r) { return r.blob() })
                const positionSec = duration > 0
                    ? Math.min(resumeAt, Math.max(0, duration - 0.05))
                    : resumeAt
                await playAndroidNativeBlob(blob, {
                    title: tune && tune.name ? tune.name : 'Tunebook',
                    artist: tune && tune.composer ? tune.composer : '',
                    positionSec: positionSec,
                    tempo: settings.tempo,
                    play: true,
                })
                setCurrentTime(positionSec)
                logPlaybackDebug('prerender-native', { duration: duration })
                return true
            } catch (nativeError) {
                androidNativeActiveRef.current = false
                setIsLoading(false)
                if (hasActivePlaybackIntent()) {
                    skipBackgroundIncapableTrack('prerender-native-failed')
                }
                return false
            }
        }

        const player = filteredPlayerRef.current
        if (!player) return false

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
                applyStoredOutputDeviceToActiveRoute().catch(function() {})
                confirmPlayingStarted()
            } catch (e) {
                if (isAutoplayBlockedError(e)) {
                    promptTapToPlayWhenAutoplayBlocked()
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
                const blobOptions = Object.assign({}, cacheOptions, {
                    youtubeGetId: props.tunebook.utils.YouTubeGetID,
                })
                const built = playbackNeedsExternalProcessing(settings)
                    ? await buildNativePlaybackBlob(blobOptions, settings, {
                        allowNetworkSeparation: true,
                        onProgress: opts.onProgress,
                    })
                    : await buildFilteredMediaBlob(cacheOptions, settings.audioFilters)
                if (token !== nativeFilteredLoadTokenRef.current) return false
                blob = built.blob
                duration = built.duration
                cacheKey = built.separation ? built.separation.cacheId : 'native-playback'
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
                blob: blob,
                resumeAt: opts.resumeAt !== undefined ? opts.resumeAt : getCurrentPlaybackSeconds(),
                play: playingNow,
            })
        } catch (e) {
            destroyNativeFilteredPlayback()
            if (prefersNativeMediaPlayback() && hasActivePlaybackIntent()) {
                skipBackgroundIncapableTrack('native-filter-error')
            }
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
                promptTapToPlayWhenAutoplayBlocked()
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
        if (Date.now() < nativePlaybackEventSuppressUntilRef.current) {
            return true
        }
        if (androidNativeActiveRef.current || isAndroidNativePlayerActive()) {
            return true
        }
        return intentShouldIgnoreNativePlaybackEvents(getIntentSnapshot(), {
            externalMediaActive: externalMediaActiveRef.current,
            suppressNativePlaybackEvents: suppressNativePlaybackEventsRef.current,
        })
    }

    function shouldSuppressSpuriousPause() {
        if (androidNativeActiveRef.current || isAndroidNativePlayerActive()) {
            return true
        }
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
            sharedExternalAudioContextRef.current = createPlaybackAudioContext() || new Ctx()
        }
        bindAudioContextBackgroundResume(sharedExternalAudioContextRef.current)
        applyStoredOutputDeviceToActiveRoute().catch(function() {})
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

    function getActiveMediaSrc() {
        const currentTune = tuneRef.current || tune
        if (!currentTune) return null
        const linkIndex = getActiveMediaLinkNumber()
        return getSrc(currentTune, linkIndex)
    }

    function isPlaybackTransitionGuardActive() {
        return Date.now() < queueAdvanceGuardUntilRef.current
            || Date.now() < externalHandoffGuardUntilRef.current
            || !!externalLoadingRef.current
            || !!suppressNativePlaybackEventsRef.current
    }

    function playlistAutoplayKeepPlayingFlags() {
        return {
            playbackTransitionGuardActive: isPlaybackTransitionGuardActive(),
            playingIntent: playingIntentRef.current || hasActivePlaybackIntent(),
            userPaused: userPausedRef.current,
            playbackStarted: playbackStartedRef.current,
            manualSkipActive: shouldIgnorePlaybackEndForManualSkip(),
            playlistKeepPlaying: shouldIgnorePlaybackEndForManualSkip()
                || shouldAdvanceQueueOnPlaybackEnd(),
            queueAutoAdvance: shouldAdvanceQueueOnPlaybackEnd(),
        }
    }

    function shouldSuppressTapToPlayForTransition() {
        return intentShouldSuppressTapToPlayDuringQueueAdvance(playlistAutoplayKeepPlayingFlags())
    }

    function shouldKeepPlaylistPlayingThroughAutoplayBlock() {
        return intentShouldKeepPlayingThroughAutoplayBlock(playlistAutoplayKeepPlayingFlags())
    }

    function trySkipTrackAfterAutoplayBlock() {
        const queue = nowPlayingQueueRef.current
        const maxSkips = queue && queue.items && queue.items.length
            ? queue.items.length
            : 1
        if (autoplayBlockSkipCountRef.current >= maxSkips) {
            return false
        }
        autoplayBlockSkipCountRef.current += 1
        queueAdvanceAutoplayAttemptRef.current = 0
        armQueueAdvanceGuard(5000)
        setIsLoading(true)
        setTapToPlay(false)
        if (tryNextMediaLinkOnCurrentTune()) return true
        if (shouldAdvanceQueueOnPlaybackEnd()) {
            advanceQueueOnPlaybackEnd()
            return true
        }
        autoplayBlockSkipCountRef.current -= 1
        return false
    }

    function clearQueueAdvanceAutoplayRetry() {
        if (queueAdvanceAutoplayRetryTimerRef.current) {
            clearTimeout(queueAdvanceAutoplayRetryTimerRef.current)
            queueAdvanceAutoplayRetryTimerRef.current = null
        }
        queueAdvanceAutoplayAttemptRef.current = 0
    }

    function clearPlaybackKickoffTimer() {
        if (playbackKickoffTimerRef.current) {
            clearTimeout(playbackKickoffTimerRef.current)
            playbackKickoffTimerRef.current = null
        }
    }

    function schedulePlaybackKickoffIfNeeded() {
        if (!needsPlaybackKickoff()) return
        clearPlaybackKickoffTimer()
        playbackKickoffTimerRef.current = setTimeout(function() {
            playbackKickoffTimerRef.current = null
            if (!needsPlaybackKickoff()) return
            const kickoffOpts = freshPlaybackIntentRef.current
                ? { fresh: true, skipNotationRefresh: true }
                : { skipNotationRefresh: true }
            freshPlaybackIntentRef.current = false
            play(kickoffOpts)
        }, 0)
    }

    function kickPlaybackAfterEngineReady() {
        if (!needsPlaybackKickoff() || !hasActivePlaybackIntent() || userPausedRef.current) {
            return false
        }
        if (isMidiPlaybackRoute()) {
            if (shouldBlockMidiStartForMediaRequest('midi', requestedPlayStateRef.current)) {
                return false
            }
            if (!playMidiRef.current) {
                schedulePlaybackKickoffIfNeeded()
                return false
            }
            freshPlaybackIntentRef.current = false
            play({ fresh: true, skipNotationRefresh: true })
            return true
        }
        if (!isMediaPlaybackRoute() || isMidiFileMediaRoute()) {
            return false
        }
        if (linkedMediaPlaybackInFlightRef.current) {
            schedulePlaybackKickoffIfNeeded()
            return false
        }
        freshPlaybackIntentRef.current = false
        play({ fresh: true, skipNotationRefresh: true })
        return true
    }

    function scheduleQueueAdvanceAutoplayRetry() {
        if (queueAdvanceAutoplayRetryTimerRef.current) return
        queueAdvanceAutoplayRetryTimerRef.current = setTimeout(function() {
            queueAdvanceAutoplayRetryTimerRef.current = null
            const midiKickoffActive = !!(isMidiKickoffActiveRef.current
                && isMidiKickoffActiveRef.current())
            const keepPlaylist = shouldKeepPlaylistPlayingThroughAutoplayBlock()
            const queueAdvancing = shouldAdvanceQueueOnPlaybackEnd()
            const action = resolvePlaylistAutoplayRetryAction({
                hasActivePlaybackIntent: hasActivePlaybackIntent(),
                userPaused: userPausedRef.current,
                playbackStarted: playbackStartedRef.current,
                midiKickoffActive: midiKickoffActive,
                shouldHoldLoading: shouldHoldLoadingForPlaybackKickoff(),
                queueAdvancing: queueAdvancing,
                keepPlaylist: keepPlaylist,
                attempt: queueAdvanceAutoplayAttemptRef.current,
            })
            if (action === 'stop') {
                queueAdvanceAutoplayAttemptRef.current = 0
                return
            }
            if (action === 'wait') {
                // Notation MIDI prime/count-in can exceed the retry window; do not
                // treat that as blocked autoplay or skip to the next playlist item.
                queueAdvanceAutoplayAttemptRef.current = 0
                scheduleQueueAdvanceAutoplayRetry()
                return
            }
            if (action === 'skip' || action === 'prompt') {
                queueAdvanceAutoplayAttemptRef.current = 0
                if (action === 'skip' && trySkipTrackAfterAutoplayBlock()) {
                    return
                }
                queueAdvanceGuardUntilRef.current = 0
                externalHandoffGuardUntilRef.current = 0
                if (!playbackStartedRef.current && hasActivePlaybackIntent()) {
                    showPlaybackPrompt('autoplay')
                    setIsLoading(false)
                }
                return
            }
            queueAdvanceAutoplayAttemptRef.current += 1
            const retryOpts = (freshPlaybackIntentRef.current || needsPlaybackKickoff() || queueAdvancing || keepPlaylist)
                ? { fresh: true, skipNotationRefresh: true }
                : { preservePosition: true }
            if (retryOpts.fresh) {
                freshPlaybackIntentRef.current = false
            }
            play(retryOpts)
            scheduleQueueAdvanceAutoplayRetry()
        }, 1000)
    }

    function promptTapToPlayWhenAutoplayBlocked() {
        if (shouldSuppressTapToPlayForTransition() || shouldKeepPlaylistPlayingThroughAutoplayBlock()) {
            setTapToPlay(false)
            setIsLoading(true)
            if (!isPlaybackTransitionGuardActive()) {
                armQueueAdvanceGuard(5000)
            }
            scheduleQueueAdvanceAutoplayRetry()
            queueMicrotask(function() {
                if (playbackStartedRef.current || userPausedRef.current) return
                if (!shouldKeepPlaylistPlayingThroughAutoplayBlock()
                    && !shouldSuppressTapToPlayForTransition()) {
                    return
                }
                setTapToPlay(false)
                setIsLoading(true)
            })
            return
        }
        showPlaybackPrompt('autoplay')
    }

    function playbackEndBypassesGuards() {
        const endAt = getLinkEndAt()
        const seconds = getCurrentPlaybackSeconds()
        return shouldAllowPlaybackEndDespiteGuards({
            nativeMediaEnded: isNativeMediaElementEnded(),
            pastRegionEnd: endAt > 0 && seconds >= endAt - 0.15,
            noActiveOutput: !hasActivePlaybackOutput(),
        })
    }

    function clearDeferredRegionEndCheck() {
        if (deferredRegionEndTimerRef.current) {
            clearTimeout(deferredRegionEndTimerRef.current)
            deferredRegionEndTimerRef.current = null
        }
    }

    function scheduleDeferredRegionEndCheck(delayMs) {
        clearDeferredRegionEndCheck()
        deferredRegionEndTimerRef.current = setTimeout(function() {
            deferredRegionEndTimerRef.current = null
            if (!hasActivePlaybackIntent() || userPausedRef.current) return
            const endAt = getLinkEndAt()
            if (endAt <= 0) return
            if (getCurrentPlaybackSeconds() < endAt - 0.25) return
            if (Date.now() < regionEndGuardUntilRef.current) {
                scheduleDeferredRegionEndCheck(regionEndGuardUntilRef.current - Date.now() + 50)
                return
            }
            handlePlaybackRegionEnd()
        }, Math.max(0, delayMs || 0))
    }

    function maybeRecoverStalledRegionEnd() {
        if (!playingIntentRef.current || userPausedRef.current) return
        if (!isPlaying && !playbackStartedRef.current) return
        if (!playbackEndBypassesGuards()) return
        if (Date.now() < regionEndGuardUntilRef.current) return
        handlePlaybackRegionEnd()
    }

    function clearPlaybackEndGuardsForConfirmedStart() {
        playbackEndLatchUntilRef.current = 0
        queueAdvanceGuardUntilRef.current = 0
    }

    function shouldIgnorePlaybackEndDuringTransition() {
        if (!hasActivePlaybackIntent()) return true
        if (playbackEndBypassesGuards()) return false
        const currentSrc = getActiveMediaSrc()
        if (externalLoadedSrcRef.current && currentSrc
            && externalLoadedSrcRef.current !== currentSrc) {
            return true
        }
        if (isPlaybackTransitionGuardActive() && hasActivePlaybackIntent()) {
            return true
        }
        return false
    }

    function latchPlaybackEndHandling(ms) {
        const until = Date.now() + (ms || 5000)
        if (until > playbackEndLatchUntilRef.current) {
            playbackEndLatchUntilRef.current = until
        }
    }

    function armQueueAdvanceGuard(ms) {
        const duration = ms || 5000
        queueAdvanceGuardUntilRef.current = Date.now() + duration
        suppressRegionEndHandlers(duration)
    }

    function destroyExternalMedia() {
        suppressRegionEndHandlers(800)
        externalHandoffGuardUntilRef.current = Date.now() + 800
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
        if (playbackRouteRef.current.mode !== 'media') {
            return null
        }
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
        return !!(canUseExternalPitchTempo()
            && externalMediaRef.current
            && getExternalPlaybackDuration() > 0
            && isExternalOutputActive())
    }

    function mapNativeSecondsToExternalTimeline(seconds) {
        const nativeSeconds = Math.max(0, parseFloat(seconds) || 0)
        const trimStart = getLinkRegionStart(getActiveLink()) || 0
        return Math.max(0, nativeSeconds - trimStart)
    }

    function mapExternalSecondsToNativeTimeline(seconds) {
        const externalSeconds = Math.max(0, parseFloat(seconds) || 0)
        const trimStart = getLinkRegionStart(getActiveLink()) || 0
        return externalSeconds + trimStart
    }

    function isStemLiveOutputActive() {
        const processor = externalMediaRef.current
        return !!(processor && processor.isStemLiveOutputActive && processor.isStemLiveOutputActive())
    }

    function expectsStemLiveFilterOutput(settings) {
        if (!settings || audioFiltersAreNeutral(settings.audioFilters)) return false
        if (isStemLiveOutputActive()) return false
        return hasStemsForCurrentMedia()
    }

    function createExternalMediaProcessor() {
        return new ExternalMediaPitchTempo(
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
    }

    async function ensureStemPlaybackProcessor(src, settings) {
        if (!src || !hasStemsForCurrentMedia()) return false
        const currentTune = tuneRef.current || tune
        if (!currentTune) return false
        const linkIndex = mediaLinkNumberRef.current !== null && mediaLinkNumberRef.current !== undefined
            ? mediaLinkNumberRef.current
            : mediaLinkNumber
        const cacheOptions = getExternalMediaCacheOptions(currentTune, linkIndex)
        if (!cacheOptions) return false

        if (externalMediaRef.current && externalLoadedSrcRef.current === src) {
            await ensureProcessorStemBuffers(externalMediaRef.current, cacheOptions)
            return true
        }

        if (externalLoadingRef.current && externalLoadingSrcRef.current === src && externalLoadingPromiseRef.current) {
            const loaded = await externalLoadingPromiseRef.current
            if (loaded && externalMediaRef.current && externalLoadedSrcRef.current === src) {
                await ensureProcessorStemBuffers(externalMediaRef.current, cacheOptions)
                return true
            }
        }

        const processor = createExternalMediaProcessor()
        const duration = await processor.warmFromCachedStems(cacheOptions)
        if (!duration) {
            processor.destroy()
            return false
        }

        const resolvedSettings = settings || getMediaPlaybackSettings(currentTune)
        await processor.applySettings(
            resolvedSettings.tempo,
            resolvedSettings.pitch,
            resolvedSettings.fineTune,
            resolvedSettings.audioFilters,
            cacheOptions,
            { allowNetworkSeparation: false }
        )

        externalMediaRef.current = processor
        externalLoadedSrcRef.current = src
        setDuration(duration)
        setIsReady(true)
        applyStoredOutputDeviceToActiveRoute().catch(function() {})

        if (hasActivePlaybackIntent()) {
            const nativeNow = snapshotNativeMediaClock()
            const externalNow = mapNativeSecondsToExternalTimeline(nativeNow)
            if (duration > 0) {
                processor.seek(Math.min(1, externalNow / duration))
            }
        }
        return true
    }

    async function ensureProcessorStemBuffers(processor, cacheOptions) {
        if (!processor || !cacheOptions) return false
        if (processor.hasStemBuffers && processor.hasStemBuffers()) {
            return true
        }
        const cached = await loadCachedStemSetForMedia(cacheOptions)
        if (!cached || !cached.stemBuffers || Object.keys(cached.stemBuffers).length === 0) {
            return false
        }
        const ctx = processor.audioContext
        const normalized = normalizeStemBufferMap(cached.stemBuffers)
        const stemBuffers = {}
        Object.keys(normalized).forEach(function(stemName) {
            const buffer = normalized[stemName]
            if (buffer && ctx) {
                stemBuffers[stemName] = resampleBufferToContextRate(ctx, buffer)
            } else if (buffer) {
                stemBuffers[stemName] = buffer
            }
        })
        processor.setStemBuffers(cached.separation, stemBuffers)
        return true
    }

    async function ensureStemLivePlaybackHandoff(settings, resumeAtSeconds) {
        if (!externalMediaRef.current) return false
        if (!settings || audioFiltersAreNeutral(settings.audioFilters)) return false

        const cacheOptions = getExternalMediaCacheOptions(tuneRef.current || tune, mediaLinkNumberRef.current)
        await ensureProcessorStemBuffers(externalMediaRef.current, cacheOptions)

        await resumeExternalAudioContextFromGesture()
        await waitForExternalContextRunning(2500)

        if (externalMediaRef.current.prepareStemLiveMix) {
            externalMediaRef.current.prepareStemLiveMix(
                settings.audioFilters,
                settings.tempo,
                settings.pitch,
                settings.fineTune
            )
        }

        if (isStemLiveOutputActive()) {
            applyPlaybackVolumeToActiveRoute(playbackVolume)
            return true
        }

        const nativeResumeAt = snapshotNativeMediaClock()
        const externalResumeAt = mapNativeSecondsToExternalTimeline(nativeResumeAt)

        let connected = false
        if (externalMediaRef.current.canUseStemLivePlayback
            && externalMediaRef.current.canUseStemLivePlayback(
                settings.tempo,
                settings.pitch,
                settings.fineTune
            )
            && externalMediaRef.current.connectStemLivePlayback) {
            connected = await externalMediaRef.current.connectStemLivePlayback(externalResumeAt)
        }

        if (!connected && externalMediaRef.current.applyStemMix) {
            externalMediaRef.current.applyStemMix(
                settings.audioFilters,
                settings.tempo,
                settings.pitch,
                settings.fineTune
            )
            if (!isExternalMediaConnected()) {
                if (externalMediaRef.current.connectIfRunning) {
                    externalMediaRef.current.connectIfRunning()
                }
            }
        }

        if (!isExternalMediaConnected()) {
            return false
        }

        muteNativePlayers()
        setNativePlaybackFallbackRequired(false)
        setExternalMediaActiveState(true)
        applyPlaybackVolumeToActiveRoute(playbackVolume)
        const uiTime = getCurrentPlaybackSeconds()
        if (!isFinite(uiTime) || Math.abs(uiTime - nativeResumeAt) > 0.15) {
            setCurrentTime(nativeResumeAt)
            beginSeekHold(nativeResumeAt, 1200)
        }
        confirmPlayingStarted()
        return true
    }

    function prepareStemFilterHandoff() {
        if (!hasStemsForCurrentMedia() || !isMediaPlaybackRoute()) return
        resumeExternalAudioContextFromGesture()
        const currentTune = tuneRef.current || tune
        if (!currentTune) return
        const linkIndex = mediaLinkNumberRef.current !== null && mediaLinkNumberRef.current !== undefined
            ? mediaLinkNumberRef.current
            : mediaLinkNumber
        const src = getSrc(currentTune, linkIndex)
        if (!src) return
        const settings = getMediaPlaybackSettings(currentTune)
        ensureStemPlaybackProcessor(src, settings).catch(function() {})
    }

    function primeStemPlaybackEngine(useTune, linkIndex, src) {
        if (!hasStemsForCurrentMedia() || !src) return
        resumeExternalAudioContextFromGesture()
        const settings = getMediaPlaybackSettings(useTune || tuneRef.current || tune)
        ensureStemPlaybackProcessor(src, settings).catch(function() {})
    }

    function readExternalPlaybackSeconds() {
        if (!externalMediaRef.current) return null
        const extDuration = getExternalPlaybackDuration()
        if (extDuration <= 0) return null
        const ratio = externalMediaRef.current.getPlaybackRatio()
        if (!isFinite(ratio) || ratio < 0) return null
        return mapExternalSecondsToNativeTimeline(ratio * extDuration)
    }

    // Snapshot the live clock from whichever native engine is currently audible.
    // Used before stem handoffs and live remixes so progress is not lost when the
    // external processor takes over or rebuilds its buffer.
    function snapshotNativeMediaClock() {
        if (isStemLiveOutputActive() && externalMediaRef.current) {
            const seconds = readExternalPlaybackSeconds()
            if (seconds !== null && isFinite(seconds) && seconds >= 0) {
                setCurrentTime(seconds)
                return seconds
            }
        }
        if (isNativeFilteredActive() && filteredPlayerRef.current) {
            const t = filteredPlayerRef.current.currentTime
            if (isFinite(t) && t >= 0) {
                setCurrentTime(t)
                return t
            }
        }
        if (ytPlayerRef && ytPlayerRef.current && isYoutubePlayerReady()) {
            try {
                const t = ytPlayerRef.current.getCurrentTime()
                if (isFinite(t) && t >= 0) {
                    setCurrentTime(t)
                    return t
                }
            } catch (e) {}
        }
        if (playerRef && playerRef.current) {
            const t = playerRef.current.currentTime
            if (isFinite(t) && t >= 0) {
                setCurrentTime(t)
                return t
            }
        }
        return getCurrentPlaybackSeconds()
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
        const linkEndAt = getLinkEndAt()
        if (linkEndAt > 0 && clamped >= linkEndAt - 1) {
            scheduleDeferredRegionEndCheck(2100)
        }

        if (isSnapcastRemoteActive()) {
            const seekRemote = snapcastOutputHandlersRef.current && snapcastOutputHandlersRef.current.seekRemote
            if (seekRemote) {
                seekRemote(clamped)
                finalizeMediaSeek(wasPlaying, 'snapcast')
                return
            }
        }

        if (isCastSdkRemoteActive() && remoteOutputHandlersRef.current && remoteOutputHandlersRef.current.seekRemote) {
            remoteOutputHandlersRef.current.seekRemote(clamped)
            finalizeMediaSeek(wasPlaying, 'cast')
            return
        }

        if (isMidiFileMediaRoute()) {
            if (seekMidiFileRef.current) {
                seekMidiFileRef.current(clamped)
            }
            if (wasPlaying) {
                startProgressSync()
                if (playMidiFileRef.current) {
                    playMidiFileRef.current({ resume: true })
                }
            }
            finalizeMediaSeek(wasPlaying, 'midifile')
            return
        }

        if (isMidiPlaybackRoute()) {
            const total = resolvePlaybackDuration()
            const ratio = total > 0 ? Math.min(1, clamped / total) : 0
            if (ratio >= 0) {
            if (seekMidiRef.current) {
                seekMidiRef.current(ratio, { skipAutoResume: !wasPlaying })
            }
                setClickSeek(ratio)
            }
            if (!wasPlaying) {
                cancelPausedPlaybackSeek()
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
            const externalSeconds = mapNativeSecondsToExternalTimeline(clamped)
            const ratio = extDuration > 0 ? Math.min(1, externalSeconds / extDuration) : 0
            if (extDuration > 0 && externalMediaRef.current) {
                if (isStemLiveOutputActive()) {
                    externalMediaRef.current.seek(ratio)
                } else {
                    if (isExternalMediaConnected()) {
                        externalMediaRef.current.disconnect()
                        setExternalMediaActiveState(false)
                    }
                    externalMediaRef.current.seek(ratio)
                }
            }
            setClickSeek(ratio)
            if (wasPlaying) {
                resumeExternalAudioContextFromGesture()
                startProgressSync()
            }
            finalizeMediaSeek(wasPlaying, 'external')
            return
        }

        if (isNativeFilteredActive()) {
            if (filteredPlayerRef.current && !androidNativeActiveRef.current) {
                filteredPlayerRef.current.currentTime = clamped
            }
            if (androidNativeActiveRef.current) {
                seekAndroidNativePlayer(clamped)
            }
            setClickSeek(nativeFilteredDurationRef.current > 0
                ? Math.min(1, clamped / nativeFilteredDurationRef.current)
                : 0)
            if (wasPlaying) {
                startProgressSync()
                if (androidNativeActiveRef.current) {
                    playAndroidNativePlayer()
                } else {
                    playNativeFilteredMedia({ preservePosition: true })
                }
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

    function isRemoteOutputActive() {
        const remote = remoteOutputEngineRef.current
        return !!(remote && remote.mode && remote.connected !== false)
    }

    function isSnapcastRemoteActive() {
        return isRemoteOutputActive() && remoteOutputEngineRef.current.mode === 'snapcast'
    }

    function isCastSdkRemoteActive() {
        const remote = remoteOutputEngineRef.current
        return isRemoteOutputActive()
            && remote.mode === 'cast'
            && (remote.subMode === 'sdk' || remote.handoffInFlight)
    }

    function setRemoteOutputHandlers(handlers) {
        remoteOutputHandlersRef.current = handlers || null
    }

    function setSnapcastOutputHandlers(handlers) {
        snapcastOutputHandlersRef.current = handlers || null
    }

    function setPreferredOutputCoordinator(coordinator) {
        preferredOutputCoordinatorRef.current = coordinator || null
    }

    function captureCurrentPlaybackSnapshot(playOpts) {
        const useTune = tuneRef.current || tune
        const route = playbackRouteRef.current
        const linkIndex = getActiveMediaLinkNumber()
        const activeLink = useTune && useTune.links ? useTune.links[linkIndex] : null
        const src = route.mode === 'media' && useTune ? getSrc(useTune, linkIndex) : ''
        const srcType = route.mode === 'media' && useTune ? getSrcType(src, activeLink) : 'empty'
        const settings = getActivePlaybackSettings(useTune)
        const cachedBlobAvailable = !!(src && externalLoadedSrcRef.current === src && externalMediaRef.current)
            || !!(src && cachedNativeBlobUrlRef.current && proxiedNativeBlobSrcRef.current === src)
        return capturePlaybackSnapshot({
            tune: useTune,
            routeMode: route.mode,
            linkIndex: linkIndex,
            src: src,
            srcType: srcType,
            isMidiFileMediaRoute: isMidiFileMediaRoute(),
            needsExternalProcessing: playbackNeedsExternalProcessing(settings),
            canUseNativeFiltered: prefersNativeMediaPlayback()
                && canUseNativeFilteredPlayback(settings),
            cachedBlobAvailable: cachedBlobAvailable,
            remoteOutputActive: isSnapcastRemoteActive() || isCastSdkRemoteActive(),
            androidYoutubeNative: prefersNativeMediaPlayback()
                && shouldUseAndroidNativeYoutubeOutput(settings),
            mediaResolverAvailable: !!(mediaResolverStatus && mediaResolverStatus.activeBase),
            userPaused: userPausedRef.current,
            snapcastRemoteActive: isSnapcastRemoteActive(),
            castRemoteActive: isCastSdkRemoteActive(),
            isPlaying: isPlaying,
            hasActiveOutput: hasActivePlaybackOutput(),
            prefersNative: prefersNativeMediaPlayback(),
            playOpts: playOpts || {},
        })
    }

    function tryPreferredSnapcastDefaultRoute(opts, continueLocalPlay) {
        if (isSnapcastRemoteActive() || isCastSdkRemoteActive()) {
            return
        }
        const routeSnapshot = captureCurrentPlaybackSnapshot(opts)
        if (isRouterEnforcedForPath(ROUTER_ENFORCE_KEYS.snapcastDefault)
            && !shouldAttemptSnapcastDefault(routeSnapshot)) {
            continueLocalPlay()
            return
        }
        const coord = preferredOutputCoordinatorRef.current
        if (!coord || !coord.isSnapcastDefault || !coord.isSnapcastDefault()) {
            continueLocalPlay()
            return
        }
        playingIntentRef.current = true
        setPlayCancelled(false)
        setIsLoading(true)
        coord.tryRouteOnPlay({ playOpts: opts }).then(function(routed) {
            recordPlaybackRouteParity({
                phase: PLAYBACK_ROUTE_PHASE.postSnapcastAttempt,
                snapshot: routeSnapshot,
                snapcastAttempted: true,
                branch: routed === true ? 'snapcast-default' : 'snapcast-fallback-local',
            })
            if (routed === true) {
                userPausedRef.current = false
                setIsPlaying(true)
                setIsLoading(false)
                confirmPlayingStarted()
                return
            }
            if (routed === false) {
                if (!hasActivePlaybackIntent()) {
                    setIsLoading(false)
                    return
                }
                continueLocalPlay()
                return
            }
            playingIntentRef.current = false
            setIsLoading(false)
        })
    }

    function muteLocalOutputsForRemote() {
        muteNativePlayers()
        cleanupTimers()
        stopProgressSync()
        stopMidiPlayback()
        stopMidiFilePlayback()
        if (externalMediaRef.current) {
            destroyExternalMedia()
        } else {
            silencePlaybackOutputs()
        }
        clearCachedNativePlaybackUrl()
        setNativePlaybackSrcOverride(null)
        proxiedNativeBlobSrcRef.current = null
        if (playerRef && playerRef.current) {
            try {
                playerRef.current.pause()
                playerRef.current.muted = true
            } catch (e) {}
        }
        if (filteredPlayerRef && filteredPlayerRef.current) {
            try {
                filteredPlayerRef.current.pause()
                filteredPlayerRef.current.muted = true
            } catch (e) {}
        }
        pauseYoutubeOutputOnly()
        setIsPlaying(false)
    }

    function usesNativeElementRemoteHandoff() {
        const remote = remoteOutputEngineRef.current
        if (!isRemoteOutputActive() || !remote) return false
        if (remote.mode === 'airplay') return true
        if (remote.subMode === 'remotePlayback' || remote.subMode === 'airplay') return true
        return false
    }

    // Anything else (e.g. a muted native element while external processing is
    // active) is ignored so it cannot corrupt the position.
    function getActivePlaybackEngine() {
        if (isRemoteOutputActive() && !usesNativeElementRemoteHandoff()) {
            return remoteOutputEngineRef.current.mode === 'cast' ? 'cast' : 'snapcast'
        }
        if (playbackRouteRef.current.mode === 'midi' && isAndroidNativeOutputActive()) {
            return 'nativeMidi'
        }
        if (playbackRouteRef.current.mode === 'midi') return 'midi'
        if (isMidiFileMediaRoute()) return 'midifile'
        if (isNativeFilteredActive()) return 'nativeFiltered'
        if (shouldRouteMediaThroughExternal()) {
            return isExternalOutputActive() ? 'external' : 'pending'
        }
        if (isExternalMediaConnected() && externalMediaRef.current && getExternalPlaybackDuration() > 0) {
            return 'external'
        }
        const cachedBlobActive = !!(cachedNativeBlobUrlRef.current || nativePlaybackSrcOverride)
        if (cachedBlobActive && playerRef && playerRef.current) return 'audio'
        if (ytPlayerRef && ytPlayerRef.current && isYoutubePlayerReady()
            && !cachedBlobActive && !shouldSuppressYoutubeEmbed()) {
            return 'youtube'
        }
        if (playerRef && playerRef.current) return 'audio'
        return 'none'
    }

    // Live clock reading from whichever engine is active. Returns null when the
    // active engine has no usable reading yet (caller falls back to stored).
    function readActiveEngineSeconds() {
        const engine = getActivePlaybackEngine()
        if (engine === 'snapcast' || engine === 'cast') {
            const remote = remoteOutputEngineRef.current
            if (remote && isFinite(remote.currentTime)) {
                return remote.currentTime
            }
            return null
        }
        if (engine === 'midi') {
            return getMidiPlaybackSecondsRef.current ? getMidiPlaybackSecondsRef.current() : null
        }
        if (engine === 'nativeMidi') {
            return currentTimeRef.current
        }
        if (engine === 'midifile') {
            return getMidiFilePlaybackSecondsRef.current ? getMidiFilePlaybackSecondsRef.current() : null
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
        if (isAndroidNativeOutputActive()) {
            startProgressSync()
            setIsPlaying(true)
            confirmPlayingStarted()
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
            if (shouldBlockWebViewAudioPlay(getAndroidPlaybackGateContext(), 'resumeOutputAfterSeek')) {
                return
            }
            try {
                if (playerRef.current.paused) {
                    playerRef.current.play().then(function() {
                        confirmPlayingStarted()
                    }).catch(function(e) {
                        if (isAutoplayBlockedError(e)) promptTapToPlayWhenAutoplayBlocked()
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
        notationPlaybackSeekRef.current = null
        notationPlaybackStartSecondsRef.current = null
        pendingMidiPlayRef.current = null
        if (stopMetronomeRef.current) {
            stopMetronomeRef.current()
        }
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
        if (isAndroidNativeOutputActive()) {
            return
        }
        if (externalMediaRef.current) {
            if (!isExternalMediaConnected()) {
                playExternalMedia()
            }
            return
        }
        const src = getSrc(tune, mediaLinkNumber)
        const srcType = toNativePlayerSrcType(getSrcType(src))
        if (srcType === 'audio' && playerRef && playerRef.current) {
            if (shouldBlockWebViewAudioPlay(getAndroidPlaybackGateContext(), 'loopCurrentRegion')) {
                return
            }
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
        freshPlaybackIntentRef.current = false
        playbackStartedRef.current = false
        setIsPlaying(false)
        setIsLoading(false)
        cleanupTimers()
        stopPlaybackKeepAlive()
        const startAt = getLinkStartAt()
        if (isMidiFileMediaRoute()) {
            if (stopMidiFileRef.current) {
                try { stopMidiFileRef.current() } catch (e) {}
            }
            if (seekMidiFileRef.current) {
                try { seekMidiFileRef.current(startAt) } catch (e) {}
            }
            setCurrentTime(startAt)
            currentTimeRef.current = startAt
            const total = resolvePlaybackDuration()
            if (total > 0) setClickSeek(Math.min(1, startAt / total))
            else setClickSeek(0)
            return
        }
        if (isMidiPlaybackRoute()) {
            latchMidiPrimeQuiet(3000)
            if (invalidatePendingMidiStartsRef.current) {
                invalidatePendingMidiStartsRef.current()
            }
            if (pauseSynthRef.current) {
                try { pauseSynthRef.current() } catch (e) {}
            }
            if (stopMetronomeRef.current) {
                try { stopMetronomeRef.current() } catch (e) {}
            }
            const midiTotal = resolvePlaybackDuration()
            const midiRatio = midiTotal > 0 ? startAt / midiTotal : 0
            if (seekMidiRef.current) {
                try { seekMidiRef.current(midiRatio, { skipAutoResume: true }) } catch (e) {}
            }
            setCurrentTime(startAt)
            currentTimeRef.current = startAt
            if (midiTotal > 0) setClickSeek(Math.min(1, startAt / midiTotal))
            else setClickSeek(0)
            return
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
        if (getLinkPlaybackLoop() && !shouldPreferQueueAdvanceOverLinkLoop()) {
            suppressRegionEndHandlers()
            loopCurrentRegion()
            return true
        }
        if (shouldPreferQueueAdvanceOverLinkLoop()) {
            suppressRegionEndHandlers(5000)
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

    function resolveProcessedMediaExportContext(linkIndex, options) {
        const opts = options || {}
        const currentTune = opts.tune || tuneRef.current || tune
        if (!currentTune) {
            return null
        }
        const cacheOptions = getExternalMediaCacheOptions(
            currentTune,
            linkIndex !== undefined && linkIndex !== null ? linkIndex : null
        )
        if (!cacheOptions) {
            return null
        }
        return {
            tune: currentTune,
            linkIndex: cacheOptions.linkIndex,
            cacheOptions: cacheOptions,
            srcType: cacheOptions.srcType,
        }
    }

    function getProcessedMediaExportFilename(linkIndex, options) {
        const ctx = resolveProcessedMediaExportContext(linkIndex, options)
        if (!ctx) return null
        return buildTuneMediaExportFilename(ctx.tune, ctx.linkIndex, { processed: true })
    }

    async function buildProcessedMediaExport(linkIndex, options) {
        const ctx = resolveProcessedMediaExportContext(linkIndex, options)
        if (!ctx) {
            throw new Error('No media link available')
        }
        if (ctx.srcType === 'abc') {
            throw new Error('Nothing to download for ABC playback')
        }
        const cached = await loadCachedStemSetForMedia(ctx.cacheOptions)
        const hasCachedStems = !!(cached && (
            cached.stemBuffers
            || (cached.separation && cached.separation.stems)
        ))
        if (!hasCachedStems && !hasStemsForCurrentMedia()) {
            throw new Error('Analyse stems before downloading processed audio')
        }
        if (mediaLinkNumber === null || mediaLinkNumber === undefined) {
            setMediaLinkNumber(ctx.linkIndex)
            mediaLinkNumberRef.current = ctx.linkIndex
        }
        const settings = getMediaPlaybackSettings(ctx.tune)
        const { buildTuneMediaExportBlob, buildTuneMediaExportFilename } = await import('./mediaExportUtils')
        const { getAudioCompressExtension } = await import('./audioCompressSettings')
        const filename = buildTuneMediaExportFilename(ctx.tune, ctx.linkIndex, { processed: true })
        const result = await buildTuneMediaExportBlob({
            tune: ctx.tune,
            linkIndex: ctx.linkIndex,
            srcType: ctx.srcType,
            filename: filename,
            youtubeGetId: props.tunebook.utils.YouTubeGetID,
            accessToken: getGoogleAccessToken(),
            demucsModel: getDemucsModel(),
            settings: settings,
            trim: true,
            preferStemMix: true,
            allowNetworkSeparation: true,
        })
        const extension = getAudioCompressExtension(result.audioFormat)
        const resolvedFilename = String(filename).replace(/\.[^.]+$/, '') + '.' + extension
        return {
            blob: result.blob,
            filename: resolvedFilename,
            audioFormat: result.audioFormat,
        }
    }

    async function saveProcessedMediaToFile(linkIndex, options) {
        const { createReadyDownload } = await import('./offerBlobDownload')
        const exportResult = await buildProcessedMediaExport(linkIndex, options)
        return createReadyDownload(exportResult.blob, exportResult.filename)
    }

    function unmuteNativePlayers() {
        if (prefersNativeMediaPlayback()) {
            return
        }
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
        if (!isYoutubePlayerDomAttached()) return
        if (ytPlayerRef && ytPlayerRef.current) {
            try {
                ytPlayerRef.current.pauseVideo()
            } catch (e) {}
            try {
                ytPlayerRef.current.mute()
            } catch (e) {}
        }
    }

    function pauseNativeOutputsOnly() {
        cancelYoutubePlayPoll()
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
        const playingId = tuneRef.current && tuneRef.current.id ? tuneRef.current.id : null
        return shouldAdvancePlaybackOnEnd(
            nowPlayingQueueRef.current,
            props.setNowPlayingQueue,
            playingId
        )
    }

    function shouldPreferQueueAdvanceOverLinkLoop() {
        return shouldAdvanceQueueOnPlaybackEnd()
    }

  /** Skip post-end seek-to-zero when the playlist will advance to the next item. */
    function shouldSuppressPlaybackEndSeek() {
        return shouldAdvanceQueueOnPlaybackEnd()
            || isPlaybackTransitionGuardActive()
    }

    function isNativeMediaElementEnded() {
        const el = playerRef && playerRef.current
        return !!(el && el.ended)
    }

    function shouldBlockNativeResumeAfterEnd() {
        if (shouldSuppressPlaybackEndSeek()) return true
        if (isNativeMediaElementEnded()) return true
        return false
    }

    function consumeStopAfterCurrent() {
        const queue = nowPlayingQueueRef.current
        if (!isQueueActive(queue) || !queue.stopAfterCurrent || !props.setNowPlayingQueue) return
        props.setNowPlayingQueue(endStopAfterCurrent(queue))
    }

    function handleMediaPlaybackCompleted() {
        if (shouldIgnorePlaybackEndForManualSkip()) {
            const seconds = getCurrentPlaybackSeconds()
            if (!playbackStartedRef.current || seconds < 0.4) {
                return
            }
        }
        if (Date.now() < playbackEndLatchUntilRef.current && !playbackEndBypassesGuards()) {
            return
        }
        cleanupTimers()
        // Repeat-one / auto-advance must run even while a queue-advance guard is
        // still armed from play start — otherwise MIDI ends with isPlaying stuck
        // true, no audio, and a frozen progress bar.
        if (shouldIgnorePlaybackEndDuringTransition()
            && !shouldAdvanceQueueOnPlaybackEnd()) {
            return
        }
        latchPlaybackEndHandling(500)
        if (practiceSessionHandlerRef.current) {
            practiceSessionHandlerRef.current()
            return
        }
        if (notationMidiOwner) {
            playingIntentRef.current = false
            playbackStartedRef.current = false
            userGesturePlayRef.current = false
            setIsPlaying(false)
            setIsLoading(false)
            stopPlaybackKeepAlive()
            updateMediaSessionState()
            return
        }
        if (shouldAdvanceQueueOnPlaybackEnd()) {
            latchPlaybackEndHandling(8000)
            armQueueAdvanceGuard(5000)
            playbackClockTuneIdRef.current = null
            playbackStartedRef.current = false
            setIsPlaying(false)
            suppressRegionEndHandlers(5000)
            // Hold loading across the async queue step so ended-track pause events
            // cannot clear the UI before armPlaybackIntent runs on the next item.
            setIsLoading(true)
            startPlaybackKeepAlive()
            updateMediaSessionState()
            advanceQueueOnPlaybackEnd()
            return
        }
        consumeStopAfterCurrent()
        latchPlaybackEndHandling(2000)
        pauseAtRegionStart()
        updateMediaSessionState()
    }

    function resumeMediaOutputSync(mediaKind) {
        if (!seekWasPlayingRef.current || userPausedRef.current) return
        playingIntentRef.current = true

        if (isAndroidNativeOutputActive()) {
            confirmPlayingStarted()
            return
        }

        if (mediaKind === 'youtube') {
            if (!isYoutubePlayerReady() || isExternalOutputActive()) return
            try {
                ytPlayerRef.current.playVideo()
                confirmPlayingStarted()
            } catch (e) {}
            return
        }

        if (mediaKind === 'audio' && playerRef && playerRef.current) {
            if (shouldBlockWebViewAudioPlay(getAndroidPlaybackGateContext(), 'resumeMediaOutputSync')) {
                return
            }
            try {
                if (playerRef.current.paused) {
                    const playPromise = playerRef.current.play()
                    if (playPromise && playPromise.then) {
                        playPromise.then(function() {
                            confirmPlayingStarted()
                        }).catch(function(e) {
                            if (isAutoplayBlockedError(e)) promptTapToPlayWhenAutoplayBlocked()
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
            if (isStemLiveOutputActive()) {
                confirmPlayingStarted()
                return
            }
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
                // A paused/stopped seek has no auto-resume to protect. Leaving
                // the guard armed makes the next play() (and the synth's
                // beginMidiPlayback) silently bail for 3s, stranding the UI
                // on the loading spinner.
                seekGuardUntilRef.current = 0
                seekWasPlayingRef.current = false
            }, 0)
            return
        }
        function resumeAfterSeek() {
            endSeekOperation()
            if (mediaKind === 'external' && (isExternalMediaConnected() || isStemLiveOutputActive())) {
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
            if (mediaKind === 'external' && (isExternalMediaConnected() || isStemLiveOutputActive())) {
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
        freshPlaybackIntentRef.current = false
        userGesturePlayRef.current = false
        youtubeAutoplayAttemptRef.current = 0
        clearYoutubeAutostartWatchdog()
        if (midiEngineWaitTimeoutRef.current) {
            clearTimeout(midiEngineWaitTimeoutRef.current)
            midiEngineWaitTimeoutRef.current = null
        }
        setTapToPlay(false)
        clearQueueAdvanceAutoplayRetry()
        clearPlaybackKickoffTimer()
        clearDeferredRegionEndCheck()
        queueAdvanceAutoplayAttemptRef.current = 0
        queuePlaybackErrorRetryRef.current = false
        clearPlaylistStall()
        clearPlaybackEndGuardsForConfirmedStart()
        noteManualPlaylistSkipPlaybackStarted()
        autoplayBlockSkipCountRef.current = 0
        if (!intentShouldConfirmPlayingStarted(getIntentSnapshot())) {
            setIsLoading(false)
            return
        }
        playbackStartedRef.current = true
        playbackKickoffNeededRef.current = false
        pendingMidiPlayRef.current = null
        clearAutoplayRecoveryGuard()
        setIsPlaying(true)
        setIsLoading(false)
        if (!isExternalOutputActive()) {
            setNativePlaybackFallbackRequired(false)
        }
        if (prefersNativeMediaPlayback()) {
            stopPlaybackKeepAlive()
        } else {
            startPlaybackKeepAlive()
        }
        startProgressSync()
        ensureYoutubeProgressPolling()
        updateMediaSessionState()
        maybePrefetchNextQueueTrack(false)
        confirmQueuedPlaylistTrackAnnouncement(tuneRef.current)
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
                        index === delays.length - 1,
                        playlistAutoplayKeepPlayingFlags()
                    )) {
                        promptTapToPlayWhenAutoplayBlocked()
                        setIsLoading(false)
                    }
                } catch (e) {}
            }, delay)
        })
    }

    function clearAutoplayRecoveryGuard() {
        autoplayRecoveryGuardUntilRef.current = 0
    }

    function abortPlayingIntent() {
        playingIntentRef.current = false
        playbackStartedRef.current = false
        userGesturePlayRef.current = false
        pendingPlaybackAfterLoginRef.current = null
        clearAutoplayRecoveryGuard()
        clearQueueAdvanceAutoplayRetry()
        clearPlaybackKickoffTimer()
        pendingMidiPlayRef.current = null
        notationPlaybackStartSecondsRef.current = null
        notationPlaybackSeekRef.current = null
        pendingMidiFilePlayRef.current = null
        pendingPlayRequestRef.current = null
        playbackKickoffNeededRef.current = false
        setRequestedPlayState(null)
        clearYoutubeAutostartWatchdog()
        setIsPlaying(false)
        setIsLoading(false)
        cancelPlaylistTitleAnnouncement()
        silencePlaybackOutputs()
        stopPlaybackKeepAlive()
        updateMediaSessionState()
    }

    /** Drop play intent without destroying the primed MIDI buffer (natural end). */
    function disarmPlaybackIntent() {
        playingIntentRef.current = false
        playbackStartedRef.current = false
        userGesturePlayRef.current = false
        freshPlaybackIntentRef.current = false
        pendingMidiPlayRef.current = null
        pendingPlayRequestRef.current = null
        playbackKickoffNeededRef.current = false
        stopProgressSync()
    }

    function armPlaybackIntent(options) {
        const opts = options || {}
        userPausedRef.current = false
        playingIntentRef.current = true
        playbackStartedRef.current = false
        userGesturePlayRef.current = !!opts.fromUserGesture
        if (opts.fromUserGesture) {
            resumeSynthAudioContextFromGesture()
            resumeExternalAudioContextFromGesture()
        }
        youtubeAutoplayAttemptRef.current = 0
        freshPlaybackIntentRef.current = !!opts.fresh
        playbackKickoffNeededRef.current = true
        setPlayCancelled(false)
        setTapToPlay(false)
        setIsPlaying(false)
        if (opts.fresh) {
            armQueueAdvanceGuard(5000)
            const startAt = getLinkStartAt()
            currentTimeRef.current = startAt
            setCurrentTime(startAt)
            setClickSeek(0)
            schedulePlaybackKickoffIfNeeded()
            scheduleQueueAdvanceAutoplayRetry()
        }
        if (opts.showLoading !== false) {
            setIsLoading(true)
        }
        // Keep the OS media session in the "playing" state across track changes so
        // mobile browsers allow the next element to autoplay with the screen off.
        startPlaybackKeepAlive()
        updateMediaSessionState()
    }

    function isYoutubeDetachedError(err) {
        return isYoutubeDetachedPlayerError(err)
    }

    function pausePlaybackForAdministrativeRoute() {
        if (!isPlaybackAdministrativePath(getAppPathname())) return false
        pausePlaylistForStall()
        return true
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
        resumeMidiFileAudioContextFromGesture()
    }

    var notationPlayRetryTimerRef = useRef(null)
    
    function clearNotationPlayRetry() {
        if (notationPlayRetryTimerRef.current) {
            clearTimeout(notationPlayRetryTimerRef.current)
            notationPlayRetryTimerRef.current = null
        }
    }

    function scheduleNotationMidiInvoke(options) {
        const opts = options || {}
        function run() {
            if (opts.invoke && opts.invoke()) {
                return
            }
            if (opts.onRetry) {
                opts.onRetry()
            }
        }
        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(function() {
                setTimeout(run, 0)
            })
            return
        }
        setTimeout(run, 0)
    }

    function stopNotationMidiPlayback(options) {
        const opts = options || {}
        clearNotationPlayRetry()
        setNotationMidiOwner(false)
        playingIntentRef.current = false
        playbackStartedRef.current = false
        userPausedRef.current = false
        userGesturePlayRef.current = false
        freshPlaybackIntentRef.current = false
        pendingMidiPlayRef.current = null
        notationPlaybackSeekRef.current = null
        notationPlaybackStartSecondsRef.current = null
        setPlayCancelled(false)
        setIsPlaying(false)
        setIsLoading(false)
        setRequestedPlayState(null)
        stopProgressSync()
        stopPlaybackKeepAlive()
        updateMediaSessionState()
        const controlRef = opts.playbackControlRef
        if (controlRef && controlRef.current && controlRef.current.stop) {
            controlRef.current.stop()
        } else if (pauseSynthRef.current) {
            pauseSynthRef.current()
        }
        if (notationStaffCursorRef.current) {
            notationStaffCursorRef.current()
        }
    }

    /**
     * Start MIDI playback from the notation editor. Unlocks audio in the click
     * handler, commits the MIDI route, then retries until the Abc synth engine
     * has registered playMidiRef (same pattern as practice-session playback).
     */
    function startNotationMidiPlayback(options) {
        const opts = options || {}
        clearNotationPlayRetry()
        setNotationMidiOwner(true)
        userGesturePlayRef.current = true
        youtubeAutoplayAttemptRef.current = 0
        setTapToPlay(false)
        setPlayCancelled(false)
        resumeSynthAudioContextFromGesture()

        setRequestedPlayState('playMidi')
        userPausedRef.current = false
        playingIntentRef.current = true
        freshPlaybackIntentRef.current = true
        playbackStartedRef.current = false
        setIsLoading(true)

        setMediaLinkNumber(null)
        if (opts.tune) {
            const currentId = tune && tune.id
            if (!currentId || currentId !== opts.tune.id) {
                setTune(opts.tune)
            }
        }
        const controlRef = opts.playbackControlRef
        if (controlRef && controlRef.current && controlRef.current.getAudioContext) {
            const ctx = controlRef.current.getAudioContext()
            if (ctx && ctx.state === 'suspended') {
                try { ctx.resume() } catch (e) {}
            }
        }

        const beat = typeof opts.startBeat === 'number' ? opts.startBeat : 0
        const endBeat = typeof opts.endBeat === 'number' ? opts.endBeat : null
        const tempo = opts.tempo > 0 ? parseFloat(opts.tempo) : 120
        const startMs = typeof opts.startMs === 'number' && opts.startMs >= 0 ? opts.startMs : null
        const fromStart = !!opts.fromStart
        notationPlaybackStartSecondsRef.current = null
        notationPlaybackSeekRef.current = (!fromStart && (beat > 0 || startMs != null || endBeat != null))
            ? { startBeat: beat, endBeat: endBeat, tempo: tempo, startMs: startMs }
            : null
        if (fromStart || (beat <= 0 && startMs == null)) {
            currentTimeRef.current = 0
            setCurrentTime(0)
            setClickSeek(0)
            if (armPlaybackFromZeroRef.current) {
                try { armPlaybackFromZeroRef.current() } catch (e) {}
            }
        }

        const midiOpts = {
            fresh: true,
            restart: true,
            fromStart: fromStart,
            skipNotationRefresh: true,
            alwaysFromSelection: !fromStart && !!opts.alwaysFromSelection,
            preservePosition: false,
            startBeat: (!fromStart && beat > 0) ? beat : undefined,
            endBeat: (!fromStart && endBeat != null) ? endBeat : undefined,
            startMs: (!fromStart && startMs != null) ? startMs : undefined,
            tempo: tempo,
            fromNotationSelection: !fromStart && (beat > 0 || startMs != null || endBeat != null || !!opts.alwaysFromSelection),
        }
        pendingMidiPlayRef.current = midiOpts

        function invokeNotationMidiPlayback() {
            const controlRef = opts.playbackControlRef
            if (controlRef && controlRef.current && controlRef.current.play) {
                if (controlRef.current.play(midiOpts)) {
                    return true
                }
            }
            if (playMidiRef.current && playMidiRef.current(midiOpts) !== false) {
                return true
            }
            return false
        }

        function tryMidi(attempt) {
            if (invokeNotationMidiPlayback()) {
                return
            }
            pendingMidiPlayRef.current = midiOpts
            const maxAttempts = opts.midiOnly ? 80 : 40
            if (attempt < maxAttempts) {
                notationPlayRetryTimerRef.current = setTimeout(function() {
                    notationPlayRetryTimerRef.current = null
                    tryMidi(attempt + 1)
                }, 50)
                return
            }
            // Play-along must stay on ABC MIDI. Falling through to play() waits
            // on linked media and leaves the toolbar spinner stuck.
            if (opts.midiOnly) {
                setIsLoading(false)
                return
            }
            play(midiOpts)
        }

        if (!invokeNotationMidiPlayback()) {
            tryMidi(0)
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

    useEffect(function() {
        setResolverLoginToastBeforeLogin(preparePlaybackGestureForLogin)
        return function() {
            setResolverLoginToastBeforeLogin(null)
        }
    })

    useEffect(function() {
        if (!pendingPlaybackAfterLoginRef.current) return
        const accessToken = props.token && props.token.access_token
            ? props.token.access_token
            : null
        if (!accessToken) return
        if (!mediaResolverChecked) return
        const warning = getResolverLoginWarning(mediaResolverStatus, accessToken)
        if (warning) {
            if (!warning.showLoginButton) {
                pendingPlaybackAfterLoginRef.current = null
            }
            return
        }
        pendingPlaybackAfterLoginRef.current = null
        playFromUserGesture({ fresh: true })
    }, [props.token, mediaResolverStatus, mediaResolverChecked])

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

    // Unlock audio inside a click without pausing the current element, so
    // playlist next can start the next track without an autoplay prompt.
    function unlockAudioFromUserGesture() {
        userPausedRef.current = false
        playingIntentRef.current = true
        userGesturePlayRef.current = true
        setPlayCancelled(false)
        setTapToPlay(false)
        resumeSynthAudioContextFromGesture()
        resumeExternalAudioContextFromGesture()
        startPlaybackKeepAlive()
        updateMediaSessionState()
    }

    // Arm playback inside a click handler when the play route is about to mount.
    // Unlocks audio contexts and records intent, but does not call play() yet —
    // players are not mounted on pages like /books, and calling play() there
    // leaves isLoading stuck on the waiting spinner.
    function preparePlaybackFromUserGesture(options) {
        const opts = options || {}
        const armIntent = opts.armIntent !== false
        stopStandaloneMediaPlayback().catch(function() {})
        userGesturePlayRef.current = true
        if (armIntent) {
            userPausedRef.current = false
            playingIntentRef.current = true
            playbackStartedRef.current = false
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
        }
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

    function hasPendingPlayRequest() {
        return !!pendingPlayRequestRef.current
    }

    function isPlaybackEngineReadyForPending(pending) {
        if (!pending) return false
        const route = playbackRouteRef.current
        if (pending.playState === 'playMidi') {
            return route.mode === 'midi'
        }
        if (pending.playState !== 'playMedia' || route.mode !== 'media') {
            return false
        }
        const useTune = tuneRef.current || tune
        const linkIndex = pending.linkNum != null ? pending.linkNum : getActiveMediaLinkNumber()
        const activeLink = useTune && useTune.links ? useTune.links[linkIndex] : null
        const src = getSrc(useTune, linkIndex)
        const srcType = getSrcType(src, activeLink)
        if (srcType === 'midifile') {
            return !!(prepareMidiFileLinkRef.current && playMidiFileRef.current)
        }
        return true
    }

    function consumePendingPlayRequest(tuneId, playState, linkNum) {
        const pending = pendingPlayRequestRef.current
        if (!pendingRequestMatchesRoute(pending, tuneId, playState, linkNum)) {
            return false
        }
        if (!isPlaybackEngineReadyForPending(pending)) {
            return false
        }
        pendingPlayRequestRef.current = null

        const playOpts = {}
        if (pending.restart) {
            playOpts.restart = true
            playOpts.fresh = true
        } else if (pending.fresh) {
            playOpts.fresh = true
        }
        play(playOpts)
        return true
    }

    function flushPendingPlayRequest() {
        const pending = pendingPlayRequestRef.current
        if (!pending) return false
        if (!routeMatchesPendingRequest(pending, getPendingRouteSnapshot())) {
            return false
        }
        const linkNum = pending.playState === 'playMedia' ? pending.linkNum : null
        return consumePendingPlayRequest(pending.tuneId, pending.playState, linkNum)
    }

    function requestPlayback(options) {
        const opts = options || {}
        const tuneId = opts.tuneId
        const playState = opts.playState
        if (!tuneId || !playState) return false

        userPausedRef.current = false
        playingIntentRef.current = true
        playbackStartedRef.current = false
        seekGuardUntilRef.current = 0
        seekWasPlayingRef.current = false
        seekInProgressRef.current = false
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
        playbackKickoffNeededRef.current = true

        setIsLoading(true)

        return flushPendingPlayRequest()
    }

    async function resumeAudioContextAndPlay() {
        setTapToPlay(false)
        setPlayCancelled(false)
        userGesturePlayRef.current = true
        userPausedRef.current = false
        playingIntentRef.current = true
        playbackStartedRef.current = false
        youtubeAutoplayAttemptRef.current = 0
        resumeSynthAudioContextFromGesture()
        resumeExternalAudioContextFromGesture()
        if (stopMetronomeRef.current) {
            stopMetronomeRef.current()
        }
        clearMidiEngineRegistrationFallback()
        const route = playbackRouteRef.current
        if (route.mode === 'midi') {
            playFromUserGesture({ fresh: true })
            return
        }
        if (isMidiFileMediaRoute()) {
            playFromUserGesture({ preservePosition: true, userResume: true })
            return
        }
        play({ restart: false, preservePosition: true, userResume: true })
    }

    function reportNotationPrimeFailure() {
        setIsLoading(false)
        setIsPlaying(false)
        if (Date.now() < midiPrimeQuietUntilRef.current) {
            return
        }
        const getCtx = getSynthAudioContextRef && getSynthAudioContextRef.current
        const ctx = getCtx ? getCtx() : null
        if (ctx && (ctx.state === 'suspended' || ctx.state === 'interrupted')) {
            setTapToPlay(true)
            return
        }
        if (hasActivePlaybackIntent()) {
            toast.error('Could not load notation playback')
        }
    }

    function latchMidiPrimeQuiet(ms) {
        midiPrimeQuietUntilRef.current = Date.now() + (ms > 0 ? ms : 2500)
    }

    function muteNativePlayers() {
        suppressNativePlaybackEventsRef.current = true
        nativePlaybackEventSuppressUntilRef.current = Date.now() + 800
        ytIframeEventSuppressUntilRef.current = Date.now() + 800
        if (prefersNativeMediaPlayback()) {
            hardSilenceWebViewOutputs(getAndroidPlaybackGateContext())
        } else {
            pauseNativeOutputsOnly()
        }
        setTimeout(function() {
            suppressNativePlaybackEventsRef.current = false
        }, 800)
    }

    function shouldSuppressYoutubeIframeEvent() {
        return shouldIgnoreYoutubeIframeEvents()
            || Date.now() < ytIframeEventSuppressUntilRef.current
    }

    function recoverNativePlaybackAfterFailedPitchHandoff(settings, srcType, resumeAt) {
        setExternalMediaActiveState(false)
        if (prefersNativeMediaPlayback()) {
            if (canUseNativeFilteredPlayback(settings)) {
                applyNativeFilteredPlayback(settings, {
                    play: true,
                    resumeAt: resumeAt,
                    forcePlay: true,
                })
            } else {
                skipBackgroundIncapableTrack('android-pitch-handoff-failed')
            }
            return
        }
        unmuteNativePlayers()
        if (!playingIntentRef.current || userPausedRef.current) {
            return
        }
        const resumeSeconds = resumeAt != null && isFinite(parseFloat(resumeAt))
            ? Math.max(0, parseFloat(resumeAt))
            : getCurrentPlaybackSeconds()
        playNativeMedia(srcType, { preservePosition: true, userResume: true })
        applyNativeMediaPlaybackSettings(settings.tempo)
        if (resumeSeconds > 0) {
            seekToSeconds(resumeSeconds)
        }
    }

    async function handleFailedPitchHandoff(settings, srcType, resumeAt) {
        if (!externalMediaRef.current) {
            recoverNativePlaybackAfterFailedPitchHandoff(settings, srcType, resumeAt)
            const loadError = lastExternalMediaLoadErrorRef.current
            const loadDetail = loadError && loadError.message ? String(loadError.message).trim() : ''
            let message = 'Pitch shift needs downloaded audio. Check your media resolver or TuneBook Helper extension.'
            if (srcType === 'recording') {
                message = loadDetail
                    ? 'Pitch shift could not load your recording: ' + loadDetail
                    : 'Pitch shift could not load your recording. Try playing the link once, then adjust pitch again.'
            } else if (srcType === 'youtube' && loadDetail) {
                message = 'YouTube pitch shift failed: ' + loadDetail
            } else if (loadDetail) {
                message = 'Pitch shift download failed: ' + loadDetail
            }
            notifyPitchShiftApplyFailed(message)
            return
        }
        let handoff = await trySyncExternalHandoff({
            resumeAt: resumeAt,
            awaitConnect: true,
            settings: settings,
        })
        if (!handoff.ok && handoff.reason === 'context-not-running') {
            const running = await waitForExternalContextRunning(2500)
            if (running && hasActivePlaybackIntent()) {
                handoff = await trySyncExternalHandoff({
                    resumeAt: resumeAt,
                    awaitConnect: true,
                    settings: settings,
                })
            }
        }
        if (handoff.ok) {
            applyPlaybackVolumeToActiveRoute(playbackVolume)
            confirmPlayingStarted()
            return
        }
        unmuteNativePlayers()
        if (playingIntentRef.current && !userPausedRef.current) {
            setTapToPlay(true)
            notifyPitchShiftApplyFailed(
                'Pitch shift could not switch to processed audio. Tap play to try again.'
            )
        } else {
            notifyPitchShiftApplyFailed()
        }
    }

    function applyNativeTempoBridge(settings) {
        if (settings.pitch === 0 && settings.fineTune === 0) {
            applyNativeMediaPlaybackSettings(settings.tempo)
        }
    }

    async function trySyncExternalHandoff(options) {
        const opts = options || {}
        if (!externalMediaRef.current) {
            return { ok: false, reason: 'no-processor' }
        }
        if (isExternalMediaConnected()) {
            return { ok: true, alreadyConnected: true }
        }

        await resumeExternalAudioContextFromGesture()
        const ctx = externalMediaRef.current.audioContext
        if (!ctx) {
            return { ok: false, reason: 'no-context' }
        }
        if (ctx.state !== 'running') {
            try {
                await Promise.race([
                    ctx.resume(),
                    new Promise(function(resolve) { setTimeout(resolve, 500) }),
                ])
            } catch (e) {}
        }
        if (ctx.state !== 'running') {
            return { ok: false, reason: 'context-not-running' }
        }

        if (opts.seek !== false) {
            const extDuration = getExternalPlaybackDuration()
            const nativeNow = opts.resumeAt != null && isFinite(parseFloat(opts.resumeAt))
                ? Math.max(0, parseFloat(opts.resumeAt))
                : snapshotNativeMediaClock()
            const externalNow = mapNativeSecondsToExternalTimeline(nativeNow)
            if (extDuration > 0 && nativeNow >= 0) {
                externalMediaRef.current.seek(Math.min(1, externalNow / extDuration))
                setCurrentTime(nativeNow)
            }
        }

        let connected = false
        if (opts.awaitConnect && typeof externalMediaRef.current.connect === 'function') {
            try {
                await externalMediaRef.current.connect()
                connected = isExternalMediaConnected()
            } catch (e) {
                connected = false
            }
        } else {
            connected = externalMediaRef.current.connectIfRunning()
        }
        if (!connected) {
            return { ok: false, reason: 'connect-failed' }
        }

        if (opts.settings && pitchShiftIsActive(opts.settings.pitch, opts.settings.fineTune)) {
            const cacheOptions = getExternalMediaCacheOptions(tuneRef.current || tune, mediaLinkNumberRef.current)
            await externalMediaRef.current.applySettings(
                opts.settings.tempo,
                opts.settings.pitch,
                opts.settings.fineTune,
                opts.settings.audioFilters,
                cacheOptions,
                { allowNetworkSeparation: false }
            )
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
        if (getLinkPlaybackLoop() && !shouldPreferQueueAdvanceOverLinkLoop()) {
            suppressRegionEndHandlers()
            loopCurrentRegion()
            return
        }
        if (shouldIgnorePlaybackEndDuringTransition()) {
            return
        }
        handleMediaPlaybackCompleted()
    }
    onExternalEndedRef.current = onExternalEnded

    function applyExternalMediaSettings(settings, options) {
        if (!externalMediaRef.current) return Promise.resolve(false)
        const opts = options || {}
        const wasConnected = isExternalMediaConnected()
        const wantsOutput = hasActivePlaybackIntent()
            && opts.resumePlayback !== false
            && (opts.forcePlay || wasConnected || externalMediaActiveRef.current)
        const cacheOptions = getExternalMediaCacheOptions(tuneRef.current || tune, mediaLinkNumberRef.current)
        const currentTune = tuneRef.current || tune
        const linkIndex = mediaLinkNumberRef.current !== null && mediaLinkNumberRef.current !== undefined
            ? mediaLinkNumberRef.current
            : mediaLinkNumber
        const srcType = getSrcType(getSrc(currentTune, linkIndex))

        if (wasConnected || playingIntentRef.current) {
            externalHandoffGuardUntilRef.current = Date.now() + 2000
        }

        const filtersActive = !!(settings.audioFilters && !audioFiltersAreNeutral(settings.audioFilters))

        const finalize = async function() {
            try {
            if (!wantsOutput) {
                return true
            }

            if (opts.liveStemMix && isStemLiveOutputActive()) {
                applyPlaybackVolumeToActiveRoute(playbackVolume)
                confirmPlayingStarted()
                return true
            }

            const resumeAt = opts.resumeAt != null && isFinite(parseFloat(opts.resumeAt))
                ? Math.max(0, parseFloat(opts.resumeAt))
                : null

            if ((wasConnected || opts.liveStemMix) && filtersActive) {
                let handedOff = await ensureStemLivePlaybackHandoff(settings, resumeAt)
                if (!handedOff) {
                    await ensureProcessorStemBuffers(externalMediaRef.current, cacheOptions)
                    handedOff = await ensureStemLivePlaybackHandoff(settings, resumeAt)
                }
                if (handedOff) {
                    return true
                }
                if (externalMediaRef.current && externalMediaRef.current.applyStemMix) {
                    externalMediaRef.current.applyStemMix(
                        settings.audioFilters,
                        settings.tempo,
                        settings.pitch,
                        settings.fineTune
                    )
                    if (!isExternalMediaConnected() && externalMediaRef.current.connectIfRunning) {
                        externalMediaRef.current.connectIfRunning()
                    }
                    if (isExternalMediaConnected()) {
                        muteNativePlayers()
                        setExternalMediaActiveState(true)
                        applyPlaybackVolumeToActiveRoute(playbackVolume)
                        confirmPlayingStarted()
                        return true
                    }
                }
                return false
            } else if (wasConnected || opts.liveStemMix) {
                await resumeExternalAudioContextFromGesture()
                if (!isExternalMediaConnected()) {
                    externalMediaRef.current.connectIfRunning()
                }
                if (isExternalMediaConnected()) {
                    setExternalMediaActiveState(true)
                    applyPlaybackVolumeToActiveRoute(playbackVolume)
                    confirmPlayingStarted()
                    return true
                }
            }

            let handoff = await trySyncExternalHandoff({
                resumeAt: resumeAt,
                awaitConnect: pitchShiftIsActive(settings.pitch, settings.fineTune),
                settings: settings,
            })
            if (!handoff.ok && handoff.reason === 'context-not-running') {
                const running = await waitForExternalContextRunning(2500)
                if (running && hasActivePlaybackIntent()) {
                    handoff = await trySyncExternalHandoff({
                        awaitConnect: pitchShiftIsActive(settings.pitch, settings.fineTune),
                        settings: settings,
                    })
                }
            }
            if (handoff.ok) {
                await externalMediaRef.current.applySettings(
                    settings.tempo,
                    settings.pitch,
                    settings.fineTune,
                    settings.audioFilters,
                    cacheOptions,
                    { allowNetworkSeparation: false }
                )
                applyPlaybackVolumeToActiveRoute(playbackVolume)
                confirmPlayingStarted()
                return true
            }

            applyNativeTempoBridge(settings)
            if (!filtersActive && handoff.reason === 'context-not-running'
                && !pitchShiftIsActive(settings.pitch, settings.fineTune)) {
                return true
            }
            if (pitchShiftIsActive(settings.pitch, settings.fineTune)) {
                await handleFailedPitchHandoff(settings, srcType, resumeAt)
                return false
            }
            if (playingIntentRef.current && !userPausedRef.current) {
                setTapToPlay(true)
            }
            return false
            } finally {
                finishPitchShiftPrepareRef.current()
            }
        }

        return ensureProcessorStemBuffers(externalMediaRef.current, cacheOptions).then(function() {
            return externalMediaRef.current.applySettings(
                settings.tempo,
                settings.pitch,
                settings.fineTune,
                settings.audioFilters,
                cacheOptions,
                { allowNetworkSeparation: false }
            ).then(finalize)
        }).catch(function(e) {
            finishPitchShiftPrepareRef.current()
            if (pitchShiftIsActive(settings.pitch, settings.fineTune) && hasActivePlaybackIntent()) {
                handleFailedPitchHandoff(settings, srcType, opts.resumeAt)
            }
            return false
        })
    }

    async function prepareExternalMedia(forceSrc, playbackSettings, options) {
        const settings = playbackSettings || getMediaPlaybackSettings(tune)
        const opts = options || {}
        if (prefersNativeMediaPlayback() && hasActivePlaybackIntent() && !opts.prefetchOnly && !opts.warmStemProcessor) {
            if (canUseNativeFilteredPlayback(settings)) {
                return applyNativeFilteredPlayback(settings, {
                    play: opts.autoPlay !== false,
                    forcePlay: opts.autoPlay !== false,
                    resumeAt: opts.resumeAt,
                })
            }
            if (isPlaybackDebugEnabled()) {
                logPlaybackDebug('web-fallback-blocked', { src: forceSrc })
            }
            return false
        }
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
        const activeLink = getActiveLink()
        const cacheAvailable = tune && src
            ? await isExternalMediaCached(tune.id, mediaLinkNumber, src)
            : false
        const srcType = getSrcType(src, activeLink)
        if (!src || srcType === 'abc') return false
        if (opts.prefetchOnly) {
            if (srcType !== 'youtube') return false
            if (!linkedMediaPitchPathAvailableSync({
                srcType: 'youtube',
                resolverFeatures: resolverFeatures,
                resolverStatus: mediaResolverStatus,
                accessToken: getGoogleAccessToken(),
            })) return false
        } else if (!canUseExternalPitchTempo(settings) && !(opts.allowCachedOnly && cacheAvailable && settingsRequireExternalMediaProcessor(settings)) && !opts.warmStemProcessor) {
            destroyExternalMedia()
            return false
        }

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

        const resumeAtLoadStart = opts.resumeAt != null && isFinite(parseFloat(opts.resumeAt))
            ? Math.max(0, parseFloat(opts.resumeAt))
            : snapshotNativeMediaClock()
        const token = ++externalLoadToken.current
        externalLoadingRef.current = true
        externalLoadingSrcRef.current = src
        pendingExternalSettingsRef.current = settings
        if (opts.showLoading !== false && !isPlaying) {
            setIsLoading(true)
        }

        const loadPromise = (async function() {
            let processor = null
            lastExternalMediaLoadErrorRef.current = null
            try {
                processor = createExternalMediaProcessor()
                externalLoadingProcessorRef.current = processor
                const youtubeGetId = props.tunebook.utils.YouTubeGetID
                const trimBounds = activeLink ? getLinkTrimBounds(activeLink) : null
                const cacheOptions = {
                    tuneId: tune.id,
                    linkIndex: mediaLinkNumber,
                    src: src,
                    srcType: srcType,
                    accessToken: getGoogleAccessToken(),
                    demucsModel: getDemucsModel(),
                    link: activeLink,
                    driveApi: driveDocs,
                }

                let loadedDuration = 0
                if (opts.warmStemProcessor) {
                    loadedDuration = await processor.warmFromCachedStems(cacheOptions)
                }

                if (!loadedDuration) {
                    loadedDuration = await processor.load(src, srcType, youtubeGetId, Object.assign({}, cacheOptions, {
                        trimBounds: trimBounds,
                    }))
                }
                if (token !== externalLoadToken.current) {
                    processor.destroy()
                    externalLoadingProcessorRef.current = null
                    return false
                }
                if (!loadedDuration) {
                    if (!lastExternalMediaLoadErrorRef.current) {
                        lastExternalMediaLoadErrorRef.current = new Error(
                            'Audio download finished without usable audio data'
                        )
                    }
                    processor.destroy()
                    externalLoadingProcessorRef.current = null
                    return false
                }

                const finalSettings = pendingExternalSettingsRef.current || settings
                pendingExternalSettingsRef.current = null
                if (opts.warmStemProcessor && !processor.hasStemBuffers()) {
                    await ensureProcessorStemBuffers(processor, cacheOptions)
                }
                await processor.applySettings(
                    finalSettings.tempo,
                    finalSettings.pitch,
                    finalSettings.fineTune,
                    finalSettings.audioFilters,
                    cacheOptions,
                    { allowNetworkSeparation: false }
                )
                const warmOnly = opts.warmStemProcessor && opts.autoPlay === false
                if (warmOnly && loadedDuration > 0 && hasActivePlaybackIntent()) {
                    const nativeNow = snapshotNativeMediaClock()
                    const externalNow = mapNativeSecondsToExternalTimeline(nativeNow)
                    processor.seek(Math.min(1, externalNow / loadedDuration))
                } else {
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
                    setCurrentTime(seekSeconds)
                }

                externalMediaRef.current = processor
                externalLoadingProcessorRef.current = null
                externalLoadedSrcRef.current = src
                setDuration(loadedDuration)
                setIsReady(true)
                applyStoredOutputDeviceToActiveRoute().catch(function() {})

                if (opts.prefetchOnly) {
                    const prefetchSource = pendingExternalSettingsRef.current || finalSettings
                    const prefetchPitch = pitchShiftIsActive(prefetchSource.pitch, prefetchSource.fineTune)
                        ? prefetchSource.pitch
                        : 0
                    const prefetchFineTune = pitchShiftIsActive(prefetchSource.pitch, prefetchSource.fineTune)
                        ? prefetchSource.fineTune
                        : 0
                    const prefetchSettings = {
                        tempo: finalSettings.tempo,
                        pitch: prefetchPitch,
                        fineTune: prefetchFineTune,
                        audioFilters: audioFiltersAreNeutral(finalSettings.audioFilters)
                            ? finalSettings.audioFilters
                            : normalizeAudioFilters(null),
                    }
                    await processor.applySettings(
                        prefetchSettings.tempo,
                        prefetchSettings.pitch,
                        prefetchSettings.fineTune,
                        prefetchSettings.audioFilters,
                        cacheOptions,
                        { allowNetworkSeparation: false }
                    )
                    return true
                }

                if (opts.autoPlay !== false && hasActivePlaybackIntent()) {
                    const applied = await applyExternalMediaSettings(finalSettings, {
                        resumePlayback: true,
                        forcePlay: true,
                        liveStemMix: !audioFiltersAreNeutral(finalSettings.audioFilters),
                    })
                    if (!applied && opts.fallbackNative !== false && hasActivePlaybackIntent()) {
                        if (pitchShiftIsActive(finalSettings.pitch, finalSettings.fineTune)) {
                            await handleFailedPitchHandoff(finalSettings, srcType, resumeAtLoadStart)
                            return false
                        }
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
                lastExternalMediaLoadErrorRef.current = e
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

            const currentSrc = getSrc(tuneRef.current || tune, getActiveMediaLinkNumber())
            if (isExternalMediaConnected()
                && externalLoadedSrcRef.current === currentSrc
                && preservePosition
                && !opts.restart
                && !opts.forceReconnect) {
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
            let handoff = await trySyncExternalHandoff({
                seek: false,
                awaitConnect: true,
            })
            if (!handoff.ok && handoff.reason === 'context-not-running') {
                // resume() is async: the context often becomes 'running' a few
                // hundred ms after the gesture. Poll (without blocking the UI on a
                // resume promise that may never resolve outside a gesture) and retry.
                const running = await waitForExternalContextRunning(2500)
                if (!playingIntentRef.current || userPausedRef.current) {
                    return false
                }
                if (running) {
                    handoff = await trySyncExternalHandoff({ seek: false, awaitConnect: true })
                }
            }
            if (!handoff.ok) {
                unmuteNativePlayers()
                if (handoff.reason === 'context-not-running' && playingIntentRef.current && !userPausedRef.current) {
                    promptTapToPlayWhenAutoplayBlocked()
                }
                return false
            }
            applyPlaybackVolumeToActiveRoute(playbackVolume)
            applyStoredOutputDeviceToActiveRoute().catch(function() {})
            externalHandoffGuardUntilRef.current = Date.now() + 2000
            confirmPlayingStarted()
            return true
        } catch (e) {
            unmuteNativePlayers()
            if (playingIntentRef.current) {
                promptTapToPlayWhenAutoplayBlocked()
            }
            return false
        }
    }
    
    var midiHash = useRef()
    function forceMidiChange() {
        if (isMidiPlaybackRoute() && (isPlaying || playingIntentRef.current)) {
            playingIntentRef.current = false
            pause()
            setIsPlaying(false)
        }
        midiHash.current = Math.random() * 1000000000
    }
    //forceMidiChange()
    const tuneId = tune ? tune.id : null
    const mediaLinkUrl = tune && tune.links && mediaLinkNumber !== null && tune.links[mediaLinkNumber]
        ? tune.links[mediaLinkNumber].link
        : null

    useEffect(function() {
         if (practiceSessionActiveRef.current) return
         if (isPlaying) {
             clearAutoplayRecoveryGuard()
             return
         }
         if (Date.now() < autoplayRecoveryGuardUntilRef.current) return
         const snapshot = getIntentSnapshot()
         if (intentIsSeekGuardActive(snapshot)) return
         const browsePath = isTuneListPath(getAppPathname()) || isPlaybackBrowsePath(getAppPathname())
         if (browsePath && !isPlaying && !isLoading) return
         if (intentShouldTriggerAutoplayRecovery(snapshot, {
             tapToPlay: tapToPlay,
             isLoading: isLoading,
             isSeekGuardActive: intentIsSeekGuardActive(snapshot),
             queueItemUnplayable: !isCurrentQueueItemPlayableForQueue(),
             playbackStarted: playbackStartedRef.current,
         })) {
             autoplayRecoveryGuardUntilRef.current = Date.now() + 2000
             play({ preservePosition: true })
         }
     // eslint-disable-next-line react-hooks/exhaustive-deps -- autoplay recovery reads latest intent snapshot and play()
     },[tapToPlay, playCancelled, mediaLinkNumber, isPlaying, isLoading, props.nowPlayingQueue])

    useEffect(function() {
        function isPlaylistStallEligible() {
            if (!isQueueActive(props.nowPlayingQueue)) return false
            if (!shouldAdvanceQueueOnPlaybackEnd()) return false
            if (!playingIntentRef.current && !hasActivePlaybackIntent()) return false
            if (isPlaying) return false
            return !!(
                isLoading
                || externalLoadingRef.current
                || stemJobActive
                || tapToPlay
            )
        }

        function tickStallWatchdog() {
            if (!isPlaylistStallEligible()) {
                clearPlaylistStall()
                return
            }
            if (!playlistStallStartedAtRef.current) {
                playlistStallStartedAtRef.current = Date.now()
                return
            }
            if (Date.now() - playlistStallStartedAtRef.current >= PLAYLIST_STALL_MS) {
                pausePlaylistForStall()
            }
        }

        function onConnectivityChange() {
            tickStallWatchdog()
        }

        tickStallWatchdog()
        const interval = setInterval(tickStallWatchdog, 5000)
        if (typeof window !== 'undefined') {
            window.addEventListener('online', onConnectivityChange)
            window.addEventListener('offline', onConnectivityChange)
        }
        return function() {
            clearInterval(interval)
            if (typeof window !== 'undefined') {
                window.removeEventListener('online', onConnectivityChange)
                window.removeEventListener('offline', onConnectivityChange)
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stall watchdog polls refs and queue state
    }, [isLoading, tapToPlay, stemSeparationActive, stemAnalysisProgress, isPlaying, props.nowPlayingQueue])

    useEffect(function() {
        let cancelled = false
        if (!tune) {
            setStemsReadyForMedia(false)
            setAvailableStemNames([])
            return undefined
        }
        const linkIndex = mediaLinkNumber !== null && mediaLinkNumber !== undefined
            ? mediaLinkNumber
            : getFirstPlayableMediaLinkIndex(
                tune,
                null,
                props.tunebook.utils && props.tunebook.utils.isYoutubeLink
            )
        if (linkIndex === null || linkIndex === undefined) {
            setStemsReadyForMedia(false)
            setAvailableStemNames([])
            return undefined
        }
        refreshStemsReadyState(tune, linkIndex).then(function(ready) {
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
            const linkIndex = parseInt(mediaLinkNumber, 10)
            if (!isNaN(linkIndex) && linkIndex >= 0) {
                const cacheSrc = resolveTuneLinkCacheSrc(tune, linkIndex)
                if (cacheSrc) return cacheSrc
                if (Array.isArray(tune.links) && tune.links.length > linkIndex && tune.links[linkIndex]) {
                    return linkUriString(tune.links[linkIndex])
                }
                if (Array.isArray(tune.links) && tune.links.length > 0 && tune.links[0]) {
                    return linkUriString(tune.links[0])
                }
                return ''
            }
            return ''
        }
        return ''
    }
    
    function getSrcType(src, link) {
        if (link) {
            const linkType = resolveLinkPlaybackSrcType(link, props.tunebook.utils.isYoutubeLink)
            if (linkType === 'empty') return 'abc'
            return linkType
        }
        const uri = typeof src === 'string' ? src : String(src || '').trim()
        if (uri && uri.trim()) {
            const uriType = resolveUriPlaybackSrcType(uri, props.tunebook.utils.isYoutubeLink)
            if (uriType !== 'abc') return uriType
        }
        return 'abc'
    }

    function toNativePlayerSrcType(srcType) {
        if (srcType === 'recording') return 'audio'
        return srcType
    }

    async function attachNativeBlobUrlForPlayback(blobUrl, duration, settings) {
        applyNativePlaybackBlobUrl(blobUrl)
        if (duration) {
            setDuration(duration)
        }
        let player = playerRef && playerRef.current
        if (!isPlayerElementLive(player)) {
            player = await waitForLivePlayerElement(4000)
        }
        if (player) {
            if (blobUrl && (player.getAttribute('src') || player.src) !== blobUrl) {
                player.src = blobUrl
            }
            const tempo = settings && settings.tempo > 0 ? settings.tempo : playbackSpeed
            applyNativeMediaPlaybackSettings(tempo)
            applyPlaybackVolumeToActiveRoute(playbackVolume)
            await waitForMediaElementReady(player, 8000, blobUrl)
        }
        setIsReady(true)
    }
    
    function resetPlaybackPositionForNewTune() {
        notationPlaybackStartSecondsRef.current = null
        notationPlaybackSeekRef.current = null
        currentTimeRef.current = 0
        setCurrentTime(0)
        setClickSeek(0)
    }

    function setTune(t) {
        const prevId = tuneRef.current && tuneRef.current.id
        commitTuneState(t)
        const nextId = t && t.id ? t.id : null
        if (nextId !== prevId) {
            setStemsReadyForMedia(false)
            setAvailableStemNames([])
            queuePlaybackErrorRetryRef.current = false
            resetPlaybackPositionForNewTune()
        }
        if (t) {
            const playback = getPlaybackSettings(t)
            lastNotifiedPitchRef.current = {
                pitch: playback.pitch,
                fineTune: playback.fineTune,
            }
            setPlaybackSpeed(playback.tempo)
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

        if (isMidiFileMediaRoute()) {
            if (applyMidiFileTempoRef.current) {
                applyMidiFileTempoRef.current(settings.tempo)
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

        const filtersOnly = Math.abs(combinedPitchSemitones(settings.pitch, settings.fineTune)) < 0.0001
            && !audioFiltersAreNeutral(settings.audioFilters)

        if (opts.liveAudioFilters && filtersOnly) {
            const currentTune = tuneRef.current || tune
            const linkIndex = mediaLinkNumberRef.current !== null && mediaLinkNumberRef.current !== undefined
                ? mediaLinkNumberRef.current
                : mediaLinkNumber
            const currentSrc = getSrc(currentTune, linkIndex)
            const playingNow = playingIntentRef.current

            const applyLiveStemSettings = function() {
                return applyExternalMediaSettings(settings, {
                    resumePlayback: true,
                    forcePlay: playingNow,
                    liveStemMix: true,
                })
            }

            const ensureAndApply = function() {
                return ensureStemPlaybackProcessor(currentSrc, settings).then(function(ready) {
                    if (!ready || !externalMediaRef.current) return false
                    return applyLiveStemSettings()
                })
            }

            if (externalMediaRef.current && externalLoadedSrcRef.current === currentSrc) {
                return ensureAndApply()
            }

            if (externalLoadingRef.current && externalLoadingSrcRef.current === currentSrc) {
                pendingExternalSettingsRef.current = settings
                if (externalLoadingPromiseRef.current) {
                    return externalLoadingPromiseRef.current.then(function(loaded) {
                        if (!loaded || !externalMediaRef.current) {
                            return ensureAndApply()
                        }
                        return applyLiveStemSettings()
                    })
                }
            }

            return ensureAndApply()
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

        if (wantsExternal && prefersNativeMediaPlayback()) {
            if (canUseNativeFilteredPlayback(settings)) {
                return applyNativeFilteredPlayback(settings, {
                    play: playingNow,
                    resumePlayback: true,
                    forcePlay: playingNow,
                })
            }
            if (playingNow) {
                skipBackgroundIncapableTrack('settings-processed-unavailable')
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
                    if (pitchShiftIsActive(settings.pitch, settings.fineTune)) {
                        return handleFailedPitchHandoff(settings, srcType, resumeAt)
                    }
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
        const playTempo = resolvePlaybackTempo(tempo)
        const settings = {
            tempo: playTempo,
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
        setPlaybackSpeed(playTempo)
        applyLinkedMediaPlaybackSettings(settings)
    }

    function applyLivePlaybackSettings(tempo, pitch, fineTune, options) {
        const currentTune = tuneRef.current || tune
        if (!currentTune) return Promise.resolve()
        const playTempo = resolvePlaybackTempo(tempo)
        const settings = {
            tempo: playTempo,
            pitch: pitch,
            fineTune: fineTune,
            audioFilters: getAudioFilterSettings(currentTune),
        }
        setPlaybackSpeed(playTempo)
        const opts = options || {}
        if (settingsRequireExternalMediaProcessor(settings)) {
            return resumeExternalAudioContextFromGesture().then(function() {
                return applyLinkedMediaPlaybackSettings(settings, opts)
            })
        }
        return Promise.resolve(applyLinkedMediaPlaybackSettings(settings, opts))
    }

    function setGlobalPlaybackTempo(percent) {
        const next = setGlobalTempoPercent(percent)
        const currentTune = tuneRef.current || tune
        if (!currentTune) {
            setPlaybackSpeed(next > 0 ? next / 100 : 1)
            return next
        }
        const playback = getTunePlaybackSettings(currentTune)
        applyLivePlaybackSettings(
            next > 0 ? next / 100 : playback.tempo,
            playback.pitch,
            playback.fineTune,
            { fromUserGesture: true, liveTempoOnly: true }
        )
        return next
    }

    function updateTuneAudioFilterSettings(filters) {
        const currentTune = tuneRef.current || tune
        if (!currentTune) return
        const normalized = normalizeAudioFilters(filters)
        const wasNeutral = audioFiltersAreNeutral(getAudioFilterSettings(currentTune))
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

        if (!audioFiltersAreNeutral(normalized) && wasNeutral) {
            notifyYoutubeProxyLimitationIfNeeded(settings)
        }

        if (audioFiltersAreNeutral(normalized) || !isMediaPlaybackRoute()) {
            return applyLinkedMediaPlaybackSettings(settings)
        }

        if (!hasStemsForCurrentMedia()) {
            return
        }

        const resumeAt = (playingIntentRef.current && !userPausedRef.current)
            ? snapshotNativeMediaClock()
            : null
        return applyLinkedMediaPlaybackSettings(settings, {
            liveAudioFilters: true,
            resumeAt: resumeAt,
        })
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
    
    
    function getActiveNowPlayingQueue() {
        return nowPlayingQueueRef.current
    }

    function advanceQueueOnPlaybackEnd() {
        armQueueAdvanceGuard(5000)
        const activeQueue = getActiveNowPlayingQueue()
        const playingId = tuneRef.current && tuneRef.current.id ? tuneRef.current.id : null
        const pathname = typeof window !== 'undefined' ? (window.location.hash || '').replace(/^#/, '') : ''
        const playbackMode = playbackRouteRef.current.mode === 'midi'
            ? 'midi'
            : (playbackRouteRef.current.mode === 'media' ? 'media' : playbackModeFromPathname(pathname))
        const queueAdvanceParams = {
            getLatestQueue: getActiveNowPlayingQueue,
            // Explicit null when logged out — do not fall back to a stale health-store token.
            accessToken: getGoogleAccessToken(),
            resolverStatus: mediaResolverStatus,
        }
        let advanceEndRetried = false
        const failCallback = function(reason) {
            if (reason === 'end' && !advanceEndRetried && shouldAdvanceQueueOnPlaybackEnd()) {
                advanceEndRetried = true
                advanceQueueToPlayableAndStart(Object.assign({}, queueAdvanceParams, {
                    queue: activeQueue,
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
                    failCallback: function() {
                        pauseAtRegionStart()
                        updateMediaSessionState()
                    },
                    playbackMode: playbackMode,
                    isYoutubeLink: props.tunebook.utils && props.tunebook.utils.isYoutubeLink,
                    advanceFirst: true,
                }))
                return
            }
            pauseAtRegionStart()
            updateMediaSessionState()
        }
        if (!shouldAdvanceQueueOnPlaybackEnd()) {
            failCallback()
            return
        }
        handleQueueAdvanceOnEnded(Object.assign({}, queueAdvanceParams, {
            queue: activeQueue,
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
        }))
    }

    function onEnded() {
        handleMediaPlaybackCompleted()
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

    function isPracticeSessionActive() {
        return practiceSessionActiveRef.current
    }

    function cancelPausedPlaybackSeek() {
        if (stopMetronomeRef.current) {
            stopMetronomeRef.current()
        }
        if (invalidatePendingMidiStartsRef.current) {
            invalidatePendingMidiStartsRef.current()
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
        if (cachedNativeBlobUrlRef.current && proxiedNativeBlobSrcRef.current) {
            return proxiedNativeBlobSrcRef.current
        }
        const activeTune = tuneRef.current
        if (!activeTune || playbackRouteRef.current.mode !== 'media') return null
        return getSrc(activeTune, getActiveMediaLinkNumber())
    }

    function shouldPreserveMediaEngineOnHostHandoff() {
        if (playbackRouteRef.current.mode !== 'media') return false
        return hasActivePlaybackIntent()
    }

    function getPlaybackHandoffPosition(tuneId) {
        const activeTune = tuneRef.current
        if (!activeTune || activeTune.id !== tuneId) return null
        return resolvePlaybackHandoffPosition({
            tuneId: tuneId,
            playbackClockTuneId: playbackClockTuneIdRef.current,
            queueResumePending: !!queuePlaybackResumeRef.current,
            routeMode: playbackRouteRef.current.mode,
            positionSeconds: currentTimeRef.current,
            userPaused: userPausedRef.current,
            activePlaybackIntent: hasActivePlaybackIntent(),
            playingIntent: hasPlayingIntent(),
            regionStart: getLinkStartAt(),
        })
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

    function isCurrentQueueItemPlayableForQueue() {
        const queue = props.nowPlayingQueue
        if (!isQueueActive(queue)) return true
        const item = getCurrentItem(queue)
        const tuneId = getCurrentTuneId(queue)
        const currentTune = props.tunes && tuneId ? props.tunes[tuneId] : null
        if (!currentTune || !item || !props.tunebook) return false
        return isQueueItemPlayable(currentTune, item, props.tunebook)
    }

    function clearPlaylistStall() {
        playlistStallStartedAtRef.current = 0
        setPlaylistStalled(false)
    }

    function pausePlaylistForStall() {
        playlistStallStartedAtRef.current = 0
        setPlaylistStalled(true)
        userPausedRef.current = true
        playingIntentRef.current = false
        cleanupTimers()
        pause()
        setIsLoading(false)
        setIsPlaying(false)
        updateMediaSessionState()
    }

    function tryRecoverQueuePlaybackFromError() {
        if (queuePlaybackErrorRetryRef.current) return false
        if (!isMediaPlaybackRoute()) return false
        const currentTune = tuneRef.current || tune
        if (!currentTune) return false
        const linkIndex = getActiveMediaLinkNumber()
        const src = getSrc(currentTune, linkIndex)
        const link = getActiveLink()
        const srcType = getSrcType(src, link)
        if (srcType !== 'audio' && srcType !== 'youtube' && srcType !== 'recording') {
            return false
        }
        const wasExternal = externalMediaActiveRef.current || !!externalMediaRef.current
        if (!wasExternal && !stemJobActive && !nativePlaybackFallbackRequired) {
            return false
        }
        queuePlaybackErrorRetryRef.current = true
        if (wasExternal) {
            destroyExternalMedia()
        }
        playNativeMedia(toNativePlayerSrcType(srcType), { preservePosition: true })
        return true
    }
    
    function shouldIgnoreMediaElementError(event) {
        if (nativeBlobAttachInFlightRef.current) {
            return true
        }
        if (unplayableExternalCacheSrcRef.current) {
            return true
        }
        if (!hasActivePlaybackIntent() && !isLoading) {
            return true
        }
        if (isPlaybackTransitionGuardActive()) {
            const currentTune = tuneRef.current || tune
            const queue = nowPlayingQueueRef.current
            const queueItem = queue && isQueueActive(queue) ? getCurrentItem(queue) : null
            const linkIndex = getCurrentQueueItemLinkIndex(queueItem, getActiveMediaLinkNumber())
            const skipIndexes = currentTune && triedMediaLinkTuneIdRef.current === currentTune.id
                ? triedMediaLinkIndexesRef.current
                : {}
            const hasAlternate = queueItemHasAlternateMediaLinks(
                currentTune,
                queueItem,
                props.tunebook,
                linkIndex,
                {
                    skipIndexes: skipIndexes,
                    isYoutubeLink: getPlaylistYoutubeLinkChecker(),
                }
            )
            const triedThisTune = !!(currentTune
                && triedMediaLinkTuneIdRef.current === currentTune.id
                && Object.keys(skipIndexes).length > 0)
            if (!hasAlternate && !triedThisTune) {
                return true
            }
        }
        const queue = nowPlayingQueueRef.current
        const queueItem = queue && isQueueActive(queue) ? getCurrentItem(queue) : null
        if (isStandaloneExternalPlaybackEngaged() && isStandaloneExternalQueueItem(queueItem)) {
            return true
        }
        const target = event && event.target
        if (!target) return false
        const mediaError = target.error
        if (mediaError && mediaError.code === 1) {
            return true
        }
        const elementSrc = target.currentSrc || target.src || ''
        const activeSrc = getActiveMediaSrc()
        if (!elementSrc) {
            if (cachedNativeBlobUrlRef.current || nativePlaybackSrcOverride || proxiedNativeBlobPromiseRef.current) {
                return true
            }
            if (activeSrc && requiresResolverProxiedPlayback(activeSrc)) return true
            return false
        }
        if (
            (requiresResolverProxiedPlayback(elementSrc) || requiresResolverProxiedPlayback(activeSrc))
            && !cachedNativeBlobUrlRef.current
            && !nativePlaybackSrcOverride
        ) {
            return true
        }
        const preparedSrc = getActivePreparedMediaSrc()
        const expectedSrcs = [activeSrc, preparedSrc, nativePlaybackSrcOverride, externalLoadedSrcRef.current]
            .filter(function(src) { return !!src })
        if (!expectedSrcs.length) return false
        return !expectedSrcs.some(function(src) {
            if (!src) return false
            return elementSrc === src
                || (elementSrc && src && elementSrc.indexOf(src) >= 0)
                || (elementSrc && src && src.indexOf(elementSrc) >= 0)
        })
    }

    function onError(e) {
        if (practiceSessionActiveRef.current && playingIntentRef.current) {
            setTapToPlay(true)
            abortPlayingIntent()
            cleanupTimers()
            return
        }
        if (shouldIgnoreNativePlaybackEvents() || externalLoadingRef.current) {
            return
        }
        if (shouldSuppressYoutubeIframeEvent()) {
            return
        }
        if (shouldIgnoreMediaElementError(e)) {
            return
        }
        handleMediaPlaybackFailure()
    }
    
    
    function resumeLinkedMediaFromMediaReady() {
        const useTune = tuneRef.current || tune
        const linkIndex = getActiveMediaLinkNumber()
        const activeLink = useTune && useTune.links ? useTune.links[linkIndex] : null
        const srcType = toNativePlayerSrcType(getSrcType(getSrc(useTune, linkIndex), activeLink))
        const regionStart = getLinkStartAt()
        const preservePosition = !freshPlaybackIntentRef.current
            && currentTimeRef.current > regionStart + 0.05

        function playResolvedNative() {
            playNativeMedia(srcType, {
                preservePosition: preservePosition,
                fresh: !!freshPlaybackIntentRef.current,
            })
        }

        if (externalLoadingRef.current && externalLoadingPromiseRef.current) {
            externalLoadingPromiseRef.current.then(function(loaded) {
                if (!hasActivePlaybackIntent()) return
                if (loaded && externalMediaRef.current && canUseExternalPitchTempo()) {
                    playExternalMedia({ preservePosition: preservePosition, forcePlay: true })
                } else {
                    playResolvedNative()
                }
            })
            return
        }

        if (externalMediaRef.current && canUseExternalPitchTempo()) {
            playExternalMedia({ preservePosition: preservePosition }).then(function(ok) {
                if (!ok && hasActivePlaybackIntent() && !externalLoadingRef.current) {
                    playResolvedNative()
                }
            })
            return
        }

        if (needsPlaybackKickoff() && !linkedMediaPlaybackInFlightRef.current) {
            kickPlaybackAfterEngineReady()
            return
        }
        playResolvedNative()
    }

    function onMediaReady(e) {
        cleanupTimers()
        flushPendingPlayRequest()
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
            if (prefersNativeMediaPlayback()) {
                setIsReady(true)
                if (needsPlaybackKickoff()) {
                    kickPlaybackAfterEngineReady()
                }
                return
            }
            resumeLinkedMediaFromMediaReady()
        }
        if (!externalMediaActiveRef.current) {
            setIsReady(true)
            applyNativeMediaPlaybackSettings(playbackSpeed)
            applyStoredOutputDeviceToActiveRoute().catch(function() {})
        }
    }

    function onYtReady(e) {
        cleanupTimers()
        ytPlayerRef.current = e.target
        ytPlayerLoadedSrcRef.current = getActiveMediaSrc()
        if (cachedNativeBlobUrlRef.current || nativePlaybackSrcOverride) {
            setIsReady(true)
            pauseYoutubeOutputOnly()
            return
        }
        flushPendingPlayRequest()

        if (isSeekGuardActive()) {
            setIsReady(true)
            return
        }
        if (prefersNativeMediaPlayback() && shouldUseAndroidNativeYoutubeOutput(getActivePlaybackSettings())) {
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
        const preservePosition = !freshPlaybackIntentRef.current
            && currentTimeRef.current > regionStart + 0.05
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
        if (isStemLiveOutputActive()) return true
        if (expectsStemLiveFilterOutput(getActivePlaybackSettings())) return false
        return isExternalMediaConnected()
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
        if (cachedNativeBlobUrlRef.current) return
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
            promptTapToPlayWhenAutoplayBlocked()
            setIsLoading(false)
        }, 3500)
    }

    function retryYoutubeAutostartOrPromptTap(opts) {
        if (!playingIntentRef.current || userPausedRef.current) return
        if (cachedNativeBlobUrlRef.current) return
        if (youtubeAutoplayAttemptRef.current >= MAX_YT_AUTOPLAY_ATTEMPTS) {
            // The browser is blocking autoplay — stop retrying and surface the
            // tap-to-play prompt so a single click can start playback.
            cancelYoutubePlayPoll()
            promptTapToPlayWhenAutoplayBlocked()
            setIsLoading(false)
            return
        }
        youtubeAutoplayAttemptRef.current += 1
        playNativeMedia('youtube', opts)
    }

    function onYtStateChange(e) {
         if (shouldSuppressYoutubeIframeEvent()) {
             return
         }
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
            if (getLinkPlaybackLoop() && !shouldPreferQueueAdvanceOverLinkLoop()) {
                suppressRegionEndHandlers()
                loopCurrentRegion()
            } else if (!shouldIgnorePlaybackEndDuringTransition()) {
                handleMediaPlaybackCompleted()
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
            } else if (hasActivePlaybackIntent()) {
                if (shouldUseAndroidNativeYoutubeFetch() && !isCurrentPlaybackBackgroundCapable()) {
                    skipBackgroundIncapableTrack('youtube-iframe-background')
                    return
                }
                if (!prefersNativeMediaPlayback()) {
                    startPlaybackKeepAlive()
                    scheduleBackgroundPlaybackResume({ preservePosition: true })
                }
                updateMediaSessionState()
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
            if (androidNativeActiveRef.current || isAndroidNativePlayerActive()) {
                return true
            }
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
        if (isSnapcastRemoteActive()) {
            recordPlaybackRouteParity({
                phase: PLAYBACK_ROUTE_PHASE.prePlay,
                snapshot: captureCurrentPlaybackSnapshot(opts),
                branch: 'snapcast-resume',
            })
            const resumeSnapcast = snapcastOutputHandlersRef.current && snapcastOutputHandlersRef.current.resumeSnapcast
            if (resumeSnapcast) {
                resumeSnapcast()
            }
            playingIntentRef.current = true
            userPausedRef.current = false
            setIsPlaying(true)
            return
        }
        if (isCastSdkRemoteActive()) {
            recordPlaybackRouteParity({
                phase: PLAYBACK_ROUTE_PHASE.prePlay,
                snapshot: captureCurrentPlaybackSnapshot(opts),
                branch: 'cast-resume',
            })
            if (remoteOutputHandlersRef.current && remoteOutputHandlersRef.current.resumeCast) {
                remoteOutputHandlersRef.current.resumeCast()
            }
            playingIntentRef.current = true
            userPausedRef.current = false
            setIsPlaying(true)
            return
        }
        stopStandaloneMediaPlayback().catch(function() {})
        applyPlaybackVolumeToActiveRoute(playbackVolume)
        if (intentShouldBlockPlayDuringSeek(getIntentSnapshot(), opts)
            && !opts.fresh && !opts.restart) {
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
            recordPlaybackRouteParity({
                phase: PLAYBACK_ROUTE_PHASE.prePlay,
                snapshot: captureCurrentPlaybackSnapshot(opts),
                branch: 'noop-idempotent',
            })
            setIsLoading(false)
            return
        }
        if (opts.fresh) {
            userPausedRef.current = false
        }
        const useTune = tuneRef.current || tune
        const notationTune = resolveActiveNotationTune() || useTune
        let route = playbackRouteRef.current
        if (shouldBlockMidiStartForMediaRequest(route.mode, requestedPlayStateRef.current)) {
            const staleLinkIndex = getActiveMediaLinkNumber()
            if (useTune && useTune.links && useTune.links.length > staleLinkIndex) {
                commitPlaybackRoute({
                    mode: 'media',
                    mediaLinkNumber: staleLinkIndex,
                    src: getSrc(useTune, staleLinkIndex),
                }, 'playMedia')
                route = playbackRouteRef.current
            }
        }
        if (!opts.restart && !opts.fresh && !opts.userResume
            && playingIntentRef.current
            && !userPausedRef.current
            && route.mode === 'media'
            && linkedMediaPlaybackInFlightRef.current) {
            recordPlaybackRouteParity({
                phase: PLAYBACK_ROUTE_PHASE.prePlay,
                snapshot: captureCurrentPlaybackSnapshot(opts),
                branch: 'noop-inflight',
            })
            return
        }
        const linkIndex = getActiveMediaLinkNumber()
        const playRouteSnapshot = captureCurrentPlaybackSnapshot(opts)
        recordPlaybackRouteParity({
            phase: PLAYBACK_ROUTE_PHASE.prePlay,
            snapshot: playRouteSnapshot,
            playOpts: opts,
        })

        if (route.mode === 'midi') {
            if (shouldBlockMidiStartForMediaRequest(route.mode, requestedPlayStateRef.current)) {
                recordPlaybackRouteParity({
                    phase: PLAYBACK_ROUTE_PHASE.prePlay,
                    snapshot: playRouteSnapshot,
                    branch: 'noop-media-inflight',
                })
                return
            }
            agentDebugLog('useTuneBookMediaController.js:play', 'midi-route-entry', {
                hasUseTune: !!useTune,
                hasNotationTune: !!notationTune,
                notationTuneId: notationTune && notationTune.id ? notationTune.id : null,
                nativePrefers: prefersNativeMediaPlayback(),
            }, 'H-N');
        }

        if (opts.fresh) {
            const startAt = getLinkStartAt()
            currentTimeRef.current = startAt
            setCurrentTime(startAt)
            setClickSeek(0)
        }

        if (userPausedRef.current && !opts.restart) {
            tryPreferredSnapcastDefaultRoute(opts, function() {
            const resumeAt = currentTimeRef.current
            userPausedRef.current = false
            playingIntentRef.current = true
            setPlayCancelled(false)
            setTapToPlay(false)
            cancelYoutubePlayPoll()
            setIsLoading(true)

            if (route.mode === 'midi') {
                if (androidNativeActiveRef.current) {
                    playAndroidNativePlayer().then(function() {
                        confirmPlayingStarted()
                        setIsLoading(false)
                    })
                    return
                }
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
                const activeLink = useTune && useTune.links ? useTune.links[linkIndex] : null
                const srcType = getSrcType(getSrc(useTune, linkIndex), activeLink)
                if (srcType === 'midifile') {
                    resumeSynthAudioContextFromGesture()
                    if (playMidiFileRef.current) {
                        playMidiFileRef.current({ resume: true, preservePosition: true })
                    }
                    return
                }
                resumeSynthAudioContextFromGesture()
                resumeExternalAudioContextFromGesture()
                if (androidNativeActiveRef.current) {
                    playAndroidNativePlayer().then(function() {
                        confirmPlayingStarted()
                        setIsLoading(false)
                    })
                    return
                }
                if (canUseExternalPitchTempo() && externalMediaRef.current
                    && externalLoadedSrcRef.current === getSrc(useTune, linkIndex)) {
                    const settings = getMediaPlaybackSettings(useTune)
                    const filtersActive = !audioFiltersAreNeutral(settings.audioFilters)
                    applyExternalMediaSettings(settings, {
                        resumePlayback: true,
                        forcePlay: true,
                        resumeAt: resumeAt,
                        liveStemMix: filtersActive,
                    }).then(function(applied) {
                        if (applied) return
                        playExternalMedia({
                            resumeAt: resumeAt,
                            preservePosition: true,
                            userResume: true,
                        }).then(function(ok) {
                            if (!ok && hasActivePlaybackIntent()) {
                                playNativeMedia(srcType, { preservePosition: true, userResume: true })
                            } else if (!ok) {
                                setIsPlaying(false)
                                setIsLoading(false)
                            }
                        })
                    })
                    return
                }
                playNativeMedia(srcType, { preservePosition: true, userResume: true })
                return
            }
            setIsLoading(false)
            return
            })
            return
        }

        tryPreferredSnapcastDefaultRoute(opts, function() {
        userPausedRef.current = false
        playingIntentRef.current = true
        setPlayCancelled(false)
        if (props.forceRefresh && !practiceSessionActiveRef.current && !opts.restart
            && !opts.fresh && !notationMidiOwner && !opts.skipNotationRefresh
            && route.mode !== 'midi') {
            props.forceRefresh()
        }

        if (route.mode === 'midi') {
            if (shouldBlockMidiStartForMediaRequest(route.mode, requestedPlayStateRef.current)) {
                setIsLoading(false)
                return
            }
            function startMidiSynthPlayback(midiOpts) {
                beginMidiRouteHandoff({ resumeSynth: true })
                if (!midiOpts.restart && !userPausedRef.current) {
                    seekGuardUntilRef.current = 0
                    seekWasPlayingRef.current = false
                }
                trackPlaybackStart('midi')
                pendingMidiPlayRef.current = midiOpts
                if (playMidiRef.current) {
                    const midiResult = playMidiRef.current(midiOpts)
                    if (midiResult === false) {
                        if (hasActivePlaybackIntent()) {
                            promptTapToPlayWhenAutoplayBlocked()
                        } else {
                            pendingMidiPlayRef.current = null
                        }
                        setIsLoading(false)
                    } else {
                        clearPendingMidiPlayAfterEngineAcceptance()
                    }
                } else {
                    scheduleMidiEngineRegistrationFallback()
                }
            }

            if (shouldUseMidiNativePath(playRouteSnapshot) && props.tunebook && props.tunebook.abcTools && notationTune) {
                if (!opts.restart && !opts.fresh
                    && (androidNativeActiveRef.current || isAndroidNativePlayerActive())
                    && isPlaying && !userPausedRef.current) {
                    agentDebugLog('useTuneBookMediaController.js:play', 'native-midi-noop-resume', {
                        tuneId: notationTune.id,
                    }, 'H-D');
                    return
                }
                if (isAbcNativePlayInFlight() || nativePlaybackLoadInFlightRef.current) {
                    agentDebugLog('useTuneBookMediaController.js:play', 'native-midi-blocked-inflight', {
                        tuneId: notationTune.id,
                        abcInFlight: isAbcNativePlayInFlight(),
                        loadInFlight: nativePlaybackLoadInFlightRef.current,
                    }, 'H-E');
                    schedulePlaybackKickoffIfNeeded()
                    scheduleQueueAdvanceAutoplayRetry()
                    return
                }
                agentDebugLog('useTuneBookMediaController.js:play', 'native-midi-start', {
                    tuneId: notationTune.id,
                }, 'H-D');
                playingIntentRef.current = true
                userPausedRef.current = false
                playbackStartedRef.current = false
                trackPlaybackStart('midi')
                setIsLoading(true)
                nativePlaybackLoadInFlightRef.current = true
                suppressNativePlaybackEventsBriefly()
                stopLinkedMediaPlayback({ clearCachedBlob: true })
                cancelAbcNativePlayback()
                if (invalidatePendingMidiStartsRef.current) {
                    invalidatePendingMidiStartsRef.current()
                }
                if (pauseSynthRef.current) {
                    pauseSynthRef.current()
                }
                if (suspendSynthAudioContextForNativeRef.current) {
                    suspendSynthAudioContextForNativeRef.current()
                }
                const settings = getMediaPlaybackSettings(notationTune)
                const abc = props.tunebook.abcTools.json2abc(notationTune)
                const durationSec = parseFloat(duration) > 0 ? parseFloat(duration) : 0
                const expectedDuration = (notationTune.id && playbackClockTuneIdRef.current === notationTune.id)
                    ? durationSec
                    : 0
                renderAndPlayAbcNative(abc, {
                    tune: notationTune,
                    tunebook: props.tunebook,
                    title: notationTune.name || 'Tunebook',
                    artist: notationTune.composer || '',
                    tempo: settings.tempo,
                    minDurationSec: expectedDuration,
                    play: true,
                }).then(function(ok) {
                    nativePlaybackLoadInFlightRef.current = false
                    if (!hasActivePlaybackIntent() && !playingIntentRef.current) {
                        setIsLoading(false)
                        return
                    }
                    if (ok) {
                        androidNativeActiveRef.current = true
                        if (pauseSynthRef.current) {
                            pauseSynthRef.current()
                        }
                        if (playerRef && playerRef.current) {
                            try {
                                playerRef.current.pause()
                            } catch (e) {}
                        }
                        confirmPlayingStarted()
                        return
                    }
                    agentDebugLog('useTuneBookMediaController.js:play', 'native-midi-failed', {
                        tuneId: notationTune.id,
                        expectedDuration: expectedDuration,
                        durationTuneId: playbackClockTuneIdRef.current,
                        hadIntent: hasActivePlaybackIntent(),
                    }, 'H-D')
                    setIsLoading(false)
                    if (hasActivePlaybackIntent()) {
                        toast.error('Could not start notation playback')
                    }
                }).catch(function(err) {
                    nativePlaybackLoadInFlightRef.current = false
                    androidNativeActiveRef.current = false
                    setIsLoading(false)
                    agentDebugLog('useTuneBookMediaController.js:play', 'native-midi-error', {
                        tuneId: notationTune.id,
                        message: err && err.message ? String(err.message) : 'unknown',
                        expectedDuration: expectedDuration,
                        durationTuneId: playbackClockTuneIdRef.current,
                    }, 'H-D')
                    if (err && err.message) {
                        console.log(err.message)
                    }
                    if (hasActivePlaybackIntent()) {
                        toast.error('Could not start notation playback')
                    }
                })
                return
            }
            if (prefersNativeMediaPlayback() && props.tunebook && props.tunebook.abcTools) {
                agentDebugLog('useTuneBookMediaController.js:play', 'native-midi-no-tune', {
                    hasTuneState: !!tune,
                    hasTuneRef: !!(tuneRef.current),
                    hasNotationTune: !!notationTune,
                    queueTuneId: getCurrentTuneId(props.nowPlayingQueue),
                }, 'H-N');
                setIsLoading(false)
                if (hasActivePlaybackIntent()) {
                    toast.error('Could not start notation playback')
                }
                return
            }
            beginMidiRouteHandoff({ resumeSynth: true })
            if (!opts.restart && !userPausedRef.current) {
                seekGuardUntilRef.current = 0
                seekWasPlayingRef.current = false
            }
            trackPlaybackStart('midi')
            pendingMidiPlayRef.current = opts
            if (playMidiRef.current) {
                const midiResult = playMidiRef.current(opts)
                if (midiResult === false) {
                    if (hasActivePlaybackIntent()) {
                        promptTapToPlayWhenAutoplayBlocked()
                    } else {
                        pendingMidiPlayRef.current = null
                    }
                    setIsLoading(false)
                } else {
                    // Keep pending armed while synth render/count-in is still in flight;
                    // clearing early drops the retry when beginMidiPlayback defers kickoff.
                    clearPendingMidiPlayAfterEngineAcceptance()
                }
            } else {
                scheduleMidiEngineRegistrationFallback()
            }
            return
        }

        if (route.mode !== 'media') {
            if (shouldKeepIntentWhenRouteNotReady(pendingPlayRequestRef.current, route.mode)) {
                schedulePlaybackKickoffIfNeeded()
                scheduleQueueAdvanceAutoplayRetry()
                return
            }
            playingIntentRef.current = false
            playbackKickoffNeededRef.current = false
            setIsLoading(false)
            return
        }

        trackPlaybackStart('media')

        stopMidiPlayback()
        stopMidiFilePlayback()
        const activeLink = useTune && useTune.links ? useTune.links[linkIndex] : null
        const src = getSrc(useTune, linkIndex)
        const srcType = getSrcType(src, activeLink)

        setIsLoading(true)
        recordPlaybackRouteParity({
            phase: PLAYBACK_ROUTE_PHASE.postDispatch,
            snapshot: playRouteSnapshot,
            branch: 'media-linked',
            activeEngine: getActivePlaybackEngine(),
        })
        startLinkedMediaPlayback(useTune, linkIndex, src, srcType, opts)
        })
    }

    function playNativeMedia(srcType, options) {
        const opts = options || {}
        if (!opts._skipPreferredRoute && hasActivePlaybackIntent()
            && !isSnapcastRemoteActive() && !isCastSdkRemoteActive()) {
            const coord = preferredOutputCoordinatorRef.current
            if (coord && coord.isSnapcastDefault && coord.isSnapcastDefault()) {
                coord.tryRouteOnPlay({ playOpts: opts }).then(function(routed) {
                    if (routed === false && hasActivePlaybackIntent()) {
                        playNativeMedia(srcType, Object.assign({}, opts, { _skipPreferredRoute: true }))
                    }
                })
                return
            }
        }
        srcType = toNativePlayerSrcType(srcType)
        if (cachedNativeBlobUrlRef.current && srcType === 'youtube') {
            srcType = 'audio'
        }
        if (prefersNativeMediaPlayback() && hasActivePlaybackIntent()) {
            hardSilenceWebViewOutputs(getAndroidPlaybackGateContext())
        }
        if (shouldBlockAutoplayDuringSeek(opts)) {
            return
        }
        if (!hasActivePlaybackIntent()) {
            setIsLoading(false)
            return
        }
        if (srcType === 'audio') {
            const activeSrc = getActiveMediaSrc()
            if (activeSrc && requiresResolverProxiedPlayback(activeSrc) && !cachedNativeBlobUrlRef.current) {
                setIsLoading(true)
                ensureProxiedNativeAudioBlob(activeSrc).then(function(ok) {
                    if (ok === true && hasActivePlaybackIntent()) {
                        playNativeMedia(srcType, opts)
                    } else if (ok === 'login_required') {
                        // Waiting for login; toast already shown. Resume after auth.
                    } else if (!ok) {
                        handleMediaPlaybackFailure()
                    }
                })
                return
            }
        }
        if (prefersAndroidNativeAudioPath(
            captureCurrentPlaybackSnapshot(opts),
            srcType,
            prefersNativeMediaPlayback()
        )) {
            hardSilenceWebViewOutputs(getAndroidPlaybackGateContext())
            muteNativePlayers()
            const useTune = tuneRef.current || tune
            const linkIndex = mediaLinkNumberRef.current !== null && mediaLinkNumberRef.current !== undefined
                ? mediaLinkNumberRef.current
                : mediaLinkNumber
            const activeSrc = getSrc(useTune, linkIndex)
            const settings = getMediaPlaybackSettings(useTune)
            const regionStart = getLinkStartAt()
            const positionSec = opts.preservePosition ? getCurrentPlaybackSeconds() : regionStart
            const playUri = cachedNativeBlobUrlRef.current || activeSrc
            if (playUri) {
                if (nativePlaybackLoadInFlightRef.current) {
                    nativePlaybackPendingRetryRef.current = { srcType: srcType, opts: opts }
                    return
                }
                nativePlaybackLoadInFlightRef.current = true
                playAndroidNativeUri(playUri, {
                    title: useTune && useTune.name ? useTune.name : 'Tunebook',
                    artist: useTune && useTune.composer ? useTune.composer : '',
                    positionSec: positionSec,
                    tempo: settings.tempo,
                    play: true,
                }).then(function(ok) {
                    nativePlaybackLoadInFlightRef.current = false
                    const pending = nativePlaybackPendingRetryRef.current
                    nativePlaybackPendingRetryRef.current = null
                    if (pending && hasActivePlaybackIntent()) {
                        playNativeMedia(pending.srcType, pending.opts)
                        return
                    }
                    if (!ok) {
                        androidNativeActiveRef.current = false
                        handleMediaPlaybackFailure()
                    } else {
                        androidNativeActiveRef.current = true
                        confirmPlayingStarted()
                    }
                }).catch(function() {
                    nativePlaybackLoadInFlightRef.current = false
                    nativePlaybackPendingRetryRef.current = null
                    androidNativeActiveRef.current = false
                    handleMediaPlaybackFailure()
                })
                return
            }
            if (hasActivePlaybackIntent()) {
                setIsLoading(false)
                skipBackgroundIncapableTrack('android-audio-no-uri')
                return
            }
        }
        if (prefersNativeMediaPlayback() && srcType === 'audio' && hasActivePlaybackIntent()) {
            handleMediaPlaybackFailure()
            return
        }
        if (!prefersNativeMediaPlayback()) {
            unmuteNativePlayers()
        }
        if (srcType === 'audio') {
            const livePlayer = playerRef && playerRef.current
            if (!isPlayerElementLive(livePlayer)) {
                if (!opts._waitingForPlayer) {
                    setIsLoading(true)
                    waitForLivePlayerElement(4000).then(function(player) {
                        if (!hasActivePlaybackIntent()) return
                        if (!player) {
                            handleMediaPlaybackFailure()
                            return
                        }
                        playNativeMedia(srcType, Object.assign({}, opts, { _waitingForPlayer: true }))
                    })
                    return
                }
                handleMediaPlaybackFailure()
                return
            }
            if (cachedNativeBlobUrlRef.current
                && (livePlayer.getAttribute('src') || livePlayer.src) !== cachedNativeBlobUrlRef.current) {
                livePlayer.src = cachedNativeBlobUrlRef.current
            }
            if (shouldBlockWebViewAudioPlay(getAndroidPlaybackGateContext(), 'playNativeMedia-fallback')) {
                return
            }
            try {
                const regionStart = getLinkStartAt()
                const currentPos = livePlayer.currentTime
                const preservedPos = currentTimeRef.current
                const preserve = opts.preservePosition
                    || (playingIntentRef.current && !userPausedRef.current && preservedPos > regionStart + 0.05)
                if (preserve && preservedPos > regionStart + 0.05
                    && Math.abs(currentPos - preservedPos) > 0.25) {
                    // Fresh media element after host handoff starts at 0; seek to
                    // the position we preserved in controller state.
                    livePlayer.currentTime = preservedPos
                    setCurrentTime(preservedPos)
                } else if (!preserve) {
                    if (livePlayer.ended) {
                        livePlayer.currentTime = regionStart
                        setCurrentTime(regionStart)
                    } else if (regionStart > 0 && currentPos < regionStart - 0.05) {
                        livePlayer.currentTime = regionStart
                        setCurrentTime(regionStart)
                    }
                }
                livePlayer.play().then(
                    function() {
                        applyStoredOutputDeviceToActiveRoute().catch(function() {})
                        confirmPlayingStarted()
                    }).catch(function(e) {
                        if (isAutoplayBlockedError(e)) {
                            promptTapToPlayWhenAutoplayBlocked()
                            setIsPlaying(false)
                            setIsLoading(false)
                            return
                        }
                        if (proxiedNativeBlobPromiseRef.current) {
                            return
                        }
                        handleMediaPlaybackFailure()
                    })
            } catch (e) {
                handleMediaPlaybackFailure()
            }
        } else if (srcType === 'youtube') {
            if (cachedNativeBlobUrlRef.current) {
                playNativeMedia('audio', opts)
                return
            }
            const useTune = tuneRef.current || tune
            const linkIndex = mediaLinkNumberRef.current !== null && mediaLinkNumberRef.current !== undefined
                ? mediaLinkNumberRef.current
                : mediaLinkNumber
            const activeSrc = getSrc(useTune, linkIndex)
            const settings = getActivePlaybackSettings(useTune)
            if (hasStemsForCurrentMedia()) {
                primeStemPlaybackEngine(useTune, linkIndex, activeSrc)
            }

            function playYoutubeIframe() {
                if (cachedNativeBlobUrlRef.current) {
                    playNativeMedia('audio', opts)
                    return
                }
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
                        if (isYoutubeDetachedError(e)) {
                            clearYoutubePlayerRef()
                        }
                        if (isAutoplayBlockedError(e)) {
                            promptTapToPlayWhenAutoplayBlocked()
                            setIsLoading(false)
                        } else if (playingIntentRef.current) {
                            if (pausePlaybackForAdministrativeRoute()) {
                                return
                            }
                            setIsLoading(true)
                        } else {
                            setIsLoading(false)
                        }
                    }
                } else if (playingIntentRef.current) {
                    if (pausePlaybackForAdministrativeRoute()) {
                        return
                    }
                    setNativePlaybackFallbackRequired(true)
                    setIsLoading(true)
                } else {
                    setIsLoading(false)
                }
            }

            if (shouldUseAndroidNativeYoutubeOutput(settings)) {
                const youtubeGetId = props.tunebook.utils.YouTubeGetID
                const videoId = youtubeGetId(activeSrc)
                const regionStart = getLinkStartAt()
                const positionSec = opts.preservePosition ? getCurrentPlaybackSeconds() : regionStart
                if (playbackNeedsExternalProcessing(settings) && canUseNativeFilteredPlayback(settings)) {
                    applyNativeFilteredPlayback(settings, {
                        play: true,
                        forcePlay: true,
                        resumeAt: positionSec,
                    }).then(function(ok) {
                        if (!ok && hasActivePlaybackIntent()) {
                            skipBackgroundIncapableTrack('youtube-processed-failed')
                        }
                    })
                    return
                }
                hardSilenceWebViewOutputs(getAndroidPlaybackGateContext())
                muteNativePlayers()
                setIsLoading(true)
                nativePlaybackLoadInFlightRef.current = true
                logPlaybackDebug('plain-native', { srcType: 'youtube', videoId: videoId })
                playAndroidNativeYoutube(activeSrc, {
                    youtubeGetId: youtubeGetId,
                    title: useTune && useTune.name ? useTune.name : 'Tunebook',
                    artist: useTune && useTune.composer ? useTune.composer : '',
                    positionSec: positionSec,
                    tempo: settings.tempo,
                    filePath: getCachedYoutubeNativePath(videoId),
                    accessToken: getGoogleAccessToken(),
                }).then(function(result) {
                    nativePlaybackLoadInFlightRef.current = false
                    if (result && result.ok) {
                        rememberYoutubeNativeCache(result.videoId, result.filePath)
                        setNativePlaybackFallbackRequired(false)
                        androidNativeActiveRef.current = true
                        confirmPlayingStarted()
                        return
                    }
                    setIsLoading(false)
                    setIsPlaying(false)
                    playingIntentRef.current = false
                    const errMsg = result && result.error
                        ? result.error
                        : 'YouTube playback failed'
                    toast.error(errMsg, { autoClose: 4000 })
                }).catch(function(err) {
                    nativePlaybackLoadInFlightRef.current = false
                    setIsLoading(false)
                    setIsPlaying(false)
                    playingIntentRef.current = false
                    const errMsg = err && err.message ? err.message : 'YouTube playback failed'
                    toast.error(errMsg, { autoClose: 4000 })
                })
                return
            }

            if (prefersNativeMediaPlayback() && hasActivePlaybackIntent()) {
                skipBackgroundIncapableTrack('youtube-iframe-blocked')
                return
            }

            playYoutubeIframe()
        } else if (srcType === 'audio' && playingIntentRef.current) {
            if (prefersNativeMediaPlayback()) {
                playNativeMedia(srcType, opts)
                return
            }
            // Audio element not mounted yet — onMediaReady will retry playback.
            setIsLoading(true)
        } else {
            setIsLoading(false)
        }
    }
    
    function pause() {
        if (isMidiPlaybackRoute()) {
            agentDebugLog('useTuneBookMediaController.js:pause', 'midi-pause', {
                nativeActive: isAndroidNativeOutputActive(),
                playingIntent: playingIntentRef.current,
            }, 'H-C');
        }
        if (isSnapcastRemoteActive()) {
            const pauseSnapcast = snapcastOutputHandlersRef.current && snapcastOutputHandlersRef.current.pauseSnapcast
            if (pauseSnapcast) {
                pauseSnapcast()
            }
            seekWasPlayingRef.current = false
            userPausedRef.current = true
            playingIntentRef.current = false
            setIsPlaying(false)
            return
        }
        if (isCastSdkRemoteActive()) {
            if (remoteOutputHandlersRef.current && remoteOutputHandlersRef.current.pauseCast) {
                remoteOutputHandlersRef.current.pauseCast()
            }
            seekWasPlayingRef.current = false
            userPausedRef.current = true
            playingIntentRef.current = false
            setIsPlaying(false)
            return
        }
        seekWasPlayingRef.current = false
        userPausedRef.current = true
        playingIntentRef.current = false
        playbackStartedRef.current = false
        pendingPlayRequestRef.current = null
        pendingMidiPlayRef.current = null
        cancelYoutubePlayPoll()
        clearYoutubeAutostartWatchdog()
        setTapToPlay(false)
        stopProgressSync()
        cleanupTimers()
        snapshotPlaybackPosition()
        userGesturePlayRef.current = false
        setIsPlaying(false)
        setIsLoading(false)
        cancelPlaylistTitleAnnouncement()
        if (isMidiPlaybackRoute() && !isAndroidNativeOutputActive()) {
            // Cancel in-flight count-in / primes, but keep the rendered MIDI buffer so
            // pause→play and natural end→replay do not re-prime (and fail with toast).
            if (invalidatePendingMidiStartsRef.current) {
                invalidatePendingMidiStartsRef.current()
            }
            if (pauseSynthRef.current) {
                pauseSynthRef.current()
            } else if (stopMidiSynthRef.current) {
                stopMidiSynthRef.current()
            }
        }
        if (isMidiPlaybackRoute() && stopMetronomeRef.current) {
            stopMetronomeRef.current()
        }
        if (isMidiFileMediaRoute() && pauseMidiFileRef.current) {
            pauseMidiFileRef.current()
        }
        if (androidNativeActiveRef.current || isAndroidNativePlayerActive()) {
            pauseAndroidNativePlayer()
        }
        silencePlaybackOutputs()
        stopPlaybackKeepAlive()
        updateMediaSessionState()
    }

    function stop() {
        if (isSnapcastRemoteActive()) {
            const stopSnapcast = snapcastOutputHandlersRef.current && snapcastOutputHandlersRef.current.stopSnapcast
            if (stopSnapcast) {
                stopSnapcast()
            } else {
                remoteOutputEngineRef.current = null
            }
        }
        if (isCastSdkRemoteActive()) {
            const stopCast = remoteOutputHandlersRef.current && remoteOutputHandlersRef.current.stopCast
            if (stopCast) {
                stopCast()
            } else {
                remoteOutputEngineRef.current = null
            }
        }
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
        cancelPlaylistTitleAnnouncement()
        clearYoutubeAutostartWatchdog()
        cleanupTimers()
        stopPlaybackKeepAlive()
        updateMediaSessionState()
        const startAt = getLinkStartAt()
        setClickSeek(0)
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
        if (androidNativeActiveRef.current || isAndroidNativePlayerActive()) {
            androidNativeActiveRef.current = false
            stopAndroidNativePlayer()
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
                seekMidiRef.current(clamped, { skipAutoResume: !wasPlaying })
            }
            setClickSeek(clamped)
            if (!wasPlaying) {
                cancelPausedPlaybackSeek()
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

        const total = resolvePlaybackDuration()
        if (total <= 0) {
            endSeekOperation()
            return
        }
        seekToSeconds(total * clamped, { wasPlaying: wasPlaying, skipSeekOperation: true })
    }

    function rewindToStart() {
        if (isPlaying) {
            restartPlaybackFromStart()
            return
        }
        userPausedRef.current = false
        notationPlaybackSeekRef.current = null
        notationPlaybackStartSecondsRef.current = null
        pendingMidiPlayRef.current = null
        if (stopMetronomeRef.current) {
            stopMetronomeRef.current()
        }
        if (armPlaybackFromZeroRef.current) {
            armPlaybackFromZeroRef.current()
        }
        const startAt = playbackRouteRef.current.mode === 'media' ? getLinkStartAt() : 0
        setClickSeek(0)
        setCurrentTime(startAt)
        currentTimeRef.current = startAt
        seekToSeconds(startAt, { wasPlaying: false, skipSeekOperation: true })
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
            getRhythmPhase: function() {
                return getRhythmPlaybackPhaseRef.current
                    ? getRhythmPlaybackPhaseRef.current()
                    : null
            },
            getRhythmDiagnostics: function() {
                return getRhythmDiagnosticsRef.current
                    ? getRhythmDiagnosticsRef.current()
                    : null
            },
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
        window.getRhythmDiagnostics = function() {
            return window.__abc2bookPlaybackTest.getRhythmDiagnostics()
        }
        return function() {
            delete window.__abc2bookPlaybackTest
            delete window.getRhythmDiagnostics
        }
    }, [])
    
    
    return {play, playFromUserGesture, preparePlaybackFromUserGesture, unlockAudioFromUserGesture, requestPlayback, hasPendingPlayRequest, flushPendingPlayRequest, consumePendingPlayRequest, stop, pause, restartPlaybackFromStart, canResumePlayback, seek, seekToSeconds, seekBySeconds, rewindToStart, getPlaybackProgress, getSeekSettlement, currentTime,setCurrentTime, duration, setDuration, playerRef, filteredPlayerRef, ytPlayerRef, onEnded, onError, onTimeUpdate,onAbcTimeUpdate, onYtTimeUpdate ,onYtStateChange,  onYtReady, onMediaReady, isPlaying, setIsPlaying, isLoading, setIsLoading, isReady, setIsReady,  tune, setTune, updateTunePlaybackSettings, applyLivePlaybackSettings, setGlobalPlaybackTempo, updateTuneAudioFilterSettings, stemSeparationActive, stemAnalysisProgress, stemsReadyForMedia, hasStemsForCurrentMedia, analyseMediaStems, cancelStemAnalysis, getProcessedMediaExportFilename, buildProcessedMediaExport, saveProcessedMediaToFile, getDemucsModel, getAvailableAudioFilterKeys, getAvailableStemNames, availableStemNames, pitchShiftPreparing, finishPitchShiftPrepareRef, applyPlaybackSettingsLiveRef, applyMidiTempoRef, applyPlaybackVolumeRef, resumeSynthAudioContextRef, getSynthAudioContextRef, resumeMidiFileAudioContextRef, getMidiFileAudioContextRef, pauseSynthRef, suspendSynthAudioContextForNativeRef, stopMetronomeRef, invalidatePendingMidiStartsRef, isMidiKickoffActiveRef, armPlaybackFromZeroRef, getRhythmPlaybackPhaseRef, getRhythmDiagnosticsRef, stopMidiSynthRef, playMidiRef, pendingMidiPlayRef, notationPlaybackStartSecondsRef, notationPlaybackSeekRef, notationStaffCursorRef, resumeMidiAfterSeekRef, seekMidiRef, getMidiPlaybackSecondsRef, getMidiCursorSecondsRef, getAudibleMsPerMeasureRef, playMidiFileRef, pauseMidiFileRef, seekMidiFileRef, getMidiFilePlaybackSecondsRef, applyMidiFileTempoRef, prepareMidiFileLinkRef, pendingMidiFilePlayRef, flushPendingMidiFilePlay, stopMidiFileRef, userGesturePlayRef, mediaLinkNumber, playbackRouteMode, requestedPlayState, setMediaLinkNumber, getSrc, getSrcType, getLinkedMediaResolveOptions, getGoogleAccessToken, playbackSpeed, setPlaybackSpeed, playbackVolume, setPlaybackVolume, adjustPlaybackVolume, playbackVolumeStep: PLAYBACK_VOLUME_STEP, clickSeek, setClickSeek, checkAudioContext, forceMidiChange, midiHash, cleanupTimers, tapToPlay, tapToPlayReason, setTapToPlay, dismissLoadFailurePrompt, reportPlaybackFailure: handleMediaPlaybackFailure, playlistStalled, clearPlaylistStall, playCancelled, setPlayCancelled, notationMidiOwner, setNotationMidiOwner, startNotationMidiPlayback, stopNotationMidiPlayback, clearNotationPlayRetry, prepareExternalMedia, destroyExternalMedia, notifyYoutubeSrcChanged, clearYoutubePlayerRef, resetPracticeMediaPlayback, pauseYoutubeOutputOnly, silencePlaybackOutputs, updateLinkPlaybackLoops, downloadExternalMedia, checkExternalMediaCached, saveExternalMediaToFile, getLinkStartAt, getLinkEndAt, getLinkPlaybackLoop, externalMediaActive, isExternalOutputActive, isAndroidNativeOutputActive, isAndroidNativePlaybackStarting, nativePlaybackFallbackRequired, shouldIgnoreNativePlaybackEvents, shouldSuppressSpuriousPause, recoverUnexpectedNativePause, shouldSuppressPlaybackEndSeek, shouldAdvanceQueueOnPlaybackEnd, usesExternalPitchTempo, shouldSuppressHtml5AudioSrc, shouldSuppressYoutubeEmbed, mediaResolverAvailable, mediaResolverChecked, mediaResolverStatus, resolverFeatures, stemsCapabilityAvailable, mediaResolverFeaturesEnabled: stemsCapabilityAvailable, refreshMediaResolverHealth, resumeAudioContextAndPlay, reportNotationPrimeFailure, latchMidiPrimeQuiet, resumeExternalAudioContextFromGesture, clearMidiEngineRegistrationFallback, ensureStemLivePlaybackHandoff, primeStemPlaybackEngine, prepareStemFilterHandoff, confirmPlayingStarted, abortPlayingIntent, armPlaybackIntent, needsPlaybackKickoff, kickPlaybackAfterEngineReady, hasPlayingIntent, hasActivePlaybackIntent, isPracticeSessionActive, isSeekGuardActive, isMidiPlaybackRoute, isMidiFileMediaRoute, isMediaPlaybackRoute, isLinkedMediaPlaybackInFlight, applyPlaybackRoute, maybeAutostart, setPracticeSessionHandler, setPracticeSessionActive, invokePracticeSessionHandler, captureSuspendedQueuePlayback, restoreSuspendedQueuePlayback, consumeQueuePlaybackResume, getPlaybackHandoffPosition, applyPreservedPlaybackPosition, getActivePreparedMediaSrc, shouldPreserveMediaEngineOnHostHandoff, nativePlaybackSrcOverride, clearCachedNativePlaybackUrl, remoteOutputEngineRef, setRemoteOutputHandlers, setSnapcastOutputHandlers, setPreferredOutputCoordinator, isRemoteOutputActive, muteLocalOutputsForRemote, applyOutputDevice, reapplyStoredOutputDevice, getPlaybackAudioContexts, prefetchTuneMediaLink}
   //srcSelection, setSrcSelection, src, setSrc,
}
 
