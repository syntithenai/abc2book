import { useEffect, useMemo, useRef } from 'react'
import Abc from './Abc'
import MediaPlayerMedia from './MediaPlayerMedia'
import { buildAbcWithNoteSpacing } from '../noteSpacingUtils'

const PRACTICE_MEDIA_PLAY_DELAY_MS = 500
const PRACTICE_MEDIA_RETRY_MS = 3000
const PRACTICE_MIDI_PLAY_DELAY_MS = 250
const PRACTICE_MIDI_RETRY_MS = 3000

function startPracticePlayback(mediaController, options) {
  const opts = options || {}
  if (!mediaController) return
  if (opts.fromUserGesture && mediaController.playFromUserGesture) {
    mediaController.playFromUserGesture({ fresh: true })
    return
  }
  mediaController.play({ fresh: true })
}

/**
 * Hosts hidden playback engines inside the practice modal so tune audio does not
 * depend on navigating to MusicSingle (which may not be mounted).
 */
export default function PracticeSessionPlaybackHost(props) {
  const tune = props.tune
  const step = props.currentStep
  const mediaController = props.mediaController
  const tunebook = props.tunebook
  const rampNotifiedRef = useRef(false)
  const mediaPlayTimerRef = useRef(null)
  const mediaRetryTimerRef = useRef(null)
  const midiPlayTimerRef = useRef(null)
  const midiRetryTimerRef = useRef(null)
  const mediaControllerRef = useRef(mediaController)

  useEffect(function() {
    mediaControllerRef.current = mediaController
  }, [mediaController])

  const routePlayState = step && step.route === 'media' ? 'playMedia' : 'playMidi'
  const routeMediaLinkNumber = step && step.linkIndex != null ? String(step.linkIndex) : '0'
  const isMediaRoute = !!(step && step.route === 'media' && tune && tunebook.hasLinks(tune))
  const sessionGeneration = props.sessionGeneration != null ? props.sessionGeneration : 0

  const staffDisplayAbc = useMemo(function() {
    if (!tune || !tunebook) return ''
    return buildAbcWithNoteSpacing(tune, tunebook.abcTools, { includeLyrics: false })
  }, [tune, tunebook])

  function clearMediaTimers() {
    if (mediaPlayTimerRef.current) {
      clearTimeout(mediaPlayTimerRef.current)
      mediaPlayTimerRef.current = null
    }
    if (mediaRetryTimerRef.current) {
      clearInterval(mediaRetryTimerRef.current)
      mediaRetryTimerRef.current = null
    }
  }

  function clearMidiTimers() {
    if (midiPlayTimerRef.current) {
      clearTimeout(midiPlayTimerRef.current)
      midiPlayTimerRef.current = null
    }
    if (midiRetryTimerRef.current) {
      clearInterval(midiRetryTimerRef.current)
      midiRetryTimerRef.current = null
    }
  }

  useEffect(function() {
    rampNotifiedRef.current = false
    clearMediaTimers()
    clearMidiTimers()
  }, [props.stepIndex, tune && tune.id, step && step.tuneId, props.active])

  useEffect(function() {
    return function() {
      clearMediaTimers()
      clearMidiTimers()
    }
  }, [])

  function tryStartMidiPlayback(options) {
    const controller = mediaControllerRef.current
    if (!props.active || !controller || isMediaRoute) return
    const opts = options || {}
    let fromGesture = opts.fromUserGesture !== false
    if (!opts.retry && props.consumePlaybackGesture) {
      fromGesture = props.consumePlaybackGesture() || fromGesture
    }
    startPracticePlayback(controller, { fromUserGesture: fromGesture })
  }

  function scheduleMidiPlayback(delayMs, options) {
    if (midiPlayTimerRef.current) {
      clearTimeout(midiPlayTimerRef.current)
    }
    midiPlayTimerRef.current = setTimeout(function() {
      midiPlayTimerRef.current = null
      tryStartMidiPlayback(options)
    }, delayMs)
  }
  function tryStartMediaPlayback(options) {
    const controller = mediaControllerRef.current
    if (!props.active || !controller || !isMediaRoute) return
    const opts = options || {}
    if (controller.tapToPlay) return
    let useGesture = opts.fromUserGesture !== false
    if (useGesture && props.hasPlaybackGesture && props.hasPlaybackGesture()) {
      if (!controller.isLoading) {
        useGesture = props.consumePlaybackGesture()
      }
    } else if (useGesture && !opts.retry && props.consumePlaybackGesture) {
      useGesture = props.consumePlaybackGesture()
    }
    startPracticePlayback(controller, { fromUserGesture: useGesture })
  }

  function scheduleMediaPlayback(delayMs, options) {
    if (mediaPlayTimerRef.current) {
      clearTimeout(mediaPlayTimerRef.current)
    }
    mediaPlayTimerRef.current = setTimeout(function() {
      mediaPlayTimerRef.current = null
      tryStartMediaPlayback(options)
    }, delayMs)
  }

  useEffect(function() {
    if (!props.active || !tune || !step || step.type !== 'tune' || !isMediaRoute) {
      return undefined
    }
    scheduleMediaPlayback(PRACTICE_MEDIA_PLAY_DELAY_MS, { fromUserGesture: true })
    return function() {
      clearMediaTimers()
    }
  }, [props.active, tune, step, isMediaRoute, props.stepIndex])

  useEffect(function() {
    if (!props.active || !tune || !step || step.type !== 'tune' || isMediaRoute) {
      return undefined
    }
    scheduleMidiPlayback(PRACTICE_MIDI_PLAY_DELAY_MS, { fromUserGesture: true })
    midiRetryTimerRef.current = setInterval(function() {
      const controller = mediaControllerRef.current
      if (!controller || rampNotifiedRef.current) return
      if (controller.isPlaying || controller.isLoading || controller.tapToPlay) return
      tryStartMidiPlayback({ fromUserGesture: true, retry: true })
    }, PRACTICE_MIDI_RETRY_MS)
    return function() {
      clearMidiTimers()
    }
  }, [props.active, tune, step, isMediaRoute, props.stepIndex])

  function handleMediaEngineReady() {
    if (!props.active || !isMediaRoute || !mediaController) return
    if (rampNotifiedRef.current || mediaController.isPlaying || mediaController.tapToPlay) return
    tryStartMediaPlayback({ fromUserGesture: true, retry: true })
  }

  useEffect(function() {
    if (!props.active || !mediaController || !mediaController.isPlaying) return
    clearMediaTimers()
    clearMidiTimers()
    if (rampNotifiedRef.current) return
    rampNotifiedRef.current = true
    if (props.onPlaybackStarted) props.onPlaybackStarted()
  }, [props.active, mediaController, mediaController && mediaController.isPlaying, props.onPlaybackStarted])

  if (!props.active || !tune || !step || step.type !== 'tune' || !mediaController) {
    return null
  }

  function handlePlaybackStarted() {
    if (rampNotifiedRef.current) return
    rampNotifiedRef.current = true
    if (props.onPlaybackStarted) props.onPlaybackStarted()
  }

  function handleEnded() {
    if (mediaController.onEnded) {
      mediaController.onEnded()
    }
  }

  return (
    <div className="practice-session-playback-host" aria-hidden="true">
      {isMediaRoute ? (
        <MediaPlayerMedia
          key={'practice-media-' + tune.id + '-' + props.stepIndex + '-' + sessionGeneration}
          mediaController={mediaController}
          tunebook={tunebook}
          tune={tune}
          routePlayState={routePlayState}
          routeMediaLinkNumber={routeMediaLinkNumber}
          suppressAutostart={true}
          suppressTapModal={true}
          onMediaEngineReady={handleMediaEngineReady}
          instanceId="practice"
          compactPlayer={true}
        />
      ) : (
        <Abc
          key={'practice-tune-' + tune.id + '-' + props.stepIndex + '-' + sessionGeneration}
          mediaController={mediaController}
          tunebook={tunebook}
          abc={staffDisplayAbc}
          meter={tune.meter}
          autoPrime={true}
          autoStart={false}
          metronomeCountIn={true}
          editableTempo={false}
          repeat={tune.repeats > 0 ? tune.repeats : 1}
          hideSvg={true}
          hidePlayer={true}
          suppressPlaybackVisuals={true}
          onStarted={handlePlaybackStarted}
          onEnded={handleEnded}
        />
      )}
    </div>
  )
}
