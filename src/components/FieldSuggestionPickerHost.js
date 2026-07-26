import { useEffect, useState } from 'react'
import SearchResultPickerModal from './SearchResultPickerModal'
import MelodyAnalysisRefineModal from './MelodyAnalysisRefineModal'
import useAbcjsParser from '../useAbcjsParser'
import { subscribeOpenFieldSuggestions } from '../fieldSuggestionsOpen'
import { getMediaAnalysisJob } from '../mediaAnalysisJobs'
import { mediaAnalysisJobHasMelodySourceNotes } from '../mediaAnalysisSuggestions'
import {
  applyFieldSuggestionCandidate,
  restoreFieldLookupOriginalToTune,
} from '../fieldSuggestionApply'
import {
  buildPickerStateFromJob,
  pickerTitleForKind,
} from '../fieldSuggestionPickerUtils'

/**
 * Opens field suggestion pickers from strip chips or requestOpenFieldSuggestions events.
 * Handles notation refine, chords commit, and restoring Original Value.
 */
export default function FieldSuggestionPickerHost(props) {
  const tuneId = props.tuneId
  const tunebook = props.tunebook
  const tunes = props.tunes || {}
  const forceRefresh = props.forceRefresh
  const jobs = props.jobs || []
  const abcjsParser = useAbcjsParser({ tunebook: tunebook })
  const [picker, setPicker] = useState(null)
  const [selectedIndexes, setSelectedIndexes] = useState([])
  const [showRefine, setShowRefine] = useState(false)
  const mediaJob = getMediaAnalysisJob(tuneId)

  const applyOptions = {
    tunebook: tunebook,
    tunes: tunes,
    abcjsParser: abcjsParser,
    forceRefresh: forceRefresh,
  }

  function closePicker() {
    setPicker(null)
    setSelectedIndexes([])
    setShowRefine(false)
    if (typeof props.onClose === 'function') props.onClose()
  }

  function openJob(job) {
    if (!job) return
    setPicker(buildPickerStateFromJob(job, tunes, tunebook))
    setSelectedIndexes([])
  }

  useEffect(function() {
    if (props.activeJob) {
      openJob(props.activeJob)
    }
  }, [props.activeJob && props.activeJob.id])

  useEffect(function() {
    if (!tuneId) return undefined
    return subscribeOpenFieldSuggestions(function(openTuneId, openKind) {
      if (String(tuneId) !== String(openTuneId)) return
      const match = jobs.filter(function(job) {
        return job && job.status === 'awaiting' && job.kind === openKind
      })
      if (match.length > 0) openJob(match[0])
    })
  }, [tuneId, jobs])

  function applyCandidate(job, candidate, keepOpen) {
    if (!job || !candidate) return false
    if (
      job.kind === 'notation'
      && candidate.source === 'media-analysis'
      && mediaAnalysisJobHasMelodySourceNotes(mediaJob)
    ) {
      setShowRefine(true)
      return true
    }
    const ok = applyFieldSuggestionCandidate(job, candidate, applyOptions)
    if (ok && !keepOpen) closePicker()
    return ok
  }

  const multiSelect = !!(picker && picker.multiSelect)

  function selectAllSuggestions() {
    if (!picker || !picker.job) return
    const nextIndexes = selectedIndexes.slice()
    picker.items.forEach(function(item, index) {
      if (item && item.__current) return
      if (nextIndexes.indexOf(index) >= 0) return
      const candidate = (item && item.raw)
        || (picker.candidates && picker.candidates[index - 1])
        || null
      if (!candidate) return
      nextIndexes.push(index)
      applyCandidate(picker.job, candidate, true)
    })
    setSelectedIndexes(nextIndexes)
  }

  function selectNoneSuggestions() {
    setSelectedIndexes([])
  }

  return (
    <>
      <SearchResultPickerModal
        show={!!picker && !showRefine}
        title={picker ? pickerTitleForKind(picker.kind) : 'Choose suggestion'}
        layout={picker && picker.layout}
        previewMetadata={picker && picker.previewMetadata}
        fallbackTitle={picker && picker.titleHint}
        multiSelect={multiSelect}
        selectedIndexes={selectedIndexes}
        items={picker ? picker.items : []}
        onSelectAll={multiSelect ? selectAllSuggestions : undefined}
        onSelectNone={multiSelect ? selectNoneSuggestions : undefined}
        onSelect={function(item, index) {
          if (!picker || !picker.job) return
          if (item && item.__current) {
            restoreFieldLookupOriginalToTune(picker.job, applyOptions)
            if (!multiSelect) closePicker()
            return
          }
          const candidate = (item && item.raw)
            || (picker.candidates && picker.candidates[index - 1])
            || null
          if (!candidate) return
          if (multiSelect) {
            let alreadySelected = false
            setSelectedIndexes(function(prev) {
              if (prev.indexOf(index) >= 0) {
                alreadySelected = true
                return prev
              }
              return prev.concat([index])
            })
            if (alreadySelected) return
            applyCandidate(picker.job, candidate, true)
            return
          }
          applyCandidate(picker.job, candidate, false)
        }}
        onDone={closePicker}
        onHide={closePicker}
      />
      <MelodyAnalysisRefineModal
        show={showRefine}
        onHide={function() { setShowRefine(false) }}
        tunebook={tunebook}
        tune={picker && picker.tune ? picker.tune : { id: tuneId }}
        melodySourceNotes={mediaJob.melodySourceNotes}
        timedMelody={mediaJob.timedMelody}
        chordsText={mediaJob.chordsText || ''}
        onApply={function(abcText) {
          const job = picker && picker.job
          if (!job) return
          applyFieldSuggestionCandidate(job, {
            abc: abcText,
            preview: abcText,
            source: 'media-analysis',
            title: 'Media analysis',
          }, applyOptions)
          setShowRefine(false)
          closePicker()
        }}
      />
    </>
  )
}
