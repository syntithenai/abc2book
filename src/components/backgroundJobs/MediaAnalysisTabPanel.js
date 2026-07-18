import { Button, ListGroup } from 'react-bootstrap'
import useAllMediaAnalysisJobs from '../../useAllMediaAnalysisJobs'
import {
  resetMediaAnalysisJob,
  cancelAllActiveMediaAnalysisJobs,
  clearInactiveMediaAnalysisJobs,
} from '../../mediaAnalysisJobs'

function resolveTuneName(tunes, tuneId) {
  if (!tunes || !tuneId) return 'Untitled'
  const tune = tunes[tuneId]
  return tune && tune.name ? tune.name : 'Untitled'
}

export default function MediaAnalysisTabPanel({ tunes }) {
  const jobs = useAllMediaAnalysisJobs()
  const activeCount = jobs.filter(function(job) { return job.isAnalyzing }).length

  return (
    <>
      <div className="background-jobs-queue-toolbar">
        <span className="background-jobs-queue-summary">
          {activeCount} analyzing · {jobs.length} total
        </span>
        <div className="background-jobs-queue-toolbar-actions">
          <Button
            variant="secondary"
            size="sm"
            className="background-jobs-queue-toolbar-btn"
            onClick={clearInactiveMediaAnalysisJobs}
          >
            Clear finished
          </Button>
          <Button
            variant="danger"
            size="sm"
            className="background-jobs-queue-toolbar-btn"
            disabled={activeCount === 0}
            onClick={cancelAllActiveMediaAnalysisJobs}
          >
            Cancel all
          </Button>
        </div>
      </div>
      {jobs.length === 0 ? (
        <p className="text-muted">No media analysis jobs.</p>
      ) : (
        <ListGroup className="background-jobs-queue-list">
          {jobs.map(function(job) {
            return (
              <ListGroup.Item key={job.tuneId} className="background-jobs-queue-item">
                <div className="background-jobs-queue-item-header">
                  <div className="background-jobs-queue-item-title">
                    <strong>{resolveTuneName(tunes, job.tuneId)}</strong>
                  </div>
                  {job.isAnalyzing ? (
                    <Button
                      variant="danger"
                      size="sm"
                      className="background-jobs-queue-item-cancel"
                      onClick={function() { resetMediaAnalysisJob(job.tuneId) }}
                    >
                      Cancel
                    </Button>
                  ) : null}
                </div>
                <div className="background-jobs-queue-item-meta">
                  <span className={'background-jobs-queue-badge background-jobs-queue-badge-' + (job.isAnalyzing ? 'primary' : 'secondary')}>
                    {job.isAnalyzing ? 'analyzing' : (job.error ? 'error' : 'finished')}
                  </span>
                  {job.isAnalyzing && job.progress > 0 ? (
                    <span className="background-jobs-queue-badge background-jobs-queue-badge-info">
                      {job.progress + '%'}
                    </span>
                  ) : null}
                </div>
                {job.status ? (
                  <div className="text-muted background-jobs-queue-item-message">{job.status}</div>
                ) : null}
                {!job.isAnalyzing && job.analysis && job.analysis.raw && job.analysis.raw.chords && job.analysis.raw.chords.backend ? (
                  <div className="text-muted background-jobs-queue-item-message">
                    Chords via {job.analysis.raw.chords.backend}
                    {job.analysis.raw.melody && job.analysis.raw.melody.backend
                      ? (' · melody via ' + job.analysis.raw.melody.backend)
                      : ''}
                  </div>
                ) : null}
                {job.error ? (
                  <div className="text-danger background-jobs-queue-item-error">{job.error}</div>
                ) : null}
              </ListGroup.Item>
            )
          })}
        </ListGroup>
      )}
    </>
  )
}
