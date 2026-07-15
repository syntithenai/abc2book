import { useEffect, useRef, useState } from 'react'
import { Button, Form, ListGroup, Spinner } from 'react-bootstrap'
import { searchYouTubeVideos } from '../youtubeSearchClient'

const DEFAULT_DEBOUNCE_MS = 1800

/**
 * Embedded YouTube picker for Add form: search field + result list.
 * External `searchQuery` / `searchNonce` triggers a long-debounced search.
 */
export default function AddTuneYouTubePicker(props) {
  const selected = props.selected || null
  const debounceMs = typeof props.debounceMs === 'number' ? props.debounceMs : DEFAULT_DEBOUNCE_MS
  const [filter, setFilter] = useState(String(props.searchQuery || ''))
  const [results, setResults] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const timerRef = useRef(null)
  const abortRef = useRef(null)
  const lastSearchedRef = useRef('')

  useEffect(function() {
    const next = String(props.searchQuery || '')
    if (next) {
      lastSearchedRef.current = ''
      setFilter(next)
    }
    // Parent bumps searchNonce to force a debounced search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.searchQuery, props.searchNonce])

  useEffect(function() {
    const query = String(filter || '').trim()
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!query) {
      setResults([])
      setError('')
      setBusy(false)
      return undefined
    }
    if (query === lastSearchedRef.current) {
      return undefined
    }
    setBusy(true)
    timerRef.current = setTimeout(function() {
      if (abortRef.current) abortRef.current.abort()
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
      abortRef.current = controller
      searchYouTubeVideos({
        query: query,
        maxResults: 6,
        signal: controller ? controller.signal : undefined,
      }).then(function(result) {
        lastSearchedRef.current = query
        let list = []
        if (result && Array.isArray(result.candidates)) list = result.candidates
        else if (result && result.link) list = [result]
        setResults(list)
        setError('')
        setBusy(false)
      }).catch(function(err) {
        if (err && err.name === 'AbortError') return
        setBusy(false)
        setError(err && err.message ? err.message : 'YouTube search failed')
        setResults([])
      })
    }, debounceMs)
    return function() {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [filter, props.searchNonce, debounceMs])

  useEffect(function() {
    return function() {
      if (abortRef.current) abortRef.current.abort()
    }
  }, [])

  function selectLink(link) {
    if (typeof props.onChange === 'function') props.onChange(link)
  }

  return (
    <div className="add-tune-youtube-picker" data-testid="add-tune-youtube-block">
      <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap mb-2">
        <Form.Label className="mb-0">YouTube</Form.Label>
        <div className="d-flex align-items-center gap-2">
          {busy ? <Spinner animation="border" size="sm" aria-label="Searching YouTube" /> : null}
          {selected ? (
            <Button size="sm" variant="outline-secondary" onClick={function() {
              if (typeof props.onClear === 'function') props.onClear()
            }}>
              Clear
            </Button>
          ) : null}
        </div>
      </div>

      {selected ? (
        <div className="small mb-2 text-truncate">
          Selected:{' '}
          <a href={selected.link} target="_blank" rel="noreferrer">
            {selected.title || selected.link}
          </a>
        </div>
      ) : null}

      <Form.Control
        value={filter}
        placeholder="Search YouTube…"
        data-testid="add-tune-youtube-query"
        onChange={function(e) { setFilter(e.target.value) }}
        onFocus={function() {
          if (props.setBlockKeyboardShortcuts) props.setBlockKeyboardShortcuts(true)
        }}
        onBlur={function() {
          if (props.setBlockKeyboardShortcuts) props.setBlockKeyboardShortcuts(false)
        }}
      />

      {error ? <div className="text-danger small mt-2">{error}</div> : null}

      {results.length > 0 ? (
        <ListGroup className="mt-2 add-tune-youtube-results">
          {results.map(function(item, index) {
            return (
              <ListGroup.Item
                key={(item.id || item.link || index) + ''}
                className="d-flex justify-content-between align-items-start gap-2"
              >
                <div style={{ minWidth: 0 }}>
                  <div className="fw-semibold text-truncate">{item.title || 'Video'}</div>
                  {item.description ? (
                    <div className="small text-muted" style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}>
                      {item.description}
                    </div>
                  ) : null}
                </div>
                <div className="d-flex align-items-center gap-2 flex-shrink-0">
                  {item.image ? (
                    <img alt="" src={item.image} style={{ width: 64, height: 48, objectFit: 'cover' }} />
                  ) : null}
                  <Button size="sm" variant="success" onClick={function() { selectLink(item) }}>
                    Select
                  </Button>
                </div>
              </ListGroup.Item>
            )
          })}
        </ListGroup>
      ) : (!busy && !selected ? (
        <div className="text-muted small mt-2">
          Results appear after composer / artist is set (or type a search above).
        </div>
      ) : null)}
    </div>
  )
}
