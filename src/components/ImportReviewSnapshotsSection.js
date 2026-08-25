import { useEffect, useState } from 'react'
import { Form, ListGroup } from 'react-bootstrap'
import { importReviewSnapshotEntries, snapshotKindLabel } from '../importReviewSnapshots'
import { isPdfTuneFileType } from '../tuneFiles'

function SnapshotPreview(props) {
  const file = props.file
  const [objectUrl, setObjectUrl] = useState('')

  useEffect(function() {
    if (!file || !file.blob || isPdfTuneFileType(file.type)) {
      setObjectUrl('')
      return undefined
    }
    const url = URL.createObjectURL(file.blob)
    setObjectUrl(url)
    return function() {
      URL.revokeObjectURL(url)
    }
  }, [file && file.blob, file && file.type])

  if (!objectUrl) return null

  return (
    <img
      src={objectUrl}
      alt={file.name || 'Sheet snapshot'}
      className="import-review-snapshot-thumb"
      style={{ maxWidth: '120px', maxHeight: '120px', objectFit: 'contain' }}
    />
  )
}

export function ImportReviewPendingMidiSection(props) {
  const link = props.pendingMidiLink
  if (!link) return null

  return (
    <ListGroup className="mb-2">
      <ListGroup.Item className="py-2">
        <div className="text-truncate">{link.title || link.name || 'MIDI file'}</div>
        <div className="text-muted small">MIDI link · Will attach on import</div>
      </ListGroup.Item>
    </ListGroup>
  )
}

export default function ImportReviewSnapshotsSection(props) {
  const entries = importReviewSnapshotEntries(props.tuneFiles, props.pendingSnapshots)
  if (!entries.length) return null

  return (
    <div className="tune-record-form-block" data-testid="import-review-snapshots">
      <Form.Label className="mb-1">Snapshots</Form.Label>
      <ListGroup>
        {entries.map(function(file) {
          const kind = snapshotKindLabel(file.type)
          const status = file.pending ? 'Will attach on import' : 'Attached'
          return (
            <ListGroup.Item
              key={file.id}
              className="d-flex justify-content-between align-items-start gap-3 py-2"
            >
              <div style={{ minWidth: 0 }}>
                <div className="text-truncate">{file.name || 'File'}</div>
                <div className="text-muted small">{kind} · {status}</div>
              </div>
              {file.pending ? <SnapshotPreview file={file} /> : null}
            </ListGroup.Item>
          )
        })}
      </ListGroup>
    </div>
  )
}
