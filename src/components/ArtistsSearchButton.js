import { useRef, useState } from 'react'
import { Alert } from 'react-bootstrap'
import { useFieldLookupSearchJob } from '../useFieldLookupSearchJob'
import { applyFieldLookupChoice, buildSearchModeOptions } from '../tuneFieldLookupQueue'
import { buildGoogleArtistsSearchUrl } from '../artistsSearchClient'
import SearchProgressBar from './SearchProgressBar'
import SearchResultPickerModal from './SearchResultPickerModal'
import { FieldLookupButtonGroup } from './FieldLookupButtonGroup'

export default function ArtistsSearchButton({
  tuneId,
  candidateId,
  title,
  artist,
  existingArtists,
  onAddArtist,
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
    if (typeof onAddArtist === 'function' && result && result.artist) {
      onAddArtist(result.artist)
    }
    setSource(result && result.source ? result.source : '')
  }
  applyRef.current = finishApply

  const lookup = useFieldLookupSearchJob({
    tuneId: tuneId,
    candidateId: candidateId,
    kind: 'artists',
    onAwaiting: function(job) {
      const candidates = Array.isArray(job.candidates) ? job.candidates : []
      if (searchModeRef.current === 'review') {
        if (candidates.length === 0) {
          setError('No artists found')
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
      setError('No artists found')
    },
    onError: function(job) {
      setError(job.error || 'Artists search failed')
    },
  })

  const googleUrl = buildGoogleArtistsSearchUrl(title, artist)
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
        existingArtists: Array.isArray(existingArtists) ? existingArtists : [],
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
        defaultMessage="Searching for artists..."
      />
      {error ? <Alert variant="danger" className="mt-2 mb-0">{error}</Alert> : null}
      {source && !error ? (
        <Alert variant="success" className="mt-2 mb-0">Artist from {source}</Alert>
      ) : null}
      <SearchResultPickerModal
        show={showPicker}
        title="Choose artist to add"
        items={pickerCandidates.map(function(candidate) {
          const role = candidate.role === 'writer'
            ? 'Writer'
            : (candidate.role === 'performer' ? 'Performer' : '')
          return {
            title: candidate.artist,
            artist: role,
            preview: candidate.preview || candidate.artist,
            source: candidate.source || '',
          }
        })}
        onSelect={function(item) {
          setShowPicker(false)
          setPickerCandidates([])
          const jobId = lookup.activeJob && lookup.activeJob.status === 'awaiting'
            ? lookup.activeJob.id
            : null
          finishApply({ artist: item.title, source: item.source }, jobId)
        }}
        onHide={function() {
          setShowPicker(false)
          setPickerCandidates([])
        }}
      />
    </>
  )
}
