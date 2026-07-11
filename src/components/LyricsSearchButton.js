import { useState } from 'react'
import { Alert } from 'react-bootstrap'
import { useIsNarrowViewport } from '../useMediaQuery'
import useAbcjsParser from '../useAbcjsParser'
import { searchLyrics } from '../lyricsSearchClient'
import { useCancellableAsyncJob } from '../useCancellableAsyncJob'
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
}) {
  const narrow = useIsNarrowViewport()
  const job = useCancellableAsyncJob('Lyrics search')
  const abcjsParser = useAbcjsParser({ tunebook: tunebook })
  const [error, setError] = useState('')
  const [source, setSource] = useState('')
  const [progressMessage, setProgressMessage] = useState('')
  const [progressPercent, setProgressPercent] = useState(0)
  const [pickerCandidates, setPickerCandidates] = useState([])
  const [showPicker, setShowPicker] = useState(false)
  const [genreSuggestion, setGenreSuggestion] = useState(null)
  const [manualCandidates, setManualCandidates] = useState([])
  const [lockedModalCandidate, setLockedModalCandidate] = useState(null)

  const googleUrl = buildGoogleLyricsSearchUrl(title, artist, extraQuery)
  const searchIcon = tunebook && tunebook.icons ? tunebook.icons.search : null
  const externalLinkIcon = showExternalLink && tunebook && tunebook.icons
    ? tunebook.icons.externallink
    : null
  const busy = job.busy

  function applyLyricsResult(result) {
    if (typeof onLyrics === 'function') {
      onLyrics(result)
    }
    const sourceLabel = result.source
      ? (result.sourceUrl ? result.source + ' (' + result.sourceUrl + ')' : result.source)
      : ''
    setSource(sourceLabel)
    setProgressPercent(100)
    if (typeof onGenreAccept === 'function') {
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

  function chooseLyricsCandidate(candidate) {
    setShowPicker(false)
    setPickerCandidates([])
    applyLyricsResult(candidate)
  }

  async function run() {
    if (!title) return
    const ctx = job.begin()
    setError('')
    setSource('')
    setManualCandidates([])
    setLockedModalCandidate(null)
    setProgressMessage('')
    setProgressPercent(0)
    try {
      const result = await searchLyrics({
        title: title,
        artist: artist || '',
        accessToken: token,
        signal: ctx.signal,
        resolverAvailable: resolverAvailable,
        abcTools: tunebook && tunebook.abcTools ? tunebook.abcTools : null,
        onProgress: function(message, progress) {
          if (!ctx.isCurrent()) return
          setProgressMessage(message || '')
          if (typeof progress === 'number' && Number.isFinite(progress)) {
            setProgressPercent(Math.max(0, Math.min(100, Math.round(progress * 100))))
          }
        },
      })
      if (!ctx.isCurrent()) return
      if (result.empty && Array.isArray(result.manualCandidates) && result.manualCandidates.length > 0) {
        setManualCandidates(result.manualCandidates)
        return
      }
      if (result.multiple && Array.isArray(result.candidates)) {
        if (result.candidates.length === 1) {
          applyLyricsResult(result.candidates[0])
        } else {
          setPickerCandidates(result.candidates)
          setShowPicker(true)
        }
      } else if (!result.empty) {
        applyLyricsResult(result)
      } else {
        setError('No lyrics found for this song')
      }
    } catch (e) {
      if (job.isAbortError(e)) return
      setError(e && e.message ? e.message : 'Lyrics search failed')
    } finally {
      job.finish(ctx.generation)
      if (ctx.isCurrent()) {
        setProgressMessage('')
      }
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
      <FieldLookupButtonGroup
        automaticLookup={true}
        busy={busy}
        disabled={!title || disabled}
        externalUrl={googleUrl}
        externalLinkIcon={externalLinkIcon}
        narrow={narrow}
        onSearch={function() { job.onTriggerClick(run) }}
        buttonStyle={buttonStyle}
        searchIcon={searchIcon}
      />
      <SearchProgressBar
        visible={busy}
        percent={progressPercent}
        message={progressMessage}
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
