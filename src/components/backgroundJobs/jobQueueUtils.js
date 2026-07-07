export function summarizeFifoJobs(jobs) {
  const list = Array.isArray(jobs) ? jobs : []
  const pending = list.filter(function(job) { return job.status === 'pending' }).length
  const running = list.filter(function(job) { return job.status === 'running' }).length
  const done = list.filter(function(job) { return job.status === 'done' }).length
  const skipped = list.filter(function(job) { return job.status === 'skipped' }).length
  const errors = list.filter(function(job) { return job.status === 'error' }).length
  return { pending: pending, running: running, done: done, skipped: skipped, errors: errors }
}

export function countActiveFifoJobs(jobs) {
  return (Array.isArray(jobs) ? jobs : []).filter(function(job) {
    return job.status === 'pending' || job.status === 'running'
  }).length
}

export function fifoStatusVariant(status) {
  if (status === 'done') return 'success'
  if (status === 'running') return 'primary'
  if (status === 'awaiting') return 'info'
  if (status === 'error') return 'danger'
  if (status === 'cancelled') return 'secondary'
  if (status === 'skipped') return 'secondary'
  return 'warning'
}

export function formatFifoSummary(summary) {
  let text = summary.pending + ' pending · ' + summary.running + ' running · ' + summary.done + ' done'
  if (summary.skipped > 0) text += ' · ' + summary.skipped + ' skipped'
  if (summary.errors > 0) text += ' · ' + summary.errors + ' failed'
  return text
}
