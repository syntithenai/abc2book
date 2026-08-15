import { useSyncExternalStore } from 'react'
import { Button } from 'react-bootstrap'
import {
  GLOBAL_TEMPO_PERCENT_MAX,
  formatGlobalTempoDisplay,
  getGlobalTempoPercent,
  setGlobalTempoPercent,
  subscribeGlobalTempo,
} from '../globalTempoSettings'
import './GlobalTempoSlider.css'

const presets = [
  { label: 'Off', percent: 0 },
  { label: 'Slow 75%', percent: 75 },
  { label: '100%', percent: 100 },
  { label: 'Fast 125%', percent: 125 },
]

export default function GlobalTempoSlider({ mediaController }) {
  const percent = useSyncExternalStore(subscribeGlobalTempo, getGlobalTempoPercent)
  const active = percent > 0

  function applyPercent(nextPercent) {
    if (mediaController && mediaController.setGlobalPlaybackTempo) {
      mediaController.setGlobalPlaybackTempo(nextPercent)
      return
    }
    setGlobalTempoPercent(nextPercent)
  }

  function handleSliderChange(event) {
    applyPercent(parseFloat(event.target.value))
  }

  return (
    <div className="global-tempo-slider">
      <div className="global-tempo-slider-header">
        <h6>Playback tempo</h6>
        <span className="global-tempo-slider-value" data-testid="global-tempo-value">
          {formatGlobalTempoDisplay(percent)}
        </span>
      </div>
      <p className="global-tempo-slider-help">
        {active
          ? 'Every song plays at this speed. Song tempo sliders are ignored until this is Off.'
          : 'Off uses each song\'s own tempo. Drag away from Off to force a speed for everything.'}
      </p>
      <input
        type="range"
        min="0"
        max={GLOBAL_TEMPO_PERCENT_MAX}
        step="1"
        value={percent}
        onChange={handleSliderChange}
        className="global-tempo-slider-input"
        data-testid="global-tempo-slider"
        aria-label="Playback tempo"
      />
      <div className="global-tempo-slider-labels">
        <span>Off</span>
        <span>50%</span>
        <span>100%</span>
        <span>150%</span>
        <span>200%</span>
      </div>
      <div className="global-tempo-slider-presets">
        {presets.map(function(preset) {
          const selected = percent === preset.percent
          return (
            <Button
              key={preset.label}
              variant={selected ? 'primary' : 'outline-primary'}
              size="sm"
              onClick={function() { applyPercent(preset.percent) }}
            >
              {preset.label}
            </Button>
          )
        })}
      </div>
    </div>
  )
}
