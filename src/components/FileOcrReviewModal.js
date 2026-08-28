import { useEffect, useState } from 'react'
import { Button, ListGroup, Modal } from 'react-bootstrap'
import {
  applyFileOcrPatch,
  dismissFileOcrJob,
  getFileOcrJob,
  getFileOcrJobs,
  subscribeFileOcrJobs,
} from '../fileOcrJobs'

/**
 * Lightweight confirm UI for ready file OCR patches on the current tune.
 */
export default function FileOcrReviewModal(props) {
  const { show, onHide, tunes, tunebook, focusJobId } = props
  const [revision, setRevision] = useState(0)
  const [activeJobId, setActiveJobId] = useState(null)
  const [selectedPatchIndex, setSelectedPatchIndex] = useState(0)

  useEffect(function() {
    return subscribeFileOcrJobs(function() {
      setRevision(function(v) { return v + 1 })
    })
  }, [])

  useEffect(function() {
    if (show && focusJobId) setActiveJobId(focusJobId)
  }, [show, focusJobId])

  void revision

  const readyJobs = getFileOcrJobs().filter(function(job) {
    return job && job.status === 'ready'
  })
  const job = getFileOcrJob(activeJobId) || readyJobs[0] || null
  const patches = job && job.result && Array.isArray(job.result.patches) ? job.result.patches : []
  const patch = patches[selectedPatchIndex] || null
  const tune = job && tunes ? tunes[job.tuneId] : null

  function applySelected() {
    if (!job || !patch || !tune || !tunebook || !tunebook.saveTune) return
    const next = applyFileOcrPatch(tune, patch)
    tunebook.saveTune(next)
    if (patches.length <= 1) {
      dismissFileOcrJob(job.id)
      setActiveJobId(null)
      setSelectedPatchIndex(0)
      if (readyJobs.length <= 1 && onHide) onHide()
    } else {
      const remaining = patches.filter(function(_, i) { return i !== selectedPatchIndex })
      job.result = Object.assign({}, job.result, { patches: remaining })
      setSelectedPatchIndex(0)
      setRevision(function(v) { return v + 1 })
    }
  }

  function skipJob() {
    if (!job) return
    dismissFileOcrJob(job.id)
    setActiveJobId(null)
    setSelectedPatchIndex(0)
    if (readyJobs.length <= 1 && onHide) onHide()
  }

  return (
    <Modal show={!!show} onHide={onHide} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title>File OCR review</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {readyJobs.length === 0 ? (
          <div className="text-muted">No file OCR results waiting for review.</div>
        ) : (
          <div className="row">
            <div className="col-md-4">
              <div className="fw-semibold small mb-2">Ready</div>
              <ListGroup>
                {readyJobs.map(function(item) {
                  return (
                    <ListGroup.Item
                      key={item.id}
                      action
                      active={job && job.id === item.id}
                      onClick={function() {
                        setActiveJobId(item.id)
                        setSelectedPatchIndex(0)
                      }}
                    >
                      <div className="small fw-semibold">{item.tuneName || item.tuneId}</div>
                      <div className="small text-muted">{item.fileName}</div>
                    </ListGroup.Item>
                  )
                })}
              </ListGroup>
            </div>
            <div className="col-md-8">
              {!job ? null : (
                <>
                  <div className="mb-2">
                    Suggested changes for <strong>{job.tuneName || 'tune'}</strong> from <em>{job.fileName}</em>
                    {job.result && job.result.transcription && (job.result.transcription.sheetFormat || job.result.transcription.pageType)
                      ? (
                        <span className="text-muted">
                          {' '}({String(job.result.transcription.sheetFormat || job.result.transcription.pageType)})
                        </span>
                      )
                      : null}
                  </div>
                  {patches.length === 0 ? (
                    <div className="text-muted">No patches.</div>
                  ) : (
                    <>
                      <ListGroup className="mb-3">
                        {patches.map(function(p, idx) {
                          return (
                            <ListGroup.Item
                              key={p.field + '-' + idx}
                              action
                              active={idx === selectedPatchIndex}
                              onClick={function() { setSelectedPatchIndex(idx) }}
                            >
                              {p.label || p.field}
                            </ListGroup.Item>
                          )
                        })}
                      </ListGroup>
                      {patch ? (
                        <div>
                          <div className="small text-muted">Current</div>
                          <pre className="bg-light p-2 small" style={{ maxHeight: '8rem', overflow: 'auto' }}>
                            {String(patch.oldValue || '(empty)')}
                          </pre>
                          <div className="small text-muted">Proposed</div>
                          <pre className="bg-light p-2 small" style={{ maxHeight: '12rem', overflow: 'auto' }}>
                            {String(patch.newValue || '')}
                          </pre>
                        </div>
                      ) : null}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onHide}>Close</Button>
        {job ? <Button variant="outline-danger" onClick={skipJob}>Dismiss</Button> : null}
        {patch ? <Button variant="primary" onClick={applySelected}>Apply this change</Button> : null}
      </Modal.Footer>
    </Modal>
  )
}
