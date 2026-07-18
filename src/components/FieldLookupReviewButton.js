import { useRef, useState } from 'react'
import SearchResultPickerModal from './SearchResultPickerModal'
import FieldSearchResultsCaret from './FieldSearchResultsCaret'
import { useFieldSearchResults } from '../useFieldSearchResults'
import { candidateDisplayValue } from '../fieldLookupApplyUtils'
import {
  buildPickerOriginalValueItem,
  displayFromOriginalValue,
} from '../fieldSuggestionsUtils'

function fieldLabel(kind) {
  if (kind === 'composer') return 'Artist'
  if (kind === 'lyrics') return 'Lyrics'
  if (kind === 'chords') return 'Chords'
  if (kind === 'notation') return 'ABC Notes'
  if (kind === 'links') return 'Links'
  if (kind === 'genre') return 'Genre'
  if (kind === 'title') return 'Title'
  if (kind === 'tempo') return 'Tempo'
  if (kind === 'meter') return 'Time signature'
  if (kind === 'key') return 'Key'
  return 'Search'
}

function previewFromCurrent(currentDisplay, currentValue) {
  if (currentDisplay != null) return String(currentDisplay)
  if (currentValue != null && String(currentValue).trim() !== '') return String(currentValue)
  return '(empty)'
}

/**
 * Caret control that reopens cached field-search / media-analysis results.
 * Replaces the old awaiting "Use search" light-blue button.
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
  const [showPicker, setShowPicker] = useState(false)
  const list = useFieldSearchResults(tuneId, candidateId, kind)
  const frozenCurrentValueRef = useRef(undefined)
  if (list.length && frozenCurrentValueRef.current === undefined) {
    frozenCurrentValueRef.current = currentValue
  }
  if (!list.length) return null

  const titleHint = fallbackTitle || ''
  const frozenCurrentValue = frozenCurrentValueRef.current !== undefined
    ? frozenCurrentValueRef.current
    : currentValue
  const currentPreview = previewFromCurrent(
    frozenCurrentValueRef.current !== undefined ? undefined : currentDisplay,
    frozenCurrentValue
  )

  function applyRaw(raw) {
    if (typeof onApply === 'function') {
      onApply(raw, null, { deferred: false })
    }
  }

  function applyCurrentValue() {
    if (typeof onApply === 'function') {
      onApply(null, null, { deferred: false, keepCurrent: true })
    }
  }

  const pickerItems = [
    buildPickerOriginalValueItem({
      value: frozenCurrentValue,
      display: displayFromOriginalValue(frozenCurrentValue) || currentPreview,
      abc: kind === 'notation' && typeof frozenCurrentValue === 'string' ? frozenCurrentValue : '',
    }),
  ].concat(list.map(function(candidate) {
    if (kind === 'notation') {
      return {
        title: candidate.title || titleHint,
        artist: candidate.artist || '',
        preview: candidate.preview || candidate.abc || '',
        abc: candidate.abc || candidate.preview || '',
        source: candidate.source || '',
        sourceUrl: candidate.sourceUrl || '',
        matchType: candidate.source || '',
      }
    }
    if (kind === 'meter') {
      return {
        title: candidate.meter || candidate.preview || '',
        artist: candidate.source || '',
        preview: candidate.meter || candidate.preview || '',
        source: candidate.source || '',
        matchType: candidate.source || '',
      }
    }
    if (kind === 'key') {
      return {
        title: candidate.key || candidate.preview || '',
        artist: candidate.source || '',
        preview: candidate.key || candidate.preview || '',
        source: candidate.source || '',
        matchType: candidate.source || '',
      }
    }
    if (kind === 'tempo') {
      return {
        title: String(candidate.tempo != null ? candidate.tempo : (candidate.preview || '')),
        artist: candidate.source || '',
        preview: String(candidate.tempo != null ? candidate.tempo : (candidate.preview || '')),
        source: candidate.source || '',
        matchType: candidate.source || '',
      }
    }
    const display = candidateDisplayValue(kind, candidate)
    return {
      title: display || candidate.title || candidate.genre || candidate.artist || 'Result',
      artist: candidate.source || '',
      preview: display,
      source: candidate.source || '',
      matchType: candidate.source || '',
    }
  }))

  return (
    <span className={className || 'field-lookup-review-btn'}>
      <FieldSearchResultsCaret
        candidates={list}
        openPickerOnToggle={true}
        onOpen={function() { setShowPicker(true) }}
        aria-label={'Cached ' + fieldLabel(kind) + ' search results'}
        data-testid={'field-cached-results-' + kind}
      />
      <SearchResultPickerModal
        show={showPicker}
        title={'Choose ' + fieldLabel(kind).toLowerCase()}
        layout={kind === 'notation' ? 'notation' : undefined}
        previewMetadata={previewMetadata}
        fallbackTitle={titleHint}
        items={pickerItems}
        onSelect={function(item, index) {
          if (item && item.__current) {
            setShowPicker(false)
            applyCurrentValue()
            return
          }
          const raw = list[index - 1] || list[0]
          if (!raw) return
          setShowPicker(false)
          applyRaw(raw)
        }}
        onHide={function() { setShowPicker(false) }}
      />
    </span>
  )
}
