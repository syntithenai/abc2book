import {useState, useEffect, useRef} from 'react'
import {Button, Modal, Tabs, Tab} from 'react-bootstrap'
import {useNavigate, useLocation} from 'react-router-dom'
import PitchTempoControlsPanel from './PitchTempoControlsPanel'
import AudioFiltersPanel from './AudioFiltersPanel'
import MediaPlaybackRegionPanel from './MediaPlaybackRegionPanel'
import MediaSeekSlider from './MediaSeekSlider'
import { getActiveLinkIndex } from '../mediaPlaybackUtils'
import './MediaPlayerOptionsModal.css'
 
export default function MediaPlayerOptionsModal({mediaController, tunebook, buttonSize, variant, currentTuneBook, tagFilter, selected, user}) {
  const navigate = useNavigate()
  const location = useLocation()
  const [show, setShow] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState('');
  const [isMediaCached, setIsMediaCached] = useState(false);
  const [settingsTab, setSettingsTab] = useState('playback');
  const clickTimeoutRef = useRef(null);
  var useButtonSize=(buttonSize ? buttonSize : 'lg')

  const handleClose = function() {
    setShow(false);
  }
  const handleShow = function() {
    setShow(true);
    if (mediaController.refreshMediaResolverHealth) {
      mediaController.refreshMediaResolverHealth();
    }
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

  const showLoopTab = mediaController.tune
    && activeLinkIndex !== null
    && mediaController.tune.links
    && mediaController.tune.links[activeLinkIndex]

  const showAudioFiltersTab = !!mediaController.tune
    && activeLinkIndex !== null
    && mediaController.tune.links
    && mediaController.tune.links[activeLinkIndex]
    && mediaController.getSrcType(mediaController.tune.links[activeLinkIndex].link) !== 'abc'

  useEffect(function() {
    if (settingsTab === 'loop' && !showLoopTab) {
      setSettingsTab('playback');
    }
    if (settingsTab === 'filters' && !showAudioFiltersTab) {
      setSettingsTab('playback');
    }
  }, [settingsTab, showLoopTab, showAudioFiltersTab]);

  function startPlaybackFromGesture(options) {
    if (mediaController.playFromUserGesture) {
      mediaController.playFromUserGesture(options)
    } else if (options && options.restart && mediaController.restartPlaybackFromStart) {
      mediaController.restartPlaybackFromStart()
    } else {
      mediaController.play()
    }
  }

  function cancelPendingPlayback() {
    mediaController.pause()
    mediaController.setIsLoading(false)
    mediaController.setIsReady(false)
  }

  function handlePlayClick(onSingle, onDouble) {
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current)
      clickTimeoutRef.current = null
      onDouble()
      return
    }
    onSingle()
    clickTimeoutRef.current = setTimeout(function() {
      clickTimeoutRef.current = null
    }, 400)
  }

  function handleLinkPlayback(linkKey) {
    const sameSource = mediaController.isMediaPlaybackRoute
      && mediaController.isMediaPlaybackRoute()
      && mediaController.mediaLinkNumber === linkKey
    const path = '/tunes/' + mediaController.tune.id + '/playMedia/' + linkKey
    handlePlayClick(
      function() {
        mediaController.setMediaLinkNumber(linkKey)
        if (location.pathname !== path) {
          navigate(path)
        }
        if (sameSource) {
          startPlaybackFromGesture()
        } else {
          startPlaybackFromGesture({ fresh: true })
        }
      },
      function() {
        mediaController.setMediaLinkNumber(linkKey)
        if (location.pathname !== path) {
          navigate(path)
        }
        if (mediaController.restartPlaybackFromStart) {
          mediaController.restartPlaybackFromStart()
        }
      }
    )
  }

  function handleMidiPlayback() {
    const sameSource = mediaController.isMidiPlaybackRoute
      && mediaController.isMidiPlaybackRoute()
    const path = '/tunes/' + mediaController.tune.id + '/playMidi'
    handlePlayClick(
      function() {
        mediaController.setMediaLinkNumber(null)
        if (location.pathname !== path) {
          navigate(path)
        }
        if (sameSource) {
          startPlaybackFromGesture()
        } else {
          startPlaybackFromGesture({ fresh: true })
        }
      },
      function() {
        mediaController.setMediaLinkNumber(null)
        if (location.pathname !== path) {
          navigate(path)
        }
        if (mediaController.restartPlaybackFromStart) {
          mediaController.restartPlaybackFromStart()
        }
      }
    )
  }

  const isAdminUser = user && user.email === 'syntithenai@gmail.com'

  const showHeaderMediaDownloads = false

  const canCache = showHeaderMediaDownloads && isAdminUser
    && mediaController.mediaResolverFeaturesEnabled
    && hasLinks
    && activeLinkIndex !== null
    && mediaController.tune
    && mediaController.tune.links
    && mediaController.tune.links[activeLinkIndex]
    && mediaController.tune.links[activeLinkIndex].link
    && mediaController.getSrcType(mediaController.tune.links[activeLinkIndex].link) !== 'abc'

  const canFileDownload = showHeaderMediaDownloads && isAdminUser
    && hasLinks
    && activeLinkIndex !== null
    && mediaController.tune
    && mediaController.tune.links
    && mediaController.tune.links[activeLinkIndex]
    && mediaController.tune.links[activeLinkIndex].link
    && mediaController.getSrcType(mediaController.tune.links[activeLinkIndex].link) !== 'abc'

  useEffect(function() {
    if (!show || !canFileDownload || !mediaController.checkExternalMediaCached) {
      setIsMediaCached(false);
      return;
    }
    let cancelled = false;
    mediaController.checkExternalMediaCached(activeLinkIndex).then(function(cached) {
      if (!cancelled) setIsMediaCached(!!cached);
    }).catch(function() {
      if (!cancelled) setIsMediaCached(false);
    });
    return function() { cancelled = true; };
  }, [show, activeLinkIndex, canFileDownload, mediaController.tune ? mediaController.tune.id : null]);

  function formatMediaError(e) {
    const hint = e && e.message ? e.message : 'Request failed.'
    if (hint.indexOf('502') >= 0 || hint.indexOf('Could not resolve') >= 0) {
      return hint + ' Add YouTube cookies to local-resolver/secrets/youtube-cookies.txt if needed.'
    }
    if (hint.indexOf('Could not reach media resolver') >= 0 || hint.indexOf('Failed to fetch') >= 0) {
      return hint + ' Ensure local-resolver is running (npm run start:resolver).'
    }
    return hint
  }

  async function handleCache() {
    if (!mediaController.tune || activeLinkIndex === null) {
      setDownloadStatus('No linked media to cache.')
      return
    }
    setDownloadStatus('Caching…')
    try {
      const result = await mediaController.downloadExternalMedia(activeLinkIndex)
      setIsMediaCached(true)
      setDownloadStatus(result.cached ? 'Already cached.' : 'Cached for playback.')
    } catch (e) {
      console.log(e)
      setDownloadStatus(formatMediaError(e))
    }
  }

  async function handleFileDownload() {
    if (!mediaController.tune || activeLinkIndex === null) {
      setDownloadStatus('No linked media to download.')
      return
    }
    setDownloadStatus('Preparing download…')
    try {
      await mediaController.saveExternalMediaToFile(activeLinkIndex)
      setIsMediaCached(true)
      setDownloadStatus('Download started.')
    } catch (e) {
      console.log(e)
      setDownloadStatus(formatMediaError(e))
    }
  }

  return (
    <>
      <Button size={useButtonSize} onClick={handleShow} variant={(variant ? variant : (mediaController.isLoading ? "secondary" : (mediaController.isPlaying ? "warning" : "success")))}>{tunebook.icons.dropdown}</Button>

      <Modal onClick={function(e) {e.stopPropagation()}} show={show} onHide={handleClose} size="lg">
        <Modal.Header closeButton>
          <div className="media-controls-modal-header">
            <Modal.Title className="modal-title-text">Media Controls</Modal.Title>
            {canFileDownload && (
              <div className="media-controls-modal-header-actions">
                {canCache && (
                  <Button
                    variant="outline-primary"
                    size="sm"
                    onClick={handleCache}
                    disabled={isMediaCached}
                  >
                    {tunebook.icons.save} Cache
                  </Button>
                )}
                <Button variant="outline-primary" size="sm" onClick={handleFileDownload}>
                  {tunebook.icons.save} Download
                </Button>
              </div>
            )}
          </div>
        </Modal.Header>
        <Modal.Body style={{maxHeight:'70vh', overflowY:'auto'}}>
          {downloadStatus && <div className="scope-note">{downloadStatus}</div>}

          {((location.pathname.indexOf("/tunes/") === 0 || location.pathname.indexOf("/editor/") === 0) && mediaController.tune) && (
            <div style={{borderBottom:'1px solid black', paddingBottom:'0.5em'}}>
              <div className="media-controls-playback-row">
                <div className="media-controls-playback-buttons">
                  {mediaController.isLoading ? (
                    <Button
                      variant="secondary"
                      onClick={cancelPendingPlayback}
                    >
                      {tunebook.icons.waiting}
                    </Button>
                  ) : mediaController.isPlaying ? (
                    <Button
                      variant="warning"
                      onClick={function() { mediaController.pause() }}
                    >
                      {tunebook.icons.pause} Pause
                    </Button>
                  ) : (
                    <>
                      {hasLinks ? mediaController.tune.links.map(function(link, linkKey) {
                        return (
                          <Button
                            key={linkKey}
                            style={{marginLeft:'0.1em'}}
                            variant="danger"
                            onClick={function() { handleLinkPlayback(linkKey) }}
                          >
                            {tunebook.icons.link} {tunebook.icons.play} {linkKey + 1}
                          </Button>
                        )
                      }) : null}
                      {hasMusic && (
                        <Button
                          style={{marginLeft:'0.1em'}}
                          variant="success"
                          onClick={handleMidiPlayback}
                        >
                          {tunebook.icons.music} {tunebook.icons.play}
                        </Button>
                      )}
                    </>
                  )}
                </div>
                {mediaController.rewindToStart && (
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    className="media-controls-rewind"
                    title="Rewind to start"
                    onClick={function() { mediaController.rewindToStart() }}
                  >
                    {tunebook.icons.skipback}
                  </Button>
                )}
              </div>
            </div>
          )}

          {mediaController.tune && (
            <div className="media-controls-settings-tabs">
              <MediaSeekSlider mediaController={mediaController} className="compact" />

              <Tabs
                activeKey={settingsTab}
                onSelect={function(key) { if (key) setSettingsTab(key); }}
                id="media-controls-settings-tabs"
                className="mb-2"
              >
                <Tab eventKey="playback" title="Playback">
                  <PitchTempoControlsPanel
                    tune={mediaController.tune}
                    tunebook={tunebook}
                    mediaController={mediaController}
                    showPitchControls={!!mediaController.mediaResolverAvailable}
                  />
                </Tab>
                {showAudioFiltersTab && (
                  <Tab eventKey="filters" title="Audio Filters">
                    <AudioFiltersPanel
                      tune={mediaController.tune}
                      tunebook={tunebook}
                      mediaController={mediaController}
                      showFilters={!!mediaController.mediaResolverFeaturesEnabled}
                    />
                  </Tab>
                )}
                {showLoopTab && (
                  <Tab eventKey="loop" title="Loop">
                    <MediaPlaybackRegionPanel
                      tune={mediaController.tune}
                      tunebook={tunebook}
                      mediaController={mediaController}
                      linkIndex={activeLinkIndex}
                    />
                  </Tab>
                )}
              </Tabs>
            </div>
          )}
        </Modal.Body>
      </Modal>
    </>
  );
}
