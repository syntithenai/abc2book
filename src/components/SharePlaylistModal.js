import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Form, Modal } from 'react-bootstrap'
import useGoogleDocument from '../useGoogleDocument'
import {
  buildShareImportLink,
  shareModalTitle,
  shareEmailSubject,
} from '../shareTunebookUtils'
import {
  analyzePlaylistPublishedShare,
  analyzePlaylistShareMediaPlayability,
  buildPlaylistPublicShareLink,
  buildPlaylistShareMediaWarning,
  defaultPlaylistShareVariant,
  playlistShareOffersVariantChoice,
} from '../playlistPublicShare'
import {
  isAnyoneReadable,
  prepareOwnedMediaForShare,
  summarizeShareMediaWork,
} from '../shareOwnedMediaUtils'
import {
  getSavedPlaylist,
  listSavedPlaylists,
  savePlaylist,
  savePlaylistFromQueue,
} from '../savedPlaylistsStore'
import { isLessonQueue } from '../nowPlayingQueue'
import ShareOwnedMediaProgressModal from './ShareOwnedMediaProgressModal'
import ShareQrCode from './ShareQrCode'
import VoiceFillInput from './VoiceFillInput'
import { OFFLINE_LOGIN_MESSAGE, isNavigatorOffline } from '../offlineNetwork'

const PUBLIC_CONFIRM_KEY = 'bookstorage_tunebook_public'

function formatAudioShareSummary(summary) {
  if (!summary) return ''
  const parts = []
  if (summary.uploaded > 0) {
    parts.push(summary.uploaded + ' audio file' + (summary.uploaded === 1 ? '' : 's') + ' uploaded to Google Drive')
  }
  if (summary.shared > 0) {
    parts.push(summary.shared + ' audio file' + (summary.shared === 1 ? '' : 's') + ' shared publicly')
  }
  if (summary.alreadyPublic > 0) {
    parts.push(summary.alreadyPublic + ' already public')
  }
  if (summary.notUploadable && summary.notUploadable.length > 0) {
    parts.push(summary.notUploadable.length + ' could not be uploaded')
  }
  if (summary.failed && summary.failed.length > 0) {
    parts.push(summary.failed.length + ' failed to share')
  }
  return parts.join(' · ')
}

function resolvePlaylistsMap(playlistsProp) {
  if (playlistsProp) return playlistsProp
  const map = {}
  listSavedPlaylists().forEach(function(playlist) {
    if (playlist && playlist.id) map[playlist.id] = playlist
  })
  return map
}

/**
 * Save/share a playlist: name is required, then Google doc sync + public share,
 * then QR / link / copy / email.
 *
 * When all tunes are published scrapes, the sharer can choose a public no-login
 * link (one-shot import) or a Google share that registers ongoing tunebook sync
 * (and can upload private library / Drive media; recipients must sign in).
 */
export default function SharePlaylistModal({
  tunebook,
  token,
  login,
  googleDocumentId,
  tunes,
  saveTune,
  syncDocument,
  nowPlayingQueue,
  setNowPlayingQueue,
  playlistId: initialPlaylistId,
  playlistName: initialPlaylistName,
  playlists,
  tiny = true,
  variant = 'outline-info',
  buttonSize = 'sm',
  buttonClassName,
  dialogZIndex = 1300,
  setBlockKeyboardShortcuts,
  stopPropagation = false,
  onSaved,
}) {
  const [show, setShow] = useState(false)
  const [phase, setPhase] = useState('name') // name | working | ready
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState('')
  const [activePlaylistId, setActivePlaylistId] = useState(initialPlaylistId || null)
  const [activePlaylistName, setActivePlaylistName] = useState(initialPlaylistName || '')
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [audioSummary, setAudioSummary] = useState('')
  const [audioWarnings, setAudioWarnings] = useState([])
  const [pendingOpen, setPendingOpen] = useState(false)
  const [publicShareWarning, setPublicShareWarning] = useState('')
  const [mediaPlayabilityWarning, setMediaPlayabilityWarning] = useState('')
  const [canChooseShareVariant, setCanChooseShareVariant] = useState(false)
  const [shareVariant, setShareVariant] = useState('public') // public | google
  const [isPublicShare, setIsPublicShare] = useState(false)
  const [mediaModalPhase, setMediaModalPhase] = useState(null)
  const [mediaWorkSummary, setMediaWorkSummary] = useState(null)
  const [mediaProgress, setMediaProgress] = useState({})
  const [mediaEvents, setMediaEvents] = useState([])
  const shareContinuationRef = useRef(null)
  const sharePlaylistIdRef = useRef(null)
  const pendingGoogleShareRef = useRef(null)
  const docs = useGoogleDocument(token)
  const icons = tunebook && tunebook.icons ? tunebook.icons : {}
  const fromQueue = !!(nowPlayingQueue && Array.isArray(nowPlayingQueue.items) && nowPlayingQueue.items.length > 0)
  const isLesson = fromQueue && isLessonQueue(nowPlayingQueue)

  useEffect(function() {
    if (token && pendingOpen) {
      setPendingOpen(false)
      openNameStep()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, pendingOpen])

  useEffect(function() {
    if (!token || !pendingGoogleShareRef.current) return
    const pending = pendingGoogleShareRef.current
    pendingGoogleShareRef.current = null
    if (!googleDocumentId) {
      setBusy(false)
      setPhase('name')
      setNameError('Connect a Google tunebook to share with Drive media.')
      return
    }
    const syncPromise = typeof syncDocument === 'function'
      ? Promise.resolve(syncDocument())
      : Promise.resolve()
    syncPromise.catch(function() { /* still attempt share */ }).then(function() {
      prepareShare(pending.id, pending.name)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, googleDocumentId])

  function resetMediaModal() {
    setMediaModalPhase(null)
    setMediaWorkSummary(null)
    setMediaProgress({})
    setMediaEvents([])
    shareContinuationRef.current = null
  }

  function handleClose() {
    setShow(false)
    setPhase('name')
    setLink('')
    setBusy(false)
    setNameError('')
    setAudioSummary('')
    setAudioWarnings([])
    setPublicShareWarning('')
    setMediaPlayabilityWarning('')
    setCanChooseShareVariant(false)
    setShareVariant('public')
    setIsPublicShare(false)
    pendingGoogleShareRef.current = null
    resetMediaModal()
  }

  function analyzeCurrent(playlistLike) {
    return analyzePlaylistPublishedShare(playlistLike || {}, tunes)
  }

  function analyzeMedia(playlistLike) {
    return analyzePlaylistShareMediaPlayability(playlistLike || {}, tunes)
  }

  function mediaWarningFor(playlistLike, shareMode) {
    const media = analyzeMedia(playlistLike)
    if (media.ok) return ''
    return buildPlaylistShareMediaWarning(media.issues, { shareMode: shareMode || 'generic' })
  }

  function applyShareAnalyses(playlistLike, preferredVariant) {
    const published = analyzeCurrent(playlistLike)
    const media = analyzeMedia(playlistLike)
    const offersChoice = playlistShareOffersVariantChoice(published)
    const preferred = preferredVariant === 'public' || preferredVariant === 'google'
      ? preferredVariant
      : defaultPlaylistShareVariant(media)
    const nextVariant = offersChoice
      ? preferred
      : (published.ok ? 'public' : 'google')
    setPublicShareWarning(published.ok ? '' : published.warning)
    setCanChooseShareVariant(offersChoice)
    setShareVariant(nextVariant)
    setMediaPlayabilityWarning(mediaWarningFor(
      playlistLike,
      nextVariant === 'google' ? 'google' : 'public'
    ))
    return { published: published, media: media, offersChoice: offersChoice, shareVariant: nextVariant }
  }

  function openNameStep() {
    const defaultName = (initialPlaylistName
      || (nowPlayingQueue && nowPlayingQueue.name)
      || '').trim()
    setName(defaultName)
    setNameError('')
    setActivePlaylistId(initialPlaylistId || (nowPlayingQueue && nowPlayingQueue.savedPlaylistId) || null)
    setActivePlaylistName(defaultName)
    setLink('')
    setIsPublicShare(false)
    const source = fromQueue
      ? nowPlayingQueue
      : (initialPlaylistId ? getSavedPlaylist(initialPlaylistId) : null)
    applyShareAnalyses(source, null)
    setPhase('name')
    setShow(true)
  }

  function handleShareVariantChange(nextVariant) {
    setShareVariant(nextVariant)
    const source = fromQueue
      ? nowPlayingQueue
      : (initialPlaylistId ? getSavedPlaylist(initialPlaylistId) : (activePlaylistId ? getSavedPlaylist(activePlaylistId) : null))
    const playlistLike = source || { name: name, items: [] }
    setMediaPlayabilityWarning(mediaWarningFor(
      playlistLike,
      nextVariant === 'google' ? 'google' : 'public'
    ))
  }

  function handleTriggerClick(event) {
    if (stopPropagation && event) {
      event.preventDefault()
      event.stopPropagation()
    }
    if (isNavigatorOffline()) return
    const source = fromQueue
      ? nowPlayingQueue
      : (initialPlaylistId ? getSavedPlaylist(initialPlaylistId) : null)
    const analysis = analyzeCurrent(source)
    if (!analysis.ok && !token) {
      setPendingOpen(true)
      if (login) login()
      return
    }
    if (!analysis.ok && token && !googleDocumentId) return
    openNameStep()
  }

  function buildShareScope(playlistId) {
    return {
      shareKind: 'playlist',
      playlistId: playlistId,
      playlists: resolvePlaylistsMap(playlists),
    }
  }

  function confirmAndShareTunebookDoc(finishShare) {
    if (localStorage.getItem(PUBLIC_CONFIRM_KEY)) {
      finishShare()
      return
    }
    if (window.confirm('The Google document that stores your tune book will be readable by anyone with the link. Is that OK?')) {
      localStorage.setItem(PUBLIC_CONFIRM_KEY, 'true')
      finishShare()
    } else {
      setBusy(false)
      setPhase('name')
    }
  }

  function beginOwnedMediaShare(playlistId, continuation) {
    const scope = buildShareScope(playlistId)
    const work = summarizeShareMediaWork(tunes || {}, scope)
    if (!work.hasWork && work.totalItems === 0) {
      continuation()
      return
    }
    shareContinuationRef.current = continuation
    setMediaWorkSummary(work)
    setMediaEvents([])
    setMediaProgress({})
    if (work.hasWork) {
      setMediaModalPhase('warning')
      return
    }
    runOwnedMediaShare(playlistId, continuation)
  }

  function runOwnedMediaShare(playlistId, continuation) {
    const scope = buildShareScope(playlistId)
    setMediaModalPhase('working')
    setMediaEvents([])
    setMediaProgress({
      phase: 'upload',
      current: 0,
      total: 0,
      message: 'Starting audio upload…',
    })

    prepareOwnedMediaForShare(tunes || {}, scope, {
      token: token,
      driveApi: docs,
      googleDocumentId: googleDocumentId,
      saveTune: saveTune,
      autoConfirmPublic: true,
      onEvent: function(event) {
        setMediaEvents(function(prev) {
          return prev.concat([event]).slice(-80)
        })
      },
      onProgress: function(progress) {
        setMediaProgress(progress || {})
      },
    }).then(function(result) {
      if (result.summary) {
        setAudioSummary(formatAudioShareSummary(result.summary))
        setAudioWarnings(result.summary.notUploadable || [])
      }
      if (result.tunes && typeof saveTune === 'function') {
        Object.keys(result.tunes).forEach(function(id) {
          if (tunes && tunes[id] !== result.tunes[id]) {
            saveTune(result.tunes[id])
          }
        })
      }
      resetMediaModal()
      if (typeof continuation === 'function') continuation()
    }).catch(function() {
      resetMediaModal()
      if (typeof continuation === 'function') continuation()
    })
  }

  function finishPublicShareLink(playlistName, analysis, playlistLike) {
    const theLink = buildPlaylistPublicShareLink({
      name: playlistName,
      analysis: analysis,
    })
    if (!theLink) {
      setBusy(false)
      setPhase('name')
      setNameError('Could not build a public share link.')
      return
    }
    setActivePlaylistName(playlistName)
    setLink(theLink)
    setIsPublicShare(true)
    setPublicShareWarning('')
    setMediaPlayabilityWarning(mediaWarningFor(playlistLike, 'public'))
    setBusy(false)
    setPhase('ready')
  }

  function finishShareLink(playlistId, playlistName) {
    setBusy(true)
    docs.addPermission(googleDocumentId, { type: 'anyone', role: 'reader' }).finally(function() {
      const theLink = buildShareImportLink({
        googleDocumentId: googleDocumentId,
        shareKind: 'playlist',
        playlistId: playlistId,
      })
      setActivePlaylistId(playlistId)
      setActivePlaylistName(playlistName)
      setLink(theLink)
      setIsPublicShare(false)
      const playlistLike = getSavedPlaylist(playlistId) || { id: playlistId, name: playlistName }
      setMediaPlayabilityWarning(mediaWarningFor(playlistLike, 'google'))
      setBusy(false)
      setPhase('ready')
    })
  }

  function prepareShare(playlistId, playlistName) {
    if (isNavigatorOffline() || !googleDocumentId || !token) return
    setActivePlaylistId(playlistId)
    setActivePlaylistName(playlistName)
    sharePlaylistIdRef.current = playlistId

    function runAudioShareThenDocShare() {
      setBusy(true)
      beginOwnedMediaShare(playlistId, function afterOwnedMedia() {
        if (localStorage.getItem(PUBLIC_CONFIRM_KEY)) {
          finishShareLink(playlistId, playlistName)
          return
        }
        setBusy(true)
        docs.listPermissions(googleDocumentId).then(function(permissionsRes) {
          if (isAnyoneReadable(permissionsRes)) {
            localStorage.setItem(PUBLIC_CONFIRM_KEY, 'true')
            finishShareLink(playlistId, playlistName)
            return
          }
          setBusy(false)
          confirmAndShareTunebookDoc(function() {
            finishShareLink(playlistId, playlistName)
          })
        })
      })
    }

    if (localStorage.getItem(PUBLIC_CONFIRM_KEY)) {
      runAudioShareThenDocShare()
      return
    }

    setBusy(true)
    docs.listPermissions(googleDocumentId).then(function(permissionsRes) {
      if (isAnyoneReadable(permissionsRes)) {
        localStorage.setItem(PUBLIC_CONFIRM_KEY, 'true')
        setBusy(false)
        runAudioShareThenDocShare()
        return
      }
      setBusy(false)
      confirmAndShareTunebookDoc(runAudioShareThenDocShare)
    })
  }

  function beginGoogleSharePath(saved) {
    if (!token) {
      pendingGoogleShareRef.current = { id: saved.id, name: saved.name }
      setBusy(false)
      setPhase('name')
      if (login) login()
      return
    }
    if (!googleDocumentId) {
      setBusy(false)
      setPhase('name')
      setNameError('Connect a Google tunebook to share with Drive media.')
      return
    }
    const syncPromise = typeof syncDocument === 'function'
      ? Promise.resolve(syncDocument())
      : Promise.resolve()
    syncPromise.catch(function() { /* still attempt share */ }).then(function() {
      prepareShare(saved.id, saved.name)
    })
  }

  function saveNamedPlaylist(trimmedName) {
    if (fromQueue) {
      const saved = savePlaylistFromQueue(nowPlayingQueue, {
        id: nowPlayingQueue.savedPlaylistId || initialPlaylistId,
        name: trimmedName,
      })
      if (!saved) return null
      if (typeof setNowPlayingQueue === 'function') {
        setNowPlayingQueue(Object.assign({}, nowPlayingQueue, {
          name: saved.name,
          savedPlaylistId: saved.id,
        }))
      }
      return saved
    }

    const existingId = initialPlaylistId || activePlaylistId
    const existing = existingId ? getSavedPlaylist(existingId) : null
    if (!existing) return null
    return savePlaylist(Object.assign({}, existing, { name: trimmedName }), { id: existing.id })
  }

  function handleSubmitName(event) {
    if (event) event.preventDefault()
    const trimmed = String(name || '').trim()
    if (!trimmed) {
      setNameError('A playlist name is required.')
      return
    }
    setNameError('')
    setBusy(true)
    setPhase('working')

    const saved = saveNamedPlaylist(trimmed)
    if (!saved) {
      setBusy(false)
      setPhase('name')
      setNameError('Could not save playlist.')
      return
    }
    if (typeof onSaved === 'function') onSaved(saved)

    const result = applyShareAnalyses(saved, shareVariant)
    const usePublic = result.published.ok && (
      !result.offersChoice || result.shareVariant === 'public'
    )

    if (usePublic) {
      const syncPromise = typeof syncDocument === 'function'
        ? Promise.resolve(syncDocument())
        : Promise.resolve()
      syncPromise.catch(function() { /* still share publicly */ }).then(function() {
        finishPublicShareLink(saved.name, result.published, saved)
      })
      return
    }

    beginGoogleSharePath(saved)
  }

  function handleMediaWarningConfirm() {
    const continuation = shareContinuationRef.current
    runOwnedMediaShare(sharePlaylistIdRef.current || activePlaylistId, continuation)
  }

  function handleMediaWarningCancel() {
    resetMediaModal()
    setBusy(false)
    setPhase('name')
  }

  if (isLesson) return null

  const context = { playlistName: activePlaylistName || name }
  const emailHref = link
    ? 'mailto:?subject=' + encodeURIComponent(shareEmailSubject('playlist', context))
      + '&body=' + encodeURIComponent(
        (isPublicShare
          ? 'Import this shared playlist (no login required):\n\n'
          : 'Import this shared tunebook playlist:\n\n')
        + link
      )
    : null

  const triggerDisabled = busy || isNavigatorOffline()

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={buttonSize}
        className={buttonClassName || 'share-playlist-trigger-btn'}
        disabled={triggerDisabled}
        title={isNavigatorOffline() ? OFFLINE_LOGIN_MESSAGE : 'Share playlist'}
        aria-label="Share playlist"
        data-testid="share-playlist-button"
        onClick={handleTriggerClick}
      >
        {icons.share}
        {!tiny ? <span className="ms-1">Share</span> : null}
      </Button>

      <ShareOwnedMediaProgressModal
        show={!!mediaModalPhase}
        phase={mediaModalPhase || 'working'}
        workSummary={mediaWorkSummary}
        progress={mediaProgress}
        events={mediaEvents}
        onConfirm={handleMediaWarningConfirm}
        onCancel={mediaModalPhase === 'warning' ? handleMediaWarningCancel : null}
      />

      <Modal
        show={show}
        onHide={handleClose}
        size="lg"
        fullscreen="md-down"
        dialogClassName="share-playlist-modal"
        backdrop="static"
        keyboard={false}
        style={dialogZIndex ? { zIndex: dialogZIndex } : undefined}
        backdropClassName={dialogZIndex ? 'media-controls-modal-backdrop-elevated' : undefined}
        onClick={stopPropagation ? function(e) { e.stopPropagation() } : undefined}
      >
        <Modal.Header closeButton>
          <Modal.Title>
            {phase === 'ready'
              ? shareModalTitle('playlist', context)
              : 'Share playlist'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body
          className={phase === 'ready'
            ? 'd-flex flex-column align-items-center text-center share-playlist-modal-body'
            : undefined}
        >
          {phase === 'name' ? (
            <Form onSubmit={handleSubmitName}>
              {publicShareWarning ? (
                <Alert variant="warning" className="text-start" data-testid="playlist-public-share-warning">
                  {publicShareWarning}
                </Alert>
              ) : canChooseShareVariant ? (
                <Alert variant="info" className="text-start" data-testid="playlist-share-variant-hint">
                  All tunes are available from published collections. Choose a one-shot public link
                  (no login) or a Google share so recipients sign in and stay synced to your tunebook playlist updates.
                </Alert>
              ) : null}
              {mediaPlayabilityWarning ? (
                <Alert variant="warning" className="text-start" data-testid="playlist-media-playability-warning">
                  {mediaPlayabilityWarning}
                </Alert>
              ) : null}
              {canChooseShareVariant ? (
                <Form.Group className="mb-3" controlId="share-playlist-variant" data-testid="playlist-share-variant">
                  <Form.Label>Share link type</Form.Label>
                  <div>
                    <Form.Check
                      type="radio"
                      name="share-playlist-variant"
                      id="share-playlist-variant-google"
                      data-testid="playlist-share-variant-google"
                      label="Google share — recipients sign in and keep receiving updates from your shared tunebook; library / Drive / recording media can be uploaded"
                      checked={shareVariant === 'google'}
                      onChange={function() { handleShareVariantChange('google') }}
                      className="mb-2 text-start"
                    />
                    <Form.Check
                      type="radio"
                      name="share-playlist-variant"
                      id="share-playlist-variant-public"
                      data-testid="playlist-share-variant-public"
                      label="Public scrape link — no login; one-time import (not synced to later changes); private library / Drive media will not play"
                      checked={shareVariant === 'public'}
                      onChange={function() { handleShareVariantChange('public') }}
                      className="text-start"
                    />
                  </div>
                </Form.Group>
              ) : null}
              <Form.Group className="mb-3" controlId="share-playlist-name">
                <Form.Label>Playlist name</Form.Label>
                <VoiceFillInput
                  value={name}
                  onChange={function(e) {
                    setName(e.target.value)
                    if (nameError) setNameError('')
                  }}
                  placeholder="Name this playlist"
                  aria-label="Playlist name"
                  data-testid="share-playlist-name-input"
                  fieldKind="search"
                  token={token}
                  setBlockKeyboardShortcuts={setBlockKeyboardShortcuts}
                  autoFocus
                />
                {nameError ? (
                  <Form.Text className="text-danger">{nameError}</Form.Text>
                ) : (
                  <Form.Text className="text-muted">
                    Required. The playlist is saved before sharing.
                  </Form.Text>
                )}
              </Form.Group>
              <div className="d-flex gap-2 justify-content-end">
                <Button type="button" variant="secondary" onClick={handleClose}>Cancel</Button>
                <Button type="submit" variant="info" disabled={busy || !String(name || '').trim()}>
                  {icons.share} Share
                </Button>
              </div>
            </Form>
          ) : null}

          {phase === 'working' ? (
            <p className="mb-0 text-center">Saving and preparing share link…</p>
          ) : null}

          {phase === 'ready' && link ? (
            <>
              {isPublicShare ? (
                <Alert variant="success" className="w-100 mb-3 text-start">
                  Public scrape share: recipients import once from published collections (no login, not synced to later changes).
                </Alert>
              ) : publicShareWarning ? (
                <Alert variant="warning" className="w-100 mb-3 text-start" data-testid="playlist-public-share-warning-ready">
                  {publicShareWarning}
                </Alert>
              ) : (
                <Alert variant="info" className="w-100 mb-3 text-start" data-testid="playlist-google-share-ready">
                  Google share: recipients sign in to import from your shared tunebook and stay synced to later changes. Attached media is playable only if it was uploaded and shared publicly.
                </Alert>
              )}
              {mediaPlayabilityWarning ? (
                <Alert variant="warning" className="w-100 mb-3 text-start" data-testid="playlist-media-playability-warning-ready">
                  {mediaPlayabilityWarning}
                </Alert>
              ) : null}
              {audioSummary ? (
                <Alert variant="info" className="w-100 mb-3">{audioSummary}</Alert>
              ) : null}
              {audioWarnings.length > 0 ? (
                <Alert variant="warning" className="w-100 mb-3 text-start">
                  <div>Some audio files could not be uploaded to Google Drive and will not play for others:</div>
                  <ul className="mb-0 mt-2">
                    {audioWarnings.map(function(warning, idx) {
                      return <li key={idx}>{warning}</li>
                    })}
                  </ul>
                </Alert>
              ) : null}
              <div className="share-tunebook-qr-wrap mb-3">
                <ShareQrCode
                  value={link}
                  size={Math.min(280, Math.max(180, Math.floor(window.innerWidth * 0.4)))}
                />
              </div>
              <div className="d-flex flex-wrap gap-2 justify-content-center">
                <Button variant="info" onClick={function() { tunebook.utils.copyText(link) }}>
                  Copy Link
                </Button>
                {emailHref ? (
                  <a href={emailHref} className="btn btn-outline-primary">Share by Email</a>
                ) : null}
              </div>
              <p className="text-muted small mt-3 mb-0">Keep this open so others can scan the QR code.</p>
            </>
          ) : null}
        </Modal.Body>
      </Modal>
    </>
  )
}
