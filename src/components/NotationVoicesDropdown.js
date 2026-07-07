import React from 'react';
import { ButtonGroup, Dropdown } from 'react-bootstrap';
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
  } = props;

  if (!voiceNames || voiceNames.length === 0) return null;

  const label = toggleLabel || 'V';

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
      </Dropdown>
    </ButtonGroup>
  );
}
