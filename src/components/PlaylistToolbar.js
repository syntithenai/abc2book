import { useState } from 'react'
import { Button } from 'react-bootstrap'
import SavedPlaylistsOpenModal from './SavedPlaylistsOpenModal'
import PlaylistModeButtons from './PlaylistModeButtons'
import { clearQueue, isLessonQueue } from '../nowPlayingQueue'
import { savePlaylistFromQueue } from '../savedPlaylistsStore'

export default function PlaylistToolbar({
  tunebook,
  nowPlayingQueue,
  setNowPlayingQueue,
  tunes,
  onCleared,
  className,
  showSave = true,
  dialogZIndex,
  startPlaybackOnOpen,
  mediaController,
}) {
  const [showOpen, setShowOpen] = useState(false)
  const isLesson = isLessonQueue(nowPlayingQueue)

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

  function handleClear() {
    setNowPlayingQueue(clearQueue())
    if (onCleared) onCleared()
  }

  return (
    <>
      <div className={'playlist-toolbar' + (className ? ' ' + className : '')}>
        <div className="playlist-toolbar-modes">
          <PlaylistModeButtons
            nowPlayingQueue={nowPlayingQueue}
            setNowPlayingQueue={setNowPlayingQueue}
          />
        </div>
        <div className="playlist-toolbar-actions">
          {showSave && !isLesson ? (
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
            onClick={handleClear}
          >
            {tunebook.icons.deletebin} Clear playlist
          </Button>
        </div>
      </div>

      <SavedPlaylistsOpenModal
        show={showOpen}
        onHide={function() { setShowOpen(false) }}
        tunebook={tunebook}
        tunes={tunes}
        setNowPlayingQueue={setNowPlayingQueue}
        onOpened={function() { setShowOpen(false) }}
        title="Open playlist"
        dialogZIndex={dialogZIndex}
        startPlaybackOnOpen={startPlaybackOnOpen}
        mediaController={mediaController}
      />
    </>
  )
}
