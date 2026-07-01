import { useState } from 'react';
import { Dropdown } from 'react-bootstrap';
import { VIEW_MODES, normalizeViewMode } from '../viewModeUtils';

export default function ViewModeSelectorModal(props) {
  const [show, setShow] = useState(false);
  const currentMode = normalizeViewMode(props.viewMode);
  const currentLabel = VIEW_MODES.find(function(mode) { return mode.id === currentMode; });
  const label = currentLabel ? currentLabel.label : 'View';

  return (
    <Dropdown show={show} onToggle={function(next) { setShow(next); }}>
      <Dropdown.Toggle variant="secondary" id="view-mode-dropdown">
        {props.tunebook.icons.eye} {label}
      </Dropdown.Toggle>
      <Dropdown.Menu>
        {VIEW_MODES.map(function(mode) {
          return (
            <Dropdown.Item
              key={mode.id}
              active={currentMode === mode.id}
              onClick={function() {
                props.onChange(mode.id);
                setShow(false);
                if (props.closeParent) props.closeParent();
              }}
            >
              {mode.id === 'music' && props.tunebook.icons.music}
              {mode.id === 'musicAndLyrics' && props.tunebook.icons.music}
              {(mode.id === 'chordsInline' || mode.id === 'chordsBlock') && props.tunebook.icons.guitar}
              {mode.id === 'info' && props.tunebook.icons.question}
              {' '}{mode.label}
            </Dropdown.Item>
          );
        })}
      </Dropdown.Menu>
    </Dropdown>
  );
}
