import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, ButtonGroup, Modal, Form, ToggleButton } from 'react-bootstrap'
import NowPlayingQueueManager from './NowPlayingQueueManager'
import SavedPlaylistsOpenModal from './SavedPlaylistsOpenModal'
import { isQueueActive, getCurrentTuneId, getQueuePositionLabel, clearQueue, setLoop, setShuffle, getQueueItemLabel, isExternalQueueItem, isLessonQueue } from '../nowPlayingQueue'
import { savePlaylistFromQueue } from '../savedPlaylistsStore'
import { useIsNarrowViewport } from '../useMediaQuery'

const SHUFFLE_ICON_PATH = 'M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z'
const REPEAT_ICON_PATH = 'M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z'

function PlaylistToggleIcon({ path }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="playlist-toggle-icon">
      <path fill="currentColor" d={path} />
    </svg>
  )
}

export default function PlaylistModal({
  tunebook,
  buttonSize,
  nowPlayingQueue,
  setNowPlayingQueue,
  tunes,
  isPlaying,
  hideTrigger,
  show: controlledShow,
  onShowChange,
}) {
  const [internalShow, setInternalShow] = useState(false)
  const show = controlledShow !== undefined ? controlledShow : internalShow
  function setShow(next) {
    if (onShowChange) onShowChange(next)
    else setInternalShow(next)
  }
  const [showOpen, setShowOpen] = useState(false)
  const useButtonSize = buttonSize ? buttonSize : 'lg'
  const isNarrow = useIsNarrowViewport()

  if (!isQueueActive(nowPlayingQueue)) {
    return null
  }

  const playingId = getCurrentTuneId(nowPlayingQueue)
  const currentItem = nowPlayingQueue.items[nowPlayingQueue.currentIndex || 0]
  const playingTune = playingId && tunes ? tunes[playingId] : null
  const externalLabel = isExternalQueueItem(currentItem)
    ? getQueueItemLabel(currentItem, tunes)
    : null
  const positionLabel = getQueuePositionLabel(nowPlayingQueue)
  const isLesson = isLessonQueue(nowPlayingQueue)

  function handleClose() {
    setShow(false)
  }

  function handleSave() {
    if (isLesson) return
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
      {!hideTrigger && !isNarrow && (playingTune && playingId ? (
        <Link
          to={'/tunes/' + playingId}
          className="header-now-playing-label"
          title={'Go to ' + playingTune.name}
        >
          {playingTune.name} ({positionLabel})
        </Link>
      ) : externalLabel ? (
        <span className="header-now-playing-label" title={externalLabel}>
          {externalLabel} ({positionLabel})
        </span>
      ) : null)}
      {!hideTrigger ? (
        <Button
          size={useButtonSize}
          onClick={function() { setShow(!show) }}
          variant={isPlaying ? 'warning' : 'success'}
          title="Playlist"
          data-testid="playlist-button"
        >
          {tunebook.icons.menu}
        </Button>
      ) : null}

      <Modal onClick={function(e) { e.stopPropagation() }} show={show} onHide={handleClose} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>{nowPlayingQueue.name || 'Playlist'}</Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <div className="d-flex align-items-center justify-content-between gap-2 mb-3 flex-wrap playlist-modal-toolbar">
            <div className="d-flex align-items-center gap-3 flex-wrap">
              <ButtonGroup size="sm" className="playlist-mode-buttons" role="group" aria-label="Playlist playback modes">
                <ToggleButton
                  id="playlist-shuffle-toggle"
                  type="checkbox"
                  variant="outline-secondary"
                  checked={!!nowPlayingQueue.shuffle}
                  value="shuffle"
                  title="Shuffle playlist"
                  data-testid="playlist-shuffle-button"
                  onChange={function(e) {
                    setNowPlayingQueue(setShuffle(nowPlayingQueue, e.currentTarget.checked))
                  }}
                >
                  <PlaylistToggleIcon path={SHUFFLE_ICON_PATH} />
                  Shuffle
                </ToggleButton>
                <ToggleButton
                  id="playlist-repeat-toggle"
                  type="checkbox"
                  variant="outline-secondary"
                  checked={!!nowPlayingQueue.loop}
                  value="repeat"
                  title="Repeat playlist"
                  data-testid="playlist-repeat-button"
                  onChange={function(e) {
                    setNowPlayingQueue(setLoop(nowPlayingQueue, e.currentTarget.checked))
                  }}
                >
                  <PlaylistToggleIcon path={REPEAT_ICON_PATH} />
                  Repeat
                </ToggleButton>
              </ButtonGroup>
              <Form.Check
                type="checkbox"
                id="follow-tune-checkbox"
                className="mb-0"
                label="Follow tune"
                title="Navigate to each song when it starts playing"
                checked={!!nowPlayingQueue.followTune}
                onChange={function(e) {
                  setNowPlayingQueue(Object.assign({}, nowPlayingQueue, { followTune: e.target.checked }))
                }}
              />
            </div>
            <div className="d-flex align-items-center gap-2 flex-shrink-0 playlist-modal-actions">
              {!isLesson ? (
                <Button
                  variant="primary"
                  size="sm"
                  className="playlist-action-btn"
                  title="Save playlist"
                  data-testid="save-playlist-button"
                  onClick={handleSave}
                >
                  {tunebook.icons.save} Save
                </Button>
              ) : null}
              <Button
                variant="outline-primary"
                size="sm"
                className="playlist-action-btn"
                title="Open playlist"
                data-testid="open-playlist-button"
                onClick={function() { setShowOpen(true) }}
              >
                {tunebook.icons.folderopen} Open
              </Button>
              <Button
                variant="danger"
                size="sm"
                className="playlist-action-btn"
                title="Clear playlist"
                data-testid="clear-playlist-button"
                onClick={function() {
                  setNowPlayingQueue(clearQueue())
                  handleClose()
                }}
              >
                {tunebook.icons.deletebin} Clear playlist
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
