import { useEffect, useState } from 'react'
import { Button } from 'react-bootstrap'
import useTuneFieldLookupQueue from '../useTuneFieldLookupQueue'
import ImportFieldSuggestion from './ImportFieldSuggestion'
import SearchResultPickerModal from './SearchResultPickerModal'
import {
  applyFieldLookupChoice,
  getAwaitingJob,
  shouldDeferFieldLookupSave,
} from '../tuneFieldLookupQueue'
import { candidateDisplayValue } from '../fieldLookupApplyUtils'
import { subscribeOpenFieldSuggestions } from '../fieldSuggestionsOpen'
import {
  buildPickerOriginalValueItem,
  displayFromOriginalValue,
  originalValueFromJob,
  searchableSuggestions,
} from '../fieldSuggestionsUtils'

function fieldLabel(kind) {
  if (kind === 'composer') return 'Artist'
  if (kind === 'lyrics') return 'Lyrics'
  if (kind === 'chords') return 'Chords'
  if (kind === 'notation') return 'ABC Notes'
  if (kind === 'links') return 'Links'
  if (kind === 'genre') return 'Genre'
  if (kind === 'title') return 'Title'
  return 'Search'
}

function choiceLabel(kind, candidate, fallbackTitle) {
  if (!candidate) return 'Result'
  if (kind === 'composer') {
    return String(candidate.artist || '').trim() || 'Artist'
  }
  if (kind === 'genre') {
    return String(candidate.genre || '').trim() || 'Genre'
  }
  if (kind === 'title') {
    return String(candidate.title || '').trim() || 'Title'
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

function previewFromCurrent(currentDisplay, currentValue) {
  if (currentDisplay != null) return String(currentDisplay)
  if (currentValue != null && String(currentValue).trim() !== '') return String(currentValue)
  return '(empty)'
}

/**
 * Merge-suggestion control for an awaiting field-lookup job.
 * Notation opens a fullscreen gallery picker; other kinds use a dropdown.
 *
 * Review / linked jobs defer live save — host onApply receives { deferred: true }.
 */
export default function FieldLookupReviewButton({
  tuneId,
  candidateId,
  kind,
  onApply,
  fallbackTitle,
  className,
  previewMetadata,
  currentValue,
  currentDisplay,
}) {
  const queue = useTuneFieldLookupQueue()
  const [showNotationPicker, setShowNotationPicker] = useState(false)

  const targetKey = tuneId
    ? ('tune:' + String(tuneId))
    : (candidateId ? ('candidate:' + String(candidateId)) : '')

  const awaiting = targetKey
    ? (queue.getAwaitingJob(targetKey, kind) || getAwaitingJob(targetKey, kind))
    : null

  const searchList = awaiting ? searchableSuggestions(awaiting) : []
  const manualOnly = awaiting
    && searchList.length === 0
    && Array.isArray(awaiting.manualCandidates)
    && awaiting.manualCandidates.length > 0
  const list = searchList.length > 0
    ? searchList
    : (manualOnly ? awaiting.manualCandidates : [])

  const [forceOpenSuggestion, setForceOpenSuggestion] = useState(0)

  useEffect(function() {
    return subscribeOpenFieldSuggestions(function(openTuneId, openKind) {
      if (!tuneId || String(tuneId) !== String(openTuneId)) return
      if (String(kind) !== String(openKind)) return
      if (kind === 'notation') setShowNotationPicker(true)
      else setForceOpenSuggestion(function(n) { return n + 1 })
    })
  }, [tuneId, kind])

  if (!awaiting || list.length === 0) return null

  const multi = list.length > 1
  const primary = list[0]
  const display = candidateDisplayValue(kind, primary)
  const titleHint = fallbackTitle || awaiting.title || ''
  const deferred = shouldDeferFieldLookupSave(awaiting)
  const originalRaw = originalValueFromJob(awaiting)
  const hasStoredOriginal = originalRaw !== null && originalRaw !== undefined
  const frozenCurrentValue = hasStoredOriginal ? originalRaw : currentValue
  const currentPreview = hasStoredOriginal
    ? (displayFromOriginalValue(frozenCurrentValue) || '(empty)')
    : previewFromCurrent(currentDisplay, currentValue)

  function applyRaw(raw) {
    // Review / import-draft jobs keep candidates selectable until Import/Add.
    if (deferred) {
      if (typeof onApply === 'function') {
        onApply(raw, awaiting, { deferred: true, persistChoices: true })
      }
      return
    }
    const applied = applyFieldLookupChoice(awaiting.id, raw)
    if (typeof onApply === 'function' && applied) {
      onApply(applied, awaiting, { deferred: false })
    }
  }

  function applyCurrentValue() {
    // Applying Original keeps suggestions so alternatives remain available.
    if (typeof onApply === 'function') {
      onApply(null, awaiting, {
        deferred: deferred,
        keepCurrent: true,
        persistChoices: deferred,
      })
    }
  }

  if (kind === 'notation') {
    const pickerItems = [
      buildPickerOriginalValueItem({
        value: frozenCurrentValue,
        display: currentPreview,
        abc: typeof frozenCurrentValue === 'string' ? frozenCurrentValue : '',
      }),
    ].concat(list.map(function(candidate) {
      return {
        title: candidate.title || titleHint,
        artist: candidate.artist || '',
        preview: candidate.preview || candidate.abc || '',
        abc: candidate.abc || candidate.preview || '',
        source: candidate.source || '',
        sourceUrl: candidate.sourceUrl || '',
        matchType: candidate.source || '',
      }
    }))
    return (
      <span className={className || 'field-lookup-review-btn'}>
        <Button
          variant="outline-info"
          size="sm"
          onClick={function() { setShowNotationPicker(true) }}
          aria-label={'Use search suggestion for ' + fieldLabel(kind)}
        >
          Use search: {multi ? (list.length + ' results') : ((pickerItems[1] && pickerItems[1].title) || 'result')}
        </Button>
        <SearchResultPickerModal
          show={showNotationPicker}
          title="Choose notation"
          layout="notation"
          previewMetadata={previewMetadata}
          fallbackTitle={titleHint}
          items={pickerItems}
          onSelect={function(item, index) {
            if (item && item.__current) {
              setShowNotationPicker(false)
              applyCurrentValue()
              return
            }
            const raw = list[index - 1] || list.find(function(candidate) {
              return (candidate.title || titleHint) === (item && item.title)
                && (candidate.source || '') === (item && item.source || '')
            })
            if (!raw) return
            setShowNotationPicker(false)
            applyRaw(raw)
          }}
          onHide={function() { setShowNotationPicker(false) }}
        />
      </span>
    )
  }

  const searchChoices = list.map(function(candidate, index) {
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

  const choices = [{
    id: 'current',
    label: 'Original Value',
    preview: currentPreview || '(empty)',
    source: 'original',
    raw: null,
    value: frozenCurrentValue,
    __current: true,
  }].concat(searchChoices)

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
          : (searchChoices[0] && searchChoices[0].label) || display}
        actionLabel="Use search"
        choices={choices}
        openRequestToken={forceOpenSuggestion}
        onSelectChoice={function(choice) {
          if (choice && choice.__current) {
            applyCurrentValue()
            return
          }
          applyRaw(choice && choice.raw ? choice.raw : choice)
        }}
      />
    </span>
  )
}
