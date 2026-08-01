import React from 'react';
import { Button } from 'react-bootstrap';
import NotationToolsDropdown from './NotationToolsDropdown';
import NotationVoicesDropdown from './NotationVoicesDropdown';
import NotationClipboardToolbar from './NotationClipboardToolbar';
import NotationMarksDropdown from './NotationMarksDropdown';
import NotationTupletDropdown from './NotationTupletDropdown';
import NotationAccidentalDropdown from './NotationAccidentalDropdown';
import NotationChordSymbolToolbar from './NotationChordSymbolToolbar';
import NotationViewSelector from './NotationViewSelector';
import MidiInputPanel from './MidiInputPanel';
import NotationPlaybackControls from './NotationPlaybackControls';
import NotationBarlinesDropdown from './NotationBarlinesDropdown';

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
    onInsertKeyChange,
    onInsertMeterChange,
    onInsertMeasure,
    onBeamBreak,
    onToggleTie,
    onMarkAction,
    onTupletAction,
    onApplyAccidental,
    onEditChordSymbol,
    onClearChordSymbol,
    onToggleRecord,
    onApplyRecord,
    onDiscardRecord,
    pendingRecordCount,
    expandFlags,
  } = props;

  const expand = expandFlags || {};

  return (
    <div className="notation-toolbar">
      <NotationPlaybackControls
        mediaController={props.mediaController}
        tune={props.tune}
        tunebook={tunebook}
        getSession={props.getSession}
        getLastNoteSelection={props.getLastNoteSelection}
        session={session}
        tempo={props.tempo}
        playbackContext={props.playbackContext}
        playbackControlRef={props.playbackControlRef}
        onRefresh={props.onRefresh}
      />
      <NotationVoicesDropdown
        tune={props.tune}
        voiceNames={props.voiceNames}
        voiceIndex={props.voiceIndex}
        displayedVoiceIndices={props.displayedVoiceIndices}
        onVoiceSelect={props.onVoiceSelect}
        onDisplayedVoicesChange={props.onDisplayedVoicesChange}
        onVoiceNameChange={props.onVoiceNameChange}
        onVoiceNotesChange={props.onVoiceNotesChange}
        onAddVoice={props.onAddVoice}
        onDeleteVoice={props.onDeleteVoice}
        onReorderVoices={props.onReorderVoices}
      />
      <NotationClipboardToolbar
        tunebook={tunebook}
        expanded={!!expand.clipboard}
        hasSelection={!!(session.selection && session.selection.eventIds && session.selection.eventIds.length)}
        clipboardEpoch={props.clipboardEpoch || 0}
        onCopy={function() { if (props.onClipboardAction) props.onClipboardAction('copy'); }}
        onCut={function() { if (props.onClipboardAction) props.onClipboardAction('cut'); }}
        onPaste={function() { if (props.onClipboardAction) props.onClipboardAction('paste'); }}
        onDelete={function() { if (props.onClipboardAction) props.onClipboardAction('deleteToRest'); }}
        onSwap={function() { if (props.onClipboardAction) props.onClipboardAction('swapClipboard'); }}
      />
      {props.historyControls ? (
        <span className="notation-toolbar-history">{props.historyControls}</span>
      ) : null}
      {props.onViewChange ? (
        <NotationViewSelector
          variant="buttonGroup"
          tunebook={tunebook}
          view={props.view}
          onChange={props.onViewChange}
        />
      ) : null}
      <NotationToolsDropdown
        tunebook={tunebook}
        onOpenWizard={onOpenWizard}
        onQuantize={onQuantize}
        onInsertMeasure={onInsertMeasure}
        onBeamBreak={onBeamBreak}
      />
      <NotationBarlinesDropdown
        expanded={!!expand.barlines}
        onInsertBarline={onInsertBarline}
        onInsertKeyChange={onInsertKeyChange}
        onInsertMeterChange={onInsertMeterChange}
      />
      <NotationMarksDropdown
        onToggleTie={onToggleTie}
        onMarkAction={onMarkAction}
        expanded={!!expand.palette}
      />
      <NotationTupletDropdown
        session={session}
        onTupletAction={onTupletAction}
        expanded={!!expand.tuplets}
      />
      {session.slurMode ? (
        <span className="notation-mode-badge" title="Slur mode — select start and end notes" data-testid="notation-mode-badge-slur">Slur</span>
      ) : null}
      <NotationAccidentalDropdown
        session={session}
        dispatch={dispatch}
        tunebook={tunebook}
        onApplyAccidental={onApplyAccidental}
        expanded={!!expand.accidentals}
      />
      <NotationChordSymbolToolbar
        session={session}
        tunebook={tunebook}
        expanded={!!expand.accidentals}
        onEditChord={onEditChordSymbol}
        onClearChord={onClearChordSymbol}
      />
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
      <Button
        size="lg"
        variant={props.showVirtualPiano ? 'success' : 'outline-secondary'}
        title={props.showVirtualPiano ? 'Hide piano keyboard' : 'Show piano keyboard'}
        aria-label={props.showVirtualPiano ? 'Hide piano keyboard' : 'Show piano keyboard'}
        aria-pressed={!!props.showVirtualPiano}
        data-testid="notation-virtual-piano-toggle"
        onClick={function() {
          if (typeof props.onToggleVirtualPiano === 'function') props.onToggleVirtualPiano();
        }}
      >{tunebook && tunebook.icons ? tunebook.icons.piano : 'Piano'}</Button>
      <Button
        size="lg"
        variant="outline-secondary"
        onClick={onOpenHelp}
        title="Notation editor help"
        aria-label="Notation editor help"
      >{tunebook.icons.question}</Button>
    </div>
  );
}
