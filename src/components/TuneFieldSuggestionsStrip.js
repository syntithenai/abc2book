/**
 * Compact pending-changes strip wired to the field-lookup suggestion cache for a tune.
 * Shared by Info form, Abc / lyrics editors, and Review page rows.
 */
import { useMemo, useState } from 'react'
import FieldSuggestionsChangesStrip from './FieldSuggestionsChangesStrip'
import FieldSuggestionPickerHost from './FieldSuggestionPickerHost'
import useTuneFieldLookupQueue from '../useTuneFieldLookupQueue'
import { dismissFieldLookup } from '../tuneFieldLookupQueue'
import { awaitingJobsForTune } from '../fieldSuggestionsUtils'
import { acceptAllFieldSuggestionsForTune } from '../fieldLookupAcceptAll'

export default function TuneFieldSuggestionsStrip(props) {
  const tuneId = props.tuneId
  const tunebook = props.tunebook
  const tunes = props.tunes
  const forceRefresh = props.forceRefresh
  const fieldLookupQueue = useTuneFieldLookupQueue()
  const [activeJob, setActiveJob] = useState(null)
  const jobs = (fieldLookupQueue.state && fieldLookupQueue.state.jobs) || []
  const items = useMemo(function() {
    if (!tuneId) return []
    return awaitingJobsForTune(jobs, tuneId).map(function(job) {
      return {
        jobId: job.id,
        kind: job.kind,
        job: job,
      }
    })
  }, [jobs, tuneId])

  if (!items.length) return null

  function clearItem(item) {
    dismissFieldLookup(item.jobId)
  }

  function acceptAll() {
    const count = items.length
    const message = count === 1
      ? 'Apply the first suggestion for this field?'
      : ('Apply the first suggestion for all ' + count + ' fields on this tune?')
    if (!window.confirm(message)) return
    acceptAllFieldSuggestionsForTune(tuneId, {
      tunebook: tunebook,
      tunes: tunes,
      forceRefresh: forceRefresh,
    })
  }

  return (
    <>
      <FieldSuggestionsChangesStrip
        items={items}
        showAcceptAll={!!tunebook}
        onAcceptAll={acceptAll}
        onOpen={function(item) {
          setActiveJob(item.job)
          if (typeof props.onOpen === 'function') props.onOpen(item)
        }}
        onClearAll={function() { items.forEach(clearItem) }}
      />
      <FieldSuggestionPickerHost
        tuneId={tuneId}
        tunebook={tunebook}
        tunes={tunes}
        forceRefresh={forceRefresh}
        jobs={jobs}
        activeJob={activeJob}
        onClose={function() { setActiveJob(null) }}
      />
    </>
  )
}
