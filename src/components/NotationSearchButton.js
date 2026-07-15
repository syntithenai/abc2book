import { useRef, useState } from 'react'
import { Alert } from 'react-bootstrap'
import useMediaResolverHealth from '../useMediaResolverHealth'
import { useFieldLookupSearchJob } from '../useFieldLookupSearchJob'
import { applyFieldLookupChoice, buildSearchModeOptions } from '../tuneFieldLookupQueue'
import SearchProgressBar from './SearchProgressBar'
import SearchResultPickerModal from './SearchResultPickerModal'
import GenreSuggestionOffer from './GenreSuggestionOffer'
import { FieldLookupButtonGroup } from './FieldLookupButtonGroup'
import {
  buildGenreSearchContext,
  inferGenreFromSearchContext,
  shouldOfferGenreSuggestion,
} from '../genreInference'

export default function NotationSearchButton({
  tuneId,
  candidateId,
  title,
  artist,
  rhythm,
  currentGenre,
  onGenreAccept,
  token,
  onNotation,
  buttonStyle,
  disabled,
  tunebook,
  resolverAvailable: resolverAvailableProp,
  inline,
  songType,
}) {
  const [error, setError] = useState('')
  const [source, setSource] = useState('')
  const [pickerCandidates, setPickerCandidates] = useState([])
  const [showPicker, setShowPicker] = useState(false)
  const [genreSuggestion, setGenreSuggestion] = useState(null)
  const { available: resolverAvailableFromHealth } = useMediaResolverHealth()
  const resolverAvailable = typeof resolverAvailableProp === 'boolean'
    ? resolverAvailableProp
    : resolverAvailableFromHealth
  const searchModeRef = useRef('auto')
  const applyRef = useRef(null)

  function finishApply(result, jobId) {
    if (jobId) applyFieldLookupChoice(jobId, result)
    if (typeof onNotation === 'function') onNotation(result)
    setSource(result && result.source ? result.source : '')
    if (typeof onGenreAccept === 'function' && result) {
      const inferred = inferGenreFromSearchContext(buildGenreSearchContext(result, {
        title: title,
        artist: artist,
        rhythm: rhythm,
      }))
      if (inferred && shouldOfferGenreSuggestion(inferred.genre, currentGenre)) {
        setGenreSuggestion(inferred)
      } else {
        setGenreSuggestion(null)
      }
    }
  }
  applyRef.current = finishApply

  const lookup = useFieldLookupSearchJob({
    tuneId: tuneId,
    candidateId: candidateId,
    kind: 'notation',
    onAwaiting: function(job) {
      const candidates = Array.isArray(job.candidates) ? job.candidates : []
      if (searchModeRef.current === 'review') {
        if (candidates.length === 0) {
          setError('No notation found for this song')
          return
        }
        setPickerCandidates(candidates)
        setShowPicker(true)
        return
      }
      if (candidates.length >= 1) {
        applyRef.current(candidates[0], job.id)
        return
      }
      setError('No notation found for this song')
    },
    onError: function(job) {
      setError(job.error || 'Notation search failed')
    },
  })

  const googleUrl = 'https://www.google.com/search?q='
    + encodeURIComponent([title, artist, 'abc notation'].filter(Boolean).join(' '))
  const searchIcon = tunebook && tunebook.icons ? tunebook.icons.search : null
  const externalLinkIcon = tunebook && tunebook.icons ? tunebook.icons.externallink : null
  const busy = lookup.busy
  const canSearch = !!(title && (tuneId || candidateId))

  function run(mode) {
    if (!canSearch) return
    if (busy) {
      lookup.cancel()
      return
    }
    const searchMode = mode === 'review' ? 'review' : 'auto'
    searchModeRef.current = searchMode
    setError('')
    setSource('')
    setShowPicker(false)
    setPickerCandidates([])
    lookup.startSearch({
      title: title,
      artist: artist || '',
      tuneName: title,
      accessToken: token,
      options: buildSearchModeOptions(searchMode, { songType: songType }),
      searchOptions: {
        resolverAvailable: resolverAvailable,
        abcTools: tunebook && tunebook.abcTools ? tunebook.abcTools : null,
      },
    })
  }

  return (
    <>
      <FieldLookupButtonGroup
        automaticLookup={true}
        busy={busy}
        disabled={!canSearch || disabled}
        externalUrl={googleUrl}
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
        defaultMessage="Searching for notation..."
      />
      {error ? <Alert variant="danger" className="mt-2 mb-0">{error}</Alert> : null}
      {source && !error ? (
        <Alert variant="success" className="mt-2 mb-0">Notation from {source}</Alert>
      ) : null}
      <GenreSuggestionOffer
        suggestion={genreSuggestion}
        onAccept={function(genre) {
          if (typeof onGenreAccept === 'function') onGenreAccept(genre)
          setGenreSuggestion(null)
        }}
        onDismiss={function() { setGenreSuggestion(null) }}
      />
      <SearchResultPickerModal
        show={showPicker}
        title="Choose notation"
        items={pickerCandidates.map(function(candidate) {
          return {
            title: candidate.title || title,
            artist: candidate.artist || artist || '',
            preview: candidate.preview || candidate.abc || '',
            source: candidate.source || '',
          }
        })}
        onSelect={function(item, index) {
          const candidate = pickerCandidates[index] || pickerCandidates.find(function(c) {
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
    </>
  )
}
