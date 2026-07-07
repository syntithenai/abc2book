import React from 'react';
import { beatToX } from '../notation/pianoRollGeometry';

export default function PianoRollWaveform(props) {
  const { peaks, width, height, durationSeconds, beatTimes, tempo, beatWidth } = props;
  if (!peaks || !peaks.length || !durationSeconds) return null;

  const maxBeat = width / beatWidth;
  const totalBeats = beatTimes && beatTimes.length
    ? beatTimes.length
    : durationSeconds * (tempo || 120) / 60;

  const path = peaks.map(function(peak, i) {
    const frac = i / peaks.length;
    const beat = frac * totalBeats;
    const x = beatToX(Math.min(beat, maxBeat), beatWidth);
    const yMax = height / 2 - peak.max * (height / 2 - 2);
    const yMin = height / 2 - peak.min * (height / 2 - 2);
    return (i === 0 ? 'M' : 'L') + x + ',' + yMax + ' L' + x + ',' + yMin;
  }).join(' ');

  return (
    <g className="piano-roll-waveform-layer">
      <rect x={0} y={0} width={width} height={height} className="piano-roll-waveform-bg" />
      <path d={path} className="piano-roll-waveform-path" />
    </g>
  );
}

export function waveformHeight() {
  return 48;
}
