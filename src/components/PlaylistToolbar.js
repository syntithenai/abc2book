import { useState } from 'react'
import { Button, ButtonGroup, ToggleButton } from 'react-bootstrap'
import SavedPlaylistsOpenModal from './SavedPlaylistsOpenModal'
import { clearQueue, setLoop, setShuffle, setFollowTune, isLessonQueue } from '../nowPlayingQueue'
import { savePlaylistFromQueue } from '../savedPlaylistsStore'

const SHUFFLE_ICON_PATH = 'M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z'
const REPEAT_ICON_PATH = 'M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z'

function PlaylistToggleIcon({ path }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="playlist-toggle-icon">
      <path fill="currentColor" d={path} />
    </svg>
  )
}

export default function PlaylistToolbar({
  tunebook,
  nowPlayingQueue,
  setNowPlayingQueue,
  tunes,
  onCleared,
  className,
  showSave = true,
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
          <ButtonGroup size="sm" className="playlist-mode-buttons" role="group" aria-label="Playlist playback modes">
            <ToggleButton
              id="playlist-toolbar-shuffle"
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
              id="playlist-toolbar-repeat"
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
            <ToggleButton
              id="playlist-toolbar-follow"
              type="checkbox"
              variant="outline-secondary"
              checked={!!nowPlayingQueue.followTune}
              value="follow"
              title="Navigate to each song when it starts playing"
              data-testid="playlist-follow-button"
              onChange={function(e) {
                setNowPlayingQueue(setFollowTune(nowPlayingQueue, e.currentTarget.checked))
              }}
            >
              Follow
            </ToggleButton>
          </ButtonGroup>
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
      />
    </>
  )
}
