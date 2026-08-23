import React from 'react';
import { Modal, Button, Accordion } from 'react-bootstrap';

const HELP_SECTIONS = [
  {
    title: 'Tracks',
    body: 'Use the Tracks button group to enable or disable voices for import and preview. Colours match the piano-roll notes. Manage opens the track manager to rename tracks, set key and clef, see note counts, and duplicate or merge voices.',
  },
  {
    title: 'Snap and grid',
    body: 'When Snap is on, the piano-roll grid and live ABC preview quantize note starts to the chosen subdivision. Grid includes straight values (1/4–1/32) and triplets (1/8T, 1/16T, 1/32T). These also set import quantization resolution.',
  },
  {
    title: 'Tempo and meter',
    body: 'Tempo (BPM) and meter set the shared grid for all enabled tracks. They drive bar lines, the range selector, quantization, and ABC meter/tempo headers.',
  },
  {
    title: 'Anacrusis (pickup)',
    body: 'Anacrusis shifts where bar 1 begins. Drag the pink first bar line on the piano roll. Pickup notes sit before the first downbeat.',
  },
  {
    title: 'Bar range',
    body: 'The dual-ended slider above the piano roll selects the import range at the current grid resolution (not only whole bars). Its ends line up with the roll timeline (after any anacrusis).',
  },
  {
    title: 'Pitch, velocity, and length',
    body: 'These dual sliders filter which notes pass into the preview and import. Pitch is MIDI note number (0–127), velocity is loudness (0–127), and length is in grid slots.',
  },
  {
    title: 'Ghosts, invert, quantize, key snap',
    body: 'Ghosts shows filtered-out notes faintly on the roll. Invert keeps the opposite of the pitch/velocity/length filters. Quantize snaps timing for ABC; Strength (beside Quant) controls how hard it pulls toward the grid. Key snap nudges pitches toward the selected key signature.',
  },
  {
    title: 'Legato and chords',
    body: 'Legato trims overlapping same-pitch notes. Chords keeps simultaneous pitches; off keeps the top note.',
  },
  {
    title: 'Piano roll zoom',
    body: 'Use − / + for horizontal zoom (or the mouse wheel over the roll), H− / H+ for row height, and Fit to fill the available height. Zoom, snap, and grid sit on the same row as the Piano roll / ABC toggle.',
  },
  {
    title: 'Playback',
    body: 'Press Space to start or stop playback (unless a text field is focused). Use the transport controls above the header to rewind or scrub.',
  },
];

export default function MidiImportHelpDialog(props) {
  return (
    <Modal show={props.show} onHide={props.onHide} size="lg" centered scrollable>
      <Modal.Header closeButton>
        <Modal.Title>MIDI Import settings</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="mb-3">
          Import a Standard MIDI File into ABC. Enable tracks, set the shared grid and filters,
          check the piano-roll and ABC previews, then Save.
        </p>
        <Accordion alwaysOpen>
          {HELP_SECTIONS.map(function(section, index) {
            return (
              <Accordion.Item eventKey={String(index)} key={section.title}>
                <Accordion.Header>{section.title}</Accordion.Header>
                <Accordion.Body>{section.body}</Accordion.Body>
              </Accordion.Item>
            );
          })}
        </Accordion>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={props.onHide}>Close</Button>
      </Modal.Footer>
    </Modal>
  );
}
