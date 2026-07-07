import React from 'react';
import { midiToY } from '../notation/pianoRollGeometry';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export default function PianoRollPianoKeys(props) {
  const { pitchRange, rowHeight, height, onAuditionMidi } = props;

  const rows = [];
  for (let midi = pitchRange.max; midi >= pitchRange.min; midi -= 1) {
    const isBlack = [1, 3, 6, 8, 10].indexOf(midi % 12) >= 0;
    rows.push({ midi: midi, y: midiToY(midi, pitchRange, rowHeight), isBlack: isBlack });
  }

  return (
    <svg className="piano-roll-keys" width={44} height={height}>
      {rows.map(function(row) {
        const label = row.midi % 12 === 0 ? NOTE_NAMES[0] + Math.floor(row.midi / 12 - 1) : '';
        return (
          <g key={'key-' + row.midi}>
            <rect
              x={0}
              y={row.y}
              width={44}
              height={rowHeight - 1}
              className={'piano-roll-key' + (row.isBlack ? ' black' : ' white')}
              onClick={function() { if (onAuditionMidi) onAuditionMidi(row.midi); }}
            />
            {label ? (
              <text x={4} y={row.y + rowHeight - 4} className="piano-roll-key-label">{label}</text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
