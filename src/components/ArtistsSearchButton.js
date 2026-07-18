import { useRef, useState } from 'react'
import { Alert } from 'react-bootstrap'
import { useFieldLookupSearchJob } from '../useFieldLookupSearchJob'
import {
  applyFieldLookupChoice,
  buildSearchModeOptions,
  dismissFieldLookup,
} from '../tuneFieldLookupQueue'
import { buildGoogleArtistsSearchUrl } from '../artistsSearchClient'
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

export default function ArtistsSearchButton({
  tuneId,
  candidateId,
  title,
  artist,
  existingArtists,
  onAddArtist,
  buttonStyle,
  disabled,
  tunebook,
  inline,
  children,
}) {
  const [error, setError] = useState('')
  const [pickerCandidates, setPickerCandidates] = useState([])
  const [showPicker, setShowPicker] = useState(false)
  const [selectedIndexes, setSelectedIndexes] = useState([])
  const searchModeRef = useRef('auto')
  const applyRef = useRef(null)
  const addedRef = useRef(false)
  const cachedCandidates = useFieldSearchResults(tuneId, candidateId, 'artists')
  const fieldEmpty = !(Array.isArray(existingArtists) && existingArtists.some(function(item) {
    return String(item || '').trim()
  }))

  function finishApply(result, jobId, options) {
    const keepOpen = !!(options && options.keepOpen)
    if (!keepOpen && jobId) applyFieldLookupChoice(jobId, result)
    if (typeof onAddArtist === 'function' && result && result.artist) {
      onAddArtist(result.artist)
      addedRef.current = true
    }
  }
  applyRef.current = finishApply

  function openPicker(candidates) {
    setError('')
    addedRef.current = false
    setSelectedIndexes([])
    setPickerCandidates(Array.isArray(candidates) ? candidates : [])
    setShowPicker(true)
  }

  function closePicker(dismissJob) {
    setShowPicker(false)
    setPickerCandidates([])
    setSelectedIndexes([])
    if (dismissJob && lookup.activeJob && lookup.activeJob.status === 'awaiting') {
      dismissFieldLookup(lookup.activeJob.id)
    }
  }

  const lookup = useFieldLookupSearchJob({
    tuneId: tuneId,
    candidateId: candidateId,
    kind: 'artists',
    onAwaiting: function(job) {
      const candidates = searchableSuggestions(job)
      if (job.status === 'done' || (job.appliedCandidate && fieldEmpty)) {
        if (job.appliedCandidate && typeof onAddArtist === 'function') {
          const name = String(job.appliedCandidate.artist || '').trim()
          if (name) onAddArtist(name)
        }
        return
      }
      if (candidates.length === 0) {
        setError('No artists found')
        return
      }
      const key = targetKeyForFieldSearch(tuneId, candidateId)
      if (key) setFieldSearchResults(key, 'artists', candidates)
      openPicker(candidates)
    },
    onError: function(job) {
      setError(job.error || 'Artists search failed')
    },
  })

  const googleUrl = buildGoogleArtistsSearchUrl(title, artist)
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
    setSelectedIndexes([])
    addedRef.current = false
    lookup.startSearch({
      title: title,
      artist: artist || '',
      tuneName: title,
      options: buildSearchModeOptions('auto', {
        existingArtists: Array.isArray(existingArtists) ? existingArtists : [],
      }),
    })
  }

  const originalValue = resolveOriginalValueForPicker(
    awaitingJob,
    Array.isArray(existingArtists) ? existingArtists : []
  )
  const pickerItems = [
    buildPickerOriginalValueItem({ value: originalValue }),
  ].concat(pickerCandidates.map(function(candidate) {
    const role = candidate.role === 'writer'
      ? 'Writer'
      : (candidate.role === 'performer' ? 'Performer' : '')
    return {
      title: candidate.artist,
      artist: role,
      preview: candidate.preview || candidate.artist,
      source: candidate.source || '',
      matchType: role || candidate.source || '',
    }
  }))

  const resultsCaret = (
    <FieldSearchResultsCaret
      candidates={cachedCandidates}
      className="select-input-options-dropdown"
      openPickerOnToggle={true}
      onOpen={openPicker}
      aria-label="Cached artists search results"
      data-testid="artists-search-results-caret"
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
          defaultMessage="Searching for artists..."
        />
      </>
    ),
    suggestionsDropdown: null,
    errorNode: error ? <Alert variant="danger" className="mt-2 mb-0">{error}</Alert> : null,
    modals: (
      <SearchResultPickerModal
        show={showPicker}
        title="Choose artists to add"
        multiSelect={true}
        selectedIndexes={selectedIndexes}
        items={pickerItems}
        onSelect={function(item, index) {
          if (item && item.__current) return
          let alreadySelected = false
          setSelectedIndexes(function(prev) {
            if (prev.indexOf(index) >= 0) {
              alreadySelected = true
              return prev
            }
            return prev.concat([index])
          })
          if (alreadySelected) return
          finishApply({ artist: item.title, source: item.source }, null, { keepOpen: true })
        }}
        onDone={function() {
          closePicker(true)
        }}
        onHide={function() {
          closePicker(true)
        }}
      />
    ),
  })
}
