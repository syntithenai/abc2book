import { Modal } from 'react-bootstrap'
import MusicEditor from './MusicEditor'

export default function BulkCheckTuneEditorModal(props) {
  const tuneId = props.tuneId || (props.tune && props.tune.id)
  if (!props.show || !tuneId) return null

  const tune = props.tune || (props.tunes && props.tunes[tuneId])
  if (!tune || !tune.id) {
    return (
      <Modal
        show={props.show}
        onHide={props.onClose}
        fullscreen
        scrollable={false}
        className="bulk-check-editor-modal bulk-check-full-editor-modal"
        backdropClassName="bulk-check-editor-backdrop"
        dialogClassName="bulk-check-full-editor-dialog"
        contentClassName="bulk-check-full-editor-content"
      >
        <Modal.Body className="bulk-check-full-editor-body bulk-check-full-editor-body--loading">
          Loading tune…
        </Modal.Body>
      </Modal>
    )
  }

  return (
    <Modal
      show={props.show}
      onHide={props.onClose}
      fullscreen
      scrollable={false}
      className="bulk-check-editor-modal bulk-check-full-editor-modal"
      backdropClassName="bulk-check-editor-backdrop"
      dialogClassName="bulk-check-full-editor-dialog"
      contentClassName="bulk-check-full-editor-content"
    >
      <Modal.Body className="bulk-check-full-editor-body">
        <MusicEditor
          embedded={true}
          tuneId={tuneId}
          tune={tune}
          initialView={props.initialView || undefined}
          autoStartChordSearch={props.autoStartChordSearch}
          tunes={props.tunes}
          tunesRevision={props.tunesRevision}
          tunebook={props.tunebook}
          token={props.token}
          forceRefresh={props.forceRefresh}
          onClose={props.onClose}
          onLiveSave={props.onLiveSave}
          mediaController={props.mediaController}
          editHistory={props.editHistory}
          logout={props.logout}
          login={props.login}
          isMobile={props.isMobile}
          blockKeyboardShortcuts={props.blockKeyboardShortcuts}
          searchIndex={props.searchIndex}
          loadTuneTexts={props.loadTuneTexts}
          onNotationHelpModeChange={props.onNotationHelpModeChange}
        />
      </Modal.Body>
    </Modal>
  )
}
