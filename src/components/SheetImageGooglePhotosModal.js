import { useEffect, useState } from 'react'
import { Alert, Button, Modal } from 'react-bootstrap'
import {
  GOOGLE_PHOTOS_PICKER_SCOPE,
  pickGooglePhotosAndDownload,
  tokenHasPhotosScope,
  tokenResponseIncludesPhotosScope,
} from '../googlePhotosPickerClient'
import { clearFilePickerIntent } from '../filePickerIntent'

export default function SheetImageGooglePhotosModal(props) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [pickerUrl, setPickerUrl] = useState('')

  function resetState() {
    setError('')
    setBusy(false)
    setStatus('')
    setPickerUrl('')
  }

  function handleHide() {
    clearFilePickerIntent()
    resetState()
    if (props.onHide) props.onHide()
  }

  function openPickerWindow(url) {
    setPickerUrl(url)
    const popup = window.open(url, 'google-photos-picker', 'width=980,height=760,resizable=yes,scrollbars=yes')
    if (!popup) {
      setStatus('Popup blocked. Use the Open Google Photos button below.')
    }
  }

  async function ensurePhotosScope() {
    if (!props.requestGoogleScopes) {
      throw new Error('Google Photos is not available in this view')
    }
    let tokenResponse = await props.requestGoogleScopes([GOOGLE_PHOTOS_PICKER_SCOPE])
    if (!tokenResponseIncludesPhotosScope(tokenResponse) && !(await tokenHasPhotosScope(tokenResponse))) {
      tokenResponse = await props.requestGoogleScopes([GOOGLE_PHOTOS_PICKER_SCOPE], { forceConsent: true })
    }
    if (!tokenResponseIncludesPhotosScope(tokenResponse) && !(await tokenHasPhotosScope(tokenResponse))) {
      throw new Error(
        'Google Photos access was not granted. On the consent screen, approve photo access, then try again. '
        + 'The developer must also add the Google Photos Picker scope in Google Cloud Console → OAuth consent screen → Data access.'
      )
    }
    return tokenResponse
  }

  async function startPicker() {
    if (!props.token) {
      setError('Sign in with Google to pick photos from Google Photos.')
      return
    }
    setBusy(true)
    setError('')
    setStatus('Requesting Google Photos access...')
    try {
      const photosToken = await ensurePhotosScope()
      const result = await pickGooglePhotosAndDownload(photosToken, {
        maxItemCount: 1,
        onProgress: setStatus,
        openPicker: openPickerWindow,
      })
      const file = result.files && result.files[0]
      if (!file) {
        throw new Error('No photo was selected')
      }
      clearFilePickerIntent()
      if (props.onSelectFile) props.onSelectFile(file)
      handleHide()
    } catch (e) {
      const message = e && e.message ? e.message : 'Google Photos picker failed'
      if (/access_denied|cancel/i.test(message)) {
        setError('Google Photos access was not granted. Use Advanced → Go to tunebook (unsafe) on the Google warning screen, or add your account as a test user in Google Cloud Console.')
      } else {
        setError(message)
      }
      setStatus('')
    } finally {
      setBusy(false)
    }
  }

  useEffect(function() {
    if (!props.show || !props.autoStart) return
    startPicker()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.show, props.autoStart])

  return (
    <Modal show={props.show} onHide={function() {}} backdrop="static" keyboard={false} centered>
      <Modal.Header>
        <Modal.Title>Pick from Google Photos</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="mb-2">
          Choose a photo from your Google Photos library, including pictures synced from your phone at photos.google.com.
        </p>
        <Alert variant="info" className="small mb-3">
          <strong>If Google shows &quot;Google hasn&apos;t verified this app&quot;</strong>
          <ol className="mb-0 ps-3 mt-2">
            <li>Click <strong>Advanced</strong></li>
            <li>Click <strong>Go to tunebook (unsafe)</strong> or <strong>Continue</strong></li>
          </ol>
          <div className="mt-2 text-muted">
            That warning appears because photo access is a sensitive permission. For private use, add your Google account under
            {' '}<strong>Google Cloud Console → OAuth consent screen → Test users</strong>.
            Public use on tunebook.net requires submitting the app for Google verification.
          </div>
        </Alert>
        {status ? <div className="small text-muted mb-2">{status}</div> : null}
        {pickerUrl ? (
          <div className="mb-2">
            <Button
              variant="outline-primary"
              href={pickerUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open Google Photos
            </Button>
          </div>
        ) : null}
        {error ? (
          <Alert variant="danger" className="mb-0">
            {error}
            {!props.token && props.onLogin ? (
              <div className="mt-2">
                <Button variant="primary" size="sm" onClick={props.onLogin}>
                  Sign in with Google
                </Button>
              </div>
            ) : null}
            {props.token && /insufficient|permission|scope|consent screen/i.test(error) ? (
              <div className="small mt-2 text-muted">
                In Google Cloud Console, open OAuth consent screen → Data access → Add scope → Google Photos Picker API →
                {' '}&quot;See the photos and videos you select&quot;. Enable the Google Photos Picker API under APIs &amp; Services → Library.
              </div>
            ) : null}
          </Alert>
        ) : null}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={handleHide} disabled={busy}>
          Cancel
        </Button>
        <Button variant="primary" onClick={startPicker} disabled={busy || !props.token}>
          {busy ? 'Waiting for photo...' : 'Choose photo'}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
