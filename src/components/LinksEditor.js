import {useRef, useState, useEffect, useMemo} from 'react'
import {useNavigate} from 'react-router-dom'
import {Button, ButtonGroup, Form, Badge} from 'react-bootstrap'
import SafeYouTube from './SafeYouTube'
import YouTubeSearchModal from './YouTubeSearchModal'
import LinkPlayRangeModal from './LinkPlayRangeModal'
import ScratchpadWorkspacePickerModal from './scratchpad/ScratchpadWorkspacePickerModal'
import MediaImportWizard from './MediaImportWizard'
import {
    TuneMediaAnalysisProvider,
    useTuneMediaAnalysisDeps,
} from '../useTuneMediaAnalysis'
import MediaImportEntryButton from './MediaImportEntryButton'
import FileInputButton from './FileInputButton'
import useMediaResolverHealth from '../useMediaResolverHealth'
import useAudioUtils from '../useAudioUtils'
import useGoogleDocument from '../useGoogleDocument'
import {
    createRecordingLink,
    createAttachedAudioLink,
    createAttachedMidiLink,
    isOwnedMediaLink,
    isOwnedMediaLinkUri,
    getOwnedMediaSyncStatus,
    resolveRecordingLinkAudio,
    resolveRecordingLinkMidi,
} from '../linkRecording'
import { isYoutubeDetachedPlayerError } from '../youtubePlayerErrors'
import { shouldLockMediaCacheForLink } from '../mediaCacheLock'
import { scheduleSelectedMediaLinkCache } from '../mediaLinkAutoCache'
import { getActiveResolverAccessToken } from '../mediaResolverHealthStore'
import { isDeviceFileResult, isMusicCollectionResult } from '../mediaLinkSearchDisplay'
import { mediaFileAcceptList, isAudioImportFile, isMidiImportFile, readAudioFileMetadata } from '../audioFileMetadata'
import { getLinkSrcType } from '../checkTuneLinkPlayback'
import {
    fetchDirectOrProxy,
    normalizeAccessToken,
    requiresResolverProxiedPlayback,
} from '../mediaProxyClient'
import FieldVoiceFillButton from './FieldVoiceFillButton'
import { createScratchpadItemFromLink, linkCanOpenInScratchpad } from '../scratchpadFromLink'
import { exportMidiLinkToScratchpad } from '../exportMidiLinkToScratchpad'
import { scratchpadItemPath } from '../scratchpadExportToast'
import { showResolverLoginToastForAuthError } from '../resolverLoginToast'
import { getGatedActionLabel } from '../resolverCreditAccess'
import { getMidiExportNotationAccess } from '../midiExportNotationAccess'
import useMidiFilePlayback from '../useMidiFilePlayback'
import { resolveMidiLinkPlaybackData } from '../midiLinkResolve'
import useAbcjsParser from '../useAbcjsParser'
import { fetchAudioGenerationBackends } from '../musicGenerationClient'
import { getAudioGenerationAccess } from '../audioGenerationAccess'
import { isMusicGenerationAdmin } from '../musicGenerationAdmin'
import { useCreditAffordance } from '../useCreditAffordance'
import {
  defaultCoverStylePrompt,
  enqueueLinkedCoverJob,
  enqueuePracticeTrackJob,
  getPracticeTrackPlan,
  hasPracticeTrackMidiData,
  linkSupportsAudioCover,
} from '../audioGenerationActions'
import RegenerateCoverModal from './RegenerateCoverModal'

const YT_PLAYING = 1
const YT_ENDED = 0

const LINKS_TOOLBAR_BTN_STYLE = { color: 'black' }

function LinksEditorToolbarButton({ icon, label, variant, style, className, iconOnly, children, ...buttonProps }) {
    const classes = ['links-editor-toolbar-btn']
    if (iconOnly) classes.push('links-editor-toolbar-btn-icon-only')
    if (className) classes.push(className)
    return (
        <Button
            className={classes.join(' ')}
            variant={variant}
            style={Object.assign({}, LINKS_TOOLBAR_BTN_STYLE, style || {})}
            aria-label={label}
            title={label}
            {...buttonProps}
        >
            {icon ? <span className="links-editor-toolbar-btn-icon" aria-hidden="true">{icon}</span> : null}
            {!iconOnly && <span className="links-editor-toolbar-btn-label">{children || label}</span>}
        </Button>
    )
}

function linkUriString(link) {
    if (!link) return ''
    const value = link.link
    if (value === null || value === undefined) return ''
    if (typeof value === 'string') return value
    if (typeof value === 'object' && value && value.link != null) return String(value.link)
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    return ''
}

function mediaSearchCandidateUri(candidate) {
    if (!candidate) return ''
    const direct = candidate.link
    if (direct != null && direct !== '') {
        if (typeof direct === 'string') return direct
        if (typeof direct === 'object' && direct.link != null) return String(direct.link)
        if (typeof direct === 'number' || typeof direct === 'boolean') return String(direct)
    }
    const uri = String(candidate.uri || '').trim()
    if (uri) return uri
    const youtubeId = String(candidate.youtubeId || candidate.id || '').trim()
    if (youtubeId && candidate.source === 'youtube') {
        return 'https://www.youtube.com/watch?v=' + youtubeId
    }
    return ''
}

function tuneLinkFromMediaSearchCandidate(candidate) {
    const link = {
        title: candidate && candidate.title ? String(candidate.title) : '',
        link: mediaSearchCandidateUri(candidate),
        startAt: '',
        endAt: '',
    }
    if (candidate && candidate.source) link.source = String(candidate.source)
    if (candidate && candidate.id) link.collectionEntryId = String(candidate.id)
    if (candidate && candidate.path) link.collectionPath = String(candidate.path)
    if (candidate && candidate.uri) link.deviceFileUri = String(candidate.uri)
    if (candidate && candidate.image) link.image = candidate.image
    return link
}

function linkIsPreviewable(link, isYoutubeLink) {
    if (!link || !linkUriString(link).trim()) return false
    const srcType = getLinkSrcType(link, isYoutubeLink)
    return srcType === 'audio' || srcType === 'recording' || srcType === 'youtube' || srcType === 'midifile'
}

function parseLinkStartSeconds(link) {
    if (!link || link.startAt === null || link.startAt === undefined) return 0
    const parsed = parseFloat(String(link.startAt).trim())
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function parseLinkEndSeconds(link) {
    if (!link || link.endAt === null || link.endAt === undefined) return null
    const parsed = parseFloat(String(link.endAt).trim())
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function ownedMediaSourceLabel(link) {
    if (link && link.mediaKind === 'midi') return 'MIDI file'
    if (link && link.source === 'file') return 'Attached file'
    return 'Recording'
}

function syncStatusLabel(status) {
    if (status === 'synced') return 'Synced'
    if (status === 'pending') return 'Pending upload'
    return 'Local only'
}

function tunesForMediaAnalysis(props) {
  if (props.tunes && typeof props.tunes === 'object') return props.tunes
  const tune = props.tune
  if (tune && tune.id) {
    const map = {}
    map[tune.id] = tune
    return map
  }
  return {}
}

function LinksEditorBody(props) {
    const navigate = useNavigate()
    function onChange(links) {
        props.onChange(links)
    }

    const audioUtils = useAudioUtils()
    const driveDocs = useGoogleDocument(props.token, function() {})
    const { available: resolverAvailable, checked: resolverChecked, status: resolverStatus, features: resolverFeatures } = useMediaResolverHealth()
    const resolverAccessContext = useMemo(function() {
        return {
            resolverAvailable: resolverAvailable,
            resolverChecked: resolverChecked,
            resolverStatus: resolverStatus,
            features: resolverFeatures,
            accessToken: props.token,
            user: props.user,
        }
    }, [resolverAvailable, resolverChecked, resolverStatus, resolverFeatures, props.token, props.user])
    const midiExportAccess = useMemo(function() {
        return getMidiExportNotationAccess(resolverAccessContext)
    }, [resolverAccessContext])
    const abcjsParser = useAbcjsParser({ tunebook: props.tunebook })
    const [audioBackends, setAudioBackends] = useState(null)
    const [practiceGenerating, setPracticeGenerating] = useState(false)
    const [linkRegeneratingIndex, setLinkRegeneratingIndex] = useState(null)
    const [pendingPracticeGenerate, setPendingPracticeGenerate] = useState(false)
    const [pendingLinkRegenerateIndex, setPendingLinkRegenerateIndex] = useState(null)
    const [regenerateCoverLinkIndex, setRegenerateCoverLinkIndex] = useState(null)
    const [regenerateCoverError, setRegenerateCoverError] = useState('')
    const practiceAffordance = useCreditAffordance(props.token, 'practice_track')
    const coverAffordance = useCreditAffordance(props.token, 'linked_cover')
    const combinedAffordance = useMemo(function() {
        if (!practiceAffordance.checked || !coverAffordance.checked) {
            return { checked: false, affordable: true }
        }
        return {
            checked: true,
            affordable: practiceAffordance.affordable && coverAffordance.affordable,
            estimateCents: Math.max(
                Number(practiceAffordance.estimateCents) || 0,
                Number(coverAffordance.estimateCents) || 0
            ),
            availableCents: Math.min(
                Number(practiceAffordance.availableCents) || Infinity,
                Number(coverAffordance.availableCents) || Infinity
            ),
            shortfallCents: Math.max(
                Number(practiceAffordance.shortfallCents) || 0,
                Number(coverAffordance.shortfallCents) || 0
            ),
            creditUnlimited: practiceAffordance.creditUnlimited || coverAffordance.creditUnlimited,
            error: practiceAffordance.error || coverAffordance.error,
        }
    }, [practiceAffordance, coverAffordance])
    const audioGenerationAccess = useMemo(function() {
        return getAudioGenerationAccess(Object.assign({}, resolverAccessContext, {
            backends: audioBackends,
            affordance: combinedAffordance,
        }))
    }, [resolverAccessContext, audioBackends, combinedAffordance])
    const recordingStartedAt = useRef(0)
    const recordingIntervalRef = useRef(null)
    const [warning, setWarning] = useState('')
    const [showMediaWizard, setShowMediaWizard] = useState(false)
    const [wizardLinkIndex, setWizardLinkIndex] = useState(null)
    const [wizardAutoStartAnalysis, setWizardAutoStartAnalysis] = useState(false)
    const [recordingDuration, setRecordingDuration] = useState(0)
    const [scratchpadLinkIndex, setScratchpadLinkIndex] = useState(null)
    const [ownedMediaBusy, setOwnedMediaBusy] = useState(false)
    const [previewLinkIndex, setPreviewLinkIndex] = useState(null)
    const [previewLoadingIndex, setPreviewLoadingIndex] = useState(null)
    const [playRangeLinkIndex, setPlayRangeLinkIndex] = useState(null)
    const [midiExportLinkIndex, setMidiExportLinkIndex] = useState(null)
    const [showMidiExportPicker, setShowMidiExportPicker] = useState(false)
    const [midiExportBusy, setMidiExportBusy] = useState(false)
    const [pendingMidiExportLinkIndex, setPendingMidiExportLinkIndex] = useState(null)
    const [youtubePreview, setYoutubePreview] = useState(null)
    const previewAudioRef = useRef(null)
    const previewBlobUrlRef = useRef(null)
    const youtubePlayerRef = useRef(null)
    const youtubeEndPollRef = useRef(null)
    const youtubePreviewRef = useRef(null)
    const simplified = !!props.simplified

    const youtubeSearchQuery = [
        props.tune && props.tune.name,
        props.tune && props.tune.composer,
        props.tune && props.tune.rhythm,
    ].filter(Boolean).join(' ').trim()
    const tuneForMedia = props.tune
        ? Object.assign({}, props.tune, { id: props.tune.id || props.tuneId || '' })
        : null
    const isYoutubeLink = props.tunebook && props.tunebook.utils && props.tunebook.utils.isYoutubeLink
    const practiceTrackReady = useMemo(function() {
        const tune = tuneForMedia || props.tune
        if (!tune) return false
        return hasPracticeTrackMidiData(tune, props.tunebook, abcjsParser)
    }, [tuneForMedia, props.tune, props.tunebook, abcjsParser])
    // Music generation UI is admin-only (see musicGenerationAdmin / getAudioGenerationAccess).
    const showAudioGenerationControls = isMusicGenerationAdmin(props.user, resolverStatus)
    const showPracticeGenerate = showAudioGenerationControls
        && resolverChecked
        && practiceTrackReady
        && audioGenerationAccess.showButton
    const showLinkedCoverRegenerate = showAudioGenerationControls
        && resolverChecked
        && audioGenerationAccess.showButton

    const midiFilePreview = useMidiFilePlayback({
        onEnded: function() {
            setPreviewLinkIndex(null)
            setPreviewLoadingIndex(null)
        },
        onError: function(message) {
            if (message) {
                setWarning(String(message))
            }
            setPreviewLinkIndex(null)
            setPreviewLoadingIndex(null)
        },
    })

    useEffect(function() {
        if (pendingMidiExportLinkIndex == null) return undefined
        if (!midiExportAccess.canExport) return undefined
        if (!props.token || !props.token.access_token) return undefined
        setMidiExportLinkIndex(pendingMidiExportLinkIndex)
        setShowMidiExportPicker(true)
        setPendingMidiExportLinkIndex(null)
        return undefined
    }, [pendingMidiExportLinkIndex, midiExportAccess.canExport, props.token])

    useEffect(function() {
        if (!resolverChecked || !props.token || !props.token.access_token) return undefined
        let cancelled = false
        fetchAudioGenerationBackends({ token: props.token }).then(function(payload) {
            if (!cancelled) setAudioBackends(payload)
        }).catch(function() {
            if (!cancelled) setAudioBackends(null)
        })
        return function() {
            cancelled = true
        }
    }, [resolverChecked, props.token])

    function handleTuneChange(updated) {
        if (typeof props.onTuneChange === 'function') {
            props.onTuneChange(updated)
            return
        }
        if (updated && Array.isArray(updated.links)) {
            props.onChange(updated.links)
        }
    }

    async function runPracticeTrackGeneration() {
        const tune = getTuneForOwnedMedia() || tuneForMedia || props.tune
        if (!tune || !tune.id) {
            setWarning('Save the tune before generating audio.')
            return
        }
        setPracticeGenerating(true)
        setWarning('')
        try {
            await enqueuePracticeTrackJob({
                tune: tune,
                tunebook: props.tunebook,
                abcjsParser: abcjsParser,
                token: props.token,
                onTuneChange: handleTuneChange,
                forceRefresh: props.forceRefresh,
            })
        } catch (err) {
            if (err && err.message) setWarning(err.message)
        } finally {
            setPracticeGenerating(false)
        }
    }

    async function runLinkedCoverRegeneration(linkIndex, coverOptions) {
        const tune = getTuneForOwnedMedia() || tuneForMedia || props.tune
        const link = props.links && props.links[linkIndex]
        if (!tune || !tune.id || !link) {
            setWarning('Save the tune before regenerating audio.')
            return
        }
        setLinkRegeneratingIndex(linkIndex)
        setWarning('')
        setRegenerateCoverError('')
        try {
            const opts = coverOptions || {}
            await enqueueLinkedCoverJob({
                tune: tune,
                tunebook: props.tunebook,
                abcjsParser: abcjsParser,
                token: props.token,
                link: link,
                linkIndex: linkIndex,
                tuneId: getTuneId(),
                driveApi: driveDocs,
                onTuneChange: handleTuneChange,
                forceRefresh: props.forceRefresh,
                stylePrompt: opts.stylePrompt,
                lyrics: opts.lyrics,
                presetId: opts.presetId,
            })
            setRegenerateCoverLinkIndex(null)
        } catch (err) {
            const message = err && err.message
                ? err.message
                : 'Could not start cover regeneration.'
            setRegenerateCoverError(message)
            setWarning(message)
        } finally {
            setLinkRegeneratingIndex(null)
        }
    }

    function beginPracticeTrackGeneration() {
        runResolverGatedAction(audioGenerationAccess, null, {
            loginRequiredMessage: 'Log in to generate practice tracks',
            setPending: function() { setPendingPracticeGenerate(true) },
            clearPending: function() { setPendingPracticeGenerate(false) },
            onReady: function() { runPracticeTrackGeneration() },
        })
    }

    function beginLinkedCoverRegeneration(linkIndex) {
        runResolverGatedAction(audioGenerationAccess, linkIndex, {
            loginRequiredMessage: 'Log in to regenerate audio from this link',
            setPending: setPendingLinkRegenerateIndex,
            clearPending: function() { setPendingLinkRegenerateIndex(null) },
            onReady: function(index) {
                if (!normalizeAccessToken(props.token) && !getActiveResolverAccessToken()) {
                    showResolverLoginToastForAuthError(null, {
                        force: true,
                        accessToken: props.token,
                        resolverStatus: resolverStatus,
                        message: 'Log in to regenerate audio from this link',
                    })
                    return
                }
                setRegenerateCoverError('')
                setRegenerateCoverLinkIndex(index)
            },
        })
    }

    useEffect(function() {
        if (!pendingPracticeGenerate) return undefined
        if (!audioGenerationAccess.canGenerate) return undefined
        setPendingPracticeGenerate(false)
        runPracticeTrackGeneration()
        return undefined
    }, [pendingPracticeGenerate, audioGenerationAccess.canGenerate])

    useEffect(function() {
        if (pendingLinkRegenerateIndex == null) return undefined
        if (!audioGenerationAccess.canGenerate) return undefined
        const index = pendingLinkRegenerateIndex
        setPendingLinkRegenerateIndex(null)
        setRegenerateCoverLinkIndex(index)
        return undefined
    }, [pendingLinkRegenerateIndex, audioGenerationAccess.canGenerate])

    function runResolverGatedAction(access, linkIndex, options) {
        const opts = options || {}
        if (!access.showButton) return
        if (access.needsLogin) {
            // Admin Generate can show while health is still login_required; if we
            // already have a bearer, do not open Login (that probes with a null
            // token and can look like a logout + "Login to continue" toast).
            if (normalizeAccessToken(props.token)) {
                if (opts.onReady) opts.onReady(linkIndex)
                return
            }
            if (typeof props.login !== 'function') {
                setWarning(opts.loginRequiredMessage || 'Log in to continue')
                return
            }
            if (opts.setPending) opts.setPending(linkIndex)
            props.login().catch(function(e) {
                if (opts.clearPending) opts.clearPending()
                if (e && e.message && e.message.indexOf('cancelled') === -1
                    && e.message.indexOf('Sign-in cancelled') === -1) {
                    setWarning(e.message)
                }
            })
            return
        }
        if (access.needsCredit || access.cannotAfford) {
            if (typeof window !== 'undefined') {
                window.location.assign('/settings?tab=providers&credit=1')
            }
            return
        }
        if (opts.onReady) opts.onReady(linkIndex)
    }

    function beginMidiExportToNotation(linkIndex) {
        if (previewLinkIndex === linkIndex) {
            stopLinkPreview()
        }
        runResolverGatedAction(midiExportAccess, linkIndex, {
            loginRequiredMessage: 'Log in to export MIDI to notation',
            setPending: setPendingMidiExportLinkIndex,
            clearPending: function() { setPendingMidiExportLinkIndex(null) },
            onReady: function(index) {
                setMidiExportLinkIndex(index)
                setShowMidiExportPicker(true)
            },
        })
    }

    function stopYoutubePreview() {
        if (youtubeEndPollRef.current) {
            clearInterval(youtubeEndPollRef.current)
            youtubeEndPollRef.current = null
        }
        const player = youtubePlayerRef.current
        if (player) {
            try {
                player.pauseVideo()
                player.stopVideo()
            } catch (e) {}
        }
        youtubePlayerRef.current = null
        youtubePreviewRef.current = null
        setYoutubePreview(null)
    }

    function stopLinkPreview() {
        stopYoutubePreview()
        midiFilePreview.stop()
        const audio = previewAudioRef.current
        if (audio) {
            audio.pause()
            audio.removeAttribute('src')
            try {
                audio.load()
            } catch (e) {}
        }
        previewAudioRef.current = null
        if (previewBlobUrlRef.current) {
            URL.revokeObjectURL(previewBlobUrlRef.current)
            previewBlobUrlRef.current = null
        }
        setPreviewLinkIndex(null)
        setPreviewLoadingIndex(null)
    }

    useEffect(function() {
        if (props.isOpen === false) {
            stopLinkPreview()
        }
    }, [props.isOpen])

    useEffect(function() {
        return function() {
            stopLinkPreview()
        }
    }, [])

    function storePreviewBlobUrl(blobUrl) {
        if (previewBlobUrlRef.current) {
            URL.revokeObjectURL(previewBlobUrlRef.current)
        }
        previewBlobUrlRef.current = blobUrl
        return blobUrl
    }

    async function fetchExternalPreviewBlobUrl(src, srcType) {
        const youtubeGetId = props.tunebook && props.tunebook.utils && props.tunebook.utils.YouTubeGetID
        const response = await fetchDirectOrProxy({
            src: src,
            srcType: srcType,
            youtubeGetId: youtubeGetId,
            accessToken: props.token,
        }).then(function(result) { return result.response })
        const blob = await response.blob()
        return storePreviewBlobUrl(URL.createObjectURL(blob))
    }

    function shouldProxyLinkPreviewSrc(src, srcType) {
        if (srcType !== 'audio') return false
        const value = String(src || '').trim()
        if (!value) return false
        if (value.startsWith('blob:') || value.startsWith('data:')) return false
        return value.startsWith('http://') || value.startsWith('https://')
    }

    async function resolveLinkPreviewSrc(link, linkIndex, options) {
        const opts = options || {}
        const src = linkUriString(link).trim()
        const srcType = getLinkSrcType(link, isYoutubeLink)
        if (srcType === 'recording') {
            const tuneId = getTuneId()
            if (!tuneId) {
                throw new Error('Save the tune before previewing recordings.')
            }
            const resolved = await resolveRecordingLinkAudio(link, tuneId, linkIndex, {
                accessToken: props.token,
                driveApi: driveDocs,
                forPlayback: true,
            })
            if (!resolved || !resolved.blob) {
                throw new Error('Recording is not available for preview.')
            }
            return storePreviewBlobUrl(URL.createObjectURL(resolved.blob))
        }
        if (opts.forceFetch || shouldProxyLinkPreviewSrc(src, srcType)) {
            return fetchExternalPreviewBlobUrl(src, srcType)
        }
        return src
    }

    function attachPreviewPlaybackHandlers(audio, link) {
        const startAt = parseLinkStartSeconds(link)
        const endAt = parseLinkEndSeconds(link)

        audio.addEventListener('loadedmetadata', function() {
            if (startAt > 0) {
                try {
                    audio.currentTime = startAt
                } catch (e) {}
            }
        }, { once: true })

        if (endAt !== null) {
            audio.addEventListener('timeupdate', function() {
                if (audio.currentTime >= endAt) {
                    stopLinkPreview()
                }
            })
        }

        audio.addEventListener('ended', function() {
            stopLinkPreview()
        })
    }

    async function startLinkPreviewPlayback(link, linkIndex, src) {
        const audio = new Audio(src)
        attachPreviewPlaybackHandlers(audio, link)

        const playbackError = new Promise(function(resolve, reject) {
            audio.addEventListener('error', function() {
                reject(new Error('Could not preview this link.'))
            }, { once: true })
        })

        previewAudioRef.current = audio
        await Promise.race([
            audio.play(),
            playbackError,
        ])
        setPreviewLinkIndex(linkIndex)
        setPreviewLoadingIndex(null)
    }

    function onYoutubePreviewReady(event) {
        const player = event.target
        youtubePlayerRef.current = player
        const preview = youtubePreviewRef.current
        if (!preview) return

        const startAt = parseLinkStartSeconds(preview.link)
        const endAt = parseLinkEndSeconds(preview.link)

        if (startAt > 0) {
            try {
                player.seekTo(startAt, true)
            } catch (e) {}
        }

        if (endAt !== null) {
            youtubeEndPollRef.current = setInterval(function() {
                try {
                    if (player.getCurrentTime() >= endAt) {
                        stopLinkPreview()
                    }
                } catch (e) {}
            }, 250)
        }

        try {
            player.playVideo()
        } catch (e) {
            if (isYoutubeDetachedPlayerError(e)) return
            setWarning('Could not preview this YouTube link.')
            stopLinkPreview()
        }
    }

    function onYoutubePreviewStateChange(event) {
        if (event.data === YT_PLAYING) {
            const preview = youtubePreviewRef.current
            if (preview) {
                setPreviewLinkIndex(preview.linkIndex)
                setPreviewLoadingIndex(null)
            }
            return
        }
        if (event.data === YT_ENDED) {
            stopLinkPreview()
        }
    }

    function onYoutubePreviewError() {
        setWarning('Could not preview this YouTube link.')
        stopLinkPreview()
    }

    function startYoutubePreview(link, linkIndex) {
        const youtubeGetId = props.tunebook && props.tunebook.utils && props.tunebook.utils.YouTubeGetID
        const videoId = youtubeGetId ? youtubeGetId(linkUriString(link).trim()) : null
        if (!videoId) {
            throw new Error('Invalid YouTube link.')
        }
        const preview = { linkIndex: linkIndex, videoId: videoId, link: link }
        youtubePreviewRef.current = preview
        setYoutubePreview(preview)
    }

    function pauseOtherPlayback() {
        const mediaController = props.mediaController
        if (!mediaController) return
        if (mediaController.stopMidiFileRef && mediaController.stopMidiFileRef.current) {
            mediaController.stopMidiFileRef.current()
        }
        if (typeof mediaController.abortPlayingIntent === 'function') {
            mediaController.abortPlayingIntent()
            return
        }
        if (typeof mediaController.pause === 'function') {
            mediaController.pause()
        }
    }

    async function startMidiLinkPreview(link, linkIndex) {
        const tuneId = getTuneId()
        if (!tuneId) {
            throw new Error('Save the tune before playing MIDI links.')
        }
        midiFilePreview.resumeAudioContextFromGesture()
        const resolved = await resolveMidiLinkPlaybackData(link, tuneId, linkIndex, {
            accessToken: props.token && props.token.access_token,
            driveApi: driveDocs,
            isYoutubeLink: isYoutubeLink,
        })
        await midiFilePreview.init(resolved.arrayBuffer)
        midiFilePreview.resumeAudioContextFromGesture()
        const started = await midiFilePreview.start()
        if (!started) {
            throw new Error('Could not start MIDI preview.')
        }
        setPreviewLinkIndex(linkIndex)
        setPreviewLoadingIndex(null)
    }

    async function toggleLinkPreview(linkIndex) {
        const link = Array.isArray(props.links) ? props.links[linkIndex] : null
        if (!linkIsPreviewable(link, isYoutubeLink)) return

        if (previewLinkIndex === linkIndex || previewLoadingIndex === linkIndex) {
            stopLinkPreview()
            pauseOtherPlayback()
            return
        }

        pauseOtherPlayback()
        stopLinkPreview()
        setPreviewLoadingIndex(linkIndex)

        try {
            const srcType = getLinkSrcType(link, isYoutubeLink)
            if (srcType === 'youtube') {
                startYoutubePreview(link, linkIndex)
                return
            }
            if (srcType === 'midifile') {
                await startMidiLinkPreview(link, linkIndex)
                return
            }

            let src = await resolveLinkPreviewSrc(link, linkIndex)
            try {
                await startLinkPreviewPlayback(link, linkIndex, src)
            } catch (playError) {
                if (srcType === 'audio' && !String(src).startsWith('blob:')) {
                    src = await resolveLinkPreviewSrc(link, linkIndex, { forceFetch: true })
                    await startLinkPreviewPlayback(link, linkIndex, src)
                    return
                }
                throw playError
            }
        } catch (e) {
            setWarning(e && e.message ? e.message : 'Could not preview this link.')
            stopLinkPreview()
        }
    }

    function openMediaWizard(linkIndex) {
        setWizardLinkIndex(linkIndex)
        setWizardAutoStartAnalysis(true)
        setShowMediaWizard(true)
    }

    function closeMediaWizard() {
        setShowMediaWizard(false)
        setWizardLinkIndex(null)
        setWizardAutoStartAnalysis(false)
    }

    function linkHasMedia(link) {
        return !!linkUriString(link).trim()
    }

    function getTuneId() {
        if (props.tuneId) return props.tuneId
        if (props.tune && props.tune.id) return props.tune.id
        return ''
    }

    function getTuneForOwnedMedia() {
        if (!tuneForMedia) return null
        const tuneId = getTuneId()
        if (!tuneId) return null
        return Object.assign({}, tuneForMedia, { id: tuneId })
    }

    async function runMidiExportToNotation(linkIndex, workspaceId) {
        const link = props.links && props.links[linkIndex]
        const tuneId = getTuneId()
        if (!link || !tuneId || !workspaceId) return
        setMidiExportBusy(true)
        setWarning('')
        try {
            await exportMidiLinkToScratchpad({
                link: link,
                linkIndex: linkIndex,
                tuneId: tuneId,
                workspaceId: workspaceId,
                accessToken: props.token,
                driveApi: driveDocs,
                isYoutubeLink: isYoutubeLink,
                onOpenItem: function(itemId) {
                    navigate(scratchpadItemPath(itemId))
                },
            })
        } catch (e) {
            if (e && e.message && e.message.indexOf('cancelled') === -1) {
                setWarning(e.message || 'Could not export MIDI to scratchpad')
            }
        } finally {
            setMidiExportBusy(false)
            setMidiExportLinkIndex(null)
        }
    }

    async function openLinkInScratchpad(link, linkIndex) {
        const linkSrc = linkUriString(link).trim()
        const needsResolver = requiresResolverProxiedPlayback(linkSrc)
            || !!(link && link.collectionEntryId)
            || isMusicCollectionResult(link)
        if (needsResolver && !normalizeAccessToken(props.token)) {
            showResolverLoginToastForAuthError(null, {
                force: true,
                accessToken: props.token,
                resolverStatus: resolverStatus,
                message: 'Login to continue',
            })
            return
        }
        setScratchpadLinkIndex(linkIndex)
        setWarning('')
        try {
            const item = await createScratchpadItemFromLink({
                link: link,
                linkIndex: linkIndex,
                tuneId: getTuneId(),
                title: link.title || 'Audio from link',
                token: props.token,
                driveApi: driveDocs,
                isYoutubeLink: isYoutubeLink,
                youtubeGetId: props.tunebook && props.tunebook.utils && props.tunebook.utils.YouTubeGetID,
            })
            navigate('/scratchpad/' + encodeURIComponent(item.id))
        } catch (e) {
            if (showResolverLoginToastForAuthError(e, {
                accessToken: props.token,
                resolverStatus: resolverStatus,
            })) {
                return
            }
            setWarning(e && e.message ? e.message : 'Could not open in scratchpad')
        } finally {
            setScratchpadLinkIndex(null)
        }
    }

    function remapIndexAfterSwap(index, fromIndex, toIndex) {
        if (index === null || index === undefined) return index
        if (index === fromIndex) return toIndex
        if (index === toIndex) return fromIndex
        return index
    }

    function moveLink(fromIndex, direction) {
        const links = Array.isArray(props.links) ? props.links.slice() : []
        const toIndex = fromIndex + direction
        if (toIndex < 0 || toIndex >= links.length) return
        const moved = links[fromIndex]
        links[fromIndex] = links[toIndex]
        links[toIndex] = moved

        setPreviewLinkIndex(function(current) {
            return remapIndexAfterSwap(current, fromIndex, toIndex)
        })
        setPreviewLoadingIndex(function(current) {
            return remapIndexAfterSwap(current, fromIndex, toIndex)
        })
        setPlayRangeLinkIndex(function(current) {
            return remapIndexAfterSwap(current, fromIndex, toIndex)
        })
        setMidiExportLinkIndex(function(current) {
            return remapIndexAfterSwap(current, fromIndex, toIndex)
        })
        if (youtubePreviewRef.current && youtubePreviewRef.current.linkIndex != null) {
            youtubePreviewRef.current = Object.assign({}, youtubePreviewRef.current, {
                linkIndex: remapIndexAfterSwap(youtubePreviewRef.current.linkIndex, fromIndex, toIndex),
            })
        }
        if (youtubePreview && youtubePreview.linkIndex != null) {
            setYoutubePreview(Object.assign({}, youtubePreview, {
                linkIndex: remapIndexAfterSwap(youtubePreview.linkIndex, fromIndex, toIndex),
            }))
        }

        onChange(links)
    }

    function prependOwnedMediaLink(newLink) {
        const links = Array.isArray(props.links) ? props.links.slice() : []
        links.unshift(newLink)
        setWarning('')
        const tune = getTuneForOwnedMedia()
        if (tune && shouldLockMediaCacheForLink(newLink)) {
            handleTuneChange(Object.assign({}, tune, { links: links, mediaCacheLocked: true }))
            return
        }
        onChange(links)
    }

    async function handleOwnedMediaCreated(promise) {
        const tune = getTuneForOwnedMedia()
        if (!tune) {
            setWarning('Save the tune before adding recordings.')
            return
        }
        setOwnedMediaBusy(true)
        try {
            const result = await promise
            if (result && result.link) {
                prependOwnedMediaLink(result.link)
            }
        } catch (e) {
            setWarning(e && e.message ? e.message : 'Could not save recording')
        } finally {
            setOwnedMediaBusy(false)
        }
    }

    function startRecording() {
        const tune = getTuneForOwnedMedia()
        if (!tune) {
            setWarning('Save the tune before recording.')
            return
        }
        recordingStartedAt.current = new Date().getTime()
        setRecordingDuration(0)
        if (recordingIntervalRef.current) {
            clearInterval(recordingIntervalRef.current)
        }
        recordingIntervalRef.current = setInterval(function() {
            setRecordingDuration(parseInt((new Date().getTime() - recordingStartedAt.current) / 1000, 10))
        }, 1000)
        audioUtils.startRecording().then(function(blob) {
            if (recordingIntervalRef.current) {
                clearInterval(recordingIntervalRef.current)
                recordingIntervalRef.current = null
            }
            if (!blob) {
                setWarning('Recording failed or was empty.')
                return
            }
            handleOwnedMediaCreated(createRecordingLink({
                tune: tune,
                blob: blob,
                title: 'Recording ' + new Date().toLocaleString(),
                token: props.token,
                driveApi: driveDocs,
                googleDocumentId: props.googleDocumentId,
            }))
        })
    }

    function stopRecording() {
        audioUtils.stopRecording()
    }

    function handleAttachAudio(event) {
        const tune = getTuneForOwnedMedia()
        if (!tune) {
            setWarning('Save the tune before attaching media.')
            event.target.value = ''
            return
        }
        const file = event.target.files && event.target.files[0]
        event.target.value = ''
        if (!file) return
        if (isMidiImportFile(file)) {
            handleOwnedMediaCreated(createAttachedMidiLink({
                tune: tune,
                file: file,
                title: file.name,
                token: props.token,
                driveApi: driveDocs,
                googleDocumentId: props.googleDocumentId,
                uploadToDrive: false,
            }))
            return
        }
        if (!isAudioImportFile(file)) {
            setWarning('Please choose an audio, video, or MIDI file.')
            return
        }
        handleOwnedMediaCreated((async function() {
            const metadata = await readAudioFileMetadata(file)
            const title = metadata.title || file.name
            return createAttachedAudioLink({
                tune: tune,
                file: file,
                title: title,
                token: props.token,
                driveApi: driveDocs,
                googleDocumentId: props.googleDocumentId,
                uploadToDrive: false,
            })
        })())
    }

    function downloadOwnedMediaLink(link, linkIndex) {
        const tuneId = getTuneId()
        if (!tuneId || !link) return
        const resolvePromise = getLinkSrcType(link, props.tunebook.utils.isYoutubeLink) === 'midifile'
            ? resolveRecordingLinkMidi(link, tuneId, linkIndex, {
                accessToken: props.token,
                driveApi: driveDocs,
                forPlayback: true,
            }).then(function(resolved) {
                return {
                    blob: new Blob([resolved.arrayBuffer], { type: 'audio/midi' }),
                }
            })
            : resolveRecordingLinkAudio(link, tuneId, linkIndex, {
                accessToken: props.token,
                driveApi: driveDocs,
                forPlayback: true,
            })
        resolvePromise.then(function(resolved) {
            if (!resolved || !resolved.blob) return
            const url = URL.createObjectURL(resolved.blob)
            const a = document.createElement('a')
            a.href = url
            const ext = link.mediaKind === 'midi' ? '.mid' : '.mp3'
            a.download = (link.title || 'recording') + ext
            a.click()
            URL.revokeObjectURL(url)
        }).catch(function(e) {
            setWarning(e && e.message ? e.message : 'Could not download recording')
        })
    }

    function linkHidesUrlField(link) {
        const uri = linkUriString(link).trim()
        if (!uri) return false
        return uri.startsWith('data:audio/') || isOwnedMediaLinkUri(uri)
    }

    return (
        <div>
            <div className="links-editor-toolbar" style={{display:'flex', justifyContent:'flex-start', alignItems:'center', flexWrap:'wrap', gap:'0.5em'}} >
                {showPracticeGenerate ? (
                    <div className="links-editor-toolbar-group links-editor-toolbar-group--generate" style={{display:'flex', alignItems:'center', flexWrap:'wrap', gap:'0.5em'}} >
                        <LinksEditorToolbarButton
                            label="Generate"
                            variant="primary"
                            className="links-editor-audio-action-btn"
                            disabled={practiceGenerating || ownedMediaBusy || audioUtils.isRecording}
                            title={audioGenerationAccess.loginWarning && (audioGenerationAccess.needsLogin || audioGenerationAccess.needsCredit)
                                ? audioGenerationAccess.loginWarning.message
                                : 'Generate a practice track from notation'}
                            onClick={beginPracticeTrackGeneration}
                        >
                            {practiceGenerating
                                ? 'Starting…'
                                : getGatedActionLabel(audioGenerationAccess, 'Generate')}
                        </LinksEditorToolbarButton>
                    </div>
                ) : null}
                <div className="links-editor-toolbar-group" style={{display:'flex', alignItems:'center', flexWrap:'wrap', gap:'0.5em'}} >
                    <FileInputButton
                        icon={props.tunebook.icons.paperclip}
                        label="Attach"
                        variant="primary"
                        style={LINKS_TOOLBAR_BTN_STYLE}
                        accept={mediaFileAcceptList()}
                        disabled={ownedMediaBusy || audioUtils.isRecording}
                        onChange={handleAttachAudio}
                    />
                    {audioUtils.isRecording && (
                        <>
                            <LinksEditorToolbarButton
                                icon={props.tunebook.icons.stopsmall}
                                label="Stop recording"
                                variant="danger"
                                onClick={stopRecording}
                            />
                            <Button
                                className="links-editor-toolbar-btn"
                                variant="outline-danger"
                                disabled
                                aria-label="Recording duration"
                            >
                                {recordingDuration + 1}s
                            </Button>
                        </>
                    )}
                    {!audioUtils.isRecording && (
                        <LinksEditorToolbarButton
                            icon={props.tunebook.icons.recordcircle}
                            label="Record"
                            variant="primary"
                            onClick={startRecording}
                            disabled={ownedMediaBusy}
                        />
                    )}
                    <LinksEditorToolbarButton
                        icon={props.tunebook.icons.add}
                        label="New Link"
                        variant="success"
                        onClick={function() {
                            var links = Array.isArray(props.links) ? props.links : []
                            links.unshift({title: '', link: '', startAt: '', endAt: ''})
                            props.onChange(links)
                        }}
                        disabled={ownedMediaBusy || audioUtils.isRecording}
                    />
                    <ButtonGroup>
                        <YouTubeSearchModal
                            onClick={props.handleClose}
                            tunebook={props.tunebook}
                            token={props.token}
                            login={props.login}
                            onChange={function(link) {
                                var links = Array.isArray(props.links) ? props.links : []
                                var newLink = tuneLinkFromMediaSearchCandidate(link)
                                links.unshift(newLink)
                                var tune = getTuneForOwnedMedia()
                                var isYoutube = !!(link && link.source === 'youtube')
                                var cacheOpts = {
                                    isYoutubeLink: isYoutubeLink,
                                    youtubeGetId: props.tunebook && props.tunebook.utils && props.tunebook.utils.YouTubeGetID,
                                    accessToken: getActiveResolverAccessToken() || props.token || null,
                                }
                                if (tune) {
                                    if (isYoutube) {
                                        if (shouldLockMediaCacheForLink(newLink)
                                            || isMusicCollectionResult(link)
                                            || isDeviceFileResult(link)) {
                                            handleTuneChange(Object.assign({}, tune, { links: links, mediaCacheLocked: true }))
                                        } else {
                                            props.onChange(links)
                                        }
                                        return
                                    }
                                    var updated = Object.assign({}, tune, { links: links })
                                    if (shouldLockMediaCacheForLink(newLink)) {
                                        updated.mediaCacheLocked = true
                                    }
                                    handleTuneChange(updated)
                                    if (typeof props.onTuneChange !== 'function') {
                                        scheduleSelectedMediaLinkCache(newLink, updated, cacheOpts)
                                    }
                                    return
                                }
                                props.onChange(links)
                                if (!isYoutube) {
                                    scheduleSelectedMediaLinkCache(newLink, null, cacheOpts)
                                }
                            }}
                            setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
                            value={youtubeSearchQuery}
                            renderTrigger={function(triggerProps) {
                                return (
                                    <LinksEditorToolbarButton
                                        icon={props.tunebook.icons.youtubeblack}
                                        label="Search media"
                                        variant="danger"
                                        onClick={triggerProps.onClick}
                                    />
                                )
                            }}
                        />
                        {!simplified && (
                            <LinksEditorToolbarButton
                                icon={props.tunebook.icons.externallink}
                                label="Open YouTube search"
                                variant="danger"
                                iconOnly={true}
                                as="a"
                                href={'https://www.youtube.com/results?search_query=' + encodeURIComponent(youtubeSearchQuery.trim())}
                                target="_blank"
                                rel="noreferrer"
                            />
                        )}
                    </ButtonGroup>
                </div>

                <div className="links-editor-toolbar-group links-editor-toolbar-group--end" style={{display:'flex', alignItems:'center', flexWrap:'wrap', gap:'0.5em', marginLeft:'auto'}} >
                    {(warning && warning.length > 0) && <b>{warning}</b>}
                    {props.toolbarExtra}
                </div>
            </div>
            <Form>
                <div style={{clear:'both'}}>
                    {Array.isArray(props.links) && props.links.map(function(link, lk) {
                        const linkUri = linkUriString(link)
                        const ownedMedia = isOwnedMediaLink(link)
                        const syncStatus = ownedMedia ? getOwnedMediaSyncStatus(link) : null
                        const linkSrcType = getLinkSrcType(link, isYoutubeLink)
                        return <div key={lk} className="links-editor-link-card">
                            <div className="links-editor-link-actions">
                                <Button
                                    size="sm"
                                    variant="outline-secondary"
                                    className="links-editor-reorder-btn"
                                    aria-label="Move link up"
                                    title="Move link up"
                                    disabled={lk === 0}
                                    onClick={function() { moveLink(lk, -1) }}
                                >
                                    {props.tunebook.icons.arrowup}
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline-secondary"
                                    className="links-editor-reorder-btn"
                                    aria-label="Move link down"
                                    title="Move link down"
                                    disabled={lk >= props.links.length - 1}
                                    onClick={function() { moveLink(lk, 1) }}
                                >
                                    {props.tunebook.icons.arrowdown}
                                </Button>
                                {linkCanOpenInScratchpad(link, isYoutubeLink) && (
                                    <Button
                                        size="sm"
                                        variant="outline-primary"
                                        aria-label="Edit in scratchpad"
                                        title="Copy audio to scratchpad and edit"
                                        disabled={scratchpadLinkIndex !== null || ownedMediaBusy || audioUtils.isRecording}
                                        onClick={function() { openLinkInScratchpad(link, lk) }}
                                    >
                                        {scratchpadLinkIndex === lk
                                            ? props.tunebook.icons.waiting
                                            : props.tunebook.icons.pencil}
                                    </Button>
                                )}
                                {showLinkedCoverRegenerate && linkSupportsAudioCover(link, isYoutubeLink) ? (
                                    <Button
                                        size="sm"
                                        variant="primary"
                                        className="links-editor-audio-action-btn"
                                        disabled={linkRegeneratingIndex === lk || practiceGenerating || ownedMediaBusy || audioUtils.isRecording}
                                        title={audioGenerationAccess.loginWarning && (audioGenerationAccess.needsLogin || audioGenerationAccess.needsCredit)
                                            ? audioGenerationAccess.loginWarning.message
                                            : 'Regenerate audio from this recording using AI cover'}
                                        onClick={function() { beginLinkedCoverRegeneration(lk) }}
                                    >
                                        {linkRegeneratingIndex === lk
                                            ? props.tunebook.icons.waiting
                                            : getGatedActionLabel(audioGenerationAccess, 'Regenerate')}
                                    </Button>
                                ) : null}
                                {!simplified && linkSrcType !== 'midifile' ? (
                                    <Button
                                        size="sm"
                                        variant="primary"
                                        onClick={function() {
                                            if (previewLinkIndex === lk) {
                                                stopLinkPreview()
                                            }
                                            setPlayRangeLinkIndex(lk)
                                        }}
                                    >
                                        Play Range
                                    </Button>
                                ) : null}
                                {linkUri.startsWith('data:audio/') && (
                                    <Button size="sm" variant="primary" onClick={function() {
                                        var a = document.createElement('a')
                                        a.href = linkUri
                                        a.download = link.title
                                        a.click()
                                    }}>{props.tunebook.icons.save}</Button>
                                )}
                                {ownedMedia && (
                                    <Button size="sm" variant="primary" onClick={function() {
                                        downloadOwnedMediaLink(link, lk)
                                    }}>{props.tunebook.icons.save}</Button>
                                )}
                                {(!simplified && linkUri.indexOf('youtube') !== -1) && (
                                    <a target="_blank" rel="noreferrer" href={linkUri}>
                                        <Button size="sm" variant="primary" aria-label="Open external link" title="Open external link">
                                            {props.tunebook.icons.externallink}
                                        </Button>
                                    </a>
                                )}
                                <Button size="sm" variant="danger" aria-label="Delete link" title="Delete link" onClick={function() {
                                    if (previewLinkIndex === lk) {
                                        stopLinkPreview()
                                    }
                                    if (window.confirm('Are you sure you want to delete this link?')) {
                                        var links = props.links
                                        links.splice(lk, 1)
                                        props.onChange(links)
                                    }
                                }}>{props.tunebook.icons.deletebin}</Button>
                                {linkIsPreviewable(link, isYoutubeLink) && (
                                    <Button
                                        size="sm"
                                        variant={previewLoadingIndex === lk
                                            ? 'secondary'
                                            : (previewLinkIndex === lk ? 'warning' : 'success')}
                                        className="links-editor-link-actions-play"
                                        aria-label={previewLoadingIndex === lk
                                            ? 'Cancel loading'
                                            : (previewLinkIndex === lk ? 'Pause preview' : 'Preview link')}
                                        title={previewLoadingIndex === lk
                                            ? 'Cancel loading'
                                            : (previewLinkIndex === lk ? 'Pause preview' : 'Preview link')}
                                        onClick={function() { toggleLinkPreview(lk) }}
                                    >
                                        {previewLoadingIndex === lk
                                            ? props.tunebook.icons.waiting
                                            : (previewLinkIndex === lk ? props.tunebook.icons.pause : props.tunebook.icons.play)}
                                    </Button>
                                )}
                            </div>
                            <div className={'links-editor-fields' + (simplified ? ' links-editor-fields--simplified' : '')}>
                                <div className="links-editor-fields-row links-editor-fields-row--primary">
                                    <Form.Group className="links-editor-field-group links-editor-field-group--title">
                                        <div className="links-editor-field-label-row links-editor-field-label-row--title">
                                            <Form.Label className="links-editor-field-label">Title</Form.Label>
                                            {!simplified ? (
                                                <MediaImportEntryButton
                                                    className="links-editor-field-label-action"
                                                    tune={tuneForMedia || props.tune}
                                                    linkIndex={lk}
                                                    label="Analyse Audio"
                                                    compact={true}
                                                    disabled={!linkHasMedia(link)}
                                                    onOpen={function() { openMediaWizard(lk); }}
                                                />
                                            ) : null}
                                        </div>
                                        <div className="links-editor-field-input links-editor-title-input-row">
                                            <Form.Control type="text" value={link.title} onChange={function(e) {
                                                var links = props.links
                                                if (!links[lk]) links[lk] = {}
                                                links[lk].title = e.target.value
                                                props.onChange(links)
                                            }} />
                                            <FieldVoiceFillButton
                                              fieldKind="search"
                                              token={props.token}
                                              setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
                                              onFill={function(text) {
                                                var links = props.links
                                                if (!links[lk]) links[lk] = {}
                                                links[lk].title = text
                                                props.onChange(links)
                                              }}
                                            />
                                            {ownedMedia && (
                                                <>
                                                    <Badge bg="secondary">{ownedMediaSourceLabel(link)}</Badge>
                                                    <Badge bg={syncStatus === 'synced' ? 'success' : (syncStatus === 'pending' ? 'warning' : 'info')}>
                                                        {syncStatusLabel(syncStatus)}
                                                    </Badge>
                                                </>
                                            )}
                                        </div>
                                    </Form.Group>
                                    <Form.Group className="links-editor-field-group links-editor-field-group--link">
                                        {(!linkHidesUrlField(link) || ownedMedia) ? (
                                            <Form.Label className="links-editor-field-label">Link</Form.Label>
                                        ) : null}
                                        {!linkHidesUrlField(link) && (
                                            <Form.Control type="text" value={linkUri} onChange={function(e) {
                                                var links = props.links
                                                links[lk].link = e.target.value
                                                props.onChange(links)
                                            }} />
                                        )}
                                        {ownedMedia && (
                                            <div className="links-editor-owned-media-uri">
                                                {linkUri}
                                            </div>
                                        )}
                                    </Form.Group>
                                </div>
                                {!simplified && linkSrcType === 'midifile' && (
                                    <div className="links-editor-fields-row links-editor-fields-row--region">
                                        <div className="links-editor-region-actions">
                                            {midiExportAccess.showButton ? (
                                                <Button
                                                    variant="primary"
                                                    size="sm"
                                                    disabled={midiExportBusy}
                                                    title={midiExportAccess.needsLogin && midiExportAccess.loginWarning
                                                        ? midiExportAccess.loginWarning.message
                                                        : 'Convert this MIDI link to scratchpad notation'}
                                                    onClick={function() { beginMidiExportToNotation(lk) }}
                                                >
                                                    {midiExportBusy && midiExportLinkIndex === lk
                                                        ? props.tunebook.icons.waiting
                                                        : getGatedActionLabel(midiExportAccess, 'Export To Notation')}
                                                </Button>
                                            ) : null}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    })}
                </div>
            </Form>
            {showMediaWizard && (tuneForMedia || props.tune) && (
                <MediaImportWizard
                    show={showMediaWizard}
                    onClose={closeMediaWizard}
                    tune={tuneForMedia || props.tune}
                    linkIndex={wizardLinkIndex}
                    autoStartAnalysis={wizardAutoStartAnalysis}
                    tunebook={props.tunebook}
                    abc={props.abc}
                    token={props.token}
                    searchIndex={props.searchIndex}
                    loadTuneTexts={props.loadTuneTexts}
                    forceRefresh={props.forceRefresh}
                    onLinksUpdated={onChange}
                />
            )}
            {playRangeLinkIndex != null && props.links && props.links[playRangeLinkIndex] && (
                <LinkPlayRangeModal
                    show={true}
                    onHide={function() { setPlayRangeLinkIndex(null) }}
                    link={props.links[playRangeLinkIndex]}
                    linkIndex={playRangeLinkIndex}
                    links={props.links}
                    onLinksUpdated={onChange}
                    tune={tuneForMedia || props.tune}
                    tunebook={props.tunebook}
                    token={props.token}
                    login={props.login}
                    icons={props.tunebook && props.tunebook.icons}
                    mediaController={props.mediaController}
                />
            )}
            <ScratchpadWorkspacePickerModal
                show={showMidiExportPicker}
                onHide={function() {
                    if (midiExportBusy) return
                    setShowMidiExportPicker(false)
                    setMidiExportLinkIndex(null)
                }}
                title="Export MIDI to scratchpad"
                description="Choose a workspace for the notation record created from this MIDI link."
                onConfirm={function(workspaceId) {
                    setShowMidiExportPicker(false)
                    if (midiExportLinkIndex == null) return
                    runMidiExportToNotation(midiExportLinkIndex, workspaceId)
                }}
            />
            <RegenerateCoverModal
                show={regenerateCoverLinkIndex != null}
                link={regenerateCoverLinkIndex != null && props.links
                    ? props.links[regenerateCoverLinkIndex]
                    : null}
                tune={tuneForMedia || props.tune}
                defaultStylePrompt={defaultCoverStylePrompt(
                    tuneForMedia || props.tune,
                    getPracticeTrackPlan(tuneForMedia || props.tune, props.tunebook, abcjsParser)
                )}
                backends={audioBackends}
                busy={regenerateCoverLinkIndex != null && linkRegeneratingIndex === regenerateCoverLinkIndex}
                error={regenerateCoverError}
                onHide={function() {
                    if (linkRegeneratingIndex != null) return
                    setRegenerateCoverLinkIndex(null)
                    setRegenerateCoverError('')
                }}
                onConfirm={function(coverOptions) {
                    if (regenerateCoverLinkIndex == null) return
                    runLinkedCoverRegeneration(regenerateCoverLinkIndex, coverOptions)
                }}
            />
            {youtubePreview && (
                <div
                    style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', overflow: 'hidden' }}
                    aria-hidden="true"
                >
                    <SafeYouTube
                        key={youtubePreview.linkIndex + ':' + youtubePreview.videoId}
                        videoId={youtubePreview.videoId}
                        opts={{
                            width: '1',
                            height: '1',
                            playerVars: {
                                controls: 0,
                                enablejsapi: 1,
                            },
                        }}
                        onReady={onYoutubePreviewReady}
                        onStateChange={onYoutubePreviewStateChange}
                        onError={onYoutubePreviewError}
                    />
                </div>
            )}
        </div>
    );
}

export default function LinksEditor(props) {
    const existingDeps = useTuneMediaAnalysisDeps()
    if (existingDeps) {
        return <LinksEditorBody {...props} />
    }
    return (
        <TuneMediaAnalysisProvider
            tunebook={props.tunebook}
            tunes={tunesForMediaAnalysis(props)}
            token={props.token}
            forceRefresh={props.forceRefresh}
        >
            <LinksEditorBody {...props} />
        </TuneMediaAnalysisProvider>
    )
}
