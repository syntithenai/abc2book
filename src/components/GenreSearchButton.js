import { useRef, useState } from 'react'
import { Alert } from 'react-bootstrap'
import { useFieldLookupSearchJob } from '../useFieldLookupSearchJob'
import { applyFieldLookupChoice, buildSearchModeOptions, dismissFieldLookup } from '../tuneFieldLookupQueue'
import { buildGoogleGenreSearchUrl } from '../genreSearchClient'
import {
  buildPickerOriginalValueItem,
  resolveOriginalValueForPicker,
  searchableSuggestions,
} from '../fieldSuggestionsUtils'
import { useFieldSearchResults } from '../useFieldSearchResults'
import { setFieldSearchResults, targetKeyForFieldSearch } from '../fieldSearchResultCache'
import SearchProgressBar from './SearchProgressBar'
import SearchResultPickerModal from './SearchResultPickerModal'
import { FieldLookupButtonGroup } from './FieldLookupButtonGroup'
import FieldSearchResultsCaret from './FieldSearchResultsCaret'
import { renderFieldLookupSearchUi } from './fieldLookupSearchUi'

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
  const cachedCandidates = useFieldSearchResults(tuneId, candidateId, 'genre')
  const fieldEmpty = !String(currentGenre || '').trim()

  function finishApply(result, jobId) {
    if (jobId) applyFieldLookupChoice(jobId, result)
    if (typeof onGenre === 'function' && result && result.genre) {
      onGenre(result.genre)
    }
  }
  applyRef.current = finishApply

  function openPicker(candidates) {
    setError('')
    setPickerCandidates(Array.isArray(candidates) ? candidates : [])
    setShowPicker(true)
  }

  function closePicker(dismissJob) {
    setShowPicker(false)
    setPickerCandidates([])
    if (dismissJob && lookup.activeJob && lookup.activeJob.status === 'awaiting') {
      dismissFieldLookup(lookup.activeJob.id)
    }
  }

  const lookup = useFieldLookupSearchJob({
    tuneId: tuneId,
    candidateId: candidateId,
    kind: 'genre',
    onAwaiting: function(job) {
      const candidates = searchableSuggestions(job)
      if (job.status === 'done' || (job.appliedCandidate && fieldEmpty)) {
        if (job.appliedCandidate && typeof onGenre === 'function') {
          const genre = String(job.appliedCandidate.genre || '').trim()
          if (genre) onGenre(genre)
        }
        return
      }
      if (candidates.length === 0) {
        return
      }
      const key = targetKeyForFieldSearch(tuneId, candidateId)
      if (key) setFieldSearchResults(key, 'genre', candidates)
      openPicker(candidates)
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

  function run() {
    if (!canSearch) return
    if (busy) {
      lookup.cancel()
      return
    }
    if (awaitingJob) dismissFieldLookup(awaitingJob.id)
    searchModeRef.current = 'auto'
    setError('')
    setShowPicker(false)
    setPickerCandidates([])
    lookup.startSearch({
      title: title,
      artist: artist || '',
      tuneName: title,
      options: buildSearchModeOptions('auto', {
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

  const resultsCaret = (
    <FieldSearchResultsCaret
      candidates={cachedCandidates}
      className="select-input-options-dropdown"
      openPickerOnToggle={true}
      onOpen={openPicker}
      aria-label="Cached genre search results"
      data-testid="genre-search-results-caret"
    />
  )

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
          resultsCaret={resultsCaret}
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
          if (item && item.__current) {
            closePicker(true)
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
          closePicker(!!jobId)
        }}
        onHide={function() {
          closePicker(true)
        }}
      />
    ),
  })
}
