import React, { useState, useEffect, useRef } from 'react'
import { Modal, Button, Alert, Spinner } from 'react-bootstrap'
import AudioAnalysisHistory from './AudioAnalysisHistory'
import AudioAnalysisWizard from './AudioAnalysisWizard'
import AudioAnalysisCompare from './AudioAnalysisCompare'
import { AudioAnalysisHelpBody } from '../audioAnalysisHelpContent'
import useGoogleDocument from '../useGoogleDocument'
import { syncAudioAnalysisWithDrive } from '../audioAnalysisCloudSync'

export default function AudioAnalysisModal(props) {
  const [view, setView] = useState('history')
  const [refreshKey, setRefreshKey] = useState(0)
  const [showHelp, setShowHelp] = useState(false)
  const [syncStatus, setSyncStatus] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const didAutoSync = useRef(false)

  const driveApi = useGoogleDocument(props.token, props.logout || function() {})

  function bump() {
    setRefreshKey(function(k) { return k + 1 })
  }

  function handleHide() {
    setView('history')
    setShowHelp(false)
    setSyncStatus(null)
    didAutoSync.current = false
    if (props.onHide) props.onHide()
  }

  async function runSync(isAuto) {
    if (!props.token || !props.token.access_token) {
      setSyncStatus({ variant: 'warning', text: 'Sign in to sync Audio Analysis with Google Drive.' })
      if (!isAuto && props.login) props.login()
      return
    }
    setSyncing(true)
    setSyncStatus({ variant: 'info', text: isAuto ? 'Syncing with Google Drive…' : 'Syncing…' })
    try {
      const result = await syncAudioAnalysisWithDrive(driveApi)
      if (!result.ok) {
        setSyncStatus({ variant: 'danger', text: result.error || 'Sync failed' })
      } else {
        setSyncStatus({
          variant: 'success',
          text: 'Synced ' + result.sets + ' set(s), ' + result.groups + ' group(s)' +
            (result.uploaded ? '; uploaded ' + result.uploaded + ' note(s)' : '') +
            (result.downloaded ? '; downloaded ' + result.downloaded + ' note(s)' : '') +
            (result.deleted ? '; removed ' + result.deleted + ' remote blob(s)' : '') +
            (result.deletedSets ? '; ' + result.deletedSets + ' delete(s) tracked' : '') + '.'
        })
        bump()
      }
    } catch (err) {
      setSyncStatus({ variant: 'danger', text: (err && err.message) || String(err) })
    } finally {
      setSyncing(false)
    }
  }

  useEffect(function() {
    if (!props.show) {
      didAutoSync.current = false
      return
    }
    if (didAutoSync.current) return
    if (!props.token || !props.token.access_token) return
    didAutoSync.current = true
    runSync(true)
  }, [props.show, props.token])

  return (
    <>
      <Modal
        show={!!props.show}
        onHide={handleHide}
        fullscreen
        scrollable
        className="audio-analysis-modal"
      >
        <Modal.Header closeButton>
          <Modal.Title>Audio Analysis</Modal.Title>
          <Button
            size="sm"
            variant="outline-secondary"
            className="ms-3"
            disabled={syncing}
            onClick={function() { runSync(false) }}
          >
            {syncing ? (
              <span><Spinner animation="border" size="sm" className="me-1" /> Syncing</span>
            ) : 'Sync Drive'}
          </Button>
          <Button
            size="sm"
            variant="outline-secondary"
            className="ms-2"
            onClick={function() { setShowHelp(true) }}
          >
            Help
          </Button>
        </Modal.Header>
        <Modal.Body>
          {syncStatus ? (
            <Alert
              variant={syncStatus.variant}
              className="py-2"
              dismissible
              onClose={function() { setSyncStatus(null) }}
            >
              {syncStatus.text}
            </Alert>
          ) : null}
          {view === 'history' ? (
            <AudioAnalysisHistory
              refreshKey={refreshKey}
              onChanged={bump}
              onNewSet={function() { setView('wizard') }}
              onCompare={function() { setView('compare') }}
            />
          ) : null}
          {view === 'wizard' ? (
            <AudioAnalysisWizard
              instrument={props.instrument}
              tuningPresetId={props.tuningPresetId}
              onCancel={function() { setView('history'); bump() }}
              onComplete={function() {
                setView('history')
                bump()
                if (props.token && props.token.access_token) runSync(true)
              }}
            />
          ) : null}
          {view === 'compare' ? (
            <AudioAnalysisCompare
              refreshKey={refreshKey}
              onBack={function() { setView('history') }}
              driveApi={driveApi}
              token={props.token}
              login={props.login}
              copyText={props.tunebook && props.tunebook.utils && props.tunebook.utils.copyText}
            />
          ) : null}
        </Modal.Body>
      </Modal>

      <Modal show={showHelp} onHide={function() { setShowHelp(false) }} size="lg" scrollable>
        <Modal.Header closeButton>
          <Modal.Title>Audio Analysis help</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <AudioAnalysisHelpBody />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={function() { setShowHelp(false) }}>Close</Button>
        </Modal.Footer>
      </Modal>
    </>
  )
}
