import {useMemo, useRef, useState} from 'react'
import {Alert, Button, ListGroup, Modal} from 'react-bootstrap'
import useMediaResolverHealth from '../useMediaResolverHealth'
import useUtils from '../useUtils'
import { getLinkedMediaSources } from '../mediaTranscriptionSources'
import { transcribeLyricsSource } from '../lyricsTranscriptionClient'

export default function LyricsTranscriptionControls({
  tune,
  tunebook,
  token,
  recordingsManager,
  tuneId,
  onSaveWords,
  buttonStyle,
}) {
  const [showSourceDialog, setShowSourceDialog] = useState(false)
  const [showTranscriptionDialog, setShowTranscriptionDialog] = useState(false)
  const [transcriptionText, setTranscriptionText] = useState('')
  const [transcriptionError, setTranscriptionError] = useState('')
  const [transcriptionStatus, setTranscriptionStatus] = useState('')
  const [isTranscribing, setIsTranscribing] = useState(false)
  const utils = useUtils()
  const abortRef = useRef(null)
  const accessToken = token && token.access_token ? token.access_token : null
  const { available: resolverAvailable } = useMediaResolverHealth({ accessToken })
  const mediaSources = useMemo(function() {
    return getLinkedMediaSources(tune, tunebook, recordingsManager)
  }, [tune, tunebook, recordingsManager && recordingsManager.filtered])

  async function resolveRecordingBlob(source) {
    if (!recordingsManager || typeof recordingsManager.load !== 'function') {
      throw new Error('Recording manager is not available')
    }
    const recording = await recordingsManager.load(source.recordingId)
    if (!recording || !recording.data) {
      throw new Error('Could not load recording audio')
    }
    const blob = utils.dataURItoBlob(recording.data, recording.type || source.mimeType || 'audio/wav')
    return Object.assign({}, source, {
      blob: blob,
      fileName: recording.name || source.fileName || 'recording.wav',
      mimeType: recording.type || source.mimeType || 'audio/wav',
      label: recording.name || source.label || 'Recording',
    })
  }

  async function startTranscription(source) {
    if (!source) return
    abortRef.current = new AbortController()
    setTranscriptionError('')
    setTranscriptionStatus('Preparing audio...')
    setIsTranscribing(true)
    setShowSourceDialog(false)
    try {
      const preparedSource = source.kind === 'recording'
        ? await resolveRecordingBlob(source)
        : source
      if (abortRef.current.signal.aborted) {
        return
      }
      setTranscriptionStatus(preparedSource.kind === 'recording' ? 'Uploading audio...' : 'Resolving audio...')
      const result = await transcribeLyricsSource({
        source: preparedSource,
        accessToken: accessToken,
        signal: abortRef.current.signal,
        onProgress: setTranscriptionStatus,
      })
      setTranscriptionText(result.text)
      setShowTranscriptionDialog(true)
      setTranscriptionStatus('Transcription complete')
    } catch (error) {
      if (error && error.name === 'AbortError') {
        setTranscriptionStatus('Transcription cancelled')
      } else {
        setTranscriptionError(error && error.message ? error.message : 'Transcription failed')
        setTranscriptionStatus('')
      }
    } finally {
      abortRef.current = null
      setIsTranscribing(false)
    }
  }

  function handleTranscribeClick() {
    if (isTranscribing) {
      if (abortRef.current) {
        setTranscriptionStatus('Cancelling...')
        abortRef.current.abort()
      }
      return
    }
    setTranscriptionError('')
    if (mediaSources.length === 0) {
      setTranscriptionError('No linked media is available for transcription')
      return
    }
    if (mediaSources.length === 1) {
      startTranscription(mediaSources[0])
      return
    }
    setShowSourceDialog(true)
  }

  function applyTranscription(mode) {
    const existing = Array.isArray(tune.words) ? tune.words.join('\n') : ''
    const nextText = mode === 'append' && existing.trim()
      ? existing + '\n-------------------------------------\n' + transcriptionText
      : transcriptionText
    tune.words = nextText.split('\n')
    if (onSaveWords) {
      onSaveWords(tune.words)
    }
    setShowTranscriptionDialog(false)
  }

  function getTranscribeButtonLabel() {
    if (isTranscribing) {
      return transcriptionStatus || 'Transcribing...'
    }
    return 'Transcribe'
  }

  if (!resolverAvailable || mediaSources.length === 0) {
    return transcriptionError
      ? <Alert variant="danger" style={{marginTop:'1em', marginBottom:'0.5em'}}>{transcriptionError}</Alert>
      : null
  }

  return (
    <>
      <Button
        variant={isTranscribing ? 'warning' : 'primary'}
        style={buttonStyle || {marginLeft:'0.5em'}}
        onClick={handleTranscribeClick}
      >{getTranscribeButtonLabel()}</Button>
      {transcriptionError && <Alert variant="danger" style={{marginTop:'1em', marginBottom:'0.5em', clear:'both'}}>{transcriptionError}</Alert>}

      <Modal show={showSourceDialog} onHide={function() { if (!isTranscribing) setShowSourceDialog(false) }}>
        <Modal.Header closeButton={!isTranscribing}>
          <Modal.Title>Select media to transcribe</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <ListGroup>
            {mediaSources.map(function(source) {
              return <ListGroup.Item key={source.id}>
                <div style={{display:'flex', justifyContent:'space-between', gap:'1em', alignItems:'center'}}>
                  <div>
                    <div style={{fontWeight:'bold'}}>{source.label}</div>
                    <div style={{fontSize:'0.9em', wordBreak:'break-word'}}>{source.detail}</div>
                  </div>
                  <Button disabled={isTranscribing} onClick={function() { startTranscription(source) }}>Use this</Button>
                </div>
              </ListGroup.Item>
            })}
          </ListGroup>
        </Modal.Body>
      </Modal>

      <Modal
        show={showTranscriptionDialog}
        onHide={function() { setShowTranscriptionDialog(false) }}
        fullscreen={true}
        scrollable={true}
      >
        <Modal.Header closeButton>
          <Modal.Title>Transcribed lyrics</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <pre style={{whiteSpace:'pre-wrap', wordBreak:'break-word'}}>{transcriptionText}</pre>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={function() { setShowTranscriptionDialog(false) }}>Close</Button>
          <Button variant="warning" onClick={function() { applyTranscription('append') }}>Append</Button>
          <Button variant="success" onClick={function() { applyTranscription('replace') }}>Replace</Button>
        </Modal.Footer>
      </Modal>
    </>
  )
}
