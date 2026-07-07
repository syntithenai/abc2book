import React from 'react';
import { EDITOR_MODES } from '../notation/notationConstants';

export default function GhostNoteOverlay(props) {
  const { session } = props;
  const noteInput = session.mode === EDITOR_MODES.NOTE_INPUT;
  const caretLabel = noteInput
    ? 'Input at event ' + (session.caretIndex + 1)
    : 'Caret at event ' + (session.caretIndex + 1);

  return (
    <div className={'ghost-note-overlay' + (noteInput ? ' ghost-note-overlay--input' : '')} aria-live="polite">
      <span className={'ghost-caret-label' + (noteInput ? ' ghost-caret-label--input' : '')} data-testid="ghost-caret-label">{caretLabel}</span>
      {noteInput ? (
        <span className="ghost-note-input-hint">
          Note input active — press A–G to enter notes, 0 for a rest, or click the piano below.
        </span>
      ) : null}
    </div>
  );
}
