import { useState } from 'react'
import { Alert, Button, ButtonGroup, ToggleButton } from 'react-bootstrap'
import useMediaResolverHealth from '../useMediaResolverHealth'
import { searchChords } from '../chordsSearchClient'
import { buildGoogleChordsSearchUrl } from '../chordSearchSites'
import { useCancellableAsyncJob } from '../useCancellableAsyncJob'
import SearchProgressBar from './SearchProgressBar'
import SearchResultPickerModal from './SearchResultPickerModal'

export default function ChordsSearchButton({
  title,
  artist,
  token,
  onChords,
  onLyrics,
  extraQuery,
  buttonStyle,
  disabled,
  showLyricsCheckbox = true,
  defaultUpdateLyrics = true,
}) {
  const job = useCancellableAsyncJob()
  const [error, setError] = useState('')
  const [source, setSource] = useState('')
  const [progressMessage, setProgressMessage] = useState('')
  const [progressPercent, setProgressPercent] = useState(0)
  const [updateLyrics, setUpdateLyrics] = useState(defaultUpdateLyrics)
  const [pickerCandidates, setPickerCandidates] = useState([])
  const [showPicker, setShowPicker] = useState(false)
  const { available: resolverAvailable } = useMediaResolverHealth()

  const googleUrl = buildGoogleChordsSearchUrl(title, artist, extraQuery)
  const busy = job.busy

  function applyChordResult(result) {
    if (typeof onChords === 'function') {
      onChords(result)
    }
    if (updateLyrics && typeof onLyrics === 'function') {
      onLyrics({
        lines: result.lyricLines,
        text: result.lyricText,
        source: result.source,
        sourceUrl: result.sourceUrl,
      })
    }
    const sourceLabel = result.source
      ? (result.sourceUrl ? result.source + ' (' + result.sourceUrl + ')' : result.source)
      : ''
    setSource(sourceLabel)
    setProgressPercent(100)
  }

  function chooseChordCandidate(candidate) {
    setShowPicker(false)
    setPickerCandidates([])
    applyChordResult(candidate)
  }

  async function run() {
    if (!title) return
    const ctx = job.begin()
    setError('')
    setSource('')
    setProgressMessage('')
    setProgressPercent(0)
    try {
      const result = await searchChords({
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
          applyChordResult(result.candidates[0])
        } else {
          setPickerCandidates(result.candidates)
          setShowPicker(true)
        }
      } else {
        applyChordResult(result)
      }
    } catch (e) {
      if (job.isAbortError(e)) return
      setError(e && e.message ? e.message : 'Chords search failed')
    } finally {
      job.finish(ctx.generation)
      if (ctx.isCurrent()) {
        setProgressMessage('')
      }
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
      <ButtonGroup>
        {resolverAvailable
          ? <Button
              style={buttonStyle}
              variant={busy ? 'warning' : undefined}
              disabled={!title || disabled}
              onClick={function() { job.onTriggerClick(run) }}
            >
              {busy ? 'Cancel' : 'Search Chords'}
            </Button>
          : (disabled
              ? <Button style={buttonStyle} disabled>Search Chords</Button>
              : <a target="_new" rel="noreferrer" href={googleUrl}>
                  <Button style={buttonStyle}>Search Chords</Button>
                </a>)}
        {showLyricsCheckbox && (
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
        percent={progressPercent}
        message={progressMessage}
        defaultMessage="Searching for chords..."
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
          Chords imported from {source}
          {showLyricsCheckbox && updateLyrics ? ' with synced lyrics.' : '.'}
        </Alert>
      )}

      <SearchResultPickerModal
        show={showPicker}
        title="Choose chord sheet"
        items={pickerCandidates}
        fallbackTitle={title}
        emptyMessage="No chord sheets were found."
        onSelect={chooseChordCandidate}
        onHide={function() {
          setShowPicker(false)
          setPickerCandidates([])
        }}
      />
    </div>
  )
}
