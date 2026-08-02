import { useEffect, useState } from 'react'
import { Modal } from 'react-bootstrap'
import { getScratchpadItem, subscribeScratchpad } from '../../scratchpadStore'
import ScratchpadTextEditor from './ScratchpadTextEditor'
import ScratchpadImageEditor from './ScratchpadImageEditor'
import ScratchpadNotationEditor from './ScratchpadNotationEditor'

export default function ScratchpadCompositionSourceEditorModal(props) {
  const sourceItemId = props.sourceItemId || ''
  const [item, setItem] = useState(function() {
    return sourceItemId ? getScratchpadItem(sourceItemId) : null
  })

  useEffect(function() {
    if (!props.show) return undefined
    setItem(sourceItemId ? getScratchpadItem(sourceItemId) : null)
    return subscribeScratchpad(function() {
      setItem(sourceItemId ? getScratchpadItem(sourceItemId) : null)
    })
  }, [props.show, sourceItemId])

  function handleChange() {
    if (props.onSourceChanged) props.onSourceChanged()
  }

  function handleHide() {
    if (props.onHide) props.onHide()
  }

  function renderEditor() {
    if (!item) {
      return <div className="p-3 text-muted">Source scratchpad item not found.</div>
    }
    if (item.type === 'text') {
      return (
        <ScratchpadTextEditor
          item={item}
          tunebook={props.tunebook}
          tunes={props.tunes}
          token={props.token}
          onChange={handleChange}
          onDeleted={handleHide}
          onBack={handleHide}
        />
      )
    }
    if (item.type === 'image') {
      return (
        <ScratchpadImageEditor
          item={item}
          tunebook={props.tunebook}
          tunes={props.tunes}
          token={props.token}
          login={props.login}
          onChange={handleChange}
          onDeleted={handleHide}
          onBack={handleHide}
        />
      )
    }
    if (item.type === 'notation') {
      return (
        <ScratchpadNotationEditor
          item={item}
          tunebook={props.tunebook}
          tunes={props.tunes}
          token={props.token}
          mediaController={props.mediaController}
          forceRefresh={props.forceRefresh}
          blockKeyboardShortcuts={props.blockKeyboardShortcuts}
          setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
          searchIndex={props.searchIndex}
          loadTuneTexts={props.loadTuneTexts}
          editHistory={props.editHistory}
          onChange={handleChange}
        />
      )
    }
    return <div className="p-3 text-muted">Cannot edit this source type here.</div>
  }

  return (
    <Modal
      show={!!props.show}
      onHide={handleHide}
      fullscreen
      scrollable
      className="scratchpad-composition-source-modal"
    >
      <Modal.Header closeButton>
        <Modal.Title>
          Edit source{item && item.title ? ': ' + item.title : ''}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="scratchpad-composition-source-modal-body">
        {renderEditor()}
      </Modal.Body>
    </Modal>
  )
}
