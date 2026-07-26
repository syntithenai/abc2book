import { useRef, useState } from 'react'
import { Alert } from 'react-bootstrap'
import { useFieldLookupSearchJob } from '../useFieldLookupSearchJob'
import { useFieldLookupResolverAccess } from '../fieldLookupResolverAccess'
import {
  applyFieldLookupChoice,
  buildSearchModeOptions,
  dismissFieldLookup,
} from '../tuneFieldLookupQueue'
import { buildGoogleAlbumsSearchUrl } from '../albumsSearchClient'
import { mergeBibliographicList } from '../tuneBibliographicUtils'
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

function normalizeAlbums(value) {
  if (!Array.isArray(value)) return []
  return value.map(function(item) {
    return String(item || '').trim()
  }).filter(Boolean)
}

function albumPickerMeta(candidate) {
  const parts = []
  if (candidate && candidate.matchType) parts.push(String(candidate.matchType))
  if (candidate && candidate.performer) parts.push(String(candidate.performer))
  return parts.join(' · ')
}

export default function AlbumsSearchButton({
  tuneId,
  candidateId,
  title,
  artist,
  performers,
  currentAlbums,
  onSetAlbums,
  buttonStyle,
  disabled,
  token,
  tunebook,
  inline,
  children,
}) {
  const [error, setError] = useState('')
  const [pickerCandidates, setPickerCandidates] = useState([])
  const [showPicker, setShowPicker] = useState(false)
  const [selectedIndexes, setSelectedIndexes] = useState([])
  const searchModeRef = useRef('auto')
  const addedRef = useRef(false)
  const albums = normalizeAlbums(currentAlbums)
  const resolverAccess = useFieldLookupResolverAccess(token)
  const automaticLookup = resolverAccess.automaticLookupFor('albums')
  const cachedCandidates = useFieldSearchResults(tuneId, candidateId, 'albums')
  const fieldEmpty = albums.length === 0

  function applyAlbums(nextAlbums) {
    if (typeof onSetAlbums === 'function') {
      onSetAlbums(mergeBibliographicList(albums, nextAlbums))
    }
  }

  function finishApply(result, jobId, options) {
    const keepOpen = !!(options && options.keepOpen)
    const album = result && (result.album || result.preview)
    if (!album) return
    if (!keepOpen && jobId) applyFieldLookupChoice(jobId, result)
    applyAlbums([String(album).trim()])
    addedRef.current = true
  }

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
    kind: 'albums',
    onAwaiting: function(job) {
      const candidates = searchableSuggestions(job)
      if (job.status === 'done' || (job.appliedCandidate && fieldEmpty)) {
        if (job.appliedCandidate) {
          const appliedAlbum = String(job.appliedCandidate.album || job.appliedCandidate.preview || '').trim()
          if (appliedAlbum) applyAlbums([appliedAlbum])
        }
        return
      }
      if (candidates.length === 0) {
        setError('No albums found for this song.')
        return
      }
      const key = targetKeyForFieldSearch(tuneId, candidateId)
      if (key) setFieldSearchResults(key, 'albums', candidates)
      openPicker(candidates)
    },
    onError: function(job) {
      setError(job.error || 'Album search failed')
    },
  })

  const googleUrl = buildGoogleAlbumsSearchUrl(title, artist)
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
        performers: Array.isArray(performers) ? performers : [],
      }),
    })
  }

  const originalValue = resolveOriginalValueForPicker(awaitingJob, albums.join(', '))
  const pickerItems = [
    buildPickerOriginalValueItem({ value: originalValue }),
  ].concat(pickerCandidates.map(function(candidate) {
    return {
      title: candidate.album,
      artist: albumPickerMeta(candidate),
      preview: candidate.preview || candidate.album,
      source: candidate.source || '',
      matchType: candidate.matchType || candidate.confidence || '',
    }
  }))

  const resultsCaret = (
    <FieldSearchResultsCaret
      candidates={cachedCandidates}
      className="select-input-options-dropdown"
      openPickerOnToggle={true}
      onOpen={openPicker}
      aria-label="Cached album search results"
      data-testid="albums-search-results-caret"
    />
  )

  return renderFieldLookupSearchUi({
    children: children,
    buttonGroup: (
      <>
        <FieldLookupButtonGroup
          automaticLookup={automaticLookup}
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
          defaultMessage="Searching albums…"
        />
      </>
    ),
    suggestionsDropdown: null,
    errorNode: error ? <Alert variant="danger" className="mt-2 mb-0">{error}</Alert> : null,
    modals: (
      <SearchResultPickerModal
        show={showPicker}
        title="Choose albums to add"
        comment="High-confidence matches may already be applied. Review match details before adding uncertain results."
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
          const candidate = pickerCandidates[index - 1] || pickerCandidates.find(function(c) {
            return c && c.album === item.title
          })
          finishApply(candidate || { album: item.title, source: item.source }, null, { keepOpen: true })
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
