import {useState, useEffect} from 'react'
import {Button, Modal} from 'react-bootstrap'
import {useNavigate, useLocation, useParams} from 'react-router-dom'
import AbcPlaylistManager from './AbcPlaylistManager'
import PitchTempoControlsPanel from './PitchTempoControlsPanel'
import MediaPlaybackRegionPanel from './MediaPlaybackRegionPanel'
import { getActiveLinkIndex } from '../mediaPlaybackUtils'
import './MediaPlayerOptionsModal.css'

import PlaylistManager from './PlaylistManager'
 
export default function MediaPlayerOptionsModal({mediaController, tunebook, buttonSize, abcPlaylist,setAbcPlaylist,mediaPlaylist, setMediaPlaylist, variant, currentTuneBook, tagFilter, selected}) {
  const navigate = useNavigate()
  const location = useLocation()
  const params = useParams()
  const [show, setShow] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState('');
  var useButtonSize=(buttonSize ? buttonSize : 'lg')
  const noop = function() {}

  const handleClose = function() {
    setShow(false);
  }
  const handleShow = function() {
    setShow(true);
  }
 
  const [hasMusic, setHasMusic] = useState(false)
  const [hasLinks, setHasLinks] = useState(false)
   
  useEffect(function() {
       if ((location.pathname.indexOf("/tunes/") === 0 || location.pathname.indexOf("/editor/") === 0) && tunebook.hasNotesOrChords(mediaController.tune)) {
          setHasMusic(true)
       } else {
           setHasMusic(false)
       }
       if ((location.pathname.indexOf("/tunes/") === 0 || location.pathname.indexOf("/editor/") === 0) && mediaController.tune && tunebook.hasLinks(mediaController.tune)) {
          setHasLinks(true)
       } else {
          setHasLinks(false)
       } 
   },[mediaController.tune, location.pathname, tunebook])

  const activeLinkIndex = mediaController.tune
    ? getActiveLinkIndex(mediaController.tune, mediaController.mediaLinkNumber)
    : null

  function isActiveMediaLink(linkKey) {
    return mediaController.tune
      && params.tuneId === mediaController.tune.id
      && params.playState === 'playMedia'
      && String(params.mediaLinkNumber || 0) === String(linkKey)
  }

  function isActiveMidi() {
    return mediaController.tune
      && params.tuneId === mediaController.tune.id
      && params.playState === 'playMidi'
  }

  function handleLinkPlayback(linkKey) {
    if (isActiveMediaLink(linkKey) && mediaController.isPlaying) {
      mediaController.pause()
      return
    }
    const path = '/tunes/' + mediaController.tune.id + '/playMedia/' + linkKey
    if (location.pathname !== path) {
      navigate(path)
    }
    mediaController.play()
  }

  function handleMidiPlayback() {
    if (isActiveMidi() && mediaController.isPlaying) {
      mediaController.pause()
      return
    }
    const path = '/tunes/' + mediaController.tune.id + '/playMidi'
    if (location.pathname !== path) {
      navigate(path)
    }
    mediaController.play()
  }

  async function handleDownload() {
    if (!mediaController.tune || activeLinkIndex === null) {
      setDownloadStatus('No linked media to download.')
      return
    }
    setDownloadStatus('Downloading…')
    try {
      const result = await mediaController.downloadExternalMedia(activeLinkIndex)
      setDownloadStatus(result.cached ? 'Downloaded from cache.' : 'Downloaded and cached.')
    } catch (e) {
      console.log(e)
      const hint = e && e.message ? e.message : 'Download failed.'
      setDownloadStatus(hint.indexOf('502') >= 0 || hint.indexOf('Could not resolve') >= 0
        ? hint + ' YouTube may be blocking resolver IPs — try a direct MP3 link if available.'
        : hint)
    }
  }

  const canDownload = hasLinks
    && activeLinkIndex !== null
    && mediaController.tune
    && mediaController.tune.links
    && mediaController.tune.links[activeLinkIndex]
    && mediaController.tune.links[activeLinkIndex].link
    && mediaController.getSrcType(mediaController.tune.links[activeLinkIndex].link) !== 'abc'

  return (
    <>
      <Button size={useButtonSize} onClick={handleShow} variant={(variant ? variant : (mediaController.isLoading ? "secondary" : (mediaController.isPlaying ? "warning" : "success")))}>{tunebook.icons.dropdown}</Button>

      <Modal onClick={function(e) {e.stopPropagation()}} show={show} onHide={handleClose} size="lg">
        <Modal.Header closeButton>
          <div className="media-controls-modal-header">
            <Modal.Title className="modal-title-text">Media Controls</Modal.Title>
            {canDownload && (
              <Button variant="outline-primary" size="sm" onClick={handleDownload}>
                {tunebook.icons.save} Download
              </Button>
            )}
          </div>
        </Modal.Header>
        <Modal.Body style={{maxHeight:'70vh', overflowY:'auto'}}>
          {downloadStatus && <div className="scope-note">{downloadStatus}</div>}

          {((location.pathname.indexOf("/tunes/") === 0 || location.pathname.indexOf("/editor/") === 0) && mediaController.tune) && (
            <div style={{borderBottom:'1px solid black', paddingBottom:'0.5em'}}>
              <div className="media-controls-playback-row">
                {hasLinks ? mediaController.tune.links.map(function(link, linkKey) {
                  const isActive = isActiveMediaLink(linkKey)
                  const showPause = isActive && mediaController.isPlaying
                  return (
                    <Button
                      key={linkKey}
                      style={{marginLeft:'0.1em'}}
                      variant={showPause ? 'warning' : 'danger'}
                      onClick={function() { handleLinkPlayback(linkKey) }}
                    >
                      {tunebook.icons.link} {showPause ? tunebook.icons.pause : tunebook.icons.play} {linkKey + 1}
                    </Button>
                  )
                }) : null}
                {hasMusic && (
                  <Button
                    style={{marginLeft:'0.1em'}}
                    variant={isActiveMidi() && mediaController.isPlaying ? 'warning' : 'success'}
                    onClick={handleMidiPlayback}
                  >
                    {tunebook.icons.music} {isActiveMidi() && mediaController.isPlaying ? tunebook.icons.pause : tunebook.icons.play}
                  </Button>
                )}
              </div>
            </div>
          )}

          {mediaController.tune && (
            <div style={{borderBottom:'1px solid black', paddingTop:'0.5em', marginTop:'0.5em', paddingBottom:'0.5em'}}>
              <PitchTempoControlsPanel
                tune={mediaController.tune}
                tunebook={tunebook}
                mediaController={mediaController}
              />
            </div>
          )}

          <div style={{borderBottom:'1px solid black', paddingTop:'0.5em', marginTop:'0.5em'}}>
            <AbcPlaylistManager handleClose={noop} tunebook={tunebook} abcPlaylist={abcPlaylist} setAbcPlaylist={setAbcPlaylist} />
            <PlaylistManager handleClose={noop} tunebook={tunebook} mediaPlaylist={mediaPlaylist} setMediaPlaylist={setMediaPlaylist} />
          </div>

          {mediaController.tune && activeLinkIndex !== null && (
            <MediaPlaybackRegionPanel
              tune={mediaController.tune}
              tunebook={tunebook}
              mediaController={mediaController}
              linkIndex={activeLinkIndex}
            />
          )}
        </Modal.Body>
      </Modal>
    </>
  );
}
