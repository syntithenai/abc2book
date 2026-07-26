import { useEffect, useRef, useState } from 'react'
import { Button, ButtonGroup } from 'react-bootstrap'
import FileDrawStage from '../FileDrawStage'
import ScratchpadTextBlockLayer from './ScratchpadTextBlockLayer'
import ScratchpadImageCropTool from './ScratchpadImageCropTool'
import ScratchpadEditorChrome from './ScratchpadEditorChrome'
import {
  loadImageFromBlob,
  redrawInkLayer,
} from '../../fileDrawStrokeUtils'
import { getScratchpadBlob, putScratchpadBlob } from '../../scratchpadBlobs'
import { updateScratchpadItem } from '../../scratchpadStore'
import utilsFunctions from '../../utilsFunctions'

const utils = utilsFunctions()
const WIDTHS = [2, 4, 8]
const COLORS = ['#111111', '#c62828', '#1565c0']

function canvasToBlob(canvas) {
  return new Promise(function(resolve, reject) {
    canvas.toBlob(function(blob) {
      if (blob) resolve(blob)
      else reject(new Error('Could not export image'))
    }, 'image/png')
  })
}

export default function ScratchpadImageEditor(props) {
  const item = props.item
  const [image, setImage] = useState(null)
  const [tool, setTool] = useState('pen')
  const [mode, setMode] = useState('draw')
  const [color, setColor] = useState(COLORS[0])
  const [width, setWidth] = useState(WIDTHS[1])
  const [strokes, setStrokes] = useState((item.image && item.image.strokes) || [])
  const [textBlocks, setTextBlocks] = useState((item.image && item.image.textBlocks) || [])
  const [crop, setCrop] = useState((item.image && item.image.crop) || { x: 5, y: 5, width: 90, height: 90 })
  const [textDraft, setTextDraft] = useState(null)
  const [redoStack, setRedoStack] = useState([])
  const [saving, setSaving] = useState(false)
  const viewControlsRef = useRef(null)
  const stageWrapRef = useRef(null)
  const imageContentRef = useRef(null)
  const inkOverlayRef = useRef(null)
  const textDragRef = useRef(null)
  const saveTimeout = useRef(null)

  useEffect(function() {
    let cancelled = false
    const blobKey = item.image && item.image.blobKey
    if (!blobKey) return undefined
    getScratchpadBlob(blobKey).then(function(blob) {
      if (cancelled || !blob) return
      return loadImageFromBlob(blob)
    }).then(function(img) {
      if (!cancelled && img) setImage(img)
    })
    return function() {
      cancelled = true
    }
  }, [item.id, item.image && item.image.blobKey])

  useEffect(function() {
    if (!image || !inkOverlayRef.current || mode === 'draw') return
    const canvas = inkOverlayRef.current
    canvas.width = image.naturalWidth || image.width
    canvas.height = image.naturalHeight || image.height
    redrawInkLayer(canvas, strokes, image)
  }, [image, strokes, mode])

  function persistMeta(patch, notifyParent) {
    clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(function() {
      updateScratchpadItem(item.id, {
        image: Object.assign({}, item.image || {}, patch),
      })
      if (notifyParent && props.onChange) props.onChange()
    }, 400)
  }

  function handleStrokesChange(next) {
    setStrokes(next)
    persistMeta({ strokes: next })
  }

  function handleTextBlocksChange(next) {
    setTextBlocks(next)
    persistMeta({ textBlocks: next })
  }

  function undo() {
    if (!strokes.length) return
    const next = strokes.slice(0, -1)
    setRedoStack(redoStack.concat([strokes[strokes.length - 1]]))
    handleStrokesChange(next)
  }

  function redo() {
    if (!redoStack.length) return
    const stroke = redoStack[redoStack.length - 1]
    setRedoStack(redoStack.slice(0, -1))
    handleStrokesChange(strokes.concat([stroke]))
  }

  function getPercentFromEvent(e) {
    const el = imageContentRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    return {
      x: Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)),
    }
  }

  function onTextPointerDown(e) {
    if (mode !== 'text') return
    if (e.target.closest('.scratchpad-text-block')) return
    e.preventDefault()
    const pt = getPercentFromEvent(e)
    if (!pt) return
    textDragRef.current = { start: pt }
    setTextDraft({ x: pt.x, y: pt.y, width: 0, height: 0 })
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch (err) { /* ignore */ }
  }

  function onTextPointerMove(e) {
    if (!textDragRef.current) return
    const pt = getPercentFromEvent(e)
    if (!pt) return
    const start = textDragRef.current.start
    setTextDraft({
      x: Math.min(start.x, pt.x),
      y: Math.min(start.y, pt.y),
      width: Math.abs(pt.x - start.x),
      height: Math.abs(pt.y - start.y),
    })
  }

  function onTextPointerUp(e) {
    if (!textDragRef.current) return
    const draft = textDraft
    textDragRef.current = null
    setTextDraft(null)
    if (draft && draft.width > 2 && draft.height > 2) {
      handleTextBlocksChange(textBlocks.concat([{
        id: utils.generateObjectId(),
        x: draft.x,
        y: draft.y,
        width: draft.width,
        height: draft.height,
        fontSize: 18,
        color: '#111111',
        text: 'Text',
      }]))
    }
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch (err) { /* ignore */ }
  }

  async function applyCrop() {
    if (!image) return
    setSaving(true)
    try {
      const iw = image.naturalWidth || image.width
      const ih = image.naturalHeight || image.height
      const sx = Math.round((crop.x / 100) * iw)
      const sy = Math.round((crop.y / 100) * ih)
      const sw = Math.round((crop.width / 100) * iw)
      const sh = Math.round((crop.height / 100) * ih)
      const full = document.createElement('canvas')
      full.width = iw
      full.height = ih
      redrawInkLayer(full, strokes, image, textBlocks)
      const canvas = document.createElement('canvas')
      canvas.width = sw
      canvas.height = sh
      const ctx = canvas.getContext('2d')
      ctx.drawImage(full, sx, sy, sw, sh, 0, 0, sw, sh)
      const blob = await canvasToBlob(canvas)
      await putScratchpadBlob(item.image.blobKey, blob)
      setStrokes([])
      setTextBlocks([])
      setCrop({ x: 5, y: 5, width: 90, height: 90 })
      persistMeta({ strokes: [], textBlocks: [], crop: null }, true)
      const img = await loadImageFromBlob(blob)
      setImage(img)
      setMode('draw')
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  async function flattenAndSave() {
    if (!image) return
    setSaving(true)
    try {
      const ink = document.createElement('canvas')
      ink.width = image.naturalWidth || image.width
      ink.height = image.naturalHeight || image.height
      redrawInkLayer(ink, strokes, image, textBlocks)
      const blob = await canvasToBlob(ink)
      await putScratchpadBlob(item.image.blobKey, blob)
      const img = await loadImageFromBlob(blob)
      setImage(img)
      setStrokes([])
      setTextBlocks([])
      persistMeta({ strokes: [], textBlocks: [] }, true)
    } finally {
      setSaving(false)
    }
  }

  function renderStaticStage() {
    return (
      <div className="scratchpad-image-static-stage">
        <div className="scratchpad-image-static-content" ref={imageContentRef}>
          {image ? (
            <img src={image.src} alt="" draggable={false} />
          ) : (
            <div className="p-4 text-muted">Loading…</div>
          )}
          {image ? (
            <canvas ref={inkOverlayRef} className="scratchpad-image-ink-overlay" />
          ) : null}
          {mode === 'text' ? (
            <div
              className="scratchpad-text-placement-layer"
              onPointerDown={onTextPointerDown}
              onPointerMove={onTextPointerMove}
              onPointerUp={onTextPointerUp}
              onPointerCancel={onTextPointerUp}
            />
          ) : null}
          {textDraft ? (
            <div
              className="scratchpad-text-draft-rect"
              style={{
                left: textDraft.x + '%',
                top: textDraft.y + '%',
                width: textDraft.width + '%',
                height: textDraft.height + '%',
              }}
            />
          ) : null}
          <ScratchpadTextBlockLayer
            textBlocks={textBlocks}
            mode={mode}
            onChange={handleTextBlocksChange}
          />
          <ScratchpadImageCropTool
            active={mode === 'crop'}
            crop={crop}
            containerRef={imageContentRef}
            onChange={function(next) {
              setCrop(next)
              persistMeta({ crop: next })
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="scratchpad-image-editor">
      <ScratchpadEditorChrome
        item={item}
        tunebook={props.tunebook}
        tunes={props.tunes}
        token={props.token}
        login={props.login}
        onChange={props.onChange}
        onDeleted={props.onDeleted}
        onBack={props.onBack}
        onUndo={undo}
        onRedo={redo}
        canUndo={strokes.length > 0}
        canRedo={redoStack.length > 0}
      >
        <ButtonGroup size="sm">
          <Button variant={mode === 'draw' && tool === 'pen' ? 'primary' : 'outline-secondary'} onClick={function() { setMode('draw'); setTool('pen') }}>Pen</Button>
          <Button variant={mode === 'draw' && tool === 'eraser' ? 'primary' : 'outline-secondary'} onClick={function() { setMode('draw'); setTool('eraser') }}>Eraser</Button>
          <Button variant={mode === 'text' ? 'primary' : 'outline-secondary'} onClick={function() { setMode('text') }}>Text</Button>
          <Button variant={mode === 'crop' ? 'primary' : 'outline-secondary'} onClick={function() { setMode('crop') }}>Crop</Button>
        </ButtonGroup>
        {mode === 'draw' && tool === 'pen' ? (
          <ButtonGroup size="sm">
            {COLORS.map(function(c) {
              return (
                <Button key={c} variant={color === c ? 'primary' : 'outline-secondary'} onClick={function() { setColor(c) }}>
                  <span style={{ display: 'inline-block', width: 12, height: 12, background: c }} />
                </Button>
              )
            })}
          </ButtonGroup>
        ) : null}
        {mode === 'text' ? (
          <span className="small text-muted">Drag on image to place text</span>
        ) : null}
        {mode === 'crop' ? (
          <Button size="sm" variant="success" onClick={applyCrop} disabled={saving}>Apply crop</Button>
        ) : (
          <Button
            size="sm"
            variant="success"
            onClick={flattenAndSave}
            disabled={saving}
            title="Permanently merge pen strokes and text labels into the image"
          >
            Merge into image
          </Button>
        )}
        {viewControlsRef.current ? (
          <ButtonGroup size="sm">
            <Button variant="outline-secondary" onClick={function() { viewControlsRef.current.zoomIn() }}>+</Button>
            <Button variant="outline-secondary" onClick={function() { viewControlsRef.current.zoomOut() }}>-</Button>
            <Button variant="outline-secondary" onClick={function() { viewControlsRef.current.fitWidth() }}>Fit</Button>
          </ButtonGroup>
        ) : null}
      </ScratchpadEditorChrome>
      <div className="scratchpad-image-stage-wrap" ref={stageWrapRef}>
        {mode === 'draw' ? (
          <FileDrawStage
            image={image}
            tool={tool}
            color={color}
            width={width}
            strokes={strokes}
            compositeBase={true}
            onStrokesChange={handleStrokesChange}
            onRegisterViewControls={function(ctrl) { viewControlsRef.current = ctrl }}
            overlayChildren={(
              <ScratchpadTextBlockLayer
                textBlocks={textBlocks}
                mode="view"
                onChange={handleTextBlocksChange}
              />
            )}
          />
        ) : renderStaticStage()}
      </div>
    </div>
  )
}
