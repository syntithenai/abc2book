import { useRef, useState } from 'react'
import { Alert } from 'react-bootstrap'
import { useFieldLookupSearchJob } from '../useFieldLookupSearchJob'
import { applyFieldLookupChoice, buildSearchModeOptions } from '../tuneFieldLookupQueue'
import { buildGoogleGenreSearchUrl } from '../genreSearchClient'
import SearchProgressBar from './SearchProgressBar'
import SearchResultPickerModal from './SearchResultPickerModal'
import { FieldLookupButtonGroup } from './FieldLookupButtonGroup'

export default function GenreSearchButton({
  tuneId,
  candidateId,
  title,
  artist,
  rhythm,
  currentGenre,
  backgroundInfo,
  onGenre,
  buttonStyle,
  disabled,
  tunebook,
  inline,
}) {
  const [error, setError] = useState('')
  const [source, setSource] = useState('')
  const [pickerCandidates, setPickerCandidates] = useState([])
  const [showPicker, setShowPicker] = useState(false)
  const searchModeRef = useRef('auto')
  const applyRef = useRef(null)

  function finishApply(result, jobId) {
    if (jobId) applyFieldLookupChoice(jobId, result)
    if (typeof onGenre === 'function' && result && result.genre) {
      onGenre(result.genre)
    }
    setSource(result && result.source ? result.source : '')
  }
  applyRef.current = finishApply

  const lookup = useFieldLookupSearchJob({
    tuneId: tuneId,
    candidateId: candidateId,
    kind: 'genre',
    onAwaiting: function(job) {
      const candidates = Array.isArray(job.candidates) ? job.candidates : []
      if (searchModeRef.current === 'review') {
        if (candidates.length === 0) {
          setError('No genre suggestions found')
          return
        }
        setPickerCandidates(candidates)
        setShowPicker(true)
        return
      }
      if (candidates.length >= 1) {
        applyRef.current(candidates[0], job.id)
        return
      }
      setError('No genre suggestions found')
    },
    onError: function(job) {
      setError(job.error || 'Genre search failed')
    },
  })

  const googleUrl = buildGoogleGenreSearchUrl(title, artist)
  const searchIcon = tunebook && tunebook.icons ? tunebook.icons.search : null
  const externalLinkIcon = tunebook && tunebook.icons ? tunebook.icons.externallink : null
  const busy = lookup.busy
  const canSearch = !!(title && (tuneId || candidateId))

  function run(mode) {
    if (!canSearch) return
    if (busy) {
      lookup.cancel()
      return
    }
    const searchMode = mode === 'review' ? 'review' : 'auto'
    searchModeRef.current = searchMode
    setError('')
    setSource('')
    setShowPicker(false)
    setPickerCandidates([])
    lookup.startSearch({
      title: title,
      artist: artist || '',
      tuneName: title,
      options: buildSearchModeOptions(searchMode, {
        rhythm: rhythm || '',
        currentGenre: currentGenre || '',
        backgroundInfo: backgroundInfo || '',
      }),
    })
  }

  return (
    <>
      <FieldLookupButtonGroup
        automaticLookup={true}
        busy={busy}
        disabled={!canSearch || disabled}
        externalUrl={googleUrl}
        externalLinkIcon={externalLinkIcon}
        onSearch={run}
        buttonStyle={buttonStyle}
        searchIcon={searchIcon}
        inline={inline}
      />
      <SearchProgressBar
        visible={busy}
        percent={lookup.progressPercent}
        message={lookup.progressMessage}
        defaultMessage="Suggesting genre..."
      />
      {error ? <Alert variant="danger" className="mt-2 mb-0">{error}</Alert> : null}
      {source && !error ? (
        <Alert variant="success" className="mt-2 mb-0">Genre from {source}</Alert>
      ) : null}
      <SearchResultPickerModal
        show={showPicker}
        title="Choose genre"
        items={pickerCandidates.map(function(candidate) {
          return {
            title: candidate.genre,
            artist: candidate.reason || '',
            preview: candidate.genre,
            source: candidate.source || '',
          }
        })}
        onSelect={function(item) {
          setShowPicker(false)
          setPickerCandidates([])
          const jobId = lookup.activeJob && lookup.activeJob.status === 'awaiting'
            ? lookup.activeJob.id
            : null
          finishApply({ genre: item.title, source: item.source }, jobId)
        }}
        onHide={function() {
          setShowPicker(false)
          setPickerCandidates([])
        }}
      />
    </>
  )
}
