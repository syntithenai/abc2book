import { useRef, useState, useCallback } from 'react'
import { Button } from 'react-bootstrap'
import LyricsSectionsDropdown from '../LyricsSectionsDropdown'
import LyricsToolsModal from '../LyricsToolsModal'
import ScratchpadEditorChrome from './ScratchpadEditorChrome'
import { updateScratchpadItem } from '../../scratchpadStore'

const MAX_TEXT_UNDO = 50

export default function ScratchpadTextEditor(props) {
  const item = props.item
  const [body, setBody] = useState(item.text && item.text.body || '')
  const [showLyricsTools, setShowLyricsTools] = useState(false)
  const [lyricsToolsQuery, setLyricsToolsQuery] = useState('')
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const textareaRef = useRef(null)
  const saveTimeout = useRef(null)
  const undoStackRef = useRef([])
  const redoStackRef = useRef([])

  const syncUndoRedoState = useCallback(function() {
    setCanUndo(undoStackRef.current.length > 0)
    setCanRedo(redoStackRef.current.length > 0)
  }, [])

  function persist(nextBody) {
    clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(function() {
      updateScratchpadItem(item.id, {
        text: Object.assign({}, item.text || {}, { body: nextBody }),
      })
      if (props.onChange) props.onChange()
    }, 400)
  }

  function handleChange(next) {
    undoStackRef.current = undoStackRef.current.concat([body]).slice(-MAX_TEXT_UNDO)
    redoStackRef.current = []
    syncUndoRedoState()
    setBody(next)
    persist(next)
  }

  function handleUndo() {
    if (!undoStackRef.current.length) return
    redoStackRef.current = redoStackRef.current.concat([body])
    const previous = undoStackRef.current[undoStackRef.current.length - 1]
    undoStackRef.current = undoStackRef.current.slice(0, -1)
    setBody(previous)
    persist(previous)
    syncUndoRedoState()
  }

  function handleRedo() {
    if (!redoStackRef.current.length) return
    undoStackRef.current = undoStackRef.current.concat([body])
    const next = redoStackRef.current[redoStackRef.current.length - 1]
    redoStackRef.current = redoStackRef.current.slice(0, -1)
    setBody(next)
    persist(next)
    syncUndoRedoState()
  }

  function openLyricsToolsFromSelection() {
    const el = textareaRef.current
    const selected = el && el.selectionStart !== el.selectionEnd
      ? body.slice(el.selectionStart, el.selectionEnd)
      : body
    setLyricsToolsQuery(selected || '')
    setShowLyricsTools(true)
  }

  return (
    <div className="scratchpad-text-editor abc-editor-lyrics-panel">
      <ScratchpadEditorChrome
        item={item}
        tunebook={props.tunebook}
        tunes={props.tunes}
        token={props.token}
        onChange={props.onChange}
        onDeleted={props.onDeleted}
        onBack={props.onBack}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={canUndo}
        canRedo={canRedo}
      >
        <LyricsSectionsDropdown
          lyricsText={body}
          textareaRef={textareaRef}
          tunebook={props.tunebook}
          onChange={handleChange}
        />
        <Button
          variant="outline-primary"
          size="sm"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35em' }}
          title="Open lyrics tools with selected text"
          onClick={openLyricsToolsFromSelection}
        >
          {props.tunebook.icons.quillpen} Tools
        </Button>
      </ScratchpadEditorChrome>
      <textarea
        ref={textareaRef}
        className="form-control scratchpad-text-area"
        value={body}
        onChange={function(e) { handleChange(e.target.value) }}
        placeholder="Lyrics, notes, chord charts…"
      />
      <LyricsToolsModal
        show={showLyricsTools}
        onHide={function() { setShowLyricsTools(false) }}
        query={lyricsToolsQuery}
      />
    </div>
  )
}
