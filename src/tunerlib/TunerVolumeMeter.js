import React, { useMemo } from 'react'
import { volumeSegmentColors } from './tunerDisplayUtils'

const SEGMENT_COUNT = 12

export default function TunerVolumeMeter(props) {
  const level = Math.max(0, Math.min(1, props.level || 0))
  const colors = useMemo(function() {
    return volumeSegmentColors(SEGMENT_COUNT)
  }, [])
  const activeCount = Math.round(level * SEGMENT_COUNT)

  return (
    <div className="tuner-volume-meter" aria-label="Input volume">
      <span className="tuner-volume-icon" aria-hidden="true">◯</span>
      <div className="tuner-volume-segments">
        {colors.map(function(color, index) {
          const filled = index < activeCount
          return (
            <span
              key={index}
              className={'tuner-volume-segment' + (filled ? ' filled' : '')}
              style={{ backgroundColor: filled ? color : '#e9ecef' }}
            />
          )
        })}
      </div>
    </div>
  )
}
