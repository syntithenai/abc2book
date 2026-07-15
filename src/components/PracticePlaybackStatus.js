import { useEffect, useRef } from 'react'

function statusText(label, compact) {
  if (!compact) return label
  if (label === 'Press Start to play') return 'Start'
  if (label === 'Tap to allow playback') return 'Tap play'
  if (label === 'Buffering…') return 'Buffering'
  if (label.indexOf('Loading audio') !== -1) return 'Loading'
  if (label.indexOf('Rep ') === 0 && label.indexOf('Playing') !== -1) {
    return label.replace('Playing', 'Play')
  }
  return label
}

export default function PracticePlaybackStatus(props) {
  const tunebook = props.tunebook
  const stepType = props.stepType
  const warmupStatus = props.warmupStatus || 'idle'
  const mediaController = props.mediaController
  const compact = !!props.compact
  const playbackEstablishedRef = useRef(false)

  useEffect(function() {
    playbackEstablishedRef.current = false
  }, [props.stepIndex, props.currentStep && props.currentStep.tuneId])

  useEffect(function() {
    if (mediaController && mediaController.isPlaying) {
      playbackEstablishedRef.current = true
    }
  }, [mediaController, mediaController && mediaController.isPlaying])

  let label = 'Ready'
  let icon = null
  let statusClass = 'practice-playback-status--idle'

  if (props.userPaused) {
    label = 'Paused'
    icon = tunebook.icons.pause
    statusClass = 'practice-playback-status--idle'
  } else if (stepType === 'warmup') {
    const repLabel = props.warmupRun != null && props.warmupRepeats != null
      ? ('Rep ' + props.warmupRun + ' of ' + props.warmupRepeats + ' — ')
      : ''
    if (warmupStatus === 'countIn') {
      const beat = props.countInBeat != null ? props.countInBeat : 0
      const total = props.countInTotal != null ? props.countInTotal : 0
      const remaining = total > 0 ? Math.max(1, total - beat + 1) : 0
      label = total > 0
        ? ('Count-in ' + remaining)
        : 'Count-in…'
      icon = tunebook.icons.waiting
      statusClass = 'practice-playback-status--countin'
    } else if (warmupStatus === 'loading') {
      label = repLabel + 'Loading audio…'
      icon = tunebook.icons.waiting
      statusClass = 'practice-playback-status--loading'
    } else if (warmupStatus === 'playing') {
      label = repLabel + 'Playing'
      icon = tunebook.icons.play
      statusClass = 'practice-playback-status--playing'
    } else if (warmupStatus === 'waiting') {
      label = 'Tap to allow playback'
      icon = tunebook.icons.waiting
      statusClass = 'practice-playback-status--loading'
    } else {
      label = 'Ready'
      icon = tunebook.icons.pause
      statusClass = 'practice-playback-status--idle'
    }
  } else if (stepType === 'tune' && mediaController) {
    const isMediaStep = !!(props.currentStep && props.currentStep.route === 'media')
    const hasIntent = !!(mediaController.hasPlayingIntent && mediaController.hasPlayingIntent())
    const waitingToStart = !playbackEstablishedRef.current
      && hasIntent
      && !mediaController.isPlaying
      && !mediaController.tapToPlay
    const showAsPlaying = mediaController.isPlaying
      || (playbackEstablishedRef.current && hasIntent && !mediaController.tapToPlay)
    if (mediaController.tapToPlay) {
      label = 'Tap to allow playback'
      icon = tunebook.icons.waiting
      statusClass = 'practice-playback-status--loading'
    } else if (showAsPlaying) {
      label = 'Playing'
      icon = tunebook.icons.play
      statusClass = 'practice-playback-status--playing'
    } else if (mediaController.isLoading || waitingToStart) {
      label = 'Buffering…'
      icon = tunebook.icons.waiting
      statusClass = 'practice-playback-status--loading'
    } else if (isMediaStep) {
      label = 'Press Start to play'
      icon = tunebook.icons.pause
      statusClass = 'practice-playback-status--idle'
    } else {
      label = 'Ready'
      icon = tunebook.icons.pause
      statusClass = 'practice-playback-status--idle'
    }
  }

  const displayLabel = statusText(label, compact)

  return (
    <div
      className={'practice-playback-status' + (compact ? ' practice-playback-status--compact' : '') + ' ' + statusClass}
      aria-live="polite"
      title={displayLabel !== label ? label : undefined}
    >
      {icon ? <span className="practice-playback-status-icon" aria-hidden="true">{icon}</span> : null}
      <span className="practice-playback-status-label">{displayLabel}</span>
    </div>
  )
}
