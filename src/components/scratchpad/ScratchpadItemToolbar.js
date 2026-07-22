import ScratchpadEditorChrome from './ScratchpadEditorChrome'
import { updateScratchpadItem } from '../../scratchpadStore'
import {
  canRedoTuneEdit,
  canUndoTuneEdit,
  getRedoTuneEditLabel,
  getUndoTuneEditLabel,
} from '../../tuneEditHistory'

export default function ScratchpadItemToolbar(props) {
  const item = props.item
  const editHistory = props.editHistory
  const historyState = editHistory ? editHistory.historyState : null
  const tuneId = item && item.id

  const canUndo = tuneId && historyState ? canUndoTuneEdit(historyState, tuneId) : false
  const canRedo = tuneId && historyState ? canRedoTuneEdit(historyState, tuneId) : false
  const undoTitle = tuneId && historyState ? getUndoTuneEditLabel(historyState, tuneId) : 'Undo'
  const redoTitle = tuneId && historyState ? getRedoTuneEditLabel(historyState, tuneId) : 'Redo'

  function applyHistoryEntry(entry, direction) {
    const snapshot = direction === 'redo' ? entry.after : entry.before
    if (!snapshot || !item) return
    updateScratchpadItem(item.id, {
      notation: {
        tuneSnapshot: snapshot,
      },
      title: snapshot.name || item.title,
    })
    if (props.onChange) props.onChange()
  }

  function handleUndo() {
    if (!editHistory || !tuneId) return
    editHistory.undoTune(tuneId, applyHistoryEntry)
  }

  function handleRedo() {
    if (!editHistory || !tuneId) return
    editHistory.redoTune(tuneId, applyHistoryEntry)
  }

  return (
    <ScratchpadEditorChrome
      item={item}
      tunebook={props.tunebook}
      tunes={props.tunes}
      token={props.token}
      onChange={props.onChange}
      onDeleted={props.onDeleted}
      onBack={props.onBack}
      onUndo={editHistory ? handleUndo : undefined}
      onRedo={editHistory ? handleRedo : undefined}
      canUndo={canUndo}
      canRedo={canRedo}
      undoTitle={undoTitle}
      redoTitle={redoTitle}
    />
  )
}
