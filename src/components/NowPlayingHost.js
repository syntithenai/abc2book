import { useEffect, useMemo, useRef, useState } from 'react'
import MediaPlayerMedia from './MediaPlayerMedia'
import MediaPlayerMidiFile from './MediaPlayerMidiFile'
import Abc from './Abc'
import {
  isQueueActive,
  getCurrentItem,
  getCurrentTuneId,
  resolvePlaybackForItem,
} from '../nowPlayingQueue'
import {
  parseTunePagePlaybackFromUrl,
  shouldNowPlayingHostOwnPlayback,
} from '../nowPlayingQueuePlayback'
import { shouldSuppressHostAutostart } from '../playbackNavigationUtils'
import {
  resolveHostPlaybackTarget,
  shouldSkipHostMidiRouteApply,
} from '../playbackHostTarget'
import { buildPlayableTuneAbc } from '../abcVoiceFilter'
import { getPlayableVoiceKeys, getTuneVoiceKeys, VOICE_VIEW_SETTINGS_CHANGED } from '../abcVoiceViewSettings'
import { resolveLinkPlaybackSrcType } from '../mediaLinkSrcType'
import './NowPlayingHost.css'

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

  const pathname = props.pathname || ''
  const urlPlayback = parseTunePagePlaybackFromUrl(pathname)
  const queuePlayingTuneId = getCurrentTuneId(queue)
  const queuePlayingTune = queuePlayingTuneId ? tunes[queuePlayingTuneId] : null
  const currentItem = getCurrentItem(queue)
  const controllerTune = mediaController && mediaController.tune ? mediaController.tune : null
  const viewedTune = viewedTuneId ? tunes[viewedTuneId] : null
  const playingTune = isQueueActive(queue)
    ? queuePlayingTune
    : (controllerTune || (urlPlayback && viewedTune ? viewedTune : null))

  const shouldHost = shouldNowPlayingHostOwnPlayback({
    viewedTuneId: viewedTuneId,
    queue: queue,
    mediaController: mediaController,
    practiceSessionActive: practiceSessionActive,
    gigModeActive: gigModeActive,
    pathname: pathname,
    tunes: tunes,
  })

  const resumePlaybackOnHost = !!(mediaController
    && mediaController.hasActivePlaybackIntent
    && mediaController.hasActivePlaybackIntent())

  const suppressAutostart = shouldSuppressHostAutostart(
    pathname,
    mediaController,
    resumePlaybackOnHost,
    urlPlayback
  )

  const playbackTarget = useMemo(function() {
    const routeFromUrl = parseTunePagePlaybackFromUrl(pathname)
    return resolveHostPlaybackTarget(
      mediaController,
      playingTune,
      tunebook,
      queue,
      currentItem,
      routeFromUrl,
      {
        isQueueActive: isQueueActive,
        resolvePlaybackForItem: resolvePlaybackForItem,
      }
    )
  }, [
    playingTune,
    currentItem,
    tunebook,
    queue,
    pathname,
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
    if (shouldSkipHostMidiRouteApply(mc)) return undefined

    const tuneId = playingTune.id
    const tuneChanged = lastMidiRouteTuneIdRef.current !== tuneId
    lastMidiRouteTuneIdRef.current = tuneId

    mc.applyPlaybackRoute('playMidi', '0', playingTune, tunebook)

    let consumed = false
    if (mc.consumePendingPlayRequest) {
      consumed = mc.consumePendingPlayRequest(tuneId, 'playMidi', null)
    }
    if (!consumed && tuneChanged && mc.maybeAutostart && !suppressAutostart) {
      mc.maybeAutostart('playMidi', 'tune', false)
    }
    return undefined
  }, [shouldHost, playbackTarget && playbackTarget.type, playingTune && playingTune.id, tunebook, suppressAutostart])

  if (!shouldHost || !playbackTarget) return null

  const routePlayState = playbackTarget.type === 'midi' ? 'playMidi' : 'playMedia'
  const routeMediaLinkNumber = playbackTarget.type === 'media'
    ? String(playbackTarget.linkNum != null ? playbackTarget.linkNum : 0)
    : '0'
  const activeMediaLink = playbackTarget.type === 'media' && playingTune && Array.isArray(playingTune.links)
    ? playingTune.links[parseInt(routeMediaLinkNumber, 10) || 0]
    : null
  const activeMediaSrcType = activeMediaLink && tunebook
    ? resolveLinkPlaybackSrcType(activeMediaLink, tunebook.utils && tunebook.utils.isYoutubeLink)
    : null
  const engineKey = playbackTarget.type === 'midi'
    ? 'host-midi-' + playingTune.id + '-v' + playableVoiceKey
    // Keep a stable media host key so queue advance reuses the same <audio>
    // element (src change) instead of remounting — required for mobile
    // screen-off auto-advance / continuous Media Session autoplay.
    : 'host-media'

  return (
    <div className="now-playing-host" aria-hidden="true">
      {playbackTarget.type === 'media' ? (
        activeMediaSrcType === 'midifile' ? (
          <MediaPlayerMidiFile
            key={'host-midifile-' + playingTune.id + '-' + routeMediaLinkNumber}
            mediaController={mediaController}
            tunebook={tunebook}
            tune={playingTune}
            routePlayState={routePlayState}
            routeMediaLinkNumber={routeMediaLinkNumber}
            suppressAutostart={suppressAutostart}
          />
        ) : (
          <MediaPlayerMedia
            key={engineKey}
            mediaController={mediaController}
            tunebook={tunebook}
            tune={playingTune}
            routePlayState={routePlayState}
            routeMediaLinkNumber={routeMediaLinkNumber}
            suppressAutostart={suppressAutostart}
            suppressTapModal={true}
            instanceId="queue"
            compactPlayer={true}
          />
        )
      ) : (
        <Abc
          key={engineKey}
          mediaController={mediaController}
          tunebook={tunebook}
          abc={staffPlaybackAbc}
          meter={playingTune.meter}
          autoPrime={true}
          autoStart={resumePlaybackOnHost && !suppressAutostart}
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
