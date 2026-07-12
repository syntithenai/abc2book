import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, ListGroup } from 'react-bootstrap'
import {
  getBackgroundReviewRevision,
  getBackgroundReviewSummary,
  markMediaAnalysisReviewed,
  subscribeBackgroundReviewQueue,
} from '../backgroundReviewQueue'
import {
  hasActiveImportReviewSession,
  hideImportReviewUi,
  showImportReviewUi,
  subscribeImportReviewSession,
  getImportReviewSessionRevision,
} from '../importReviewSessionStore'
import { snoozeBackgroundReviewToast } from '../backgroundReviewToast'
import {
  subscribe as subscribeFieldLookupQueue,
  getState as getFieldLookupState,
} from '../tuneFieldLookupQueue'

function getFieldLookupRevision() {
  const state = getFieldLookupState()
  return (state.jobs || []).map(function(job) {
    return job.id + ':' + job.status + ':' + (job.reviewCandidateId || '') + ':'
      + (Array.isArray(job.candidates) ? job.candidates.length : 0)
  }).join('|')
}

function useReviewSummary() {
  const reviewRevision = useSyncExternalStore(
    subscribeBackgroundReviewQueue,
    getBackgroundReviewRevision,
    function() { return '' }
  )
  const importRevision = useSyncExternalStore(
    subscribeImportReviewSession,
    getImportReviewSessionRevision,
    function() { return '' }
  )
  const fieldLookupRevision = useSyncExternalStore(
    subscribeFieldLookupQueue,
    getFieldLookupRevision,
    function() { return '' }
  )
  return useMemo(function() {
    return getBackgroundReviewSummary()
  }, [reviewRevision, importRevision, fieldLookupRevision])
}

function resolveTuneName(tunes, tuneId, fallback) {
  if (fallback) return fallback
  if (!tunes || !tuneId) return 'Untitled'
  const tune = tunes[tuneId]
  return tune && tune.name ? tune.name : 'Untitled'
}

export default function ReviewPage(props) {
  const navigate = useNavigate()
  const summary = useReviewSummary()

  useEffect(function() {
    showImportReviewUi()
  }, [])

  const hasImport = hasActiveImportReviewSession()
  const hasMedia = summary.mediaReady.length > 0
  const hasAnything = hasImport || hasMedia || summary.ready > 0

  return (
    <div className="app-surface-panel review-page">
      <div className="review-page-header">
        <h1>Review queue</h1>
        <p className="app-text-muted">
          Work through imports, media analysis, and search merges one tune at a time.
          Search results appear as merge items in the import review form below.
          {summary.processing > 0 ? (
            <> {' '}{summary.processing} still processing in the background.</>
          ) : null}
        </p>
      </div>

      {!hasAnything ? (
        <p className="app-text-muted">Nothing waiting for review.</p>
      ) : null}

      {hasImport ? (
        <section className="review-page-section">
          <h2>Import review</h2>
          <p className="app-text-muted">
            {summary.importReady} of {summary.importTotal} item{summary.importTotal === 1 ? '' : 's'} ready to merge.
            Use the form below to review each tune, including search suggestions.
          </p>
        </section>
      ) : null}

      {hasMedia ? (
        <section className="review-page-section">
          <h2>Media analysis</h2>
          <ListGroup className="review-page-media-list">
            {summary.mediaReady.map(function(tuneId) {
              return (
                <ListGroup.Item key={tuneId} className="review-page-media-item">
                  <div className="review-page-media-item-main">
                    <strong>{resolveTuneName(props.tunes, tuneId)}</strong>
                    <span className="app-text-muted"> — transcription ready</span>
                  </div>
                  <div className="review-page-media-item-actions">
                    <Button
                      as={Link}
                      to={'/editor/' + encodeURIComponent(tuneId)}
                      variant="primary"
                      size="sm"
                      onClick={function() {
                        markMediaAnalysisReviewed(tuneId)
                      }}
                    >
                      Review on tune
                    </Button>
                    <Button
                      variant="outline-secondary"
                      size="sm"
                      onClick={function() {
                        markMediaAnalysisReviewed(tuneId)
                      }}
                    >
                      Dismiss
                    </Button>
                  </div>
                </ListGroup.Item>
              )
            })}
          </ListGroup>
        </section>
      ) : null}

      <div className="review-page-footer d-flex gap-2 flex-wrap">
        <Button variant="outline-secondary" onClick={function() { navigate(-1) }}>
          Back
        </Button>
        {hasImport || hasMedia ? (
          <Button
            variant="outline-primary"
            onClick={function() {
              snoozeBackgroundReviewToast()
              hideImportReviewUi()
              navigate('/tunes')
            }}
          >
            Continue later
          </Button>
        ) : null}
      </div>
    </div>
  )
}
