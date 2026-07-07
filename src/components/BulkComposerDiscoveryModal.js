import { useEffect, useState } from 'react'
import { Alert, Button, Modal, Spinner } from 'react-bootstrap'
import { Link } from 'react-router-dom'
import useMediaResolverHealth from '../useMediaResolverHealth'
import useBulkComposerDiscoveryQueue from '../useBulkComposerDiscoveryQueue'

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
  if (preview.willDiscover > 0) {
    parts.push(preview.willDiscover + ' to discover')
  }
  if (preview.reasons['has-composer'] > 0) {
    parts.push(preview.reasons['has-composer'] + ' already have an artist')
  }
  if (preview.reasons['no-title'] > 0) {
    parts.push(preview.reasons['no-title'] + ' missing a title')
  }
  return parts.join(' · ')
}

export default function BulkComposerDiscoveryModal({
  tunebook,
  selected,
  selectedCount,
  token,
}) {
  const icons = tunebook.icons
  const [show, setShow] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const queue = useBulkComposerDiscoveryQueue()
  const {
    available: resolverAvailable,
    checked,
    refreshMediaResolverHealth,
  } = useMediaResolverHealth()

  useEffect(function() {
    if (!show) return
    refreshMediaResolverHealth()
  }, [show, refreshMediaResolverHealth])

  function selectedTunes() {
    return tunebook.fromSelection(selected)
  }

  function accessToken() {
    return token && token.access_token ? token.access_token : null
  }

  function preview() {
    return queue.previewEnqueueTunes(selectedTunes())
  }

  function handleStart() {
    queue.enqueueTunes(selectedTunes(), {
      accessToken: accessToken(),
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

  const previewSummary = show ? preview() : null

  return (
    <>
      <BulkOpsButton
        variant="outline-primary"
        icon={icons.search}
        label="Discover artists"
        onClick={function() { setShow(true) }}
      >
        Artists
      </BulkOpsButton>

      <Modal show={show} onHide={function() { setShow(false) }} size="lg" scrollable>
        <Modal.Header closeButton>
          <Modal.Title>
            Discover artists for {selectedCount} selected tune{selectedCount === 1 ? '' : 's'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {!checked ? (
            <div>
              <Spinner animation="border" size="sm" role="status" className="me-2" />
              Checking media resolver…
            </div>
          ) : null}
          {checked && !resolverAvailable ? (
            <Alert variant="warning">
              <p style={{ marginBottom: '0.5em' }}>
                Full composer discovery uses the media resolver. Without it, only MusicBrainz lookup runs.
                Set the resolver URL in <Link to="/settings">Settings</Link>.
              </p>
              <Button variant="outline-primary" size="sm" disabled={retrying} onClick={handleRetryHealth}>
                {retrying ? 'Checking…' : 'Check again'}
              </Button>
            </Alert>
          ) : null}
          <p>
            Discover recording artists for selected tunes using MusicBrainz, web search, and optional LLM lookup.
            Tunes that already have a specific artist are skipped.
          </p>
          {previewSummary ? (
            <p className="text-muted" style={{ marginBottom: 0 }}>
              {formatPreviewSummary(previewSummary) || 'No tunes eligible for composer discovery.'}
            </p>
          ) : null}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={function() { setShow(false) }}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!previewSummary || previewSummary.willDiscover === 0}
            onClick={handleStart}
          >
            Start discovery
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  )
}
