import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Button, ButtonGroup } from 'react-bootstrap'
import {
  isQueueActive,
  getQueuePositionLabel,
  getCurrentTuneId,
  setMidiPreference,
  getMidiPreference,
  MIDI_PREFERENCE,
  MIDI_PREFERENCES,
  tuneHasMidiNotes,
} from '../nowPlayingQueue'
import { resumePlaylistPlayback, enqueueTuneInQueueAndPlay, toggleTunePlayback } from '../tunePlaybackActions'
import {
  isQueuePlaybackEngaged,
  getViewedTuneIdFromPath,
  resolveNowPlayingDisplayTuneId,
} from '../playbackNavigationUtils'
import MediaSeekSlider from '../components/MediaSeekSlider'
import PlaybackVolumeSlider from '../components/PlaybackVolumeSlider'
import OutputDevicePicker, { isSetSinkIdSupported } from '../components/OutputDevicePicker'
import GlobalTempoSlider from '../components/GlobalTempoSlider'
import TuneArtwork from '../components/TuneArtwork'
import { hasTuneArtwork } from '../nowPlayingArtwork'
import MediaPlaybackSettingsTabs from '../components/MediaPlaybackSettingsTabs'
import MediaSourcePlaybackButtons from '../components/MediaSourcePlaybackButtons'
import LinkPlayRangeModal from '../components/LinkPlayRangeModal'
import PlayRangeButtonGroup from '../components/PlayRangeButtonGroup'
import SleepTimerModal from '../components/SleepTimerModal'
import { resolveLoopEditorLinkIndex } from '../mediaPlaybackUtils'
import { getActiveMediaSourceId } from '../mediaSourceMenuAccess'
import { getLinkSrcType } from '../checkTuneLinkPlayback'
import { isAndroidApp } from '../platformUtils'
import { useDocumentTitle } from '../pageTitle'
import { useOfflinePlayDisabled } from '../components/MediaPlayerButtons'
import { OFFLINE_PLAYBACK_MESSAGE } from '../offlineNetwork'
import {
  cancelPlaybackSleepTimer,
  formatSleepTimerCountdown,
  getPlaybackSleepTimerState,
  subscribePlaybackSleepTimer,
} from '../playbackSleepTimer'
import './NowPlayingPage.css'

const MIDI_PREFERENCE_TITLES = {
  skip: 'Skip MIDI — play and next/prev use media links only',
  allow: 'Allow MIDI — use media when available, MIDI as fallback',
  prefer: 'Prefer MIDI — play and next/prev use ABC MIDI when available',
}

export default function NowPlayingPage(props) {
  const navigate = useNavigate()
  const location = useLocation()
  const [, setTick] = useState(0)
  const returnPath = props.returnPath || location.pathname
  const mediaController = props.mediaController
  const nowPlayingQueue = props.nowPlayingQueue
  const queueActive = isQueueActive(nowPlayingQueue)
  const playbackEngaged = isQueuePlaybackEngaged(mediaController, { queue: nowPlayingQueue })
  const viewedTuneId = props.viewedTuneId || getViewedTuneIdFromPath(returnPath)
  const showViewedFocus = props.nowPlayingFocus === 'viewed' && !!viewedTuneId
  const activeTuneId = resolveNowPlayingDisplayTuneId({
    focus: showViewedFocus ? 'viewed' : 'playlist',
    viewedTuneId: viewedTuneId,
    mediaController: mediaController,
    queue: nowPlayingQueue,
  })
  const engineTuneId = mediaController && mediaController.tune && mediaController.tune.id
    ? mediaController.tune.id
    : null
  const transportControlsEngine = !!(engineTuneId && activeTuneId && engineTuneId === activeTuneId)
  const showQueueNavigation = queueActive
  const playingTune = activeTuneId && props.tunes ? props.tunes[activeTuneId] : (mediaController && mediaController.tune)
  const isEngaged = isQueuePlaybackEngaged(mediaController)
  const showPlaybackProgress = !!(mediaController && playingTune && engineTuneId && (
    transportControlsEngine || (!showViewedFocus && isEngaged)
  ))
  const tuneName = playingTune && playingTune.name ? playingTune.name : 'Now playing'
  const composer = playingTune && playingTune.composer ? playingTune.composer : ''
  const positionLabel = showQueueNavigation ? getQueuePositionLabel(nowPlayingQueue) : null
  const mediaIsPlaying = !!(mediaController && mediaController.isPlaying)
  const isLoading = !!(mediaController && mediaController.isLoading)
  const transportControlsDisplay = !showViewedFocus || transportControlsEngine
  const showTransportLoading = isLoading && isEngaged && transportControlsDisplay
  const showTransportPause = transportControlsDisplay && mediaIsPlaying
  const activeLinkIndex = mediaController && mediaController.mediaLinkNumber != null
    ? mediaController.mediaLinkNumber
    : null
  const showArtworkCandidate = playingTune
    ? hasTuneArtwork(playingTune, props.tunebook, { linkIndex: activeLinkIndex })
    : false
  const [showArtwork, setShowArtwork] = useState(!!showArtworkCandidate)
  const [showPlayRangeModal, setShowPlayRangeModal] = useState(false)
  const [showSleepTimerModal, setShowSleepTimerModal] = useState(false)
  const [sleepTimerState, setSleepTimerState] = useState(getPlaybackSleepTimerState)
  const [midiPreferenceLocal, setMidiPreferenceLocal] = useState(
    getMidiPreference(nowPlayingQueue)
  )
  const midiPreference = queueActive
    ? getMidiPreference(nowPlayingQueue)
    : midiPreferenceLocal
  const playDisabled = useOfflinePlayDisabled(
    mediaController,
    props.tunebook,
    location,
    playingTune
  )

  useDocumentTitle(tuneName + ' — Now Playing')

  useEffect(function() {
    setShowArtwork(!!showArtworkCandidate)
  }, [showArtworkCandidate, activeTuneId, activeLinkIndex])

  useEffect(function() {
    if (queueActive) {
      setMidiPreferenceLocal(getMidiPreference(nowPlayingQueue))
    }
  }, [queueActive, nowPlayingQueue && nowPlayingQueue.midiPreference])

  function handleMidiPreferenceChange(nextMode) {
    const next = MIDI_PREFERENCES.indexOf(nextMode) !== -1 ? nextMode : MIDI_PREFERENCE.SKIP
    setMidiPreferenceLocal(next)
    if (typeof props.setNowPlayingQueue === 'function' && isQueueActive(nowPlayingQueue)) {
      props.setNowPlayingQueue(setMidiPreference(nowPlayingQueue, next))
    }
  }

  const handleClose = useCallback(function() {
    if (typeof props.onClose === 'function') {
      props.onClose()
      return
    }
    if (window.history.length > 1) {
      navigate(-1)
    } else {
      navigate('/books')
    }
  }, [navigate, props.onClose])

  useEffect(function() {
    if (!playbackEngaged && !queueActive && !showViewedFocus) return undefined
    const id = setInterval(function() { setTick(function(n) { return n + 1 }) }, 400)
    return function() { clearInterval(id) }
  }, [
    playbackEngaged,
    queueActive,
    showViewedFocus,
    mediaController,
    mediaController && mediaController.isPlaying,
    mediaController && mediaController.isLoading,
  ])

  useEffect(function() {
    return subscribePlaybackSleepTimer(setSleepTimerState)
  }, [])

  useEffect(function() {
    if (props.blockKeyboardShortcuts) return undefined
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        if (showPlayRangeModal || showSleepTimerModal) return
        event.preventDefault()
        handleClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return function() { window.removeEventListener('keydown', onKeyDown) }
  }, [props.blockKeyboardShortcuts, handleClose, showPlayRangeModal, showSleepTimerModal])

  const queueContext = {
    tunes: props.tunes,
    nowPlayingQueue: nowPlayingQueue,
    setNowPlayingQueue: props.setNowPlayingQueue,
    setQueuePlayConfirm: props.setQueuePlayConfirm,
    skipQueueConfirm: true,
    preferMidi: midiPreference === MIDI_PREFERENCE.PREFER,
    midiPreference: midiPreference,
  }

  const isYoutubeLink = props.tunebook && props.tunebook.utils && props.tunebook.utils.isYoutubeLink
  const playRangeLinkIndex = playingTune && mediaController
    ? resolveLoopEditorLinkIndex(playingTune, mediaController, isYoutubeLink)
    : null
  const playRangeLink = playRangeLinkIndex != null
    && playingTune
    && Array.isArray(playingTune.links)
    ? playingTune.links[playRangeLinkIndex]
    : null
  const midiSourceSelected = getActiveMediaSourceId(mediaController) === 'midi'
    || getLinkSrcType(playRangeLink, isYoutubeLink) === 'midifile'
  const showPlayRangeButton = !!(playRangeLink && !midiSourceSelected)

  useEffect(function() {
    if (!showPlayRangeButton && showPlayRangeModal) {
      setShowPlayRangeModal(false)
    }
  }, [showPlayRangeButton, showPlayRangeModal])

  function handlePlayRangeLinksUpdated(nextLinks) {
    if (!playingTune || !props.tunebook || typeof props.tunebook.saveTune !== 'function') return
    props.tunebook.saveTune(Object.assign({}, playingTune, { links: nextLinks }))
  }

  function handlePlayPause() {
    if (!mediaController) return
    if (playDisabled && !showTransportPause && !showTransportLoading) return
    if (showViewedFocus) {
      if (isLoading) {
        mediaController.pause()
        mediaController.setIsLoading(false)
        mediaController.setIsReady(false)
        return
      }
      if (transportControlsEngine && mediaIsPlaying) {
        mediaController.pause()
        return
      }
      const viewedTune = props.tunes && props.tunes[viewedTuneId]
      if (viewedTune) {
        enqueueTuneInQueueAndPlay(
          mediaController,
          props.tunebook,
          navigate,
          { pathname: '/tunes/' + viewedTuneId },
          viewedTune,
          queueContext
        )
      }
      return
    }
    if (queueActive) {
      if (isLoading) {
        mediaController.pause()
        mediaController.setIsLoading(false)
        mediaController.setIsReady(false)
        return
      }
      if (mediaIsPlaying) {
        mediaController.pause()
        return
      }
      resumePlaylistPlayback(
        mediaController,
        props.tunebook,
        navigate,
        nowPlayingQueue,
        props.tunes,
        props.setNowPlayingQueue,
        { pathname: location.pathname }
      )
      return
    }
    toggleTunePlayback(
      mediaController,
      props.tunebook,
      navigate,
      { pathname: activeTuneId ? '/tunes/' + activeTuneId : returnPath },
      queueContext
    )
  }

  function stepPlaylist(direction) {
    if (!showQueueNavigation) return
    const navFromId = getCurrentTuneId(nowPlayingQueue) || activeTuneId
    if (!navFromId) return
    if (direction >= 0) {
      props.tunebook.navigateToNextSong(navFromId, null, navigate, returnPath, {
        mediaController: mediaController,
        useQueueNavigation: true,
        startPlayback: true,
      })
    } else {
      props.tunebook.navigateToPreviousSong(navFromId, navigate, returnPath, {
        mediaController: mediaController,
        useQueueNavigation: true,
        startPlayback: true,
      })
    }
  }

  function handleRewindToStart() {
    if (!transportControlsEngine || !mediaController || !mediaController.rewindToStart) return
    mediaController.rewindToStart()
  }

  if (!playbackEngaged && !queueActive && !showViewedFocus) {
    return (
      <div className="now-playing-page now-playing-page--empty">
        <h1>Now Playing</h1>
        <p>Nothing is playing right now.</p>
        <Button as={Link} to="/books" variant="primary">Browse tunes</Button>
      </div>
    )
  }

  return (
    <div className="now-playing-page">
      <div className="now-playing-page-header">
        <div className="now-playing-page-header-leading">
          <Button
            variant="link"
            className={'now-playing-page-sleep-timer-btn' + (sleepTimerState.active ? ' now-playing-page-sleep-timer-btn--active' : '')}
            aria-label="Sleep timer"
            title="Sleep timer"
            data-testid="now-playing-sleep-timer-button"
            onClick={function() { setShowSleepTimerModal(true) }}
          >
            {props.tunebook.icons.time || props.tunebook.icons.timer}
          </Button>
          {sleepTimerState.active ? (
            <div className="now-playing-page-sleep-timer-active" data-testid="now-playing-sleep-timer-countdown">
              <span className="now-playing-page-sleep-timer-countdown" aria-live="polite">
                {formatSleepTimerCountdown(sleepTimerState.remainingMs)}
              </span>
              <Button
                variant="outline-secondary"
                size="sm"
                className="now-playing-page-sleep-timer-cancel"
                data-testid="now-playing-sleep-timer-cancel"
                onClick={function() { cancelPlaybackSleepTimer() }}
              >
                Cancel
              </Button>
            </div>
          ) : null}
        </div>
        <Button
          variant="link"
          className="now-playing-page-close"
          aria-label="Close now playing"
          title="Close"
          onClick={handleClose}
        >
          {props.tunebook.icons.close}
        </Button>
      </div>

      <SleepTimerModal
        show={showSleepTimerModal}
        onHide={function() { setShowSleepTimerModal(false) }}
        setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
        dialogZIndex={1300}
      />

      <div className="now-playing-page-body">
        <div
          className={
            'now-playing-page-main-row'
            + (showArtwork ? ' now-playing-page-main-row--with-artwork' : '')
          }
        >
          <div className="now-playing-page-center">
            <div className="now-playing-page-title-row">
              {mediaController ? (
                <div className="now-playing-page-transport-row">
                  {showQueueNavigation ? (
                    <Button
                      variant="primary"
                      className="now-playing-page-step-btn"
                      aria-label="Previous in playlist"
                      title="Previous in playlist"
                      data-testid="now-playing-previous-button"
                      onClick={function() { stepPlaylist(-1) }}
                    >
                      {props.tunebook.icons.previous}
                    </Button>
                  ) : null}
                  <Button
                    variant={showTransportLoading ? 'secondary' : (showTransportPause ? 'warning' : 'success')}
                    className="now-playing-page-play-btn"
                    aria-label={showTransportLoading ? 'Cancel loading' : (showTransportPause ? 'Pause' : 'Play')}
                    title={showTransportLoading ? 'Cancel loading' : (playDisabled && !showTransportPause ? OFFLINE_PLAYBACK_MESSAGE : undefined)}
                    disabled={!showTransportPause && !showTransportLoading && playDisabled}
                    data-testid={showTransportLoading
                      ? 'now-playing-waiting-button'
                      : (showTransportPause ? 'now-playing-pause-button' : 'now-playing-play-button')}
                    onClick={handlePlayPause}
                  >
                    {showTransportLoading
                      ? props.tunebook.icons.waiting
                      : (showTransportPause ? props.tunebook.icons.pause : props.tunebook.icons.play)}
                  </Button>
                  {showQueueNavigation ? (
                    <Button
                      variant="primary"
                      className="now-playing-page-step-btn"
                      aria-label="Next in playlist"
                      title="Next in playlist"
                      data-testid="now-playing-next-button"
                      onClick={function() { stepPlaylist(1) }}
                    >
                      {props.tunebook.icons.next}
                    </Button>
                  ) : null}
                </div>
              ) : null}

              <div className="now-playing-page-title-line">
                {activeTuneId ? (
                  <Link to={'/tunes/' + activeTuneId} className="now-playing-page-title-link">
                    {tuneName}
                  </Link>
                ) : (
                  <span className="now-playing-page-title-link">{tuneName}</span>
                )}
                {composer ? <span className="now-playing-page-title-composer"> — {composer}</span> : null}
                {positionLabel ? <span className="now-playing-page-title-position"> ({positionLabel})</span> : null}
              </div>

              {showPlaybackProgress ? (
                <div className="now-playing-page-seek-row now-playing-page-seek-row--title">
                  <div className="now-playing-page-seek-row-controls">
                    <Button
                      variant="outline-secondary"
                      size="sm"
                      className="now-playing-page-rewind-btn"
                      aria-label="Rewind to start"
                      title="Rewind to start"
                      data-testid="now-playing-rewind-button"
                      onClick={handleRewindToStart}
                    >
                      {props.tunebook.icons.skipback}
                    </Button>
                  </div>
                  <MediaSeekSlider mediaController={mediaController} className="now-playing-page-seek" />
                </div>
              ) : null}

              {mediaController ? (
                <div className="now-playing-page-audio-controls">
                  <PlaybackVolumeSlider
                    mediaController={mediaController}
                    className="now-playing-page-volume"
                    volumeIcon={props.tunebook.icons.volume}
                  />
                  {!isAndroidApp() && isSetSinkIdSupported() ? (
                    <OutputDevicePicker
                      mediaController={mediaController}
                      minimal
                      inline
                    />
                  ) : null}
                  <GlobalTempoSlider
                    mediaController={mediaController}
                  />
                </div>
              ) : null}
            </div>
          </div>

          {showArtwork && playingTune ? (
            <div className="now-playing-page-artwork-col">
              <TuneArtwork
                tune={playingTune}
                tunebook={props.tunebook}
                linkIndex={activeLinkIndex}
                token={props.token}
                className="now-playing-page-artwork"
                onHidden={function() { setShowArtwork(false) }}
              />
            </div>
          ) : null}
        </div>

        {mediaController && playingTune ? (
          <>
            <div className="now-playing-page-media-sources">
              <div className="now-playing-page-media-sources-header">
                <MediaSourcePlaybackButtons
                  tune={playingTune}
                  tunebook={props.tunebook}
                  mediaController={mediaController}
                  suppressRouteNavigation
                  presentation="both"
                  login={props.login}
                  accessToken={props.token}
                  className="now-playing-page-media-sources-picker"
                  selectTrailing={showPlayRangeButton ? (
                    <PlayRangeButtonGroup
                      link={playRangeLink}
                      variant="outline-primary"
                      className="now-playing-page-play-range-btn"
                      onClick={function() { setShowPlayRangeModal(true) }}
                    />
                  ) : null}
                />
                <div className="now-playing-page-media-sources-actions">
                  {tuneHasMidiNotes(playingTune, props.tunebook) ? (
                    <ButtonGroup
                      size="sm"
                      className="now-playing-page-midi-preference-group"
                      role="group"
                      aria-label="MIDI preference"
                      data-testid="now-playing-midi-preference"
                    >
                      <Button
                        type="button"
                        variant="outline-secondary"
                        size="sm"
                        className="now-playing-page-midi-preference-icon-btn"
                        tabIndex={-1}
                        aria-hidden="true"
                        disabled
                      >
                        <span className="now-playing-page-midi-preference-icon-stack">
                          <span className="now-playing-page-midi-preference-icon">
                            {props.tunebook.icons.midi}
                          </span>
                          <span className="now-playing-page-midi-preference-icon-label">MIDI</span>
                        </span>
                      </Button>
                      {[
                        { mode: MIDI_PREFERENCE.SKIP, label: 'Skip', testId: 'now-playing-midi-skip' },
                        { mode: MIDI_PREFERENCE.ALLOW, label: 'Allow', testId: 'now-playing-midi-allow' },
                        { mode: MIDI_PREFERENCE.PREFER, label: 'Prefer', testId: 'now-playing-midi-prefer' },
                      ].map(function(option) {
                        const selected = midiPreference === option.mode
                        return (
                          <Button
                            key={option.mode}
                            type="button"
                            variant={selected ? 'secondary' : 'outline-secondary'}
                            size="sm"
                            className="now-playing-page-midi-preference-btn"
                            aria-pressed={selected}
                            title={MIDI_PREFERENCE_TITLES[option.mode]}
                            data-testid={option.testId}
                            onClick={function() { handleMidiPreferenceChange(option.mode) }}
                          >
                            {option.label}
                          </Button>
                        )
                      })}
                    </ButtonGroup>
                  ) : null}
                  {typeof props.onOpenLinksEditor === 'function' ? (
                    <Button
                      variant="outline-primary"
                      size="sm"
                      className="now-playing-page-media-sources-add"
                      aria-label="Edit media links"
                      title="Edit media links"
                      onClick={function() {
                        if (playingTune && playingTune.id) {
                          props.onOpenLinksEditor(playingTune.id)
                        }
                      }}
                    >
                      {props.tunebook.icons.add}
                    </Button>
                  ) : null}
                </div>
              </div>
              {showPlayRangeButton && playRangeLinkIndex != null ? (
                <LinkPlayRangeModal
                  show={showPlayRangeModal}
                  onHide={function() { setShowPlayRangeModal(false) }}
                  link={playRangeLink}
                  linkIndex={playRangeLinkIndex}
                  links={playingTune.links}
                  onLinksUpdated={handlePlayRangeLinksUpdated}
                  tune={playingTune}
                  tunebook={props.tunebook}
                  token={props.token}
                  login={props.login}
                  icons={props.tunebook && props.tunebook.icons}
                  dialogZIndex={1300}
                  mediaController={mediaController}
                />
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      {mediaController && (playingTune || queueActive) ? (
        <div className="now-playing-page-controls-section">
          {playingTune ? (
            <hr className="now-playing-page-tabs-divider" />
          ) : null}
          <MediaPlaybackSettingsTabs
            tune={playingTune}
            tunebook={props.tunebook}
            mediaController={mediaController}
            className="now-playing-page-settings-tabs"
            active
            nowPlayingQueue={nowPlayingQueue}
            setNowPlayingQueue={props.setNowPlayingQueue}
            tunes={props.tunes}
            onPlaylistCleared={handleClose}
            elevatedPlaylistModal={true}
            token={props.token}
            login={props.login}
            googleDocumentId={props.googleDocumentId}
            syncDocument={props.syncDocument}
            setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
          />
        </div>
      ) : null}
    </div>
  )
}
