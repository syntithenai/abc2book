import React from 'react';
import { Button, ButtonGroup, Dropdown, Form } from 'react-bootstrap';
import { MIDI_CHORD_MODES, DEFAULT_MIDI_CHORD_WINDOW_MS } from '../notation/notationConstants';

const CHORD_MODE_OPTIONS = [
  { value: MIDI_CHORD_MODES.SINGLE, label: 'Single notes' },
  { value: MIDI_CHORD_MODES.STEP_CHORD, label: 'Step chord' },
  { value: MIDI_CHORD_MODES.ADD_TONE, label: 'Add tone' },
];

export default function MidiInputPanel(props) {
  const {
    midi,
    session,
    dispatch,
    tunebook,
    onToggleRecord,
    onApplyRecord,
    onDiscardRecord,
    pendingRecordCount,
  } = props;

  if (!midi.isSupported) return null;

  const enabledLabel = session.midiEnabled ? 'MIDI on' : 'Enable MIDI';
  const recording = session.midiRecordActive;

  function setMidiPatch(patch) {
    dispatch({ type: 'SET_MIDI_STATE', patch: patch });
  }

  async function toggleMidiEnabled() {
    const next = !session.midiEnabled;
    // Flip UI state immediately; permission failure surfaces via midi.error.
    setMidiPatch({ midiEnabled: next });
    if (next) {
      try {
        await midi.requestAccess();
      } catch (err) {
        /* requestAccess already sets midi.error */
      }
    }
  }

  return (
    <ButtonGroup className="notation-midi-dropdown">
      <Button
        size="lg"
        variant={session.midiEnabled ? 'success' : 'outline-secondary'}
        className="midi-enable-btn"
        title={enabledLabel}
        aria-label={enabledLabel}
        data-testid="notation-midi-enable"
        onClick={function(e) {
          e.preventDefault();
          e.stopPropagation();
          toggleMidiEnabled();
        }}
      >
        {tunebook && tunebook.icons ? tunebook.icons.midi : 'MIDI'}
        {recording ? <span className="notation-mode-badge notation-rec-badge">●</span> : null}
      </Button>
      <Dropdown as={ButtonGroup}>
        <Dropdown.Toggle
          split
          variant="outline-secondary"
          size="lg"
          aria-label="MIDI options"
          data-testid="notation-midi-options"
        />
        <Dropdown.Menu className="notation-midi-menu p-2" style={{ minWidth: '14rem' }}>
          <div className="mb-2">
            <Form.Check
              type="switch"
              id="midi-enable-switch"
              label="Enable MIDI input"
              checked={!!session.midiEnabled}
              onChange={async function(e) {
                const next = e.target.checked;
                setMidiPatch({ midiEnabled: next });
                if (next) await midi.requestAccess();
              }}
            />
          </div>
          {midi.error ? <div className="text-danger small mb-2">{midi.error}</div> : null}
          {session.midiEnabled && midi.inputs.length > 0 ? (
            <Form.Group className="mb-2">
              <Form.Label className="small mb-0">Input device</Form.Label>
              <Form.Select
                size="sm"
                value={session.midiInputId || ''}
                onChange={function(e) {
                  setMidiPatch({ midiInputId: e.target.value || null });
                }}
              >
                <option value="">All inputs</option>
                {midi.inputs.map(function(inp) {
                  return <option key={inp.id} value={inp.id}>{inp.name}</option>;
                })}
              </Form.Select>
            </Form.Group>
          ) : null}
          <Form.Group className="mb-2">
            <Form.Label className="small mb-0">Chord mode</Form.Label>
            {CHORD_MODE_OPTIONS.map(function(opt) {
              return (
                <Form.Check
                  key={opt.value}
                  type="radio"
                  name="midi-chord-mode"
                  id={'midi-mode-' + opt.value}
                  label={opt.label}
                  checked={session.midiChordMode === opt.value}
                  onChange={function() {
                    setMidiPatch({ midiChordMode: opt.value });
                  }}
                />
              );
            })}
          </Form.Group>
          {session.midiChordMode === MIDI_CHORD_MODES.STEP_CHORD ? (
            <Form.Group className="mb-2">
              <Form.Label className="small mb-0">Chord window (ms)</Form.Label>
              <Form.Control
                type="number"
                size="sm"
                min={10}
                max={500}
                value={session.midiChordWindowMs || DEFAULT_MIDI_CHORD_WINDOW_MS}
                onChange={function(e) {
                  setMidiPatch({ midiChordWindowMs: parseInt(e.target.value, 10) || DEFAULT_MIDI_CHORD_WINDOW_MS });
                }}
              />
            </Form.Group>
          ) : null}
          <div className="d-flex align-items-center gap-2 mb-1">
            <span
              className={'midi-activity-dot' + (Object.keys(midi.activeNotes).length ? ' active' : '')}
              title="MIDI activity"
            />
            <span className="small text-muted">Activity</span>
          </div>
          <Dropdown.Divider />
          {!recording ? (
            <Button
              variant="outline-danger"
              size="sm"
              className="w-100"
              onClick={onToggleRecord}
              disabled={!session.midiEnabled}
            >Start recording</Button>
          ) : (
            <Button variant="danger" size="sm" className="w-100" onClick={onToggleRecord}>
              Stop recording
            </Button>
          )}
          {pendingRecordCount > 0 ? (
            <div className="mt-2 d-flex gap-1">
              <Button variant="primary" size="sm" className="flex-grow-1" onClick={onApplyRecord}>
                Apply ({pendingRecordCount})
              </Button>
              <Button variant="outline-secondary" size="sm" onClick={onDiscardRecord}>Discard</Button>
            </div>
          ) : null}
        </Dropdown.Menu>
      </Dropdown>
    </ButtonGroup>
  );
}
