import React, { useState } from 'react';
import { Button, ButtonGroup, Form } from 'react-bootstrap';
import FieldVoiceFillButton from './FieldVoiceFillButton';
import { voiceDisplayLabel } from '../notation/notationDisplayAbc';
import { parseVoiceMeta, formatVoiceMeta } from '../notation/voiceMeta';
import DeleteVoiceConfirmModal from './DeleteVoiceConfirmModal';

export default function NotationVoiceSelector(props) {
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
    embedded,
  } = props;

  const [deleteIndex, setDeleteIndex] = useState(null);

  if (!voiceNames || voiceNames.length === 0) return null;

  const displayed = displayedVoiceIndices || [];

  function voiceKeyAt(vk) {
    return voiceNames[vk];
  }

  function labelForIndex(vk) {
    return voiceDisplayLabel(tune, voiceKeyAt(vk));
  }

  function metaForIndex(vk) {
    const key = voiceKeyAt(vk);
    const voice = key && tune && tune.voices ? tune.voices[key] : null;
    if (!voice || typeof voice.meta !== 'string') return '';
    return parseVoiceMeta(voice.meta).name;
  }

  function isDisplayed(vk) {
    return displayed.indexOf(vk) >= 0;
  }

  function handleDisplayToggle(vk, e) {
    if (e) e.stopPropagation();
    if (!onDisplayedVoicesChange) return;
    if (isDisplayed(vk)) {
      onDisplayedVoicesChange(displayed.filter(function(i) { return i !== vk; }));
    } else {
      onDisplayedVoicesChange(displayed.concat([vk]).sort(function(a, b) { return a - b; }));
    }
  }

  function handleSelect(vk, e) {
    if (e) e.stopPropagation();
    if (onVoiceSelect) onVoiceSelect(vk);
  }

  function handleNameChange(vk, value, e) {
    if (e) e.stopPropagation();
    const key = voiceKeyAt(vk);
    // Rename must not switch the edited voice (visible ≠ edit).
    if (!onVoiceNameChange || !key) return;
    const voice = tune && tune.voices ? tune.voices[key] : null;
    const current = parseVoiceMeta(voice && voice.meta);
    onVoiceNameChange(key, formatVoiceMeta(Object.assign({}, current, { name: value })));
  }

  function requestDelete(vk, e) {
    if (e) e.stopPropagation();
    setDeleteIndex(vk);
  }

  function confirmDelete() {
    const vk = deleteIndex;
    setDeleteIndex(null);
    const key = voiceKeyAt(vk);
    if (onDeleteVoice && key) onDeleteVoice(key);
  }

  const rootClass = embedded
    ? 'notation-voice-selector notation-voice-selector-embedded'
    : 'notation-voice-selector notation-control-block';

  const addButton = onAddVoice ? (
    <Button
      variant="success"
      className="notation-voice-add-btn"
      onClick={function(e) {
        e.stopPropagation();
        onAddVoice();
      }}
      title="Add voice"
      aria-label="Add voice"
    >+</Button>
  ) : null;

  return (
    <div
      className={rootClass}
      onClick={function(e) { e.stopPropagation(); }}
    >
      {addButton ? (
        <div className={embedded ? 'notation-voice-list-header' : 'notation-voice-list-toolbar'}>
          {addButton}
        </div>
      ) : null}

      <div className="notation-voice-list" role="list" aria-label="Voices">
        {voiceNames.map(function(_voice, vk) {
          const showInDisplay = isDisplayed(vk);
          const isActive = voiceIndex === vk;
          const canDelete = !!onDeleteVoice && voiceNames.length > 1;
          return (
            <ButtonGroup
              key={voiceKeyAt(vk) || vk}
              className={'notation-voice-row-group' + (isActive ? ' notation-voice-row-group-active' : '')}
              role="listitem"
              aria-label={labelForIndex(vk)}
              data-testid={'notation-voice-tab-' + voiceKeyAt(vk)}
            >
              <Button
                type="button"
                variant={showInDisplay ? 'secondary' : 'outline-secondary'}
                className="notation-voice-check-btn"
                aria-pressed={showInDisplay}
                aria-label={(showInDisplay ? 'Hide ' : 'Show ') + labelForIndex(vk) + ' in the score'}
                title={(showInDisplay ? 'Hide ' : 'Show ') + labelForIndex(vk) + ' in the score'}
                onClick={function(e) { handleDisplayToggle(vk, e); }}
              >
                <span className="notation-voice-check-mark" aria-hidden="true">
                  {showInDisplay ? '✓' : ''}
                </span>
              </Button>
              <Form.Control
                type="text"
                className={'notation-voice-name-input' + (isActive ? ' notation-voice-name-input-active' : '')}
                placeholder="Voice name"
                value={metaForIndex(vk)}
                aria-label={'Name for ' + labelForIndex(vk)}
                title="Voice name / ABC V: header metadata"
                onClick={function(e) { handleSelect(vk, e); }}
                onFocus={function(e) { handleSelect(vk, e); }}
                onChange={function(e) { handleNameChange(vk, e.target.value, e); }}
              />
              <FieldVoiceFillButton
                fieldKind="search"
                token={props.token}
                setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
                onFill={function(text) { handleNameChange(vk, text, null); }}
              />
              <Button
                type="button"
                variant="outline-danger"
                className="notation-voice-delete-btn"
                disabled={!canDelete}
                aria-label={'Delete ' + labelForIndex(vk)}
                title={canDelete ? 'Delete voice' : 'Cannot delete the only voice'}
                onClick={function(e) { requestDelete(vk, e); }}
              >×</Button>
            </ButtonGroup>
          );
        })}
      </div>

      <DeleteVoiceConfirmModal
        show={deleteIndex !== null}
        voiceLabel={deleteIndex !== null ? labelForIndex(deleteIndex) : ''}
        onHide={function() { setDeleteIndex(null); }}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
