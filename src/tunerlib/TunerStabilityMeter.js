import React from 'react'

export default function TunerStabilityMeter(props) {
  const stability = props.stabilityCents
  let label = '—'
  let quality = 'unknown'
  if (stability != null && Number.isFinite(stability)) {
    label = '±' + stability.toFixed(1) + '¢'
    if (stability <= 2) quality = 'good'
    else if (stability <= 5) quality = 'ok'
    else quality = 'poor'
  }

  return (
    <div className={'tuner-stability-meter tuner-stability-' + quality} title="Pitch stability (lower is steadier)">
      <span className="tuner-stability-label">Stability</span>
      <span className="tuner-stability-value">{label}</span>
    </div>
  )
}
