import { useEffect, useRef } from 'react'
import { toast } from 'react-toastify'
import * as bulkBackgroundResearchQueue from './bulkBackgroundResearchQueue'
import * as mediaCacheQueue from './mediaCacheQueue'
import * as stemCreateQueue from './stemCreateQueue'

const AUTO_QUEUES = [
  {
    id: 'research',
    label: 'Background research',
    getState: bulkBackgroundResearchQueue.getState,
    subscribe: bulkBackgroundResearchQueue.subscribe,
  },
  {
    id: 'media-cache',
    label: 'Media cache',
    getState: mediaCacheQueue.getState,
    subscribe: mediaCacheQueue.subscribe,
  },
  {
    id: 'stems',
    label: 'Stem creation',
    getState: stemCreateQueue.getState,
    subscribe: stemCreateQueue.subscribe,
  },
]

function countActiveJobs(jobs) {
  return (jobs || []).filter(function(job) {
    return job.status === 'pending' || job.status === 'running'
  }).length
}

function queueHadWork(jobs) {
  return (jobs || []).some(function(job) {
    return job.status === 'done'
      || job.status === 'error'
      || job.status === 'skipped'
      || job.status === 'cancelled'
  })
}

export default function BackgroundJobCompletionNotifications() {
  const trackingRef = useRef({})

  useEffect(function() {
    function inspectQueue(queue) {
      const state = queue.getState()
      const activeCount = countActiveJobs(state.jobs)
      const tracking = trackingRef.current[queue.id] || { wasRunning: false, hadActive: false }

      if (state.running && activeCount > 0) {
        tracking.wasRunning = true
        tracking.hadActive = true
      }

      if (tracking.hadActive && !state.running && activeCount === 0) {
        if (queueHadWork(state.jobs)) {
          const errors = (state.jobs || []).filter(function(job) { return job.status === 'error' }).length
          if (errors > 0) {
            toast.warning(queue.label + ' finished with ' + errors + ' error' + (errors === 1 ? '' : 's') + '.', {
              autoClose: 5000,
            })
          } else {
            toast.success(queue.label + ' complete.', { autoClose: 4000 })
          }
        }
        tracking.wasRunning = false
        tracking.hadActive = false
      }

      trackingRef.current[queue.id] = tracking
    }

    const unsubs = AUTO_QUEUES.map(function(queue) {
      inspectQueue(queue)
      return queue.subscribe(function() {
        inspectQueue(queue)
      })
    })

    return function cleanup() {
      unsubs.forEach(function(unsub) { unsub() })
    }
  }, [])

  return null
}
