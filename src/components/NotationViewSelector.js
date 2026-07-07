import { useState } from 'react';
import { Dropdown } from 'react-bootstrap';
import { EDITOR_VIEWS } from '../notation/notationConstants';

const VIEW_TEST_IDS = {
  staff: 'notation-view-staff',
  pianoRoll: 'notation-view-piano-roll',
  split: 'notation-view-split',
  abc: 'notation-view-abc',
};

const NOTATION_VIEW_MODES = [
  { id: EDITOR_VIEWS.STAFF, label: 'Staff' },
  { id: EDITOR_VIEWS.PIANO_ROLL, label: 'Piano roll' },
  { id: EDITOR_VIEWS.SPLIT, label: 'Staff + Roll' },
  { id: EDITOR_VIEWS.ABC, label: 'ABC' },
];

export default function NotationViewSelector(props) {
  const [show, setShow] = useState(false);
  const current = props.view || EDITOR_VIEWS.STAFF;
  const currentLabel = NOTATION_VIEW_MODES.find(function(mode) { return mode.id === current; });
  const label = currentLabel ? currentLabel.label : 'View';

  return (
    <Dropdown show={show} onToggle={function(next) { setShow(next); }} className="notation-view-selector">
      <Dropdown.Toggle variant="secondary" id="notation-view-dropdown" title={label}>
        {props.tunebook.icons.eye}
        <span className="view-mode-label">{label}</span>
      </Dropdown.Toggle>
      <Dropdown.Menu align="end">
        {NOTATION_VIEW_MODES.map(function(mode) {
          return (
            <Dropdown.Item
              key={mode.id}
              active={current === mode.id}
              data-testid={VIEW_TEST_IDS[mode.id] || ('notation-view-' + mode.id)}
              onClick={function() {
                props.onChange(mode.id);
                setShow(false);
              }}
            >
              {mode.label}
            </Dropdown.Item>
          );
        })}
      </Dropdown.Menu>
    </Dropdown>
  );
}
