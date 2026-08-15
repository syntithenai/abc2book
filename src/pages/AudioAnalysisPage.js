import React, { useState, useEffect, useRef } from 'react'
import { Container, Modal, Button } from 'react-bootstrap'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import AudioAnalysisHistory from '../components/AudioAnalysisHistory'
import AudioAnalysisWizard from '../components/AudioAnalysisWizard'
import AudioAnalysisCompare from '../components/AudioAnalysisCompare'
import { AudioAnalysisHelpBody, printAudioAnalysisHelp } from '../audioAnalysisHelpContent'
import useGoogleDocument from '../useGoogleDocument'
import { syncAudioAnalysisWithDrive } from '../audioAnalysisCloudSync'
import { icons } from '../Icons'
import { useDocumentTitle } from '../pageTitle'
import { isValidTunerInstrument } from '../tuningPresetResolver'
import { OFFLINE_MESSAGE, isNavigatorOffline } from '../offlineNetwork'

export default function AudioAnalysisPage(props) {
  useDocumentTitle('Audio Analysis')
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [view, setView] = useState('history')
  const [refreshKey, setRefreshKey] = useState(0)
  const [showHelp, setShowHelp] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [compareGroupFilter, setCompareGroupFilter] = useState(null)
  const didAutoSync = useRef(false)
  const helpBodyRef = useRef(null)

  const driveApi = useGoogleDocument(props.token, props.logout || function() {})

  const urlInstrument = searchParams.get('instrument')
  const instrument = urlInstrument && isValidTunerInstrument(urlInstrument) ? urlInstrument : null
  const tuningPresetId = searchParams.get('tuning') || null
  const initialGroupNameFilter = searchParams.get('group') || ''

  function bump() {
    setRefreshKey(function(k) { return k + 1 })
  }

  function openCompare(groupFilter) {
    setCompareGroupFilter(groupFilter || null)
    setView('compare')
  }

  function setGroupNameFilter(name) {
    const next = new URLSearchParams(searchParams)
    const trimmed = String(name || '').trim()
    if (trimmed) next.set('group', trimmed)
    else next.delete('group')
    const q = next.toString()
    navigate('/audioanalysis' + (q ? '?' + q : ''), { replace: true })
  }

  async function runSync(isAuto) {
    if (isNavigatorOffline()) {
      if (!isAuto) toast.info(OFFLINE_MESSAGE)
      return
    }
    if (!props.token || !props.token.access_token) {
      if (isAuto) return
      toast.warning('Sign in to sync Audio Analysis with Google Drive.', { autoClose: 4000 })
      if (props.login) props.login()
      return
    }
    setSyncing(true)
    try {
      const result = await syncAudioAnalysisWithDrive(driveApi)
      if (!result.ok) {
        toast.error(result.error || 'Sync failed', { autoClose: 6000 })
      } else {
        toast.success(
          'Synced ' + result.sets + ' set(s), ' + result.groups + ' group(s)' +
            (result.uploaded ? '; uploaded ' + result.uploaded + ' note(s)' : '') +
            (result.downloaded ? '; downloaded ' + result.downloaded + ' note(s)' : '') +
            (result.deleted ? '; removed ' + result.deleted + ' remote blob(s)' : '') +
            (result.deletedSets ? '; ' + result.deletedSets + ' delete(s) tracked' : '') + '.',
          { autoClose: 3500 }
        )
        bump()
      }
    } catch (err) {
      toast.error((err && err.message) || String(err), { autoClose: 6000 })
    } finally {
      setSyncing(false)
    }
  }

  useEffect(function() {
    if (didAutoSync.current) return
    if (!props.token || !props.token.access_token) return
    didAutoSync.current = true
    runSync(true)
  }, [props.token])

  function backToList() {
    setCompareGroupFilter(null)
    setView('history')
    bump()
  }

  return (
    <Container fluid className="App-chords py-3 px-3 audio-analysis-page">
      <div className="d-flex flex-wrap align-items-center mb-3">
        <h1 className="mb-0">Audio Analysis</h1>
        {view !== 'history' ? (
          <Button
            variant="secondary"
            style={{ marginLeft: '2.5rem' }}
            onClick={backToList}
          >
            Back To List
          </Button>
        ) : null}
      </div>

      {view === 'history' ? (
        <AudioAnalysisHistory
          refreshKey={refreshKey}
          onChanged={bump}
          onNewSet={function() { setView('wizard') }}
          onCompare={openCompare}
          onSync={function() { runSync(false) }}
          onHelp={function() { setShowHelp(true) }}
          syncing={syncing}
          initialGroupNameFilter={initialGroupNameFilter}
          onGroupNameFilterChange={setGroupNameFilter}
          token={props.token}
          login={props.login}
          driveApi={driveApi}
          copyText={props.tunebook && props.tunebook.utils && props.tunebook.utils.copyText}
          setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
        />
      ) : null}
      {view === 'wizard' ? (
        <AudioAnalysisWizard
          instrument={instrument}
          tuningPresetId={tuningPresetId}
          onCancel={backToList}
          onComplete={function() {
            setView('history')
            bump()
            if (props.token && props.token.access_token) runSync(true)
          }}
          token={props.token}
          setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
        />
      ) : null}
      {view === 'compare' ? (
        <AudioAnalysisCompare
          refreshKey={refreshKey}
          initialGroupFilter={compareGroupFilter}
          driveApi={driveApi}
          token={props.token}
          login={props.login}
          copyText={props.tunebook && props.tunebook.utils && props.tunebook.utils.copyText}
        />
      ) : null}

      <Modal show={showHelp} onHide={function() { setShowHelp(false) }} size="lg" scrollable>
        <Modal.Header closeButton>
          <Modal.Title>Audio Analysis help</Modal.Title>
          <Button
            size="sm"
            variant="outline-primary"
            className="ms-3"
            onClick={function() { printAudioAnalysisHelp(helpBodyRef.current) }}
          >
            {icons.printer}{' '}Print
          </Button>
        </Modal.Header>
        <Modal.Body>
          <AudioAnalysisHelpBody ref={helpBodyRef} />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={function() { setShowHelp(false) }}>Close</Button>
        </Modal.Footer>
      </Modal>
    </Container>
  )
}
