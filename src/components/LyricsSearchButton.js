import { useRef, useState } from 'react'
import { Alert } from 'react-bootstrap'
import { useIsNarrowViewport } from '../useMediaQuery'
import useAbcjsParser from '../useAbcjsParser'
import { useFieldLookupSearchJob, buildFieldLookupTargetKey } from '../useFieldLookupSearchJob'
import {
  applyFieldLookupChoice,
  buildSearchModeOptions,
  dismissFieldLookup,
  getAwaitingJob,
  getActiveJob,
} from '../tuneFieldLookupQueue'
import SearchProgressBar from './SearchProgressBar'
import SearchResultPickerModal from './SearchResultPickerModal'
import GenreSuggestionOffer from './GenreSuggestionOffer'
import ManualCandidatesFeedback from './ManualCandidatesFeedback'
import LockedSourcePasteModal from './LockedSourcePasteModal'
import { FieldLookupButtonGroup } from './FieldLookupButtonGroup'
import { renderFieldLookupSearchUi } from './fieldLookupSearchUi'
import {
  buildGenreSearchContext,
  inferGenreFromSearchContext,
  shouldOfferGenreSuggestion,
} from '../genreInference'
import { buildExternalSearchQuestion, buildGoogleSearchQuestionUrl } from '../externalSearchLinks'

export function buildGoogleLyricsSearchUrl(title, artist, extraQuery) {
  let question = buildExternalSearchQuestion('lyrics', title, artist)
  if (!question) return ''
  const extra = String(extraQuery || '').trim()
  if (extra) question += ' ' + extra
  return buildGoogleSearchQuestionUrl(question)
}

/**
 * Lyrics search ButtonGroup. On Add/review forms, pass leaveAwaiting + alsoSearchChords
 * to prefer a chords search (usually includes lyrics). If chords find nothing, fall
 * back to a lyrics-only search and quietly skip chord suggestions.
 */
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
  /** Leave jobs awaiting for FieldLookupReviewButton instead of auto/picker apply. */
  leaveAwaiting = false,
  /** Prefer chords search first; fall back to lyrics-only when chords miss. */
  alsoSearchChords = false,
  /** Force Review mode (no Auto dialog). */
  forceReview = false,
  inline,
  children,
}) {
  const narrow = useIsNarrowViewport()
  const abcjsParser = useAbcjsParser({ tunebook: tunebook })
  const [error, setError] = useState('')
  const [pickerCandidates, setPickerCandidates] = useState([])
  const [showPicker, setShowPicker] = useState(false)
  const [genreSuggestion, setGenreSuggestion] = useState(null)
  const [manualCandidates, setManualCandidates] = useState([])
  const [lockedModalCandidate, setLockedModalCandidate] = useState(null)
  const existingLyricsRef = useRef(existingLyrics)
  existingLyricsRef.current = existingLyrics
  const searchModeRef = useRef(forceReview ? 'review' : 'auto')
  const leaveAwaitingRef = useRef(leaveAwaiting)
  leaveAwaitingRef.current = leaveAwaiting
  const alsoSearchChordsRef = useRef(alsoSearchChords)
  alsoSearchChordsRef.current = alsoSearchChords
  const applyRef = useRef(null)
  const lyricsFallbackSpecRef = useRef(null)
  const startLyricsFallbackRef = useRef(null)

  function finishApply(result, jobId) {
    if (jobId && !leaveAwaitingRef.current) applyFieldLookupChoice(jobId, result)
    if (typeof onLyrics === 'function') onLyrics(result)
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

  function fallBackToLyricsSearch() {
    const spec = lyricsFallbackSpecRef.current
    if (!spec || typeof startLyricsFallbackRef.current !== 'function') return
    lyricsFallbackSpecRef.current = null
    startLyricsFallbackRef.current(spec)
  }

  function chordsMissedQuietly(job) {
    if (!alsoSearchChordsRef.current) return false
    // Drop empty chords suggestions so the form does not surface them.
    if (job && job.id && job.status === 'awaiting') {
      dismissFieldLookup(job.id)
    }
    fallBackToLyricsSearch()
    return true
  }

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
      if (leaveAwaitingRef.current) {
        if (candidates.length === 0 && !(job.manualCandidates && job.manualCandidates.length)) {
          setError('No lyrics found for this song')
        }
        return
      }
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
  startLyricsFallbackRef.current = lookup.startSearch

  // Prefer chords when requested; on miss, fall back to lyrics without an error.
  const chordsLookup = useFieldLookupSearchJob({
    tuneId: tuneId,
    candidateId: candidateId,
    kind: 'chords',
    onAwaiting: function(job) {
      if (!alsoSearchChordsRef.current) return
      const candidates = Array.isArray(job.candidates) ? job.candidates : []
      const manuals = Array.isArray(job.manualCandidates) ? job.manualCandidates : []
      if (candidates.length === 0 && manuals.length === 0) {
        chordsMissedQuietly(job)
      }
      // Successful chords results stay awaiting for FieldLookupReviewButton.
    },
    onError: function() {
      if (!alsoSearchChordsRef.current) return
      chordsMissedQuietly(null)
    },
  })

  const googleUrl = buildGoogleLyricsSearchUrl(title, artist, extraQuery)
  const searchIcon = tunebook && tunebook.icons ? tunebook.icons.search : null
  const externalLinkIcon = showExternalLink && tunebook && tunebook.icons
    ? tunebook.icons.externallink
    : null
  const busy = alsoSearchChords
    ? (chordsLookup.busy || lookup.busy)
    : lookup.busy
  const canSearch = !!(title && (tuneId || candidateId))
  const progressPercent = alsoSearchChords
    ? Math.max(chordsLookup.progressPercent || 0, lookup.progressPercent || 0)
    : (lookup.progressPercent || 0)
  const progressMessage = alsoSearchChords
    ? (chordsLookup.busy ? chordsLookup.progressMessage : lookup.progressMessage)
    : lookup.progressMessage
  const awaitingJob = lookup.activeJob && lookup.activeJob.status === 'awaiting'
    ? lookup.activeJob
    : null
  const awaitingCandidates = awaitingJob && Array.isArray(awaitingJob.candidates)
    ? awaitingJob.candidates
    : []

  function chooseLyricsCandidate(candidate) {
    setShowPicker(false)
    setPickerCandidates([])
    const jobId = lookup.activeJob && lookup.activeJob.status === 'awaiting'
      ? lookup.activeJob.id
      : null
    finishApply(candidate, jobId)
  }

  function openAwaitingSuggestions() {
    if (awaitingCandidates.length === 0) return
    setError('')
    setPickerCandidates(awaitingCandidates)
    setShowPicker(true)
  }

  function clearAwaitingSuggestions() {
    lookup.dismiss()
    setShowPicker(false)
    setPickerCandidates([])
  }

  function cancelPriorLookupJobs() {
    lyricsFallbackSpecRef.current = null
    const targetKey = buildFieldLookupTargetKey(tuneId, candidateId)
    if (!targetKey) return
    ;['lyrics', 'chords'].forEach(function(kind) {
      const active = getActiveJob(targetKey, kind) || getAwaitingJob(targetKey, kind)
      if (!active) return
      if (active.status === 'awaiting') {
        dismissFieldLookup(active.id)
        return
      }
      if (kind === 'lyrics') lookup.cancel()
      else if (alsoSearchChords) chordsLookup.cancel()
    })
  }

  function run(mode) {
    if (!canSearch) return
    if (busy) {
      lookup.cancel()
      if (alsoSearchChords) chordsLookup.cancel()
      lyricsFallbackSpecRef.current = null
      return
    }
    // New Search clears prior suggestions for this kind.
    if (awaitingCandidates.length > 0) {
      clearAwaitingSuggestions()
    }
    const searchMode = forceReview || mode === 'review' ? 'review' : 'auto'
    searchModeRef.current = searchMode
    setError('')
    setManualCandidates([])
    setLockedModalCandidate(null)
    setShowPicker(false)
    setPickerCandidates([])
    const searchOptions = {
      resolverAvailable: resolverAvailable,
      abcTools: tunebook && tunebook.abcTools ? tunebook.abcTools : null,
    }
    const lyricsSpec = {
      title: title,
      artist: artist || '',
      tuneName: title,
      accessToken: token,
      options: buildSearchModeOptions(searchMode),
      searchOptions: searchOptions,
    }
    // Prefer chords (usually include lyrics). Fall back to lyrics-only on miss.
    if (alsoSearchChords) {
      cancelPriorLookupJobs()
      lyricsFallbackSpecRef.current = lyricsSpec
      chordsLookup.startSearch({
        title: title,
        artist: artist || '',
        tuneName: title,
        accessToken: token,
        options: buildSearchModeOptions(searchMode, { updateLyrics: true }),
        searchOptions: Object.assign({}, searchOptions, {
          renderChords: function(abc) {
            return abcjsParser.renderChords(abc, true)
          },
        }),
      })
      return
    }
    lyricsFallbackSpecRef.current = null
    lookup.startSearch(lyricsSpec)
  }

  return renderFieldLookupSearchUi({
    children: children,
    buttonGroup: (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        <FieldLookupButtonGroup
          automaticLookup={true}
          showExternal={false}
          busy={busy}
          disabled={!canSearch || disabled}
          externalUrl={googleUrl}
          externalLinkIcon={externalLinkIcon}
          narrow={narrow}
          onSearch={run}
          buttonStyle={buttonStyle}
          searchIcon={searchIcon}
          inline={inline}
          progress={progressPercent}
          suggestionCount={awaitingCandidates.length}
          onClearSuggestions={clearAwaitingSuggestions}
          onOpenSuggestions={openAwaitingSuggestions}
        />
        <SearchProgressBar
          visible={busy}
          percent={progressPercent}
          message={progressMessage}
          defaultMessage={alsoSearchChords
            ? (chordsLookup.busy
              ? 'Searching for chords and lyrics...'
              : 'Searching for lyrics...')
            : 'Searching for lyrics...'}
        />
      </div>
    ),
    suggestionsDropdown: null,
    errorNode: (
      <>
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
      <>
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
      </>
    ),
  })
}
