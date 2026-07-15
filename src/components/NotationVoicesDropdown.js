import React, { useState } from 'react';
import { Button, ButtonGroup, Dropdown } from 'react-bootstrap';
import NotationVoiceSelector from './NotationVoiceSelector';
import VoicesManageModal from './VoicesManageModal';

export default function NotationVoicesDropdown(props) {
  const {
    tune,
    voiceNames,
    voiceIndex,
    displayedVoiceIndices,
    onVoiceSelect,
    onDisplayedVoicesChange,
    onVoiceNameChange,
    onVoiceNotesChange,
    onAddVoice,
    onDeleteVoice,
    toggleLabel,
    expanded,
  } = props;

  const [showManage, setShowManage] = useState(false);

  if (!voiceNames || voiceNames.length === 0) return null;

  const label = toggleLabel || 'V';
  const showExpanded = expanded && voiceNames.length > 1;

  const manageButton = (
    <Button
      size="lg"
      variant="outline-secondary"
      title="Manage voices — name, clef, instrument, visibility"
      aria-label="Manage voices"
      data-testid="notation-voices-manage"
      onClick={function() { setShowManage(true); }}
    >
      Voices
    </Button>
  );

  const menu = (
    <Dropdown.Menu className="notation-voices-menu" align="start">
      <Dropdown.Item
        onClick={function() { setShowManage(true); }}
        data-testid="notation-voices-manage-menu"
      >
        Manage voices…
      </Dropdown.Item>
      <Dropdown.Divider />
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

  const modal = (
    <VoicesManageModal
      show={showManage}
      onHide={function() { setShowManage(false); }}
      tune={tune}
      voiceNames={voiceNames}
      voiceIndex={voiceIndex}
      displayedVoiceIndices={displayedVoiceIndices}
      onVoiceSelect={onVoiceSelect}
      onDisplayedVoicesChange={onDisplayedVoicesChange}
      onVoiceMetaChange={onVoiceNameChange}
      onVoiceNotesChange={onVoiceNotesChange}
      onAddVoice={onAddVoice}
      onDeleteVoice={onDeleteVoice}
    />
  );

  if (showExpanded) {
    const visible = voiceNames.slice(0, Math.min(4, voiceNames.length));
    return (
      <>
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
          {manageButton}
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
        {modal}
      </>
    );
  }

  return (
    <>
      <ButtonGroup className="notation-voices-dropdown">
        {manageButton}
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
      {modal}
    </>
  );
}
