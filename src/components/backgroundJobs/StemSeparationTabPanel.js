import { Button } from 'react-bootstrap'

export default function StemSeparationTabPanel({ mediaController }) {
  const active = mediaController && (
    mediaController.stemSeparationActive
    || (mediaController.stemAnalysisProgress && mediaController.stemAnalysisProgress.active)
  )
  const progress = mediaController && mediaController.stemAnalysisProgress
    ? mediaController.stemAnalysisProgress
    : { active: false, progress: 0, message: '' }

  return (
    <>
      <div className="background-jobs-queue-toolbar">
        <span className="background-jobs-queue-summary">
          {active ? 'Stem separation in progress' : 'No active stem separation'}
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
      {!active ? (
        <p className="text-muted">
          On-demand stem separation runs for the currently playing media link.
        </p>
      ) : (
        <div className="background-jobs-stem-separation-detail">
          <p className="text-muted">
            {progress.message || 'Analysing stems...'}
            {progress.progress > 0 ? (' (' + progress.progress + '%)') : ''}
          </p>
        </div>
      )}
    </>
  )
}
