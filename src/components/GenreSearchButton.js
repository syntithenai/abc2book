import { useRef, useState } from 'react'
import { Alert } from 'react-bootstrap'
import { useFieldLookupSearchJob } from '../useFieldLookupSearchJob'
import { applyFieldLookupChoice, buildSearchModeOptions } from '../tuneFieldLookupQueue'
import { buildGoogleGenreSearchUrl } from '../genreSearchClient'
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

export default function GenreSearchButton({
  tuneId,
  candidateId,
  title,
  artist,
  rhythm,
  currentGenre,
  backgroundInfo,
  onGenre,
  buttonStyle,
  disabled,
  tunebook,
  inline,
  children,
}) {
  const [error, setError] = useState('')
  const [pickerCandidates, setPickerCandidates] = useState([])
  const [showPicker, setShowPicker] = useState(false)
  const searchModeRef = useRef('auto')
  const applyRef = useRef(null)

  function finishApply(result, jobId) {
    if (jobId) applyFieldLookupChoice(jobId, result)
    if (typeof onGenre === 'function' && result && result.genre) {
      onGenre(result.genre)
    }
  }
  applyRef.current = finishApply

  const lookup = useFieldLookupSearchJob({
    tuneId: tuneId,
    candidateId: candidateId,
    kind: 'genre',
    onAwaiting: function(job) {
      const candidates = searchableSuggestions(job)
      if (candidates.length === 0) {
        setError('No genre suggestions found')
        return
      }
      if (searchModeRef.current === 'review') {
        openPicker(candidates)
        return
      }
      // Auto mode: settle already applied when empty; keep Suggestions strip otherwise.
      if (job.appliedCandidate && typeof onGenre === 'function') {
        const genre = String(job.appliedCandidate.genre || '').trim()
        if (genre) onGenre(genre)
      }
    },
    onError: function(job) {
      setError(job.error || 'Genre search failed')
    },
  })

  const googleUrl = buildGoogleGenreSearchUrl(title, artist)
  const searchIcon = tunebook && tunebook.icons ? tunebook.icons.search : null
  const externalLinkIcon = tunebook && tunebook.icons ? tunebook.icons.externallink : null
  const busy = lookup.busy
  const canSearch = !!(title && (tuneId || candidateId))
  const awaitingJob = lookup.activeJob && lookup.activeJob.status === 'awaiting'
    ? lookup.activeJob
    : null
  const awaitingCandidates = searchableSuggestions(awaitingJob)

  useSyncFieldLookupOriginalValue(tuneId, 'genre', currentGenre, awaitingJob)

  function openPicker(candidates) {
    setError('')
    setPickerCandidates(Array.isArray(candidates) ? candidates : [])
    setShowPicker(true)
  }

  function openAwaitingSuggestions() {
    if (awaitingCandidates.length === 0) return
    openPicker(awaitingCandidates)
  }

  useOpenFieldSuggestions(tuneId, 'genre', openAwaitingSuggestions)

  function clearAwaitingSuggestions() {
    lookup.dismiss()
    setShowPicker(false)
    setPickerCandidates([])
  }

  function run(mode) {
    if (!canSearch) return
    if (busy) {
      lookup.cancel()
      return
    }
    if (awaitingCandidates.length > 0) {
      clearAwaitingSuggestions()
    }
    const searchMode = mode === 'review' ? 'review' : 'auto'
    searchModeRef.current = searchMode
    setError('')
    setShowPicker(false)
    setPickerCandidates([])
    lookup.startSearch({
      title: title,
      artist: artist || '',
      tuneName: title,
      options: buildSearchModeOptions(searchMode, {
        rhythm: rhythm || '',
        currentGenre: currentGenre || '',
        backgroundInfo: backgroundInfo || '',
      }),
    })
  }

  const originalValue = resolveOriginalValueForPicker(awaitingJob, currentGenre || '')
  const pickerItems = [
    buildPickerOriginalValueItem({ value: originalValue }),
  ].concat(pickerCandidates.map(function(candidate) {
    return {
      title: candidate.genre,
      artist: candidate.reason || '',
      preview: candidate.genre,
      source: candidate.source || '',
      matchType: candidate.matchType || candidate.reason || '',
    }
  }))

  return renderFieldLookupSearchUi({
    children: children,
    buttonGroup: (
      <>
        <FieldLookupButtonGroup
          automaticLookup={true}
          showExternal={!!(googleUrl && externalLinkIcon)}
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
          defaultMessage="Suggesting genre..."
        />
      </>
    ),
    suggestionsDropdown: null,
    errorNode: error ? <Alert variant="danger" className="mt-2 mb-0">{error}</Alert> : null,
    modals: (
      <SearchResultPickerModal
        show={showPicker}
        title="Choose genre"
        items={pickerItems}
        onSelect={function(item, index) {
          setShowPicker(false)
          setPickerCandidates([])
          if (item && item.__current) {
            return
          }
          const jobId = lookup.activeJob && lookup.activeJob.status === 'awaiting'
            ? lookup.activeJob.id
            : null
          const candidate = pickerCandidates[index - 1] || pickerCandidates.find(function(c) {
            return c && c.genre === item.title
          })
          finishApply(
            candidate || { genre: item.title, source: item.source },
            jobId
          )
        }}
        onHide={function() {
          setShowPicker(false)
          setPickerCandidates([])
        }}
      />
    ),
  })
}
