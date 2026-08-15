import { useRef, useState, useEffect } from 'react'
import { Alert, Button, ButtonGroup, Modal } from 'react-bootstrap'
import { useFieldLookupResolverAccess } from '../fieldLookupResolverAccess'
import useMediaResolverHealth from '../useMediaResolverHealth'
import useAbcjsParser from '../useAbcjsParser'
import { buildGoogleChordsSearchUrl, pickUltimateGuitarPasteCandidate } from '../chordSearchSites'
import { offerAddTuneAutoEnrichChordPaste } from '../addTuneAutoEnrich'
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
import { OFFLINE_MESSAGE, isNavigatorOffline } from '../offlineNetwork'
import FieldSearchResultsCaret from './FieldSearchResultsCaret'
import { renderFieldLookupSearchUi } from './fieldLookupSearchUi'
import { maybeOfferGenreFromSearchResult } from '../genreSideSuggestions'

export default function ChordsSearchButton({
  tuneId,
  candidateId,
  title,
  artist,
  rhythm,
  currentGenres,
  onGenreAccept,
  token,
  onChords,
  onLyrics,
  /** Current lyrics text — unused for gating; lyrics always update from chord sheets. */
  existingLyrics,
  extraQuery,
  buttonStyle,
  disabled,
  confirmOverwrite = false,
  /** When true, start an automatic search once the button mounts. */
  autoStartSearch = false,
  /** When true, only show the external Google chords link (no in-app Search). */
  externalOnly = false,
  tunebook,
  book,
  resolverAvailable: resolverAvailableProp,
  children,
}) {
  void existingLyrics
  const [error, setError] = useState('')
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false)
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
  const resolverAccess = useFieldLookupResolverAccess(token)
  const automaticLookup = externalOnly
    ? false
    : resolverAccess.automaticLookupFor('chords', {
      hasLocalChordSearch: hasLocalChordSearch,
    })
  const searchModeRef = useRef('auto')
  const pendingModeRef = useRef('auto')
  const applyRef = useRef(null)
  const cachedCandidates = useFieldSearchResults(tuneId, candidateId, 'chords')

  function maybeOfferUgPaste(manuals) {
    if (!tuneId) return
    const candidate = pickUltimateGuitarPasteCandidate(manuals)
    if (!candidate) return
    offerAddTuneAutoEnrichChordPaste(tuneId, {
      manualCandidates: manuals,
      chordPasteCandidate: candidate,
    })
  }

  function finishApply(result, jobId) {
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
        maybeOfferUgPaste(job.manualCandidates)
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
      options: buildSearchModeOptions(searchMode, { updateLyrics: true }),
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
    if (confirmOverwrite && pendingModeRef.current === 'auto') {
      setShowOverwriteConfirm(true)
      return
    }
    runSearch(pendingModeRef.current)
  }

  function confirmOverwriteAndSearch() {
    setShowOverwriteConfirm(false)
    runSearch(pendingModeRef.current)
  }

  const autoStartedRef = useRef(false)
  useEffect(function() {
    if (!autoStartSearch || autoStartedRef.current || !canSearch || busy) return
    autoStartedRef.current = true
    runSearch('auto')
  }, [autoStartSearch, canSearch, busy])

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
            automaticLookup={automaticLookup && !externalOnly}
            showExternal={!!(googleUrl && externalLinkIcon)}
            busy={busy}
            disabled={externalOnly ? disabled : (!canSearch || disabled)}
            externalUrl={googleUrl}
            externalLinkIcon={externalLinkIcon}
            inline={true}
            onSearch={externalOnly ? undefined : requestSearch}
            buttonStyle={buttonStyle}
            searchIcon={searchIcon}
            progress={lookup.progressPercent}
            resultsCaret={externalOnly ? null : resultsCaret}
          />
        </ButtonGroup>
        {externalOnly ? null : (
          <SearchProgressBar
            visible={busy}
            percent={lookup.progressPercent}
            message={lookup.progressMessage}
            defaultMessage="Searching for chords..."
          />
        )}
      </div>
    ),
    suggestionsDropdown: null,
    errorNode: externalOnly ? null : (
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
                  <span>
                    {' — '}
                    {isNavigatorOffline()
                      ? OFFLINE_MESSAGE
                      : 'or start the local resolver with `cd local-resolver && docker compose up`'}
                  </span>
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
