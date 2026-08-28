import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Modal, Spinner } from 'react-bootstrap'
import { MAX_MEDIA_SEARCH_RESULTS, searchMediaLinks } from '../mediaLinkSearchClient'
import { getMediaSearchAccess } from '../mediaSearchAccess'
import { getActiveResolverAccessToken } from '../mediaResolverHealthStore'
import { resolveResolverAccessToken } from '../resolverAccessToken'
import useMediaResolverHealth from '../useMediaResolverHealth'
import {
  MediaSearchResultDetailsModal,
  MediaSearchResultImage,
} from './MediaSearchResultDetails'
import VoiceFillInput from './VoiceFillInput'
import './YouTubeSearchModal.css'

function resolvedSearchToken(props) {
  return resolveResolverAccessToken(props && props.token) || getActiveResolverAccessToken() || ''
}

function resultKey(option, index) {
  return [
    option && option.source,
    option && option.link,
    option && option.id,
    index,
  ].filter(function(part) { return part !== undefined && part !== null && part !== '' }).join('::')
}

function YouTubeSearchModal(props) {
  const [show, setShow] = useState(false)
  const [filter, setFilter] = useState('')
  const [error, setError] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const searchSeqRef = useRef(0)
  const { status: resolverStatus, available: resolverAvailable, refreshMediaResolverHealth } = useMediaResolverHealth()
  const accessToken = resolvedSearchToken(props)
  const mediaSearchAccess = useMemo(function() {
    return getMediaSearchAccess({
      resolverStatus: resolverStatus,
      resolverAvailable: resolverAvailable,
      accessToken: accessToken,
    })
  }, [resolverStatus, resolverAvailable, accessToken])

  const handleClose = function() {
    setShow(false)
    if (props.handleClose) props.handleClose()
  }

  const handleShow = function() {
    setShow(true)
  }

  useEffect(function() {
    setFilter(props.value)
  }, [props.value])

  useEffect(function() {
    if (!props.openSignal) return undefined
    setShow(true)
    return undefined
  }, [props.openSignal])

  function runSearch(query) {
    const trimmed = String(query || '').trim()
    if (!trimmed) {
      setResults([])
      setError('')
      setSearching(false)
      return
    }
    const seq = ++searchSeqRef.current
    setSearching(true)
    const accessToken = resolvedSearchToken(props)
    searchMediaLinks({
      query: trimmed,
      maxResults: MAX_MEDIA_SEARCH_RESULTS,
      maxTotalResults: MAX_MEDIA_SEARCH_RESULTS,
      accessToken: accessToken,
      token: accessToken,
    }).then(function(listResult) {
      if (seq !== searchSeqRef.current) return
      let list = []
      if (listResult && Array.isArray(listResult.candidates)) list = listResult.candidates
      else if (listResult && listResult.link) list = [listResult]
      setResults(list)
      setError('')
      setSearching(false)
    }).catch(function(err) {
      if (seq !== searchSeqRef.current) return
      setError(err && err.message ? err.message : 'Media search failed')
      setResults([])
      setSearching(false)
    })
  }

  function handleFilterChange(e) {
    setFilter(e.target.value)
    if (e.target.value.trim() === '') {
      searchSeqRef.current += 1
      setResults([])
      setSearching(false)
      setError('')
    }
  }

  function handleSearch() {
    runSearch(filter)
  }

  function handleInputKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSearch()
    }
  }

  useEffect(function() {
    if (!show) return
    refreshMediaResolverHealth(accessToken || null)
  }, [show, accessToken, refreshMediaResolverHealth])

  function handleLogin() {
    if (typeof props.login !== 'function') return
    props.login().then(function() {
      const nextToken = resolvedSearchToken(props)
      if (nextToken) {
        return refreshMediaResolverHealth(nextToken)
      }
      return null
    }).then(function() {
      if (filter.trim()) runSearch(filter)
    }).catch(function() {})
  }

  function selectLink(link) {
    props.onChange(link)
    handleClose()
  }

  return (
    <>
      {props.hideTrigger
        ? null
        : (typeof props.renderTrigger === 'function'
          ? props.renderTrigger({ onClick: handleShow })
          : (
            <Button style={{ color: 'black' }} variant="danger" disabled={props.disabled} onClick={handleShow}>
              {props.triggerElement}
            </Button>
          ))}

      <Modal show={show} onHide={handleClose} fullscreen className="media-search-modal">
        <Modal.Header closeButton className="media-search-modal-header">
          <Modal.Title>Search media</Modal.Title>
          {mediaSearchAccess.loginWarning ? (
            <Alert variant="warning" className="media-search-login-warning mb-0">
              <span className="media-search-login-warning__message">
                {mediaSearchAccess.loginWarning.message}
              </span>
              {mediaSearchAccess.loginWarning.showLoginButton && typeof props.login === 'function' ? (
                <Button variant="outline-warning" size="sm" onClick={handleLogin}>
                  Log in with Google
                </Button>
              ) : null}
            </Alert>
          ) : null}
        </Modal.Header>
        <Modal.Body className="media-search-modal-body">
          <div className="media-search-input-row">
            <VoiceFillInput
              layout="wrap"
              useFormControl={false}
              type="text"
              value={filter}
              onChange={handleFilterChange}
              onKeyDown={handleInputKeyDown}
              onBlur={function() { if (props.setBlockKeyboardShortcuts) props.setBlockKeyboardShortcuts(false) }}
              onFocus={function() { if (props.setBlockKeyboardShortcuts) props.setBlockKeyboardShortcuts(true) }}
              setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
              token={props.token}
              fieldKind="search"
            />
            <Button
              className="media-search-submit"
              variant="primary"
              onClick={handleSearch}
              disabled={searching || !filter.trim()}
            >
              Search
            </Button>
            {searching ? (
              <Spinner
                animation="border"
                size="sm"
                className="media-search-spinner"
                role="status"
                aria-label="Searching"
              />
            ) : null}
          </div>
          {(error && error.length > 0) ? <div className="text-danger fw-semibold">{error}</div> : null}
          {results.length > 0 ? (
            <div className="media-search-results-grid">
              {results.map(function(option, index) {
                return (
                  <div key={resultKey(option, index)} className="media-search-result-card">
                    <div className="media-search-result-card__image-wrap">
                      <MediaSearchResultImage
                        item={option}
                        token={props.token}
                        className="media-search-result-card__image"
                      />
                    </div>
                    <div className="media-search-result-card__details">
                      <MediaSearchResultDetailsModal item={option} />
                    </div>
                    <Button
                      className="media-search-result-card__select"
                      onClick={function() { selectLink(option) }}
                      variant="success"
                      size="sm"
                    >
                      Select
                    </Button>
                  </div>
                )
              })}
            </div>
          ) : null}
        </Modal.Body>
      </Modal>
    </>
  )
}
export default YouTubeSearchModal
