import {useRef, useState, useEffect} from 'react'
import {Button, ButtonGroup, Form, Badge} from 'react-bootstrap'
import YouTube from 'react-youtube'
import YouTubeSearchModal from './YouTubeSearchModal'
import LinkPlayRangeModal from './LinkPlayRangeModal'
import MediaImportWizard from './MediaImportWizard'
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
import { mediaFileAcceptList, isAudioImportFile, isMidiImportFile, readAudioFileMetadata } from '../audioFileMetadata'
import { getLinkSrcType } from '../checkTuneLinkPlayback'
import { fetchDirectOrProxy } from '../mediaProxyClient'
import FieldVoiceFillButton from './FieldVoiceFillButton'

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

function linkIsPreviewable(link, isYoutubeLink) {
    if (!link || !link.link || !String(link.link).trim()) return false
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

export default function LinksEditor(props) {
    function onChange(links) {
        props.onChange(links)
    }

    const audioUtils = useAudioUtils()
    const driveDocs = useGoogleDocument(props.token, function() {})
    const { available: resolverAvailable, features } = useMediaResolverHealth()
    const recordingStartedAt = useRef(0)
    const recordingIntervalRef = useRef(null)
    const [warning, setWarning] = useState('')
    const [showMediaWizard, setShowMediaWizard] = useState(false)
    const [wizardLinkIndex, setWizardLinkIndex] = useState(null)
    const [wizardAutoStartAnalysis, setWizardAutoStartAnalysis] = useState(false)
    const [recordingDuration, setRecordingDuration] = useState(0)
    const [ownedMediaBusy, setOwnedMediaBusy] = useState(false)
    const [previewLinkIndex, setPreviewLinkIndex] = useState(null)
    const [previewLoadingIndex, setPreviewLoadingIndex] = useState(null)
    const [playRangeLinkIndex, setPlayRangeLinkIndex] = useState(null)
    const [youtubePreview, setYoutubePreview] = useState(null)
    const previewAudioRef = useRef(null)
    const previewBlobUrlRef = useRef(null)
    const youtubePlayerRef = useRef(null)
    const youtubeEndPollRef = useRef(null)
    const youtubePreviewRef = useRef(null)
    const simplified = !!props.simplified
    const hasTitle = !!(props.tune && props.tune.name && props.tune.name.trim())
    const tuneForMedia = props.tune
        ? Object.assign({}, props.tune, { id: props.tune.id || props.tuneId || '' })
        : null
    const isYoutubeLink = props.tunebook && props.tunebook.utils && props.tunebook.utils.isYoutubeLink

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

    async function resolveLinkPreviewSrc(link, linkIndex, options) {
        const opts = options || {}
        const src = String(link.link).trim()
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
        if (opts.forceFetch) {
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
        const videoId = youtubeGetId ? youtubeGetId(String(link.link).trim()) : null
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
        if (typeof mediaController.pause === 'function') {
            mediaController.pause()
            return
        }
        if (typeof mediaController.abortPlayingIntent === 'function') {
            mediaController.abortPlayingIntent()
        }
    }

    async function toggleLinkPreview(linkIndex) {
        const link = Array.isArray(props.links) ? props.links[linkIndex] : null
        if (!linkIsPreviewable(link, isYoutubeLink)) return

        if (previewLinkIndex === linkIndex || previewLoadingIndex === linkIndex) {
            stopLinkPreview()
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
        return !!(link && link.link && String(link.link).trim())
    }

    function getTuneId() {
        if (props.tune && props.tune.id) return props.tune.id
        if (props.tuneId) return props.tuneId
        return ''
    }

    function getTuneForOwnedMedia() {
        if (!tuneForMedia) return null
        const tuneId = getTuneId()
        if (!tuneId) return null
        return Object.assign({}, tuneForMedia, { id: tuneId })
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
        if (!link || !link.link) return false
        return link.link.startsWith('data:audio/') || isOwnedMediaLinkUri(link.link)
    }

    const youtubeSearchQuery = (props.tune.name ? props.tune.name : '')
        + (props.tune.composer ? ' ' + props.tune.composer : '')
        + (props.tune.rhythm ? ' ' + props.tune.rhythm : '')

    return (
        <div>
            <div className="links-editor-toolbar" style={{display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'0.5em'}} >
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
                    {(hasTitle || !simplified) && (
                        <ButtonGroup>
                            {hasTitle && (
                                <YouTubeSearchModal
                                    onClick={props.handleClose}
                                    tunebook={props.tunebook}
                                    onChange={function(link) {
                                        var links = Array.isArray(props.links) ? props.links : []
                                        links.unshift({title: link.title, link: link.link, startAt: '', endAt: ''})
                                        props.onChange(links)
                                    }}
                                    setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
                                    value={youtubeSearchQuery}
                                    renderTrigger={function(triggerProps) {
                                        return (
                                            <LinksEditorToolbarButton
                                                icon={props.tunebook.icons.youtubeblack}
                                                label="Search YouTube"
                                                variant="danger"
                                                onClick={triggerProps.onClick}
                                            />
                                        )
                                    }}
                                />
                            )}
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
                    )}
                </div>

                <div className="links-editor-toolbar-group links-editor-toolbar-group--end" style={{display:'flex', alignItems:'center', flexWrap:'wrap', gap:'0.5em', marginLeft:'auto'}} >
                    {(warning && warning.length > 0) && <b>{warning}</b>}
                    {props.toolbarExtra}
                </div>
            </div>
            <Form>
                <div style={{clear:'both'}}>
                    {Array.isArray(props.links) && props.links.map(function(link, lk) {
                        const ownedMedia = isOwnedMediaLink(link)
                        const syncStatus = ownedMedia ? getOwnedMediaSyncStatus(link) : null
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
                                {linkIsPreviewable(link, isYoutubeLink) && (
                                    <Button
                                        size="sm"
                                        variant={previewLoadingIndex === lk
                                            ? 'secondary'
                                            : (previewLinkIndex === lk ? 'warning' : 'success')}
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
                                {(link && link.link && link.link.startsWith('data:audio/')) && (
                                    <Button size="sm" variant="primary" onClick={function() {
                                        var a = document.createElement('a')
                                        a.href = link.link
                                        a.download = link.title
                                        a.click()
                                    }}>{props.tunebook.icons.save}</Button>
                                )}
                                {ownedMedia && (
                                    <Button size="sm" variant="primary" onClick={function() {
                                        downloadOwnedMediaLink(link, lk)
                                    }}>{props.tunebook.icons.save}</Button>
                                )}
                                {(!simplified && link && link.link && link.link.indexOf('youtube') !== -1) && (
                                    <a target="_blank" rel="noreferrer" href={link.link}>
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
                                            <Form.Control type="text" value={link.link} onChange={function(e) {
                                                var links = props.links
                                                links[lk].link = e.target.value
                                                props.onChange(links)
                                            }} />
                                        )}
                                        {ownedMedia && (
                                            <div className="links-editor-owned-media-uri">
                                                {link.link}
                                            </div>
                                        )}
                                    </Form.Group>
                                </div>
                                {!simplified && (
                                    <div className="links-editor-fields-row links-editor-fields-row--region">
                                        <div className="links-editor-region-actions">
                                            <Button
                                                variant="primary"
                                                size="sm"
                                                onClick={function() {
                                                    if (previewLinkIndex === lk) {
                                                        stopLinkPreview()
                                                    }
                                                    setPlayRangeLinkIndex(lk)
                                                }}
                                            >
                                                Play Range
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    })}
                </div>
            </Form>
            {(tuneForMedia || props.tune) && (
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
                    icons={props.tunebook && props.tunebook.icons}
                />
            )}
            {youtubePreview && (
                <div
                    style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', overflow: 'hidden' }}
                    aria-hidden="true"
                >
                    <YouTube
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
