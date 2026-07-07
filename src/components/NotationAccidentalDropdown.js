import React from 'react';
import { Button, ButtonGroup, Dropdown } from 'react-bootstrap';

const ACCIDENTAL_OPTIONS = [
  { value: 0, label: '♮', title: 'Natural (=)', key: '=' },
  { value: -1, label: '♭', title: 'Flat (-)', key: '-' },
  { value: 1, label: '♯', title: 'Sharp (+)', key: '+' },
  { value: -2, label: '𝄫', title: 'Double flat', key: '__' },
  { value: 2, label: '𝄪', title: 'Double sharp', key: '^^' },
];

export default function NotationAccidentalDropdown(props) {
  const { session, dispatch } = props;
  const carry = session.accidentalCarry;
  const current = ACCIDENTAL_OPTIONS.find(function(o) { return o.value === carry; });
  const mainLabel = current ? current.label : '♮';

  function setCarry(value) {
    dispatch({ type: 'SET_ACCIDENTAL_CARRY', value: value });
  }

  return (
    <Dropdown as={ButtonGroup} className="notation-accidental-dropdown" data-testid="notation-accidental-menu">
      <Button
        size="lg"
        variant={carry != null ? 'primary' : 'outline-secondary'}
        title="Natural accidental carry"
        onClick={function() { setCarry(0); }}
      >{mainLabel}</Button>
      <Dropdown.Toggle split variant="outline-secondary" size="lg" aria-label="Choose accidental carry" />
      <Dropdown.Menu>
        {ACCIDENTAL_OPTIONS.map(function(opt) {
          return (
            <Dropdown.Item
              key={opt.value}
              active={carry === opt.value}
              title={opt.title}
              onClick={function() { setCarry(opt.value); }}
            >
              {opt.label} {opt.title}
            </Dropdown.Item>
          );
        })}
        <Dropdown.Divider />
        <Dropdown.Item onClick={function() { setCarry(null); }}>Clear carry</Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown>
  );
}
