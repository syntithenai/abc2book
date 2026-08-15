import { useMemo, useSyncExternalStore } from 'react'
import { Button, ListGroup, ProgressBar } from 'react-bootstrap'
import {
  getDriveSyncJobs,
  getDriveSyncJobsKey,
  subscribeDriveSyncJobs,
} from '../../driveSyncJobs'
import { fifoStatusVariant } from './jobQueueUtils'
import { syncOutstandingCachedMediaBackup } from '../../mediaCacheDriveBackup'
import { syncScratchpadAfterLogin } from '../../useScratchpadLoginSync'
import { syncAudioAnalysisAfterLogin } from '../../useAudioAnalysisLoginSync'

function statusLabel(status) {
  if (status === 'running') return 'syncing'
  if (status === 'pending') return 'pending'
  if (status === 'success') return 'synced'
  if (status === 'error') return 'error'
  if (status === 'idle') return 'idle'
  return status || 'idle'
}

function statusVariant(status) {
  if (status === 'success') return 'success'
  if (status === 'idle') return 'secondary'
  return fifoStatusVariant(status)
}

function currentItemLabel(job, tunes) {
  if (!job) return ''
  if (job.currentTuneId && tunes && tunes[job.currentTuneId]) {
    const tune = tunes[job.currentTuneId]
    return tune.name || tune.title || job.currentTuneId
  }
  if (job.currentSrc) return job.currentSrc
  if (job.currentTuneId) return job.currentTuneId
  return ''
}

function useDriveSyncJobs() {
  const revision = useSyncExternalStore(
    subscribeDriveSyncJobs,
    getDriveSyncJobsKey,
    getDriveSyncJobsKey
  )
  return useMemo(function() {
    return getDriveSyncJobs()
  }, [revision])
}

export default function DriveSyncTabPanel({ tunes, token, driveApi }) {
  const jobs = useDriveSyncJobs()
  const signedIn = !!(token && token.access_token)
  const activeCount = jobs.filter(function(job) { return job.incomplete }).length

  function syncCachedMedia() {
    const job = jobs.find(function(item) { return item.kind === 'cached-media' })
    const enabled = !!(job && job.enabled)
    const hasWork = !!(job && (job.status === 'pending' || job.status === 'error'))
    if (!enabled && !hasWork) return Promise.resolve()
    return syncOutstandingCachedMediaBackup({
      force: !enabled,
      token: token,
      driveApi: driveApi,
    })
  }

  function syncScratchpad() {
    return syncScratchpadAfterLogin(driveApi, { force: true, token: token })
  }

  function syncAudioAnalysis() {
    return syncAudioAnalysisAfterLogin(driveApi, { force: true })
  }

  function syncJob(job) {
    if (!job || !signedIn) return
    if (job.kind === 'cached-media') return syncCachedMedia()
    if (job.kind === 'scratchpad') return syncScratchpad()
    if (job.kind === 'audio-analysis') return syncAudioAnalysis()
    return undefined
  }

  function syncAll() {
    if (!signedIn) return
    syncCachedMedia().catch(function() {})
    syncScratchpad().catch(function() {})
    syncAudioAnalysis().catch(function() {})
  }

  const canSyncAll = signedIn && jobs.some(function(job) {
    return job.kind !== 'songbook' && job.status !== 'running'
  })

  return (
    <>
      <div className="background-jobs-queue-toolbar">
        <span className="background-jobs-queue-summary">
          {activeCount} active · {jobs.length} activities
        </span>
        <div className="background-jobs-queue-toolbar-actions">
          <Button
            variant="success"
            size="sm"
            className="background-jobs-queue-toolbar-btn"
            disabled={!canSyncAll}
            onClick={syncAll}
          >
            Sync all
          </Button>
        </div>
      </div>
      {!signedIn ? (
        <p className="text-muted">Log in with Google to sync with Drive.</p>
      ) : null}
      <ListGroup className="background-jobs-queue-list">
        {jobs.map(function(job) {
          const canSync = signedIn
            && job.kind !== 'songbook'
            && job.status !== 'running'
            && (job.kind !== 'cached-media' || job.enabled || job.status === 'pending' || job.status === 'error')
          const itemLabel = currentItemLabel(job, tunes)
          const showProgress = job.status === 'running' && job.progressTotal > 0
          return (
            <ListGroup.Item key={job.id} className="background-jobs-queue-item">
              <div className="background-jobs-queue-item-header">
                <div className="background-jobs-queue-item-title">
                  <strong>{job.title}</strong>
                  {itemLabel ? (
                    <span className="text-muted"> — {itemLabel}</span>
                  ) : null}
                </div>
                {canSync ? (
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    className="background-jobs-queue-item-cancel"
                    onClick={function() { syncJob(job) }}
                  >
                    Sync now
                  </Button>
                ) : null}
              </div>
              <div className="background-jobs-queue-item-meta">
                <span className={
                  'background-jobs-queue-badge background-jobs-queue-badge-' + statusVariant(job.status)
                }>
                  {statusLabel(job.status)}
                </span>
                {showProgress ? (
                  <span className="background-jobs-queue-badge background-jobs-queue-badge-info">
                    {job.progressCurrent}/{job.progressTotal}
                  </span>
                ) : null}
              </div>
              {showProgress ? (
                <ProgressBar
                  className="mt-2"
                  now={Math.round((job.progressCurrent / job.progressTotal) * 100)}
                  animated
                  striped
                  variant="info"
                />
              ) : null}
              {job.message ? (
                <div className="text-muted background-jobs-queue-item-message">{job.message}</div>
              ) : null}
              {job.error && job.status === 'error' ? (
                <div className="text-danger background-jobs-queue-item-error">{job.error}</div>
              ) : null}
            </ListGroup.Item>
          )
        })}
      </ListGroup>
    </>
  )
}