import useTuneFieldLookupQueue from '../useTuneFieldLookupQueue'
import ImportFieldSuggestion from './ImportFieldSuggestion'
import {
  applyFieldLookupChoice,
  getAwaitingJob,
} from '../tuneFieldLookupQueue'
import { candidateDisplayValue } from '../fieldLookupApplyUtils'

function fieldLabel(kind) {
  if (kind === 'composer') return 'Artist'
  if (kind === 'lyrics') return 'Lyrics'
  if (kind === 'chords') return 'Chords'
  if (kind === 'notation') return 'ABC Notes'
  if (kind === 'links') return 'Links'
  return 'Search'
}

function choiceLabel(kind, candidate, fallbackTitle) {
  if (!candidate) return 'Result'
  if (kind === 'composer') {
    return String(candidate.artist || '').trim() || 'Artist'
  }
  if (kind === 'links') {
    const title = String(candidate.title || '').trim()
    const link = String(candidate.link || '').trim()
    if (title) return title
    return link || 'YouTube result'
  }
  const title = String(candidate.title || fallbackTitle || '').trim()
  const artist = String(candidate.artist || '').trim()
  if (artist && title) return artist + ' — ' + title
  if (title) return title
  if (artist) return artist
  const display = candidateDisplayValue(kind, candidate)
  if (display) {
    const firstLine = display.split(/\r?\n/).find(function(line) {
      return String(line || '').trim()
    })
    return truncateOneLine(firstLine || display, 48)
  }
  return 'Result'
}

function truncateOneLine(text, maxLen) {
  const value = String(text || '').replace(/\s+/g, ' ').trim()
  if (value.length <= maxLen) return value
  return value.slice(0, maxLen - 1) + '…'
}

/**
 * Merge-suggestion control for an awaiting field-lookup job.
 * Opens a dropdown of search result choices (no Use/Choose/Dismiss buttons).
 */
export default function FieldLookupReviewButton({
  tuneId,
  candidateId,
  kind,
  onApply,
  fallbackTitle,
  className,
}) {
  const queue = useTuneFieldLookupQueue()

  const targetKey = tuneId
    ? ('tune:' + String(tuneId))
    : (candidateId ? ('candidate:' + String(candidateId)) : '')

  const awaiting = targetKey
    ? (queue.getAwaitingJob(targetKey, kind) || getAwaitingJob(targetKey, kind))
    : null

  const candidates = awaiting && Array.isArray(awaiting.candidates) ? awaiting.candidates : []
  const manualOnly = awaiting
    && candidates.length === 0
    && Array.isArray(awaiting.manualCandidates)
    && awaiting.manualCandidates.length > 0
  const list = candidates.length > 0
    ? candidates
    : (manualOnly ? awaiting.manualCandidates : [])

  if (!awaiting || list.length === 0) return null

  const multi = list.length > 1
  const primary = list[0]
  const display = candidateDisplayValue(kind, primary)
  const titleHint = fallbackTitle || awaiting.title || ''

  function applyRaw(raw) {
    const applied = applyFieldLookupChoice(awaiting.id, raw)
    if (typeof onApply === 'function' && applied) {
      onApply(applied, awaiting)
    }
  }

  const choices = list.map(function(candidate, index) {
    const preview = candidateDisplayValue(kind, candidate)
    return {
      id: String(candidate.sourceUrl || candidate.artist || candidate.title || index),
      label: choiceLabel(kind, candidate, titleHint),
      preview: preview,
      source: candidate.source || '',
      raw: candidate,
      value: candidate,
    }
  })

  const suggestion = {
    key: kind,
    formKey: kind,
    value: display,
    displayValue: display,
  }

  return (
    <span className={className || 'field-lookup-review-btn'}>
      <ImportFieldSuggestion
        id={'field-lookup-' + kind + '-' + (awaiting.id || '')}
        label={fieldLabel(kind)}
        fieldKey={kind}
        suggestion={suggestion}
        importedDisplay={multi
          ? (list.length + ' results')
          : (choices[0] && choices[0].label) || display}
        actionLabel="Use search"
        choices={choices}
        onSelectChoice={function(choice) {
          applyRaw(choice && choice.raw ? choice.raw : choice)
        }}
      />
    </span>
  )
}
