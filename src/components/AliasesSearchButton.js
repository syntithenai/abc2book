import { useRef, useState } from 'react'
import { Alert } from 'react-bootstrap'
import useMediaResolverHealth from '../useMediaResolverHealth'
import { useFieldLookupSearchJob } from '../useFieldLookupSearchJob'
import {
  applyFieldLookupChoice,
  buildSearchModeOptions,
  dismissFieldLookup,
} from '../tuneFieldLookupQueue'
import {
  buildGoogleAliasesSearchUrl,
  buildTheSessionAliasesSearchUrl,
} from '../aliasesSearchClient'
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

export default function AliasesSearchButton({
  tuneId,
  candidateId,
  title,
  artist,
  existingAliases,
  onAddAlias,
  buttonStyle,
  disabled,
  tunebook,
  resolverAvailable: resolverAvailableProp,
  token,
  inline,
  children,
}) {
  const [error, setError] = useState('')
  const [pickerCandidates, setPickerCandidates] = useState([])
  const [showPicker, setShowPicker] = useState(false)
  const [selectedIndexes, setSelectedIndexes] = useState([])
  const { available: resolverAvailableFromHealth } = useMediaResolverHealth()
  const resolverAvailable = typeof resolverAvailableProp === 'boolean'
    ? resolverAvailableProp
    : resolverAvailableFromHealth
  const searchModeRef = useRef('auto')
  const applyRef = useRef(null)
  const addedRef = useRef(false)
  const cachedCandidates = useFieldSearchResults(tuneId, candidateId, 'aliases')
  const fieldEmpty = !(Array.isArray(existingAliases) && existingAliases.some(function(item) {
    return String(item || '').trim()
  }))

  function finishApply(result, jobId, options) {
    const keepOpen = !!(options && options.keepOpen)
    if (!keepOpen && jobId) applyFieldLookupChoice(jobId, result)
    if (typeof onAddAlias === 'function' && result && result.alias) {
      onAddAlias(result.alias)
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
    kind: 'aliases',
    onAwaiting: function(job) {
      const candidates = searchableSuggestions(job)
      if (job.status === 'done' || (job.appliedCandidate && fieldEmpty)) {
        if (job.appliedCandidate && typeof onAddAlias === 'function') {
          const alias = String(job.appliedCandidate.alias || '').trim()
          if (alias) onAddAlias(alias)
        }
        return
      }
      if (candidates.length === 0) {
        setError('No aliases found')
        return
      }
      const key = targetKeyForFieldSearch(tuneId, candidateId)
      if (key) setFieldSearchResults(key, 'aliases', candidates)
      openPicker(candidates)
    },
    onError: function(job) {
      setError(job.error || 'Alias search failed')
    },
  })

  const sessionUrl = buildTheSessionAliasesSearchUrl(title)
  const googleUrl = buildGoogleAliasesSearchUrl(title, artist)
  const externalUrl = googleUrl || sessionUrl
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
      accessToken: token,
      options: buildSearchModeOptions('auto', {
        existingAliases: Array.isArray(existingAliases) ? existingAliases : [],
      }),
      searchOptions: {
        resolverAvailable: resolverAvailable,
      },
    })
  }

  const originalValue = resolveOriginalValueForPicker(
    awaitingJob,
    Array.isArray(existingAliases) ? existingAliases : []
  )
  const pickerItems = [
    buildPickerOriginalValueItem({ value: originalValue }),
  ].concat(pickerCandidates.map(function(candidate) {
    return {
      title: candidate.alias,
      artist: '',
      preview: candidate.preview || candidate.alias,
      source: candidate.source || '',
      matchType: candidate.source || '',
    }
  }))

  const resultsCaret = (
    <FieldSearchResultsCaret
      candidates={cachedCandidates}
      className="select-input-options-dropdown"
      openPickerOnToggle={true}
      onOpen={openPicker}
      aria-label="Cached aliases search results"
      data-testid="aliases-search-results-caret"
    />
  )

  return renderFieldLookupSearchUi({
    children: children,
    buttonGroup: (
      <>
        <FieldLookupButtonGroup
          automaticLookup={true}
          showExternal={!!(externalUrl && externalLinkIcon)}
          busy={busy}
          disabled={!canSearch || disabled}
          externalUrl={externalUrl}
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
          defaultMessage="Searching for aliases..."
        />
      </>
    ),
    suggestionsDropdown: null,
    errorNode: error ? <Alert variant="danger" className="mt-2 mb-0">{error}</Alert> : null,
    modals: (
      <SearchResultPickerModal
        show={showPicker}
        title="Choose aliases to add"
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
          finishApply({ alias: item.title, source: item.source }, null, { keepOpen: true })
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
