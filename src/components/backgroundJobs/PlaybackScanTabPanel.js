import { Button, ListGroup } from 'react-bootstrap'
import useAllPlaybackRegionScanJobs from '../../useAllPlaybackRegionScanJobs'
import {
  cancelPlaybackRegionScanJob,
  cancelAllActivePlaybackRegionScans,
  clearInactivePlaybackRegionScanJobs,
} from '../../playbackRegionScanJobs'

function resolveTuneName(tunes, tuneId) {
  if (!tunes || !tuneId) return 'Untitled'
  const tune = tunes[tuneId]
  return tune && tune.name ? tune.name : 'Untitled'
}

export default function PlaybackScanTabPanel({ tunes }) {
  const jobs = useAllPlaybackRegionScanJobs()
  const activeCount = jobs.filter(function(job) { return job.isScanning }).length

  return (
    <>
      <div className="background-jobs-queue-toolbar">
        <span className="background-jobs-queue-summary">
          {activeCount} scanning · {jobs.length} total
        </span>
        <div className="background-jobs-queue-toolbar-actions">
          <Button
            variant="secondary"
            size="sm"
            className="background-jobs-queue-toolbar-btn"
            onClick={clearInactivePlaybackRegionScanJobs}
          >
            Clear finished
          </Button>
          <Button
            variant="danger"
            size="sm"
            className="background-jobs-queue-toolbar-btn"
            disabled={activeCount === 0}
            onClick={cancelAllActivePlaybackRegionScans}
          >
            Cancel all
          </Button>
        </div>
      </div>
      {jobs.length === 0 ? (
        <p className="text-muted">No playback region scans.</p>
      ) : (
        <ListGroup className="background-jobs-queue-list">
          {jobs.map(function(job) {
            const key = job.tuneId + ':' + job.linkIndex
            return (
              <ListGroup.Item key={key} className="background-jobs-queue-item">
                <div className="background-jobs-queue-item-header">
                  <div className="background-jobs-queue-item-title">
                    <strong>{resolveTuneName(tunes, job.tuneId)}</strong>
                    <span className="text-muted"> — Link {Number(job.linkIndex) + 1}</span>
                  </div>
                  {job.isScanning ? (
                    <Button
                      variant="danger"
                      size="sm"
                      className="background-jobs-queue-item-cancel"
                      onClick={function() {
                        cancelPlaybackRegionScanJob(job.tuneId, job.linkIndex)
                      }}
                    >
                      Cancel
                    </Button>
                  ) : null}
                </div>
                <div className="background-jobs-queue-item-meta">
                  <span className={'background-jobs-queue-badge background-jobs-queue-badge-' + (job.isScanning ? 'primary' : 'secondary')}>
                    {job.isScanning ? 'scanning' : (job.error ? 'error' : 'finished')}
                  </span>
                  {job.isScanning && job.progress > 0 ? (
                    <span className="background-jobs-queue-badge background-jobs-queue-badge-info">
                      {job.progress + '%'}
                    </span>
                  ) : null}
                </div>
                {job.status ? (
                  <div className="text-muted background-jobs-queue-item-message">{job.status}</div>
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
