import { useEffect, useRef, useState } from 'react'
import { Button, Modal } from 'react-bootstrap'
import {
  runPlayalongLatencyCalibration,
} from '../playalongClapCalibration'
import { clampCalibratedOutputLatencySeconds } from '../playalongSettings'

export default function PlayalongClapCalibrationModal(props) {
  const show = !!props.show
  const [phase, setPhase] = useState('idle') // idle | running | done | error
  const [progress, setProgress] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const abortRef = useRef(null)

  useEffect(function() {
    if (!show) {
      setPhase('idle')
      setProgress(null)
      setResult(null)
      setError(null)
      if (abortRef.current) abortRef.current.abort()
      abortRef.current = null
    }
  }, [show])

  useEffect(function() {
    return function() {
      if (abortRef.current) abortRef.current.abort()
    }
  }, [])

  function startCalibration() {
    if (phase === 'running') return
    setPhase('running')
    setError(null)
    setResult(null)
    setProgress({ index: 0, total: 5 })
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
    abortRef.current = controller
    runPlayalongLatencyCalibration({
      signal: controller && controller.signal,
      onProgress: function(p) { setProgress(p) },
    }).then(function(next) {
      if (controller && controller.signal.aborted) return
      if (next.latencySeconds == null) {
        setPhase('error')
        setError(next.error || 'Calibration failed')
        setResult(next)
        return
      }
      setResult(next)
      setPhase('done')
    }).catch(function(err) {
      if (controller && controller.signal.aborted) return
      setPhase('error')
      setError(err && err.message ? err.message : 'Calibration failed')
    })
  }

  function saveResult() {
    if (!result || result.latencySeconds == null) return
    const seconds = clampCalibratedOutputLatencySeconds(result.latencySeconds)
    if (props.onSave) props.onSave(seconds)
    if (props.onHide) props.onHide()
  }

  function clearCalibration() {
    if (props.onSave) props.onSave(0)
    if (props.onHide) props.onHide()
  }

  const currentMs = props.currentLatencySeconds > 0
    ? Math.round(props.currentLatencySeconds * 1000)
    : null
  const measuredMs = result && result.latencySeconds != null
    ? Math.round(result.latencySeconds * 1000)
    : null

  return (
    <Modal show={show} onHide={props.onHide} centered size="md">
      <Modal.Header closeButton>
        <Modal.Title>Calibrate audio latency</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="mb-2">
          We play short clicks. Keep the <strong>microphone near the speaker</strong> so it
          hears them (best). Only clap if you use headphones — clapping late will
          over-measure latency and make pitch onsets look early on the graph.
        </p>
        <p className="text-muted small mb-3">
          The measured delay aligns play-along pitch with the notes you hear. Prefer
          speaker loopback over clapping when you can.
        </p>
        {currentMs != null ? (
          <p className="small mb-2" data-testid="playalong-calibration-current">
            Current calibration: <strong>{currentMs} ms</strong>
          </p>
        ) : (
          <p className="small text-muted mb-2">No calibration saved yet.</p>
        )}
        {phase === 'running' && progress ? (
          <p data-testid="playalong-calibration-progress">
            Click {progress.index} of {progress.total}
            {Number.isFinite(progress.delayMs)
              ? ' · heard at ' + Math.round(progress.delayMs) + ' ms'
              : ' · listening…'}
          </p>
        ) : null}
        {phase === 'done' && measuredMs != null ? (
          <p data-testid="playalong-calibration-result">
            Measured latency: <strong>{measuredMs} ms</strong>
            {result.samplesMs && result.samplesMs.length
              ? ' (' + result.samplesMs.length + ' samples)'
              : ''}
          </p>
        ) : null}
        {phase === 'error' && error ? (
          <p className="text-danger small" data-testid="playalong-calibration-error">{error}</p>
        ) : null}
      </Modal.Body>
      <Modal.Footer>
        {currentMs != null ? (
          <Button
            type="button"
            variant="outline-secondary"
            className="me-auto"
            data-testid="playalong-calibration-clear"
            disabled={phase === 'running'}
            onClick={clearCalibration}
          >
            Clear
          </Button>
        ) : null}
        <Button type="button" variant="secondary" onClick={props.onHide} disabled={phase === 'running'}>
          Cancel
        </Button>
        {phase === 'done' ? (
          <Button
            type="button"
            variant="primary"
            data-testid="playalong-calibration-save"
            onClick={saveResult}
          >
            Save {measuredMs} ms
          </Button>
        ) : (
          <Button
            type="button"
            variant="primary"
            data-testid="playalong-calibration-start"
            disabled={phase === 'running'}
            onClick={startCalibration}
          >
            {phase === 'running' ? 'Listening…' : 'Start calibration'}
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  )
}
