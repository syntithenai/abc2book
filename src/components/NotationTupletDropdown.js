import React from 'react';
import { Button, ButtonGroup, Dropdown } from 'react-bootstrap';
import { TUPLET_PRESETS } from '../notation/notationTokens';

export default function NotationTupletDropdown(props) {
  const { session, onTupletAction, expanded } = props;
  const mode = session.tupletMode;
  const mainLabel = mode ? '(' + mode.num : '(3';

  const menu = (
    <Dropdown.Menu>
      <Dropdown.Header>Tuplets</Dropdown.Header>
      {TUPLET_PRESETS.map(function(preset) {
        return (
          <Dropdown.Item
            key={preset.num + '-' + preset.den}
            onClick={function() { onTupletAction(preset); }}
          >{preset.label} ({preset.num}:{preset.den})</Dropdown.Item>
        );
      })}
      <Dropdown.Divider />
      <Dropdown.Item onClick={function() { onTupletAction('_endTuplet'); }}>End tuplet mode</Dropdown.Item>
      <Dropdown.Item onClick={function() { onTupletAction('_beamBreak'); }}>Break beam before selection</Dropdown.Item>
    </Dropdown.Menu>
  );

  if (expanded) {
    return (
      <ButtonGroup className="notation-tuplet-expanded" data-testid="notation-tuplet-expanded">
        <Button
          size="lg"
          variant={mode ? 'primary' : 'outline-secondary'}
          title={mode ? 'End tuplet mode' : 'Start triplet'}
          onClick={function() {
            if (mode) onTupletAction('_endTuplet');
            else onTupletAction('_triplet');
          }}
        >{mainLabel}</Button>
        {TUPLET_PRESETS.slice(0, 3).map(function(preset) {
          return (
            <Button
              key={preset.num + '-' + preset.den}
              size="lg"
              variant="outline-secondary"
              title={preset.label}
              className="notation-tuplet-compact-btn"
              onClick={function() { onTupletAction(preset); }}
            >{preset.num}:{preset.den}</Button>
          );
        })}
        <Dropdown as={ButtonGroup}>
          <Dropdown.Toggle
            split
            variant="outline-secondary"
            size="lg"
            aria-label="Tuplets and grace menu"
            data-testid="notation-tuplet-menu"
          />
          {menu}
        </Dropdown>
      </ButtonGroup>
    );
  }

  return (
    <Dropdown as={ButtonGroup} className="notation-tuplet-dropdown">
      <Button
        size="lg"
        variant={mode ? 'primary' : 'outline-secondary'}
        title={mode ? 'Triplet/tuplet mode active — click to end' : 'Start triplet mode'}
        onClick={function() {
          if (mode) onTupletAction('_endTuplet');
          else onTupletAction('_triplet');
        }}
      >{mainLabel}</Button>
      <Dropdown.Toggle split variant="outline-secondary" size="lg" aria-label="Tuplets and grace menu" data-testid="notation-tuplet-menu" />
      {menu}
    </Dropdown>
  );
}
