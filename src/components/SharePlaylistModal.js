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
  const existingPlaylistId = initialPlaylistId
    || (fromQueue && nowPlayingQueue.savedPlaylistId)
    || null
  const isExistingPlaylist = !!existingPlaylistId

  useEffect(function() {
    if (!token || !pendingGoogleShareRef.current) return
    const pending = pendingGoogleShareRef.current
    pendingGoogleShareRef.current = null
    if (!googleDocumentId) {
      setBusy(false)
      setPhase('name')
      return
    }
    // Kick sync in the background — never block the share link on it.
    if (typeof syncDocument === 'function') {
      try { Promise.resolve(syncDocument()).catch(function() {}) } catch (e) { /* ignore */ }
    }
    prepareShare(pending.id, pending.name)
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

  function mediaWarningFor(playlistLike) {
    const media = analyzeMedia(playlistLike)
    if (media.ok) return ''
    return buildPlaylistShareMediaWarning(media.issues)
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
    setMediaPlayabilityWarning(mediaWarningFor(playlistLike))
    return { published: published, media: media, offersChoice: offersChoice, shareVariant: nextVariant }
  }

  function openNameStep() {
    const existing = existingPlaylistId ? getSavedPlaylist(existingPlaylistId) : null
    const defaultName = (
      (existing && existing.name)
      || initialPlaylistName
      || (nowPlayingQueue && nowPlayingQueue.name)
      || ''
    ).trim()
    setName(defaultName)
    setNameError('')
    setActivePlaylistId(existingPlaylistId || null)
    setActivePlaylistName(defaultName)
    setLink('')
    setIsPublicShare(false)
    const source = fromQueue
      ? nowPlayingQueue
      : (existingPlaylistId ? (existing || getSavedPlaylist(existingPlaylistId)) : null)
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
    setMediaPlayabilityWarning(mediaWarningFor(playlistLike))
  }

  function handleTriggerClick(event) {
    if (stopPropagation && event) {
      event.preventDefault()
      event.stopPropagation()
    }
    if (isNavigatorOffline()) return
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
      // Keep options visible under the elevated media confirm dialog.
      setBusy(false)
      setPhase('name')
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
    setMediaPlayabilityWarning(mediaWarningFor(playlistLike))
    setBusy(false)
    setPhase('ready')
  }

  function finishShareLink(playlistId, playlistName) {
    setBusy(true)
    setPhase('working')
    const finish = function() {
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
      setMediaPlayabilityWarning(mediaWarningFor(playlistLike))
      setBusy(false)
      setPhase('ready')
    }
    const add = docs && docs.addPermission
      ? docs.addPermission(googleDocumentId, { type: 'anyone', role: 'reader' })
      : Promise.resolve()
    Promise.resolve(add).catch(function() { /* still share */ }).then(finish)
  }

  function prepareShare(playlistId, playlistName) {
    if (isNavigatorOffline() || !googleDocumentId || !token) {
      setBusy(false)
      setPhase('name')
      return
    }
    setActivePlaylistId(playlistId)
    setActivePlaylistName(playlistName)
    sharePlaylistIdRef.current = playlistId

    function failPermissions() {
      setBusy(false)
      setPhase('name')
      setNameError('Could not check Google sharing permissions.')
    }

    function runAudioShareThenDocShare() {
      setBusy(true)
      setPhase('working')
      beginOwnedMediaShare(playlistId, function afterOwnedMedia() {
        if (localStorage.getItem(PUBLIC_CONFIRM_KEY)) {
          finishShareLink(playlistId, playlistName)
          return
        }
        setBusy(true)
        setPhase('working')
        docs.listPermissions(googleDocumentId).then(function(permissionsRes) {
          if (isAnyoneReadable(permissionsRes)) {
            localStorage.setItem(PUBLIC_CONFIRM_KEY, 'true')
            finishShareLink(playlistId, playlistName)
            return
          }
          setBusy(false)
          setPhase('name')
          confirmAndShareTunebookDoc(function() {
            setBusy(true)
            setPhase('working')
            finishShareLink(playlistId, playlistName)
          })
        }).catch(failPermissions)
      })
    }

    if (localStorage.getItem(PUBLIC_CONFIRM_KEY)) {
      runAudioShareThenDocShare()
      return
    }

    setBusy(true)
    setPhase('working')
    docs.listPermissions(googleDocumentId).then(function(permissionsRes) {
      if (isAnyoneReadable(permissionsRes)) {
        localStorage.setItem(PUBLIC_CONFIRM_KEY, 'true')
        setBusy(false)
        runAudioShareThenDocShare()
        return
      }
      setBusy(false)
      setPhase('name')
      confirmAndShareTunebookDoc(runAudioShareThenDocShare)
    }).catch(failPermissions)
  }

  function beginGoogleSharePath(saved) {
    if (!token || !googleDocumentId) {
      pendingGoogleShareRef.current = { id: saved.id, name: saved.name }
      setBusy(false)
      setPhase('name')
      setShareVariant('google')
      return
    }
    if (typeof syncDocument === 'function') {
      try { Promise.resolve(syncDocument()).catch(function() {}) } catch (e) { /* ignore */ }
    }
    prepareShare(saved.id, saved.name)
  }

  function resolvePlaylistForShare(trimmedName) {
    // Existing saved playlist: share in place (optional in-place rename only if name edited).
    if (isExistingPlaylist && !fromQueue) {
      const existing = getSavedPlaylist(existingPlaylistId)
      if (!existing) return null
      const nextName = (trimmedName || existing.name || '').trim() || existing.name
      if (nextName && nextName !== existing.name) {
        return savePlaylist(Object.assign({}, existing, { name: nextName }), { id: existing.id })
      }
      return existing
    }

    // Queue already tied to a saved playlist: update that record in place (not a duplicate).
    if (fromQueue && existingPlaylistId) {
      const saved = savePlaylistFromQueue(nowPlayingQueue, {
        id: existingPlaylistId,
        name: (trimmedName || nowPlayingQueue.name || '').trim() || 'Playlist',
      })
      if (saved && typeof setNowPlayingQueue === 'function') {
        setNowPlayingQueue(Object.assign({}, nowPlayingQueue, {
          name: saved.name,
          savedPlaylistId: saved.id,
        }))
      }
      return saved
    }

    // Unsaved queue / new playlist: create once with the provided name.
    if (fromQueue) {
      const saved = savePlaylistFromQueue(nowPlayingQueue, {
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
    if (!isExistingPlaylist && !trimmed) {
      setNameError('A playlist name is required.')
      return
    }
    setNameError('')
    setBusy(true)
    setPhase('working')

    const saved = resolvePlaylistForShare(trimmed)
    if (!saved) {
      setBusy(false)
      setPhase('name')
      setNameError(isExistingPlaylist ? 'Playlist not found.' : 'Could not save playlist.')
      return
    }
    if (typeof onSaved === 'function' && !isExistingPlaylist) onSaved(saved)
    else if (typeof onSaved === 'function' && fromQueue) onSaved(saved)

    const result = applyShareAnalyses(saved, shareVariant)
    const usePublic = result.published.ok && (
      !result.offersChoice || result.shareVariant === 'public'
    )

    if (usePublic) {
      // Do not block the share link on tunebook sync — that can hang indefinitely.
      if (typeof syncDocument === 'function') {
        try { Promise.resolve(syncDocument()).catch(function() {}) } catch (e) { /* ignore */ }
      }
      finishPublicShareLink(saved.name, result.published, saved)
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
        (isPublicShare ? 'Import (no login):\n\n' : 'Import shared playlist:\n\n') + link
      )
    : null

  const triggerDisabled = busy || isNavigatorOffline()
  const needsLoginForGoogle = (shareVariant === 'google' || !canChooseShareVariant) && (!token || !googleDocumentId)

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
        dialogZIndex={dialogZIndex ? dialogZIndex + 20 : 1320}
        onConfirm={handleMediaWarningConfirm}
        onCancel={mediaModalPhase === 'warning' ? handleMediaWarningCancel : null}
      />

      <Modal
        show={show}
        onHide={handleClose}
        size="lg"
        fullscreen="md-down"
        dialogClassName="share-dialog-modal"
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
              : (activePlaylistName || name
                ? 'Share — ' + (activePlaylistName || name)
                : 'Share playlist')}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body
          className={phase === 'ready'
            ? 'd-flex flex-column align-items-center text-center share-dialog-modal-body'
            : undefined}
        >
          {phase === 'name' ? (
            <Form onSubmit={handleSubmitName}>
              {publicShareWarning ? (
                <Alert variant="warning" className="text-start" data-testid="playlist-public-share-warning">
                  {publicShareWarning}
                </Alert>
              ) : null}
              {mediaPlayabilityWarning ? (
                <Alert variant="warning" className="text-start" data-testid="playlist-media-playability-warning">
                  {mediaPlayabilityWarning}
                </Alert>
              ) : null}
              {canChooseShareVariant ? (
                <Form.Group className="mb-3" controlId="share-playlist-variant" data-testid="playlist-share-variant">
                  <Form.Label>Link type</Form.Label>
                  <div>
                    <Form.Check
                      type="radio"
                      name="share-playlist-variant"
                      id="share-playlist-variant-google"
                      data-testid="playlist-share-variant-google"
                      label="Google — sign-in, stays synced"
                      checked={shareVariant === 'google'}
                      onChange={function() { handleShareVariantChange('google') }}
                      className="mb-2 text-start"
                    />
                    <Form.Check
                      type="radio"
                      name="share-playlist-variant"
                      id="share-playlist-variant-public"
                      data-testid="playlist-share-variant-public"
                      label="Public — no login, one-time copy"
                      checked={shareVariant === 'public'}
                      onChange={function() { handleShareVariantChange('public') }}
                      className="text-start"
                    />
                  </div>
                </Form.Group>
              ) : null}
              {needsLoginForGoogle ? (
                <Alert variant="warning" className="text-start" data-testid="playlist-share-login-required">
                  Sign in required
                  <div className="mt-2">
                    <Button type="button" variant="info" size="sm" onClick={function() {
                      if (login) login()
                    }}>
                      Login
                    </Button>
                  </div>
                </Alert>
              ) : null}
              {!isExistingPlaylist ? (
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
                  ) : null}
                </Form.Group>
              ) : nameError ? (
                <Alert variant="danger" className="text-start">{nameError}</Alert>
              ) : null}
              <div className="d-flex gap-2 justify-content-end">
                <Button type="button" variant="secondary" onClick={handleClose}>Cancel</Button>
                <Button
                  type="submit"
                  variant="info"
                  disabled={
                    busy
                    || (!isExistingPlaylist && !String(name || '').trim())
                    || (needsLoginForGoogle && shareVariant !== 'public')
                  }
                >
                  {icons.share} Share
                </Button>
              </div>
            </Form>
          ) : null}

          {phase === 'working' ? (
            <p className="mb-0 text-center">Preparing share link…</p>
          ) : null}

          {phase === 'ready' && link ? (
            <>
              {isPublicShare ? (
                <Alert variant="success" className="w-100 mb-3 text-start">
                  Public link — one-time import
                </Alert>
              ) : publicShareWarning ? (
                <Alert variant="warning" className="w-100 mb-3 text-start" data-testid="playlist-public-share-warning-ready">
                  {publicShareWarning}
                </Alert>
              ) : (
                <Alert variant="info" className="w-100 mb-3 text-start" data-testid="playlist-google-share-ready">
                  Google link — stays synced
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
                  <div>Couldn’t upload:</div>
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
            </>
          ) : null}
        </Modal.Body>
      </Modal>
    </>
  )
}
