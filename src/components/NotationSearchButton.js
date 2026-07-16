import { useRef, useState } from 'react'
import { Alert } from 'react-bootstrap'
import useMediaResolverHealth from '../useMediaResolverHealth'
import { useFieldLookupSearchJob } from '../useFieldLookupSearchJob'
import { applyFieldLookupChoice, buildSearchModeOptions } from '../tuneFieldLookupQueue'
import {
  buildPickerOriginalValueItem,
  resolveOriginalValueForPicker,
  searchableSuggestions,
} from '../fieldSuggestionsUtils'
import SearchProgressBar from './SearchProgressBar'
import SearchResultPickerModal from './SearchResultPickerModal'
import { FieldLookupButtonGroup } from './FieldLookupButtonGroup'
import { renderFieldLookupSearchUi } from './fieldLookupSearchUi'
import { useOpenFieldSuggestions } from './useOpenFieldSuggestions'
import { useSyncFieldLookupOriginalValue } from './useSyncFieldLookupOriginalValue'
import { maybeOfferGenreFromSearchResult } from '../genreSideSuggestions'
import { buildExternalSearchQuestion, buildGoogleSearchQuestionUrl } from '../externalSearchLinks'

/**
 * Multi-source ABC notation search. Always Review mode — no Auto/Review dialog,
 * never silent-applies the first hit.
 */
export default function NotationSearchButton({
  tuneId,
  candidateId,
  title,
  artist,
  rhythm,
  currentGenre,
  currentValue,
  onGenreAccept,
  token,
  onNotation,
  buttonStyle,
  disabled,
  tunebook,
  resolverAvailable: resolverAvailableProp,
  inline,
  songType,
  /** Kept for TuneRecordForm API; picker always opens when results arrive. */
  leaveAwaiting = false,
  children,
}) {
  void leaveAwaiting
  const [error, setError] = useState('')
  const [pickerCandidates, setPickerCandidates] = useState([])
  const [showPicker, setShowPicker] = useState(false)
  const { available: resolverAvailableFromHealth } = useMediaResolverHealth()
  const resolverAvailable = typeof resolverAvailableProp === 'boolean'
    ? resolverAvailableProp
    : resolverAvailableFromHealth
  const applyRef = useRef(null)

  function finishApply(result, jobId) {
    if (jobId) applyFieldLookupChoice(jobId, result)
    if (typeof onNotation === 'function') onNotation(result)
    maybeOfferGenreFromSearchResult({
      tuneId: tuneId,
      candidateId: candidateId,
      result: result,
      title: title,
      artist: artist,
      rhythm: rhythm,
      currentGenre: currentGenre,
      onGenreAccept: onGenreAccept,
    })
  }
  applyRef.current = finishApply

  const lookup = useFieldLookupSearchJob({
    tuneId: tuneId,
    candidateId: candidateId,
    kind: 'notation',
    onAwaiting: function(job) {
      const candidates = searchableSuggestions(job)
      if (candidates.length === 0) {
        setError('No notation found for this song')
        return
      }
      openPicker(candidates)
    },
    onError: function(job) {
      setError(job.error || 'Notation search failed')
    },
  })

  const googleUrl = buildGoogleSearchQuestionUrl(
    buildExternalSearchQuestion('notation', title, artist)
  )
  const searchIcon = tunebook && tunebook.icons ? tunebook.icons.search : null
  const externalLinkIcon = tunebook && tunebook.icons ? tunebook.icons.externallink : null
  const busy = lookup.busy
  const canSearch = !!(title && (tuneId || candidateId))
  const awaitingJob = lookup.activeJob && lookup.activeJob.status === 'awaiting'
    ? lookup.activeJob
    : null
  const awaitingCandidates = searchableSuggestions(awaitingJob)

  useSyncFieldLookupOriginalValue(tuneId, 'notation', currentValue, awaitingJob)

  function openPicker(candidates) {
    setError('')
    setPickerCandidates(Array.isArray(candidates) ? candidates : [])
    setShowPicker(true)
  }

  function openAwaitingSuggestions() {
    if (awaitingCandidates.length === 0) return false
    openPicker(awaitingCandidates)
    return true
  }

  useOpenFieldSuggestions(tuneId, 'notation', openAwaitingSuggestions)

  function clearAwaitingSuggestions() {
    lookup.dismiss()
    setShowPicker(false)
    setPickerCandidates([])
  }

  function run(mode) {
    if (!canSearch) {
      setError(!(title || '').trim()
        ? 'Enter a title first'
        : 'Open a saved tune (or an Add/Import draft) to search notation')
      return
    }
    if (busy) {
      lookup.cancel()
      return
    }
    if (awaitingCandidates.length > 0) {
      clearAwaitingSuggestions()
    }
    void mode
    setError('')
    setShowPicker(false)
    setPickerCandidates([])
    const started = lookup.startSearch({
      title: title,
      artist: artist || '',
      tuneName: title,
      accessToken: token,
      options: buildSearchModeOptions('review', { songType: songType }),
      searchOptions: {
        resolverAvailable: resolverAvailable,
        abcTools: tunebook && tunebook.abcTools ? tunebook.abcTools : null,
      },
    })
    if (!started) {
      setError('Could not start notation search')
    }
  }

  const originalAbc = resolveOriginalValueForPicker(
    awaitingJob,
    typeof currentValue === 'string' ? currentValue : ''
  )
  const pickerItems = [
    buildPickerOriginalValueItem({
      value: originalAbc,
      abc: typeof originalAbc === 'string' ? originalAbc : '',
    }),
  ].concat(pickerCandidates.map(function(candidate) {
    return {
      title: candidate.title || title,
      artist: candidate.artist || artist || '',
      preview: candidate.preview || candidate.abc || '',
      abc: candidate.abc || candidate.preview || '',
      source: candidate.source || '',
      sourceUrl: candidate.sourceUrl || '',
      matchType: candidate.source || '',
    }
  }))

  return renderFieldLookupSearchUi({
    children: children,
    buttonGroup: (
      <>
        <FieldLookupButtonGroup
          automaticLookup={true}
          showExternal={false}
          busy={busy}
          disabled={!canSearch || disabled}
          externalUrl={googleUrl}
          externalLinkIcon={externalLinkIcon}
          onSearch={run}
          buttonStyle={buttonStyle}
          searchIcon={searchIcon}
          inline={inline}
          progress={lookup.progressPercent}
          suggestionCount={awaitingCandidates.length}
          onOpenSuggestions={openAwaitingSuggestions}
        />
        <SearchProgressBar
          visible={busy}
          percent={lookup.progressPercent}
          message={lookup.progressMessage}
          defaultMessage="Searching for notation..."
        />
      </>
    ),
    suggestionsDropdown: null,
    errorNode: (
      error ? <Alert variant="danger" className="mt-2 mb-0">{error}</Alert> : null
    ),
    modals: (
      <SearchResultPickerModal
        show={showPicker}
        title="Choose notation"
        layout="notation"
        items={pickerItems}
        onSelect={function(item, index) {
          if (item && item.__current) {
            setShowPicker(false)
            setPickerCandidates([])
            return
          }
          const candidate = pickerCandidates[index - 1] || pickerCandidates.find(function(c) {
            return (c.title || title) === item.title && (c.source || '') === (item.source || '')
          })
          if (!candidate) return
          setShowPicker(false)
          setPickerCandidates([])
          const jobId = lookup.activeJob && lookup.activeJob.status === 'awaiting'
            ? lookup.activeJob.id
            : null
          finishApply(candidate, jobId)
        }}
        onHide={function() {
          setShowPicker(false)
          setPickerCandidates([])
        }}
      />
    ),
  })
}
