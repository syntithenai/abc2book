import { useEffect, useRef } from 'react'
import YouTube from 'react-youtube'
import {
  getCurrentItem,
  isExternalQueueItem,
  isLessonQueue,
  isQueueActive,
} from '@app/nowPlayingQueue'
import { getQueueItemLabel } from '@app/nowPlayingQueue'
import {
  clearLessonYoutubePlayer,
  handleLessonYoutubeStateChange,
  lessonYoutubeWantsPlay,
  playLessonYoutube,
  setLessonYoutubePlayer,
} from '@app/lessonYoutubePlayer'

function lessonYoutubeOpts() {
  const origin = typeof window !== 'undefined' && window.location && window.location.origin
    ? window.location.origin
    : ''
  return {
    width: '100%',
    height: '200',
    playerVars: {
      autoplay: lessonYoutubeWantsPlay() ? 1 : 0,
      controls: 1,
      enablejsapi: 1,
      modestbranding: 1,
      rel: 0,
      origin: origin,
    },
  }
}

export default function LessonPreviewMediaPanel(props) {
  const queue = props.nowPlayingQueue
  const setQueue = props.setNowPlayingQueue
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
    return (
      <aside className="lesson-preview-media lesson-preview-media--empty">
        <h2 className="lesson-preview-media-title">Now playing</h2>
        <p className="text-muted small">Click a recording play button in the lesson to listen here.</p>
      </aside>
    )
  }

  const label = getQueueItemLabel(item, {})

  function handleEnded() {
    if (!setQueue || !queue || !queue.items || !queue.items.length) return
    const nextIndex = queue.currentIndex + 1
    if (nextIndex < queue.items.length) {
      setQueue(Object.assign({}, queue, { currentIndex: nextIndex }))
      playLessonYoutube({ fromUserGesture: true })
    }
  }

  return (
    <aside className="lesson-preview-media">
      <h2 className="lesson-preview-media-title">Now playing</h2>
      <p className="lesson-preview-media-label">{label}</p>
      <div className="lesson-preview-media-player">
        <YouTube
          key={videoKey}
          videoId={external.youtubeId}
          opts={lessonYoutubeOpts()}
          onReady={function(event) {
            playerRef.current = event.target
            readyRef.current = true
            setLessonYoutubePlayer(event.target)
            if (lessonYoutubeWantsPlay()) {
              playLessonYoutube({ fromUserGesture: true })
            }
          }}
          onStateChange={function(event) {
            handleLessonYoutubeStateChange(event)
            if (event && event.data === 0) handleEnded()
          }}
          onEnd={handleEnded}
        />
      </div>
    </aside>
  )
}
