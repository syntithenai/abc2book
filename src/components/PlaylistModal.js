import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Modal } from 'react-bootstrap'
import NowPlayingQueueManager from './NowPlayingQueueManager'
import PlaylistToolbar from './PlaylistToolbar'
import { isQueueActive, getCurrentTuneId, getQueuePositionLabel, getQueueItemLabel, isExternalQueueItem } from '../nowPlayingQueue'
import { useIsNarrowViewport } from '../useMediaQuery'

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

  function handleClose() {
    setShow(false)
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
          <PlaylistToolbar
            tunebook={tunebook}
            nowPlayingQueue={nowPlayingQueue}
            setNowPlayingQueue={setNowPlayingQueue}
            tunes={tunes}
            onCleared={handleClose}
          />
          <NowPlayingQueueManager
            handleClose={handleClose}
            tunebook={tunebook}
            nowPlayingQueue={nowPlayingQueue}
            setNowPlayingQueue={setNowPlayingQueue}
            tunes={tunes}
          />
        </Modal.Body>
      </Modal>
    </>
  )
}
