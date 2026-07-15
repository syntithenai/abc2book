import { useRef, useState } from 'react'
import { Alert } from 'react-bootstrap'
import { useIsNarrowViewport } from '../useMediaQuery'
import useAbcjsParser from '../useAbcjsParser'
import { useFieldLookupSearchJob } from '../useFieldLookupSearchJob'
import { applyFieldLookupChoice, buildSearchModeOptions } from '../tuneFieldLookupQueue'
import SearchProgressBar from './SearchProgressBar'
import SearchResultPickerModal from './SearchResultPickerModal'
import GenreSuggestionOffer from './GenreSuggestionOffer'
import ManualCandidatesFeedback from './ManualCandidatesFeedback'
import LockedSourcePasteModal from './LockedSourcePasteModal'
import { FieldLookupButtonGroup } from './FieldLookupButtonGroup'
import {
  buildGenreSearchContext,
  inferGenreFromSearchContext,
  shouldOfferGenreSuggestion,
} from '../genreInference'

export function buildGoogleLyricsSearchUrl(title, artist, extraQuery) {
  return 'https://www.google.com/search?q=lyrics '
    + (title || '')
    + ' '
    + (artist || '')
    + (extraQuery ? ' ' + extraQuery : '')
}

export default function LyricsSearchButton({
  tuneId,
  candidateId,
  title,
  artist,
  rhythm,
  currentGenre,
  onGenreAccept,
  token,
  onLyrics,
  extraQuery,
  buttonStyle,
  disabled,
  tunebook,
  book,
  showExternalLink = true,
  resolverAvailable,
  existingLyrics,
}) {
  const narrow = useIsNarrowViewport()
  const abcjsParser = useAbcjsParser({ tunebook: tunebook })
  const [error, setError] = useState('')
  const [source, setSource] = useState('')
  const [pickerCandidates, setPickerCandidates] = useState([])
  const [showPicker, setShowPicker] = useState(false)
  const [genreSuggestion, setGenreSuggestion] = useState(null)
  const [manualCandidates, setManualCandidates] = useState([])
  const [lockedModalCandidate, setLockedModalCandidate] = useState(null)
  const existingLyricsRef = useRef(existingLyrics)
  existingLyricsRef.current = existingLyrics
  const searchModeRef = useRef('auto')
  const applyRef = useRef(null)

  function finishApply(result, jobId) {
    if (jobId) applyFieldLookupChoice(jobId, result)
    if (typeof onLyrics === 'function') onLyrics(result)
    const sourceLabel = result && result.source
      ? (result.sourceUrl ? result.source + ' (' + result.sourceUrl + ')' : result.source)
      : ''
    setSource(sourceLabel)
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
    kind: 'lyrics',
    onAwaiting: function(job) {
      if (Array.isArray(job.manualCandidates) && job.manualCandidates.length > 0
        && (!job.candidates || job.candidates.length === 0)) {
        setManualCandidates(job.manualCandidates)
        return
      }
      const candidates = Array.isArray(job.candidates) ? job.candidates : []
      if (searchModeRef.current === 'review') {
        if (candidates.length === 0) {
          setError('No lyrics found for this song')
          return
        }
        setPickerCandidates(candidates)
        setShowPicker(true)
        return
      }
      if (candidates.length >= 1) {
        const existing = String(existingLyricsRef.current || '').trim()
        if (!existing || searchModeRef.current === 'auto') {
          applyRef.current(candidates[0], job.id)
          return
        }
        if (candidates.length > 1) {
          setPickerCandidates(candidates)
          setShowPicker(true)
          return
        }
        return
      }
      setError('No lyrics found for this song')
    },
    onError: function(job) {
      setError(job.error || 'Lyrics search failed')
    },
  })

  const googleUrl = buildGoogleLyricsSearchUrl(title, artist, extraQuery)
  const searchIcon = tunebook && tunebook.icons ? tunebook.icons.search : null
  const externalLinkIcon = showExternalLink && tunebook && tunebook.icons
    ? tunebook.icons.externallink
    : null
  const busy = lookup.busy
  const canSearch = !!(title && (tuneId || candidateId))

  function chooseLyricsCandidate(candidate) {
    setShowPicker(false)
    setPickerCandidates([])
    const jobId = lookup.activeJob && lookup.activeJob.status === 'awaiting'
      ? lookup.activeJob.id
      : null
    finishApply(candidate, jobId)
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
    setSource('')
    setManualCandidates([])
    setLockedModalCandidate(null)
    setShowPicker(false)
    setPickerCandidates([])
    lookup.startSearch({
      title: title,
      artist: artist || '',
      tuneName: title,
      accessToken: token,
      options: buildSearchModeOptions(searchMode),
      searchOptions: {
        resolverAvailable: resolverAvailable,
        abcTools: tunebook && tunebook.abcTools ? tunebook.abcTools : null,
      },
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
      <FieldLookupButtonGroup
        automaticLookup={true}
        busy={busy}
        disabled={!canSearch || disabled}
        externalUrl={googleUrl}
        externalLinkIcon={externalLinkIcon}
        narrow={narrow}
        onSearch={run}
        buttonStyle={buttonStyle}
        searchIcon={searchIcon}
      />
      <SearchProgressBar
        visible={busy}
        percent={lookup.progressPercent}
        message={lookup.progressMessage}
        defaultMessage="Searching for lyrics..."
      />
      {error && (
        <Alert variant="danger" style={{ marginTop: '0.75em', clear: 'both' }}>
          {error}
          <div style={{ marginTop: '0.5em' }}>
            <a target="_blank" rel="noreferrer" href={googleUrl}>Open web search instead</a>
          </div>
        </Alert>
      )}
      <ManualCandidatesFeedback
        message="No importable match found"
        manualCandidates={manualCandidates}
        tunebook={tunebook}
        onSelectCandidate={function(candidate) {
          setLockedModalCandidate(candidate)
        }}
      />
      {source && !error && manualCandidates.length === 0 && (
        <Alert variant="success" style={{ marginTop: '0.75em', clear: 'both' }}>
          Lyrics imported from {source}
        </Alert>
      )}

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
        title="Choose lyrics version"
        items={pickerCandidates}
        fallbackTitle={title}
        emptyMessage="No lyrics versions were found."
        onSelect={chooseLyricsCandidate}
        onHide={function() {
          setShowPicker(false)
          setPickerCandidates([])
        }}
      />

      <LockedSourcePasteModal
        show={!!lockedModalCandidate}
        onHide={function() { setLockedModalCandidate(null) }}
        candidate={lockedModalCandidate}
        searchTitle={title}
        searchArtist={artist}
        tunebook={tunebook}
        abcjsParser={abcjsParser}
        book={book}
        icons={tunebook && tunebook.icons}
      />
    </div>
  )
}
