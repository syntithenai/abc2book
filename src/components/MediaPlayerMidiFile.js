import { useEffect, useRef, useState } from 'react'
import useMidiFilePlayback from '../useMidiFilePlayback'
import { resolveMidiLinkPlaybackData } from '../midiLinkResolve'
import { resolveLinkPlaybackSrcType } from '../mediaLinkSrcType'

function flushMountedPendingMidiPlay(mc) {
  const pending = mc.pendingMidiFilePlayRef && mc.pendingMidiFilePlayRef.current
  if (!pending || !mc.hasActivePlaybackIntent || !mc.hasActivePlaybackIntent()) return
  if (typeof mc.flushPendingMidiFilePlay === 'function') {
    mc.flushPendingMidiFilePlay()
  }
}

export default function MediaPlayerMidiFile(props) {
  const mediaController = props.mediaController
  const tunebook = props.tunebook
  const tune = props.tune
  const routePlayState = props.routePlayState
  const routeMediaLinkNumber = props.routeMediaLinkNumber
  const suppressAutostart = props.suppressAutostart

  const mediaControllerRef = useRef(mediaController)
  mediaControllerRef.current = mediaController

  const [lastTuneId, setLastTuneId] = useState('')
  const [lastMediaLinkNumber, setLastMediaLinkNumber] = useState('')
  const [lastPlayState, setLastPlayState] = useState('')
  const pendingPlayRef = useRef(false)
  const loadedKeyRef = useRef('')

  const playback = useMidiFilePlayback({
    onLoading: function(loading) {
      const mc = mediaControllerRef.current
      if (mc && mc.setIsLoading) mc.setIsLoading(!!loading)
    },
    onReady: function(songDuration, readyMeta) {
      const mc = mediaControllerRef.current
      const audioBlocked = !!(readyMeta && readyMeta.audioBlocked)
      if (mc && mc.setDuration) mc.setDuration(songDuration || 0)
      if (mc && mc.setIsReady) mc.setIsReady(true)
      if (mc && mc.onMediaReady) mc.onMediaReady()
      if (!audioBlocked && pendingPlayRef.current && mc && mc.hasActivePlaybackIntent && mc.hasActivePlaybackIntent()) {
        pendingPlayRef.current = false
        playback.start().then(function(ok) {
          if (ok) {
            if (mc.setIsPlaying) mc.setIsPlaying(true)
            if (mc.setIsLoading) mc.setIsLoading(false)
          } else if (mc.setTapToPlay) {
            mc.setTapToPlay(true)
            if (mc.setIsPlaying) mc.setIsPlaying(false)
            if (mc.setIsLoading) mc.setIsLoading(false)
          }
        })
      } else if (mc && mc.setIsLoading) {
        mc.setIsLoading(false)
      }
    },
    onEnded: function() {
      const mc = mediaControllerRef.current
      if (mc && mc.onEnded) mc.onEnded()
    },
    onError: function(message) {
      const mc = mediaControllerRef.current
      if (message && mc && mc.setTapToPlay) {
        mc.setTapToPlay(true)
      }
      if (mc && mc.onError) mc.onError(message)
      if (mc && mc.setIsLoading) mc.setIsLoading(false)
    },
    onTimeUpdate: function(seconds) {
      const mc = mediaControllerRef.current
      if (mc && mc.setCurrentTime) mc.setCurrentTime(seconds)
      const total = playback.duration()
      if (mc && mc.setClickSeek && total > 0) {
        mc.setClickSeek(Math.min(1, seconds / total))
      }
    },
  })

  const playbackRef = useRef(playback)
  playbackRef.current = playback

  useEffect(function() {
    const mc = mediaControllerRef.current
    if (!mc || !mc.playMidiFileRef) return undefined

    mc.playMidiFileRef.current = async function(opts) {
      const engine = playbackRef.current
      if (!engine.isReadyRef.current) {
        pendingPlayRef.current = true
        return false
      }
      const ok = await engine.start()
      if (ok && mc.setIsPlaying) mc.setIsPlaying(true)
      if (!ok && mc.setTapToPlay) mc.setTapToPlay(true)
      if (ok && mc.setIsLoading) mc.setIsLoading(false)
      if (!ok && mc.setIsLoading) mc.setIsLoading(false)
      return ok
    }

    mc.pauseMidiFileRef.current = function() {
      playbackRef.current.pause()
    }

    mc.stopMidiFileRef.current = function() {
      playbackRef.current.stop()
    }

    mc.seekMidiFileRef.current = function(seconds) {
      return playbackRef.current.seek(seconds)
    }

    mc.getMidiFilePlaybackSecondsRef.current = function() {
      return playbackRef.current.currentTime()
    }

    mc.applyMidiFileTempoRef.current = function(tempo) {
      playbackRef.current.setTempo(tempo)
    }

    mc.prepareMidiFileLinkRef.current = async function(useTune, linkIndex, src, opts) {
      const link = useTune && useTune.links ? useTune.links[linkIndex] : null
      if (!link) throw new Error('MIDI link is not available')
      const key = useTune.id + ':' + linkIndex + ':' + (src || link.link)
      if (loadedKeyRef.current === key && playbackRef.current.isReadyRef.current) {
        return true
      }
      const resolveOpts = (mc.getLinkedMediaResolveOptions && mc.getLinkedMediaResolveOptions())
        || (opts || {})
      const resolved = await resolveMidiLinkPlaybackData(link, useTune.id, linkIndex, {
        accessToken: resolveOpts.accessToken,
        driveApi: resolveOpts.driveApi,
        isYoutubeLink: tunebook && tunebook.utils && tunebook.utils.isYoutubeLink,
      })
      await playbackRef.current.init(resolved.arrayBuffer)
      loadedKeyRef.current = key
      return true
    }

    mc.resumeMidiFileAudioContextRef.current = function() {
      playbackRef.current.resumeAudioContextFromGesture()
    }

    // Playback was requested before this engine mounted (common on /editor/).
    flushMountedPendingMidiPlay(mc)

    return function() {
      if (mc.playMidiFileRef) mc.playMidiFileRef.current = null
      if (mc.pauseMidiFileRef) mc.pauseMidiFileRef.current = null
      if (mc.seekMidiFileRef) mc.seekMidiFileRef.current = null
      if (mc.getMidiFilePlaybackSecondsRef) mc.getMidiFilePlaybackSecondsRef.current = null
      if (mc.applyMidiFileTempoRef) mc.applyMidiFileTempoRef.current = null
      if (mc.prepareMidiFileLinkRef) mc.prepareMidiFileLinkRef.current = null
      if (mc.resumeMidiFileAudioContextRef) mc.resumeMidiFileAudioContextRef.current = null
      if (mc.stopMidiFileRef) mc.stopMidiFileRef.current = null
    }
  }, [tunebook])

  const tuneId = tune ? tune.id : null
  const mediaLinkNumberParam = routeMediaLinkNumber != null ? routeMediaLinkNumber : '0'
  const playState = routePlayState

  useEffect(function() {
    const mc = mediaControllerRef.current
    if (!tune || !mc || !mc.applyPlaybackRoute) return undefined
    if (playState !== 'playMedia') return undefined
    if (mc.notationMidiOwner) return undefined
    if (mc.requestedPlayState === 'playMidi') return undefined
    if (mc.playbackRouteMode === 'midi') return undefined
    if (mc.isMidiPlaybackRoute && mc.isMidiPlaybackRoute()) return undefined

    const route = mc.applyPlaybackRoute(playState, mediaLinkNumberParam, tune, tunebook)
    const linkIndex = route.mediaLinkNumber
    const link = tune.links && tune.links[linkIndex] ? tune.links[linkIndex] : null
    const srcType = link
      ? resolveLinkPlaybackSrcType(link, tunebook && tunebook.utils && tunebook.utils.isYoutubeLink)
      : 'empty'
    if (srcType !== 'midifile') return undefined

    let changeType = null
    if (tune.id !== lastTuneId) {
      changeType = 'tune'
      mc.setTune(tune)
      mc.setCurrentTime(0)
      mc.setClickSeek(0)
      mc.setDuration(0)
      mc.cleanupTimers()
      loadedKeyRef.current = ''
      if (mc.prepareMidiFileLinkRef && mc.prepareMidiFileLinkRef.current) {
        mc.setIsLoading(true)
        const resolveOpts = mc.getLinkedMediaResolveOptions ? mc.getLinkedMediaResolveOptions() : {}
        mc.prepareMidiFileLinkRef.current(tune, linkIndex, route.src, resolveOpts).catch(function(err) {
          if (mc.onError) mc.onError(err && err.message ? err.message : 'Failed to load MIDI')
        })
      }
    } else if (String(linkIndex) !== String(lastMediaLinkNumber)) {
      changeType = 'link'
      mc.setCurrentTime(0)
      mc.setClickSeek(0)
      mc.setDuration(0)
      mc.cleanupTimers()
      loadedKeyRef.current = ''
      if (mc.prepareMidiFileLinkRef && mc.prepareMidiFileLinkRef.current) {
        mc.setIsLoading(true)
        const resolveOpts = mc.getLinkedMediaResolveOptions ? mc.getLinkedMediaResolveOptions() : {}
        mc.prepareMidiFileLinkRef.current(tune, linkIndex, route.src, resolveOpts).catch(function(err) {
          if (mc.onError) mc.onError(err && err.message ? err.message : 'Failed to load MIDI')
        })
      }
    } else if (playState !== lastPlayState) {
      changeType = 'playState'
    }

    if (changeType && !suppressAutostart) {
      let consumed = false
      if (mc.consumePendingPlayRequest) {
        consumed = mc.consumePendingPlayRequest(tune.id, playState, route.mediaLinkNumber)
      }
      if (!consumed && mc.maybeAutostart) {
        mc.maybeAutostart(playState, changeType, tune.id !== lastTuneId)
      }
    }

    setLastTuneId(tune.id)
    setLastMediaLinkNumber(String(route.mediaLinkNumber))
    setLastPlayState(playState)
    return undefined
  }, [
    tuneId,
    mediaLinkNumberParam,
    playState,
    tune,
    tunebook,
    lastTuneId,
    lastMediaLinkNumber,
    lastPlayState,
    suppressAutostart,
  ])

  return null
}
