import React from 'react';
import { Button, ButtonGroup, Dropdown } from 'react-bootstrap';
import { PIANO_ROLL_TOOLS } from '../notation/notationConstants';

export default function PianoRollToolbar(props) {
  const {
    session,
    dispatch,
    hasRecordingGrid,
    onQuantize,
    onAlignAction,
  } = props;

  const tool = session.pianoRollTool || PIANO_ROLL_TOOLS.SELECT;
  const zoom = session.pianoRollZoom || { beatWidth: 48, rowHeight: 14 };

  function setPianoRollState(patch) {
    dispatch({ type: 'SET_PIANO_ROLL_STATE', patch: patch });
  }

  function setZoom(patch) {
    setPianoRollState({ pianoRollZoom: Object.assign({}, zoom, patch) });
  }

  return (
    <div className="piano-roll-toolbar d-flex flex-wrap align-items-center gap-2">
      <ButtonGroup size="sm">
        {[
          { id: PIANO_ROLL_TOOLS.SELECT, label: 'Sel' },
          { id: PIANO_ROLL_TOOLS.DRAW, label: 'Draw' },
          { id: PIANO_ROLL_TOOLS.SPLIT, label: 'Split' },
          { id: PIANO_ROLL_TOOLS.ERASE, label: 'Erase' },
        ].map(function(entry) {
          return (
            <Button
              key={entry.id}
              variant={tool === entry.id ? 'primary' : 'outline-secondary'}
              onClick={function() { setPianoRollState({ pianoRollTool: entry.id }); }}
              data-testid={'piano-roll-tool-' + entry.id}
            >{entry.label}</Button>
          );
        })}
      </ButtonGroup>

      <Button
        size="sm"
        variant={session.snapEnabled ? 'primary' : 'outline-secondary'}
        onClick={function() {
          dispatch({ type: 'SET_MIDI_STATE', patch: { snapEnabled: !session.snapEnabled } });
        }}
        data-testid="piano-roll-snap"
      >Snap</Button>

      <select
        className="form-select form-select-sm piano-roll-snap-select"
        value={session.snapSlotsPerBeat || 4}
        onChange={function(e) {
          dispatch({ type: 'SET_MIDI_STATE', patch: { snapSlotsPerBeat: parseInt(e.target.value, 10) } });
        }}
      >
        <option value={1}>1/4</option>
        <option value={2}>1/8</option>
        <option value={4}>1/16</option>
        <option value={8}>1/32</option>
      </select>

      {hasRecordingGrid ? (
        <Button
          size="sm"
          variant={session.pianoRollUseRecordingGrid ? 'primary' : 'outline-secondary'}
          onClick={function() {
            setPianoRollState({ pianoRollUseRecordingGrid: !session.pianoRollUseRecordingGrid });
          }}
        >Rec grid</Button>
      ) : null}

      <Button
        size="sm"
        variant={session.pianoRollShowTimedMelody ? 'primary' : 'outline-secondary'}
        onClick={function() {
          setPianoRollState({ pianoRollShowTimedMelody: !session.pianoRollShowTimedMelody });
        }}
      >Melody</Button>

      <Button
        size="sm"
        variant={session.pianoRollShowWaveform ? 'primary' : 'outline-secondary'}
        onClick={function() {
          setPianoRollState({ pianoRollShowWaveform: !session.pianoRollShowWaveform });
        }}
      >Wave</Button>

      <Button size="sm" variant="outline-secondary" onClick={onQuantize} data-testid="piano-roll-quantize">Q</Button>

      <Dropdown as={ButtonGroup} size="sm">
        <Dropdown.Toggle variant="outline-secondary">Align</Dropdown.Toggle>
        <Dropdown.Menu>
          <Dropdown.Item onClick={function() { onAlignAction('alignGrid'); }}>Align to recording grid</Dropdown.Item>
          <Dropdown.Item onClick={function() { onAlignAction('matchMelody'); }}>Match detected melody</Dropdown.Item>
          <Dropdown.Item onClick={function() { onAlignAction('slideSelection'); }}>Slide selection +0.25 beat</Dropdown.Item>
          <Dropdown.Item onClick={function() { onAlignAction('downbeatFromPlayhead'); }}>Set downbeat from playhead</Dropdown.Item>
          <Dropdown.Item onClick={function() { onAlignAction('snapRegionStart'); }}>Snap to playback region</Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown>

      <Button size="sm" variant="outline-secondary" onClick={function() { setZoom({ beatWidth: Math.max(16, zoom.beatWidth - 8) }); }}>H-</Button>
      <Button size="sm" variant="outline-secondary" onClick={function() { setZoom({ beatWidth: Math.min(120, zoom.beatWidth + 8) }); }}>H+</Button>
      <Button size="sm" variant="outline-secondary" onClick={function() { setZoom({ rowHeight: Math.max(8, zoom.rowHeight - 2) }); }}>V-</Button>
      <Button size="sm" variant="outline-secondary" onClick={function() { setZoom({ rowHeight: Math.min(24, zoom.rowHeight + 2) }); }}>V+</Button>
    </div>
  );
}
