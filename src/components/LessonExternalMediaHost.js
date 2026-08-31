import { useEffect, useRef } from 'react'
import SafeYouTube from './SafeYouTube'
import {
  isQueueActive,
  getCurrentItem,
  isExternalQueueItem,
  isLessonQueue,
} from '../nowPlayingQueue'
import { handleQueueAdvanceOnEnded } from '../nowPlayingQueuePlayback'
import {
  setLessonYoutubePlayer,
  clearLessonYoutubePlayer,
  lessonYoutubeWantsPlay,
  handleLessonYoutubeStateChange,
  playLessonYoutube,
} from '../lessonYoutubePlayer'

function lessonYoutubeOpts() {
  const origin = typeof window !== 'undefined' && window.location && window.location.origin
    ? window.location.origin
    : ''
  return {
    width: '1',
    height: '1',
    playerVars: {
      autoplay: lessonYoutubeWantsPlay() ? 1 : 0,
      controls: 0,
      enablejsapi: 1,
      modestbranding: 1,
      rel: 0,
      origin: origin,
    },
  }
}

/**
 * Plays YouTube tracks for lesson queues (no tunebook records).
 */
export default function LessonExternalMediaHost(props) {
  const queue = props.nowPlayingQueue
  const item = isQueueActive(queue) ? getCurrentItem(queue) : null
  const external = item && isExternalQueueItem(item) ? item.externalMedia : null
  const playerRef = useRef(null)
  const readyRef = useRef(false)
  const videoKey = external && external.youtubeId
    ? external.youtubeId + ':' + (queue && queue.currentIndex != null ? queue.currentIndex : 0)
    : 'none'

  useEffect(function() {
    readyRef.current = false
    return function() {
      clearLessonYoutubePlayer(playerRef.current)
      playerRef.current = null
      readyRef.current = false
    }
  }, [videoKey])

  useEffect(function() {
    if (!isLessonQueue(queue) || !external || !external.youtubeId) return
    if (lessonYoutubeWantsPlay()) {
      playLessonYoutube({ fromUserGesture: true })
    }
  }, [queue, external && external.youtubeId, videoKey])

  if (!isLessonQueue(queue) || !external || !external.youtubeId) {
    return null
  }

  function onEnded() {
    if (!props.setNowPlayingQueue || !queue) return
    handleQueueAdvanceOnEnded({
      queue: queue,
      setQueue: props.setNowPlayingQueue,
      tunes: props.tunes || {},
      tunebook: props.tunebook,
      mediaController: props.mediaController,
      navigate: props.navigate,
      location: props.location,
      setPlaylist: props.setPlaylist,
      practiceSessionActive: props.practiceSessionActive,
      failCallback: props.onQueueEnd,
    })
  }

  return (
    <div className="lesson-external-media-host" aria-hidden="true">
      <SafeYouTube
        key={videoKey}
        videoId={external.youtubeId}
        opts={lessonYoutubeOpts()}
        onReady={function(event) {
          playerRef.current = event.target
          readyRef.current = true
          setLessonYoutubePlayer(event.target)
        }}
        onStateChange={function(event) {
          handleLessonYoutubeStateChange(event && event.data)
        }}
        onEnd={onEnded}
        onError={function() {
          if (!readyRef.current) return
          window.setTimeout(function() {
            if (props.setNowPlayingQueue && queue) onEnded()
          }, 400)
        }}
      />
    </div>
  )
}
