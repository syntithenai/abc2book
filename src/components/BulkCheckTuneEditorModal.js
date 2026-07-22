import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Modal } from 'react-bootstrap'
import MusicEditor from './MusicEditor'

function BulkCheckEmbeddedMusicEditor(props) {
  return (
    <MusicEditor
      embedded={true}
      tuneId={props.tuneId}
      tune={props.tune}
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
  )
}

export default function BulkCheckTuneEditorModal(props) {
  if (!props.show || !props.tune || !props.tune.id) return null

  const tuneId = props.tune.id
  const editorPath = '/editor/' + encodeURIComponent(tuneId)

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
        <MemoryRouter initialEntries={[editorPath]} initialIndex={0}>
          <Routes>
            <Route
              path="/editor/:tuneId"
              element={(
                <BulkCheckEmbeddedMusicEditor
                  tuneId={tuneId}
                  tune={props.tune}
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
              )}
            />
            <Route
              path="/editor/:tuneId/:view"
              element={(
                <BulkCheckEmbeddedMusicEditor
                  tuneId={tuneId}
                  tune={props.tune}
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
              )}
            />
          </Routes>
        </MemoryRouter>
      </Modal.Body>
    </Modal>
  )
}
