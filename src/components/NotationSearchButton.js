import { useRef, useState } from 'react'
import { Alert, Button } from 'react-bootstrap'
import useMediaResolverHealth from '../useMediaResolverHealth'
import { useFieldLookupSearchJob } from '../useFieldLookupSearchJob'
import {
  applyFieldLookupChoice,
  buildSearchModeOptions,
  dismissFieldLookup,
} from '../tuneFieldLookupQueue'
import {
  buildPickerOriginalValueItem,
  resolveOriginalValueForPicker,
  searchableSuggestions,
} from '../fieldSuggestionsUtils'
import { useFieldSearchResults } from '../useFieldSearchResults'
import { setFieldSearchResults, targetKeyForFieldSearch } from '../fieldSearchResultCache'
import SearchProgressBar from './SearchProgressBar'
import SearchResultPickerModal from './SearchResultPickerModal'
import MelodyAnalysisRefineModal from './MelodyAnalysisRefineModal'
import { FieldLookupButtonGroup } from './FieldLookupButtonGroup'
import FieldSearchResultsCaret from './FieldSearchResultsCaret'
import { renderFieldLookupSearchUi } from './fieldLookupSearchUi'
import { maybeOfferGenreFromSearchResult } from '../genreSideSuggestions'
import { buildExternalSearchQuestion, buildGoogleSearchQuestionUrl } from '../externalSearchLinks'
import { buildMuseScoreSearchUrl, filterActionableNotationManualCandidates } from '../chordSearchSites'
import { buildExternalNotationArchiveChoices } from '../notationSearchSites'
import { getMediaAnalysisJob } from '../mediaAnalysisJobs'
import { mediaAnalysisJobHasMelodySourceNotes } from '../mediaAnalysisSuggestions'
import { restoreFieldLookupOriginalToTune } from '../fieldSuggestionApply'
import ManualCandidatesFeedback from './ManualCandidatesFeedback'
import LockedSourcePasteModal from './LockedSourcePasteModal'
import useAbcjsParser from '../useAbcjsParser'
import { applyNotationSearchCandidate, isDeferredMidiNotationCandidate } from '../notationMidiImport'

function buildMidiSearchUrl(title, artist) {
  const parts = [String(title || '').trim(), String(artist || '').trim()].filter(Boolean)
  if (!parts.length) return ''
  return buildGoogleSearchQuestionUrl(
    parts.join(' ') + ' (filetype:mid OR filetype:midi)'
  )
}

function buildExternalNotationChoices(title, artist) {
  const choices = []
  const abcGoogleUrl = buildGoogleSearchQuestionUrl(
    buildExternalSearchQuestion('notation', title, artist)
  )
  const museScoreUrl = buildMuseScoreSearchUrl(title, artist)
  const midiUrl = buildMidiSearchUrl(title, artist)
  if (abcGoogleUrl) {
    choices.push({
      id: 'abc',
      title: 'ABC notation',
      artist: 'Google search',
      preview: 'Search the web for ABC notation',
      source: 'abc',
      url: abcGoogleUrl,
    })
  }
  if (museScoreUrl) {
    choices.push({
      id: 'musescore',
      title: 'MuseScore',
      artist: 'musescore.com',
      preview: 'Open MuseScore sheet music search',
      source: 'musescore',
      url: museScoreUrl,
    })
  }
  if (midiUrl) {
    choices.push({
      id: 'midi',
      title: 'MIDI',
      artist: 'Google search',
      preview: 'Search for MIDI files',
      source: 'midi',
      url: midiUrl,
    })
  }
  choices.push.apply(choices, buildExternalNotationArchiveChoices(title, artist))
  return choices
}

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
  currentGenres,
  currentValue,
  onGenreAccept,
  token,
  onNotation,
  buttonStyle,
  disabled,
  tunebook,
  tune,
  resolverAvailable: resolverAvailableProp,
  inline,
  songType,
  /** Kept for TuneRecordForm API; picker always opens when results arrive. */
  leaveAwaiting = false,
  children,
}) {
  void leaveAwaiting
  const [error, setError] = useState('')
  const [pickerCandidates, setPickerCandidates] = useState([])
  const [showPicker, setShowPicker] = useState(false)
  const [showExternalPicker, setShowExternalPicker] = useState(false)
  const [showRefine, setShowRefine] = useState(false)
  const [refineJobId, setRefineJobId] = useState(null)
  const [manualCandidates, setManualCandidates] = useState([])
  const [musescorePaywalled, setMusescorePaywalled] = useState(false)
  const [lockedModalCandidate, setLockedModalCandidate] = useState(null)
  const { available: resolverAvailableFromHealth, checked: resolverHealthChecked } = useMediaResolverHealth()
  const resolverAvailable = typeof resolverAvailableProp === 'boolean'
    ? resolverAvailableProp
    : resolverAvailableFromHealth
  const abcjsParser = useAbcjsParser({ tunebook: tunebook })
  const applyRef = useRef(null)
  const mediaJob = getMediaAnalysisJob(tuneId)
  const cachedCandidates = useFieldSearchResults(tuneId, candidateId, 'notation')
  const fieldEmpty = !String(currentValue || '').trim()

  function deliverAppliedNotation(result, jobId) {
    if (jobId) void applyFieldLookupChoice(jobId, result)
    if (typeof onNotation === 'function') onNotation(result)
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

  function finishApply(result, jobId) {
    const hasAbc = !!(result && result.abc && String(result.abc).indexOf('K:') >= 0)
    if (isDeferredMidiNotationCandidate(result) && !hasAbc) {
      applyNotationSearchCandidate(result, {
        accessToken: token,
        tunebook: tunebook,
        onAbc: function(abcText, _label, imported) {
          const next = Object.assign({}, result, { abc: abcText })
          if (imported && imported.tune) next.tune = imported.tune
          deliverAppliedNotation(next, jobId)
        },
      }).catch(function(e) {
        if (e && e.message && String(e.message).indexOf('cancelled') === -1) {
          setError(e.message)
        }
      })
      return
    }
    deliverAppliedNotation(result, jobId)
  }
  applyRef.current = finishApply

  function openMediaAnalysisRefine(jobId) {
    setRefineJobId(jobId || null)
    setShowPicker(false)
    setPickerCandidates([])
    setShowRefine(true)
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
    kind: 'notation',
    onAwaiting: function(job) {
      const manuals = Array.isArray(job.manualCandidates) ? job.manualCandidates : []
      const actionableManuals = filterActionableNotationManualCandidates(manuals)
      const candidates = searchableSuggestions(job)
      setMusescorePaywalled(!!job.musescorePaywalled)
      if (job.appliedCandidate && (job.status === 'done' || fieldEmpty)) {
        if (typeof onNotation === 'function') onNotation(job.appliedCandidate)
        return
      }
      if (actionableManuals.length > 0 && candidates.length === 0) {
        setManualCandidates(actionableManuals)
        setError('')
        return
      }
      if (job.musescorePaywalled && candidates.length === 0) {
        setManualCandidates([])
        setError('')
        return
      }
      if (candidates.length === 0) {
        setError('No notation found for this song')
        return
      }
      setManualCandidates([])
      setMusescorePaywalled(false)
      const key = targetKeyForFieldSearch(tuneId, candidateId)
      if (key) setFieldSearchResults(key, 'notation', candidates)
      openPicker(candidates)
    },
    onError: function(job) {
      setManualCandidates([])
      setMusescorePaywalled(false)
      setError(job.error || 'Notation search failed')
    },
  })

  const externalChoices = buildExternalNotationChoices(title, artist)
  const searchIcon = tunebook && tunebook.icons ? tunebook.icons.search : null
  const externalLinkIcon = tunebook && tunebook.icons ? tunebook.icons.externallink : null
  const busy = lookup.busy
  const canSearch = !!(title && (tuneId || candidateId))
  const awaitingJob = lookup.activeJob && lookup.activeJob.status === 'awaiting'
    ? lookup.activeJob
    : null
  const awaitingManuals = awaitingJob && Array.isArray(awaitingJob.manualCandidates)
    ? awaitingJob.manualCandidates
    : manualCandidates

  const externalStyle = Object.assign({
    color: 'black',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.35em',
    whiteSpace: 'nowrap',
  }, buttonStyle || {})

  const externalMenu = externalLinkIcon && externalChoices.length > 0 ? (
    <Button
      type="button"
      variant="outline-secondary"
      style={externalStyle}
      disabled={disabled || !String(title || '').trim()}
      data-testid="notation-external-menu"
      aria-label="Open external notation search"
      title="External notation search"
      onClick={function() { setShowExternalPicker(true) }}
    >
      {externalLinkIcon}
    </Button>
  ) : null

  function runAbcFallbackSearch() {
    if (!canSearch || busy) return
    setError('')
    setManualCandidates([])
    setMusescorePaywalled(false)
    setLockedModalCandidate(null)
    lookup.startSearch({
      title: title,
      artist: artist || '',
      tuneName: title,
      accessToken: token,
      options: buildSearchModeOptions('review', { songType: songType, midiFallback: true }),
      searchOptions: {
        resolverAvailable: (typeof resolverAvailableProp === 'boolean' || resolverHealthChecked)
          ? resolverAvailable
          : undefined,
        abcTools: tunebook && tunebook.abcTools ? tunebook.abcTools : null,
        midiFallback: true,
      },
    })
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
    void mode
    if (awaitingJob) dismissFieldLookup(awaitingJob.id)
    setError('')
    setShowPicker(false)
    setPickerCandidates([])
    setManualCandidates([])
    setMusescorePaywalled(false)
    setLockedModalCandidate(null)
    const started = lookup.startSearch({
      title: title,
      artist: artist || '',
      tuneName: title,
      accessToken: token,
      options: buildSearchModeOptions('review', { songType: songType }),
      searchOptions: {
        resolverAvailable: (typeof resolverAvailableProp === 'boolean' || resolverHealthChecked)
          ? resolverAvailable
          : undefined,
        abcTools: tunebook && tunebook.abcTools ? tunebook.abcTools : null,
      },
    })
    if (!started) {
      setError('Could not start notation search')
    }
  }

  const originalAbc = resolveOriginalValueForPicker(
    awaitingJob,
    typeof currentValue === 'string' ? currentValue : ''
  )
  const pickerItems = [
    buildPickerOriginalValueItem({
      value: originalAbc,
      abc: typeof originalAbc === 'string' ? originalAbc : '',
    }),
  ].concat(pickerCandidates.map(function(candidate) {
    return {
      title: candidate.title || title,
      artist: candidate.artist || artist || '',
      preview: candidate.preview || candidate.abc || '',
      abc: candidate.abc || candidate.preview || '',
      source: candidate.source || '',
      sourceUrl: candidate.sourceUrl || '',
      matchType: candidate.source || '',
      pdfAttachment: candidate.pdfAttachment || null,
      importFormat: candidate.importFormat || '',
      midiBytes: candidate.midiBytes || '',
      tuneMeta: candidate.tuneMeta || null,
    }
  }))

  const resultsCaret = (
    <FieldSearchResultsCaret
      candidates={cachedCandidates}
      className="select-input-options-dropdown"
      openPickerOnToggle={true}
      onOpen={openPicker}
      aria-label="Cached notation search results"
      data-testid="notation-search-results-caret"
    />
  )

  return renderFieldLookupSearchUi({
    children: children,
    buttonGroup: (
      <>
        <FieldLookupButtonGroup
          automaticLookup={true}
          showExternal={!!externalLinkIcon}
          busy={busy}
          disabled={!canSearch || disabled}
          externalMenu={externalMenu}
          externalLinkIcon={externalLinkIcon}
          onSearch={run}
          buttonStyle={buttonStyle}
          searchIcon={searchIcon}
          inline={inline}
          progress={lookup.progressPercent}
          resultsCaret={resultsCaret}
        />
        <SearchProgressBar
          visible={busy}
          percent={lookup.progressPercent}
          message={lookup.progressMessage}
          defaultMessage="Searching for notation..."
        />
      </>
    ),
    suggestionsDropdown: null,
    errorNode: (
      <>
        {musescorePaywalled ? (
          <Alert variant="info" className="mt-2 mb-0">
            MuseScore matches require PRO or purchase; try ABC or MusicXML sources instead.
          </Alert>
        ) : null}
        {error ? <Alert variant="danger" className="mt-2 mb-0">{error}</Alert> : null}
        <ManualCandidatesFeedback
          message="Notation found on MuseScore, but automatic download is unavailable"
          manualCandidates={awaitingManuals}
          tunebook={tunebook}
          onSelectCandidate={function(candidate) {
            setLockedModalCandidate(Object.assign({}, candidate, {
              contentType: candidate.contentType || 'notation',
            }))
          }}
        />
      </>
    ),
    modals: (
      <>
        <SearchResultPickerModal
          show={showExternalPicker}
          title="External notation search"
          items={externalChoices}
          onSelect={function(item) {
            setShowExternalPicker(false)
            const url = item && item.url ? String(item.url) : ''
            if (!url || typeof window === 'undefined' || !window.open) return
            window.open(url, '_blank', 'noopener,noreferrer')
          }}
          onHide={function() { setShowExternalPicker(false) }}
        />
        <SearchResultPickerModal
          show={showPicker}
          title="Choose notation"
          layout="notation"
          items={pickerItems}
          onSelect={function(item, index) {
            if (item && item.__current) {
              if (awaitingJob) {
                restoreFieldLookupOriginalToTune(awaitingJob, {
                  tunebook: tunebook,
                  tunes: tune && tuneId ? { [String(tuneId)]: tune } : {},
                })
              }
              closePicker(true)
              return
            }
            const candidate = pickerCandidates[index - 1] || pickerCandidates.find(function(c) {
              return (c.title || title) === item.title && (c.source || '') === (item.source || '')
            })
            if (!candidate) return
            const jobId = lookup.activeJob && lookup.activeJob.status === 'awaiting'
              ? lookup.activeJob.id
              : null
            if (
              candidate.source === 'media-analysis'
              && mediaAnalysisJobHasMelodySourceNotes(mediaJob)
            ) {
              openMediaAnalysisRefine(jobId)
              return
            }
            finishApply(candidate, jobId)
            closePicker(!!jobId)
          }}
          onHide={function() {
            closePicker(true)
          }}
        />
        <MelodyAnalysisRefineModal
          show={showRefine}
          onHide={function() {
            setShowRefine(false)
            setRefineJobId(null)
          }}
          tunebook={tunebook}
          tune={tune || { id: tuneId, name: title || '' }}
          melodySourceNotes={mediaJob.melodySourceNotes}
          timedMelody={mediaJob.timedMelody}
          chordsText={mediaJob.chordsText || ''}
          onApply={function(abcText) {
            finishApply({
              abc: abcText,
              preview: abcText,
              source: 'media-analysis',
              title: 'Media analysis',
            }, refineJobId)
            setRefineJobId(null)
          }}
        />
        <LockedSourcePasteModal
          show={!!lockedModalCandidate}
          onHide={function() { setLockedModalCandidate(null) }}
          onAbandon={function() { runAbcFallbackSearch() }}
          candidate={lockedModalCandidate}
          searchTitle={title}
          searchArtist={artist}
          tunebook={tunebook}
          abcjsParser={abcjsParser}
          resolverAvailable={resolverAvailable}
          allowNotationFile={true}
          importLabel={tuneId ? 'Apply to tune' : 'Import to review'}
          onImportCandidates={tuneId && typeof onNotation === 'function'
            ? function(candidates) {
              const first = Array.isArray(candidates) ? candidates[0] : null
              if (!first || !first.tune || !tunebook || !tunebook.abcTools) {
                throw new Error('Could not apply pasted notation')
              }
              const imported = first.tune
              let abcText = ''
              try {
                abcText = tunebook.abcTools.json2abc(imported) || ''
              } catch (e) {
                abcText = ''
              }
              if (!abcText && typeof first.rawText === 'string') abcText = first.rawText
              const jobId = lookup.activeJob && lookup.activeJob.status === 'awaiting'
                ? lookup.activeJob.id
                : null
              finishApply({
                abc: abcText,
                title: imported.name || title,
                artist: imported.composer || artist || '',
                source: lockedModalCandidate && lockedModalCandidate.source
                  ? lockedModalCandidate.source
                  : 'musescore.com',
                sourceUrl: lockedModalCandidate && lockedModalCandidate.url
                  ? lockedModalCandidate.url
                  : '',
                preview: abcText,
                tune: imported,
              }, jobId)
              closePicker(!!jobId)
            }
            : undefined}
        />
      </>
    ),
  })
}
