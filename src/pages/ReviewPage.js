import { useMemo, useState, useSyncExternalStore } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Form } from 'react-bootstrap'
import FieldSuggestionsChangesStrip from '../components/FieldSuggestionsChangesStrip'
import {
  subscribe as subscribeFieldLookupQueue,
  getState as getFieldLookupState,
  dismissFieldLookup,
  applyFieldLookupChoice,
} from '../tuneFieldLookupQueue'
import { countTunesWithFieldSuggestions } from '../fieldSuggestionsUtils'
import { requestOpenFieldSuggestions } from '../fieldSuggestionsOpen'

function getFieldLookupRevision() {
  const state = getFieldLookupState()
  return (state.jobs || []).map(function(job) {
    return job.id + ':' + job.status + ':'
      + (Array.isArray(job.candidates) ? job.candidates.length : 0)
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

function preferAcceptCandidate(job) {
  const candidates = Array.isArray(job.candidates) ? job.candidates : []
  const nonCurrent = candidates.find(function(item) {
    return item && !item.isCurrent && item.id !== 'current'
  })
  return nonCurrent || candidates[0] || null
}

/**
 * Review page: tunes that currently have search suggestions attached.
 */
export default function ReviewPage(props) {
  const tunes = props.tunes || {}
  const jobs = useFieldLookupJobs()
  const [titleFilter, setTitleFilter] = useState('')
  const navigate = useNavigate()

  const rows = useMemo(function() {
    const byTune = {}
    jobs.forEach(function(job) {
      if (!job || job.status !== 'awaiting' || !job.tuneId) return
      const candidates = Array.isArray(job.candidates) ? job.candidates : []
      if (!candidates.length) return
      const id = String(job.tuneId)
      if (!byTune[id]) byTune[id] = []
      byTune[id].push(job)
    })
    return Object.keys(byTune).map(function(tuneId) {
      const tune = tunes[tuneId]
      const title = (tune && tune.name) || 'Untitled'
      const items = byTune[tuneId].map(function(job) {
        return {
          jobId: job.id,
          kind: job.kind,
          count: Array.isArray(job.candidates) ? job.candidates.length : 0,
          job: job,
        }
      })
      return { tuneId: tuneId, title: title, items: items }
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

  function acceptItem(item) {
    const candidate = preferAcceptCandidate(item.job)
    if (!candidate) return
    applyFieldLookupChoice(item.jobId, candidate)
  }

  function clearItem(item) {
    dismissFieldLookup(item.jobId)
  }

  function openItem(item) {
    const tuneId = item && item.job && item.job.tuneId
    const kind = item && item.kind
    if (!tuneId) return
    if (typeof props.onOpenTune === 'function') {
      props.onOpenTune({ id: tuneId, suggestKind: kind })
    } else {
      navigate('/editor/' + encodeURIComponent(tuneId) + (kind ? ('?suggest=' + encodeURIComponent(kind)) : ''))
    }
    // Open after navigation so the editor form mounts and can handle the event.
    setTimeout(function() {
      requestOpenFieldSuggestions(tuneId, kind)
    }, 250)
  }

  return (
    <div className="app-surface-panel review-page" data-testid="search-suggestions-review-page">
      <div className="review-page-header">
        <h1>Search suggestions</h1>
        <p className="app-text-muted">
          {tuneCount === 0
            ? 'No tunes have search suggestions right now.'
            : (tuneCount + ' tune' + (tuneCount === 1 ? '' : 's') + ' with suggestions.')}
        </p>
      </div>

      {tuneCount > 0 ? (
        <Form.Group className="mb-3" style={{ maxWidth: '28em' }}>
          <Form.Label>Filter by title</Form.Label>
          <Form.Control
            value={titleFilter}
            data-testid="suggestions-title-filter"
            placeholder="Search titles…"
            onChange={function(e) { setTitleFilter(e.target.value) }}
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
              <FieldSuggestionsChangesStrip
                items={row.items}
                onAccept={acceptItem}
                onClear={clearItem}
                onOpen={openItem}
                onAcceptAll={function() {
                  row.items.forEach(acceptItem)
                }}
                onClearAll={function() {
                  row.items.forEach(clearItem)
                }}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
