/**
 * Compact pending-changes strip wired to the field-lookup suggestion cache for a tune.
 * Shared by Info form, Abc / lyrics editors, and Review page rows.
 */
import FieldSuggestionsChangesStrip from './FieldSuggestionsChangesStrip'
import useTuneFieldLookupQueue from '../useTuneFieldLookupQueue'
import {
  applyFieldLookupChoice,
  dismissFieldLookup,
} from '../tuneFieldLookupQueue'
import { awaitingJobsForTune } from '../fieldSuggestionsUtils'
import { requestOpenFieldSuggestions } from '../fieldSuggestionsOpen'
import { useMemo } from 'react'

function preferCandidate(job) {
  const candidates = Array.isArray(job.candidates) ? job.candidates : []
  const nonCurrent = candidates.find(function(item) {
    return item && !item.isCurrent && item.id !== 'current'
  })
  return nonCurrent || candidates[0] || null
}

export default function TuneFieldSuggestionsStrip(props) {
  const tuneId = props.tuneId
  const fieldLookupQueue = useTuneFieldLookupQueue()
  const items = useMemo(function() {
    if (!tuneId) return []
    const jobs = awaitingJobsForTune(
      (fieldLookupQueue.state && fieldLookupQueue.state.jobs) || [],
      tuneId
    )
    return jobs.map(function(job) {
      return {
        jobId: job.id,
        kind: job.kind,
        count: Array.isArray(job.candidates) ? job.candidates.length : 0,
        job: job,
      }
    })
  }, [fieldLookupQueue.state, tuneId])

  if (!items.length) return null

  function acceptItem(item) {
    const candidate = preferCandidate(item.job)
    if (!candidate) return
    applyFieldLookupChoice(item.jobId, candidate)
    if (typeof props.onAccept === 'function') props.onAccept(item, candidate)
  }

  function clearItem(item) {
    dismissFieldLookup(item.jobId)
  }

  function openItem(item) {
    requestOpenFieldSuggestions(tuneId, item.kind)
    if (typeof props.onOpen === 'function') props.onOpen(item)
  }

  return (
    <FieldSuggestionsChangesStrip
      items={items}
      onAccept={acceptItem}
      onClear={clearItem}
      onOpen={openItem}
      onAcceptAll={function() { items.forEach(acceptItem) }}
      onClearAll={function() { items.forEach(clearItem) }}
    />
  )
}
