import React, { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Col, Container, Row, Spinner } from 'react-bootstrap'
import { useParams, useSearchParams } from 'react-router-dom'
import useGoogleDocument from '../useGoogleDocument'
import AudioAnalysisCompare from '../components/AudioAnalysisCompare'
import { useDocumentTitle } from '../pageTitle'
import { TUNER_INSTRUMENT_LABELS } from '../instrumentTuningPresets'

async function loadManifestBlob(driveApi, manifestFileId) {
  if (!manifestFileId) return null
  let blob = await driveApi.getPublicDocumentBlob(manifestFileId)
  if (blob && !blob.error) return blob
  if (typeof driveApi.getDocumentBlob === 'function') {
    blob = await driveApi.getDocumentBlob(manifestFileId)
    if (blob && !blob.error) return blob
  }
  return null
}

export default function AudioAnalysisSharedReportPage(props) {
  const params = useParams()
  const [searchParams] = useSearchParams()
  const manifestFileId = params.manifestFileId ? decodeURIComponent(params.manifestFileId) : ''
  const driveApi = useGoogleDocument(props.token, props.logout || function() {})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [manifest, setManifest] = useState(null)
  const [needsLogin, setNeedsLogin] = useState(false)

  useDocumentTitle('Shared Audio Analysis report')

  useEffect(function() {
    if (!manifestFileId) {
      setError('Missing shared report id')
      setLoading(false)
      return
    }

    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      setNeedsLogin(false)
      try {
        const blob = await loadManifestBlob(driveApi, manifestFileId)
        if (cancelled) return
        if (!blob) {
          if (!props.token || !props.token.access_token) {
            setNeedsLogin(true)
            setError('Sign in with Google to open this shared Audio Analysis report.')
          } else {
            setError('Could not load shared report.')
          }
          setLoading(false)
          return
        }
        const text = await blob.text()
        const data = JSON.parse(text)
        if (!data || !data.baseline || !data.candidate) {
          setError('Shared report is missing comparison data.')
        } else {
          setManifest(data)
        }
      } catch (err) {
        if (!cancelled) setError((err && err.message) || String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return function() { cancelled = true }
  }, [manifestFileId, props.token, driveApi])

  const autoPlay = useMemo(function() {
    return {
      side: searchParams.get('side'),
      note: searchParams.get('note')
    }
  }, [searchParams])

  const baseline = manifest && manifest.baseline
  const candidate = manifest && manifest.candidate

  const createdLabel = useMemo(function() {
    if (!manifest || !manifest.createdAt) return null
    try {
      return new Date(manifest.createdAt).toLocaleString()
    } catch (e) {
      return manifest.createdAt
    }
  }, [manifest])

  if (loading) {
    return (
      <Container className="py-4 text-center">
        <Spinner animation="border" className="me-2" />
        Loading shared Audio Analysis report…
      </Container>
    )
  }

  if (error && !manifest) {
    return (
      <Container className="py-4">
        <Alert variant={needsLogin ? 'warning' : 'danger'}>{error}</Alert>
        {needsLogin && props.login ? (
          <Button variant="primary" onClick={props.login}>Sign in with Google</Button>
        ) : null}
      </Container>
    )
  }

  return (
    <Container fluid className="py-3">
      <div className="mb-3">
        <h1 className="h3 mb-1">Shared Audio Analysis Report</h1>
        <p className="text-muted mb-0">
          Standalone comparison report for baseline <strong>A</strong> and candidate <strong>B</strong>.
          Play buttons fetch note audio from Google Drive; sign in with Google if playback is blocked.
        </p>
      </div>

      <Row className="g-3 mb-3">
        <Col md={6}>
          <Card body>
            <div className="small text-muted">Baseline (A)</div>
            <div className="fw-semibold">{baseline && baseline.label ? baseline.label : 'Baseline'}</div>
            <div className="small text-muted">
              {baseline ? (TUNER_INSTRUMENT_LABELS[baseline.instrument] || baseline.instrument || 'Unknown instrument') : '—'}
              {baseline && baseline.tuningPresetId ? ' · ' + baseline.tuningPresetId : ''}
              {baseline && baseline.measurementMode === 'tap' ? ' · tap' : ' · bowed'}
            </div>
          </Card>
        </Col>
        <Col md={6}>
          <Card body>
            <div className="small text-muted">Candidate (B)</div>
            <div className="fw-semibold">{candidate && candidate.label ? candidate.label : 'Candidate'}</div>
            <div className="small text-muted">
              {candidate ? (TUNER_INSTRUMENT_LABELS[candidate.instrument] || candidate.instrument || 'Unknown instrument') : '—'}
              {candidate && candidate.tuningPresetId ? ' · ' + candidate.tuningPresetId : ''}
              {candidate && candidate.measurementMode === 'tap' ? ' · tap' : ' · bowed'}
            </div>
          </Card>
        </Col>
      </Row>

      <Alert variant="info" className="small">
        All deltas in this report are <strong>B - A</strong>. Positive values mean candidate B is higher or has more of that quality.
        Start with <strong>Overview</strong>, then use <strong>Timbre</strong> for tone colour, <strong>Playability</strong> for response under the bow,
        and <strong>QC</strong> to check whether setup or playing differences may have influenced the result.
        {createdLabel ? ' Report created: ' + createdLabel + '.' : ''}
      </Alert>

      <AudioAnalysisCompare
        sharedBaseline={baseline}
        sharedCandidate={candidate}
        sharedMode={true}
        driveApi={driveApi}
        token={props.token}
        login={props.login}
        autoPlayRequest={autoPlay}
      />
    </Container>
  )
}
