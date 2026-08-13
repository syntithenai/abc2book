import React, { useEffect, useState } from 'react'
import { Alert, Button, Modal, ProgressBar, Spinner } from 'react-bootstrap'
import { QRCodeSVG } from 'qrcode.react'
import { prepareAudioAnalysisGroupShare } from '../audioAnalysisShare'
import {
  audioAnalysisProgressPercent,
  shareGroupEmailBody,
  shareGroupEmailSubject
} from '../audioAnalysisShareUtils'
import { icons } from '../Icons'

const SHARE_UPLOAD_NOTICE =
  'Sharing uploads every recording set in this group and its note audio to Google Drive so recipients can import the whole group. This can take a moment. Continue?'

export default function ShareAudioAnalysisGroupModal(props) {
  const groupId = props.groupId
  const groupLabel = props.groupLabel
  const sets = props.sets || []
  const driveApi = props.driveApi
  const copyText = props.copyText
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState('')
  const [error, setError] = useState(null)
  const [summary, setSummary] = useState('')
  const [progress, setProgress] = useState(null)
  const [pendingOpen, setPendingOpen] = useState(false)

  useEffect(function() {
    if (props.token && pendingOpen) {
      setPendingOpen(false)
      confirmAndShare()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.token, pendingOpen])

  async function runShare() {
    if (!driveApi || busy || !sets.length) return
    setBusy(true)
    setError(null)
    setSummary('')
    setProgress({ phase: 'start', message: 'Starting share…' })
    try {
      const result = await prepareAudioAnalysisGroupShare(driveApi, {
        groupId: groupId,
        groupLabel: groupLabel,
        onProgress: function(info) { setProgress(info || null) }
      })
      if (!result.ok) {
        if (!result.cancelled) setError(result.error || 'Share failed')
        return
      }
      setLink(result.link || '')
      const parts = []
      if (result.permissions && result.permissions.shared) {
        parts.push(result.permissions.shared + ' audio file(s) shared')
      }
      parts.push((result.setCount || sets.length) + ' set(s) in group page')
      setSummary(parts.join(' · '))
      setShow(true)
    } catch (err) {
      setError((err && err.message) || String(err))
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  function confirmAndShare() {
    const ok = window.confirm(SHARE_UPLOAD_NOTICE)
    if (!ok) return
    runShare()
  }

  function handleClick() {
    if (!props.token || !props.token.access_token) {
      setPendingOpen(true)
      if (props.login) props.login()
      return
    }
    confirmAndShare()
  }

  const emailHref = link
    ? 'mailto:?subject=' + encodeURIComponent(shareGroupEmailSubject(groupLabel, sets.length))
      + '&body=' + encodeURIComponent(shareGroupEmailBody(link, groupLabel))
    : null
  const pct = audioAnalysisProgressPercent(progress)

  return (
    <>
      <Button
        size={props.size || 'sm'}
        variant={props.variant || 'outline-primary'}
        disabled={busy || !sets.length}
        onClick={handleClick}
        title="Share all sets in this group"
      >
        {busy ? (
          <span><Spinner animation="border" size="sm" className="me-1" /> Sharing…</span>
        ) : (
          <span>
            {icons.share}{' '}
            {(props.token && props.token.access_token) ? 'Share' : 'Login To Share'}
          </span>
        )}
      </Button>

      {error ? <Alert variant="danger" className="py-2 mt-2 mb-0">{error}</Alert> : null}

      <Modal show={busy} backdrop="static" keyboard={false} centered>
        <Modal.Header>
          <Modal.Title>Sharing group…</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="d-flex align-items-center gap-2 mb-2">
            <Spinner animation="border" size="sm" />
            <span>{(progress && progress.message) || 'Working…'}</span>
          </div>
          {pct != null ? (
            <ProgressBar now={pct} label={pct + '%'} />
          ) : (
            <ProgressBar animated now={100} />
          )}
          <p className="small text-muted mb-0 mt-2">
            Syncing and uploading note audio to Google Drive can take a while for large groups.
          </p>
        </Modal.Body>
      </Modal>

      <Modal show={show} onHide={function() { setShow(false) }} size="lg" centered scrollable>
        <Modal.Header closeButton>
          <Modal.Title>Share Audio Analysis group</Modal.Title>
        </Modal.Header>
        <Modal.Body className="text-center">
          {summary ? <Alert variant="info">{summary}</Alert> : null}
          {link ? (
            <>
              <div className="mb-3 d-flex justify-content-center">
                <QRCodeSVG value={link} size={220} level="M" includeMargin />
              </div>
              <p className="small text-break">{link}</p>
              <p className="small text-muted">
                Recipients import all sets into a group named{' '}
                <strong>{groupLabel || 'Ungrouped'}</strong>.
                If audio is not public yet, they may be prompted to sign in with Google.
              </p>
              <div className="d-flex flex-wrap gap-2 justify-content-center">
                {copyText ? (
                  <Button variant="info" onClick={function() { copyText(link) }}>Copy Link</Button>
                ) : null}
                {emailHref ? (
                  <a href={emailHref} className="btn btn-outline-primary">Share by Email</a>
                ) : null}
              </div>
            </>
          ) : (
            <p>Preparing share link…</p>
          )}
        </Modal.Body>
      </Modal>
    </>
  )
}
