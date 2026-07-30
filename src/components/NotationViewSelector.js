import { useState } from 'react';
import { Dropdown, Button, ButtonGroup } from 'react-bootstrap';
import { EDITOR_VIEWS } from '../notation/notationConstants';

const VIEW_TEST_IDS = {
  staff: 'notation-view-staff',
  pianoRoll: 'notation-view-piano-roll',
  split: 'notation-view-split',
  abc: 'notation-view-abc',
  chords: 'notation-view-chords',
};

const NOTATION_VIEW_MODES = [
  { id: EDITOR_VIEWS.STAFF, label: 'Staff' },
  { id: EDITOR_VIEWS.PIANO_ROLL, label: 'Piano roll' },
  { id: EDITOR_VIEWS.SPLIT, label: 'Staff + Roll' },
  { id: EDITOR_VIEWS.ABC, label: 'ABC' },
  { id: EDITOR_VIEWS.CHORDS, label: 'Chords' },
];

const TOOLBAR_VIEW_MODES = [
  { id: EDITOR_VIEWS.STAFF, label: 'Staff', iconKey: 'trebleclef' },
  { id: EDITOR_VIEWS.PIANO_ROLL, label: 'Piano roll', iconKey: 'pianoroll' },
  { id: EDITOR_VIEWS.ABC, label: 'ABC', textIcon: 'ABC' },
  { id: EDITOR_VIEWS.CHORDS, label: 'Chords', iconKey: 'guitar' },
];

function renderToolbarViewContent(mode, tunebook) {
  if (mode.textIcon) {
    return <span className="notation-view-toggle-text" aria-hidden="true">{mode.textIcon}</span>;
  }
  if (mode.iconKey && tunebook && tunebook.icons) {
    return (
      <span className="notation-view-toggle-icon" aria-hidden="true">
        {tunebook.icons[mode.iconKey]}
      </span>
    );
  }
  return mode.label;
}

export default function NotationViewSelector(props) {
  const [show, setShow] = useState(false);
  const current = props.view || EDITOR_VIEWS.STAFF;

  // ButtonGroup variant for toolbar (no Split option)
  if (props.variant === 'buttonGroup') {
    return (
      <ButtonGroup className="notation-view-toggle-group" aria-label="Notation view">
        {TOOLBAR_VIEW_MODES.map(function(mode) {
          var active = current === mode.id;
          return (
            <Button
              key={mode.id}
              size="lg"
              variant={active ? 'primary' : 'outline-secondary'}
              className={active ? 'notation-view-toggle-btn-active' : 'notation-view-toggle-btn'}
              data-testid={VIEW_TEST_IDS[mode.id] || ('notation-view-' + mode.id)}
              aria-pressed={active}
              aria-label={mode.label}
              title={mode.label}
              onClick={function() { props.onChange(mode.id); }}
            >
              {renderToolbarViewContent(mode, props.tunebook)}
            </Button>
          );
        })}
      </ButtonGroup>
    );
  }

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
