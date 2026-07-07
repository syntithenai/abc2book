import React from 'react';
import { Button, ButtonGroup } from 'react-bootstrap';
import { DURATION_KEYS, durationLabel } from '../notation/notationDurationUi';

export default function NotationDurationButtonGroup(props) {
  const { session, dispatch, onApplyDuration } = props;

  function pick(key) {
    dispatch({ type: 'SET_DURATION_KEY', key: key });
    if (onApplyDuration) onApplyDuration(key);
  }

  return (
    <ButtonGroup className="notation-duration-buttons d-none d-lg-inline-flex" aria-label="Note durations">
      {DURATION_KEYS.map(function(key) {
        return (
          <Button
            key={key}
            size="lg"
            variant={session.durationKey === key ? 'primary' : 'outline-secondary'}
            title={'Duration ' + durationLabel(key) + ' (key ' + key + ')'}
            onClick={function() { pick(key); }}
            data-testid={'notation-duration-' + key}
          >{durationLabel(key)}</Button>
        );
      })}
    </ButtonGroup>
  );
}
