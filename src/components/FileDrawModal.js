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
  const strokesRef = useRef(strokes)
  const viewControlsRef = useRef(null)

  useEffect(function() {
    strokesRef.current = strokes
  }, [strokes])

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

  useEffect(function() {
    if (!show) return undefined
    const modal = document.querySelector('.file-draw-modal')
    if (!modal) return undefined

    function onTouchMove(e) {
      if (e.touches && e.touches.length >= 2) e.preventDefault()
    }

    function blockGesture(e) {
      e.preventDefault()
    }

    modal.addEventListener('touchmove', onTouchMove, { passive: false })
    modal.addEventListener('gesturestart', blockGesture, { passive: false })
    modal.addEventListener('gesturechange', blockGesture, { passive: false })
    modal.addEventListener('gestureend', blockGesture, { passive: false })
    return function() {
      modal.removeEventListener('touchmove', onTouchMove)
      modal.removeEventListener('gesturestart', blockGesture)
      modal.removeEventListener('gesturechange', blockGesture)
      modal.removeEventListener('gestureend', blockGesture)
    }
  }, [show])

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
    redrawInkLayer(ink, strokesRef.current)
    return compositeImageAndInk(image, ink)
  }

  async function handleClose() {
    if (saving) return
    if (!strokesRef.current.length || !image) {
      onHide()
      return
    }
    setSaving(true)
    try {
      const blob = await flatten()
      if (blob && onSave) {
        await onSave(blob)
      } else {
        onHide()
      }
    } catch (err) {
      onHide()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal show={!!show} onHide={handleClose} fullscreen className="file-draw-modal">
      <Modal.Header closeButton>
        <Modal.Title>
          {title || 'Edit file'}
          {saving ? <span className="ms-2 text-muted" style={{ fontSize: '0.85rem' }}>Saving…</span> : null}
        </Modal.Title>
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
        <ButtonGroup size="sm" aria-label="Undo and redo">
          <Button
            size="sm"
            variant="outline-secondary"
            onClick={undo}
            disabled={!strokes.length || saving}
            title="Undo"
          >
            {tunebook && tunebook.icons ? tunebook.icons.arrowgoback : 'Undo'}
          </Button>
          <Button
            size="sm"
            variant="outline-secondary"
            onClick={redo}
            disabled={!redoStack.length || saving}
            title="Redo"
          >
            {tunebook && tunebook.icons ? tunebook.icons.arrowgoforward : 'Redo'}
          </Button>
        </ButtonGroup>
        <ButtonGroup size="sm" aria-label="Fit and zoom">
          <Button
            size="sm"
            variant="outline-secondary"
            onClick={function() {
              if (viewControlsRef.current && viewControlsRef.current.fitHeight) {
                viewControlsRef.current.fitHeight()
              }
            }}
            disabled={saving}
            title="Fit height"
            aria-label="Fit height"
          >
            {tunebook && tunebook.icons ? tunebook.icons.fitvertical : 'Fit height'}
          </Button>
          <Button
            size="sm"
            variant="outline-secondary"
            onClick={function() {
              if (viewControlsRef.current && viewControlsRef.current.fitWidth) {
                viewControlsRef.current.fitWidth()
              }
            }}
            disabled={saving}
            title="Fit width"
            aria-label="Fit width"
          >
            {tunebook && tunebook.icons ? tunebook.icons.fithorizontal : 'Fit width'}
          </Button>
          <Button
            size="sm"
            variant="outline-secondary"
            onClick={function() {
              if (viewControlsRef.current && viewControlsRef.current.zoomOut) {
                viewControlsRef.current.zoomOut()
              }
            }}
            disabled={saving}
            title="Zoom out"
            aria-label="Zoom out"
          >
            {tunebook && tunebook.icons ? tunebook.icons.zoomout : '−'}
          </Button>
          <Button
            size="sm"
            variant="outline-secondary"
            onClick={function() {
              if (viewControlsRef.current && viewControlsRef.current.resetZoom) {
                viewControlsRef.current.resetZoom()
              }
            }}
            disabled={saving}
            title="Reset zoom"
            aria-label="Reset zoom"
          >
            1×
          </Button>
          <Button
            size="sm"
            variant="outline-secondary"
            onClick={function() {
              if (viewControlsRef.current && viewControlsRef.current.zoomIn) {
                viewControlsRef.current.zoomIn()
              }
            }}
            disabled={saving}
            title="Zoom in"
            aria-label="Zoom in"
          >
            {tunebook && tunebook.icons ? tunebook.icons.zoomin : '+'}
          </Button>
        </ButtonGroup>
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
            onRegisterViewControls={function(controls) { viewControlsRef.current = controls }}
          />
        ) : (
          <div className="p-4 text-center text-muted">Loading image…</div>
        )}
      </Modal.Body>
    </Modal>
  )
}
