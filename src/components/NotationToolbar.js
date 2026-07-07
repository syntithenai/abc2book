import React from 'react';
import { Button, ButtonGroup, Dropdown } from 'react-bootstrap';
import { BARLINE_TOKENS, EDITOR_MODES } from '../notation/notationConstants';
import NotationToolsDropdown from './NotationToolsDropdown';
import NotationVoicesDropdown from './NotationVoicesDropdown';
import NotationMarksDropdown from './NotationMarksDropdown';
import NotationTupletDropdown from './NotationTupletDropdown';
import MidiInputPanel from './MidiInputPanel';

const BARLINE_OPTIONS = [
  { token: BARLINE_TOKENS.SINGLE, label: '|', description: 'Bar line' },
  { token: BARLINE_TOKENS.DOUBLE, label: '||', description: 'Double bar' },
  { token: BARLINE_TOKENS.START_REPEAT, label: '|:', description: 'Start repeat' },
  { token: BARLINE_TOKENS.END_REPEAT, label: ':|', description: 'End repeat' },
  { token: BARLINE_TOKENS.BOTH_REPEAT, label: ':|:', description: 'End/start repeat' },
  { token: BARLINE_TOKENS.FINAL, label: '|]', description: 'Final bar' },
  { token: BARLINE_TOKENS.SECTION, label: '[|', description: 'Section bar' },
];

export default function NotationToolbar(props) {
  const {
    session,
    tunebook,
    midi,
    dispatch,
    onOpenWizard,
    onOpenHelp,
    onQuantize,
    onInsertBarline,
    onToggleTie,
    onMarkAction,
    onTupletAction,
    onToggleRecord,
    onApplyRecord,
    onDiscardRecord,
    pendingRecordCount,
  } = props;

  return (
    <div className="notation-toolbar d-flex flex-wrap align-items-center gap-2">
      <Button
        size="lg"
        variant="outline-secondary"
        onClick={onOpenHelp}
        title="Notation editor help"
        aria-label="Notation editor help"
      >{tunebook.icons.question}</Button>
      <NotationVoicesDropdown
        tune={props.tune}
        voiceNames={props.voiceNames}
        voiceIndex={props.voiceIndex}
        displayedVoiceIndices={props.displayedVoiceIndices}
        onVoiceSelect={props.onVoiceSelect}
        onDisplayedVoicesChange={props.onDisplayedVoicesChange}
        onVoiceNameChange={props.onVoiceNameChange}
        onAddVoice={props.onAddVoice}
        onDeleteVoice={props.onDeleteVoice}
      />
      <NotationToolsDropdown
        tunebook={tunebook}
        onOpenWizard={onOpenWizard}
        onQuantize={onQuantize}
      />
      <Dropdown as={ButtonGroup} className="notation-barline-dropdown">
        <Button
          size="lg"
          variant="outline-secondary"
          className="notation-barline-main-btn"
          title="Bar line (|)"
          onClick={function() { onInsertBarline(BARLINE_TOKENS.SINGLE); }}
          data-testid="notation-barline"
        >|</Button>
        <Dropdown.Toggle
          split
          variant="outline-secondary"
          size="lg"
          title="Choose bar line type"
          data-testid="notation-barline-menu"
          aria-label="Choose bar line type"
        />
        <Dropdown.Menu>
          {BARLINE_OPTIONS.map(function(option) {
            return (
              <Dropdown.Item
                key={option.token}
                title={option.description + ' (' + option.label + ')'}
                onClick={function() { onInsertBarline(option.token); }}
              >
                <span className="notation-barline-menu-label">{option.label}</span>
                {' '}{option.description}
              </Dropdown.Item>
            );
          })}
        </Dropdown.Menu>
      </Dropdown>
      <NotationMarksDropdown onToggleTie={onToggleTie} onMarkAction={onMarkAction} />
      <NotationTupletDropdown session={session} onTupletAction={onTupletAction} />
      {session.slurMode ? (
        <span className="notation-mode-badge" title="Slur mode — select start and end notes" data-testid="notation-mode-badge-slur">Slur</span>
      ) : null}
      {session.mode === EDITOR_MODES.NOTE_INPUT ? (
        <span className="notation-mode-badge notation-mode-badge-input" title="Note input — press A–G or use the piano" data-testid="notation-mode-badge-input">
          Input
        </span>
      ) : null}
      {session.tupletMode ? (
        <span className="notation-mode-badge" title="Tuplet input mode active">
          Tuplet {session.tupletMode.num}
        </span>
      ) : null}
      <MidiInputPanel
        midi={midi}
        session={session}
        dispatch={dispatch}
        tunebook={tunebook}
        onToggleRecord={onToggleRecord}
        onApplyRecord={onApplyRecord}
        onDiscardRecord={onDiscardRecord}
        pendingRecordCount={pendingRecordCount}
      />
    </div>
  );
}
