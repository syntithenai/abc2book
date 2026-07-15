import { useRef, useState } from 'react'
import { Alert } from 'react-bootstrap'
import useMediaResolverHealth from '../useMediaResolverHealth'
import { useFieldLookupSearchJob } from '../useFieldLookupSearchJob'
import { applyFieldLookupChoice, buildSearchModeOptions } from '../tuneFieldLookupQueue'
import SearchProgressBar from './SearchProgressBar'
import SearchResultPickerModal from './SearchResultPickerModal'
import GenreSuggestionOffer from './GenreSuggestionOffer'
import { FieldLookupButtonGroup } from './FieldLookupButtonGroup'
import { buildSuggestionsDropdown, renderFieldLookupSearchUi } from './fieldLookupSearchUi'
import {
  buildGenreSearchContext,
  inferGenreFromSearchContext,
  shouldOfferGenreSuggestion,
} from '../genreInference'
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
  const [error, setError] = useState('')
  const [pickerCandidates, setPickerCandidates] = useState([])
  const [showPicker, setShowPicker] = useState(false)
  const [genreSuggestion, setGenreSuggestion] = useState(null)
  const { available: resolverAvailableFromHealth } = useMediaResolverHealth()
  const resolverAvailable = typeof resolverAvailableProp === 'boolean'
    ? resolverAvailableProp
    : resolverAvailableFromHealth
  const applyRef = useRef(null)

  function finishApply(result, jobId) {
    // Review-mode applyFieldLookupChoice defers saving to the form callback.
    if (jobId) applyFieldLookupChoice(jobId, result)
    if (typeof onNotation === 'function') onNotation(result)
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
      if (candidates.length === 0) {
        setError('No notation found for this song')
        return
      }
      // Always open the gallery picker. FieldLookupReviewButton remains as a
      // fallback if the user dismisses without choosing.
      setPickerCandidates(candidates)
      setShowPicker(true)
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
  const awaitingCandidates = awaitingJob && Array.isArray(awaitingJob.candidates)
    ? awaitingJob.candidates
    : []

  function openAwaitingPicker(job) {
    const candidates = job && Array.isArray(job.candidates) ? job.candidates : []
    if (candidates.length === 0) return false
    setError('')
    setPickerCandidates(candidates)
    setShowPicker(true)
    return true
  }

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
    // New Search clears prior suggestions for this kind.
    if (lookup.activeJob && lookup.activeJob.status === 'awaiting') {
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
          onClearSuggestions={clearAwaitingSuggestions}
          onOpenSuggestions={function() { openAwaitingPicker(awaitingJob) }}
        />
        <SearchProgressBar
          visible={busy}
          percent={lookup.progressPercent}
          message={lookup.progressMessage}
          defaultMessage="Searching for notation..."
        />
      </>
    ),
    suggestionsDropdown: buildSuggestionsDropdown({
      items: awaitingCandidates,
      onClear: clearAwaitingSuggestions,
      onSelect: function(candidate) {
        const jobId = lookup.activeJob && lookup.activeJob.status === 'awaiting'
          ? lookup.activeJob.id
          : null
        finishApply(candidate, jobId)
      },
      getLabel: function(candidate) {
        const t = candidate && (candidate.title || title) ? (candidate.title || title) : 'Notation'
        const src = candidate && candidate.source ? candidate.source : ''
        return src ? (t + ' · ' + src) : t
      },
    }),
    errorNode: (
      <>
        {error ? <Alert variant="danger" className="mt-2 mb-0">{error}</Alert> : null}
        <GenreSuggestionOffer
          suggestion={genreSuggestion}
          onAccept={function(genre) {
            if (typeof onGenreAccept === 'function') onGenreAccept(genre)
            setGenreSuggestion(null)
          }}
          onDismiss={function() { setGenreSuggestion(null) }}
        />
      </>
    ),
    modals: (
      <SearchResultPickerModal
        show={showPicker}
        title="Choose notation"
        layout="notation"
        items={pickerCandidates.map(function(candidate) {
          return {
            title: candidate.title || title,
            artist: candidate.artist || artist || '',
            preview: candidate.preview || candidate.abc || '',
            abc: candidate.abc || candidate.preview || '',
            source: candidate.source || '',
            sourceUrl: candidate.sourceUrl || '',
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
    ),
  })
}
