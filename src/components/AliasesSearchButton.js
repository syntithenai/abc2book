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
import SearchProgressBar from './SearchProgressBar'
import SearchResultPickerModal from './SearchResultPickerModal'
import { FieldLookupButtonGroup } from './FieldLookupButtonGroup'

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

  function finishApply(result, jobId, options) {
    const keepOpen = !!(options && options.keepOpen)
    if (!keepOpen && jobId) applyFieldLookupChoice(jobId, result)
    if (typeof onAddAlias === 'function' && result && result.alias) {
      onAddAlias(result.alias)
      addedRef.current = true
    }
  }
  applyRef.current = finishApply

  const lookup = useFieldLookupSearchJob({
    tuneId: tuneId,
    candidateId: candidateId,
    kind: 'aliases',
    onAwaiting: function(job) {
      const candidates = Array.isArray(job.candidates) ? job.candidates : []
      if (searchModeRef.current === 'review') {
        if (candidates.length === 0) {
          setError('No aliases found')
          return
        }
        addedRef.current = false
        setSelectedIndexes([])
        setPickerCandidates(candidates)
        setShowPicker(true)
        return
      }
      if (candidates.length >= 1) {
        applyRef.current(candidates[0], job.id)
        return
      }
      setError('No aliases found')
    },
    onError: function(job) {
      setError(job.error || 'Alias search failed')
    },
  })

  const sessionUrl = buildTheSessionAliasesSearchUrl(title)
  const googleUrl = buildGoogleAliasesSearchUrl(title, artist)
  const externalUrl = resolverAvailable ? sessionUrl : googleUrl
  const searchIcon = tunebook && tunebook.icons ? tunebook.icons.search : null
  const externalLinkIcon = tunebook && tunebook.icons ? tunebook.icons.externallink : null
  const busy = lookup.busy
  const canSearch = !!(title && (tuneId || candidateId))

  function closePicker(dismissJob) {
    const jobId = lookup.activeJob && lookup.activeJob.status === 'awaiting'
      ? lookup.activeJob.id
      : null
    setShowPicker(false)
    setPickerCandidates([])
    setSelectedIndexes([])
    if (dismissJob && jobId) dismissFieldLookup(jobId)
  }

  function run(mode) {
    if (!canSearch) return
    if (busy) {
      lookup.cancel()
      return
    }
    const searchMode = mode === 'review' ? 'review' : 'auto'
    searchModeRef.current = searchMode
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
      options: buildSearchModeOptions(searchMode, {
        existingAliases: Array.isArray(existingAliases) ? existingAliases : [],
      }),
      searchOptions: {
        resolverAvailable: resolverAvailable,
      },
    })
  }

  return (
    <>
      <FieldLookupButtonGroup
        automaticLookup={true}
        busy={busy}
        disabled={!canSearch || disabled}
        externalUrl={externalUrl}
        externalLinkIcon={externalLinkIcon}
        onSearch={run}
        buttonStyle={buttonStyle}
        searchIcon={searchIcon}
        inline={inline}
      />
      <SearchProgressBar
        visible={busy}
        percent={lookup.progressPercent}
        message={lookup.progressMessage}
        defaultMessage="Searching for aliases..."
      />
      {error ? <Alert variant="danger" className="mt-2 mb-0">{error}</Alert> : null}
      <SearchResultPickerModal
        show={showPicker}
        title="Choose aliases to add"
        multiSelect={true}
        selectedIndexes={selectedIndexes}
        items={pickerCandidates.map(function(candidate) {
          return {
            title: candidate.alias,
            artist: '',
            preview: candidate.preview || candidate.alias,
            source: candidate.source || '',
          }
        })}
        onSelect={function(item, index) {
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
          closePicker(addedRef.current)
        }}
        onHide={function() {
          closePicker(addedRef.current)
        }}
      />
    </>
  )
}
