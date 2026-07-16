import { useMemo, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { Button, Form } from 'react-bootstrap'
import FieldSuggestionsChangesStrip from '../components/FieldSuggestionsChangesStrip'
import SearchResultPickerModal from '../components/SearchResultPickerModal'
import {
  subscribe as subscribeFieldLookupQueue,
  getState as getFieldLookupState,
  dismissFieldLookup,
  applyFieldLookupChoice,
  shouldDeferFieldLookupSave,
} from '../tuneFieldLookupQueue'
import {
  countTunesWithFieldSuggestions,
  searchableSuggestions,
  buildPickerOriginalValueItem,
  displayFromOriginalValue,
  originalValueFromJob,
} from '../fieldSuggestionsUtils'
import {
  applyCandidateToTune,
  candidateDisplayValue,
  historyLabelForKind,
} from '../fieldLookupApplyUtils'
import { lyricLinesToText } from '../wLinesUtils'

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

function isCurrentCandidate(candidate) {
  return !!(candidate && (candidate.__current || candidate.isCurrent || candidate.id === 'current'))
}

function pickerTitleForKind(kind) {
  if (kind === 'composer') return 'Choose composer'
  if (kind === 'artists') return 'Choose artists to add'
  if (kind === 'aliases') return 'Choose aliases to add'
  if (kind === 'genre') return 'Choose genre'
  if (kind === 'notation') return 'Choose notation'
  if (kind === 'lyrics') return 'Choose lyrics'
  if (kind === 'chords') return 'Choose chords'
  if (kind === 'links') return 'Choose link'
  return 'Choose suggestion'
}

function currentFieldDisplay(tune, kind) {
  if (!tune) return ''
  if (kind === 'composer') return String(tune.composer || '').trim()
  if (kind === 'genre') return String(tune.genre || '').trim()
  if (kind === 'artists') {
    return Array.isArray(tune.artists) ? tune.artists.filter(Boolean).join(', ') : ''
  }
  if (kind === 'aliases') {
    return Array.isArray(tune.aliases) ? tune.aliases.filter(Boolean).join(', ') : ''
  }
  if (kind === 'lyrics') {
    return lyricLinesToText(tune)
  }
  if (kind === 'notation' || kind === 'chords') {
    if (Array.isArray(tune.notes)) return tune.notes.join('\n')
    return String(tune.notes || '')
  }
  if (kind === 'links') {
    const first = Array.isArray(tune.links) ? tune.links[0] : null
    return first ? candidateDisplayValue('links', first) : ''
  }
  return ''
}

function mapCandidatesToPickerItems(kind, candidates, titleHint) {
  return candidates.map(function(candidate) {
    if (kind === 'composer' || kind === 'artists') {
      const role = candidate.role === 'writer'
        ? 'Writer'
        : (candidate.role === 'performer' ? 'Performer' : '')
      return {
        title: candidate.artist || '',
        artist: role,
        preview: candidate.preview || candidate.artist || '',
        source: candidate.source || '',
        matchType: role || candidate.source || '',
        raw: candidate,
      }
    }
    if (kind === 'aliases') {
      return {
        title: candidate.alias || '',
        artist: '',
        preview: candidate.preview || candidate.alias || '',
        source: candidate.source || '',
        matchType: candidate.source || '',
        raw: candidate,
      }
    }
    if (kind === 'genre') {
      return {
        title: candidate.genre || '',
        artist: candidate.reason || '',
        preview: candidate.genre || '',
        source: candidate.source || '',
        matchType: candidate.matchType || candidate.reason || candidate.source || '',
        raw: candidate,
      }
    }
    if (kind === 'notation') {
      return {
        title: candidate.title || titleHint || 'Notation',
        artist: candidate.artist || '',
        preview: candidate.preview || candidate.abc || '',
        abc: candidate.abc || candidate.preview || '',
        source: candidate.source || '',
        sourceUrl: candidate.sourceUrl || '',
        matchType: candidate.source || '',
        raw: candidate,
      }
    }
    if (kind === 'lyrics') {
      return {
        title: candidate.title || titleHint || 'Lyrics',
        artist: candidate.artist || '',
        preview: candidateDisplayValue('lyrics', candidate),
        source: candidate.source || '',
        matchType: candidate.source || '',
        raw: candidate,
      }
    }
    if (kind === 'chords') {
      return {
        title: candidate.title || titleHint || 'Chords',
        artist: candidate.artist || '',
        preview: candidateDisplayValue('chords', candidate),
        source: candidate.source || '',
        matchType: candidate.source || '',
        raw: candidate,
      }
    }
    if (kind === 'links') {
      return {
        title: candidate.title || candidate.link || 'Link',
        artist: '',
        preview: candidateDisplayValue('links', candidate),
        source: candidate.source || '',
        matchType: candidate.source || '',
        raw: candidate,
      }
    }
    return {
      title: candidate.title || 'Suggestion',
      artist: candidate.artist || '',
      preview: candidate.preview || '',
      source: candidate.source || '',
      matchType: candidate.source || '',
      raw: candidate,
    }
  })
}

/**
 * Review page: tunes that currently have search suggestions attached.
 * Field buttons open selection dialogs here (no navigation to the editor).
 */
export default function ReviewPage(props) {
  const tunes = props.tunes || {}
  const tunebook = props.tunebook
  const jobs = useFieldLookupJobs()
  const [titleFilter, setTitleFilter] = useState('')
  const [picker, setPicker] = useState(null)
  const [selectedIndexes, setSelectedIndexes] = useState([])

  const rows = useMemo(function() {
    const byTune = {}
    jobs.forEach(function(job) {
      if (!job || job.status !== 'awaiting' || !job.tuneId) return
      const count = searchableSuggestions(job).length
      if (!count) return
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
          count: searchableSuggestions(job).length,
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
  const awaitingJobs = useMemo(function() {
    return (jobs || []).filter(function(job) {
      return job && job.status === 'awaiting' && searchableSuggestions(job).length > 0
    })
  }, [jobs])

  function clearItem(item) {
    dismissFieldLookup(item.jobId)
  }

  function clearAllSuggestions() {
    awaitingJobs.forEach(function(job) {
      dismissFieldLookup(job.id)
    })
    setPicker(null)
    setSelectedIndexes([])
  }

  function closePicker() {
    setPicker(null)
    setSelectedIndexes([])
  }

  function openItem(item) {
    const job = item && item.job
    if (!job) return
    const kind = job.kind
    const tune = tunes[job.tuneId]
    const titleHint = (tune && tune.name) || job.title || ''
    const originalValue = originalValueFromJob(job)
    const originalDisplay = originalValue != null && originalValue !== undefined
      ? displayFromOriginalValue(originalValue)
      : currentFieldDisplay(tune, kind)
    const candidates = searchableSuggestions(job)
    const currentItem = buildPickerOriginalValueItem({
      value: originalValue != null ? originalValue : originalDisplay,
      display: originalDisplay,
      abc: (kind === 'notation' || kind === 'chords')
        ? (typeof originalValue === 'string' ? originalValue : originalDisplay)
        : '',
    })
    const items = [currentItem].concat(mapCandidatesToPickerItems(kind, candidates, titleHint))
    setSelectedIndexes([])
    setPicker({
      job: job,
      kind: kind,
      titleHint: titleHint,
      multiSelect: kind === 'artists' || kind === 'aliases',
      layout: kind === 'notation' ? 'notation' : undefined,
      previewMetadata: tune ? {
        meter: tune.meter,
        noteLength: tune.noteLength,
        key: tune.key,
      } : undefined,
      items: items,
      candidates: candidates,
    })
  }

  function applyReviewCandidate(job, candidate, options) {
    const opts = options || {}
    if (!job || !candidate || isCurrentCandidate(candidate)) return false
    const deferred = shouldDeferFieldLookupSave(job)
    if (deferred) {
      const tune = tunes[job.tuneId]
      const abcTools = tunebook && tunebook.abcTools
      if (tune && tunebook && applyCandidateToTune(tune, job.kind, candidate, abcTools)) {
        tunebook.saveTune(tune, false, { historyLabel: historyLabelForKind(job.kind) })
        if (typeof props.forceRefresh === 'function') props.forceRefresh()
      }
    }
    applyFieldLookupChoice(job.id, candidate)
    if (!opts.keepOpen) closePicker()
    return true
  }

  const multiSelect = !!(picker && picker.multiSelect)

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
          <Button
            variant="danger"
            data-testid="suggestions-clear-all-global"
            onClick={clearAllSuggestions}
          >
            Clear All Suggestions
          </Button>
        ) : null}
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
                onOpen={openItem}
                onClearAll={function() {
                  row.items.forEach(clearItem)
                }}
              />
            </div>
          )
        })}
      </div>

      <SearchResultPickerModal
        show={!!picker}
        title={picker ? pickerTitleForKind(picker.kind) : 'Choose suggestion'}
        layout={picker && picker.layout}
        previewMetadata={picker && picker.previewMetadata}
        fallbackTitle={picker && picker.titleHint}
        multiSelect={multiSelect}
        selectedIndexes={selectedIndexes}
        items={picker ? picker.items : []}
        onSelect={function(item, index) {
          if (!picker) return
          if (item && item.__current) {
            if (!multiSelect) closePicker()
            return
          }
          const candidate = (item && item.raw)
            || (picker.candidates && picker.candidates[index - 1])
            || null
          if (!candidate) return
          if (multiSelect) {
            let alreadySelected = false
            setSelectedIndexes(function(prev) {
              if (prev.indexOf(index) >= 0) {
                alreadySelected = true
                return prev
              }
              return prev.concat([index])
            })
            if (alreadySelected) return
            applyReviewCandidate(picker.job, candidate, { keepOpen: true })
            return
          }
          applyReviewCandidate(picker.job, candidate)
        }}
        onDone={closePicker}
        onHide={closePicker}
      />
    </div>
  )
}
