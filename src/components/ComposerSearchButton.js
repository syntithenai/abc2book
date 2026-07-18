import { useRef, useState } from 'react'
import { Alert } from 'react-bootstrap'
import useMediaResolverHealth from '../useMediaResolverHealth'
import {
  buildGoogleComposerSearchUrl,
  getEffectiveComposerSearchHints,
  needsComposerDiscovery,
  shouldOfferTitleSuggestion,
} from '../composerDiscoveryUtils'
import { normalizeArtistKey } from '../genericArtistUtils'
import { useFieldLookupSearchJob } from '../useFieldLookupSearchJob'
import {
  applyFieldLookupChoice,
  buildSearchModeOptions,
  dismissFieldLookup,
  getAwaitingJob,
  offerSideFieldSuggestion,
} from '../tuneFieldLookupQueue'
import { useFieldSearchResults } from '../useFieldSearchResults'
import { setFieldSearchResults, targetKeyForFieldSearch } from '../fieldSearchResultCache'
import SearchProgressBar from './SearchProgressBar'
import SearchResultPickerModal from './SearchResultPickerModal'
import { FieldLookupButtonGroup } from './FieldLookupButtonGroup'
import FieldSearchResultsCaret from './FieldSearchResultsCaret'
import { renderFieldLookupSearchUi } from './fieldLookupSearchUi'
import { useOpenFieldSuggestions } from './useOpenFieldSuggestions'
import {
  buildPickerOriginalValueItem,
  resolveOriginalValueForPicker,
  searchableSuggestions,
} from '../fieldSuggestionsUtils'

function splitComposerSearchCandidates(candidates) {
  const list = Array.isArray(candidates) ? candidates : []
  const writers = []
  const performers = []
  list.forEach(function(candidate) {
    if (!candidate || !candidate.artist) return
    if (candidate.role === 'performer') {
      performers.push(candidate)
    } else {
      // Writers and unlabeled results go to the composer picker.
      writers.push(candidate)
    }
  })
  return {
    composerCandidates: writers.length > 0 ? writers : list.slice(),
    artistCandidates: performers,
  }
}

function filterArtistCandidates(artistCandidates, options) {
  const existing = Array.isArray(options && options.existingArtists)
    ? options.existingArtists
    : []
  const exclude = {}
  existing.forEach(function(name) {
    const key = normalizeArtistKey(name)
    if (key) exclude[key] = true
  })
  const chosenComposer = String(options && options.chosenComposer || '').trim()
  if (chosenComposer) {
    const key = normalizeArtistKey(chosenComposer)
    if (key) exclude[key] = true
  }
  return (Array.isArray(artistCandidates) ? artistCandidates : []).filter(function(candidate) {
    const key = normalizeArtistKey(candidate && candidate.artist)
    return !!(key && !exclude[key])
  })
}

export default function ComposerSearchButton({
  tuneId,
  candidateId,
  title,
  composer,
  titleHint,
  token,
  onComposer,
  onAddArtist,
  onSuggestedTitle,
  onPerformerCandidates,
  onComposerCandidates,
  existingArtists,
  buttonStyle,
  disabled,
  tunebook,
  resolverAvailable: resolverAvailableProp,
  inline,
  alwaysPick,
  /** Autofill when exactly one composer; open choice dialog only when multiple. */
  pickWhenMultiple = false,
  /** Do not open the performers multi-select dialog. */
  skipArtistPicker = false,
  children,
}) {
  const [error, setError] = useState('')
  const [composerPickerCandidates, setComposerPickerCandidates] = useState([])
  const [showComposerPicker, setShowComposerPicker] = useState(false)
  const [artistPickerCandidates, setArtistPickerCandidates] = useState([])
  const [pendingArtistCandidates, setPendingArtistCandidates] = useState([])
  const [showArtistPicker, setShowArtistPicker] = useState(false)
  const [selectedArtistIndexes, setSelectedArtistIndexes] = useState([])
  const [artistPickerComment, setArtistPickerComment] = useState('')
  const [titlePickerCandidates, setTitlePickerCandidates] = useState([])
  const [showTitlePicker, setShowTitlePicker] = useState(false)
  const { available: resolverAvailableFromHealth } = useMediaResolverHealth()
  const resolverAvailable = typeof resolverAvailableProp === 'boolean'
    ? resolverAvailableProp
    : resolverAvailableFromHealth
  const alwaysPickRef = useRef(!!alwaysPick)
  alwaysPickRef.current = !!alwaysPick
  const pickWhenMultipleRef = useRef(!!pickWhenMultiple)
  pickWhenMultipleRef.current = !!pickWhenMultiple
  const skipArtistPickerRef = useRef(!!skipArtistPicker)
  skipArtistPickerRef.current = !!skipArtistPicker
  /** Only chain to artists picker after an auto-opened post-search composer dialog. */
  const chainArtistPickerRef = useRef(false)
  const searchModeRef = useRef('auto')
  const composerRef = useRef(composer)
  composerRef.current = composer
  const existingArtistsRef = useRef(existingArtists)
  existingArtistsRef.current = existingArtists
  const applyRef = useRef(null)
  const artistsAddedRef = useRef(false)
  const onPerformerCandidatesRef = useRef(onPerformerCandidates)
  onPerformerCandidatesRef.current = onPerformerCandidates
  const onComposerCandidatesRef = useRef(onComposerCandidates)
  onComposerCandidatesRef.current = onComposerCandidates
  const onSuggestedTitleRef = useRef(onSuggestedTitle)
  onSuggestedTitleRef.current = onSuggestedTitle
  const titleRef = useRef(title)
  titleRef.current = title
  const cachedCandidates = useFieldSearchResults(tuneId, candidateId, 'composer')
  const fieldEmpty = needsComposerDiscovery(composer)

  const hints = getEffectiveComposerSearchHints(title, composer, titleHint)
  const effectiveTitle = hints.title

  function notifyTitleApplied(nextTitle, source) {
    if (typeof onSuggestedTitleRef.current !== 'function') return
    if (!nextTitle) {
      onSuggestedTitleRef.current(null)
      return
    }
    onSuggestedTitleRef.current({
      title: nextTitle,
      source: source || 'MusicBrainz',
    })
  }

  function emitSuggestedTitle(job) {
    const suggested = job && job.suggestedTitle ? String(job.suggestedTitle).trim() : ''
    if (!shouldOfferTitleSuggestion(titleRef.current, suggested)) return
    const candidate = {
      title: suggested,
      source: 'MusicBrainz',
      preview: suggested,
    }
    if (!tuneId && !candidateId) {
      notifyTitleApplied(suggested, 'MusicBrainz')
      return
    }
    offerSideFieldSuggestion({
      tuneId: tuneId,
      candidateId: candidateId,
      kind: 'title',
      candidate: candidate,
      currentValue: titleRef.current,
      title: titleRef.current,
      onApplied: function(applied) {
        notifyTitleApplied(applied && applied.title, applied && applied.source)
      },
    })
  }

  function openTitleSuggestions() {
    const targetKey = tuneId
      ? ('tune:' + String(tuneId))
      : (candidateId ? ('candidate:' + String(candidateId)) : '')
    if (!targetKey) return
    const job = getAwaitingJob(targetKey, 'title')
    const candidates = searchableSuggestions(job)
    if (!candidates.length) return
    setTitlePickerCandidates(candidates)
    setShowTitlePicker(true)
  }

  useOpenFieldSuggestions(tuneId, 'title', openTitleSuggestions)

  function chooseTitleCandidate(candidate) {
    setShowTitlePicker(false)
    setTitlePickerCandidates([])
    const targetKey = tuneId
      ? ('tune:' + String(tuneId))
      : (candidateId ? ('candidate:' + String(candidateId)) : '')
    const job = targetKey ? getAwaitingJob(targetKey, 'title') : null
    if (job) applyFieldLookupChoice(job.id, candidate)
    notifyTitleApplied(candidate && candidate.title, candidate && candidate.source)
  }

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

  function emitComposerCandidates(composers) {
    if (typeof onComposerCandidatesRef.current !== 'function') return
    onComposerCandidatesRef.current((Array.isArray(composers) ? composers : []).map(function(item) {
      return item && item.artist ? item.artist : ''
    }).filter(Boolean))
  }

  function cacheComposerResults(composers) {
    const key = targetKeyForFieldSearch(tuneId, candidateId)
    if (!key) return
    if (Array.isArray(composers) && composers.length > 0) {
      setFieldSearchResults(key, 'composer', composers)
    }
  }

  function emitPerformers(candidates, chosenComposer) {
    const filtered = filterArtistCandidates(candidates, {
      existingArtists: existingArtistsRef.current,
      chosenComposer: chosenComposer || composerRef.current || '',
    })
    const key = targetKeyForFieldSearch(tuneId, candidateId)
    if (key && filtered.length > 0) {
      setFieldSearchResults(key, 'artists', filtered)
    }
    if (typeof onPerformerCandidatesRef.current === 'function') {
      onPerformerCandidatesRef.current(filtered.map(function(item) {
        return item && item.artist ? item.artist : ''
      }).filter(Boolean))
    }
    return filtered
  }

  function openComposerPicker(composers, artistCandidates, options) {
    const opts = options || {}
    chainArtistPickerRef.current = !!opts.chainArtists
    setPendingArtistCandidates(Array.isArray(artistCandidates) ? artistCandidates : [])
    setComposerPickerCandidates(Array.isArray(composers) ? composers : [])
    setShowComposerPicker(true)
  }

  function maybeOpenArtistPicker(candidates, chosenComposer, options) {
    const opts = options || {}
    const filtered = emitPerformers(candidates, chosenComposer)
    setPendingArtistCandidates([])
    if (skipArtistPickerRef.current) {
      setShowArtistPicker(false)
      setArtistPickerCandidates([])
      setSelectedArtistIndexes([])
      setArtistPickerComment('')
      return
    }
    if (filtered.length === 0 || typeof onAddArtist !== 'function') {
      setShowArtistPicker(false)
      setArtistPickerCandidates([])
      setSelectedArtistIndexes([])
      setArtistPickerComment('')
      return
    }
    artistsAddedRef.current = false
    setSelectedArtistIndexes([])
    setArtistPickerCandidates(filtered)
    const autoFilled = String(opts.composerAutoFilled || '').trim()
    setArtistPickerComment(autoFilled
      ? (
        'Composer was empty, so it was set to "'
        + autoFilled
        + '". Choose any performing artists to add below, or Done if none apply.'
      )
      : '')
    setShowArtistPicker(true)
  }

  function autoApplyComposerThenArtists(composers, artistCandidates, jobId) {
    const wasBlank = needsComposerDiscovery(composerRef.current)
    const chosen = composers && composers[0]
    applyRef.current(chosen, jobId)
    maybeOpenArtistPicker(artistCandidates, chosen && chosen.artist, {
      composerAutoFilled: wasBlank ? (chosen && chosen.artist) : '',
    })
  }

  function closeComposerPicker() {
    setShowComposerPicker(false)
    setComposerPickerCandidates([])
  }

  function closeArtistPicker() {
    setShowArtistPicker(false)
    setArtistPickerCandidates([])
    setSelectedArtistIndexes([])
    setPendingArtistCandidates([])
    setArtistPickerComment('')
  }

  const lookup = useFieldLookupSearchJob({
    tuneId: tuneId,
    candidateId: candidateId,
    kind: 'composer',
    onAwaiting: function(job) {
      emitSuggestedTitle(job)
      const candidates = Array.isArray(job.candidates) ? job.candidates : []
      const split = splitComposerSearchCandidates(candidates)
      const composers = split.composerCandidates
      const applied = job.appliedCandidate
      emitComposerCandidates(composers.length ? composers : (applied && applied.artist ? [applied] : []))
      cacheComposerResults(composers.length ? composers : (applied && applied.artist ? [applied] : []))

      if (composers.length === 0 && !(applied && applied.artist)) {
        setError('Artist search returned no artist')
        emitPerformers(split.artistCandidates, composerRef.current)
        return
      }
      setError('')

      // Auto-applied (empty field) or already settled: sync form, then one-shot performers.
      if (job.status === 'done' || (applied && fieldEmpty)) {
        if (applied && typeof onComposer === 'function') {
          onComposer({
            artist: applied.artist,
            source: applied.source,
          })
        }
        maybeOpenArtistPicker(
          split.artistCandidates,
          (applied && applied.artist) || (composers[0] && composers[0].artist)
        )
        return
      }

      if (pickWhenMultipleRef.current) {
        if (composers.length === 1) {
          autoApplyComposerThenArtists(composers, split.artistCandidates, job.id)
          return
        }
        openComposerPicker(composers, split.artistCandidates, { chainArtists: true })
        return
      }

      if (alwaysPickRef.current || searchModeRef.current === 'review') {
        openComposerPicker(composers, split.artistCandidates, { chainArtists: true })
        return
      }

      // Empty field: auto-apply first composer, then chain performers.
      if (needsComposerDiscovery(composerRef.current)) {
        autoApplyComposerThenArtists(composers, split.artistCandidates, job.id)
        return
      }

      // Non-empty: one-shot composer picker.
      openComposerPicker(composers, split.artistCandidates, { chainArtists: true })
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

  function dismissAwaitingIfNeeded() {
    if (lookup.activeJob && lookup.activeJob.status === 'awaiting') {
      dismissFieldLookup(lookup.activeJob.id)
    }
  }

  function chooseComposerCandidate(candidate) {
    const chainArtists = chainArtistPickerRef.current
    chainArtistPickerRef.current = false
    const artists = pendingArtistCandidates
    closeComposerPicker()
    const jobId = lookup.activeJob && lookup.activeJob.status === 'awaiting'
      ? lookup.activeJob.id
      : null
    finishApply(candidate, jobId)
    if (chainArtists) {
      maybeOpenArtistPicker(artists, candidate && candidate.artist)
    } else {
      setPendingArtistCandidates([])
    }
  }

  function hideComposerPicker() {
    const chainArtists = chainArtistPickerRef.current
    chainArtistPickerRef.current = false
    const artists = pendingArtistCandidates
    closeComposerPicker()
    dismissAwaitingIfNeeded()
    if (chainArtists) {
      maybeOpenArtistPicker(artists, composerRef.current)
    } else {
      setPendingArtistCandidates([])
    }
  }

  function openCachedComposerPicker(candidates) {
    setError('')
    const split = splitComposerSearchCandidates(candidates)
    openComposerPicker(
      split.composerCandidates.length ? split.composerCandidates : candidates,
      split.artistCandidates,
      { chainArtists: false }
    )
  }

  function run(mode) {
    if (!canSearch) return
    if (busy) {
      lookup.cancel()
      return
    }
    if (awaitingJob) dismissFieldLookup(awaitingJob.id)
    const searchMode = mode === 'review' ? 'review' : 'auto'
    searchModeRef.current = searchMode
    setError('')
    chainArtistPickerRef.current = false
    closeComposerPicker()
    closeArtistPicker()
    const titleTarget = tuneId
      ? ('tune:' + String(tuneId))
      : (candidateId ? ('candidate:' + String(candidateId)) : '')
    if (titleTarget) {
      const titleJob = getAwaitingJob(titleTarget, 'title')
      if (titleJob) dismissFieldLookup(titleJob.id)
    }
    setShowTitlePicker(false)
    setTitlePickerCandidates([])
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

  function mapCandidateItems(candidates) {
    return candidates.map(function(candidate) {
      const role = candidate.role === 'writer'
        ? 'Writer'
        : (candidate.role === 'performer' ? 'Performer' : '')
      return {
        title: candidate.artist,
        artist: role,
        preview: candidate.preview || candidate.artist,
        source: candidate.source || role,
        matchType: role || candidate.source || '',
      }
    })
  }

  const originalValue = resolveOriginalValueForPicker(awaitingJob, composer || '')
  const titleOriginalValue = resolveOriginalValueForPicker(
    getAwaitingJob(
      tuneId ? ('tune:' + String(tuneId)) : (candidateId ? ('candidate:' + String(candidateId)) : ''),
      'title'
    ),
    title || ''
  )

  const resultsCaret = (
    <FieldSearchResultsCaret
      candidates={cachedCandidates}
      className="select-input-options-dropdown"
      openPickerOnToggle={true}
      onOpen={openCachedComposerPicker}
      aria-label="Cached composer search results"
      data-testid="composer-search-results-caret"
    />
  )

  const buttonGroup = (
    <>
      <FieldLookupButtonGroup
        automaticLookup={true}
        showExternal={!!(googleUrl && externalLinkIcon)}
        busy={busy}
        disabled={searchDisabled}
        externalUrl={googleUrl}
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
        defaultMessage="Searching for artist..."
      />
    </>
  )

  const modals = (
    <>
      <SearchResultPickerModal
        show={showComposerPicker}
        title="Choose composer"
        items={[
          buildPickerOriginalValueItem({ value: originalValue }),
        ].concat(mapCandidateItems(composerPickerCandidates))}
        onSelect={function(item, index) {
          if (item && item.__current) {
            hideComposerPicker()
            return
          }
          const candidate = composerPickerCandidates[index - 1] || {
            artist: item.title,
            source: item.source,
            role: item.artist === 'Writer' ? 'writer' : (item.artist === 'Performer' ? 'performer' : ''),
          }
          chooseComposerCandidate(candidate)
        }}
        onHide={hideComposerPicker}
      />
      <SearchResultPickerModal
        show={showArtistPicker}
        title="Choose artists to add"
        comment={artistPickerComment}
        multiSelect={true}
        selectedIndexes={selectedArtistIndexes}
        items={mapCandidateItems(artistPickerCandidates)}
        onSelect={function(item, index) {
          let alreadySelected = false
          setSelectedArtistIndexes(function(prev) {
            if (prev.indexOf(index) >= 0) {
              alreadySelected = true
              return prev
            }
            return prev.concat([index])
          })
          if (alreadySelected) return
          if (typeof onAddArtist === 'function' && item && item.title) {
            onAddArtist(item.title)
            artistsAddedRef.current = true
          }
        }}
        onDone={closeArtistPicker}
        onHide={closeArtistPicker}
      />
      <SearchResultPickerModal
        show={showTitlePicker}
        title="Choose title"
        items={[
          buildPickerOriginalValueItem({ value: titleOriginalValue }),
        ].concat(titlePickerCandidates.map(function(candidate) {
          return {
            title: candidate.title,
            artist: candidate.source || '',
            preview: candidate.preview || candidate.title,
            source: candidate.source || '',
            matchType: candidate.source || '',
          }
        }))}
        onSelect={function(item, index) {
          if (item && item.__current) {
            setShowTitlePicker(false)
            setTitlePickerCandidates([])
            return
          }
          const candidate = titlePickerCandidates[index - 1] || {
            title: item && item.title,
            source: item && item.source,
          }
          chooseTitleCandidate(candidate)
        }}
        onHide={function() {
          setShowTitlePicker(false)
          setTitlePickerCandidates([])
        }}
      />
    </>
  )

  return renderFieldLookupSearchUi({
    children: children,
    buttonGroup: buttonGroup,
    suggestionsDropdown: null,
    errorNode: error ? <Alert variant="danger" className="mt-2 mb-0">{error}</Alert> : null,
    modals: modals,
    busy: busy,
  })
}

export {
  splitComposerSearchCandidates,
  filterArtistCandidates,
}
