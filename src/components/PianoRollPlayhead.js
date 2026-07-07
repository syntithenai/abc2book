import React from 'react';
import { beatToX } from '../notation/pianoRollGeometry';

export default function PianoRollPlayhead(props) {
  const { beat, beatWidth, height } = props;
  if (typeof beat !== 'number') return null;
  const x = beatToX(beat, beatWidth);
  return (
    <line
      x1={x}
      y1={0}
      x2={x}
      y2={height}
      className="piano-roll-playhead"
    />
  );
}
