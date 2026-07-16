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
import SearchProgressBar from './SearchProgressBar'
import SearchResultPickerModal from './SearchResultPickerModal'
import { FieldLookupButtonGroup } from './FieldLookupButtonGroup'
import { renderFieldLookupSearchUi } from './fieldLookupSearchUi'
import { useOpenFieldSuggestions } from './useOpenFieldSuggestions'
import { useSyncFieldLookupOriginalValue } from './useSyncFieldLookupOriginalValue'
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
  /** Hide Clear/Suggestions chrome on the Search button group. */
  showSuggestionsChrome = true,
  children,
}) {
  const [error, setError] = useState('')
  const [composerPickerCandidates, setComposerPickerCandidates] = useState([])
  const [showComposerPicker, setShowComposerPicker] = useState(false)
  const [artistPickerCandidates, setArtistPickerCandidates] = useState([])
  const [pendingArtistCandidates, setPendingArtistCandidates] = useState([])
  const [showArtistPicker, setShowArtistPicker] = useState(false)
  const [selectedArtistIndexes, setSelectedArtistIndexes] = useState([])
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

  function emitPerformers(candidates, chosenComposer) {
    const filtered = filterArtistCandidates(candidates, {
      existingArtists: existingArtistsRef.current,
      chosenComposer: chosenComposer || composerRef.current || '',
    })
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

  function maybeOpenArtistPicker(candidates, chosenComposer) {
    const filtered = emitPerformers(candidates, chosenComposer)
    setPendingArtistCandidates([])
    if (skipArtistPickerRef.current) {
      setShowArtistPicker(false)
      setArtistPickerCandidates([])
      setSelectedArtistIndexes([])
      return
    }
    if (filtered.length === 0 || typeof onAddArtist !== 'function') {
      setShowArtistPicker(false)
      setArtistPickerCandidates([])
      setSelectedArtistIndexes([])
      return
    }
    artistsAddedRef.current = false
    setSelectedArtistIndexes([])
    setArtistPickerCandidates(filtered)
    setShowArtistPicker(true)
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
  }

  const lookup = useFieldLookupSearchJob({
    tuneId: tuneId,
    candidateId: candidateId,
    kind: 'composer',
    onAwaiting: function(job) {
      emitSuggestedTitle(job)
      const candidates = Array.isArray(job.candidates) ? job.candidates : []
      const split = splitComposerSearchCandidates(candidates)
      const forcePick = alwaysPickRef.current || searchModeRef.current === 'review'
      const composers = split.composerCandidates
      emitComposerCandidates(composers)
      if (composers.length === 0) {
        setError('Artist search returned no artist')
        emitPerformers(split.artistCandidates, composerRef.current)
        return
      }
      if (pickWhenMultipleRef.current) {
        if (composers.length === 1) {
          applyRef.current(composers[0], job.id)
          maybeOpenArtistPicker(split.artistCandidates, composers[0] && composers[0].artist)
          return
        }
        openComposerPicker(composers, split.artistCandidates, { chainArtists: true })
        return
      }
      if (forcePick) {
        openComposerPicker(composers, split.artistCandidates, { chainArtists: true })
        return
      }
      if (needsComposerDiscovery(composerRef.current) || searchModeRef.current === 'auto') {
        applyRef.current(composers[0], job.id)
        maybeOpenArtistPicker(split.artistCandidates, composers[0] && composers[0].artist)
        return
      }
      if (composers.length > 1) {
        openComposerPicker(composers, split.artistCandidates, { chainArtists: true })
        return
      }
      applyRef.current(composers[0], job.id)
      maybeOpenArtistPicker(split.artistCandidates, composers[0] && composers[0].artist)
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
  const awaitingCandidates = searchableSuggestions(awaitingJob)

  useSyncFieldLookupOriginalValue(tuneId, 'composer', composer, awaitingJob)

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
    if (chainArtists) {
      maybeOpenArtistPicker(artists, composerRef.current)
    } else {
      setPendingArtistCandidates([])
    }
  }

  function openAwaitingSuggestions() {
    if (awaitingCandidates.length === 0) return
    setError('')
    const split = splitComposerSearchCandidates(awaitingCandidates)
    openComposerPicker(split.composerCandidates, split.artistCandidates, { chainArtists: false })
  }

  useOpenFieldSuggestions(tuneId, 'composer', openAwaitingSuggestions)

  function clearAwaitingSuggestions() {
    chainArtistPickerRef.current = false
    lookup.dismiss()
    closeComposerPicker()
    closeArtistPicker()
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
        suggestionCount={showSuggestionsChrome ? awaitingCandidates.length : 0}
        onOpenSuggestions={showSuggestionsChrome ? openAwaitingSuggestions : undefined}
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
  })
}

export {
  splitComposerSearchCandidates,
  filterArtistCandidates,
}
