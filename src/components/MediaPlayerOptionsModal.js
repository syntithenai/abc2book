import {useState, useEffect, useRef} from 'react'
import {Button, Modal, Tabs, Tab} from 'react-bootstrap'
import {useNavigate, useLocation, useParams} from 'react-router-dom'
import PitchTempoControlsPanel from './PitchTempoControlsPanel'
import AudioFiltersPanel from './AudioFiltersPanel'
import MediaPlaybackRegionPanel from './MediaPlaybackRegionPanel'
import MidiPlaybackMetronomePanel from './MidiPlaybackMetronomePanel'
import MediaSeekSlider from './MediaSeekSlider'
import { getActiveLinkIndex } from '../mediaPlaybackUtils'
import './MediaPlayerOptionsModal.css'

export default function MediaPlayerOptionsModal({mediaController, tunebook, buttonSize, variant, currentTuneBook, tagFilter, selected, user, tunes}) {
  const navigate = useNavigate()
  const location = useLocation()
  const params = useParams()
  const viewedTune = (function() {
    if (params.tuneId && tunes && tunes[params.tuneId]) {
      return tunes[params.tuneId]
    }
    return mediaController.tune
  })()
  const [show, setShow] = useState(false);
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
       if ((location.pathname.indexOf("/tunes/") === 0 || location.pathname.indexOf("/editor/") === 0) && viewedTune && tunebook.hasNotesOrChords(viewedTune)) {
          setHasMusic(true)
       } else {
           setHasMusic(false)
       }
       if ((location.pathname.indexOf("/tunes/") === 0 || location.pathname.indexOf("/editor/") === 0) && viewedTune && tunebook.hasLinks(viewedTune)) {
          setHasLinks(true)
       } else {
           setHasLinks(false)
       }
   },[viewedTune, location.pathname, tunebook])

  const activeLinkIndex = viewedTune
    ? getActiveLinkIndex(viewedTune, mediaController.mediaLinkNumber)
    : null

  const showLoopTab = viewedTune
    && activeLinkIndex !== null
    && viewedTune.links
    && viewedTune.links[activeLinkIndex]

  const showAudioFiltersTab = !!viewedTune
    && activeLinkIndex !== null
    && viewedTune.links
    && viewedTune.links[activeLinkIndex]
    && mediaController.getSrcType(viewedTune.links[activeLinkIndex].link) !== 'abc'
    && mediaController.resolverFeatures
    && mediaController.resolverFeatures.stems

  useEffect(function() {
    if (settingsTab === 'loop' && !showLoopTab) {
      setSettingsTab('playback');
    }
    if (settingsTab === 'filters' && !showAudioFiltersTab) {
      setSettingsTab('playback');
    }
    if (settingsTab === 'midi' && !hasMusic) {
      setSettingsTab('playback');
    }
  }, [settingsTab, showLoopTab, showAudioFiltersTab, hasMusic]);

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
    if (mediaController.abortPlayingIntent) {
      mediaController.abortPlayingIntent()
    } else {
      mediaController.pause()
      mediaController.setIsLoading(false)
    }
    mediaController.setIsReady(false)
  }

  function handlePlayClick(onSingle, onDouble) {
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current)
      clickTimeoutRef.current = null
      onDouble()
      return
    }
    clickTimeoutRef.current = setTimeout(function() {
      clickTimeoutRef.current = null
      onSingle()
    }, 300)
  }

  function requestPlaybackForTarget(target) {
    if (!viewedTune || !mediaController.requestPlayback) return false
    return mediaController.requestPlayback({
      tuneId: viewedTune.id,
      playState: target.playState,
      linkNum: target.linkNum,
      fromUserGesture: true,
      fresh: target.fresh,
      restart: target.restart,
    })
  }

  function applyRouteForTarget(target) {
    if (!viewedTune || !mediaController.applyPlaybackRoute) return
    const linkParam = target.playState === 'playMedia'
      ? String(target.linkNum != null ? target.linkNum : 0)
      : '0'
    mediaController.applyPlaybackRoute(target.playState, linkParam, viewedTune, tunebook)
  }

  function handleLinkPlayback(linkKey) {
    if (!viewedTune) return
    const sameSource = mediaController.isMediaPlaybackRoute
      && mediaController.isMediaPlaybackRoute()
      && mediaController.mediaLinkNumber === linkKey
    const path = '/tunes/' + viewedTune.id + '/playMedia/' + linkKey
    handlePlayClick(
      function() {
        applyRouteForTarget({
          playState: 'playMedia',
          linkNum: linkKey,
        })
        if (!requestPlaybackForTarget({
          playState: 'playMedia',
          linkNum: linkKey,
          fresh: !sameSource,
        })) {
          if (sameSource) {
            startPlaybackFromGesture()
          } else {
            startPlaybackFromGesture({ fresh: true })
          }
        }
        if (location.pathname !== path) {
          navigate(path)
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
    if (!viewedTune) return
    const sameSource = mediaController.isMidiPlaybackRoute
      && mediaController.isMidiPlaybackRoute()
    const path = '/tunes/' + viewedTune.id + '/playMidi'
    handlePlayClick(
      function() {
        applyRouteForTarget({ playState: 'playMidi' })
        if (!requestPlaybackForTarget({
          playState: 'playMidi',
          fresh: !sameSource,
        })) {
          if (sameSource) {
            startPlaybackFromGesture()
          } else {
            startPlaybackFromGesture({ fresh: true })
          }
        }
        if (location.pathname !== path) {
          navigate(path)
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

  return (
    <>
      <Button size={useButtonSize} onClick={handleShow} variant={(variant ? variant : (mediaController.isLoading ? "secondary" : (mediaController.isPlaying ? "warning" : "success")))}>{tunebook.icons.dropdown}</Button>

      <Modal onClick={function(e) {e.stopPropagation()}} show={show} onHide={handleClose} size="lg">
        <Modal.Header closeButton className="media-controls-modal-header">
          <Modal.Title>Media Controls</Modal.Title>
        </Modal.Header>
        <Modal.Body style={{maxHeight:'70vh', overflowY:'auto'}}>
          {((location.pathname.indexOf("/tunes/") === 0 || location.pathname.indexOf("/editor/") === 0) && viewedTune) && (
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
                      {hasLinks ? viewedTune.links.map(function(link, linkKey) {
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

          {viewedTune && (
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
                    tune={viewedTune}
                    tunebook={tunebook}
                    mediaController={mediaController}
                    showPitchControls={!!(mediaController.resolverFeatures && mediaController.resolverFeatures.proxy)}
                  />
                </Tab>
                {showAudioFiltersTab && (
                  <Tab eventKey="filters" title="Audio Filters">
                    <AudioFiltersPanel
                      tune={viewedTune}
                      tunebook={tunebook}
                      mediaController={mediaController}
                      showFilters={!!(mediaController.resolverFeatures && mediaController.resolverFeatures.stems)}
                    />
                  </Tab>
                )}
                {showLoopTab && (
                  <Tab eventKey="loop" title="Loop">
                    <MediaPlaybackRegionPanel
                      tune={viewedTune}
                      tunebook={tunebook}
                      mediaController={mediaController}
                      linkIndex={activeLinkIndex}
                    />
                  </Tab>
                )}
                {hasMusic && (
                  <Tab eventKey="midi" title="Metronome">
                    <MidiPlaybackMetronomePanel
                      tune={viewedTune}
                      tunebook={tunebook}
                      mediaController={mediaController}
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
