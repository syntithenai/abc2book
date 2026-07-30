import { Button, ListGroup } from 'react-bootstrap';
import { taskLabel, presetLabel } from '../../audioGenerationPresets';
import {
  cancelAudioGenerationJob,
  clearFinishedAudioGenerationJobs,
  getState,
  subscribe,
} from '../../audioGenerationJobStore';
import { useSyncExternalStore } from 'react';

function statusVariant(status) {
  if (status === 'running' || status === 'pending') return 'primary';
  if (status === 'error') return 'danger';
  if (status === 'done') return 'success';
  return 'secondary';
}

export default function AudioGenerationTabPanel() {
  const state = useSyncExternalStore(subscribe, getState, getState);
  const jobs = state.jobs || [];
  const activeCount = jobs.filter(function(job) {
    return job.status === 'pending' || job.status === 'running';
  }).length;

  return (
    <>
      <div className="background-jobs-queue-toolbar">
        <span className="background-jobs-queue-summary">
          {activeCount} generating · {jobs.length} total
        </span>
        <div className="background-jobs-queue-toolbar-actions">
          <Button
            variant="secondary"
            size="sm"
            className="background-jobs-queue-toolbar-btn"
            onClick={clearFinishedAudioGenerationJobs}
          >
            Clear finished
          </Button>
        </div>
      </div>
      {jobs.length === 0 ? (
        <p className="text-muted">No audio generation jobs.</p>
      ) : (
        <ListGroup className="background-jobs-queue-list">
          {jobs.map(function(job) {
            const active = job.status === 'pending' || job.status === 'running';
            return (
              <ListGroup.Item key={job.id} className="background-jobs-queue-item">
                <div className="background-jobs-queue-item-header">
                  <div className="background-jobs-queue-item-title">
                    <strong>{job.tuneName || 'Untitled'}</strong>
                    <span className="text-muted"> — {taskLabel(job.taskId)} ({job.presetLabel || presetLabel(job.presetId)})</span>
                  </div>
                  {active ? (
                    <Button
                      variant="danger"
                      size="sm"
                      className="background-jobs-queue-item-cancel"
                      onClick={function() { cancelAudioGenerationJob(job.id); }}
                    >
                      Cancel
                    </Button>
                  ) : null}
                </div>
                <div className="background-jobs-queue-item-meta">
                  <span className={'background-jobs-queue-badge background-jobs-queue-badge-' + statusVariant(job.status)}>
                    {job.status}
                  </span>
                  {active && job.progress > 0 ? (
                    <span className="background-jobs-queue-badge background-jobs-queue-badge-info">
                      {job.progress + '%'}
                    </span>
                  ) : null}
                </div>
                {job.message ? (
                  <div className="text-muted background-jobs-queue-item-message">{job.message}</div>
                ) : null}
                {job.error ? (
                  <div className="text-danger background-jobs-queue-item-message">{job.error}</div>
                ) : null}
              </ListGroup.Item>
            );
          })}
        </ListGroup>
      )}
    </>
  );
}
