import React from 'react';
import { Button, ButtonGroup, Dropdown } from 'react-bootstrap';

export default function NotationToolsDropdown(props) {
  const { tunebook, onOpenWizard, onNoteGroups, onQuantize } = props;

  return (
    <Dropdown as={ButtonGroup} className="notation-tools-dropdown">
      <Button
        size="lg"
        variant="outline-secondary"
        title="Layout wizards"
        onClick={onOpenWizard}
        data-testid="notation-wizard-btn"
      >{tunebook && tunebook.icons ? tunebook.icons.wizard : '⚙'}</Button>
      <Dropdown.Toggle split variant="outline-secondary" size="lg" aria-label="Tools menu" data-testid="notation-tools-menu" />
      <Dropdown.Menu>
        <Dropdown.Item onClick={onOpenWizard}>Layout wizards</Dropdown.Item>
        <Dropdown.Item
          onClick={function() { if (onNoteGroups) onNoteGroups(); }}
          data-testid="notation-note-groups"
        >Note Groups</Dropdown.Item>
        <Dropdown.Item onClick={onQuantize}>Quantize…</Dropdown.Item>
        <Dropdown.Divider />
        <Dropdown.Item
          onClick={function() { if (props.onInsertMeasure) props.onInsertMeasure(); }}
          data-testid="notation-insert-measure"
        >Insert empty measure (Ins / Ctrl+B)</Dropdown.Item>
        <Dropdown.Item
          onClick={function() { if (props.onBeamBreak) props.onBeamBreak(); }}
          data-testid="notation-beam-break"
        >Break beam before selection</Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown>
  );
}
