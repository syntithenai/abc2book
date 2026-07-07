import { useEffect, useState } from 'react'
import { Alert, Button, Modal, Spinner } from 'react-bootstrap'
import { Link } from 'react-router-dom'
import useMediaResolverHealth from '../useMediaResolverHealth'
import useBulkBackgroundResearchQueue from '../useBulkBackgroundResearchQueue'
import { lyricLinesToText } from '../wLinesUtils'

function BulkOpsButton({ icon, label, className, children, ...buttonProps }) {
  const classes = ['bulk-ops-action-btn']
  if (className) classes.push(className)
  return (
    <Button
      className={classes.join(' ')}
      aria-label={label}
      title={label}
      {...buttonProps}
    >
      {icon}
      <span className="bulk-ops-btn-label">{children || label}</span>
    </Button>
  )
}

function formatPreviewSummary(preview) {
  const parts = []
  if (preview.willResearch > 0) {
    parts.push(preview.willResearch + ' to research')
  }
  if (preview.reasons['has-background'] > 0) {
    parts.push(preview.reasons['has-background'] + ' already have background info')
  }
  if (preview.reasons['no-title'] > 0) {
    parts.push(preview.reasons['no-title'] + ' missing a title')
  }
  return parts.join(' · ')
}

function ResolverStatusMessage({ checked, resolverAvailable, features, onRetry, retrying }) {
  if (!checked) {
    return (
      <div className="bulk-search-resolver-status">
        <Spinner animation="border" size="sm" role="status" className="me-2" />
        Checking media resolver…
      </div>
    )
  }

  if (!resolverAvailable) {
    return (
      <Alert variant="warning">
        <p style={{ marginBottom: '0.5em' }}>
          No media resolver is reachable. Set the resolver URL in{' '}
          <Link to="/settings">Settings</Link> (for example <code>http://localhost:8787</code>)
          and make sure it is running.
        </p>
        <Button variant="outline-primary" size="sm" disabled={retrying} onClick={onRetry}>
          {retrying ? 'Checking…' : 'Check again'}
        </Button>
      </Alert>
    )
  }

  if (!features.llm) {
    return (
      <Alert variant="warning">
        <p style={{ marginBottom: '0.5em' }}>
          The resolver is running, but the LLM for background research is not available.
          Start LM Studio (or your OpenAI-compatible LLM) and ensure the resolver can reach it.
        </p>
        <p style={{ marginBottom: '0.5em', fontSize: '0.95em' }}>
          If the resolver runs in Docker on Linux, LM Studio usually listens only on{' '}
          <code>127.0.0.1:1234</code>. Use the <code>llm-bridge</code> service in{' '}
          <code>local-resolver/docker-compose.yml</code> and set{' '}
          <code>RESEARCH_LLM_BASE_URL=http://host.docker.internal:12340/v1</code> in{' '}
          <code>local-resolver/.env</code>, then restart the resolver.
        </p>
        <p style={{ marginBottom: '0.75em', fontSize: '0.95em' }}>
          See <Link to="/help#media-resolver">Media resolver</Link> help for more detail.
        </p>
        <Button variant="outline-primary" size="sm" disabled={retrying} onClick={onRetry}>
          {retrying ? 'Checking…' : 'Check again'}
        </Button>
      </Alert>
    )
  }

  return null
}

export default function BulkSearchModal({
  tunebook,
  selected,
  selectedCount,
  token,
}) {
  const icons = tunebook.icons
  const [show, setShow] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const queue = useBulkBackgroundResearchQueue()
  const {
    available: resolverAvailable,
    checked,
    features,
    refreshMediaResolverHealth,
  } = useMediaResolverHealth()
  const canResearchBackground = resolverAvailable && features.llm

  useEffect(function() {
    if (!show) return
    refreshMediaResolverHealth()
  }, [show, refreshMediaResolverHealth])

  function selectedTunes() {
    return tunebook.fromSelection(selected)
  }

  function handleClose() {
    setShow(false)
  }

  function handleShow() {
    setShow(true)
  }

  function accessToken() {
    return token && token.access_token ? token.access_token : null
  }

  function preview() {
    return queue.previewEnqueueTunes(selectedTunes())
  }

  function handleStart() {
    const tunes = selectedTunes()
    queue.enqueueTunes(tunes, {
      accessToken: accessToken(),
      lyricsForTune: lyricLinesToText,
    })
    queue.start()
    setShow(false)
  }

  async function handleRetryHealth() {
    setRetrying(true)
    try {
      await refreshMediaResolverHealth()
    } finally {
      setRetrying(false)
    }
  }

  const previewSummary = show && canResearchBackground ? preview() : null
  const statusMessage = show && !canResearchBackground
    ? (
      <ResolverStatusMessage
        checked={checked}
        resolverAvailable={resolverAvailable}
        features={features}
        onRetry={handleRetryHealth}
        retrying={retrying}
      />
    )
    : null

  return (
    <>
      <BulkOpsButton
        variant="primary"
        icon={icons.search}
        label="Search"
        onClick={handleShow}
      >
        Search
      </BulkOpsButton>

      <Modal
        show={show}
        onHide={handleClose}
        size="xl"
        scrollable
        className="bulk-search-modal"
        backdropClassName="bulk-search-backdrop"
        dialogClassName="bulk-search-modal-dialog"
        contentClassName="bulk-search-modal-content"
      >
        <Modal.Header closeButton>
          <Modal.Title>Search background for {selectedCount} selected tune{selectedCount === 1 ? '' : 's'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {statusMessage}
          {canResearchBackground && (
            <>
              <p>
                Research background information for selected tunes using web search and AI summarization.
                Tunes that already have background info are skipped.
              </p>
              {previewSummary && (
                <p className="text-muted" style={{ marginBottom: 0 }}>
                  {formatPreviewSummary(previewSummary) || 'No tunes eligible for research.'}
                </p>
              )}
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleClose}>Cancel</Button>
          {canResearchBackground && (
            <Button
              variant="primary"
              disabled={!previewSummary || previewSummary.willResearch === 0}
              onClick={handleStart}
            >
              Start research
            </Button>
          )}
        </Modal.Footer>
      </Modal>
    </>
  )
}
