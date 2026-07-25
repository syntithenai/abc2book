import React from 'react';
import { Button, ButtonGroup } from 'react-bootstrap';
import NotationClearIconButton from './NotationClearIconButton';

export default function NotationChordSymbolToolbar(props) {
  const {
    session,
    tunebook,
    expanded,
    onEditChord,
    onClearChord,
  } = props;
  const hasSelection = !!(session.selection && session.selection.eventIds && session.selection.eventIds.length);

  if (expanded) {
    return (
      <ButtonGroup className="notation-chord-symbol-toolbar" data-testid="notation-chord-symbol-toolbar">
        <Button
          size="lg"
          variant="outline-secondary"
          title="Edit chord symbol (Ctrl+K)"
          aria-label="Edit chord symbol"
          data-testid="notation-chord-symbol-edit"
          disabled={!hasSelection}
          onClick={onEditChord}
        >Cm</Button>
        <NotationClearIconButton
          tunebook={tunebook}
          title="Clear chord symbol on selection"
          testId="notation-chord-symbol-clear"
          disabled={!hasSelection}
          onClick={onClearChord}
        />
      </ButtonGroup>
    );
  }

  return (
    <ButtonGroup className="notation-chord-symbol-toolbar" data-testid="notation-chord-symbol-toolbar">
      <Button
        size="lg"
        variant="outline-secondary"
        title="Edit chord symbol (Ctrl+K)"
        aria-label="Edit chord symbol"
        data-testid="notation-chord-symbol-edit"
        disabled={!hasSelection}
        onClick={onEditChord}
      >Cm</Button>
      <NotationClearIconButton
        tunebook={tunebook}
        title="Clear chord symbol on selection"
        testId="notation-chord-symbol-clear"
        disabled={!hasSelection}
        onClick={onClearChord}
      />
    </ButtonGroup>
  );
}
