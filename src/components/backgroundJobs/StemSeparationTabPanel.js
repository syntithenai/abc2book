import { useSyncExternalStore } from 'react'
import { Button, ProgressBar } from 'react-bootstrap'
import {
  getStemAnalysisJobRevision,
  getStemAnalysisJobSnapshot,
  subscribeStemAnalysisJob,
} from '../../stemAnalysisJobStore'

function useStemAnalysisJobSnapshot() {
  useSyncExternalStore(
    subscribeStemAnalysisJob,
    getStemAnalysisJobRevision,
    function() { return '' }
  )
  return getStemAnalysisJobSnapshot()
}

export default function StemSeparationTabPanel({ mediaController }) {
  const job = useStemAnalysisJobSnapshot()
  const controllerActive = !!(mediaController && (
    mediaController.stemSeparationActive
    || (mediaController.stemAnalysisProgress && mediaController.stemAnalysisProgress.active)
  ))
  const controllerProgress = mediaController && mediaController.stemAnalysisProgress
    ? mediaController.stemAnalysisProgress
    : { active: false, progress: 0, message: '' }
  const active = controllerActive || job.active
  const progress = active
    ? {
        message: controllerProgress.message || job.message || 'Analysing stems...',
        progress: controllerProgress.progress || job.progress || 0,
      }
    : {
        message: job.message || '',
        progress: job.progress || 0,
      }
  const tuneLabel = job.tuneName
    ? job.tuneName + (job.linkIndex != null ? ' (link ' + (job.linkIndex + 1) + ')' : '')
    : ''

  return (
    <>
      <div className="background-jobs-queue-toolbar">
        <span className="background-jobs-queue-summary">
          {active ? 'Stem separation in progress' : (job.error ? 'Stem separation failed' : 'No active stem separation')}
        </span>
        <div className="background-jobs-queue-toolbar-actions">
          <Button
            variant="danger"
            size="sm"
            className="background-jobs-queue-toolbar-btn"
            disabled={!active || !mediaController || !mediaController.cancelStemAnalysis}
            onClick={function() {
              if (mediaController && mediaController.cancelStemAnalysis) {
                mediaController.cancelStemAnalysis()
              }
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
      {!active && !job.error ? (
        <p className="text-muted">
          On-demand stem separation runs in the background for the selected media link.
          Progress appears here and in Media Controls → Audio Filters for that tune.
        </p>
      ) : (
        <div className="background-jobs-stem-separation-detail">
          {tuneLabel ? (
            <p className="text-muted background-jobs-stem-separation-tune">{tuneLabel}</p>
          ) : null}
          <p className="text-muted">
            {progress.message || 'Analysing stems...'}
          </p>
          {(active || progress.progress > 0) ? (
            <ProgressBar
              now={progress.progress || 0}
              label={(progress.progress || 0) + '%'}
              striped={active}
              animated={active}
            />
          ) : null}
          {job.error ? (
            <p className="text-danger background-jobs-stem-separation-error">{job.error}</p>
          ) : null}
        </div>
      )}
    </>
  )
}
