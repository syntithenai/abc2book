import React from 'react';
import { Button, ButtonGroup, Dropdown } from 'react-bootstrap';

export default function NotationSignaturesDropdown(props) {
  return (
    <Dropdown as={ButtonGroup} className="notation-signatures-dropdown">
      <Button
        size="lg"
        variant="outline-secondary"
        title="Insert key or time signature change"
        onClick={function() {
          if (typeof props.onInsertKeyChange === 'function') props.onInsertKeyChange();
        }}
        onMouseDown={function(e) { e.preventDefault(); }}
        data-testid="notation-signatures-key"
      >K</Button>
      <Dropdown.Toggle
        split
        variant="outline-secondary"
        size="lg"
        title="Signature changes"
        data-testid="notation-signatures-menu"
        aria-label="Signature changes"
      />
      <Dropdown.Menu>
        <Dropdown.Item
          data-testid="notation-insert-key-change"
          onMouseDown={function(e) { e.preventDefault(); }}
          onClick={function() {
            if (typeof props.onInsertKeyChange === 'function') props.onInsertKeyChange();
          }}
        >Key change…</Dropdown.Item>
        <Dropdown.Item
          data-testid="notation-insert-meter-change"
          onMouseDown={function(e) { e.preventDefault(); }}
          onClick={function() {
            if (typeof props.onInsertMeterChange === 'function') props.onInsertMeterChange();
          }}
        >Time signature change…</Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown>
  );
}
