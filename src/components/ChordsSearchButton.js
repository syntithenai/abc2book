import { useRef, useState } from 'react'
import { Alert, ButtonGroup, ToggleButton } from 'react-bootstrap'
import useMediaResolverHealth from '../useMediaResolverHealth'
import useAbcjsParser from '../useAbcjsParser'
import { buildGoogleChordsSearchUrl } from '../chordSearchSites'
import { useFieldLookupSearchJob } from '../useFieldLookupSearchJob'
import { applyFieldLookupChoice } from '../tuneFieldLookupQueue'
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

export default function ChordsSearchButton({
  tuneId,
  candidateId,
  title,
  artist,
  rhythm,
  currentGenre,
  onGenreAccept,
  token,
  onChords,
  onLyrics,
  extraQuery,
  buttonStyle,
  disabled,
  showLyricsCheckbox = true,
  defaultUpdateLyrics = true,
  tunebook,
  book,
  resolverAvailable: resolverAvailableProp,
}) {
  const [error, setError] = useState('')
  const [source, setSource] = useState('')
  const [updateLyrics, setUpdateLyrics] = useState(defaultUpdateLyrics)
  const [pickerCandidates, setPickerCandidates] = useState([])
  const [showPicker, setShowPicker] = useState(false)
  const [genreSuggestion, setGenreSuggestion] = useState(null)
  const [manualCandidates, setManualCandidates] = useState([])
  const [lockedModalCandidate, setLockedModalCandidate] = useState(null)
  const { available: resolverAvailableFromHealth } = useMediaResolverHealth()
  const abcjsParser = useAbcjsParser({ tunebook: tunebook })
  const resolverAvailable = typeof resolverAvailableProp === 'boolean'
    ? resolverAvailableProp
    : resolverAvailableFromHealth
  const hasLocalChordSearch = !!(tunebook && tunebook.abcTools)
  const automaticLookup = resolverAvailable || hasLocalChordSearch
  const updateLyricsRef = useRef(updateLyrics)
  updateLyricsRef.current = updateLyrics
  const applyRef = useRef(null)

  function finishApply(result, jobId) {
    if (jobId) applyFieldLookupChoice(jobId, result)
    if (typeof onChords === 'function') onChords(result)
    if (updateLyricsRef.current && typeof onLyrics === 'function') {
      onLyrics({
        lines: result.lyricLines,
        text: result.lyricText,
        source: result.source,
        sourceUrl: result.sourceUrl,
      })
    }
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
    kind: 'chords',
    onAwaiting: function(job) {
      if (Array.isArray(job.manualCandidates) && job.manualCandidates.length > 0
        && (!job.candidates || job.candidates.length === 0)) {
        setManualCandidates(job.manualCandidates)
        return
      }
      const candidates = Array.isArray(job.candidates) ? job.candidates : []
      if (candidates.length === 1) {
        applyRef.current(candidates[0], job.id)
        return
      }
      if (candidates.length > 1) {
        setPickerCandidates(candidates)
        setShowPicker(true)
        return
      }
      setError('No chords found for this song')
    },
    onError: function(job) {
      setError(job.error || 'Chords search failed')
    },
  })

  const googleUrl = buildGoogleChordsSearchUrl(title, artist, extraQuery)
  const externalLinkIcon = tunebook && tunebook.icons ? tunebook.icons.externallink : null
  const busy = lookup.busy
  const canSearch = !!(title && (tuneId || candidateId))

  function chooseChordCandidate(candidate) {
    setShowPicker(false)
    setPickerCandidates([])
    const jobId = lookup.activeJob && lookup.activeJob.status === 'awaiting'
      ? lookup.activeJob.id
      : null
    finishApply(candidate, jobId)
  }

  function run() {
    if (!canSearch) return
    if (busy) {
      lookup.cancel()
      return
    }
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
      options: { updateLyrics: updateLyrics },
      searchOptions: {
        resolverAvailable: resolverAvailable,
        abcTools: tunebook && tunebook.abcTools ? tunebook.abcTools : null,
        renderChords: function(abc) { return abcjsParser.renderChords(abc, true) },
      },
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
      <ButtonGroup>
        <FieldLookupButtonGroup
          automaticLookup={automaticLookup}
          busy={busy}
          disabled={!canSearch || disabled}
          externalUrl={googleUrl}
          externalLinkIcon={externalLinkIcon}
          narrow={false}
          inline={true}
          onSearch={run}
          buttonStyle={buttonStyle}
          tunebook={tunebook}
        />
        {showLyricsCheckbox && automaticLookup && (
          <ToggleButton
            id="chords-search-update-lyrics"
            type="checkbox"
            variant="outline-secondary"
            value="update-lyrics"
            checked={updateLyrics}
            disabled={busy}
            onChange={function(e) { setUpdateLyrics(e.currentTarget.checked) }}
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              aria-hidden="true"
              style={{ verticalAlign: 'text-bottom', marginRight: '0.35em', opacity: updateLyrics ? 1 : 0.4 }}
            >
              <path fill="none" d="M0 0h24v24H0z" />
              {updateLyrics
                ? <path fill="currentColor" d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14zm-2.05 5.536L10.586 14.9l-2.829-2.828-1.414 1.414 4.243 4.243 7.778-7.778-1.414-1.414z" />
                : <path fill="currentColor" d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm0 2v14h14V5H5z" />}
            </svg>
            Update lyrics
          </ToggleButton>
        )}
      </ButtonGroup>
      <SearchProgressBar
        visible={busy}
        percent={lookup.progressPercent}
        message={lookup.progressMessage}
        defaultMessage="Searching for chords..."
      />
      {error && (
        <Alert variant="danger" style={{ marginTop: '0.75em', clear: 'both' }}>
          {error}
          {error.indexOf('Ultimate Guitar blocks automated access') >= 0 ? (
            <div style={{ marginTop: '0.5em' }}>
              Use <strong>Paste chord sheet</strong> in the chord editor to import copied Ultimate Guitar text.
            </div>
          ) : null}
          {error.indexOf('No chord sheet found in local collections') >= 0 ? (
            <div style={{ marginTop: '0.5em' }}>
              Ultimate Guitar and similar sites need the media resolver, or paste the chord sheet manually.
            </div>
          ) : null}
          {(resolverAvailable || error.indexOf('Could not reach') >= 0 || error === 'Network Error') && (
            <div style={{ marginTop: '0.5em' }}>
              <a target="_blank" rel="noreferrer" href={googleUrl}>Open web search instead</a>
              {error.indexOf('Could not reach') >= 0 || error === 'Network Error' ? (
                <span> — or start the local resolver with <code>cd local-resolver &amp;&amp; docker compose up</code></span>
              ) : null}
            </div>
          )}
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
          Chords imported from {source}
          {showLyricsCheckbox && updateLyrics ? ' with synced lyrics.' : '.'}
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
        title="Choose chord sheet"
        items={pickerCandidates}
        fallbackTitle={title}
        emptyMessage="No chord sheets were found."
        onSelect={chooseChordCandidate}
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
