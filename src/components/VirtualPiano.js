import React, { useState } from 'react';
import { pitchFromMidi } from '../notation/notationActions';

const WHITE_KEYS = [
  { midi: 60, label: 'C' }, { midi: 62, label: 'D' }, { midi: 64, label: 'E' },
  { midi: 65, label: 'F' }, { midi: 67, label: 'G' }, { midi: 69, label: 'A' }, { midi: 71, label: 'B' },
  { midi: 72, label: 'c' }, { midi: 74, label: 'd' }, { midi: 76, label: 'e' },
  { midi: 77, label: 'f' }, { midi: 79, label: 'g' }, { midi: 81, label: 'a' }, { midi: 83, label: 'b' },
];

const BLACK_KEYS = [
  { midi: 61, left: 1 }, { midi: 63, left: 2 }, { midi: 66, left: 4 },
  { midi: 68, left: 5 }, { midi: 70, left: 6 }, { midi: 73, left: 8 },
  { midi: 75, left: 9 }, { midi: 78, left: 11 }, { midi: 80, left: 12 }, { midi: 82, left: 13 },
];

export default function VirtualPiano(props) {
  const { session, onPitch, midiActiveNotes } = props;
  const [octaveShift, setOctaveShift] = useState(0);
  const active = midiActiveNotes || {};

  function handleClick(midi, event) {
    const pitch = pitchFromMidi(midi + octaveShift * 12, session.tuneMeta);
    onPitch(pitch, event.shiftKey || session.chordBuild);
  }

  return (
    <div className={'virtual-piano virtual-piano-toolbar d-flex align-items-stretch gap-1'} data-testid="virtual-piano">
      <div className="virtual-piano-octave-controls d-flex flex-column gap-1">
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={function() { setOctaveShift(octaveShift - 1); }} title="Octave down" data-testid="virtual-piano-octave-down">◀ Oct</button>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={function() { setOctaveShift(octaveShift + 1); }} title="Octave up" data-testid="virtual-piano-octave-up">Oct ▶</button>
      </div>
      <div className="virtual-piano-keys flex-grow-1">
        {WHITE_KEYS.map(function(key) {
          const midi = key.midi + octaveShift * 12;
          return (
            <button
              key={key.midi}
              type="button"
              className={'virtual-piano-white' + (active[midi] ? ' active' : '')}
              onClick={function(e) { handleClick(key.midi, e); }}
            >{key.label}</button>
          );
        })}
        {BLACK_KEYS.map(function(key) {
          const midi = key.midi + octaveShift * 12;
          return (
            <button
              key={'b' + key.midi}
              type="button"
              className={'virtual-piano-black' + (active[midi] ? ' active' : '')}
              style={{ left: 'calc(' + (key.left * 100 / 14) + '% - 10px)' }}
              onClick={function(e) { handleClick(key.midi, e); }}
            />
          );
        })}
      </div>
    </div>
  );
}
