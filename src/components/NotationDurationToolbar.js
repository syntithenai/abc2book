import React from 'react';
import { Button, ButtonGroup, Dropdown } from 'react-bootstrap';
import {
  EDITOR_MODES,
  NOTE_INPUT_METHODS,
  NOTE_INPUT_METHOD_LABELS,
  STAFF_SELECTION_TOOLS,
} from '../notation/notationConstants';
import NotationDurationDropdown from './NotationDurationDropdown';
import NotationDurationButtonGroup from './NotationDurationButtonGroup';

const METHOD_ORDER = [
  NOTE_INPUT_METHODS.NOTE_NAME,
  NOTE_INPUT_METHODS.DURATION,
  NOTE_INPUT_METHODS.RHYTHM,
  NOTE_INPUT_METHODS.RE_PITCH,
  NOTE_INPUT_METHODS.INSERT,
];

const LONGEST_NOTE_INPUT_LABEL = METHOD_ORDER.reduce(function(longest, method) {
  const label = NOTE_INPUT_METHOD_LABELS[method] || '';
  return label.length > longest.length ? label : longest;
}, 'Note name');

export default function NotationDurationToolbar(props) {
  const {
    session,
    dispatch,
    onToggleNoteInput,
    onApplyDuration,
    onInsertSystemBreak,
    onToggleDot,
    expandFlags,
  } = props;

  const expand = expandFlags || {};
  const expandDurations = expand.durations !== false;
  const method = session.noteInputMethod || NOTE_INPUT_METHODS.NOTE_NAME;
  const methodLabel = NOTE_INPUT_METHOD_LABELS[method] || 'Note name';
  const staffTool = session.staffSelectionTool || STAFF_SELECTION_TOOLS.NORMAL;
  const marqueeToolActive = staffTool === STAFF_SELECTION_TOOLS.MARQUEE;

  function setStaffSelectionTool(tool) {
    if (!dispatch) return;
    dispatch({
      type: 'SET_PIANO_ROLL_STATE',
      patch: { staffSelectionTool: tool },
    });
  }

  return (
    <div className="notation-duration-toolbar">
      <ButtonGroup className="notation-note-input-method-group">
        <Button
          size="lg"
          variant={session.mode === EDITOR_MODES.NOTE_INPUT ? 'primary' : 'outline-secondary'}
          onClick={onToggleNoteInput}
          title="Note input (N)"
          data-testid="notation-note-input-btn"
        >✎</Button>
        <Dropdown as={ButtonGroup}>
          <Dropdown.Toggle
            split
            size="lg"
            variant={session.mode === EDITOR_MODES.NOTE_INPUT ? 'primary' : 'outline-secondary'}
            title="Note input method"
            aria-label="Note input method"
            data-testid="notation-note-input-method"
          />
          <Dropdown.Menu>
            {METHOD_ORDER.map(function(m) {
              return (
                <Dropdown.Item
                  key={m}
                  active={method === m}
                  onClick={function() {
                    if (dispatch) {
                      dispatch({ type: 'SET_NOTE_INPUT_METHOD', method: m });
                      if (session.mode !== EDITOR_MODES.NOTE_INPUT) {
                        dispatch({ type: 'SET_MODE', mode: EDITOR_MODES.NOTE_INPUT });
                      }
                    }
                  }}
                >
                  {NOTE_INPUT_METHOD_LABELS[m] || m}
                </Dropdown.Item>
              );
            })}
          </Dropdown.Menu>
        </Dropdown>
      </ButtonGroup>
      <span className="notation-mode-badge-input-slot" aria-hidden={session.mode !== EDITOR_MODES.NOTE_INPUT}>
        {session.mode === EDITOR_MODES.NOTE_INPUT ? (
          <span
            className="notation-mode-badge notation-mode-badge-input"
            title={'Note input — ' + methodLabel}
            data-testid="notation-mode-badge-input"
          >
            {methodLabel}
          </span>
        ) : (
          <span className="notation-mode-badge notation-mode-badge-input notation-mode-badge-input--reserved">
            {LONGEST_NOTE_INPUT_LABEL}
          </span>
        )}
      </span>
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
        onClick={function() {
          if (typeof onToggleDot === 'function') onToggleDot();
          else dispatch({ type: 'TOGGLE_DOT' });
        }}
        title="Dot (.)"
        data-testid="notation-dot"
      >.</Button>
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
      {session.mode !== EDITOR_MODES.NOTE_INPUT ? (
        <Button
          size="lg"
          variant={marqueeToolActive ? 'primary' : 'outline-secondary'}
          title="Selection tool — drag to marquee without Shift (desktop)"
          data-testid="staff-selection-tool-marquee"
          onClick={function() {
            setStaffSelectionTool(
              marqueeToolActive ? STAFF_SELECTION_TOOLS.NORMAL : STAFF_SELECTION_TOOLS.MARQUEE
            );
          }}
        >Sel</Button>
      ) : null}
    </div>
  );
}
