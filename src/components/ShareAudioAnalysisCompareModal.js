import React, { useEffect, useState } from 'react'
import { Alert, Button, Modal, ProgressBar, Spinner } from 'react-bootstrap'
import { prepareAudioAnalysisCompareShare } from '../audioAnalysisShare'
import {
  audioAnalysisProgressPercent,
  shareEmailBody,
  shareEmailSubject
} from '../audioAnalysisShareUtils'
import { icons } from '../Icons'
import ShareQrCode from './ShareQrCode'

const SHARE_UPLOAD_NOTICE =
  'Sharing uploads this comparison report and its note audio to Google Drive so recipients can open the interactive report. This can take a moment. Continue?'

export default function ShareAudioAnalysisCompareModal(props) {
  const baseline = props.baseline
  const candidate = props.candidate
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
    if (!baseline || !candidate || !driveApi || busy) return
    setBusy(true)
    setError(null)
    setSummary('')
    setProgress({ phase: 'start', message: 'Starting share…' })
    try {
      const result = await prepareAudioAnalysisCompareShare(driveApi, {
        baselineId: baseline.id,
        candidateId: candidate.id,
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
      if (result.pdfFilename) parts.push('PDF uploaded to Drive')
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
    ? 'mailto:?subject=' + encodeURIComponent(shareEmailSubject(baseline, candidate))
      + '&body=' + encodeURIComponent(shareEmailBody(link))
    : null
  const pct = audioAnalysisProgressPercent(progress)

  return (
    <>
      <Button
        variant="outline-primary"
        disabled={busy || !baseline || !candidate}
        onClick={handleClick}
      >
        {busy ? (
          <span><Spinner animation="border" size="sm" className="me-1" /> Uploading…</span>
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
          <Modal.Title>Sharing comparison…</Modal.Title>
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
            Syncing note audio and uploading the report to Google Drive can take a while.
          </p>
        </Modal.Body>
      </Modal>

      <Modal show={show} onHide={function() { setShow(false) }} size="lg" centered scrollable>
        <Modal.Header closeButton>
          <Modal.Title>Share Audio Analysis comparison</Modal.Title>
        </Modal.Header>
        <Modal.Body className="text-center">
          {summary ? <Alert variant="info">{summary}</Alert> : null}
          {link ? (
            <>
              <div className="mb-3 d-flex justify-content-center">
                <ShareQrCode value={link} size={220} />
              </div>
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
