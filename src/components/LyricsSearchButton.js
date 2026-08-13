import { useRef, useState } from 'react'
import { Alert, Button, ButtonGroup, Modal } from 'react-bootstrap'
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
import { buildExternalSearchQuestion, buildGoogleSearchQuestionUrl } from '../externalSearchLinks'
import { pickUltimateGuitarPasteCandidate } from '../chordSearchSites'
import { offerAddTuneAutoEnrichChordPaste } from '../addTuneAutoEnrich'

export function buildGoogleLyricsSearchUrl(title, artist, extraQuery) {
  let question = buildExternalSearchQuestion('lyrics', title, artist)
  if (!question) return ''
  const extra = String(extraQuery || '').trim()
  if (extra) question += ' ' + extra
  return buildGoogleSearchQuestionUrl(question)
}

/**
 * Lyrics search ButtonGroup. When onChords is provided, always searches chords
 * first (usually includes lyrics); on miss, falls back to lyrics-only quietly.
 */
export default function LyricsSearchButton({
  tuneId,
  candidateId,
  title,
  artist,
  rhythm,
  currentGenres,
  onGenreAccept,
  token,
  onLyrics,
  onChords,
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
  /** Confirm overwriting notation/chords before importing chord sheets (Auto mode). */
  confirmOverwriteChords = false,
  /** Force Review mode (no Auto dialog). */
  forceReview = false,
  inline,
  children,
}) {
  void leaveAwaiting
  const preferChords = typeof onChords === 'function'
  const narrow = useIsNarrowViewport()
  const abcjsParser = useAbcjsParser({ tunebook: tunebook })
  const [error, setError] = useState('')
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false)
  const [pickerCandidates, setPickerCandidates] = useState([])
  const [showPicker, setShowPicker] = useState(false)
  const [chordPickerCandidates, setChordPickerCandidates] = useState([])
  const [showChordPicker, setShowChordPicker] = useState(false)
  const [manualCandidates, setManualCandidates] = useState([])
  const [lockedModalCandidate, setLockedModalCandidate] = useState(null)
  const existingLyricsRef = useRef(existingLyrics)
  existingLyricsRef.current = existingLyrics
  const searchModeRef = useRef(forceReview ? 'review' : 'auto')
  const pendingModeRef = useRef('auto')
  const applyRef = useRef(null)
  const lyricsFallbackSpecRef = useRef(null)
  const startLyricsFallbackRef = useRef(null)
  const cachedCandidates = useFieldSearchResults(tuneId, candidateId, 'lyrics')
  const cachedChordCandidates = useFieldSearchResults(tuneId, candidateId, 'chords')
  const fieldEmpty = !String(existingLyrics || '').trim()

  function finishLyricsApply(result, jobId) {
    if (jobId) applyFieldLookupChoice(jobId, result)
    if (typeof onLyrics === 'function') onLyrics(result)
    maybeOfferGenreFromSearchResult({
      tuneId: tuneId,
      candidateId: candidateId,
      result: result,
      title: title,
      artist: artist,
      rhythm: rhythm,
      currentGenres: currentGenres,
      onGenreAccept: onGenreAccept,
    })
  }
  applyRef.current = finishLyricsApply

  function finishChordApply(result, jobId) {
    if (jobId) applyFieldLookupChoice(jobId, result)
    if (typeof onLyrics === 'function') {
      onLyrics({
        lines: result.lyricLines,
        text: result.lyricText,
        source: result.source,
        sourceUrl: result.sourceUrl,
      })
    }
    if (typeof onChords === 'function') {
      onChords(result, { updateLyrics: true })
    }
    maybeOfferGenreFromSearchResult({
      tuneId: tuneId,
      candidateId: candidateId,
      result: result,
      title: title,
      artist: artist,
      rhythm: rhythm,
      currentGenres: currentGenres,
      onGenreAccept: onGenreAccept,
    })
  }

  function maybeOfferUgPaste(manuals) {
    if (!tuneId) return
    const candidate = pickUltimateGuitarPasteCandidate(manuals)
    if (!candidate) return
    offerAddTuneAutoEnrichChordPaste(tuneId, {
      manualCandidates: manuals,
      chordPasteCandidate: candidate,
    })
  }

  function fallBackToLyricsSearch() {
    const spec = lyricsFallbackSpecRef.current
    if (!spec || typeof startLyricsFallbackRef.current !== 'function') return
    lyricsFallbackSpecRef.current = null
    startLyricsFallbackRef.current(spec)
  }

  function chordsMissedQuietly(job) {
    if (!preferChords) return false
    if (job && Array.isArray(job.manualCandidates) && job.manualCandidates.length) {
      maybeOfferUgPaste(job.manualCandidates)
    }
    if (job && job.id && job.status === 'awaiting') {
      dismissFieldLookup(job.id)
    }
    fallBackToLyricsSearch()
    return true
  }

  function openLyricsPicker(candidates) {
    setError('')
    setPickerCandidates(Array.isArray(candidates) ? candidates : [])
    setShowPicker(true)
  }

  function closeLyricsPicker(dismissJob) {
    setShowPicker(false)
    setPickerCandidates([])
    if (dismissJob && lookup.activeJob && lookup.activeJob.status === 'awaiting') {
      dismissFieldLookup(lookup.activeJob.id)
    }
  }

  function openChordPicker(candidates) {
    setError('')
    setChordPickerCandidates(Array.isArray(candidates) ? candidates : [])
    setShowChordPicker(true)
  }

  function closeChordPicker(dismissJob) {
    setShowChordPicker(false)
    setChordPickerCandidates([])
    if (dismissJob && chordsLookup.activeJob && chordsLookup.activeJob.status === 'awaiting') {
      dismissFieldLookup(chordsLookup.activeJob.id)
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
      openLyricsPicker(candidates)
    },
    onError: function(job) {
      setError(job.error || 'Lyrics search failed')
    },
  })
  startLyricsFallbackRef.current = lookup.startSearch

  const chordsLookup = useFieldLookupSearchJob({
    tuneId: tuneId,
    candidateId: candidateId,
    kind: 'chords',
    onAwaiting: function(job) {
      if (!preferChords) return
      if (Array.isArray(job.manualCandidates) && job.manualCandidates.length > 0
        && (!job.candidates || job.candidates.length === 0)) {
        setManualCandidates(job.manualCandidates)
        maybeOfferUgPaste(job.manualCandidates)
        chordsMissedQuietly(job)
        return
      }
      const candidates = Array.isArray(job.candidates) ? job.candidates : []
      if (job.status === 'done' || job.appliedCandidate) {
        if (job.appliedCandidate) {
          finishChordApply(job.appliedCandidate, null)
        }
        return
      }
      if (candidates.length === 0) {
        chordsMissedQuietly(job)
        return
      }
      const key = targetKeyForFieldSearch(tuneId, candidateId)
      if (key) setFieldSearchResults(key, 'chords', candidates)
      openChordPicker(candidates)
    },
    onError: function() {
      if (!preferChords) return
      chordsMissedQuietly(null)
    },
  })

  const googleUrl = buildGoogleLyricsSearchUrl(title, artist, extraQuery)
  const searchIcon = tunebook && tunebook.icons ? tunebook.icons.search : null
  const externalLinkIcon = showExternalLink && tunebook && tunebook.icons
    ? tunebook.icons.externallink
    : null
  const searchingChords = preferChords && chordsLookup.busy
  const busy = preferChords
    ? (chordsLookup.busy || lookup.busy)
    : lookup.busy
  const canSearch = !!(title && (tuneId || candidateId))
  const progressPercent = preferChords
    ? Math.max(chordsLookup.progressPercent || 0, lookup.progressPercent || 0)
    : (lookup.progressPercent || 0)
  const progressMessage = preferChords
    ? (chordsLookup.busy ? chordsLookup.progressMessage : lookup.progressMessage)
    : lookup.progressMessage
  const awaitingJob = lookup.activeJob && lookup.activeJob.status === 'awaiting'
    ? lookup.activeJob
    : null

  function chooseLyricsCandidate(candidate) {
    const jobId = lookup.activeJob && lookup.activeJob.status === 'awaiting'
      ? lookup.activeJob.id
      : null
    finishLyricsApply(candidate, jobId)
    closeLyricsPicker(!!jobId)
  }

  function chooseChordCandidate(candidate) {
    const jobId = chordsLookup.activeJob && chordsLookup.activeJob.status === 'awaiting'
      ? chordsLookup.activeJob.id
      : null
    finishChordApply(candidate, jobId)
    closeChordPicker(!!jobId)
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
      else if (preferChords) chordsLookup.cancel()
    })
  }

  function runSearch(mode) {
    if (!canSearch) return
    if (busy) {
      lookup.cancel()
      if (preferChords) chordsLookup.cancel()
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
    setShowChordPicker(false)
    setChordPickerCandidates([])
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
    if (preferChords) {
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

  function requestSearch(mode) {
    if (!canSearch) return
    if (busy) {
      lookup.cancel()
      if (preferChords) chordsLookup.cancel()
      lyricsFallbackSpecRef.current = null
      return
    }
    pendingModeRef.current = mode === 'review' ? 'review' : 'auto'
    if (preferChords && confirmOverwriteChords && pendingModeRef.current === 'auto') {
      setShowOverwriteConfirm(true)
      return
    }
    runSearch(pendingModeRef.current)
  }

  function confirmOverwriteAndSearch() {
    setShowOverwriteConfirm(false)
    runSearch(pendingModeRef.current)
  }

  const lyricsResultsCaret = (
    <FieldSearchResultsCaret
      candidates={cachedCandidates}
      className="select-input-options-dropdown"
      openPickerOnToggle={true}
      onOpen={openLyricsPicker}
      aria-label="Cached lyrics search results"
      data-testid="lyrics-search-results-caret"
    />
  )

  const chordResultsCaret = preferChords && cachedChordCandidates.length > 0 ? (
    <FieldSearchResultsCaret
      candidates={cachedChordCandidates}
      className="select-input-options-dropdown"
      openPickerOnToggle={true}
      onOpen={openChordPicker}
      aria-label="Cached chord search results"
      data-testid="chords-search-results-caret"
    />
  ) : null

  return renderFieldLookupSearchUi({
    children: children,
    buttonGroup: (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        <ButtonGroup className="lyrics-search-button-group">
          <FieldLookupButtonGroup
            automaticLookup={true}
            showExternal={!!(googleUrl && externalLinkIcon)}
            busy={busy}
            disabled={!canSearch || disabled}
            externalUrl={googleUrl}
            externalLinkIcon={externalLinkIcon}
            narrow={narrow}
            onSearch={requestSearch}
            buttonStyle={buttonStyle}
            searchIcon={searchIcon}
            inline={inline}
            progress={progressPercent}
            resultsCaret={lyricsResultsCaret}
          />
          {chordResultsCaret}
        </ButtonGroup>
        <SearchProgressBar
          visible={busy}
          percent={progressPercent}
          message={progressMessage}
          defaultMessage={searchingChords
            ? 'Searching for chords and lyrics...'
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
            closeLyricsPicker(true)
          }}
        />
        <SearchResultPickerModal
          show={showChordPicker}
          title="Choose chord sheet"
          items={chordPickerCandidates}
          fallbackTitle={title}
          emptyMessage="No chord sheets were found."
          onSelect={chooseChordCandidate}
          onHide={function() {
            closeChordPicker(true)
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
        <Modal
          show={showOverwriteConfirm}
          onHide={function() { setShowOverwriteConfirm(false) }}
          centered
        >
          <Modal.Header closeButton>
            <Modal.Title>Import chords from search?</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Alert variant="warning" className="mb-0">
              Continuing will import chords and lyrics. Existing pitched notation is left unchanged;
              empty notation may be replaced with a chord scaffold from the search result.
            </Alert>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={function() { setShowOverwriteConfirm(false) }}>
              Cancel
            </Button>
            <Button variant="primary" onClick={confirmOverwriteAndSearch}>
              Continue
            </Button>
          </Modal.Footer>
        </Modal>
      </>
    ),
  })
}
