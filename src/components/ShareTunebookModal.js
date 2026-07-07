import { useState } from 'react'
import { Alert, Button, Modal } from 'react-bootstrap'
import { QRCodeSVG } from 'qrcode.react'
import useGoogleDocument from '../useGoogleDocument'
import {
  buildShareImportLink,
  shareModalTitle,
  shareEmailSubject,
} from '../shareTunebookUtils'
import {
  isAnyoneReadable,
  prepareOwnedMediaForShare,
} from '../shareOwnedMediaUtils'
import { listPerformanceSets } from '../performanceSetStore'
import { listSavedPlaylists } from '../savedPlaylistsStore'

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
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [audioSummary, setAudioSummary] = useState('')
  const [audioWarnings, setAudioWarnings] = useState([])
  const docs = useGoogleDocument(token)

  const bookName = currentTuneBook || null
  const context = {
    bookName: bookName,
    setName: setName,
    tuneName: tuneName,
    playlistName: playlistName,
  }

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

  function handleClose() {
    setShow(false)
  }

  function confirmAndShareTunebookDoc(finishShare) {
    if (localStorage.getItem(PUBLIC_CONFIRM_KEY)) {
      finishShare()
      return
    }
    if (window.confirm('The Google document that stores your tune book will be readable by anyone with the link. Is that OK?')) {
      localStorage.setItem(PUBLIC_CONFIRM_KEY, 'true')
      finishShare()
    }
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

  function prepareShare() {
    if (!googleDocumentId || !token || busy) return

    function finishShare() {
      setBusy(true)
      docs.addPermission(googleDocumentId, { type: 'anyone', role: 'reader' }).finally(function() {
        const theLink = buildShareImportLink({
          googleDocumentId: googleDocumentId,
          shareKind: shareKind,
          tuneId: tuneId,
          bookName: bookName,
          setId: setId,
          playlistId: playlistId,
        })
        setLink(theLink)
        setBusy(false)
        setShow(true)
      })
    }

    function runAudioShareThenDocShare() {
      const scope = buildShareScope()
      setBusy(true)
      prepareOwnedMediaForShare(tunes || {}, scope, {
        token: token,
        driveApi: docs,
        googleDocumentId: googleDocumentId,
        saveTune: saveTune,
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
        setBusy(false)
        if (localStorage.getItem(PUBLIC_CONFIRM_KEY)) {
          finishShare()
          return
        }
        setBusy(true)
        docs.listPermissions(googleDocumentId).then(function(permissionsRes) {
          if (isAnyoneReadable(permissionsRes)) {
            localStorage.setItem(PUBLIC_CONFIRM_KEY, 'true')
            finishShare()
            return
          }
          setBusy(false)
          confirmAndShareTunebookDoc(finishShare)
        })
      }).catch(function() {
        setBusy(false)
        confirmAndShareTunebookDoc(finishShare)
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

  const buttonLabel = shareKind === 'tune'
    ? 'Share'
    : shareKind === 'book'
      ? 'Share'
      : shareKind === 'set'
        ? 'Share'
        : shareKind === 'playlist'
          ? 'Share'
          : 'Share All'

  const emailHref = link
    ? 'mailto:?subject=' + encodeURIComponent(shareEmailSubject(shareKind, Object.assign({}, context, { tuneName: tuneName })))
      + '&body=' + encodeURIComponent('Import this shared tunebook:\n\n' + link)
    : null

  if (!token) {
    return (
      <>
        <Button
          variant={variant || 'info'}
          className={buttonClassName || undefined}
          size={buttonSize || undefined}
          onClick={function() { if (login) login() }}
          aria-label="Share"
        >
          {tunebook.icons.share}
          {!tiny && <span className="music-actions-menu-btn-label"> {buttonLabel}</span>}
        </Button>
      </>
    )
  }

  return (
    <>
      <Button
        variant={variant || 'info'}
        className={buttonClassName || undefined}
        size={buttonSize || undefined}
        disabled={busy || !googleDocumentId}
        onClick={prepareShare}
        aria-label="Share"
      >
        {tunebook.icons.share}
        {!tiny && <span className="music-actions-menu-btn-label"> {buttonLabel}</span>}
      </Button>

      <Modal show={show} onHide={handleClose} fullscreen backdrop="static" keyboard={false}>
        <Modal.Header closeButton>
          <Modal.Title>{shareModalTitle(shareKind, context)}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="d-flex flex-column align-items-center justify-content-center text-center share-tunebook-modal-body">
          {link ? (
            <>
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
              <div className="share-tunebook-qr-wrap mb-4">
                <QRCodeSVG value={link} size={Math.min(360, Math.max(220, Math.floor(window.innerWidth * 0.55)))} level="M" includeMargin />
              </div>
              <p className="small text-break px-3">{link}</p>
              <div className="d-flex flex-wrap gap-2 justify-content-center">
                <Button variant="info" onClick={function() { tunebook.utils.copyText(link) }}>Copy Link</Button>
                {emailHref ? (
                  <a href={emailHref} className="btn btn-outline-primary">Share by Email</a>
                ) : null}
              </div>
              <p className="text-muted small mt-4 mb-0">Keep this open so others can scan the QR code.</p>
            </>
          ) : (
            <p>Preparing share link…</p>
          )}
        </Modal.Body>
      </Modal>
    </>
  )
}
