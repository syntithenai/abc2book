import React from 'react';
import { Button } from 'react-bootstrap';
import { EDITOR_MODES } from '../notation/notationConstants';
import NotationDurationDropdown from './NotationDurationDropdown';
import NotationDurationButtonGroup from './NotationDurationButtonGroup';
import NotationAccidentalDropdown from './NotationAccidentalDropdown';

export default function NotationDurationToolbar(props) {
  const {
    session,
    dispatch,
    onToggleNoteInput,
    onApplyDuration,
    onInsertSystemBreak,
    onApplyAccidental,
    expandFlags,
  } = props;

  const expand = expandFlags || {};
  const expandDurations = expand.durations !== false;

  return (
    <div className="notation-duration-toolbar d-flex flex-wrap align-items-center gap-2">
      <Button
        size="lg"
        variant={session.mode === EDITOR_MODES.NOTE_INPUT ? 'primary' : 'outline-secondary'}
        onClick={onToggleNoteInput}
        title="Note input (N)"
        data-testid="notation-note-input-btn"
      >✎</Button>
      {session.mode === EDITOR_MODES.NOTE_INPUT ? (
        <span
          className="notation-mode-badge notation-mode-badge-input"
          title="Note input — press A–G or use the piano"
          data-testid="notation-mode-badge-input"
        >
          Input
        </span>
      ) : null}
      {expandDurations ? (
        <NotationDurationButtonGroup
          session={session}
          dispatch={dispatch}
          onApplyDuration={onApplyDuration}
        />
      ) : (
        <NotationDurationDropdown
          session={session}
          dispatch={dispatch}
          onApplyDuration={onApplyDuration}
        />
      )}
      <Button
        size="lg"
        variant={session.dotted ? 'primary' : 'outline-secondary'}
        onClick={function() { dispatch({ type: 'TOGGLE_DOT' }); }}
        title="Dot (.)"
        data-testid="notation-dot"
      >.</Button>
      <NotationAccidentalDropdown
        session={session}
        dispatch={dispatch}
        onApplyAccidental={onApplyAccidental}
        expanded={!!expand.accidentals}
      />
      {onInsertSystemBreak ? (
        <Button
          size="lg"
          variant="outline-secondary"
          className="notation-system-break-btn"
          title="System break — start a new line of music (!)"
          onClick={onInsertSystemBreak}
          data-testid="notation-system-break-btn"
        >↵</Button>
      ) : null}
    </div>
  );
}
