import React, { useState } from 'react';
import { Button } from 'react-bootstrap';
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
  } = props;

  const [showManage, setShowManage] = useState(false);

  if (!voiceNames || voiceNames.length === 0) return null;

  return (
    <>
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
    </>
  );
}
