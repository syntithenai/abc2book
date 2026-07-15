import { useRef, useState } from 'react'
import { Alert } from 'react-bootstrap'
import useMediaResolverHealth from '../useMediaResolverHealth'
import {
  buildGoogleComposerSearchUrl,
  getEffectiveComposerSearchHints,
  needsComposerDiscovery,
} from '../composerDiscoveryUtils'
import { useFieldLookupSearchJob } from '../useFieldLookupSearchJob'
import { applyFieldLookupChoice, buildSearchModeOptions } from '../tuneFieldLookupQueue'
import SearchProgressBar from './SearchProgressBar'
import SearchResultPickerModal from './SearchResultPickerModal'
import { FieldLookupButtonGroup } from './FieldLookupButtonGroup'

export default function ComposerSearchButton({
  tuneId,
  candidateId,
  title,
  composer,
  titleHint,
  token,
  onComposer,
  buttonStyle,
  disabled,
  tunebook,
  resolverAvailable: resolverAvailableProp,
  inline,
  alwaysPick,
}) {
  const [error, setError] = useState('')
  const [pickerCandidates, setPickerCandidates] = useState([])
  const [showPicker, setShowPicker] = useState(false)
  const { available: resolverAvailableFromHealth } = useMediaResolverHealth()
  const resolverAvailable = typeof resolverAvailableProp === 'boolean'
    ? resolverAvailableProp
    : resolverAvailableFromHealth
  const alwaysPickRef = useRef(!!alwaysPick)
  alwaysPickRef.current = !!alwaysPick
  const searchModeRef = useRef('auto')
  const composerRef = useRef(composer)
  composerRef.current = composer
  const applyRef = useRef(null)

  const hints = getEffectiveComposerSearchHints(title, composer, titleHint)
  const effectiveTitle = hints.title

  function finishApply(result, jobId) {
    if (jobId) applyFieldLookupChoice(jobId, result)
    if (typeof onComposer === 'function') {
      onComposer({
        artist: result.artist,
        source: result.source,
      })
    }
  }
  applyRef.current = finishApply

  const lookup = useFieldLookupSearchJob({
    tuneId: tuneId,
    candidateId: candidateId,
    kind: 'composer',
    onAwaiting: function(job) {
      const candidates = Array.isArray(job.candidates) ? job.candidates : []
      const forcePick = alwaysPickRef.current || searchModeRef.current === 'review'
      if (forcePick) {
        if (candidates.length === 0) {
          setError('Artist search returned no artist')
          return
        }
        setPickerCandidates(candidates)
        setShowPicker(true)
        return
      }
      if (candidates.length >= 1) {
        if (needsComposerDiscovery(composerRef.current) || searchModeRef.current === 'auto') {
          applyRef.current(candidates[0], job.id)
        } else if (candidates.length > 1) {
          setPickerCandidates(candidates)
          setShowPicker(true)
        }
        return
      }
      setError('Artist search returned no artist')
    },
    onError: function(job) {
      setError(job.error || 'Artist search failed')
    },
  })

  const googleUrl = buildGoogleComposerSearchUrl(effectiveTitle, composer || hints.artistHint)
  const searchIcon = tunebook && tunebook.icons ? tunebook.icons.search : null
  const externalLinkIcon = tunebook && tunebook.icons ? tunebook.icons.externallink : null
  const busy = lookup.busy
  const canSearch = !!(effectiveTitle && (tuneId || candidateId))
  const searchDisabled = disabled || !canSearch
  const awaitingJob = lookup.activeJob && lookup.activeJob.status === 'awaiting'
    ? lookup.activeJob
    : null
  const awaitingCandidates = awaitingJob && Array.isArray(awaitingJob.candidates)
    ? awaitingJob.candidates
    : []

  function chooseComposerCandidate(candidate) {
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

  function run(mode) {
    if (!canSearch) return
    if (busy) {
      lookup.cancel()
      return
    }
    // New Search clears prior suggestions for this kind.
    if (awaitingCandidates.length > 0) {
      clearAwaitingSuggestions()
    }
    const searchMode = mode === 'review' ? 'review' : 'auto'
    searchModeRef.current = searchMode
    setError('')
    setShowPicker(false)
    setPickerCandidates([])
    lookup.startSearch({
      title: effectiveTitle,
      artist: hints.artistHint || composer || '',
      titleHint: hints.titleHint || titleHint || title || '',
      tuneName: effectiveTitle,
      accessToken: token,
      options: buildSearchModeOptions(searchMode, {
        alwaysPick: !!alwaysPick || searchMode === 'review',
        currentComposer: composer || '',
      }),
      searchOptions: {
        resolverAvailable: resolverAvailable,
      },
    })
  }

  return (
    <>
      <FieldLookupButtonGroup
        automaticLookup={true}
        showExternal={false}
        busy={busy}
        disabled={searchDisabled}
        externalUrl={googleUrl}
        externalLinkIcon={externalLinkIcon}
        onSearch={run}
        suggestionCount={awaitingCandidates.length}
        onClearSuggestions={clearAwaitingSuggestions}
        onOpenSuggestions={openAwaitingSuggestions}
        buttonStyle={buttonStyle}
        searchIcon={searchIcon}
        inline={inline}
        progress={lookup.progressPercent}
      />
      {error ? <Alert variant="danger" className="mt-2 mb-0">{error}</Alert> : null}
      <SearchProgressBar
        visible={busy}
        percent={lookup.progressPercent}
        message={lookup.progressMessage}
        defaultMessage="Searching for artist..."
      />
      <SearchResultPickerModal
        show={showPicker}
        title="Choose artist"
        items={pickerCandidates.map(function(candidate) {
          const role = candidate.role === 'writer'
            ? 'Writer'
            : (candidate.role === 'performer' ? 'Performer' : '')
          return {
            title: candidate.artist,
            artist: role,
            preview: candidate.preview || candidate.artist,
            source: candidate.source || role,
          }
        })}
        onSelect={function(item) {
          chooseComposerCandidate({
            artist: item.title,
            source: item.source,
            role: item.artist === 'Writer' ? 'writer' : (item.artist === 'Performer' ? 'performer' : ''),
          })
        }}
        onHide={function() {
          setShowPicker(false)
          setPickerCandidates([])
        }}
      />
    </>
  )
}
