import { useEffect, useMemo, useRef, useState } from 'react'
import MediaPlayerMedia from './MediaPlayerMedia'
import Abc from './Abc'
import {
  isQueueActive,
  getCurrentItem,
  getCurrentTuneId,
  resolvePlaybackForItem,
} from '../nowPlayingQueue'
import { shouldMusicSingleOwnPlayback } from '../nowPlayingQueuePlayback'
import { buildPlayableTuneAbc } from '../abcVoiceFilter'
import { getPlayableVoiceKeys, getTuneVoiceKeys, VOICE_VIEW_SETTINGS_CHANGED } from '../abcVoiceViewSettings'
import './NowPlayingHost.css'

function resolveHostPlaybackTarget(mediaController, playingTune, tunebook, queue, currentItem) {
  if (!playingTune || !tunebook || !mediaController) return null

  if (isQueueActive(queue) && currentItem) {
    return resolvePlaybackForItem(playingTune, currentItem, tunebook)
  }

  if (mediaController.requestedPlayState === 'playMidi') {
    return { type: 'midi' }
  }
  if (mediaController.requestedPlayState === 'playMedia') {
    const linkNum = mediaController.mediaLinkNumber != null ? mediaController.mediaLinkNumber : 0
    return { type: 'media', linkNum: linkNum }
  }
  if (mediaController.playbackRouteMode === 'midi') {
    return { type: 'midi' }
  }
  if (mediaController.playbackRouteMode === 'media') {
    const linkNum = mediaController.mediaLinkNumber != null ? mediaController.mediaLinkNumber : 0
    return { type: 'media', linkNum: linkNum }
  }
  if (mediaController.isMidiPlaybackRoute && mediaController.isMidiPlaybackRoute()) {
    return { type: 'midi' }
  }
  if (mediaController.isMediaPlaybackRoute && mediaController.isMediaPlaybackRoute()) {
    const linkNum = mediaController.mediaLinkNumber != null ? mediaController.mediaLinkNumber : 0
    return { type: 'media', linkNum: linkNum }
  }
  if (mediaController.hasActivePlaybackIntent && mediaController.hasActivePlaybackIntent()) {
    if (tunebook.hasNotesOrChords && tunebook.hasNotesOrChords(playingTune)) {
      return { type: 'midi' }
    }
    if (Array.isArray(playingTune.links) && playingTune.links.length > 0) {
      const linkNum = mediaController.mediaLinkNumber != null ? mediaController.mediaLinkNumber : 0
      return { type: 'media', linkNum: linkNum }
    }
  }
  return null
}

/**
 * App-level host for the active media/midi engine.
 *
 * Kept mounted across list↔single navigation so playback does not restart when
 * MusicSingle mounts or unmounts. MusicSingle only takes the engine for
 * preview-once of a non-current queue item.
 */
export default function NowPlayingHost(props) {
  const queue = props.nowPlayingQueue
  const tunes = props.tunes || {}
  const mediaController = props.mediaController
  const tunebook = props.tunebook
  const viewedTuneId = props.viewedTuneId || null
  const practiceSessionActive = !!props.practiceSessionActive
  const gigModeActive = !!props.gigModeActive
  const [voiceSettingsRevision, setVoiceSettingsRevision] = useState(0)
  const lastMidiRouteTuneIdRef = useRef(null)
  const mediaControllerRef = useRef(mediaController)
  mediaControllerRef.current = mediaController

  useEffect(function() {
    function onVoiceSettingsChanged() {
      setVoiceSettingsRevision(function(v) { return v + 1 })
    }
    window.addEventListener(VOICE_VIEW_SETTINGS_CHANGED, onVoiceSettingsChanged)
    return function() {
      window.removeEventListener(VOICE_VIEW_SETTINGS_CHANGED, onVoiceSettingsChanged)
    }
  }, [])

  const queuePlayingTuneId = getCurrentTuneId(queue)
  const queuePlayingTune = queuePlayingTuneId ? tunes[queuePlayingTuneId] : null
  const currentItem = getCurrentItem(queue)
  const controllerTune = mediaController && mediaController.tune ? mediaController.tune : null
  const playingTune = isQueueActive(queue) ? queuePlayingTune : controllerTune

  const playbackActive = !!(mediaController && (
    (mediaController.hasActivePlaybackIntent && mediaController.hasActivePlaybackIntent())
    || (mediaController.canResumePlayback && mediaController.canResumePlayback())
    || mediaController.playbackRouteMode === 'media'
    || mediaController.playbackRouteMode === 'midi'
    || (mediaController.requestedPlayState === 'playMedia' || mediaController.requestedPlayState === 'playMidi')
  ))

  const shouldHost = !!playingTune
    && !practiceSessionActive
    && !gigModeActive
    && !shouldMusicSingleOwnPlayback(viewedTuneId, queue)
    && (isQueueActive(queue) || playbackActive)

  const resumePlaybackOnHost = !!(mediaController
    && mediaController.hasActivePlaybackIntent
    && mediaController.hasActivePlaybackIntent())

  const playbackTarget = useMemo(function() {
    return resolveHostPlaybackTarget(mediaController, playingTune, tunebook, queue, currentItem)
  }, [
    playingTune,
    currentItem,
    tunebook,
    queue,
    mediaController,
    mediaController && mediaController.mediaLinkNumber,
    mediaController && mediaController.playbackRouteMode,
    mediaController && mediaController.requestedPlayState,
    mediaController && mediaController.isPlaying,
    mediaController && mediaController.isLoading,
  ])

  const playableVoiceKey = useMemo(function() {
    if (!playingTune) return ''
    const voiceKeys = getTuneVoiceKeys(playingTune)
    return getPlayableVoiceKeys(playingTune.id, voiceKeys).join('\0')
  }, [playingTune, voiceSettingsRevision])

  const staffPlaybackAbc = useMemo(function() {
    if (!playingTune || !tunebook) return ''
    return buildPlayableTuneAbc(playingTune, tunebook)
  }, [playingTune, tunebook, playableVoiceKey])

  useEffect(function() {
    if (!shouldHost || !mediaController || !playingTune) return undefined
    if (!mediaController.tune || mediaController.tune.id !== playingTune.id) {
      mediaController.setTune(playingTune)
    }
    return undefined
  }, [shouldHost, mediaController, playingTune && playingTune.id])

  useEffect(function() {
    if (!shouldHost || !playbackTarget || playbackTarget.type !== 'midi') return undefined
    if (!playingTune || !tunebook) return undefined

    const mc = mediaControllerRef.current
    if (!mc || !mc.applyPlaybackRoute) return undefined

    const tuneId = playingTune.id
    const tuneChanged = lastMidiRouteTuneIdRef.current !== tuneId
    lastMidiRouteTuneIdRef.current = tuneId

    mc.applyPlaybackRoute('playMidi', '0', playingTune, tunebook)

    let consumed = false
    if (mc.consumePendingPlayRequest) {
      consumed = mc.consumePendingPlayRequest(tuneId, 'playMidi', null)
    }
    if (!consumed && tuneChanged && mc.maybeAutostart) {
      mc.maybeAutostart('playMidi', 'tune', false)
    }
    return undefined
  }, [shouldHost, playbackTarget && playbackTarget.type, playingTune && playingTune.id, tunebook])

  if (!shouldHost || !playbackTarget) return null

  const routePlayState = playbackTarget.type === 'midi' ? 'playMidi' : 'playMedia'
  const routeMediaLinkNumber = playbackTarget.type === 'media'
    ? String(playbackTarget.linkNum != null ? playbackTarget.linkNum : 0)
    : '0'
  const engineKey = playbackTarget.type === 'midi'
    ? 'host-midi-' + playingTune.id + '-v' + playableVoiceKey
    : 'host-media-' + playingTune.id + '-' + routeMediaLinkNumber

  return (
    <div className="now-playing-host" aria-hidden="true">
      {playbackTarget.type === 'media' ? (
        <MediaPlayerMedia
          key={engineKey}
          mediaController={mediaController}
          tunebook={tunebook}
          tune={playingTune}
          routePlayState={routePlayState}
          routeMediaLinkNumber={routeMediaLinkNumber}
          suppressAutostart={!resumePlaybackOnHost}
          suppressTapModal={true}
          instanceId="queue"
          compactPlayer={true}
        />
      ) : (
        <Abc
          key={engineKey}
          mediaController={mediaController}
          tunebook={tunebook}
          abc={staffPlaybackAbc}
          meter={playingTune.meter}
          autoPrime={true}
          autoStart={resumePlaybackOnHost}
          editableTempo={false}
          repeat={playingTune.repeats > 0 ? playingTune.repeats : 1}
          hideSvg={true}
          hidePlayer={true}
          suppressPlaybackVisuals={true}
          playbackEngine={true}
          onEnded={function() {
            if (mediaController.onEnded) mediaController.onEnded()
          }}
        />
      )}
    </div>
  )
}
