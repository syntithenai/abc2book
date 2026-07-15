import React from 'react';
import { Button, ButtonGroup, Dropdown } from 'react-bootstrap';
import NotationVoiceSelector from './NotationVoiceSelector';

export default function NotationVoicesDropdown(props) {
  const {
    tune,
    voiceNames,
    voiceIndex,
    displayedVoiceIndices,
    onVoiceSelect,
    onDisplayedVoicesChange,
    onVoiceNameChange,
    onAddVoice,
    onDeleteVoice,
    toggleLabel,
    expanded,
  } = props;

  if (!voiceNames || voiceNames.length === 0) return null;

  const label = toggleLabel || 'V';
  const showExpanded = expanded && voiceNames.length > 1;

  const menu = (
    <Dropdown.Menu className="notation-voices-menu" align="start">
      <NotationVoiceSelector
        embedded={true}
        tune={tune}
        voiceNames={voiceNames}
        voiceIndex={voiceIndex}
        displayedVoiceIndices={displayedVoiceIndices}
        onVoiceSelect={onVoiceSelect}
        onDisplayedVoicesChange={onDisplayedVoicesChange}
        onVoiceNameChange={onVoiceNameChange}
        onAddVoice={onAddVoice}
        onDeleteVoice={onDeleteVoice}
      />
    </Dropdown.Menu>
  );

  if (showExpanded) {
    const visible = voiceNames.slice(0, Math.min(4, voiceNames.length));
    return (
      <ButtonGroup className="notation-voices-expanded" data-testid="notation-voices-expanded">
        {visible.map(function(name, idx) {
          const active = idx === voiceIndex;
          return (
            <Button
              key={name}
              size="lg"
              variant={active ? 'primary' : 'outline-secondary'}
              title={name}
              className="notation-voice-compact-btn"
              onClick={function() { if (onVoiceSelect) onVoiceSelect(idx); }}
            >{'V' + (idx + 1)}</Button>
          );
        })}
        <Dropdown as={ButtonGroup} autoClose="outside">
          <Dropdown.Toggle
            split
            variant="outline-secondary"
            size="lg"
            title="Voices"
            aria-label="Voices menu"
            data-testid="notation-voices-menu"
          />
          {menu}
        </Dropdown>
      </ButtonGroup>
    );
  }

  return (
    <ButtonGroup className="notation-voices-dropdown">
      <Dropdown as={ButtonGroup} autoClose="outside">
        <Dropdown.Toggle
          variant="outline-secondary"
          size="lg"
          title="Voices — choose which part to edit and show in the score"
          aria-label="Voices menu"
          data-testid="notation-voices-menu"
        >
          {label}
        </Dropdown.Toggle>
        {menu}
      </Dropdown>
    </ButtonGroup>
  );
}
