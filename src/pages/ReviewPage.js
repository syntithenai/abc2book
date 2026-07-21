import { useMemo, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { useDocumentTitle } from '../pageTitle'
import { Button, Form } from 'react-bootstrap'
import TuneFieldSuggestionsStrip from '../components/TuneFieldSuggestionsStrip'
import VoiceFillInput from '../components/VoiceFillInput'
import {
  subscribe as subscribeFieldLookupQueue,
  getState as getFieldLookupState,
  dismissFieldLookup,
} from '../tuneFieldLookupQueue'
import {
  countTunesWithFieldSuggestions,
  searchableSuggestions,
} from '../fieldSuggestionsUtils'
import { acceptAllFieldSuggestionsAllTunes } from '../fieldLookupAcceptAll'

function getFieldLookupRevision() {
  const state = getFieldLookupState()
  return (state.jobs || []).map(function(job) {
    return job.id + ':' + job.status + ':'
      + searchableSuggestions(job).length
  }).join('|')
}

function useFieldLookupJobs() {
  const revision = useSyncExternalStore(
    subscribeFieldLookupQueue,
    getFieldLookupRevision,
    function() { return '' }
  )
  return useMemo(function() {
    return getFieldLookupState().jobs || []
  }, [revision])
}

/**
 * Review page: tunes that currently have search suggestions attached.
 * Field buttons open selection dialogs here (no navigation to the editor).
 */
export default function ReviewPage(props) {
  useDocumentTitle('Suggestions')
  const tunes = props.tunes || {}
  const tunebook = props.tunebook
  const jobs = useFieldLookupJobs()
  const [titleFilter, setTitleFilter] = useState('')

  const rows = useMemo(function() {
    const byTune = {}
    jobs.forEach(function(job) {
      if (!job || job.status !== 'awaiting' || !job.tuneId) return
      if (!searchableSuggestions(job).length) return
      byTune[String(job.tuneId)] = true
    })
    return Object.keys(byTune).map(function(tuneId) {
      const tune = tunes[tuneId]
      return {
        tuneId: tuneId,
        title: (tune && tune.name) || 'Untitled',
      }
    }).sort(function(a, b) {
      return String(a.title).localeCompare(String(b.title))
    })
  }, [jobs, tunes])

  const filtered = useMemo(function() {
    const q = String(titleFilter || '').trim().toLowerCase()
    if (!q) return rows
    return rows.filter(function(row) {
      return String(row.title || '').toLowerCase().indexOf(q) >= 0
    })
  }, [rows, titleFilter])

  const tuneCount = countTunesWithFieldSuggestions(jobs)
  const awaitingJobs = useMemo(function() {
    return (jobs || []).filter(function(job) {
      return job && job.status === 'awaiting' && searchableSuggestions(job).length > 0
    })
  }, [jobs])

  function clearAllSuggestions() {
    awaitingJobs.forEach(function(job) {
      dismissFieldLookup(job.id)
    })
  }

  function acceptAllSuggestions() {
    const fieldCount = awaitingJobs.length
    const message = tuneCount === 1
      ? ('Apply the first suggestion for all ' + fieldCount + ' field'
        + (fieldCount === 1 ? '' : 's') + ' on this tune?')
      : ('Apply the first suggestion for every field on all ' + tuneCount + ' tunes '
        + '(' + fieldCount + ' field' + (fieldCount === 1 ? '' : 's') + ' total)?')
    if (!window.confirm(message)) return
    acceptAllFieldSuggestionsAllTunes({
      tunebook: tunebook,
      tunes: tunes,
      forceRefresh: props.forceRefresh,
    })
  }

  return (
    <div className="app-surface-panel review-page" data-testid="search-suggestions-review-page">
      <div className="review-page-header review-page-header--with-actions">
        <div>
          <h1>Suggestions</h1>
          <p className="app-text-muted mb-0">
            {tuneCount === 0
              ? 'No tunes have search suggestions right now.'
              : (tuneCount + ' tune' + (tuneCount === 1 ? '' : 's') + ' with suggestions.')}
          </p>
        </div>
        {tuneCount > 0 ? (
          <div className="d-flex gap-2 flex-wrap">
            <Button
              variant="success"
              data-testid="suggestions-accept-all-global"
              onClick={acceptAllSuggestions}
            >
              Accept All
            </Button>
            <Button
              variant="danger"
              data-testid="suggestions-clear-all-global"
              onClick={clearAllSuggestions}
            >
              Clear All Suggestions
            </Button>
          </div>
        ) : null}
      </div>

      {tuneCount > 0 ? (
        <Form.Group className="mb-3" style={{ maxWidth: '28em' }}>
          <Form.Label>Filter by title</Form.Label>
          <VoiceFillInput
            value={titleFilter}
            data-testid="suggestions-title-filter"
            placeholder="Search titles…"
            type="search"
            onChange={function(e) { setTitleFilter(e.target.value) }}
            setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
            token={props.token}
            fieldKind="search"
          />
        </Form.Group>
      ) : null}

      <div className="d-flex flex-column gap-3">
        {filtered.map(function(row) {
          return (
            <div key={row.tuneId} className="border rounded p-3" data-testid="suggestions-tune-row">
              <div className="d-flex align-items-center justify-content-between gap-2 mb-2 flex-wrap">
                <Link to={'/editor/' + encodeURIComponent(row.tuneId)}>
                  <strong>{row.title}</strong>
                </Link>
              </div>
              <TuneFieldSuggestionsStrip
                tuneId={row.tuneId}
                tunebook={tunebook}
                tunes={tunes}
                forceRefresh={props.forceRefresh}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
