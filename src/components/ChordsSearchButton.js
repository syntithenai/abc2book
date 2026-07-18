import { useRef, useState } from 'react'
import { Alert, Button, ButtonGroup, Form, Modal, ToggleButton } from 'react-bootstrap'
import useMediaResolverHealth from '../useMediaResolverHealth'
import useAbcjsParser from '../useAbcjsParser'
import { buildGoogleChordsSearchUrl } from '../chordSearchSites'
import { useFieldLookupSearchJob } from '../useFieldLookupSearchJob'
import {
  applyFieldLookupChoice,
  buildSearchModeOptions,
  dismissFieldLookup,
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
  /** Current lyrics text — when set, search lyrics become suggestions instead of overwrites. */
  existingLyrics,
  extraQuery,
  buttonStyle,
  disabled,
  showLyricsCheckbox = true,
  defaultUpdateLyrics = true,
  confirmOverwrite = false,
  /** When true, lyrics checkbox is locked on (still only auto-writes if lyrics empty). */
  forceUpdateLyrics = false,
  tunebook,
  book,
  resolverAvailable: resolverAvailableProp,
  children,
}) {
  const [error, setError] = useState('')
  const [updateLyrics, setUpdateLyrics] = useState(forceUpdateLyrics || defaultUpdateLyrics)
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false)
  const [confirmUpdateLyrics, setConfirmUpdateLyrics] = useState(forceUpdateLyrics || defaultUpdateLyrics)
  const [pickerCandidates, setPickerCandidates] = useState([])
  const [showPicker, setShowPicker] = useState(false)
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
  const existingLyricsRef = useRef(existingLyrics)
  existingLyricsRef.current = existingLyrics
  const forceOverwriteLyricsRef = useRef(false)
  const searchModeRef = useRef('auto')
  const pendingModeRef = useRef('auto')
  const applyRef = useRef(null)
  const cachedCandidates = useFieldSearchResults(tuneId, candidateId, 'chords')

  function finishApply(result, jobId) {
    if (jobId) applyFieldLookupChoice(jobId, result)
    let applyLyricsNow = false
    if (updateLyricsRef.current) {
      if (forceOverwriteLyricsRef.current) {
        applyLyricsNow = true
        if (typeof onLyrics === 'function') {
          onLyrics({
            lines: result.lyricLines,
            text: result.lyricText,
            source: result.source,
            sourceUrl: result.sourceUrl,
          })
        }
      } else {
        maybeOfferLyricsFromSearchResult({
          tuneId: tuneId,
          candidateId: candidateId,
          result: result,
          title: title,
          artist: artist,
          currentLyrics: existingLyricsRef.current || '',
          onLyricsAccept: function(payload) {
            applyLyricsNow = true
            if (typeof onLyrics === 'function') onLyrics(payload)
          },
        })
      }
    }
    forceOverwriteLyricsRef.current = false
    if (typeof onChords === 'function') {
      onChords(result, { updateLyrics: applyLyricsNow })
    }
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
    kind: 'chords',
    onAwaiting: function(job) {
      if (Array.isArray(job.manualCandidates) && job.manualCandidates.length > 0
        && (!job.candidates || job.candidates.length === 0)) {
        setManualCandidates(job.manualCandidates)
        return
      }
      const candidates = Array.isArray(job.candidates) ? job.candidates : []
      if (job.status === 'done' || job.appliedCandidate) {
        if (job.appliedCandidate) {
          finishApply(job.appliedCandidate, null)
        }
        return
      }
      if (candidates.length === 0) {
        setError('No chords found for this song')
        return
      }
      const key = targetKeyForFieldSearch(tuneId, candidateId)
      if (key) setFieldSearchResults(key, 'chords', candidates)
      openPicker(candidates)
    },
    onError: function(job) {
      setError(job.error || 'Chords search failed')
    },
  })

  const googleUrl = buildGoogleChordsSearchUrl(title, artist, extraQuery)
  const searchIcon = tunebook && tunebook.icons ? tunebook.icons.search : null
  const externalLinkIcon = tunebook && tunebook.icons ? tunebook.icons.externallink : null
  const busy = lookup.busy
  const canSearch = !!(title && (tuneId || candidateId))
  const awaitingJob = lookup.activeJob && lookup.activeJob.status === 'awaiting'
    ? lookup.activeJob
    : null

  function chooseChordCandidate(candidate) {
    const jobId = lookup.activeJob && lookup.activeJob.status === 'awaiting'
      ? lookup.activeJob.id
      : null
    finishApply(candidate, jobId)
    closePicker(!!jobId)
  }

  function runSearch(mode) {
    if (!canSearch) return
    if (busy) {
      lookup.cancel()
      return
    }
    const searchMode = mode === 'review' ? 'review' : 'auto'
    searchModeRef.current = searchMode
    setError('')
    setManualCandidates([])
    setLockedModalCandidate(null)
    setShowPicker(false)
    setPickerCandidates([])
    lookup.startSearch({
      title: title,
      artist: artist || '',
      tuneName: title,
      accessToken: token,
      options: buildSearchModeOptions(searchMode, { updateLyrics: updateLyricsRef.current }),
      searchOptions: {
        resolverAvailable: resolverAvailable,
        abcTools: tunebook && tunebook.abcTools ? tunebook.abcTools : null,
        renderChords: function(abc) { return abcjsParser.renderChords(abc, true) },
      },
    })
  }

  function requestSearch(mode) {
    if (!canSearch) return
    if (busy) {
      lookup.cancel()
      return
    }
    if (awaitingJob) dismissFieldLookup(awaitingJob.id)
    pendingModeRef.current = mode === 'review' ? 'review' : 'auto'
    // Overwrite confirmation is only for Auto (immediate apply). Review leaves
    // results as choosable suggestions without wiping the tune yet.
    if (confirmOverwrite && pendingModeRef.current === 'auto') {
      setConfirmUpdateLyrics(forceUpdateLyrics || updateLyrics)
      setShowOverwriteConfirm(true)
      return
    }
    if (forceUpdateLyrics) {
      setUpdateLyrics(true)
      updateLyricsRef.current = true
    }
    runSearch(pendingModeRef.current)
  }

  function confirmOverwriteAndSearch() {
    const nextUpdateLyrics = forceUpdateLyrics || !!confirmUpdateLyrics
    setUpdateLyrics(nextUpdateLyrics)
    updateLyricsRef.current = nextUpdateLyrics
    // Explicit checkbox consent overwrites existing lyrics; locked forceUpdateLyrics does not.
    forceOverwriteLyricsRef.current = !forceUpdateLyrics && !!confirmUpdateLyrics
    setShowOverwriteConfirm(false)
    runSearch(pendingModeRef.current)
  }

  const resultsCaret = (
    <FieldSearchResultsCaret
      candidates={cachedCandidates}
      className="select-input-options-dropdown"
      openPickerOnToggle={true}
      onOpen={openPicker}
      aria-label="Cached chords search results"
      data-testid="chords-search-results-caret"
    />
  )

  return renderFieldLookupSearchUi({
    children: children,
    buttonGroup: (
      <div className="chords-search-button" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        <ButtonGroup className="chords-search-button-group">
          <FieldLookupButtonGroup
            automaticLookup={automaticLookup}
            showExternal={!automaticLookup}
            busy={busy}
            disabled={!canSearch || disabled}
            externalUrl={googleUrl}
            externalLinkIcon={externalLinkIcon}
            inline={true}
            onSearch={requestSearch}
            buttonStyle={buttonStyle}
            searchIcon={searchIcon}
            progress={lookup.progressPercent}
            resultsCaret={resultsCaret}
          />
          {showLyricsCheckbox && !confirmOverwrite && automaticLookup && (
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
      </div>
    ),
    suggestionsDropdown: null,
    errorNode: (
      <>
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
      </>
    ),
    modals: (
      <>
        <SearchResultPickerModal
          show={showPicker}
          title="Choose chord sheet"
          items={pickerCandidates}
          fallbackTitle={title}
          emptyMessage="No chord sheets were found."
          onSelect={chooseChordCandidate}
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
        <Modal
          show={showOverwriteConfirm}
          onHide={function() { setShowOverwriteConfirm(false) }}
          centered
        >
          <Modal.Header closeButton>
            <Modal.Title>Replace chords from search?</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Alert variant="warning" className="mb-3">
              Continuing will <strong>overwrite all existing notation and chords</strong> for this tune
              with the search result.
              {forceUpdateLyrics ? (
                <> Empty lyrics are filled from the result; existing lyrics stay as Suggestions.</>
              ) : null}
            </Alert>
            {!forceUpdateLyrics ? (
              <Form.Check
                type="checkbox"
                id="chords-search-confirm-update-lyrics"
                label="Also overwrite lyrics"
                checked={confirmUpdateLyrics}
                onChange={function(e) {
                  setConfirmUpdateLyrics(!!e.target.checked)
                }}
              />
            ) : null}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={function() { setShowOverwriteConfirm(false) }}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmOverwriteAndSearch}>
              Continue
            </Button>
          </Modal.Footer>
        </Modal>
      </>
    ),
  })
}
