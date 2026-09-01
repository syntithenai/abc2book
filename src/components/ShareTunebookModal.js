import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Form, Modal } from 'react-bootstrap'
import useGoogleDocument from '../useGoogleDocument'
import {
  buildShareImportLink,
  shareModalTitle,
  shareEmailSubject,
} from '../shareTunebookUtils'
import {
  analyzeBookPublishedShare,
  analyzeSetPublishedShare,
  analyzeShareMediaForPlaylist,
  analyzeShareMediaForSet,
  analyzeShareMediaForTune,
  analyzeShareMediaPlayability,
  analyzeTunePublishedShare,
  buildBookPublicShareLink,
  buildTunePublicShareLink,
  defaultShareVariant,
  shareOffersVariantChoice,
} from '../publicScrapeShare'
import { buildSetPublicShareLink } from '../setPublicShare'
import { analyzePlaylistPublishedShare, buildPlaylistPublicShareLink } from '../playlistPublicShare'
import {
  isAnyoneReadable,
  prepareOwnedMediaForShare,
  summarizeShareMediaWork,
} from '../shareOwnedMediaUtils'
import { getPerformanceSet, listPerformanceSets } from '../performanceSetStore'
import { listSavedPlaylists } from '../savedPlaylistsStore'
import ShareOwnedMediaProgressModal from './ShareOwnedMediaProgressModal'
import ShareQrCode from './ShareQrCode'
import { OFFLINE_LOGIN_MESSAGE, isNavigatorOffline } from '../offlineNetwork'

const PUBLIC_CONFIRM_KEY = 'bookstorage_tunebook_public'

function formatAudioShareSummary(summary) {
  if (!summary) return ''
  const parts = []
  if (summary.uploaded > 0) {
    parts.push(summary.uploaded + ' uploaded')
  }
  if (summary.shared > 0) {
    parts.push(summary.shared + ' shared')
  }
  if (summary.alreadyPublic > 0) {
    parts.push(summary.alreadyPublic + ' already public')
  }
  if (summary.notUploadable && summary.notUploadable.length > 0) {
    parts.push(summary.notUploadable.length + ' failed')
  }
  if (summary.failed && summary.failed.length > 0) {
    parts.push(summary.failed.length + ' failed')
  }
  return parts.join(' · ')
}

function supportsPublicVariant(shareKind) {
  return shareKind === 'tune' || shareKind === 'book' || shareKind === 'set' || shareKind === 'playlist'
}

/**
 * Share tune / book / set / all via public scrape (when possible) or Google importdoc.
 * Never auto-opens login on trigger click.
 */
export default function ShareTunebookModal({
  tunebook,
  token,
  login,
  googleDocumentId,
  shareKind = 'all',
  tuneId,
  currentTuneBook,
  setId,
  setName,
  playlistId,
  playlistName,
  tuneName,
  tunes,
  sets,
  playlists,
  saveTune,
  tiny,
  variant,
  buttonSize,
  buttonClassName,
}) {
  const [show, setShow] = useState(false)
  const [phase, setPhase] = useState('options') // options | working | ready
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [audioSummary, setAudioSummary] = useState('')
  const [audioWarnings, setAudioWarnings] = useState([])
  const [publicShareWarning, setPublicShareWarning] = useState('')
  const [mediaPlayabilityWarning, setMediaPlayabilityWarning] = useState('')
  const [canChooseShareVariant, setCanChooseShareVariant] = useState(false)
  const [shareVariant, setShareVariant] = useState('public')
  const [isPublicShare, setIsPublicShare] = useState(false)
  const [mediaModalPhase, setMediaModalPhase] = useState(null)
  const [mediaWorkSummary, setMediaWorkSummary] = useState(null)
  const [mediaProgress, setMediaProgress] = useState({})
  const [mediaEvents, setMediaEvents] = useState([])
  const shareContinuationRef = useRef(null)
  const pendingGoogleShareRef = useRef(false)
  const docs = useGoogleDocument(token)
  const icons = tunebook && tunebook.icons ? tunebook.icons : {}

  const bookName = currentTuneBook || null
  const context = {
    bookName: bookName,
    setName: setName,
    tuneName: tuneName,
    playlistName: playlistName,
  }

  useEffect(function() {
    if (!token || !pendingGoogleShareRef.current) return
    pendingGoogleShareRef.current = false
    if (!googleDocumentId) return
    runGoogleSharePath()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, googleDocumentId])

  function resolveSetsMap() {
    if (sets) return sets
    const map = {}
    listPerformanceSets().forEach(function(setRecord) {
      if (setRecord && setRecord.id) map[setRecord.id] = setRecord
    })
    return map
  }

  function resolvePlaylistsMap() {
    if (playlists) return playlists
    const map = {}
    listSavedPlaylists().forEach(function(playlist) {
      if (playlist && playlist.id) map[playlist.id] = playlist
    })
    return map
  }

  function resolvePublishedAndMedia() {
    if (shareKind === 'tune') {
      const tune = tunes && tuneId != null ? tunes[tuneId] : null
      const withId = tune ? Object.assign({}, tune, { id: tune.id != null ? tune.id : tuneId }) : { id: tuneId, name: tuneName }
      return {
        published: analyzeTunePublishedShare(withId),
        media: analyzeShareMediaForTune(withId),
      }
    }
    if (shareKind === 'book') {
      return {
        published: analyzeBookPublishedShare(bookName),
        media: analyzeShareMediaForTuneIdsInBook(bookName),
      }
    }
    if (shareKind === 'set') {
      const setRecord = (sets && setId && sets[setId]) || getPerformanceSet(setId) || { id: setId, name: setName, items: [] }
      return {
        published: analyzeSetPublishedShare(setRecord, tunes),
        media: analyzeShareMediaForSet(setRecord, tunes),
      }
    }
    if (shareKind === 'playlist') {
      const playlist = resolvePlaylistsMap()[playlistId] || { id: playlistId, name: playlistName, items: [] }
      return {
        published: analyzePlaylistPublishedShare(playlist, tunes),
        media: analyzeShareMediaForPlaylist(playlist, tunes),
      }
    }
    return {
      published: { ok: false, warning: 'Needs Google share' },
      media: { ok: true, issues: [], warning: '' },
    }
  }

  function analyzeShareMediaForTuneIdsInBook(name) {
    const all = tunes || {}
    const items = []
    Object.keys(all).forEach(function(id) {
      const tune = all[id]
      if (tune && Array.isArray(tune.books) && tune.books.indexOf(name) !== -1) {
        items.push({ tuneId: id })
      }
    })
    return analyzeShareMediaPlayability(items, all)
  }

  function applyAnalyses(preferredVariant) {
    if (!supportsPublicVariant(shareKind)) {
      setCanChooseShareVariant(false)
      setShareVariant('google')
      setPublicShareWarning('')
      setMediaPlayabilityWarning('')
      return { published: { ok: false }, media: { ok: true }, offersChoice: false, shareVariant: 'google' }
    }
    const result = resolvePublishedAndMedia()
    const offersChoice = shareOffersVariantChoice(result.published)
    const preferred = preferredVariant === 'public' || preferredVariant === 'google'
      ? preferredVariant
      : defaultShareVariant(result.media)
    const nextVariant = offersChoice ? preferred : 'google'
    setPublicShareWarning(result.published.ok ? '' : (result.published.warning || ''))
    setCanChooseShareVariant(offersChoice)
    setShareVariant(nextVariant)
    setMediaPlayabilityWarning(result.media && !result.media.ok ? (result.media.warning || '') : '')
    return {
      published: result.published,
      media: result.media,
      offersChoice: offersChoice,
      shareVariant: nextVariant,
    }
  }

  function resetMediaModal() {
    setMediaModalPhase(null)
    setMediaWorkSummary(null)
    setMediaProgress({})
    setMediaEvents([])
    shareContinuationRef.current = null
  }

  function handleClose() {
    setShow(false)
    setPhase('options')
    setLink('')
    setBusy(false)
    setAudioSummary('')
    setAudioWarnings([])
    setPublicShareWarning('')
    setMediaPlayabilityWarning('')
    setCanChooseShareVariant(false)
    setShareVariant('public')
    setIsPublicShare(false)
    pendingGoogleShareRef.current = false
    resetMediaModal()
  }

  function openOptions() {
    if (isNavigatorOffline()) return
    applyAnalyses(null)
    setLink('')
    setIsPublicShare(false)
    setAudioSummary('')
    setAudioWarnings([])
    setPhase('options')
    setShow(true)
  }

  function buildShareScope() {
    return {
      shareKind: shareKind,
      tuneId: tuneId,
      bookName: bookName,
      setId: setId,
      sets: resolveSetsMap(),
      playlistId: playlistId,
      playlists: resolvePlaylistsMap(),
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
      setPhase('options')
    }
  }

  function beginOwnedMediaShare(continuation) {
    const scope = buildShareScope()
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
      setBusy(false)
      setPhase('options')
      setMediaModalPhase('warning')
      return
    }
    runOwnedMediaShare(continuation)
  }

  function runOwnedMediaShare(continuation) {
    const scope = buildShareScope()
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

  function finishPublicShare(analysis) {
    let theLink = ''
    if (shareKind === 'tune') {
      const tune = tunes && tuneId != null ? tunes[tuneId] : null
      const withId = tune ? Object.assign({}, tune, { id: tune.id != null ? tune.id : tuneId }) : { id: tuneId, name: tuneName }
      theLink = buildTunePublicShareLink({ tune: withId, analysis: analysis })
    } else if (shareKind === 'book') {
      theLink = buildBookPublicShareLink({ bookName: bookName, analysis: analysis })
    } else if (shareKind === 'set') {
      const setRecord = (sets && setId && sets[setId]) || getPerformanceSet(setId) || { id: setId, name: setName }
      theLink = buildSetPublicShareLink({
        set: setRecord,
        name: setName || (setRecord && setRecord.name),
        analysis: analysis,
        tunes: tunes,
      })
    } else if (shareKind === 'playlist') {
      theLink = buildPlaylistPublicShareLink({
        name: playlistName,
        analysis: analysis,
        playlist: resolvePlaylistsMap()[playlistId],
        tunes: tunes,
      })
    }
    if (!theLink) {
      setBusy(false)
      setPhase('options')
      setPublicShareWarning('Could not build a public share link.')
      return
    }
    setLink(theLink)
    setIsPublicShare(true)
    setBusy(false)
    setPhase('ready')
  }

  function finishGoogleShareLink() {
    setBusy(true)
    setPhase('working')
    const finish = function() {
      const theLink = buildShareImportLink({
        googleDocumentId: googleDocumentId,
        shareKind: shareKind,
        tuneId: tuneId,
        bookName: bookName,
        setId: setId,
        playlistId: playlistId,
      })
      setLink(theLink)
      setIsPublicShare(false)
      setBusy(false)
      setPhase('ready')
    }
    const add = docs && docs.addPermission
      ? docs.addPermission(googleDocumentId, { type: 'anyone', role: 'reader' })
      : Promise.resolve()
    Promise.resolve(add).catch(function() { /* still share */ }).then(finish)
  }

  function runGoogleSharePath() {
    if (isNavigatorOffline() || !googleDocumentId || !token) {
      setBusy(false)
      setPhase('options')
      return
    }
    setPhase('working')
    setBusy(true)

    function failPermissions() {
      setBusy(false)
      setPhase('options')
      setPublicShareWarning('Could not check Google sharing permissions.')
    }

    function runAudioShareThenDocShare() {
      beginOwnedMediaShare(function afterOwnedMedia() {
        if (localStorage.getItem(PUBLIC_CONFIRM_KEY)) {
          finishGoogleShareLink()
          return
        }
        docs.listPermissions(googleDocumentId).then(function(permissionsRes) {
          if (isAnyoneReadable(permissionsRes)) {
            localStorage.setItem(PUBLIC_CONFIRM_KEY, 'true')
            finishGoogleShareLink()
            return
          }
          setBusy(false)
          setPhase('options')
          confirmAndShareTunebookDoc(function() {
            setBusy(true)
            setPhase('working')
            finishGoogleShareLink()
          })
        }).catch(failPermissions)
      })
    }

    if (localStorage.getItem(PUBLIC_CONFIRM_KEY)) {
      runAudioShareThenDocShare()
      return
    }

    docs.listPermissions(googleDocumentId).then(function(permissionsRes) {
      if (isAnyoneReadable(permissionsRes)) {
        localStorage.setItem(PUBLIC_CONFIRM_KEY, 'true')
        runAudioShareThenDocShare()
        return
      }
      setBusy(false)
      setPhase('options')
      confirmAndShareTunebookDoc(runAudioShareThenDocShare)
    }).catch(failPermissions)
  }

  function beginGoogleShare() {
    if (!token) {
      pendingGoogleShareRef.current = true
      if (login) login()
      return
    }
    if (!googleDocumentId) return
    runGoogleSharePath()
  }

  function handleConfirmShare() {
    const result = applyAnalyses(shareVariant)
    const usePublic = result.offersChoice && result.shareVariant === 'public' && result.published.ok
    if (usePublic) {
      setBusy(true)
      setPhase('working')
      finishPublicShare(result.published)
      return
    }
    if (!token || !googleDocumentId) {
      // Stay on options; login message shown in UI
      return
    }
    beginGoogleShare()
  }

  function handleMediaWarningConfirm() {
    const continuation = shareContinuationRef.current
    runOwnedMediaShare(continuation)
  }

  function handleMediaWarningCancel() {
    resetMediaModal()
    setBusy(false)
    setPhase('options')
  }

  const buttonLabel = shareKind === 'all' ? 'Share All' : 'Share'
  const needsLoginForGoogle = shareVariant === 'google' && (!token || !googleDocumentId)
  const googleOnlyNeedsLogin = !canChooseShareVariant && (!token || !googleDocumentId)

  const emailHref = link
    ? 'mailto:?subject=' + encodeURIComponent(shareEmailSubject(shareKind, context))
      + '&body=' + encodeURIComponent(
        (isPublicShare ? 'Import (no login):\n\n' : 'Import shared tunebook:\n\n') + link
      )
    : null

  return (
    <>
      <Button
        type="button"
        variant={variant || 'info'}
        className={buttonClassName || undefined}
        size={buttonSize || undefined}
        disabled={busy || isNavigatorOffline()}
        onClick={openOptions}
        title={isNavigatorOffline() ? OFFLINE_LOGIN_MESSAGE : undefined}
        aria-label="Share"
        data-testid="share-tunebook-button"
      >
        {icons.share}
        {!tiny && <span className="music-actions-menu-btn-label"> {buttonLabel}</span>}
      </Button>

      <ShareOwnedMediaProgressModal
        show={!!mediaModalPhase}
        phase={mediaModalPhase || 'working'}
        workSummary={mediaWorkSummary}
        progress={mediaProgress}
        events={mediaEvents}
        dialogZIndex={1320}
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
      >
        <Modal.Header closeButton>
          <Modal.Title>
            {phase === 'ready'
              ? shareModalTitle(shareKind, context)
              : (shareKind === 'book' && bookName
                ? 'Share — ' + bookName
                : shareKind === 'set' && (setName || context.setName)
                  ? 'Share — ' + (setName || context.setName)
                  : shareKind === 'tune' && (tuneName || context.tuneName)
                    ? 'Share — ' + (tuneName || context.tuneName)
                    : 'Share')}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body
          className={phase === 'ready'
            ? 'd-flex flex-column align-items-center text-center share-dialog-modal-body'
            : undefined}
        >
          {phase === 'options' ? (
            <>
              {publicShareWarning ? (
                <Alert variant="warning" className="text-start" data-testid="share-public-warning">
                  {publicShareWarning}
                </Alert>
              ) : null}
              {mediaPlayabilityWarning ? (
                <Alert variant="warning" className="text-start" data-testid="share-media-warning">
                  {mediaPlayabilityWarning}
                </Alert>
              ) : null}
              {canChooseShareVariant ? (
                <Form.Group className="mb-3" data-testid="share-variant">
                  <Form.Label>Link type</Form.Label>
                  <div>
                    <Form.Check
                      type="radio"
                      name="share-variant"
                      id="share-variant-google"
                      data-testid="share-variant-google"
                      label="Google — sign-in, stays synced"
                      checked={shareVariant === 'google'}
                      onChange={function() { setShareVariant('google') }}
                      className="mb-2 text-start"
                    />
                    <Form.Check
                      type="radio"
                      name="share-variant"
                      id="share-variant-public"
                      data-testid="share-variant-public"
                      label="Public — no login, one-time copy"
                      checked={shareVariant === 'public'}
                      onChange={function() { setShareVariant('public') }}
                      className="text-start"
                    />
                  </div>
                </Form.Group>
              ) : null}
              {(needsLoginForGoogle || googleOnlyNeedsLogin) ? (
                <Alert variant="warning" className="text-start" data-testid="share-login-required">
                  Sign in required
                  <div className="mt-2">
                    <Button type="button" variant="info" size="sm" onClick={function() {
                      pendingGoogleShareRef.current = shareVariant === 'google' || !canChooseShareVariant
                      if (login) login()
                    }}>
                      Login
                    </Button>
                  </div>
                </Alert>
              ) : null}
              <div className="d-flex gap-2 justify-content-end">
                <Button type="button" variant="secondary" onClick={handleClose}>Cancel</Button>
                <Button
                  type="button"
                  variant="info"
                  disabled={busy || ((needsLoginForGoogle || googleOnlyNeedsLogin) && shareVariant !== 'public')}
                  onClick={handleConfirmShare}
                  data-testid="share-confirm-button"
                >
                  {icons.share} Share
                </Button>
              </div>
            </>
          ) : null}

          {phase === 'working' ? (
            <p className="mb-0 text-center">Preparing share link…</p>
          ) : null}

          {phase === 'ready' && link ? (
            <>
              <Alert
                variant={isPublicShare ? 'success' : 'info'}
                className="w-100 mb-3 text-start"
                data-testid="share-ready-banner"
              >
                {isPublicShare ? 'Public link — one-time import' : 'Google link — stays synced'}
              </Alert>
              {mediaPlayabilityWarning ? (
                <Alert variant="warning" className="w-100 mb-3 text-start">{mediaPlayabilityWarning}</Alert>
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
