import YouTube from 'react-youtube'
import { useEffect, useRef } from 'react'
import { installYoutubeDetachedPlayerErrorHandlers, isYoutubeDetachedPlayerError } from '../youtubePlayerErrors'

installYoutubeDetachedPlayerErrorHandlers()

export default function SafeYouTube(props) {
  const mountedRef = useRef(true)
  const videoId = props.videoId

  useEffect(function() {
    mountedRef.current = true
    return function() {
      mountedRef.current = false
    }
  }, [])

  if (!videoId) return null

  function wrapHandler(name) {
    const handler = props[name]
    if (!handler) return undefined
    return function(event) {
      if (!mountedRef.current) return
      try {
        return handler(event)
      } catch (err) {
        if (!isYoutubeDetachedPlayerError(err)) throw err
      }
    }
  }

  const {
    onReady,
    onError,
    onStateChange,
    onPlay,
    onPause,
    onEnd,
    onPlaybackRateChange,
    onPlaybackQualityChange,
    ...rest
  } = props

  return (
    <YouTube
      {...rest}
      videoId={videoId}
      onReady={wrapHandler('onReady')}
      onError={wrapHandler('onError')}
      onStateChange={wrapHandler('onStateChange')}
      onPlay={wrapHandler('onPlay')}
      onPause={wrapHandler('onPause')}
      onEnd={wrapHandler('onEnd')}
      onPlaybackRateChange={wrapHandler('onPlaybackRateChange')}
      onPlaybackQualityChange={wrapHandler('onPlaybackQualityChange')}
    />
  )
}
