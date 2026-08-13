import { useState, useEffect, useRef } from 'react'
import { Tabs, Tab } from 'react-bootstrap'
import PitchTempoControlsPanel from './PitchTempoControlsPanel'
import AudioFiltersPanel from './AudioFiltersPanel'
import MediaPlaybackRegionPanel from './MediaPlaybackRegionPanel'
import MidiPlaybackMetronomePanel from './MidiPlaybackMetronomePanel'
import MidiPlaybackFillPanel from './MidiPlaybackFillPanel'
import MediaSeekSlider from './MediaSeekSlider'
import NowPlayingQueueManager from './NowPlayingQueueManager'
import PlaylistToolbar from './PlaylistToolbar'
import { isQueueActive } from '../nowPlayingQueue'
import { getActiveLinkIndex, getFirstPlayableMediaLinkIndex, tuneHasPlayableMediaLinks, resolveLoopEditorLinkIndex, isMediaLoopTabEnabled } from '../mediaPlaybackUtils'
import { linkedMediaPitchPathAvailable } from '../linkedMediaPitchPath'
import { isChromiumDesktopBrowser } from '../platformUtils'
import './MediaPlayerOptionsModal.css'

export default function MediaPlaybackSettingsTabs({
  tune,
  tunebook,
  mediaController,
  showSeekSlider = false,
  className = '',
  active = true,
  nowPlayingQueue,
  setNowPlayingQueue,
  tunes,
  onPlaylistCleared,
  elevatedPlaylistModal,
  token = null,
  login = null,
}) {
  const showPlaylistTab = isQueueActive(nowPlayingQueue)
    && Array.isArray(nowPlayingQueue.items)
    && nowPlayingQueue.items.length > 0
  const [settingsTab, setSettingsTab] = useState(showPlaylistTab ? 'playlist' : 'playback')
  const [midiSubTab, setMidiSubTab] = useState('metronome')
  const prevShowPlaylistTab = useRef(showPlaylistTab)
  const hasMusic = !!(tune && tunebook.hasNotesOrChords(tune))

  const isYoutubeLink = tunebook.utils && tunebook.utils.isYoutubeLink

  const activeLinkIndex = tune
    ? (mediaController.mediaLinkNumber !== null && mediaController.mediaLinkNumber !== undefined
      ? getActiveLinkIndex(tune, mediaController.mediaLinkNumber)
      : getFirstPlayableMediaLinkIndex(
        tune,
        null,
        isYoutubeLink
      ))
    : null

  const showLoopTab = !!(tune && tuneHasPlayableMediaLinks(tune, isYoutubeLink))
  const loopTabEnabled = !!(tune && isMediaLoopTabEnabled(tune, mediaController, isYoutubeLink))
  const loopLinkIndex = tune ? resolveLoopEditorLinkIndex(tune, mediaController, isYoutubeLink) : null
  const loopTabTitle = loopTabEnabled ? 'Loop' : 'Choose media to loop'

  const activeLinkSrcType = tune
    && activeLinkIndex !== null
    && tune.links
    && tune.links[activeLinkIndex]
    ? mediaController.getSrcType(
      tune.links[activeLinkIndex].link,
      tune.links[activeLinkIndex]
    )
    : null
  const needsLinkedMediaPitchPath = activeLinkSrcType === 'youtube'
    || activeLinkSrcType === 'audio'
    || activeLinkSrcType === 'recording'

  const [linkedMediaPitchUnlocked, setLinkedMediaPitchUnlocked] = useState(false)
  useEffect(function() {
    let cancelled = false
    if (!needsLinkedMediaPitchPath) {
      setLinkedMediaPitchUnlocked(false)
      return function() { cancelled = true }
    }
    linkedMediaPitchPathAvailable({
      srcType: activeLinkSrcType,
      resolverFeatures: mediaController.resolverFeatures || null,
      resolverStatus: mediaController.mediaResolverStatus || null,
      accessToken: null,
    }).then(function(ok) {
      if (!cancelled) setLinkedMediaPitchUnlocked(!!ok)
    })
    return function() { cancelled = true }
  }, [
    needsLinkedMediaPitchPath,
    activeLinkSrcType,
    mediaController.resolverFeatures,
    mediaController.mediaResolverStatus,
    mediaController.mediaResolverChecked,
    active,
  ])

  useEffect(function() {
    if (typeof window === 'undefined') return undefined
    function refreshPitchPath() {
      if (!needsLinkedMediaPitchPath) return
      linkedMediaPitchPathAvailable({
        srcType: activeLinkSrcType,
        resolverFeatures: mediaController.resolverFeatures || null,
        resolverStatus: mediaController.mediaResolverStatus || null,
        accessToken: null,
      }).then(function(ok) {
        setLinkedMediaPitchUnlocked(!!ok)
      })
    }
    window.addEventListener('mediaProxySettingsChanged', refreshPitchPath)
    window.addEventListener('youtubeHelperSettingsChanged', refreshPitchPath)
    return function() {
      window.removeEventListener('mediaProxySettingsChanged', refreshPitchPath)
      window.removeEventListener('youtubeHelperSettingsChanged', refreshPitchPath)
    }
  }, [needsLinkedMediaPitchPath, activeLinkSrcType, mediaController.resolverFeatures, mediaController.mediaResolverStatus])

  const showPitchControls = !!hasMusic
    || (needsLinkedMediaPitchPath && linkedMediaPitchUnlocked)
  const showYoutubeHelperInvite = !!needsLinkedMediaPitchPath
    && activeLinkSrcType === 'youtube'
    && !linkedMediaPitchUnlocked
    && !hasMusic
    && isChromiumDesktopBrowser()

  const remoteOutputLocked = !!(
    mediaController.isRemoteOutputActive && mediaController.isRemoteOutputActive()
  )

  const showAudioFiltersTab = !!tune
    && activeLinkIndex !== null
    && tune.links
    && tune.links[activeLinkIndex]
    && mediaController.getSrcType(
      tune.links[activeLinkIndex].link,
      tune.links[activeLinkIndex]
    ) !== 'abc'
    && mediaController.stemsCapabilityAvailable
    && linkedMediaPitchUnlocked

  useEffect(function() {
    if (showPlaylistTab) {
      if (!prevShowPlaylistTab.current) {
        setSettingsTab('playlist')
      }
    } else {
      setSettingsTab(function(current) {
        return current === 'playlist' ? 'playback' : current
      })
    }
    prevShowPlaylistTab.current = showPlaylistTab
  }, [showPlaylistTab])

  useEffect(function() {
    if (settingsTab === 'loop' && !showLoopTab) {
      setSettingsTab('playback')
    }
    if (settingsTab === 'filters' && !showAudioFiltersTab) {
      setSettingsTab('playback')
    }
    if (settingsTab === 'midi' && !hasMusic) {
      setSettingsTab('playback')
    }
  }, [settingsTab, showLoopTab, showAudioFiltersTab, hasMusic])

  const refreshMediaResolverHealth = mediaController.refreshMediaResolverHealth

  useEffect(function() {
    if (!active) return
    if (refreshMediaResolverHealth) {
      refreshMediaResolverHealth()
    }
  }, [active, refreshMediaResolverHealth])

  if (!tune && !showPlaylistTab) return null

  return (
    <div className={'media-controls-settings-tabs' + (className ? ' ' + className : '')}>
      {showSeekSlider && tune ? (
        <MediaSeekSlider mediaController={mediaController} className="compact" />
      ) : null}

      <Tabs
        activeKey={settingsTab}
        onSelect={function(key) { if (key) setSettingsTab(key) }}
        id="media-controls-settings-tabs"
        className="mb-2"
      >
        {showPlaylistTab ? (
          <Tab eventKey="playlist" title="Playlist">
            <div className="now-playing-page-playlist-tab">
              {nowPlayingQueue.name ? (
                <p className="now-playing-page-playlist-tab-name">{nowPlayingQueue.name}</p>
              ) : null}
              <PlaylistToolbar
                tunebook={tunebook}
                nowPlayingQueue={nowPlayingQueue}
                setNowPlayingQueue={setNowPlayingQueue}
                tunes={tunes}
                onCleared={onPlaylistCleared}
                dialogZIndex={elevatedPlaylistModal ? 1300 : undefined}
                startPlaybackOnOpen={elevatedPlaylistModal}
                mediaController={mediaController}
              />
              <NowPlayingQueueManager
                tunebook={tunebook}
                nowPlayingQueue={nowPlayingQueue}
                setNowPlayingQueue={setNowPlayingQueue}
                tunes={tunes}
                mediaController={mediaController}
                handleClose={onPlaylistCleared}
                token={token}
              />
            </div>
          </Tab>
        ) : null}
        {tune ? (
          <Tab eventKey="playback" title="Playback" disabled={remoteOutputLocked}>
            {remoteOutputLocked ? (
              <p className="text-muted small mb-2">
                Stop remote output (Cast / Snapcast) to change pitch or tempo, or reload after changing settings.
              </p>
            ) : null}
            <PitchTempoControlsPanel
              tune={tune}
              tunebook={tunebook}
              mediaController={mediaController}
              showPitchControls={showPitchControls}
              showYoutubeHelperInvite={showYoutubeHelperInvite}
              disabled={remoteOutputLocked}
            />
          </Tab>
        ) : null}
        {tune && showAudioFiltersTab ? (
          <Tab eventKey="filters" title="Audio Filters" disabled={remoteOutputLocked}>
            {remoteOutputLocked ? (
              <p className="text-muted small mb-2">
                Audio filters are locked while routing to a remote speaker.
              </p>
            ) : null}
            <AudioFiltersPanel
              tune={tune}
              tunebook={tunebook}
              mediaController={mediaController}
              showFilters={showPitchControls && !!mediaController.stemsCapabilityAvailable}
              disabled={remoteOutputLocked}
            />
          </Tab>
        ) : null}
        {tune && showLoopTab ? (
          <Tab eventKey="loop" title={loopTabTitle} disabled={!loopTabEnabled}>
            <MediaPlaybackRegionPanel
              tune={tune}
              tunebook={tunebook}
              mediaController={mediaController}
              linkIndex={loopLinkIndex}
              disabled={!loopTabEnabled}
              disabledMessage="Choose media to loop"
              token={token}
              login={login}
              dialogZIndex={elevatedPlaylistModal ? 1300 : undefined}
            />
          </Tab>
        ) : null}
        {tune && hasMusic ? (
          <Tab eventKey="midi" title="MIDI">
            <Tabs
              activeKey={midiSubTab}
              onSelect={function(key) { if (key) setMidiSubTab(key) }}
              id="media-controls-midi-subtabs"
              className="media-playback-midi-subtabs mb-2"
            >
              <Tab eventKey="metronome" title="Metronome">
                <MidiPlaybackMetronomePanel
                  tune={tune}
                  tunebook={tunebook}
                  mediaController={mediaController}
                />
              </Tab>
              <Tab eventKey="fill" title="Fill">
                <MidiPlaybackFillPanel
                  tune={tune}
                  tunebook={tunebook}
                  mediaController={mediaController}
                />
              </Tab>
            </Tabs>
          </Tab>
        ) : null}
      </Tabs>
    </div>
  )
}
