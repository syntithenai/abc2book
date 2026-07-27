import { useEffect, useState } from 'react'
import { PLAYBACK_VOLUME_MAX, PLAYBACK_VOLUME_MIN } from '../playbackVolumeSettings'
import './PlaybackVolumeSlider.css'

export default function PlaybackVolumeSlider({ mediaController, className, compact, volumeIcon }) {
  const [volume, setVolume] = useState(
    mediaController && typeof mediaController.playbackVolume === 'number'
      ? mediaController.playbackVolume
      : 1
  )

  useEffect(function() {
    if (!mediaController) return undefined
    setVolume(typeof mediaController.playbackVolume === 'number' ? mediaController.playbackVolume : 1)
  }, [mediaController, mediaController && mediaController.playbackVolume])

  if (!mediaController || !mediaController.setPlaybackVolume) return null

  function handleChange(event) {
    const next = parseFloat(event.target.value)
    if (isNaN(next)) return
    const applied = mediaController.setPlaybackVolume(next)
    setVolume(applied)
  }

  return (
    <label
      className={'playback-volume-slider' + (compact ? ' playback-volume-slider--compact' : '') + (className ? ' ' + className : '')}
      title="Volume"
      aria-label="Volume"
    >
      <span className="playback-volume-slider-icon" aria-hidden="true">
        {volumeIcon || '🔊'}
      </span>
      <input
        type="range"
        className="playback-volume-slider-input"
        data-testid="playback-volume-slider"
        min={PLAYBACK_VOLUME_MIN}
        max={PLAYBACK_VOLUME_MAX}
        step="0.05"
        value={volume}
        onChange={handleChange}
        onInput={handleChange}
      />
    </label>
  )
}
