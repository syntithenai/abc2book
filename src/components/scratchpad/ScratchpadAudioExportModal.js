import { useEffect, useState } from 'react'
import { Modal, Form, Button } from 'react-bootstrap'
import { DEFAULT_EXPORT_METADATA, normalizeExportMetadata } from '../../scratchpadAudioMetadata'

function MetadataFields(props) {
  const meta = props.metadata || DEFAULT_EXPORT_METADATA
  function setField(key, value) {
    if (props.onChange) props.onChange(Object.assign({}, meta, { [key]: value }))
  }
  return (
    <>
      <Form.Group className="mb-2">
        <Form.Label>Track title</Form.Label>
        <Form.Control size="sm" value={meta.title} onChange={function(e) { setField('title', e.target.value) }} />
      </Form.Group>
      <Form.Group className="mb-2">
        <Form.Label>Artist</Form.Label>
        <Form.Control size="sm" value={meta.artist} onChange={function(e) { setField('artist', e.target.value) }} />
      </Form.Group>
      <Form.Group className="mb-2">
        <Form.Label>Album</Form.Label>
        <Form.Control size="sm" value={meta.album} onChange={function(e) { setField('album', e.target.value) }} />
      </Form.Group>
      <div className="row">
        <Form.Group className="mb-2 col-6">
          <Form.Label>Year</Form.Label>
          <Form.Control size="sm" value={meta.year} onChange={function(e) { setField('year', e.target.value) }} />
        </Form.Group>
        <Form.Group className="mb-2 col-6">
          <Form.Label>Genre</Form.Label>
          <Form.Control size="sm" value={meta.genre} onChange={function(e) { setField('genre', e.target.value) }} />
        </Form.Group>
      </div>
      <Form.Group className="mb-0">
        <Form.Label>Comments</Form.Label>
        <Form.Control as="textarea" rows={2} size="sm" value={meta.comments} onChange={function(e) { setField('comments', e.target.value) }} />
      </Form.Group>
    </>
  )
}

export default function ScratchpadAudioExportModal(props) {
  const [scope, setScope] = useState('project')
  const [format, setFormat] = useState('wav')
  const [filename, setFilename] = useState('')
  const [metadata, setMetadata] = useState(DEFAULT_EXPORT_METADATA)
  const [showMeta, setShowMeta] = useState(false)
  const hasSelection = props.hasSelection

  useEffect(function() {
    if (!props.show) return
    setScope(hasSelection ? 'selection' : 'project')
    setFormat('wav')
    setFilename((props.defaultTitle || 'export') + '.wav')
    setMetadata(normalizeExportMetadata(Object.assign({}, DEFAULT_EXPORT_METADATA, props.defaultMetadata, {
      title: props.defaultTitle || '',
    })))
  }, [props.show, props.defaultTitle, props.defaultMetadata, hasSelection])

  useEffect(function() {
    const base = (filename || 'export').replace(/\.(wav|mp3)$/i, '')
    setFilename(base + (format === 'mp3' ? '.mp3' : '.wav'))
  }, [format])

  function handleExport(e) {
    e.preventDefault()
    if (props.onExport) {
      props.onExport({ scope: scope, format: format, filename: filename, metadata: metadata })
    }
  }

  return (
    <>
      <Modal show={props.show} onHide={props.onHide} centered>
        <Form onSubmit={handleExport}>
          <Modal.Header closeButton><Modal.Title>Export audio</Modal.Title></Modal.Header>
          <Modal.Body>
            <Form.Group className="mb-2">
              <Form.Label>Scope</Form.Label>
              <Form.Control size="sm" as="select" value={scope} onChange={function(e) { setScope(e.target.value) }}>
                <option value="project">Entire project</option>
                <option value="selection" disabled={!hasSelection}>Current selection</option>
              </Form.Control>
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label>Format</Form.Label>
              <Form.Control size="sm" as="select" value={format} onChange={function(e) { setFormat(e.target.value) }}>
                <option value="wav">WAV</option>
                <option value="mp3">MP3</option>
              </Form.Control>
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label>Filename</Form.Label>
              <Form.Control size="sm" value={filename} onChange={function(e) { setFilename(e.target.value) }} />
            </Form.Group>
            <Button variant="link" size="sm" className="px-0" type="button" onClick={function() { setShowMeta(true) }}>
              Edit metadata…
            </Button>
            {format === 'wav' ? (
              <Form.Text className="d-block text-muted small">WAV metadata is not supported by all players.</Form.Text>
            ) : null}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={props.onHide}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={props.busy}>
              {props.busy ? 'Exporting…' : 'Export'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
      <Modal show={showMeta} onHide={function() { setShowMeta(false) }} centered size="sm">
        <Modal.Header closeButton><Modal.Title>Metadata tags</Modal.Title></Modal.Header>
        <Modal.Body>
          <MetadataFields metadata={metadata} onChange={setMetadata} />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="primary" onClick={function() { setShowMeta(false) }}>Done</Button>
        </Modal.Footer>
      </Modal>
    </>
  )
}
