import { useEffect, useMemo, useRef, useState } from 'react'
import MediaPlayerMedia from './MediaPlayerMedia'
import Abc from './Abc'
import {
  isQueueActive,
  getCurrentItem,
  resolvePlaybackForItem,
} from '../nowPlayingQueue'
import {
  parseTunePagePlaybackFromUrl,
  resolveHostPlayingTune,
  resolveHostPlayingTuneId,
  shouldNowPlayingHostOwnPlayback,
} from '../nowPlayingQueuePlayback'
import { shouldSuppressHostAutostart } from '../playbackNavigationUtils'
import {
  resolveHostPlaybackTarget,
  shouldSkipHostMidiRouteApply,
} from '../playbackHostTarget'
import { buildPlayableTuneAbc } from '../abcVoiceFilter'
import { getPlaybackVoiceKeys, getTuneVoiceKeys, VOICE_VIEW_SETTINGS_CHANGED } from '../abcVoiceViewSettings'
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
  const currentItem = getCurrentItem(queue)
  const hostPlayingTuneId = resolveHostPlayingTuneId({
    queue: queue,
    mediaController: mediaController,
    viewedTuneId: viewedTuneId,
    pathname: pathname,
  })
  const playingTune = useMemo(function() {
    return resolveHostPlayingTune(hostPlayingTuneId, tunes, mediaController)
  }, [
    hostPlayingTuneId,
    tunes,
    mediaController,
    mediaController && mediaController.tune,
  ])

  const shouldHost = shouldNowPlayingHostOwnPlayback({
    viewedTuneId: viewedTuneId,
    queue: queue,
    mediaController: mediaController,
    practiceSessionActive: practiceSessionActive,
    gigModeActive: gigModeActive,
    pathname: pathname,
    tunes: tunes,
    nowPlayingExpanded: !!props.nowPlayingExpanded,
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

  const notationOwnsMidi = !!(mediaController && mediaController.notationMidiOwner)

  const playbackTarget = useMemo(function() {
    const tune = playingTune
    const routeFromUrl = parseTunePagePlaybackFromUrl(pathname)
    return resolveHostPlaybackTarget(
      mediaController,
      tune,
      tunebook,
      queue,
      currentItem,
      routeFromUrl,
      {
        isQueueActive: isQueueActive,
        resolvePlaybackForItem: resolvePlaybackForItem,
        nowPlayingExpanded: !!props.nowPlayingExpanded,
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
    voiceSettingsRevision,
    props.nowPlayingExpanded,
  ])

  const playbackVoiceKey = useMemo(function() {
    if (!hostPlayingTuneId) return ''
    const tune = playingTune || tunes[hostPlayingTuneId]
    if (!tune) return ''
    const voiceKeys = getTuneVoiceKeys(tune)
    return getPlaybackVoiceKeys(tune.id, voiceKeys).join('\0')
  }, [hostPlayingTuneId, playingTune, tunes, voiceSettingsRevision])

  const staffPlaybackAbc = useMemo(function() {
    if (!hostPlayingTuneId || !tunebook) return ''
    const tune = playingTune || tunes[hostPlayingTuneId]
    if (!tune) return ''
    return buildPlayableTuneAbc(tune, tunebook)
  }, [hostPlayingTuneId, playingTune, tunes, tunebook, playbackVoiceKey])

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
      const pendingMidi = mc.pendingMidiPlayRef && mc.pendingMidiPlayRef.current
      const kickoffActive = mc.isMidiKickoffActiveRef && mc.isMidiKickoffActiveRef.current
          && mc.isMidiKickoffActiveRef.current()
      const armed = mc.hasActivePlaybackIntent && mc.hasActivePlaybackIntent()
      if (!pendingMidi && !kickoffActive && armed) {
        mc.maybeAutostart('playMidi', 'tune', false)
      }
    }
    return undefined
  }, [shouldHost, playbackTarget && playbackTarget.type, playingTune && playingTune.id, tunebook, suppressAutostart])

  if (!shouldHost || !playbackTarget) {
    // #region agent log
    fetch('http://127.0.0.1:7543/ingest/714bef82-d1cf-4636-9283-79de04198120',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0569dc'},body:JSON.stringify({sessionId:'0569dc',hypothesisId:'H5',location:'NowPlayingHost.js:render',message:'host not mounting engine',data:{shouldHost:!!shouldHost,targetType:playbackTarget&&playbackTarget.type,pathname:pathname,isLoading:!!(mediaController&&mediaController.isLoading),routeMode:mediaController&&mediaController.playbackRouteMode},timestamp:Date.now()})}).catch(function(){})
    // #endregion
    return null
  }

  // #region agent log
  fetch('http://127.0.0.1:7543/ingest/714bef82-d1cf-4636-9283-79de04198120',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0569dc'},body:JSON.stringify({sessionId:'0569dc',runId:'post-fix',hypothesisId:'H5',location:'NowPlayingHost.js:render',message:'host mounting engine',data:{targetType:playbackTarget.type,pathname:pathname,isLoading:!!(mediaController&&mediaController.isLoading),routeMode:mediaController&&mediaController.playbackRouteMode},timestamp:Date.now()})}).catch(function(){})
  // #endregion

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
  const isMidiFileRoute = mediaController && mediaController.isMidiFileMediaRoute
    && mediaController.isMidiFileMediaRoute()
  const engineKey = playbackTarget.type === 'midi'
    ? 'host-midi-' + playingTune.id + '-v' + playbackVoiceKey
    // Keep a stable media host key so queue advance reuses the same <audio>
    // element (src change) instead of remounting — required for mobile
    // screen-off auto-advance / continuous Media Session autoplay.
    : 'host-media'

  return (
    <div className="now-playing-host" aria-hidden="true">
      {playbackTarget.type === 'media' ? (
        activeMediaSrcType === 'midifile' || isMidiFileRoute ? null : (
          <MediaPlayerMedia
            key={engineKey}
            mediaController={mediaController}
            tunebook={tunebook}
            tune={playingTune}
            routePlayState={routePlayState}
            routeMediaLinkNumber={routeMediaLinkNumber}
            suppressAutostart={suppressAutostart}
            suppressTapModal={false}
            instanceId="queue"
            compactPlayer={true}
          />
        )
      ) : (
        <Abc
          key={engineKey}
          mediaController={mediaController}
          tunebook={tunebook}
          tunes={tunes}
          abc={staffPlaybackAbc}
          meter={playingTune.meter}
          tablatureSourceTune={playingTune}
          autoPrime={true}
          autoStart={resumePlaybackOnHost && !suppressAutostart}
          editableTempo={false}
          repeat={playingTune.repeats > 0 ? playingTune.repeats : 1}
          hideSvg={true}
          hidePlayer={true}
          suppressPlaybackVisuals={true}
          playbackEngine={!notationOwnsMidi}
          onEnded={function() {
            if (mediaController.onEnded) mediaController.onEnded()
          }}
        />
      )}
    </div>
  )
}
