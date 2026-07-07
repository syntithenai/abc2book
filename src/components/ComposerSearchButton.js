import { useState } from 'react'
import { Alert } from 'react-bootstrap'
import useMediaResolverHealth from '../useMediaResolverHealth'
import { discoverComposers } from '../composerSearchClient'
import {
  buildGoogleComposerSearchUrl,
  buildComposerPickerCandidates,
  getEffectiveComposerSearchHints,
} from '../composerDiscoveryUtils'
import { useCancellableAsyncJob } from '../useCancellableAsyncJob'
import SearchProgressBar from './SearchProgressBar'
import SearchResultPickerModal from './SearchResultPickerModal'
import { FieldLookupButtonGroup } from './FieldLookupButtonGroup'

export default function ComposerSearchButton({
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
  const job = useCancellableAsyncJob('Composer search')
  const [error, setError] = useState('')
  const [source, setSource] = useState('')
  const [progressMessage, setProgressMessage] = useState('')
  const [progressPercent, setProgressPercent] = useState(0)
  const [pickerCandidates, setPickerCandidates] = useState([])
  const [showPicker, setShowPicker] = useState(false)
  const { available: resolverAvailableFromHealth } = useMediaResolverHealth()
  const resolverAvailable = typeof resolverAvailableProp === 'boolean'
    ? resolverAvailableProp
    : resolverAvailableFromHealth

  const hints = getEffectiveComposerSearchHints(title, composer, titleHint)
  const effectiveTitle = hints.title
  const googleUrl = buildGoogleComposerSearchUrl(effectiveTitle, composer || hints.artistHint)
  const searchIcon = tunebook && tunebook.icons ? tunebook.icons.search : null
  const externalLinkIcon = tunebook && tunebook.icons ? tunebook.icons.externallink : null
  const busy = job.busy
  const automaticLookup = true
  const searchDisabled = disabled || !effectiveTitle

  function applyComposerResult(result) {
    if (typeof onComposer === 'function') {
      onComposer({
        artist: result.artist,
        source: result.source,
      })
    }
    const sourceLabel = result.source || ''
    setSource(sourceLabel)
    setProgressPercent(100)
  }

  function chooseComposerCandidate(candidate) {
    setShowPicker(false)
    setPickerCandidates([])
    applyComposerResult(candidate)
  }

  function presentComposerChoices(result) {
    const candidates = buildComposerPickerCandidates(result, composer)
    if (alwaysPick) {
      if (candidates.length === 0) {
        setError('Composer search returned no artist')
        return
      }
      setPickerCandidates(candidates)
      setShowPicker(true)
      return
    }
    if (result.multiple && candidates.length > 1) {
      setPickerCandidates(candidates)
      setShowPicker(true)
      return
    }
    if (candidates.length === 1) {
      applyComposerResult(candidates[0])
      return
    }
    if (result && result.artist) {
      applyComposerResult(result)
      return
    }
    setError('Composer search returned no artist')
  }

  async function run() {
    if (!effectiveTitle) return
    const ctx = job.begin()
    setError('')
    setSource('')
    setProgressMessage('')
    setProgressPercent(0)
    try {
      const result = await discoverComposers({
        title: effectiveTitle,
        artist: hints.artistHint || composer || '',
        titleHint: hints.titleHint || titleHint || title || '',
        accessToken: token,
        signal: ctx.signal,
        resolverAvailable: resolverAvailable,
        onProgress: function(message, progress) {
          if (!ctx.isCurrent()) return
          setProgressMessage(message || '')
          if (typeof progress === 'number' && Number.isFinite(progress)) {
            setProgressPercent(Math.max(0, Math.min(100, Math.round(progress * 100))))
          }
        },
      })
      if (!ctx.isCurrent()) return
      presentComposerChoices(result)
    } catch (e) {
      if (job.isAbortError(e)) return
      setError(e && e.message ? e.message : 'Composer search failed')
    } finally {
      job.finish(ctx.generation)
      if (ctx.isCurrent()) {
        setProgressMessage('')
      }
    }
  }

  return (
    <>
      <FieldLookupButtonGroup
        automaticLookup={automaticLookup}
        busy={busy}
        disabled={searchDisabled}
        externalUrl={googleUrl}
        externalLinkIcon={externalLinkIcon}
        onSearch={busy ? job.cancel : run}
        buttonStyle={buttonStyle}
        searchIcon={searchIcon}
        inline={inline}
      />
      {error ? <Alert variant="danger" className="mt-2 mb-0">{error}</Alert> : null}
      {source && !error ? (
        <Alert variant="success" className="mt-2 mb-0">Artist from {source}</Alert>
      ) : null}
      <SearchProgressBar
        visible={busy}
        percent={progressPercent}
        message={progressMessage}
        defaultMessage="Searching for composer..."
      />
      <SearchResultPickerModal
        show={showPicker}
        title="Choose composer"
        items={pickerCandidates.map(function(candidate) {
          return {
            title: candidate.artist,
            artist: candidate.source || '',
            preview: candidate.preview || candidate.artist,
            source: candidate.source || '',
          }
        })}
        onSelect={function(item) {
          chooseComposerCandidate({
            artist: item.title,
            source: item.source,
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
