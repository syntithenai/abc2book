import React from 'react';
import { Button, ButtonGroup, Dropdown } from 'react-bootstrap';
import { DURATION_KEYS, durationLabel } from '../notation/notationDurationUi';

export default function NotationDurationDropdown(props) {
  const { session, dispatch, onApplyDuration } = props;
  const currentLabel = durationLabel(session.durationKey);

  function pick(key) {
    dispatch({ type: 'SET_DURATION_KEY', key: key });
    if (onApplyDuration) onApplyDuration(key);
  }

  return (
    <Dropdown as={ButtonGroup} className="notation-duration-dropdown d-lg-none">
      <Button
        size="lg"
        variant={session.durationKey ? 'primary' : 'outline-secondary'}
        title="Apply current duration to selection"
        onClick={function() { pick(session.durationKey); }}
      >{currentLabel}</Button>
      <Dropdown.Toggle split variant="outline-secondary" size="lg" aria-label="Choose duration" />
      <Dropdown.Menu>
        {DURATION_KEYS.map(function(key) {
          return (
            <Dropdown.Item
              key={key}
              active={session.durationKey === key}
              onClick={function() { pick(key); }}
            >
              {durationLabel(key)}{' '}
              <span className="text-muted small">({key})</span>
            </Dropdown.Item>
          );
        })}
      </Dropdown.Menu>
    </Dropdown>
  );
}
