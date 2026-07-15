/**
 * Compact pending-changes strip wired to the field-lookup suggestion cache for a tune.
 * Shared by Info form, Abc / lyrics editors, and Review page rows.
 */
import FieldSuggestionsChangesStrip from './FieldSuggestionsChangesStrip'
import useTuneFieldLookupQueue from '../useTuneFieldLookupQueue'
import { dismissFieldLookup } from '../tuneFieldLookupQueue'
import { awaitingJobsForTune, nonCurrentCandidates } from '../fieldSuggestionsUtils'
import { requestOpenFieldSuggestions } from '../fieldSuggestionsOpen'
import { useMemo } from 'react'

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
        count: nonCurrentCandidates(job.candidates).length,
        job: job,
      }
    })
  }, [fieldLookupQueue.state, tuneId])

  if (!items.length) return null

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
      onOpen={openItem}
      onClearAll={function() { items.forEach(clearItem) }}
    />
  )
}
