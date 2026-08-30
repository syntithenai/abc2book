/**
 * Staff preview with interactive chord overlay for Import Book review.
 */
import { useEffect, useRef, useState } from 'react'
import { Button, ButtonGroup, Form, Modal } from 'react-bootstrap'
import {
  applyChordToNoteIndex,
  mountChordOverlay,
  normalizeChordSymbolName,
  renderAbcForChordOverlay,
} from '../bookImportChordOverlay'

export default function BookImportStaffWithChords(props) {
  const abc = String(props.abc || '')
  const playOn = !!props.playOn
  const onPlayToggle = props.onPlayToggle
  const onAbcChange = props.onAbcChange
  const staffRef = useRef(null)
  const cleanupRef = useRef(null)
  const [chordDialog, setChordDialog] = useState(null)
  const [chordInput, setChordInput] = useState('')

  useEffect(function() {
    const container = staffRef.current
    if (!container || !abc.trim()) return undefined
    container.innerHTML = ''
    const result = renderAbcForChordOverlay(container, abc)
    if (cleanupRef.current) cleanupRef.current()
    cleanupRef.current = mountChordOverlay({
      container: container,
      visual: result.visual,
      sourceAbc: abc,
      onOpenDialog: function(ctx) {
        setChordInput(ctx.chordName || '')
        setChordDialog(ctx)
      },
    })
    return function() {
      if (cleanupRef.current) cleanupRef.current()
      cleanupRef.current = null
    }
  }, [abc])

  function saveChordDialog() {
    if (!chordDialog || typeof onAbcChange !== 'function') {
      setChordDialog(null)
      return
    }
    const name = normalizeChordSymbolName(chordInput)
    const next = applyChordToNoteIndex(abc, chordDialog.noteIndex, name)
    onAbcChange(next)
    setChordDialog(null)
  }

  function removeChordDialog() {
    if (!chordDialog || typeof onAbcChange !== 'function') {
      setChordDialog(null)
      return
    }
    const next = applyChordToNoteIndex(abc, chordDialog.noteIndex, '')
    onAbcChange(next)
    setChordDialog(null)
  }

  return (
    <>
      <div className="d-flex align-items-center justify-content-between mb-1">
        <div className="bir-col-label">Notation</div>
        <ButtonGroup size="sm">
          <Button
            variant={playOn ? 'danger' : 'outline-primary'}
            disabled={!abc}
            onClick={function() {
              if (onPlayToggle) onPlayToggle(!playOn)
            }}
          >
            {playOn ? 'Stop' : 'Play'}
          </Button>
        </ButtonGroup>
      </div>
      <div className="bir-staff-wrap bir-staff-wrap--chord-edit" ref={staffRef} />
      <Modal show={!!chordDialog} onHide={function() { setChordDialog(null) }} centered size="sm">
        <Modal.Header closeButton>
          <Modal.Title>{chordDialog && chordDialog.chordName ? 'Edit chord' : 'Add chord'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Control
            value={chordInput}
            onChange={function(e) { setChordInput(e.target.value) }}
            placeholder="Am, G7, D/F#"
            autoFocus
          />
        </Modal.Body>
        <Modal.Footer>
          {chordDialog && chordDialog.chordName ? (
            <Button variant="outline-danger" onClick={removeChordDialog}>Remove</Button>
          ) : null}
          <Button variant="primary" onClick={saveChordDialog}>Save</Button>
        </Modal.Footer>
      </Modal>
    </>
  )
}
