import React, { useEffect, useMemo, useState } from 'react';
import { Button, Form, Modal, Table } from 'react-bootstrap';
import VoiceFillInput from './VoiceFillInput';
import {
  VOICE_CLEFS,
  DEFAULT_VOICE_CLEF,
  DEFAULT_MIDI_PROGRAM,
  parseVoiceMeta,
  formatVoiceMeta,
  parseMidiProgramFromNotes,
  setMidiProgramInNotes,
  listInstrumentOptions,
} from '../notation/voiceMeta';
import { voiceDisplayLabel } from '../notation/notationDisplayAbc';
import DeleteVoiceConfirmModal from './DeleteVoiceConfirmModal';

export default function VoicesManageModal(props) {
  const {
    show,
    onHide,
    tune,
    voiceNames,
    voiceIndex,
    displayedVoiceIndices,
    onVoiceSelect,
    onDisplayedVoicesChange,
    onVoiceMetaChange,
    onVoiceNotesChange,
    onAddVoice,
    onDeleteVoice,
    onReorderVoices,
  } = props;

  const [deleteKey, setDeleteKey] = useState(null);
  const instrumentOptions = useMemo(function() { return listInstrumentOptions(); }, []);
  const displayed = displayedVoiceIndices || [];

  useEffect(function() {
    if (!show) setDeleteKey(null);
  }, [show]);

  if (!voiceNames || !voiceNames.length) return null;

  function voiceAt(key) {
    return tune && tune.voices ? tune.voices[key] : null;
  }

  function isDisplayed(vk) {
    return displayed.indexOf(vk) >= 0;
  }

  function handleDisplayToggle(vk) {
    if (!onDisplayedVoicesChange) return;
    if (isDisplayed(vk)) {
      onDisplayedVoicesChange(displayed.filter(function(i) { return i !== vk; }));
    } else {
      onDisplayedVoicesChange(displayed.concat([vk]).sort(function(a, b) { return a - b; }));
    }
  }

  function updateMeta(key, patch) {
    const voice = voiceAt(key);
    if (!voice || !onVoiceMetaChange) return;
    const current = parseVoiceMeta(voice.meta);
    const next = formatVoiceMeta(Object.assign({}, current, patch));
    onVoiceMetaChange(key, next);
  }

  function updateProgram(key, program) {
    const voice = voiceAt(key);
    if (!voice || !onVoiceNotesChange) return;
    const nextNotes = setMidiProgramInNotes(voice.notes, program);
    onVoiceNotesChange(key, nextNotes.join('\n'), 'Voice instrument');
  }

  function moveVoice(index, delta) {
    if (!onReorderVoices) return;
    const keys = voiceNames.slice();
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= keys.length) return;
    const moved = keys.splice(index, 1)[0];
    keys.splice(nextIndex, 0, moved);
    onReorderVoices(keys);
  }

  return (
    <>
      <Modal show={show} onHide={onHide} size="lg" dialogClassName="voices-manage-modal">
        <Modal.Header closeButton>
          <Modal.Title>Voices</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-muted small mb-3">
            Visible voices appear in the score. The editing voice is where new notes are entered.
            Name and clef write into ABC <code>V:</code>; instrument writes <code>%%MIDI program</code>.
          </p>
          <Table responsive size="sm" className="align-middle mb-0">
            <thead>
              <tr>
                <th scope="col">Order</th>
                <th scope="col">Visible</th>
                <th scope="col">Edit</th>
                <th scope="col">Name</th>
                <th scope="col">Clef</th>
                <th scope="col">Instrument</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {voiceNames.map(function(key, vk) {
                const voice = voiceAt(key) || { meta: '', notes: [''] };
                const parsed = parseVoiceMeta(voice.meta);
                const program = parseMidiProgramFromNotes(voice.notes);
                const label = voiceDisplayLabel(tune, key) || key;
                return (
                  <tr
                    key={key}
                    className={voiceIndex === vk ? 'table-active' : undefined}
                    data-testid={'voices-manage-row-' + key}
                  >
                    <td>
                      <div className="d-flex flex-column gap-1">
                        <Button
                          size="sm"
                          variant="outline-secondary"
                          className="py-0 px-1"
                          disabled={!onReorderVoices || vk === 0}
                          aria-label={'Move ' + label + ' up'}
                          data-testid={'voices-manage-up-' + key}
                          onClick={function() { moveVoice(vk, -1); }}
                        >↑</Button>
                        <Button
                          size="sm"
                          variant="outline-secondary"
                          className="py-0 px-1"
                          disabled={!onReorderVoices || vk === voiceNames.length - 1}
                          aria-label={'Move ' + label + ' down'}
                          data-testid={'voices-manage-down-' + key}
                          onClick={function() { moveVoice(vk, 1); }}
                        >↓</Button>
                      </div>
                    </td>
                    <td>
                      <Form.Check
                        type="checkbox"
                        aria-label={'Show ' + label}
                        data-testid={'voices-manage-visible-' + key}
                        checked={isDisplayed(vk)}
                        onChange={function() { handleDisplayToggle(vk); }}
                      />
                    </td>
                    <td>
                      <Form.Check
                        type="radio"
                        name="voices-manage-edit"
                        aria-label={'Edit ' + label}
                        data-testid={'voices-manage-edit-' + key}
                        checked={voiceIndex === vk}
                        onChange={function() { if (onVoiceSelect) onVoiceSelect(vk); }}
                      />
                    </td>
                    <td>
                      <VoiceFillInput
                        size="sm"
                        value={parsed.name}
                        aria-label={'Name for ' + label}
                        onChange={function(e) {
                          updateMeta(key, { name: e.target.value });
                        }}
                        fieldKind="search"
                        token={props.token}
                        setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
                      />
                    </td>
                    <td>
                      <Form.Select
                        size="sm"
                        value={parsed.clef || DEFAULT_VOICE_CLEF}
                        aria-label={'Clef for ' + label}
                        onChange={function(e) {
                          updateMeta(key, { clef: e.target.value || DEFAULT_VOICE_CLEF });
                        }}
                      >
                        {VOICE_CLEFS.map(function(clef) {
                          return <option key={clef} value={clef}>{clef}</option>;
                        })}
                      </Form.Select>
                    </td>
                    <td>
                      <Form.Select
                        size="sm"
                        value={String(program)}
                        aria-label={'Instrument for ' + label}
                        onChange={function(e) {
                          updateProgram(key, parseInt(e.target.value, 10) || DEFAULT_MIDI_PROGRAM);
                        }}
                      >
                        {instrumentOptions.map(function(opt) {
                          return (
                            <option key={opt.program} value={opt.program}>
                              {opt.label}
                            </option>
                          );
                        })}
                      </Form.Select>
                    </td>
                    <td>
                      <Button
                        size="sm"
                        variant="outline-danger"
                        disabled={!onDeleteVoice || voiceNames.length <= 1}
                        aria-label={'Delete ' + label}
                        onClick={function() { setDeleteKey(key); }}
                      >×</Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Modal.Body>
        <Modal.Footer>
          {onAddVoice ? (
            <Button variant="success" onClick={onAddVoice} data-testid="voices-manage-add">
              Add voice
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onHide}>Close</Button>
        </Modal.Footer>
      </Modal>
      <DeleteVoiceConfirmModal
        show={!!deleteKey}
        voiceLabel={deleteKey ? voiceDisplayLabel(tune, deleteKey) : ''}
        onHide={function() { setDeleteKey(null); }}
        onConfirm={function() {
          const key = deleteKey;
          setDeleteKey(null);
          if (onDeleteVoice && key) onDeleteVoice(key);
        }}
      />
    </>
  );
}
