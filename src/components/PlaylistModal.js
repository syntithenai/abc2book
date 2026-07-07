import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Modal, Form } from 'react-bootstrap'
import NowPlayingQueueManager from './NowPlayingQueueManager'
import SavedPlaylistsOpenModal from './SavedPlaylistsOpenModal'
import { isQueueActive, getCurrentTuneId, getQueuePositionLabel, clearQueue } from '../nowPlayingQueue'
import { savePlaylistFromQueue } from '../savedPlaylistsStore'
import { useIsNarrowViewport } from '../useMediaQuery'

export default function PlaylistModal({
  tunebook,
  buttonSize,
  nowPlayingQueue,
  setNowPlayingQueue,
  tunes,
  isPlaying,
}) {
  const [show, setShow] = useState(false)
  const [showOpen, setShowOpen] = useState(false)
  const useButtonSize = buttonSize ? buttonSize : 'lg'
  const isNarrow = useIsNarrowViewport()

  if (!isQueueActive(nowPlayingQueue)) {
    return null
  }

  const playingId = getCurrentTuneId(nowPlayingQueue)
  const playingTune = playingId && tunes ? tunes[playingId] : null
  const positionLabel = getQueuePositionLabel(nowPlayingQueue)

  function handleClose() {
    setShow(false)
  }

  function handleSave() {
    const defaultName = nowPlayingQueue.name || 'Playlist'
    const name = window.prompt('Save playlist as:', defaultName)
    if (name === null) return
    const saved = savePlaylistFromQueue(nowPlayingQueue, {
      id: nowPlayingQueue.savedPlaylistId,
      name: String(name).trim() || defaultName,
    })
    if (!saved) return
    setNowPlayingQueue(Object.assign({}, nowPlayingQueue, {
      name: saved.name,
      savedPlaylistId: saved.id,
    }))
  }

  return (
    <>
      {!isNarrow && playingTune && playingId && (
        <Link
          to={'/tunes/' + playingId}
          className="header-now-playing-label"
          title={'Go to ' + playingTune.name}
        >
          {playingTune.name} ({positionLabel})
        </Link>
      )}
      <Button
        size={useButtonSize}
        onClick={function() { setShow(function(v) { return !v }) }}
        variant={isPlaying ? 'warning' : 'success'}
        title="Playlist"
        data-testid="playlist-button"
      >
        {tunebook.icons.menu}
      </Button>

      <Modal onClick={function(e) { e.stopPropagation() }} show={show} onHide={handleClose} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>{nowPlayingQueue.name || 'Playlist'}</Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <div className="d-flex align-items-center justify-content-between gap-2 mb-3 flex-wrap">
            <Form.Check
              type="checkbox"
              id="follow-tune-checkbox"
              className="mb-0"
              label="Follow tune — navigate to each song when it starts playing"
              checked={!!nowPlayingQueue.followTune}
              onChange={function(e) {
                setNowPlayingQueue(Object.assign({}, nowPlayingQueue, { followTune: e.target.checked }))
              }}
            />
            <div className="d-flex align-items-center gap-2 flex-shrink-0">
              <Button
                variant="primary"
                size="sm"
                title="Save playlist"
                data-testid="save-playlist-button"
                onClick={handleSave}
              >
                {tunebook.icons.save} Save
              </Button>
              <Button
                variant="outline-primary"
                size="sm"
                title="Open playlist"
                data-testid="open-playlist-button"
                onClick={function() { setShowOpen(true) }}
              >
                {tunebook.icons.folderopen} Open
              </Button>
              <Button
                variant="danger"
                size="sm"
                title="Clear playlist"
                data-testid="clear-playlist-button"
                onClick={function() {
                  setNowPlayingQueue(clearQueue())
                  handleClose()
                }}
              >
                Clear playlist
              </Button>
            </div>
          </div>
          <NowPlayingQueueManager
            handleClose={handleClose}
            tunebook={tunebook}
            nowPlayingQueue={nowPlayingQueue}
            setNowPlayingQueue={setNowPlayingQueue}
            tunes={tunes}
          />
        </Modal.Body>
      </Modal>

      <SavedPlaylistsOpenModal
        show={showOpen}
        onHide={function() { setShowOpen(false) }}
        tunebook={tunebook}
        tunes={tunes}
        setNowPlayingQueue={setNowPlayingQueue}
        onOpened={function() { handleClose() }}
        title="Open playlist"
      />
    </>
  )
}
