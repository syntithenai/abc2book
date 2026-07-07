import { ProgressBar, Button, ListGroup } from 'react-bootstrap'
import {
  summarizeFifoJobs,
  countActiveFifoJobs,
  formatFifoSummary,
} from './jobQueueUtils'

function QueueBadge({ variant, children, classPrefix }) {
  const prefix = classPrefix || 'background-jobs'
  return (
    <span className={prefix + '-queue-badge ' + prefix + '-queue-badge-' + variant}>
      {children}
    </span>
  )
}

export default function JobQueueTabPanel({
  jobs,
  running,
  paused,
  overallProgress,
  finishedCount,
  totalCount,
  currentJobMessage,
  progressHasErrors,
  onStart,
  onStop,
  onClearFinished,
  onCancelAll,
  onCancelJob,
  renderJobTitle,
  renderJobMeta,
  renderJobExtra,
  showStartStop = true,
  classPrefix = 'background-jobs',
  emptyMessage = 'No jobs in the queue.',
}) {
  const jobList = Array.isArray(jobs) ? jobs : []
  const summary = summarizeFifoJobs(jobList)
  const activeJobCount = countActiveFifoJobs(jobList)
  const isActive = running && !paused
  const showProgress = typeof totalCount === 'number' && totalCount > 0
    && typeof overallProgress === 'number'

  return (
    <>
      {showProgress ? (
        <div className={classPrefix + '-queue-progress'}>
          <ProgressBar
            now={overallProgress}
            label={overallProgress + '%'}
            animated={isActive}
            striped={isActive}
            variant={progressHasErrors ? 'warning' : 'info'}
          />
          <div className={classPrefix + '-queue-progress-meta text-muted'}>
            {finishedCount} of {totalCount} finished
            {currentJobMessage ? (' · ' + currentJobMessage) : ''}
          </div>
        </div>
      ) : null}

      <div className={classPrefix + '-queue-toolbar'}>
        <span className={classPrefix + '-queue-summary'}>
          {formatFifoSummary(summary)}
        </span>
        <div className={classPrefix + '-queue-toolbar-actions'}>
          {showStartStop ? (
            <>
              <Button
                variant="success"
                size="sm"
                className={classPrefix + '-queue-toolbar-btn'}
                disabled={running && !paused}
                onClick={onStart}
              >
                Start
              </Button>
              <Button
                variant="warning"
                size="sm"
                className={classPrefix + '-queue-toolbar-btn'}
                disabled={!running || paused}
                onClick={onStop}
              >
                Stop
              </Button>
            </>
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            className={classPrefix + '-queue-toolbar-btn'}
            onClick={onClearFinished}
          >
            Clear finished
          </Button>
          <Button
            variant="danger"
            size="sm"
            className={classPrefix + '-queue-toolbar-btn ' + classPrefix + '-queue-cancel-all-btn'}
            disabled={activeJobCount === 0}
            onClick={onCancelAll}
          >
            Cancel all
          </Button>
        </div>
      </div>

      {jobList.length === 0 ? (
        <p className="text-muted">{emptyMessage}</p>
      ) : (
        <ListGroup className={classPrefix + '-queue-list'}>
          {jobList.map(function(job) {
            const canCancel = job.status === 'pending' || job.status === 'running'
            return (
              <ListGroup.Item key={job.id} className={classPrefix + '-queue-item'}>
                <div className={classPrefix + '-queue-item-header'}>
                  <div className={classPrefix + '-queue-item-title'}>
                    {renderJobTitle ? renderJobTitle(job) : (
                      <strong>{job.tuneName || job.title || 'Untitled'}</strong>
                    )}
                  </div>
                  {canCancel && onCancelJob ? (
                    <Button
                      variant="danger"
                      size="sm"
                      className={classPrefix + '-queue-item-cancel'}
                      onClick={function() { onCancelJob(job.id) }}
                    >
                      Cancel
                    </Button>
                  ) : null}
                </div>
                {renderJobMeta ? (
                  <div className={classPrefix + '-queue-item-meta'}>
                    {renderJobMeta(job, QueueBadge)}
                  </div>
                ) : null}
                {renderJobExtra ? renderJobExtra(job) : null}
              </ListGroup.Item>
            )
          })}
        </ListGroup>
      )}
    </>
  )
}
