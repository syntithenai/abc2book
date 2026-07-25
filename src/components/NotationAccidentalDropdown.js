import React from 'react';
import { Button, ButtonGroup, Dropdown } from 'react-bootstrap';
import NotationClearIconButton from './NotationClearIconButton';

const ACCIDENTAL_OPTIONS = [
  { value: 0, label: '♮', title: 'Natural (=)', key: '=' },
  { value: -1, label: '♭', title: 'Flat (-)', key: '-' },
  { value: 1, label: '♯', title: 'Sharp (+)', key: '+' },
  { value: -2, label: '𝄫', title: 'Double flat', key: '__' },
  { value: 2, label: '𝄪', title: 'Double sharp', key: '^^' },
];

export default function NotationAccidentalDropdown(props) {
  const { session, dispatch, onApplyAccidental, expanded, tunebook } = props;
  const carry = session.accidentalCarry;
  const current = ACCIDENTAL_OPTIONS.find(function(o) { return o.value === carry; });
  const mainLabel = current ? current.label : '♮';
  const hasSelection = !!(session.selection && session.selection.eventIds && session.selection.eventIds.length);

  function apply(value) {
    if (typeof onApplyAccidental === 'function') {
      onApplyAccidental(value);
      return;
    }
    dispatch({ type: 'SET_ACCIDENTAL_CARRY', value: value });
  }

  if (expanded) {
    return (
      <ButtonGroup className="notation-accidental-buttons" data-testid="notation-accidental-menu" aria-label="Accidentals">
        {ACCIDENTAL_OPTIONS.map(function(opt) {
          return (
            <Button
              key={opt.value}
              size="lg"
              variant={carry === opt.value ? 'primary' : 'outline-secondary'}
              title={opt.title}
              onClick={function() { apply(opt.value); }}
            >{opt.label}</Button>
          );
        })}
        {hasSelection ? (
          <NotationClearIconButton
            tunebook={tunebook}
            title="Clear accidental — remove sharp, flat, or natural from selection"
            testId="notation-accidental-clear"
            onClick={function() { apply(null); }}
          />
        ) : null}
      </ButtonGroup>
    );
  }

  return (
    <ButtonGroup className="notation-accidental-dropdown" data-testid="notation-accidental-menu">
      <Button
        size="lg"
        variant={carry != null || hasSelection ? 'primary' : 'outline-secondary'}
        title={hasSelection ? 'Apply natural to selection' : 'Natural accidental carry'}
        onClick={function() { apply(0); }}
      >{mainLabel}</Button>
      {hasSelection ? (
        <NotationClearIconButton
          tunebook={tunebook}
          title="Clear accidental — remove sharp, flat, or natural from selection"
          testId="notation-accidental-clear"
          onClick={function() { apply(null); }}
        />
      ) : null}
      <Dropdown.Toggle split variant="outline-secondary" size="lg" aria-label="Choose accidental" />
      <Dropdown.Menu>
        {ACCIDENTAL_OPTIONS.map(function(opt) {
          return (
            <Dropdown.Item
              key={opt.value}
              active={carry === opt.value}
              title={opt.title}
              onClick={function() { apply(opt.value); }}
            >
              {opt.label} {opt.title}
            </Dropdown.Item>
          );
        })}
        <Dropdown.Divider />
        <Dropdown.Item onClick={function() {
          if (typeof dispatch === 'function') {
            dispatch({ type: 'SET_ACCIDENTAL_CARRY', value: null });
          }
        }}>Clear carry</Dropdown.Item>
      </Dropdown.Menu>
    </ButtonGroup>
  );
}
