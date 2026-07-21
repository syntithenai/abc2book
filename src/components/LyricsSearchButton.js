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
import { useFieldSearchResults } from '../useFieldSearchResults'
import { setFieldSearchResults, targetKeyForFieldSearch } from '../fieldSearchResultCache'
import SearchProgressBar from './SearchProgressBar'
import SearchResultPickerModal from './SearchResultPickerModal'
import ManualCandidatesFeedback from './ManualCandidatesFeedback'
import LockedSourcePasteModal from './LockedSourcePasteModal'
import { FieldLookupButtonGroup } from './FieldLookupButtonGroup'
import FieldSearchResultsCaret from './FieldSearchResultsCaret'
import { renderFieldLookupSearchUi } from './fieldLookupSearchUi'
import { maybeOfferGenreFromSearchResult } from '../genreSideSuggestions'
import { maybeOfferLyricsFromSearchResult } from '../lyricsSideSuggestions'
import { buildExternalSearchQuestion, buildGoogleSearchQuestionUrl } from '../externalSearchLinks'

export function buildGoogleLyricsSearchUrl(title, artist, extraQuery) {
  let question = buildExternalSearchQuestion('lyrics', title, artist)
  if (!question) return ''
  const extra = String(extraQuery || '').trim()
  if (extra) question += ' ' + extra
  return buildGoogleSearchQuestionUrl(question)
}

/**
 * Lyrics search ButtonGroup. On Add/review forms, pass alsoSearchChords
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
  /** Kept for TuneRecordForm API; picker always opens when results arrive. */
  leaveAwaiting = false,
  /** Prefer chords search first; fall back to lyrics-only when chords miss. */
  alsoSearchChords = false,
  /** Force Review mode (no Auto dialog). */
  forceReview = false,
  inline,
  children,
}) {
  void leaveAwaiting
  const narrow = useIsNarrowViewport()
  const abcjsParser = useAbcjsParser({ tunebook: tunebook })
  const [error, setError] = useState('')
  const [pickerCandidates, setPickerCandidates] = useState([])
  const [showPicker, setShowPicker] = useState(false)
  const [manualCandidates, setManualCandidates] = useState([])
  const [lockedModalCandidate, setLockedModalCandidate] = useState(null)
  const existingLyricsRef = useRef(existingLyrics)
  existingLyricsRef.current = existingLyrics
  const searchModeRef = useRef(forceReview ? 'review' : 'auto')
  const alsoSearchChordsRef = useRef(alsoSearchChords)
  alsoSearchChordsRef.current = alsoSearchChords
  const applyRef = useRef(null)
  const lyricsFallbackSpecRef = useRef(null)
  const startLyricsFallbackRef = useRef(null)
  const cachedCandidates = useFieldSearchResults(tuneId, candidateId, 'lyrics')
  const fieldEmpty = !String(existingLyrics || '').trim()

  function finishApply(result, jobId) {
    if (jobId) applyFieldLookupChoice(jobId, result)
    if (typeof onLyrics === 'function') onLyrics(result)
    maybeOfferGenreFromSearchResult({
      tuneId: tuneId,
      candidateId: candidateId,
      result: result,
      title: title,
      artist: artist,
      rhythm: rhythm,
      currentGenre: currentGenre,
      onGenreAccept: onGenreAccept,
    })
  }
  applyRef.current = finishApply

  function offerSideFieldsFromChordResult(result) {
    if (!result) return
    maybeOfferLyricsFromSearchResult({
      tuneId: tuneId,
      candidateId: candidateId,
      result: result,
      title: title,
      artist: artist,
      currentLyrics: existingLyricsRef.current || '',
      onLyricsAccept: onLyrics,
    })
    maybeOfferGenreFromSearchResult({
      tuneId: tuneId,
      candidateId: candidateId,
      result: result,
      title: title,
      artist: artist,
      rhythm: rhythm,
      currentGenre: currentGenre,
      onGenreAccept: onGenreAccept,
    })
  }

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

  function openPicker(candidates) {
    setError('')
    setPickerCandidates(Array.isArray(candidates) ? candidates : [])
    setShowPicker(true)
  }

  function closePicker(dismissJob) {
    setShowPicker(false)
    setPickerCandidates([])
    if (dismissJob && lookup.activeJob && lookup.activeJob.status === 'awaiting') {
      dismissFieldLookup(lookup.activeJob.id)
    }
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
      if (job.status === 'done' || (job.appliedCandidate && fieldEmpty)) {
        if (job.appliedCandidate && typeof onLyrics === 'function') {
          onLyrics(job.appliedCandidate)
        }
        return
      }
      if (candidates.length === 0) {
        setError('No lyrics found for this song')
        return
      }
      const key = targetKeyForFieldSearch(tuneId, candidateId)
      if (key) setFieldSearchResults(key, 'lyrics', candidates)
      openPicker(candidates)
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
        return
      }
      if (candidates.length > 0) {
        const key = targetKeyForFieldSearch(tuneId, candidateId)
        if (key) setFieldSearchResults(key, 'chords', candidates)
        offerSideFieldsFromChordResult(candidates[0])
      }
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

  function chooseLyricsCandidate(candidate) {
    const jobId = lookup.activeJob && lookup.activeJob.status === 'awaiting'
      ? lookup.activeJob.id
      : null
    finishApply(candidate, jobId)
    closePicker(!!jobId)
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
    if (awaitingJob) dismissFieldLookup(awaitingJob.id)
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

  const resultsCaret = (
    <FieldSearchResultsCaret
      candidates={cachedCandidates}
      className="select-input-options-dropdown"
      openPickerOnToggle={true}
      onOpen={openPicker}
      aria-label="Cached lyrics search results"
      data-testid="lyrics-search-results-caret"
    />
  )

  return renderFieldLookupSearchUi({
    children: children,
    buttonGroup: (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        <FieldLookupButtonGroup
          automaticLookup={true}
          showExternal={!!(googleUrl && externalLinkIcon)}
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
          resultsCaret={resultsCaret}
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
            closePicker(true)
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
