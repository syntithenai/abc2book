import React from 'react';
import { beatsPerBarFromMeter } from '../notation/beatGrid';
import { beatToX } from '../notation/pianoRollGeometry';

export default function PianoRollRuler(props) {
  const { width, beatsPerBar, beatWidth, numBars, onSeekBeat } = props;

  return (
    <svg className="piano-roll-ruler" width={width} height={22} onClick={function(e) {
      if (!onSeekBeat) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      onSeekBeat(x / beatWidth);
    }}>
      {Array.from({ length: numBars + 1 }).map(function(_, i) {
        const x = beatToX(i * beatsPerBar, beatWidth);
        return (
          <g key={'ruler-bar-' + i}>
            <line x1={x} y1={14} x2={x} y2={22} className="piano-roll-ruler-bar" />
            <text x={x + 4} y={12} className="piano-roll-ruler-label">{i + 1}</text>
          </g>
        );
      })}
    </svg>
  );
}
