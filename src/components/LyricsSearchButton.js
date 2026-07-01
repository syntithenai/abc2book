import { useState } from 'react'
import { Alert, Button } from 'react-bootstrap'
import useMediaResolverHealth from '../useMediaResolverHealth'
import { useIsNarrowViewport } from '../useMediaQuery'
import { searchLyrics } from '../lyricsSearchClient'
import { useCancellableAsyncJob } from '../useCancellableAsyncJob'
import SearchProgressBar from './SearchProgressBar'
import SearchResultPickerModal from './SearchResultPickerModal'

const DEFAULT_SEARCH_ICON = (
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
    <path fill="none" d="M0 0h24v24H0z" />
    <path d="M18.031 16.617l4.283 4.282-1.415 1.415-4.282-4.283A8.96 8.96 0 0 1 11 20c-4.968 0-9-4.032-9-9s4.032-9 9-9 9 4.032 9 9a8.96 8.96 0 0 1-1.969 5.617zm-2.006-.742A6.977 6.977 0 0 0 18 11c0-3.868-3.133-7-7-7-3.868 0-7 3.132-7 7 0 3.867 3.132 7 7 7a6.977 6.977 0 0 0 4.875-1.975l.15-.15z" />
  </svg>
)

export function buildGoogleLyricsSearchUrl(title, artist, extraQuery) {
  return 'https://www.google.com/search?q=lyrics '
    + (title || '')
    + ' '
    + (artist || '')
    + (extraQuery ? ' ' + extraQuery : '')
}

export default function LyricsSearchButton({
  title,
  artist,
  token,
  onLyrics,
  extraQuery,
  buttonStyle,
  disabled,
  tunebook,
}) {
  const narrow = useIsNarrowViewport()
  const job = useCancellableAsyncJob()
  const [error, setError] = useState('')
  const [source, setSource] = useState('')
  const [progressMessage, setProgressMessage] = useState('')
  const [progressPercent, setProgressPercent] = useState(0)
  const [pickerCandidates, setPickerCandidates] = useState([])
  const [showPicker, setShowPicker] = useState(false)
  const { available: resolverAvailable } = useMediaResolverHealth()

  const googleUrl = buildGoogleLyricsSearchUrl(title, artist, extraQuery)
  const searchIcon = tunebook && tunebook.icons ? tunebook.icons.search : DEFAULT_SEARCH_ICON
  const busy = job.busy
  const label = busy ? 'Cancel' : 'Search Lyrics'
  const buttonContent = (
    <>
      {searchIcon}
      {!narrow && <> {label}</>}
    </>
  )

  function applyLyricsResult(result) {
    if (typeof onLyrics === 'function') {
      onLyrics(result)
    }
    const sourceLabel = result.source
      ? (result.sourceUrl ? result.source + ' (' + result.sourceUrl + ')' : result.source)
      : ''
    setSource(sourceLabel)
    setProgressPercent(100)
  }

  function chooseLyricsCandidate(candidate) {
    setShowPicker(false)
    setPickerCandidates([])
    applyLyricsResult(candidate)
  }

  async function run() {
    if (!title) return
    const ctx = job.begin()
    setError('')
    setSource('')
    setProgressMessage('')
    setProgressPercent(0)
    try {
      const result = await searchLyrics({
        title: title,
        artist: artist || '',
        accessToken: token,
        signal: ctx.signal,
        onProgress: function(message, progress) {
          if (!ctx.isCurrent()) return
          setProgressMessage(message || '')
          if (typeof progress === 'number' && Number.isFinite(progress)) {
            setProgressPercent(Math.max(0, Math.min(100, Math.round(progress * 100))))
          }
        },
      })
      if (!ctx.isCurrent()) return
      if (result.multiple && Array.isArray(result.candidates)) {
        if (result.candidates.length === 1) {
          applyLyricsResult(result.candidates[0])
        } else {
          setPickerCandidates(result.candidates)
          setShowPicker(true)
        }
      } else {
        applyLyricsResult(result)
      }
    } catch (e) {
      if (job.isAbortError(e)) return
      setError(e && e.message ? e.message : 'Lyrics search failed')
    } finally {
      job.finish(ctx.generation)
      if (ctx.isCurrent()) {
        setProgressMessage('')
      }
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
      {resolverAvailable
        ? <Button
            style={buttonStyle}
            variant={busy ? 'warning' : undefined}
            disabled={!title || disabled}
            onClick={function() { job.onTriggerClick(run) }}
          >
            {buttonContent}
          </Button>
        : (disabled
            ? <Button style={buttonStyle} disabled>{buttonContent}</Button>
            : <a target="_new" rel="noreferrer" href={googleUrl}>
                <Button style={buttonStyle}>{buttonContent}</Button>
              </a>)}
      <SearchProgressBar
        visible={busy}
        percent={progressPercent}
        message={progressMessage}
        defaultMessage="Searching for lyrics..."
      />
      {error && (
        <Alert variant="danger" style={{ marginTop: '0.75em', clear: 'both' }}>
          {error}
          {resolverAvailable && (
            <div style={{ marginTop: '0.5em' }}>
              <a target="_new" rel="noreferrer" href={googleUrl}>Open web search instead</a>
            </div>
          )}
        </Alert>
      )}
      {source && !error && (
        <Alert variant="success" style={{ marginTop: '0.75em', clear: 'both' }}>
          Lyrics imported from {source}
        </Alert>
      )}

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
    </div>
  )
}
