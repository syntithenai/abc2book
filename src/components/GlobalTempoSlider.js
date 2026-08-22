import { useSyncExternalStore } from 'react'
import { ButtonGroup } from 'react-bootstrap'
import {
  GLOBAL_TEMPO_PERCENT_MAX,
  GLOBAL_TEMPO_PERCENT_MIN,
  getGlobalTempoLastPercent,
  getGlobalTempoPercent,
  setGlobalTempoPercent,
  subscribeGlobalTempo,
} from '../globalTempoSettings'
import './GlobalTempoSlider.css'

export default function GlobalTempoSlider({ mediaController }) {
  const percent = useSyncExternalStore(subscribeGlobalTempo, getGlobalTempoPercent)
  const enabled = percent > 0
  const displayPercent = enabled ? percent : getGlobalTempoLastPercent()

  function applyPercent(nextPercent) {
    if (mediaController && mediaController.setGlobalPlaybackTempo) {
      mediaController.setGlobalPlaybackTempo(nextPercent)
      return
    }
    setGlobalTempoPercent(nextPercent)
  }

  function handleEnabledChange(event) {
    if (event.target.checked) {
      applyPercent(getGlobalTempoLastPercent())
      return
    }
    applyPercent(0)
  }

  function handleSliderChange(event) {
    applyPercent(parseFloat(event.target.value))
  }

  return (
    <ButtonGroup
      size="sm"
      className="global-tempo-slider global-tempo-slider--group"
      aria-label="Tempo override"
    >
      <input
        type="checkbox"
        className="form-check-input global-tempo-slider-enable"
        checked={enabled}
        onChange={handleEnabledChange}
        data-testid="global-tempo-enable"
        aria-label="Enable tempo override"
      />
      <span className="global-tempo-slider-label">Tempo</span>
      <input
        type="range"
        min={GLOBAL_TEMPO_PERCENT_MIN}
        max={GLOBAL_TEMPO_PERCENT_MAX}
        step="1"
        value={displayPercent}
        disabled={!enabled}
        onChange={handleSliderChange}
        onInput={handleSliderChange}
        className="global-tempo-slider-input"
        data-testid="global-tempo-slider"
        aria-label="Tempo"
      />
      <span className="global-tempo-slider-value" data-testid="global-tempo-value">
        {displayPercent}
      </span>
    </ButtonGroup>
  )
}
