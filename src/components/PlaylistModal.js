import {useState} from 'react'
import {Button, Modal} from 'react-bootstrap'
import AbcPlaylistManager from './AbcPlaylistManager'
import PlaylistManager from './PlaylistManager'

function hasActivePlaylist(abcPlaylist, mediaPlaylist) {
  return (abcPlaylist && abcPlaylist.tunes && abcPlaylist.tunes.length > 0)
    || (mediaPlaylist && mediaPlaylist.tunes && mediaPlaylist.tunes.length > 0)
}

export default function PlaylistModal({tunebook, buttonSize, abcPlaylist, setAbcPlaylist, mediaPlaylist, setMediaPlaylist, isPlaying}) {
  const [show, setShow] = useState(false)
  const useButtonSize = buttonSize ? buttonSize : 'lg'

  if (!hasActivePlaylist(abcPlaylist, mediaPlaylist)) {
    return null
  }

  function handleClose() {
    setShow(false)
  }

  return (
    <>
      <Button
        size={useButtonSize}
        onClick={function() { setShow(true) }}
        variant={isPlaying ? "warning" : "success"}
        title="Playlist"
        data-testid="playlist-button"
      >
        {tunebook.icons.menu}
      </Button>

      <Modal onClick={function(e) { e.stopPropagation() }} show={show} onHide={handleClose} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Playlist</Modal.Title>
        </Modal.Header>
        <Modal.Body style={{maxHeight:'70vh', overflowY:'auto'}}>
          <AbcPlaylistManager handleClose={handleClose} tunebook={tunebook} abcPlaylist={abcPlaylist} setAbcPlaylist={setAbcPlaylist} />
          <PlaylistManager handleClose={handleClose} tunebook={tunebook} mediaPlaylist={mediaPlaylist} setMediaPlaylist={setMediaPlaylist} />
        </Modal.Body>
      </Modal>
    </>
  )
}
