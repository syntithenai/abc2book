import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Form, ListGroup, Spinner } from 'react-bootstrap'
import { MAX_MEDIA_SEARCH_RESULTS, searchMediaLinks } from '../mediaLinkSearchClient'
import { getMediaSearchAccess } from '../mediaSearchAccess'
import { openCreditSettings } from '../resolverCreditAccess'
import { getActiveResolverAccessToken } from '../mediaResolverHealthStore'
import { resolveResolverAccessToken } from '../resolverAccessToken'
import useMediaResolverHealth from '../useMediaResolverHealth'
import {
  MediaSearchResultDetails,
  MediaSearchResultImage,
} from './MediaSearchResultDetails'
import VoiceFillInput from './VoiceFillInput'

function resolvedSearchToken(props) {
  return resolveResolverAccessToken(props && props.token) || getActiveResolverAccessToken() || ''
}

const DEFAULT_DEBOUNCE_MS = 1800

const RESULT_ART_STYLE = {
  width: 64,
  height: 64,
  objectFit: 'cover',
  borderRadius: 4,
  flexShrink: 0,
}

/**
 * Embedded media picker for Add form: search field + result list.
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
  const autoSelectedQueryRef = useRef('')
  const { status: resolverStatus, available: resolverAvailable, refreshMediaResolverHealth } = useMediaResolverHealth()
  const accessToken = resolvedSearchToken(props)
  const mediaSearchAccess = useMemo(function() {
    return getMediaSearchAccess({
      resolverStatus: resolverStatus,
      resolverAvailable: resolverAvailable,
      accessToken: accessToken,
    }) || { loginWarning: null, needsLogin: false }
  }, [resolverStatus, resolverAvailable, accessToken])

  useEffect(function() {
    refreshMediaResolverHealth(accessToken || null)
  }, [accessToken, refreshMediaResolverHealth])

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
      const accessToken = resolvedSearchToken(props)
      searchMediaLinks({
        query: query,
        maxResults: MAX_MEDIA_SEARCH_RESULTS,
        maxTotalResults: MAX_MEDIA_SEARCH_RESULTS,
        accessToken: accessToken,
        token: accessToken,
        signal: controller ? controller.signal : undefined,
      }).then(function(result) {
        lastSearchedRef.current = query
        let list = []
        if (result && Array.isArray(result.candidates)) list = result.candidates
        else if (result && result.link) list = [result]
        setResults(list)
        if (props.autoSelectFirst && !props.selected && list.length > 0 && autoSelectedQueryRef.current !== query) {
          autoSelectedQueryRef.current = query
          if (typeof props.onChange === 'function') props.onChange(list[0])
        }
        setError('')
        setBusy(false)
      }).catch(function(err) {
        if (err && err.name === 'AbortError') return
        setBusy(false)
        setError(err && err.message ? err.message : 'Media search failed')
        setResults([])
      })
    }, debounceMs)
    return function() {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [filter, props.searchNonce, debounceMs, props.token])

  useEffect(function() {
    return function() {
      if (abortRef.current) abortRef.current.abort()
    }
  }, [])

  function handleLogin() {
    if (typeof props.login !== 'function') return
    props.login().then(function() {
      const nextToken = resolvedSearchToken(props)
      if (nextToken) {
        return refreshMediaResolverHealth(nextToken)
      }
      return null
    }).then(function() {
      const query = String(filter || '').trim()
      if (query) {
        lastSearchedRef.current = ''
        setFilter(query)
      }
    }).catch(function() {})
  }

  function selectLink(link) {
    if (typeof props.onChange === 'function') props.onChange(link)
  }

  return (
    <div className="add-tune-youtube-picker" data-testid="add-tune-youtube-block">
      <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap mb-2">
        <Form.Label className="mb-0">Media link</Form.Label>
        <div className="d-flex align-items-center gap-2">
          {busy ? <Spinner animation="border" size="sm" aria-label="Searching media" /> : null}
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

      {mediaSearchAccess.loginWarning ? (
        <Alert variant="warning" className="py-2 px-2 small mb-2">
          <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap">
            <span>{mediaSearchAccess.loginWarning.message}</span>
            {mediaSearchAccess.loginWarning.showLoginButton && typeof props.login === 'function' ? (
              <Button variant="outline-warning" size="sm" onClick={handleLogin}>
                Log in with Google
              </Button>
            ) : null}
            {mediaSearchAccess.loginWarning.showBuyCreditButton ? (
              <Button variant="outline-warning" size="sm" onClick={openCreditSettings}>
                Buy credit
              </Button>
            ) : null}
          </div>
        </Alert>
      ) : null}

      <VoiceFillInput
        value={filter}
        placeholder="Search my library, Bandcamp, archives, or YouTube…"
        data-testid="add-tune-youtube-query"
        onChange={function(e) { setFilter(e.target.value) }}
        onFocus={function() {
          if (props.setBlockKeyboardShortcuts) props.setBlockKeyboardShortcuts(true)
        }}
        onBlur={function() {
          if (props.setBlockKeyboardShortcuts) props.setBlockKeyboardShortcuts(false)
        }}
        setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
        token={props.token}
        fieldKind="search"
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
                <MediaSearchResultImage
                  item={item}
                  token={props.token}
                  style={RESULT_ART_STYLE}
                />
                <MediaSearchResultDetails item={item} />
                <div className="d-flex align-items-center gap-2 flex-shrink-0">
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
          Results appear after artist is set (or type a search above).
        </div>
      ) : null)}
    </div>
  )
}
