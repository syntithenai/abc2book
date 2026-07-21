import React from 'react'
import { centsForNeedle } from './tunerDisplayUtils'

function majorStepForRange(range) {
  if (range <= 6) return 1
  if (range <= 12) return 2
  if (range <= 25) return 5
  return 10
}

function tickPosition(cents, range) {
  return ((cents + range) / (range * 2)) * 100
}

export default function TunerFineScale(props) {
  const range = props.halfRange > 0 ? props.halfRange : 50
  const majorStep = majorStepForRange(range)
  const ticks = []
  for (let c = -range; c <= range + 0.001; c += majorStep) {
    ticks.push(Math.round(c * 10) / 10)
  }

  const visualCents = centsForNeedle(props.cents, range)
  const needleLeft = visualCents != null && Number.isFinite(visualCents)
    ? tickPosition(visualCents, range)
    : null

  return (
    <div className="tuner-fine-scale" aria-hidden={props.cents == null ? 'true' : undefined}>
      <div className="tuner-fine-scale-labels">
        <span>Flat</span>
        <span>0</span>
        <span>Sharp</span>
      </div>
      <div className="tuner-fine-scale-track">
        <div className="tuner-fine-scale-in-tune" />
        {ticks.map(function(c) {
          const isCenter = c === 0
          const isMajor = c % (majorStep * 2) === 0 || majorStep >= range
          return (
            <div
              key={c}
              className={
                'tuner-fine-scale-tick'
                + (isCenter ? ' tuner-fine-scale-tick-center' : '')
                + (isMajor ? ' tuner-fine-scale-tick-major' : '')
              }
              style={{ left: tickPosition(c, range) + '%' }}
            >
              {isMajor || isCenter ? (
                <span className="tuner-fine-scale-tick-label">{Math.round(c)}</span>
              ) : null}
            </div>
          )
        })}
        {needleLeft != null ? (
          <div
            className="tuner-fine-scale-needle"
            style={{ left: needleLeft + '%' }}
          />
        ) : null}
      </div>
    </div>
  )
}
