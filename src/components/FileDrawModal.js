import { useEffect, useRef, useState } from 'react'
import { Button, ButtonGroup, Modal } from 'react-bootstrap'
import FileDrawStage from './FileDrawStage'
import {
  compositeImageAndInk,
  loadImageFromBlob,
} from '../fileDrawStrokeUtils'

const WIDTHS = [2, 4, 8]
const COLORS = ['#111111', '#c62828', '#1565c0']

export default function FileDrawModal(props) {
  const {
    show,
    onHide,
    imageBlob,
    title,
    tunebook,
    onSave,
  } = props

  const [image, setImage] = useState(null)
  const [tool, setTool] = useState('pen')
  const [color, setColor] = useState(COLORS[0])
  const [width, setWidth] = useState(WIDTHS[1])
  const [strokes, setStrokes] = useState([])
  const [redoStack, setRedoStack] = useState([])
  const [saving, setSaving] = useState(false)
  const resetZoomRef = useRef(null)

  useEffect(function() {
    let cancelled = false
    let objectUrl = null
    if (!show || !imageBlob) {
      setImage(function(prev) {
        if (prev && prev.src && String(prev.src).indexOf('blob:') === 0) {
          URL.revokeObjectURL(prev.src)
        }
        return null
      })
      setStrokes([])
      setRedoStack([])
      return undefined
    }
    loadImageFromBlob(imageBlob).then(function(img) {
      if (cancelled) {
        if (img && img.src && String(img.src).indexOf('blob:') === 0) {
          URL.revokeObjectURL(img.src)
        }
        return
      }
      objectUrl = img.src
      setImage(function(prev) {
        if (prev && prev.src && prev.src !== img.src && String(prev.src).indexOf('blob:') === 0) {
          URL.revokeObjectURL(prev.src)
        }
        return img
      })
    }).catch(function() {
      if (!cancelled) setImage(null)
    })
    return function() {
      cancelled = true
      if (objectUrl && String(objectUrl).indexOf('blob:') === 0) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [show, imageBlob])

  function undo() {
    if (!strokes.length) return
    const next = strokes.slice(0, -1)
    setRedoStack(redoStack.concat([strokes[strokes.length - 1]]))
    setStrokes(next)
  }

  function redo() {
    if (!redoStack.length) return
    const stroke = redoStack[redoStack.length - 1]
    setRedoStack(redoStack.slice(0, -1))
    setStrokes(strokes.concat([stroke]))
  }

  async function flatten() {
    if (!image) return null
    const ink = document.createElement('canvas')
    ink.width = image.naturalWidth || image.width
    ink.height = image.naturalHeight || image.height
    const { redrawInkLayer } = await import('../fileDrawStrokeUtils')
    redrawInkLayer(ink, strokes)
    return compositeImageAndInk(image, ink)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const blob = await flatten()
      if (!blob) return
      if (onSave) await onSave(blob)
      onHide()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal show={!!show} onHide={onHide} fullscreen className="file-draw-modal">
      <Modal.Header closeButton>
        <Modal.Title>{title || 'Edit file'}</Modal.Title>
      </Modal.Header>
      <div className="file-draw-toolbar d-flex flex-wrap gap-2 align-items-center px-2 py-2 border-bottom">
        <ButtonGroup size="sm">
          <Button
            variant={tool === 'pen' ? 'primary' : 'outline-secondary'}
            onClick={function() { setTool('pen') }}
            title="Pen"
          >
            {tunebook && tunebook.icons ? tunebook.icons.pencil : 'Pen'}
          </Button>
          <Button
            variant={tool === 'eraser' ? 'primary' : 'outline-secondary'}
            onClick={function() { setTool('eraser') }}
            title="Eraser"
          >
            {tunebook && tunebook.icons ? tunebook.icons.eraser : 'Eraser'}
          </Button>
        </ButtonGroup>
        <ButtonGroup size="sm">
          {WIDTHS.map(function(w) {
            return (
              <Button
                key={w}
                variant={width === w ? 'primary' : 'outline-secondary'}
                onClick={function() { setWidth(w) }}
              >
                {w}px
              </Button>
            )
          })}
        </ButtonGroup>
        {tool === 'pen' ? (
          <ButtonGroup size="sm">
            {COLORS.map(function(c) {
              return (
                <Button
                  key={c}
                  variant={color === c ? 'primary' : 'outline-secondary'}
                  onClick={function() { setColor(c) }}
                  style={{ backgroundColor: color === c ? c : undefined }}
                >
                  <span style={{ display: 'inline-block', width: 12, height: 12, background: c, borderRadius: 2 }} />
                </Button>
              )
            })}
          </ButtonGroup>
        ) : null}
        <Button size="sm" variant="outline-secondary" onClick={undo} disabled={!strokes.length}>Undo</Button>
        <Button size="sm" variant="outline-secondary" onClick={redo} disabled={!redoStack.length}>Redo</Button>
        <Button
          size="sm"
          variant="outline-secondary"
          onClick={function() {
            if (resetZoomRef.current) resetZoomRef.current()
          }}
        >
          Fit
        </Button>
        <div className="ms-auto d-flex gap-2">
          <Button size="sm" variant="secondary" onClick={onHide} disabled={saving}>Cancel</Button>
          <Button size="sm" variant="success" onClick={handleSave} disabled={saving || !image}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
      <Modal.Body className="p-0 d-flex flex-column" style={{ height: 'calc(100vh - 8rem)', minHeight: 0 }}>
        {image ? (
          <FileDrawStage
            image={image}
            tool={tool}
            color={color}
            width={width}
            strokes={strokes}
            onStrokesChange={function(next) {
              setStrokes(next)
              setRedoStack([])
            }}
            onRegisterResetZoom={function(fn) { resetZoomRef.current = fn }}
          />
        ) : (
          <div className="p-4 text-center text-muted">Loading image…</div>
        )}
      </Modal.Body>
    </Modal>
  )
}
