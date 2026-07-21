import React, { useEffect, useState } from 'react'
import { Alert, Button, Modal, Spinner } from 'react-bootstrap'
import { QRCodeSVG } from 'qrcode.react'
import { prepareAudioAnalysisCompareShare } from '../audioAnalysisShare'
import { shareEmailBody, shareEmailSubject } from '../audioAnalysisShareUtils'

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
    try {
      const result = await prepareAudioAnalysisCompareShare(driveApi, {
        baselineId: baseline.id,
        candidateId: candidate.id
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

  return (
    <>
      <Button
        variant="outline-primary"
        disabled={busy || !baseline || !candidate}
        onClick={handleClick}
      >
        {busy ? <span><Spinner animation="border" size="sm" className="me-1" /> Uploading…</span> : 'Share'}
      </Button>

      {error ? <Alert variant="danger" className="py-2 mt-2 mb-0">{error}</Alert> : null}

      <Modal show={show} onHide={function() { setShow(false) }} size="lg" centered scrollable>
        <Modal.Header closeButton>
          <Modal.Title>Share Audio Analysis comparison</Modal.Title>
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
                Recipients can open the interactive report and use Play buttons for each note.
                If audio is not public yet, they will be prompted to sign in with Google.
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
