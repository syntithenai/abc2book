import {useState, useEffect} from 'react'
import {Button, ButtonGroup, Modal, Tabs, Tab} from 'react-bootstrap'
import {useNavigate, useLocation, useParams} from 'react-router-dom'
import PitchTempoControlsPanel from './PitchTempoControlsPanel'
import AudioFiltersPanel from './AudioFiltersPanel'
import MediaPlaybackRegionPanel from './MediaPlaybackRegionPanel'
import MidiPlaybackMetronomePanel from './MidiPlaybackMetronomePanel'
import MediaSeekSlider from './MediaSeekSlider'
import { getActiveLinkIndex } from '../mediaPlaybackUtils'
import { youtubeAudioBytesAvailable } from '../youtubeUnlock'
import { isQueueActive } from '../nowPlayingQueue'
import { getViewedTuneIdFromPath, getSkipNavigationTuneId } from '../playbackNavigationUtils'
import './MediaPlayerOptionsModal.css'

export default function MediaPlayerOptionsModal({
  mediaController,
  tunebook,
  buttonSize,
  variant,
  currentTuneBook,
  tagFilter,
  selected,
  user,
  tunes,
  nowPlayingQueue,
  contextTune,
  suppressRouteNavigation,
  dialogZIndex,
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const params = useParams()
  // Header mounts this modal outside the /tunes/:tuneId route, so useParams()
  // is often empty — resolve the viewed tune from the pathname first.
  const viewedTuneId = getViewedTuneIdFromPath(location.pathname)
    || (params.tuneId ? params.tuneId : null)
  const viewedTune = (function() {
    if (contextTune) {
      if (contextTune.id && tunes && tunes[contextTune.id]) {
        return tunes[contextTune.id]
      }
      return contextTune
    }
    if (viewedTuneId && tunes && tunes[viewedTuneId]) {
      return tunes[viewedTuneId]
    }
    return mediaController.tune
  })()
  const inPracticeContext = !!contextTune
  const showTunePlaybackControls = inPracticeContext
    || location.pathname.indexOf('/tunes/') === 0
    || location.pathname.indexOf('/editor/') === 0
  const playingTune = (function() {
    const tune = mediaController.tune
    if (!tune || !tune.id) return null
    if (tunes && tunes[tune.id]) return tunes[tune.id]
    return tune
  })()
  const playingTuneLabel = playingTune
    && playingTune.name
    && playingTune.name.trim().length > 0
    ? playingTune.name.trim()
    : (playingTune ? 'Untitled Song' : '')
  const [show, setShow] = useState(false);
  const [settingsTab, setSettingsTab] = useState('playback');
  var useButtonSize=(buttonSize ? buttonSize : 'lg')
  const hasMusic = !!(showTunePlaybackControls && viewedTune && tunebook.hasNotesOrChords(viewedTune))
  const hasLinks = !!(showTunePlaybackControls && viewedTune && tunebook.hasLinks(viewedTune))

  const handleClose = function() {
    setShow(false);
  }
  const handleShow = function() {
    setShow(true);
    if (mediaController.refreshMediaResolverHealth) {
      mediaController.refreshMediaResolverHealth();
    }
  }

  const activeLinkIndex = viewedTune
    ? getActiveLinkIndex(viewedTune, mediaController.mediaLinkNumber)
    : null

  const showLoopTab = viewedTune
    && activeLinkIndex !== null
    && viewedTune.links
    && viewedTune.links[activeLinkIndex]

  const [youtubePitchUnlocked, setYoutubePitchUnlocked] = useState(false)
  useEffect(function() {
    let cancelled = false
    youtubeAudioBytesAvailable({
      resolverFeatures: mediaController.resolverFeatures || null,
    }).then(function(ok) {
      if (!cancelled) setYoutubePitchUnlocked(!!ok)
    })
    return function() { cancelled = true }
  }, [mediaController.resolverFeatures, show])

  const showPitchControls = !!youtubePitchUnlocked

  const showAudioFiltersTab = !!viewedTune
    && activeLinkIndex !== null
    && viewedTune.links
    && viewedTune.links[activeLinkIndex]
    && mediaController.getSrcType(viewedTune.links[activeLinkIndex].link) !== 'abc'
    && mediaController.stemsCapabilityAvailable
    && youtubePitchUnlocked

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
    if (mediaController.setTune) {
      mediaController.setTune(viewedTune)
    }
    const sameSource = mediaController.isMediaPlaybackRoute
      && mediaController.isMediaPlaybackRoute()
      && mediaController.mediaLinkNumber === linkKey
    const path = '/tunes/' + viewedTune.id + '/playMedia/' + linkKey
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
    if (!suppressRouteNavigation && location.pathname !== path) {
      navigate(path)
    }
  }

  function handleMidiPlayback() {
    if (!viewedTune) return
    if (mediaController.setTune) {
      mediaController.setTune(viewedTune)
    }
    const sameSource = mediaController.isMidiPlaybackRoute
      && mediaController.isMidiPlaybackRoute()
    const path = '/tunes/' + viewedTune.id + '/playMidi'
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
    if (!suppressRouteNavigation && location.pathname !== path) {
      navigate(path)
    }
  }

  const skipTuneId = getSkipNavigationTuneId(location.pathname, nowPlayingQueue)
  const showSkipButtons = !suppressRouteNavigation && !!(skipTuneId && viewedTuneId)
  const navFromId = viewedTuneId || null
  const queuePlaybackRunning = !!(navFromId)
    && isQueueActive(nowPlayingQueue)
    && !!(mediaController && (mediaController.isPlaying || mediaController.isLoading))
    && Array.isArray(nowPlayingQueue && nowPlayingQueue.items)
    && nowPlayingQueue.items.some(function(item) {
      return item && String(item.tuneId) === String(navFromId)
    })
  const prevLabel = queuePlaybackRunning ? 'Previous in playlist' : 'Previous search result'
  const nextLabel = queuePlaybackRunning ? 'Next in playlist' : 'Next search result'

  function handleSkipPrevious() {
    if (!showSkipButtons) return
    tunebook.navigateToPreviousSong(navFromId, navigate, location.pathname, {
      mediaController: mediaController,
      forceSearchList: true,
    })
  }

  function handleSkipNext() {
    if (!showSkipButtons) return
    tunebook.navigateToNextSong(navFromId, null, navigate, location.pathname, {
      mediaController: mediaController,
      forceSearchList: true,
    })
  }

  return (
    <>
      <Button size={useButtonSize} onClick={handleShow} variant={(variant ? variant : (mediaController.isLoading ? "secondary" : (mediaController.isPlaying ? "warning" : "success")))}>{tunebook.icons.dropdown}</Button>

      <Modal
        onClick={function(e) {e.stopPropagation()}}
        show={show}
        onHide={handleClose}
        size="lg"
        style={dialogZIndex ? { zIndex: dialogZIndex } : undefined}
        backdropClassName={dialogZIndex ? 'media-controls-modal-backdrop-elevated' : undefined}
      >
        <Modal.Header closeButton className="media-controls-modal-header">
          <Modal.Title className="media-controls-modal-title-row">
            <span className="media-controls-modal-title-text">Media Controls</span>
            {playingTuneLabel ? (
              <span className="media-controls-now-playing" title={'Now Playing: ' + playingTuneLabel}>
                Now Playing: {playingTuneLabel}
              </span>
            ) : null}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{maxHeight:'70vh', overflowY:'auto'}}>
          {(showTunePlaybackControls && viewedTune) && (
            <div style={{borderBottom:'1px solid black', paddingBottom:'0.5em'}}>
              <div className="media-controls-playback-row">
                <div className="media-controls-playback-buttons">
                  {mediaController.isLoading ? (
                    <Button
                      variant="secondary"
                      title="Cancel loading"
                      aria-label="Cancel loading"
                      onClick={cancelPendingPlayback}
                    >
                      {tunebook.icons.waiting}
                    </Button>
                  ) : mediaController.isPlaying ? (
                    <Button
                      variant="warning"
                      title="Pause"
                      aria-label="Pause"
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
                  {showSkipButtons ? (
                    <ButtonGroup className="media-controls-skip-buttons">
                      <Button
                        variant="outline-secondary"
                        aria-label={prevLabel}
                        title={prevLabel}
                        onClick={handleSkipPrevious}
                      >
                        {tunebook.icons.skipback}
                      </Button>
                      <Button
                        variant="outline-secondary"
                        aria-label={nextLabel}
                        title={nextLabel}
                        onClick={handleSkipNext}
                      >
                        {tunebook.icons.skipforward}
                      </Button>
                    </ButtonGroup>
                  ) : null}
                </div>
                <div className="media-controls-transport-actions">
                  {mediaController.rewindToStart && (
                    <Button
                      variant="outline-secondary"
                      size="sm"
                      className="media-controls-rewind"
                      title="From start"
                      aria-label="From start"
                      onClick={function() { mediaController.rewindToStart() }}
                    >
                      {tunebook.icons.rewind} From start
                    </Button>
                  )}
                </div>
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
                    showPitchControls={showPitchControls}
                  />
                </Tab>
                {showAudioFiltersTab && (
                  <Tab eventKey="filters" title="Audio Filters">
                    <AudioFiltersPanel
                      tune={viewedTune}
                      tunebook={tunebook}
                      mediaController={mediaController}
                      showFilters={showPitchControls && !!mediaController.stemsCapabilityAvailable}
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
