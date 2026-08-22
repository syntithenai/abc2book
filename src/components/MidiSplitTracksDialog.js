import { useEffect, useMemo, useState } from 'react';
import { Button, Form, Modal } from 'react-bootstrap';
import { NotationPreview } from './SuggestionPreviewDialog';
import { buildPitchSplitPreviewAbc } from '../midiCleanupNotationPreview';
import { midiNoteName } from '../midiImportWizardState';

/** Choose a pitch cutoff and preview treble/bass halves before splitting a track. */
export default function MidiSplitTracksDialog(props) {
  const show = !!props.show;
  const notes = props.notes || [];
  const initialPitch = props.initialPitch != null ? props.initialPitch : 60;
  const [pitch, setPitch] = useState(initialPitch);

  useEffect(function() {
    if (show) setPitch(initialPitch);
  }, [show, initialPitch]);

  const range = useMemo(function() {
    let min = 127;
    let max = 0;
    notes.forEach(function(note) {
      const midi = Number(note.midi) || 0;
      if (midi < min) min = midi;
      if (midi > max) max = midi;
    });
    if (min > max) return { min: 36, max: 84, mid: 60 };
    return { min: min, max: max, mid: Math.round((min + max) / 2) };
  }, [notes]);

  const effectivePitch = Math.max(range.min + 1, Math.min(range.max, pitch || range.mid));

  const previewAbc = useMemo(function() {
    return buildPitchSplitPreviewAbc(notes, effectivePitch, {
      tempoBpm: props.tempoBpm || 120,
      meter: props.meter || '4/4',
      key: props.keySig || 'C',
      beatsPerBar: props.beatsPerBar || 4,
      slotsPerBeat: props.slotsPerBeat || 2,
      noteLength: props.noteLength || '1/8',
      quantStrength: props.quantStrength != null ? props.quantStrength : 0.7,
    });
  }, [notes, effectivePitch, props.tempoBpm, props.meter, props.keySig, props.beatsPerBar, props.slotsPerBeat, props.noteLength, props.quantStrength]);

  const highCount = notes.filter(function(n) { return (Number(n.midi) || 0) >= effectivePitch; }).length;
  const lowCount = notes.filter(function(n) { return (Number(n.midi) || 0) < effectivePitch; }).length;

  return (
    <Modal show={show} onHide={props.onHide} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title>Split track</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="small text-muted">
          Choose the lowest note for the high (treble) half. Notes below go to bass.
          {props.voiceName ? (' Splitting: ' + props.voiceName) : ''}
        </p>
        <Form.Group className="mb-3">
          <Form.Label>
            Split on {midiNoteName(effectivePitch)} (MIDI {effectivePitch})
          </Form.Label>
          <Form.Range
            min={range.min + 1}
            max={Math.max(range.min + 1, range.max)}
            value={effectivePitch}
            onChange={function(e) { setPitch(parseInt(e.target.value, 10)); }}
          />
          <div className="small text-muted">
            High (≥ {midiNoteName(effectivePitch)}): {highCount} notes · Low: {lowCount} notes
          </div>
        </Form.Group>
        <div className="midi-split-preview-panel">
          {previewAbc ? (
            <NotationPreview abc={previewAbc} fitWidth={true} wrapToWidth={true} maxHeight={320} />
          ) : (
            <div className="text-muted small">No notes to preview.</div>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={props.onHide}>Cancel</Button>
        <Button
          variant="primary"
          disabled={!highCount || !lowCount}
          onClick={function() { if (props.onConfirm) props.onConfirm(effectivePitch); }}
        >
          Split
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
