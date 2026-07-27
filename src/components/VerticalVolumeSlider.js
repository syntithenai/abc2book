import { useEffect, useState } from 'react'
import { PLAYBACK_VOLUME_MAX, PLAYBACK_VOLUME_MIN } from '../playbackVolumeSettings'
import './VerticalVolumeSlider.css'

export default function VerticalVolumeSlider({ mediaController, className }) {
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
      className={'vertical-volume-slider' + (className ? ' ' + className : '')}
      title="Volume"
      aria-label="Volume"
    >
      <input
        type="range"
        className="vertical-volume-slider-input"
        data-testid="vertical-volume-slider"
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
