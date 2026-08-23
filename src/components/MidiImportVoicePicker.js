import React, { useState } from 'react';
import { Button, ButtonGroup, Form } from 'react-bootstrap';
import MidiImportTrackManagerDialog from './MidiImportTrackManagerDialog';

const INLINE_TRACK_LIMIT = 3;

function shortLabel(name) {
  const raw = String(name || 'Track').trim();
  if (raw.length <= 10) return raw;
  return raw.slice(0, 9) + '…';
}

/**
 * ≤3 voices: color toggle buttons (no checkboxes). Click selects for filters;
 * click again on the selected track toggles enabled.
 * Many voices: select dropdown for filter target.
 * Manage is always in the same button group as the track selector.
 */
export default function MidiImportVoicePicker(props) {
  const session = props.session;
  const voices = session.voices || [];
  const selectedVoiceId = props.selectedVoiceId
    || session.selectedVoiceId
    || (voices[0] && voices[0].id);
  const [managerOpen, setManagerOpen] = useState(false);
  const useInline = voices.length > 0 && voices.length <= INLINE_TRACK_LIMIT;

  function selectVoice(voiceId) {
    if (props.onSelectVoice) props.onSelectVoice(voiceId);
  }

  function handleInlineClick(voice) {
    if (selectedVoiceId === voice.id) {
      props.onPatchVoice(voice.id, { enabled: !voice.enabled });
    } else {
      selectVoice(voice.id);
    }
  }

  const manageButton = (
    <Button
      type="button"
      variant="outline-secondary"
      size="sm"
      className="midi-import-tracks-manage"
      title="Track manager"
      aria-label="Open track manager"
      onClick={function() { setManagerOpen(true); }}
    >
      Manage
    </Button>
  );

  return (
    <div className="midi-import-tracks-group d-flex align-items-center gap-2 flex-wrap">
      <span className="midi-import-tracks-label small text-muted fw-semibold">Tracks</span>

      {useInline ? (
        <ButtonGroup size="sm" className="midi-import-tracks-btn-group">
          {voices.map(function(voice) {
            const count = props.noteCountFor ? props.noteCountFor(voice) : 0;
            const color = voice.color || '#888';
            const selected = selectedVoiceId === voice.id;
            const classes = [
              'midi-import-track-toggle',
              'btn',
              'btn-sm',
              voice.enabled ? 'midi-import-track-toggle--on' : 'midi-import-track-toggle--off',
              selected ? 'midi-import-track-toggle--selected' : '',
            ].filter(Boolean).join(' ');
            return (
              <Button
                key={voice.id}
                type="button"
                variant="outline-secondary"
                size="sm"
                className={classes}
                style={{
                  borderColor: color,
                  backgroundColor: voice.enabled ? color + '22' : undefined,
                  boxShadow: selected
                    ? '0 0 0 2px ' + color
                    : (voice.enabled ? 'inset 3px 0 0 ' + color : undefined),
                }}
                title={
                  (voice.displayName || voice.id) + ' · ' + count + ' notes'
                  + (selected ? ' (editing filters; click again to toggle on/off)' : ' (click to edit filters)')
                }
                aria-pressed={!!voice.enabled}
                aria-current={selected ? 'true' : undefined}
                onClick={function() { handleInlineClick(voice); }}
              >
                <span className="midi-import-track-swatch" style={{ background: color }} aria-hidden="true" />
                <span className="midi-import-track-name">{shortLabel(voice.displayName || voice.id)}</span>
              </Button>
            );
          })}
          {manageButton}
        </ButtonGroup>
      ) : (
        <ButtonGroup size="sm" className="midi-import-tracks-btn-group midi-import-tracks-btn-group--select">
          <Form.Select
            size="sm"
            className="midi-import-tracks-select"
            value={selectedVoiceId || ''}
            onChange={function(e) { selectVoice(e.target.value); }}
            aria-label="Select track for filters"
          >
            {voices.map(function(voice) {
              const count = props.noteCountFor ? props.noteCountFor(voice) : 0;
              const onOff = voice.enabled ? 'on' : 'off';
              return (
                <option key={voice.id} value={voice.id}>
                  {(voice.displayName || voice.id) + ' · ' + count + ' · ' + onOff}
                </option>
              );
            })}
          </Form.Select>
          {manageButton}
        </ButtonGroup>
      )}

      <MidiImportTrackManagerDialog
        show={managerOpen}
        voices={voices}
        selectedVoiceId={selectedVoiceId}
        noteCountFor={props.noteCountFor}
        onHide={function() { setManagerOpen(false); }}
        onSelectVoice={selectVoice}
        onPatchVoice={props.onPatchVoice}
        onDuplicateClick={function() {
          setManagerOpen(false);
          if (props.onDuplicateClick) props.onDuplicateClick();
        }}
        onMergeClick={function() {
          setManagerOpen(false);
          if (props.onMergeClick) props.onMergeClick();
        }}
      />
    </div>
  );
}
