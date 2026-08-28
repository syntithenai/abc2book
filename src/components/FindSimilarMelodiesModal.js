import './FindSimilarMelodiesModal.css'
import { useEffect, useRef, useState } from 'react'
import { Alert, Button, ListGroup, Modal, Spinner } from 'react-bootstrap'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useResponsiveModalProps } from '../useResponsiveModalProps'
import useMediaResolverHealth from '../useMediaResolverHealth'
import AbcSnippetPreview from './AbcSnippetPreview'
import {
  hasUsableContour,
  mergeSimilarMelodyRows,
  resolveSimilarMelodySelection,
  searchSimilarMelodiesLocal,
  searchSimilarMelodiesRemote,
} from '../searchSimilarMelodies'

function formatScore(score) {
  const num = Number(score)
  if (!Number.isFinite(num)) return ''
  return Math.round(num) + '%'
}

export default function FindSimilarMelodiesModal({
  show,
  onHide,
  tune,
  tunebook,
  tunes,
  token,
}) {
  const navigate = useNavigate()
  const responsiveModalProps = useResponsiveModalProps()
  const { available: resolverAvailable, checked } = useMediaResolverHealth()
  const [loading, setLoading] = useState(false)
  const [resourceLoading, setResourceLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [results, setResults] = useState([])
  const [resolverNotice, setResolverNotice] = useState('')
  const [error, setError] = useState('')
  const abortRef = useRef(null)
  const requestIdRef = useRef(0)

  const abcTools = tunebook && tunebook.abcTools
  const tuneId = tune && tune.id ? String(tune.id) : ''

  useEffect(function() {
    if (!show) {
      if (abortRef.current) {
        abortRef.current.abort()
        abortRef.current = null
      }
      setLoading(false)
      setResourceLoading(false)
      return undefined
    }

    const queryAbc = tune && abcTools && typeof abcTools.json2abc === 'function'
      ? String(abcTools.json2abc(tune) || '').trim()
      : ''
    const canSearch = !!(tuneId && queryAbc && hasUsableContour(queryAbc))

    if (!canSearch) {
      setLoading(false)
      setResourceLoading(false)
      setResults([])
      setError('Need notation with a melody to find similar tunes.')
      setResolverNotice('')
      return undefined
    }

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
    abortRef.current = controller
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setLoading(true)
    setResourceLoading(false)
    setImporting(false)
    setError('')
    setResolverNotice('')
    setResults([])

    const accessToken = token && token.access_token ? token.access_token : token
    const tunesForSearch = (tunes && typeof tunes === 'object' && Object.keys(tunes).length)
      ? tunes
      : (tunebook && typeof tunebook.getTunes === 'function' ? tunebook.getTunes() : {})
    const searchOpts = {
      queryAbc: queryAbc,
      queryTune: tune,
      tunes: tunesForSearch,
      abcTools: abcTools,
      excludeTuneId: tuneId,
      accessToken: accessToken,
      signal: controller ? controller.signal : undefined,
      resolverAvailable: checked ? resolverAvailable : undefined,
      limit: 12,
    }

    function finishIfCurrent(fn) {
      if (requestId !== requestIdRef.current) return
      fn()
    }

    // Tunebook first so duplicates appear without waiting on the resolver.
    window.setTimeout(function() {
      if (requestId !== requestIdRef.current) return
      let localRows = []
      try {
        localRows = searchSimilarMelodiesLocal(searchOpts)
      } catch (err) {
        finishIfCurrent(function() {
          setError(err && err.message ? String(err.message) : 'Similar melodies search failed')
          setResults([])
          setLoading(false)
          setResourceLoading(false)
        })
        return
      }

      finishIfCurrent(function() {
        setResults(mergeSimilarMelodyRows(localRows, [], tuneId, searchOpts.limit))
        setLoading(false)
        setResourceLoading(true)
      })

      searchSimilarMelodiesRemote(searchOpts).then(function(remote) {
        finishIfCurrent(function() {
          setResults(mergeSimilarMelodyRows(
            localRows,
            remote.rows || [],
            tuneId,
            searchOpts.limit
          ))
          if (remote.resolverUnavailable) {
            setResolverNotice(
              remote.resolverError
                ? 'Resource search unavailable: ' + remote.resolverError
                : 'Resource search unavailable — showing tunebook matches only.'
            )
          } else {
            setResolverNotice('')
          }
        })
      }).catch(function(err) {
        if (err && err.name === 'AbortError') return
        finishIfCurrent(function() {
          setResolverNotice('Resource search unavailable — showing tunebook matches only.')
        })
      }).finally(function() {
        finishIfCurrent(function() {
          setResourceLoading(false)
        })
      })
    }, 0)

    return function() {
      if (controller) controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, tuneId])

  function handleClose() {
    if (importing) return
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    if (typeof onHide === 'function') onHide()
  }

  function handleSelect(row) {
    if (!row || importing || !tunebook) return
    setImporting(true)
    try {
      const tunesForSearch = (tunes && typeof tunes === 'object' && Object.keys(tunes).length)
        ? tunes
        : (tunebook && typeof tunebook.getTunes === 'function' ? tunebook.getTunes() : {})
      const resolved = resolveSimilarMelodySelection(row, {
        tunebook: tunebook,
        tunes: tunesForSearch,
        excludeTuneId: tuneId,
      })
      if (typeof onHide === 'function') onHide()
      navigate('/tunes/' + encodeURIComponent(resolved.tuneId))
      if (resolved.created) {
        toast.success('Imported similar melody')
      }
    } catch (err) {
      toast.error(err && err.message ? String(err.message) : 'Could not open similar melody')
      setImporting(false)
    }
  }

  const showInitialLoading = loading
  const showResourceLoading = !loading && resourceLoading

  return (
    <Modal
      show={!!show}
      onHide={handleClose}
      {...responsiveModalProps}
      className="find-similar-melodies-modal"
      data-testid="find-similar-melodies-modal"
    >
      <Modal.Header closeButton={!importing}>
        <Modal.Title>Find Similar Melodies</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {showInitialLoading ? (
          <div className="find-similar-melodies-loading" data-testid="find-similar-loading">
            <Spinner animation="border" size="sm" role="status" />
            <span>Searching for similar tunes…</span>
          </div>
        ) : null}

        {!loading && error ? (
          <Alert variant="warning" data-testid="find-similar-error">{error}</Alert>
        ) : null}

        {!loading && !error && resolverNotice ? (
          <Alert variant="info" data-testid="find-similar-resolver-notice">{resolverNotice}</Alert>
        ) : null}

        {showResourceLoading ? (
          <div className="find-similar-melodies-loading find-similar-melodies-loading--inline" data-testid="find-similar-resource-loading">
            <Spinner animation="border" size="sm" role="status" />
            <span>Searching resource collections…</span>
          </div>
        ) : null}

        {!loading && !error && !results.length && !resourceLoading ? (
          <p className="text-muted mb-0" data-testid="find-similar-empty">
            No similar melodies found.
          </p>
        ) : null}

        {!loading && results.length > 0 ? (
          <ListGroup className="find-similar-melodies-list" data-testid="find-similar-results">
            {results.map(function(row, index) {
              const key = (row.kind || 'row') + '-' + (row.tuneId || row.sourceUrl || index)
              return (
                <ListGroup.Item
                  key={key}
                  action
                  disabled={importing}
                  className="find-similar-melodies-row"
                  onClick={function() { handleSelect(row) }}
                >
                  <div className="find-similar-melodies-row-inner">
                    <strong className="find-similar-melodies-title">{row.title}</strong>
                    <span className="find-similar-melodies-meta">
                      {formatScore(row.contourScore) ? (
                        <span className="find-similar-melodies-score">
                          {formatScore(row.contourScore)}
                        </span>
                      ) : null}
                      {row.source ? (
                        <span className="find-similar-melodies-source">{row.source}</span>
                      ) : null}
                      {row.kind === 'tunebook' ? (
                        <span className="badge text-bg-secondary">In tunebook</span>
                      ) : null}
                    </span>
                  </div>
                  {row.abc ? (
                    <div className="find-similar-melodies-preview">
                      <AbcSnippetPreview abc={row.abc} maxBars={6} />
                    </div>
                  ) : null}
                </ListGroup.Item>
              )
            })}
          </ListGroup>
        ) : null}
      </Modal.Body>
      <Modal.Footer>
        <Button
          variant="secondary"
          onClick={handleClose}
          disabled={importing}
        >
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
