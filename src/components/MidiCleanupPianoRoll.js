import { useMemo } from 'react';
import PianoRollPianoKeys from './PianoRollPianoKeys';
import PianoRollRuler from './PianoRollRuler';
import { beatToX, midiToY, DEFAULT_BEAT_WIDTH, DEFAULT_ROW_HEIGHT } from '../notation/pianoRollGeometry';

function noteRects(notes, pitchRange, beatWidth, rowHeight, tempoBpm, variant) {
  const beatDuration = 60 / Math.max(tempoBpm || 120, 1);
  return (notes || []).map(function(note, index) {
    const startBeat = note.start / beatDuration;
    const endBeat = note.end / beatDuration;
    const width = Math.max(4, beatToX(Math.max(0.125, endBeat - startBeat), beatWidth));
    const x = beatToX(startBeat, beatWidth);
    const y = midiToY(note.midi, pitchRange, rowHeight);
    return (
      <rect
        key={variant + '-note-' + index}
        x={x}
        y={y + 1}
        width={width}
        height={rowHeight - 2}
        className={'midi-cleanup-note midi-cleanup-note-' + variant}
        rx={2}
      />
    );
  });
}

function buildPitchRange(notes) {
  const midis = (notes || []).map(function(n) { return n.midi; });
  if (!midis.length) return { min: 48, max: 72 };
  return {
    min: Math.max(0, Math.min.apply(null, midis) - 2),
    max: Math.min(127, Math.max.apply(null, midis) + 2),
  };
}

export default function MidiCleanupPianoRoll(props) {
  const beforeNotes = props.beforeNotes || [];
  const afterNotes = props.afterNotes || [];
  const tempoBpm = props.tempoBpm || 120;
  const beatWidth = props.beatWidth || DEFAULT_BEAT_WIDTH;
  const rowHeight = props.rowHeight || DEFAULT_ROW_HEIGHT;
  const beatsPerBar = props.beatsPerBar || 4;

  const pitchRange = useMemo(function() {
    return buildPitchRange(beforeNotes.concat(afterNotes));
  }, [beforeNotes, afterNotes]);

  const removedNotes = useMemo(function() {
    if (!props.showRemoved) return [];
    const afterSet = new Set(afterNotes.map(function(n) {
      return n.start + ':' + n.midi;
    }));
    return beforeNotes.filter(function(n) {
      return afterSet.has(n.start + ':' + n.midi) === false;
    });
  }, [beforeNotes, afterNotes, props.showRemoved]);

  const beatDuration = 60 / Math.max(tempoBpm, 1);
  const combined = beforeNotes.concat(afterNotes);
  const durationBeats = combined.reduce(function(max, note) {
    return Math.max(max, note.end / beatDuration);
  }, 4);
  const numBars = Math.max(1, Math.ceil(durationBeats / beatsPerBar));
  const width = beatToX(numBars * beatsPerBar, beatWidth);
  const height = (pitchRange.max - pitchRange.min + 1) * rowHeight;

  return (
    <div className="midi-cleanup-single-roll">
      <div className="small text-muted mb-1">
        Grey = before cleanup · Blue = after cleanup
      </div>
      <div className="midi-cleanup-pane-scroll">
        <div className="midi-cleanup-pane-inner" style={{ width: width + 44 }}>
          <div style={{ marginLeft: 44 }}>
            <PianoRollRuler
              width={width}
              beatsPerBar={beatsPerBar}
              beatWidth={beatWidth}
              numBars={numBars}
            />
          </div>
          <div className="d-flex">
            <PianoRollPianoKeys pitchRange={pitchRange} rowHeight={rowHeight} height={height} />
            <svg width={width} height={height} className="midi-cleanup-roll-svg">
              {noteRects(beforeNotes, pitchRange, beatWidth, rowHeight, tempoBpm, 'before')}
              {noteRects(removedNotes, pitchRange, beatWidth, rowHeight, tempoBpm, 'removed')}
              {noteRects(afterNotes, pitchRange, beatWidth, rowHeight, tempoBpm, 'after')}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
