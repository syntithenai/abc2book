import React, { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Row, Col } from 'react-bootstrap';
import Abc from './Abc';
import NotationToolbar from './NotationToolbar';
import NotationInputHandler from './NotationInputHandler';
import PianoRollEditor from './PianoRollEditor';
import QuantizeDialog from './QuantizeDialog';
import VirtualPiano from './VirtualPiano';
import GhostNoteOverlay from './GhostNoteOverlay';
import StaffCaretOverlay from './StaffCaretOverlay';
import StaffSelectionOverlay from './StaffSelectionOverlay';
import NotationEditorHelpModal from './NotationEditorHelpModal';
import NotationEditorWalkthroughModal from './NotationEditorWalkthroughModal';
import NotationDurationToolbar from './NotationDurationToolbar';
import NotationVoicesDropdown from './NotationVoicesDropdown';
import NotationViewSelector from './NotationViewSelector';
import WizardOptionsModal from './WizardOptionsModal';
import useAbcjsParser from '../useAbcjsParser';
import { serializeVoiceEvents } from '../notation/abcVoiceSerializer';
import { buildAbcPreviewFromBodies, voiceDisplayLabel, mapAbcClickToVoiceCursor } from '../notation/notationDisplayAbc';
import { activeVoiceIndicesFromTune } from '../abcVoiceViewSettings';
import { notationSessionReducer, createInitialSession } from '../notation/notationSession';
import { serializeVoiceEventsViaParser } from '../notation/abcVoiceSerializer';
import {
  insertMidiAtCaret,
  insertMidiChordAtCaret,
  insertRestAtCaret,
  insertPitchAtCaret,
  pitchFromLetter,
  pitchFromMidi,
  deleteSelectionToRest,
  removeSelection,
  transposeSelection,
  transposeSelectionByStaffSteps,
  changeSelectedDuration,
  scaleDuration,
  moveCaret,
  repeatLast,
  selectEventRange,
  addToneToEvent,
  insertBarlineAtCaret,
  insertSystemBreakAtCaret,
} from '../notation/notationActions';
import {
  copyToClipboard,
  pasteFromClipboard,
  cutToClipboard,
  swapWithClipboard,
  repeatSelectionAtCaret,
} from '../notation/notationClipboard';
import { quantizeVoiceEvents } from '../notation/quantizeVoiceEvents';
import {
  alignSelectionToRecordingGrid,
  matchToTimedMelody,
  applyDownbeatOffset,
  snapToPlaybackRegionStart,
  slideSelection,
} from '../notation/pianoRollAlign';
import { EDITOR_MODES, EDITOR_VIEWS, BARLINE_TOKENS } from '../notation/notationConstants';
import {
  abcCharRangeForEventIndex,
  eventsFromVoiceBody,
  caretIndexForStartBeat,
  eventIndexFromStaffAbcElem,
  eventIndexFromSelectableIndex,
} from '../notation/voiceEventTiming';
import { beatsPerBarFromMeter } from '../notation/beatGrid';
import { caretIndexAndAnchorFromStaffClick, eventIdFromStaffNoteElement, eventIndexFromStaffClick } from '../notation/staffCaretPosition';
import useMidiInput from '../notation/useMidiInput';
import {
  toggleTie,
  toggleDecoration,
  clearSlurOnSelection,
  handleSlurModeClick,
  insertGraceBeforeSelection,
} from '../notation/notationMarks';
import { createEventId } from '../notation/voiceEventModel';
import {
  appendMidiRecordNote,
  midiRecordBufferToEvents,
} from '../notation/notationMidiRecord';
import './NotationEditor.css';

export default function NotationEditor(props) {
  const abcjsParser = useAbcjsParser({ tunebook: props.tunebook });
  const tuneMeta = useMemo(function() {
    return {
      meter: props.tune.meter || '4/4',
      noteLength: props.tune.noteLength || '1/8',
      key: props.tune.key || 'C',
      tempo: props.tune.tempo || 120,
    };
  }, [props.tune]);

  const [session, dispatch] = useReducer(
    notationSessionReducer,
    null,
    function() {
      const initial = createInitialSession(tuneMeta, props.voiceNotes);
      if (props.controlledView) initial.view = props.controlledView;
      return initial;
    }
  );

  const [staffClickAnchor, setStaffClickAnchor] = useState(null);
  const staffRef = useRef(null);
  const staffWrapRef = useRef(null);
  const staffDragTargetRef = useRef(null);
  const staffNoteInputClickRef = useRef(false);

  const focusStaffEditor = useCallback(function() {
    window.setTimeout(function() {
      if (staffRef.current) staffRef.current.focus({ preventScroll: true });
    }, 0);
  }, []);

  const syncSessionAction = useCallback(function(action) {
    sessionRef.current = notationSessionReducer(sessionRef.current, action);
    dispatch(action);
    return sessionRef.current;
  }, []);

  const setCaretIndex = useCallback(function(index) {
    setStaffClickAnchor(null);
    syncSessionAction({ type: 'SET_CARET', index: index });
  }, [syncSessionAction]);
  const [showQuantize, setShowQuantize] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [abcDraft, setAbcDraft] = useState(props.voiceNotes || '');
  const [abcDrafts, setAbcDrafts] = useState(function() {
    const init = {};
    if (props.voiceKey) init[props.voiceKey] = props.voiceNotes || '';
    return init;
  });
  const [displayedVoiceIndices, setDisplayedVoiceIndices] = useState(function() {
    return activeVoiceIndicesFromTune(props.tune, props.voiceNames || []);
  });
  const [toggleSlot, setToggleSlot] = useState(null);
  const [splitRatio, setSplitRatio] = useState(function() {
    try {
      const stored = localStorage.getItem('notationSplitRatio');
      return stored ? Math.max(0.25, Math.min(0.75, parseFloat(stored))) : 0.55;
    } catch (err) {
      return 0.55;
    }
  });
  const splitDragRef = useRef(null);
  const commitDebounce = useRef(null);
  const abcSaveDebounce = useRef(null);
  const sessionRef = useRef(session);
  const midiRecordBufferRef = useRef([]);
  const skipExternalLoad = useRef(false);
  const prevLoadedVoiceKeyRef = useRef(props.voiceKey);
  const textareaRefs = useRef({});
  const syncingTextarea = useRef(false);
  const abcDraftRef = useRef(props.voiceNotes || '');
  const abcDraftsRef = useRef({});
  const abcEditingRef = useRef(false);
  const prevViewRef = useRef(session.view);

  useEffect(function() {
    if (typeof props.onHelpModeChange === 'function') {
      props.onHelpModeChange(!!(showHelp || showWalkthrough));
    }
    return function() {
      if (typeof props.onHelpModeChange === 'function') {
        props.onHelpModeChange(false);
      }
    };
  }, [props.onHelpModeChange, showHelp, showWalkthrough]);

  useEffect(function() { sessionRef.current = session; }, [session]);

  useEffect(function() {
    if (session.mode !== EDITOR_MODES.NOTE_INPUT) {
      setStaffClickAnchor(null);
    }
  }, [session.mode]);

  useEffect(function() {
    midiRecordBufferRef.current = session.midiRecordBuffer || [];
  }, [session.midiRecordBuffer]);

  useEffect(function() {
    abcDraftRef.current = abcDraft;
  }, [abcDraft]);

  useEffect(function() {
    abcDraftsRef.current = abcDrafts;
  }, [abcDrafts]);

  useLayoutEffect(function() {
    if (!props.hideViewSelector) {
      setToggleSlot(document.getElementById('notation-view-toggle-slot'));
    }
  });

  useEffect(function() {
    if (!props.controlledView || props.controlledView === session.view) return;
    dispatch({ type: 'SET_VIEW', view: props.controlledView });
  }, [props.controlledView, session.view]);

  useEffect(function() {
    clearTimeout(abcSaveDebounce.current);
    abcEditingRef.current = false;
    const notes = props.voiceNotes || '';
    abcDraftRef.current = notes;
    setAbcDraft(notes);
    setAbcDrafts(function(prev) {
      return Object.assign({}, prev, { [props.voiceKey]: notes });
    });
    const voiceKeyChanged = prevLoadedVoiceKeyRef.current !== props.voiceKey;
    prevLoadedVoiceKeyRef.current = props.voiceKey;
    if (skipExternalLoad.current && !voiceKeyChanged) {
      skipExternalLoad.current = false;
      return;
    }
    skipExternalLoad.current = false;
    dispatch({ type: 'LOAD_VOICE', tuneMeta: tuneMeta, voiceBody: props.voiceNotes });
  }, [props.voiceKey, props.voiceNotes, tuneMeta]);

  useEffect(function() {
    const next = activeVoiceIndicesFromTune(props.tune, props.voiceNames || []);
    setDisplayedVoiceIndices(function(prev) {
      if (prev.length === next.length && prev.every(function(value, index) { return value === next[index]; })) {
        return prev;
      }
      return next;
    });
  }, [props.tune && props.tune.id, props.tune && props.tune.activeVoices, props.voiceNames]);

  useEffect(function() {
    if (session.view !== EDITOR_VIEWS.ABC) {
      prevViewRef.current = session.view;
      return;
    }
    if (prevViewRef.current !== EDITOR_VIEWS.ABC && !abcEditingRef.current) {
      const el = textareaRefs.current[props.voiceKey];
      if (el) {
        const range = abcCharRangeForEventIndex(session.events, session.caretIndex, tuneMeta);
        syncingTextarea.current = true;
        el.setSelectionRange(range.start, range.end || range.start);
        syncingTextarea.current = false;
      }
    }
    prevViewRef.current = session.view;
  }, [session.view, session.caretIndex, session.events, props.voiceKey, tuneMeta]);

  const commitToAbc = useCallback(function(events, label, voiceKey) {
    const vk = voiceKey != null ? voiceKey : props.voiceKey;
    clearTimeout(commitDebounce.current);
    const eventsSnapshot = events;
    commitDebounce.current = setTimeout(function() {
      const body = serializeVoiceEventsViaParser(eventsSnapshot, tuneMeta, abcjsParser);
      skipExternalLoad.current = true;
      props.onVoiceNotesChange(vk, body, label);
    }, 50);
  }, [abcjsParser, props, tuneMeta]);

  useEffect(function() {
    if (!session.dirty) return;
    const body = serializeVoiceEvents(session.events, tuneMeta).trim();
    const external = String(props.voiceNotes || '').trim();
    if (external === body) {
      dispatch({ type: 'SET_DIRTY', dirty: false });
    }
  }, [props.voiceNotes, session.events, session.dirty, tuneMeta]);

  const flushCommit = useCallback(function(voiceKey) {
    clearTimeout(commitDebounce.current);
    const s = sessionRef.current;
    if (!s || !Array.isArray(s.events)) return;
    const vk = voiceKey != null ? voiceKey : props.voiceKey;
    const body = serializeVoiceEventsViaParser(s.events, tuneMeta, abcjsParser);
    skipExternalLoad.current = true;
    props.onVoiceNotesChange(vk, body, 'Edit notation');
  }, [abcjsParser, props, tuneMeta]);

  const flushAbcDraft = useCallback(function(voiceKey) {
    clearTimeout(abcSaveDebounce.current);
    abcEditingRef.current = false;
    const vk = voiceKey || props.voiceKey;
    const drafts = abcDraftsRef.current;
    const text = drafts[vk] != null ? drafts[vk] : abcDraftRef.current;
    skipExternalLoad.current = true;
    props.onVoiceNotesChange(vk, text, 'Edit ABC text');
  }, [props]);

  const flushAllAbcDrafts = useCallback(function() {
    clearTimeout(abcSaveDebounce.current);
    abcEditingRef.current = false;
    const drafts = abcDraftsRef.current || {};
    Object.keys(drafts).forEach(function(vk) {
      skipExternalLoad.current = true;
      props.onVoiceNotesChange(vk, drafts[vk], 'Edit ABC text');
    });
  }, [props]);

  const applyEvents = useCallback(function(patch, sourceView, label, opts) {
    const options = opts || {};
    const prevCaret = sessionRef.current.caretIndex;
    let next = notationSessionReducer(sessionRef.current, {
      type: 'SET_EVENTS',
      events: patch.events,
      caretIndex: patch.caretIndex,
      lastEvent: patch.lastEvent,
      selection: patch.selection,
      sourceView: sourceView,
    });
    if (patch.tupletMode !== undefined) {
      next = notationSessionReducer(next, { type: 'SET_TUPLET_MODE', tupletMode: patch.tupletMode });
      dispatch({ type: 'SET_TUPLET_MODE', tupletMode: patch.tupletMode });
    }
    if (patch.slurMode !== undefined) {
      next = notationSessionReducer(next, { type: 'SET_SLUR_MODE', value: patch.slurMode });
      dispatch({ type: 'SET_SLUR_MODE', value: patch.slurMode });
    }
    if (patch.slurPendingStartId !== undefined) {
      next = notationSessionReducer(next, { type: 'SET_SLUR_PENDING', id: patch.slurPendingStartId });
      dispatch({ type: 'SET_SLUR_PENDING', id: patch.slurPendingStartId });
    }
    if (patch.accidentalCarry !== undefined) {
      next = notationSessionReducer(next, { type: 'SET_ACCIDENTAL_CARRY', value: patch.accidentalCarry });
      dispatch({ type: 'SET_ACCIDENTAL_CARRY', value: patch.accidentalCarry });
    }
    sessionRef.current = next;
    if (typeof patch.caretIndex === 'number' && patch.caretIndex !== prevCaret) {
      setStaffClickAnchor(null);
    }
    dispatch({
      type: 'SET_EVENTS',
      events: patch.events,
      caretIndex: patch.caretIndex,
      lastEvent: patch.lastEvent,
      selection: patch.selection,
      sourceView: sourceView,
    });
    if (!options.deferCommit) {
      commitToAbc(patch.events, label || 'Edit notation', props.voiceKey);
    }
    focusStaffEditor();
  }, [commitToAbc, focusStaffEditor]);

  const pushMidiRecordNote = useCallback(function(payload, isNoteOn) {
    const buffer = appendMidiRecordNote(midiRecordBufferRef.current, payload, isNoteOn);
    midiRecordBufferRef.current = buffer;
    dispatch({ type: 'SET_MIDI_RECORD', active: true, buffer: buffer });
  }, []);

  const handleMidiNoteOn = useCallback(function(payload) {
    const s = sessionRef.current;
    if (s.midiRecordActive) {
      pushMidiRecordNote({
        midi: payload.midi,
        velocity: payload.velocity,
        timeMs: performance.now(),
      }, true);
      return;
    }
    if (s.mode !== EDITOR_MODES.NOTE_INPUT) return;
    let patch;
    if (payload.chord && payload.midis) {
      patch = insertMidiChordAtCaret(s, payload.midis);
    } else if (payload.addTone) {
      const idx = Math.max(0, s.caretIndex - 1);
      const pitch = pitchFromMidi(payload.midi, s.tuneMeta);
      patch = addToneToEvent(s, idx, pitch);
      if (!patch) patch = insertMidiAtCaret(s, payload.midi);
    } else {
      patch = insertMidiAtCaret(s, payload.midi);
    }
    if (patch) applyEvents(patch, EDITOR_VIEWS.STAFF, 'MIDI note');
  }, [applyEvents, pushMidiRecordNote]);

  const handleMidiNoteOff = useCallback(function(payload) {
    const s = sessionRef.current;
    if (!s.midiRecordActive) return;
    pushMidiRecordNote({
      midi: payload.midi,
      timeMs: performance.now(),
    }, false);
  }, [pushMidiRecordNote]);

  const midi = useMidiInput({
    enabled: session.midiEnabled,
    selectedInputId: session.midiInputId,
    onNoteOn: handleMidiNoteOn,
    onNoteOff: handleMidiNoteOff,
    chordMode: session.midiChordMode,
    chordWindowMs: session.midiChordWindowMs,
    recordActive: session.midiRecordActive,
  });

  function sessionForCaretInsert(session) {
    if (session.mode === EDITOR_MODES.NORMAL && session.selection.eventIds.length) {
      const selId = session.selection.anchorId || session.selection.eventIds[0];
      const selIdx = session.events.findIndex(function(ev) { return ev.id === selId; });
      if (selIdx >= 0) return Object.assign({}, session, { caretIndex: selIdx });
    }
    return session;
  }

  function patchAfterLayoutInsert(session, patch) {
    if (!patch) return patch;
    if (session.mode === EDITOR_MODES.NOTE_INPUT) {
      return Object.assign({}, patch, {
        selection: { eventIds: [], toneIndex: null, anchorId: null },
      });
    }
    if (session.mode !== EDITOR_MODES.NORMAL || !session.selection.eventIds.length) return patch;
    const selId = session.selection.eventIds[0];
    const newIdx = patch.events.findIndex(function(ev) { return ev.id === selId; });
    return Object.assign({}, patch, {
      selection: session.selection,
      caretIndex: newIdx >= 0 ? newIdx : patch.caretIndex,
    });
  }

  function handleShortcutAction(action) {
    const s = sessionRef.current;
    if (action.action === 'undo' || action.action === 'redo') {
      return;
    }
    if (action.action === 'toggleNoteInput') {
      const nextMode = s.mode === EDITOR_MODES.NOTE_INPUT ? EDITOR_MODES.NORMAL : EDITOR_MODES.NOTE_INPUT;
      dispatch({ type: 'SET_MODE', mode: nextMode });
      if (nextMode === EDITOR_MODES.NOTE_INPUT) {
        dispatch({
          type: 'SET_SELECTION',
          selection: { eventIds: [], toneIndex: null, anchorId: null },
        });
        setStaffClickAnchor(null);
        setCaretIndex(s.events.length);
      } else {
        setStaffClickAnchor(null);
      }
      focusStaffEditor();
      return;
    }
    if (action.action === 'exitNoteInput') {
      setStaffClickAnchor(null);
      dispatch({ type: 'SET_MODE', mode: EDITOR_MODES.NORMAL });
      return;
    }
    if (action.action === 'togglePianoRoll') {
      const cycle = [EDITOR_VIEWS.STAFF, EDITOR_VIEWS.PIANO_ROLL, EDITOR_VIEWS.SPLIT];
      const idx = cycle.indexOf(s.view);
      const nextView = cycle[(idx + 1) % cycle.length];
      dispatch({ type: 'SET_VIEW', view: nextView });
      return;
    }
    if (action.action === 'setDuration') {
      dispatch({ type: 'SET_DURATION_KEY', key: action.key });
      return;
    }
    if (action.action === 'toggleDot') {
      dispatch({ type: 'TOGGLE_DOT' });
      return;
    }
    if (action.action === 'toggleSnap') {
      dispatch({ type: 'SET_MIDI_STATE', patch: { snapEnabled: !s.snapEnabled } });
      return;
    }
    if (action.action === 'insertRest') {
      if (s.mode === EDITOR_MODES.NOTE_INPUT) {
        applyEvents(insertRestAtCaret(s), EDITOR_VIEWS.STAFF, 'Insert rest');
      }
      return;
    }
    if (action.action === 'insertBarline') {
      applyEvents(patchAfterLayoutInsert(s, insertBarlineAtCaret(sessionForCaretInsert(s), action.barToken || BARLINE_TOKENS.SINGLE)), s.view, 'Insert bar line');
      return;
    }
    if (action.action === 'insertSystemBreak') {
      applyEvents(patchAfterLayoutInsert(s, insertSystemBreakAtCaret(sessionForCaretInsert(s))), s.view, 'Insert system break');
      return;
    }
    if (action.action === 'insertPitch' || action.action === 'addChordTone') {
      if (s.mode !== EDITOR_MODES.NOTE_INPUT) return;
      dispatch({ type: 'SET_CHORD_BUILD', value: action.action === 'addChordTone' });
      const pitch = pitchFromLetter(action.letter, s);
      const patch = insertPitchAtCaret(
        Object.assign({}, s, { chordBuild: action.action === 'addChordTone' }),
        pitch
      );
      applyEvents(patch, EDITOR_VIEWS.STAFF, 'Insert note');
      return;
    }
    if (action.action === 'accidental') {
      dispatch({ type: 'SET_ACCIDENTAL_CARRY', value: action.value });
      return;
    }
    if (action.action === 'copy') {
      const ids = s.selection.eventIds;
      const evs = s.events.filter(function(ev) { return ids.indexOf(ev.id) >= 0; });
      if (evs.length) copyToClipboard(evs, tuneMeta, props.voiceIndex);
      return;
    }
    if (action.action === 'cut') {
      const ids = s.selection.eventIds;
      if (!ids.length) return;
      const remaining = cutToClipboard(s.events, ids, tuneMeta, props.voiceIndex);
      applyEvents(
        Object.assign({}, s, { events: remaining, selection: { eventIds: [], toneIndex: null, anchorId: null } }),
        EDITOR_VIEWS.STAFF,
        'Cut'
      );
      return;
    }
    if (action.action === 'paste') {
      let caret = s.caretIndex;
      if ((s.view === EDITOR_VIEWS.PIANO_ROLL || s.view === EDITOR_VIEWS.SPLIT) && s.selection.eventIds.length) {
        const ev = s.events.find(function(x) { return x.id === s.selection.eventIds[0]; });
        if (ev) caret = caretIndexForStartBeat(s.events, ev.startBeat || 0);
      }
      const pasted = pasteFromClipboard(s.events, caret, tuneMeta);
      if (pasted) applyEvents(Object.assign({}, s, pasted), s.view, 'Paste');
      return;
    }
    if (action.action === 'swapClipboard') {
      const swapped = swapWithClipboard(s.events, s.selection.eventIds, s.caretIndex, tuneMeta, props.voiceIndex);
      if (swapped) applyEvents(Object.assign({}, s, swapped), EDITOR_VIEWS.STAFF, 'Swap clipboard');
      return;
    }
    if (action.action === 'repeat') {
      const ids = s.selection.eventIds;
      let patch;
      if (ids.length) patch = repeatSelectionAtCaret(s.events, ids, s.caretIndex);
      else patch = repeatLast(s);
      if (patch) applyEvents(Object.assign({}, s, patch), EDITOR_VIEWS.STAFF, 'Repeat');
      return;
    }
    if (action.action === 'prevEvent' || action.action === 'nextEvent') {
      setStaffClickAnchor(null);
      setCaretIndex(moveCaret(s, action.action === 'nextEvent' ? 1 : -1).caretIndex);
      return;
    }
    if (action.action === 'prevMeasure' || action.action === 'nextMeasure') {
      const bpb = beatsPerBarFromMeter(tuneMeta.meter);
      const cur = s.events[s.caretIndex];
      const beat = cur ? (cur.startBeat || 0) : 0;
      const target = action.action === 'nextMeasure'
        ? Math.floor(beat / bpb + 1) * bpb
        : Math.floor(beat / bpb - 1) * bpb;
      let idx = 0;
      for (let i = 0; i < s.events.length; i += 1) {
        if ((s.events[i].startBeat || 0) >= target) { idx = i; break; }
        idx = i + 1;
      }
      setStaffClickAnchor(null);
      setCaretIndex(idx);
      return;
    }
    if (action.action === 'transposeChromatic' || action.action === 'transposeOctave' || action.action === 'transposeDiatonic') {
      let delta = action.delta;
      if (action.action === 'transposeOctave') delta *= 12;
      if (action.action === 'transposeDiatonic') delta *= 2;
      applyEvents(transposeSelection(s, delta, s.selection.toneIndex), EDITOR_VIEWS.STAFF, 'Transpose');
      return;
    }
    if (action.action === 'deleteToRest') {
      const patch = deleteSelectionToRest(s, { backward: action.backward !== false });
      if (patch) applyEvents(patch, EDITOR_VIEWS.STAFF, 'Delete to rest');
      return;
    }
    if (action.action === 'removeRange') {
      const patch = removeSelection(s);
      if (patch) applyEvents(patch, EDITOR_VIEWS.STAFF, 'Remove');
      return;
    }
    if (action.action === 'toggleTie') {
      const patch = toggleTie(s);
      if (patch) applyEvents(patch, EDITOR_VIEWS.STAFF, 'Toggle tie');
      return;
    }
    if (action.action === 'halveDurationDotAware' || action.action === 'doubleDurationDotAware') {
      applyEvents(scaleDuration(s, action.action.includes('halve') ? 0.5 : 2, true), EDITOR_VIEWS.STAFF, 'Change duration');
      return;
    }
    if (action.action === 'halveDuration' || action.action === 'doubleDuration') {
      applyEvents(scaleDuration(s, action.action === 'halveDuration' ? 0.5 : 2, false), EDITOR_VIEWS.STAFF, 'Change duration');
      return;
    }
    if (action.action === 'setDuration' && s.selection.eventIds.length) {
      applyEvents(changeSelectedDuration(s, action.key, s.dotted), EDITOR_VIEWS.STAFF, 'Change duration');
    }
  }

  function handleAbcPreviewClick(abcelem, tuneNumber, classes, analysis, drag, mouseEvent, renderedAbc) {
    if (!abcelem || abcelem.startChar == null) return;
    const voiceIdx = analysis && typeof analysis.voice === 'number' ? analysis.voice : 0;
    const mapped = mapAbcClickToVoiceCursor(
      renderedAbc || abcPreviewAbc,
      displayedVoiceKeys,
      voiceIdx,
      abcelem.startChar
    );
    if (!mapped || !mapped.voiceKey) return;
    const voiceKey = mapped.voiceKey;
    const voiceIdxInTune = voiceNames.indexOf(voiceKey);
    if (voiceIdxInTune >= 0 && voiceIdxInTune !== props.voiceIndex) {
      handleVoiceSelect(voiceIdxInTune);
    }
    const textareaEl = textareaRefs.current[voiceKey];
    if (!textareaEl) return;
    const text = textareaEl.value || '';
    const pos = Math.max(0, Math.min(mapped.offset, text.length));
    window.setTimeout(function() {
      const el = textareaRefs.current[voiceKey];
      if (!el) return;
      el.focus();
      el.setSelectionRange(pos, pos);
    }, 0);
  }

  function placeNoteInputCaretFromPointer(e, analysis) {
    const s = sessionRef.current;
    const wrap = staffWrapRef.current;
    if (!wrap || s.mode !== EDITOR_MODES.NOTE_INPUT) return false;

    const voiceStaffIdx = Math.max(0, displayedVoiceKeys.indexOf(props.voiceKey));
    const clickPos = caretIndexAndAnchorFromStaffClick(wrap, s.events, e, analysis, voiceStaffIdx);
    if (!clickPos) return false;

    syncSessionAction({ type: 'SET_CARET', index: clickPos.caretIndex });
    if (clickPos.anchor) setStaffClickAnchor(clickPos.anchor);
    else setStaffClickAnchor(null);
    syncSessionAction({
      type: 'SET_SELECTION',
      selection: { eventIds: [], toneIndex: null, anchorId: null },
    });
    focusStaffEditor();
    return true;
  }

  function staffPointerAnalysis(e) {
    const noteEl = e.target && e.target.closest && e.target.closest('.abcjs-note, .abcjs-rest');
    return noteEl ? { selectableElement: noteEl } : null;
  }

  function handleStaffWrapPointerDown(e) {
    const s = sessionRef.current;
    const pointerAnalysis = staffPointerAnalysis(e);
    if (s.mode !== EDITOR_MODES.NOTE_INPUT) {
      const wrap = staffWrapRef.current;
      if (wrap && wrap.contains(e.target) && e.button === 0) {
        const voiceStaffIdx = Math.max(0, displayedVoiceKeys.indexOf(props.voiceKey));
        const eventId = eventIdFromStaffNoteElement(wrap, s.events, e, pointerAnalysis, voiceStaffIdx);
        staffDragTargetRef.current = eventId || null;
      }
      return;
    }

    const wrap = staffWrapRef.current;
    if (!wrap || !wrap.contains(e.target)) return;

    if (e.button === 2) {
      e.preventDefault();
      e.stopPropagation();
      const voiceStaffIdx = Math.max(0, displayedVoiceKeys.indexOf(props.voiceKey));
      const clickPos = caretIndexAndAnchorFromStaffClick(wrap, s.events, e, pointerAnalysis, voiceStaffIdx);
      const idx = clickPos ? clickPos.caretIndex : s.caretIndex;
      applyEvents(insertRestAtCaret(Object.assign({}, s, { caretIndex: idx })), EDITOR_VIEWS.STAFF, 'Insert rest');
      setStaffClickAnchor(null);
      return;
    }

    if (e.button !== 0) return;

    if (e.shiftKey && s.selection.anchorId) {
      return;
    }

    if (placeNoteInputCaretFromPointer(e, null)) {
      staffNoteInputClickRef.current = true;
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function handleStaffClick(abcelem, tuneNumber, classes, analysis, drag, mouseEvent, renderedAbc) {
    const s = sessionRef.current;
    const voiceIdx = analysis && typeof analysis.voice === 'number' ? analysis.voice : 0;
    const fullAbc = renderedAbc || displayAbc;
    function resolveEventIndex() {
      return eventIndexFromStaffAbcElem(
        s.events,
        tuneMeta,
        fullAbc,
        displayedVoiceKeys,
        voiceIdx,
        abcelem,
        analysis
      );
    }

    if (drag && typeof drag.step === 'number' && drag.step !== 0 && s.mode !== EDITOR_MODES.NOTE_INPUT) {
      let dragEv = null;
      let dragIdx = null;
      if (staffDragTargetRef.current) {
        dragIdx = s.events.findIndex(function(ev) { return ev.id === staffDragTargetRef.current; });
        if (dragIdx >= 0) dragEv = s.events[dragIdx];
      }
      if (!dragEv) {
        dragIdx = resolveEventIndex();
        dragEv = dragIdx >= 0 ? s.events[dragIdx] : null;
      }
      if (!dragEv && drag && typeof drag.index === 'number') {
        dragIdx = eventIndexFromSelectableIndex(s.events, drag.index);
        dragEv = dragIdx >= 0 ? s.events[dragIdx] : null;
      }
      staffDragTargetRef.current = null;
      if (dragEv && (dragEv.type === 'note' || dragEv.type === 'chord')) {
        const sessionWithSelection = Object.assign({}, s, {
          selection: { eventIds: [dragEv.id], toneIndex: null, anchorId: dragEv.id },
        });
        applyEvents(
          transposeSelectionByStaffSteps(sessionWithSelection, drag.step, null),
          EDITOR_VIEWS.STAFF,
          'Drag pitch'
        );
        setCaretIndex(dragIdx != null && dragIdx >= 0 ? dragIdx : s.caretIndex);
      }
      return;
    }

    if (drag && typeof drag.step === 'number') {
      staffDragTargetRef.current = null;
    }

    const idx = eventIndexFromStaffClick(
      staffWrapRef && staffWrapRef.current ? staffWrapRef.current : null,
      s.events,
      mouseEvent,
      abcelem,
      analysis,
      voiceIdx,
      tuneMeta,
      fullAbc,
      displayedVoiceKeys
    );
    const ev = idx < s.events.length ? s.events[idx] : null;
    if (s.slurMode && ev) {
      const slurPatch = handleSlurModeClick(s, ev.id);
      if (slurPatch && slurPatch.events) {
        applyEvents(slurPatch, EDITOR_VIEWS.STAFF, 'Slur');
      } else if (slurPatch) {
        const next = notationSessionReducer(s, { type: 'SET_SLUR_PENDING', id: slurPatch.slurPendingStartId });
        sessionRef.current = next;
        dispatch({ type: 'SET_SLUR_PENDING', id: slurPatch.slurPendingStartId });
      }
      return;
    }
    if (s.mode === EDITOR_MODES.NOTE_INPUT) {
      if (staffNoteInputClickRef.current) {
        staffNoteInputClickRef.current = false;
        return;
      }
      if (mouseEvent && mouseEvent.shiftKey && s.selection.anchorId) {
        const targetEv = ev || (idx > 0 ? s.events[idx - 1] : null);
        const ids = selectEventRange(s.events, s.selection.anchorId, targetEv && targetEv.id);
        dispatch({ type: 'SET_SELECTION', selection: { eventIds: ids, toneIndex: null, anchorId: s.selection.anchorId } });
        return;
      }
      if (mouseEvent && mouseEvent.button === 2) {
        applyEvents(insertRestAtCaret(Object.assign({}, s, { caretIndex: idx })), EDITOR_VIEWS.STAFF, 'Insert rest');
        setStaffClickAnchor(null);
        return;
      }
      placeNoteInputCaretFromPointer(mouseEvent, analysis);
      return;
    }
    if (mouseEvent && mouseEvent.shiftKey && s.selection.anchorId) {
      const targetEv = ev || (idx > 0 ? s.events[idx - 1] : null);
      const ids = selectEventRange(s.events, s.selection.anchorId, targetEv && targetEv.id);
      dispatch({ type: 'SET_SELECTION', selection: { eventIds: ids, toneIndex: null, anchorId: s.selection.anchorId } });
      return;
    }
    if (!ev || (ev.type !== 'note' && ev.type !== 'chord')) {
      setCaretIndex(idx);
      syncSessionAction({ type: 'SET_SELECTION', selection: { eventIds: [], toneIndex: null, anchorId: null } });
      return;
    }
    syncSessionAction({
      type: 'SET_SELECTION',
      selection: {
        eventIds: [ev.id],
        toneIndex: mouseEvent && mouseEvent.shiftKey ? 0 : null,
        anchorId: ev.id,
      },
    });
    setCaretIndex(idx);
    focusStaffEditor();
  }

  function handleAbcTextChange(voiceKey, value) {
    abcEditingRef.current = true;
    abcDraftRef.current = value;
    setAbcDraft(value);
    setAbcDrafts(function(prev) {
      return Object.assign({}, prev, { [voiceKey]: value });
    });
    clearTimeout(abcSaveDebounce.current);
    abcSaveDebounce.current = setTimeout(function() {
      skipExternalLoad.current = true;
      props.onVoiceNotesChange(voiceKey, value, 'Edit ABC text');
      if (voiceKey === props.voiceKey) {
        const parsed = eventsFromVoiceBody(value, tuneMeta);
        dispatch({
          type: 'SET_EVENTS',
          events: parsed,
          sourceView: EDITOR_VIEWS.ABC,
        });
      }
      abcEditingRef.current = false;
    }, 300);
  }

  function voiceNotesForKey(voiceKey) {
    if (voiceKey === props.voiceKey) return props.voiceNotes || '';
    const voice = props.tune && props.tune.voices && props.tune.voices[voiceKey];
    if (!voice) return '';
    return Array.isArray(voice.notes) ? voice.notes.join('\n') : String(voice.notes || '');
  }

  function handleDisplayedVoicesChange(indices) {
    const nextIndices = Array.isArray(indices) ? indices.slice().sort(function(a, b) { return a - b; }) : [];
    setDisplayedVoiceIndices(nextIndices);
    const voiceNamesList = props.voiceNames || [];
    const activeVoices = nextIndices
      .map(function(vi) { return voiceNamesList[vi]; })
      .filter(Boolean);
    if (props.onActiveVoicesChange) props.onActiveVoicesChange(activeVoices);
  }

  function handleVoiceSelect(index) {
    const leavingVoiceKey = props.voiceKey;
    // ABC Notes is source of truth for its textarea; staff/roll commit via events.
    // Always running flushCommit after ABC edits used to drop chord symbols and
    // other text the event model did not round-trip.
    if (sessionRef.current.view === EDITOR_VIEWS.ABC) {
      flushAbcDraft(leavingVoiceKey);
    } else {
      flushCommit(leavingVoiceKey);
    }
    if (props.onVoiceSelect) props.onVoiceSelect(index);
  }

  function insertLayout(actionFn, label) {
    const s = sessionRef.current;
    const patch = actionFn(sessionForCaretInsert(s));
    if (patch) applyEvents(patchAfterLayoutInsert(s, patch), s.view, label);
  }

  function handleToggleTie() {
    const patch = toggleTie(sessionRef.current);
    if (patch) applyEvents(patch, EDITOR_VIEWS.STAFF, 'Toggle tie');
  }

  function handleMarkAction(key) {
    const s = sessionRef.current;
    if (key === '_tie') {
      handleToggleTie();
      return;
    }
    if (key === '_slurMode') {
      const next = notationSessionReducer(s, { type: 'SET_SLUR_MODE', value: !s.slurMode });
      sessionRef.current = next;
      dispatch({ type: 'SET_SLUR_MODE', value: !s.slurMode });
      return;
    }
    if (key === '_clearSlur') {
      const patch = clearSlurOnSelection(s);
      if (patch) applyEvents(patch, EDITOR_VIEWS.STAFF, 'Clear slur');
      return;
    }
    const patch = toggleDecoration(s, key);
    if (patch) applyEvents(patch, EDITOR_VIEWS.STAFF, 'Toggle mark');
  }

  function handleTupletAction(action) {
    const s = sessionRef.current;
    if (action === '_endTuplet') {
      dispatch({ type: 'SET_TUPLET_MODE', tupletMode: null });
      return;
    }
    if (action === '_triplet') {
      dispatch({
        type: 'SET_TUPLET_MODE',
        tupletMode: {
          num: 3, den: 2, groupId: createEventId('tup'), notesEntered: 0, size: 3,
        },
      });
      return;
    }
    if (action === '_graceAcci') {
      const patch = insertGraceBeforeSelection(s, true);
      if (patch) applyEvents(patch, EDITOR_VIEWS.STAFF, 'Grace note');
      return;
    }
    if (action === '_graceApp') {
      const patch = insertGraceBeforeSelection(s, false);
      if (patch) applyEvents(patch, EDITOR_VIEWS.STAFF, 'Grace note');
      return;
    }
    if (action && action.num) {
      dispatch({
        type: 'SET_TUPLET_MODE',
        tupletMode: {
          num: action.num,
          den: action.den,
          groupId: createEventId('tup'),
          notesEntered: 0,
          size: action.num,
        },
      });
    }
  }

  function handleToggleRecord() {
    const s = sessionRef.current;
    if (s.midiRecordActive) {
      dispatch({ type: 'SET_MIDI_RECORD', active: false, buffer: midiRecordBufferRef.current });
      return;
    }
    midiRecordBufferRef.current = [];
    dispatch({ type: 'SET_MIDI_RECORD', active: true, buffer: [] });
  }

  function handleApplyRecord() {
    const s = sessionRef.current;
    const baseOpts = s.lastQuantizeOptions || {
      strength: 1,
      slotsPerBeat: s.snapSlotsPerBeat || 4,
      quantizeStart: true,
      quantizeDuration: true,
    };
    const beatTimes = baseOpts.useRecordingGrid && props.tune.timedMelody
      ? props.tune.timedMelody.beatTimes
      : null;
    const result = midiRecordBufferToEvents(midiRecordBufferRef.current, s, Object.assign({}, baseOpts, {
      beatTimes: beatTimes,
    }));
    applyEvents(Object.assign({}, s, result), EDITOR_VIEWS.STAFF, 'MIDI record');
    midiRecordBufferRef.current = [];
    dispatch({ type: 'SET_MIDI_RECORD', active: false, buffer: [] });
  }

  function handleDiscardRecord() {
    midiRecordBufferRef.current = [];
    dispatch({ type: 'SET_MIDI_RECORD', active: false, buffer: [] });
  }

  const pendingRecordCount = (session.midiRecordBuffer || []).filter(function(n) {
    return n.endMs != null;
  }).length;

  const liveVoiceBody = useMemo(function() {
    return serializeVoiceEvents(session.events, tuneMeta);
  }, [session.events, tuneMeta]);

  const displayedVoiceKeys = useMemo(function() {
    const voiceNames = props.voiceNames || [];
    return displayedVoiceIndices
      .map(function(vi) { return voiceNames[vi]; })
      .filter(Boolean);
  }, [props.voiceNames, displayedVoiceIndices]);

  function voiceBodyForDisplay(voiceKey) {
    if (session.view === EDITOR_VIEWS.ABC) {
      if (abcDrafts[voiceKey] != null) return abcDrafts[voiceKey];
      return voiceNotesForKey(voiceKey);
    }
    if (voiceKey === props.voiceKey) {
      if (session.dirty) return liveVoiceBody;
      return voiceNotesForKey(voiceKey);
    }
    return voiceNotesForKey(voiceKey);
  }

  const displayAbc = useMemo(function() {
    const bodies = {};
    displayedVoiceKeys.forEach(function(vk) {
      bodies[vk] = voiceBodyForDisplay(vk);
    });
    const staffPlaceholder = session.view === EDITOR_VIEWS.STAFF || session.view === EDITOR_VIEWS.SPLIT;
    return buildAbcPreviewFromBodies(props.tune, props.tunebook, displayedVoiceKeys, bodies, {
      staffPlaceholder: staffPlaceholder,
    });
  }, [props.tune, props.tunebook, displayedVoiceKeys, liveVoiceBody, props.voiceKey, abcDrafts, props.voiceNotes, session.view, session.dirty]);

  const abcPreviewAbc = displayAbc;

  const backgroundPianoRollEvents = useMemo(function() {
    const voiceNames = props.voiceNames || [];
    const activeIndex = props.voiceIndex || 0;
    let merged = [];
    displayedVoiceIndices.forEach(function(vi) {
      if (vi === activeIndex) return;
      const vk = voiceNames[vi];
      if (!vk) return;
      const body = voiceBodyForDisplay(vk);
      merged = merged.concat(eventsFromVoiceBody(body, tuneMeta));
    });
    return merged;
  }, [
    displayedVoiceIndices,
    props.voiceIndex,
    props.voiceNames,
    props.voiceKey,
    liveVoiceBody,
    abcDrafts,
    props.voiceNotes,
    tuneMeta,
    session.dirty,
    session.view,
  ]);

  const voiceNames = props.voiceNames || [];
  const isStaffView = session.view === EDITOR_VIEWS.STAFF;
  const isSplitView = session.view === EDITOR_VIEWS.SPLIT;
  const isPianoRollView = session.view === EDITOR_VIEWS.PIANO_ROLL;
  const isStaffLikeView = isStaffView || isSplitView;
  const isPianoRollVisible = isPianoRollView || isSplitView;
  const isAbcView = session.view === EDITOR_VIEWS.ABC;
  const hasRecordingGrid = !!(props.tune.timedMelody && props.tune.timedMelody.beatTimes && props.tune.timedMelody.beatTimes.length);

  function handlePianoRollSelect(eventId, opts) {
    const s = sessionRef.current;
    const eventIds = opts && opts.eventIds ? opts.eventIds : [eventId];
    const ev = s.events.find(function(x) { return x.id === eventId; });
    const caretIndex = ev ? caretIndexForStartBeat(s.events, ev.startBeat || 0) : s.caretIndex;
    syncSessionAction({
      type: 'SET_SELECTION',
      selection: { eventIds: eventIds, toneIndex: null, anchorId: eventId },
    });
    setCaretIndex(caretIndex);
  }

  function handlePianoRollAlign(action) {
    const s = sessionRef.current;
    const ids = s.selection.eventIds || [];
    let next = s.events;
    const beatTimes = props.tune.timedMelody && props.tune.timedMelody.beatTimes
      ? props.tune.timedMelody.beatTimes
      : null;

    if (action === 'alignGrid' && beatTimes) {
      next = alignSelectionToRecordingGrid(next, ids, beatTimes, Object.assign({}, tuneMeta, {
        strength: 1,
        slotsPerBeat: s.snapSlotsPerBeat || 4,
      }));
    } else if (action === 'matchMelody' && props.tune.timedMelody) {
      next = matchToTimedMelody(next, ids, props.tune.timedMelody, tuneMeta, { toleranceBeats: 0.5 });
    } else if (action === 'slideSelection') {
      const selected = ids.length
        ? next.filter(function(ev) { return ids.indexOf(ev.id) >= 0; })
        : next.filter(function(ev) { return ev.type === 'note' || ev.type === 'chord'; });
      if (selected.length) {
        const start = Math.min.apply(null, selected.map(function(ev) { return ev.startBeat || 0; }));
        const end = Math.max.apply(null, selected.map(function(ev) {
          return (ev.startBeat || 0) + (ev.durationBeats || 0);
        }));
        next = slideSelection(next, start, end, 0.25, tuneMeta);
      }
    } else if (action === 'downbeatFromPlayhead' && props.mediaController) {
      const progress = props.mediaController.getPlaybackProgress ? props.mediaController.getPlaybackProgress() : null;
      if (progress) {
        const linkStart = props.mediaController.getLinkStartAt ? props.mediaController.getLinkStartAt() : 0;
        const seconds = Math.max(0, (progress.currentTime || 0) - linkStart);
        const beat = beatTimes && beatTimes.length
          ? seconds * (tuneMeta.tempo || 120) / 60
          : seconds * (tuneMeta.tempo || 120) / 60;
        const minStart = next.reduce(function(min, ev) {
          if (ev.type !== 'note' && ev.type !== 'chord') return min;
          return Math.min(min, ev.startBeat || 0);
        }, Number.POSITIVE_INFINITY);
        if (minStart < Number.POSITIVE_INFINITY) {
          next = applyDownbeatOffset(next, tuneMeta, beat - minStart);
        }
      }
    } else if (action === 'snapRegionStart' && props.mediaController) {
      const linkStart = props.mediaController.getLinkStartAt ? props.mediaController.getLinkStartAt() : 0;
      const regionBeat = linkStart * (tuneMeta.tempo || 120) / 60;
      next = snapToPlaybackRegionStart(next, ids, regionBeat, tuneMeta);
    }

    applyEvents(Object.assign({}, s, { events: next }), s.view, 'Align notes');
  }

  function handlePianoRollChange(events, caretIndex, opts) {
    const s = sessionRef.current;
    applyEvents(
      Object.assign({}, s, {
        events: events,
        caretIndex: typeof caretIndex === 'number' ? caretIndex : s.caretIndex,
      }),
      sessionRef.current.view,
      (opts && opts.historyLabel) || 'Piano roll edit',
      opts
    );
  }

  function handleSplitResizerPointerDown(e) {
    e.preventDefault();
    const container = e.currentTarget.parentElement;
    if (!container) return;
    splitDragRef.current = {
      startY: e.clientY,
      startRatio: splitRatio,
      height: container.getBoundingClientRect().height,
    };
    function onMove(moveEvent) {
      const drag = splitDragRef.current;
      if (!drag) return;
      const delta = moveEvent.clientY - drag.startY;
      const next = Math.max(0.25, Math.min(0.75, drag.startRatio + delta / drag.height));
      setSplitRatio(next);
    }
    function onUp() {
      splitDragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      try {
        localStorage.setItem('notationSplitRatio', String(splitRatio));
      } catch (err) { /* ignore */ }
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  useEffect(function() {
    try {
      localStorage.setItem('notationSplitRatio', String(splitRatio));
    } catch (err) { /* ignore */ }
  }, [splitRatio]);

  useEffect(function() {
    if (process.env.NODE_ENV === 'production') return undefined;
    window.__abc2bookNotationTest = {
      getVoiceAbc: function() {
        return serializeVoiceEvents(sessionRef.current.events, tuneMeta);
      },
      getSessionEvents: function() {
        return JSON.parse(JSON.stringify(sessionRef.current.events));
      },
      getSelection: function() {
        return Object.assign({}, sessionRef.current.selection);
      },
      getMode: function() {
        return sessionRef.current.mode;
      },
      getView: function() {
        return sessionRef.current.view;
      },
      getCaretIndex: function() {
        return sessionRef.current.caretIndex;
      },
      getVoiceKey: function() {
        return props.voiceKey;
      },
      getDurationKey: function() {
        return sessionRef.current.durationKey;
      },
      getDotted: function() {
        return sessionRef.current.dotted;
      },
      getAccidentalCarry: function() {
        return sessionRef.current.accidentalCarry;
      },
      getTupletMode: function() {
        return sessionRef.current.tupletMode
          ? JSON.parse(JSON.stringify(sessionRef.current.tupletMode))
          : null;
      },
      getSlurMode: function() {
        return sessionRef.current.slurMode;
      },
      getSlurPendingStartId: function() {
        return sessionRef.current.slurPendingStartId;
      },
      getSnapEnabled: function() {
        return sessionRef.current.snapEnabled;
      },
      getPianoRollTool: function() {
        return sessionRef.current.pianoRollTool;
      },
      selectNoteByStep: function(stepLetter) {
        const s = sessionRef.current;
        let targetIdx = -1;
        for (let i = 0; i < s.events.length; i += 1) {
          const ev = s.events[i];
          if ((ev.type === 'note' || ev.type === 'chord') && ev.pitch && ev.pitch.step === stepLetter) {
            targetIdx = i;
            break;
          }
        }
        if (targetIdx < 0) return false;
        const ev = s.events[targetIdx];
        const selection = { eventIds: [ev.id], toneIndex: null, anchorId: ev.id };
        let next = notationSessionReducer(sessionRef.current, { type: 'SET_SELECTION', selection: selection });
        next = notationSessionReducer(next, { type: 'SET_CARET', index: targetIdx });
        sessionRef.current = next;
        dispatch({ type: 'SET_SELECTION', selection: selection });
        dispatch({ type: 'SET_CARET', index: targetIdx });
        return true;
      },
      setCaretIndex: function(index) {
        const idx = Math.max(0, Math.min(index, sessionRef.current.events.length));
        const next = notationSessionReducer(sessionRef.current, { type: 'SET_CARET', index: idx });
        sessionRef.current = next;
        dispatch({ type: 'SET_CARET', index: idx });
        return idx;
      },
      setCaretAtEnd: function() {
        const len = sessionRef.current.events.length;
        const next = notationSessionReducer(sessionRef.current, { type: 'SET_CARET', index: len });
        sessionRef.current = next;
        dispatch({ type: 'SET_CARET', index: len });
        return len;
      },
    };
    return function() {
      delete window.__abc2bookNotationTest;
    };
  }, [tuneMeta, props.voiceKey]);

  const staffAbcSelectTypes = session.mode === EDITOR_MODES.NOTE_INPUT ? 'clickable' : ['note'];

  const activeVoiceStaffIndex = useMemo(function() {
    const idx = displayedVoiceKeys.indexOf(props.voiceKey);
    return idx >= 0 ? idx : 0;
  }, [displayedVoiceKeys, props.voiceKey]);

  const staffPanel = (
      <div
      ref={staffWrapRef}
      className={'notation-staff-wrap' + (session.mode === EDITOR_MODES.NOTE_INPUT ? ' notation-staff-wrap--note-input' : '')}
      data-testid="notation-staff-wrap"
      onPointerDownCapture={handleStaffWrapPointerDown}
      onContextMenu={function(e) {
        if (session.mode === EDITOR_MODES.NOTE_INPUT) e.preventDefault();
      }}
    >
      <Abc
        key={'notation-staff-' + session.mode}
        showRepeats={true}
        mediaController={props.mediaController}
        audioRenderTimeout={30000}
        tunebook={props.tunebook}
        abc={displayAbc}
        onWarnings={props.onWarnings}
        distempo={tuneMeta.tempo > 0 ? tuneMeta.tempo : null}
        showTempoSlider={true}
        editableTempo={true}
        meter={tuneMeta.meter}
        dragging={session.mode !== EDITOR_MODES.NOTE_INPUT}
        selectTypes={staffAbcSelectTypes}
        onClick={handleStaffClick}
        suppressPlaybackSeek={true}
      />
      <StaffCaretOverlay
        containerRef={staffWrapRef}
        session={session}
        displayAbc={displayAbc}
        voiceStaffIndex={activeVoiceStaffIndex}
        clickAnchor={staffClickAnchor}
      />
      <StaffSelectionOverlay
        containerRef={staffWrapRef}
        session={session}
        displayAbc={displayAbc}
        voiceStaffIndex={activeVoiceStaffIndex}
      />
      <GhostNoteOverlay session={session} />
    </div>
  );

  const pianoRollPanel = (
    <PianoRollEditor
      session={session}
      tuneMeta={tuneMeta}
      tune={props.tune}
      mediaController={props.mediaController}
      backgroundEvents={backgroundPianoRollEvents}
      hasRecordingGrid={hasRecordingGrid}
      dispatch={dispatch}
      onSelect={handlePianoRollSelect}
      onChange={handlePianoRollChange}
      onFlushCommit={flushCommit}
      onQuantize={function() { setShowQuantize(true); }}
      onAlignAction={handlePianoRollAlign}
    />
  );

  const viewToggle = !props.hideViewSelector ? (
    <NotationViewSelector
      tunebook={props.tunebook}
      view={session.view}
      onChange={function(view) { dispatch({ type: 'SET_VIEW', view: view }); }}
    />
  ) : null;

  return (
    <div
      className={'notation-editor'
        + (isStaffLikeView ? ' notation-editor-staff-view' : '')
        + (session.mode === EDITOR_MODES.NOTE_INPUT ? ' notation-editor-note-input' : '')}
      ref={staffRef}
      tabIndex={0}
      data-testid="notation-editor"
    >
      {viewToggle && (toggleSlot ? createPortal(viewToggle, toggleSlot) : viewToggle)}

      {!isStaffLikeView ? (
        <div className="notation-nonstaff-controls mb-2">
          <NotationVoicesDropdown
            tune={props.tune}
            voiceNames={voiceNames}
            voiceIndex={props.voiceIndex}
            displayedVoiceIndices={displayedVoiceIndices}
            onVoiceSelect={handleVoiceSelect}
            onDisplayedVoicesChange={handleDisplayedVoicesChange}
            onVoiceNameChange={props.onVoiceMetaChange}
            toggleLabel={isAbcView ? 'Voices' : 'V'}
            onAddVoice={function() {
              if (sessionRef.current.view === EDITOR_VIEWS.ABC) {
                flushAllAbcDrafts();
              } else {
                flushCommit();
              }
              if (props.onAddVoice) props.onAddVoice();
            }}
            onDeleteVoice={props.onDeleteVoice}
          />
        </div>
      ) : null}

      {isStaffLikeView ? (
        <div className="notation-editing-controls">
          <NotationToolbar
            session={session}
            tunebook={props.tunebook}
            midi={midi}
            dispatch={dispatch}
            tune={props.tune}
            voiceNames={voiceNames}
            voiceIndex={props.voiceIndex}
            displayedVoiceIndices={displayedVoiceIndices}
            onVoiceSelect={handleVoiceSelect}
            onDisplayedVoicesChange={handleDisplayedVoicesChange}
            onVoiceNameChange={props.onVoiceMetaChange}
            onAddVoice={function() {
              if (sessionRef.current.view === EDITOR_VIEWS.ABC) {
                flushAllAbcDrafts();
              } else {
                flushCommit();
              }
              if (props.onAddVoice) props.onAddVoice();
            }}
            onDeleteVoice={props.onDeleteVoice}
            onOpenWizard={function() { setShowWizard(true); }}
            onOpenHelp={function() { setShowHelp(true); }}
            onQuantize={function() { setShowQuantize(true); }}
            onInsertSystemBreak={function() {
              insertLayout(insertSystemBreakAtCaret, 'Insert system break');
            }}
            onInsertBarline={function(barToken) {
              insertLayout(function(s) { return insertBarlineAtCaret(s, barToken); }, 'Insert bar line');
            }}
            onToggleTie={handleToggleTie}
            onMarkAction={handleMarkAction}
            onTupletAction={handleTupletAction}
            onToggleRecord={handleToggleRecord}
            onApplyRecord={handleApplyRecord}
            onDiscardRecord={handleDiscardRecord}
            pendingRecordCount={pendingRecordCount}
          />
          <NotationDurationToolbar
            session={session}
            dispatch={dispatch}
            onToggleNoteInput={function() {
              handleShortcutAction({ action: 'toggleNoteInput' });
            }}
            onApplyDuration={function(key) {
              const s = sessionRef.current;
              if (s.selection.eventIds.length) {
                applyEvents(changeSelectedDuration(s, key, s.dotted), EDITOR_VIEWS.STAFF, 'Change duration');
              }
            }}
            onInsertSystemBreak={function() {
              insertLayout(insertSystemBreakAtCaret, 'Insert system break');
            }}
          />
        </div>
      ) : null}

      <NotationInputHandler
        containerRef={staffRef}
        onAction={handleShortcutAction}
        enabled={true}
      />

      {isStaffView ? staffPanel
      : isSplitView ? (
        <div className="notation-split-view">
          <div className="notation-split-staff" style={{ flex: splitRatio }}>
            {staffPanel}
          </div>
          <div
            className="notation-split-resizer"
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize staff and piano roll"
            data-testid="notation-split-resizer"
            onPointerDown={handleSplitResizerPointerDown}
          />
          <div className="notation-split-roll" style={{ flex: 1 - splitRatio }}>
            {pianoRollPanel}
          </div>
        </div>
      ) : isPianoRollView ? pianoRollPanel
      : session.view === EDITOR_VIEWS.ABC ? (
        <div className="notation-abc-view">
          <Row className="notation-abc-split g-2">
            <Col md={4} xs={12} className="notation-abc-text-col">
              <div className="notation-abc-textareas">
                {displayedVoiceKeys.length === 0 ? (
                  <div className="notation-abc-textarea-empty text-muted small">
                    Select one or more voices to edit.
                  </div>
                ) : displayedVoiceKeys.map(function(vk) {
                  return (
                    <div key={'abc-draft-wrap-' + vk} className="notation-abc-textarea-wrap">
                      <div className="notation-abc-textarea-label fw-semibold small text-muted">
                        {voiceDisplayLabel(props.tune, vk)}
                      </div>
                      <textarea
                        key={'abc-draft-' + vk}
                        ref={function(el) { textareaRefs.current[vk] = el; }}
                        value={abcDrafts[vk] != null ? abcDrafts[vk] : voiceNotesForKey(vk)}
                        className="notation-abc-textarea"
                        data-testid="notation-abc-textarea"
                        aria-label={'ABC notes for ' + voiceDisplayLabel(props.tune, vk)}
                        onFocus={function() {
                          const idx = voiceNames.indexOf(vk);
                          if (idx >= 0 && idx !== props.voiceIndex) handleVoiceSelect(idx);
                        }}
                        onChange={function(e) { handleAbcTextChange(vk, e.target.value); }}
                      />
                    </div>
                  );
                })}
              </div>
            </Col>
            <Col md={8} xs={12} className="notation-abc-preview-col">
              <div className="notation-abc-preview" key={'abc-preview-' + displayedVoiceKeys.join('-')} data-testid="notation-abc-preview">
                <Abc
                  showRepeats={false}
                  hidePlayer={true}
                  suppressPlaybackSeek={true}
                  tunebook={props.tunebook}
                  abc={abcPreviewAbc}
                  onWarnings={props.onWarnings}
                  meter={tuneMeta.meter}
                  onClick={handleAbcPreviewClick}
                />
              </div>
            </Col>
          </Row>
          <p className="notation-abc-hint text-muted small">
            Edit ABC note text for each selected voice. Check voice boxes to show them in the preview.
            Line breaks (Enter) split the music across rows in the preview.
          </p>
        </div>
      ) : null}

      {isStaffLikeView ? (
        <VirtualPiano
          session={session}
          midiActiveNotes={midi.activeNotes}
          onPitch={function(pitch, addTone) {
            let s = sessionRef.current;
            if (s.mode !== EDITOR_MODES.NOTE_INPUT) {
              dispatch({ type: 'SET_MODE', mode: EDITOR_MODES.NOTE_INPUT });
              s = Object.assign({}, s, { mode: EDITOR_MODES.NOTE_INPUT });
              sessionRef.current = s;
            }
            const patch = insertPitchAtCaret(Object.assign({}, s, { chordBuild: !!addTone }), pitch);
            applyEvents(patch, EDITOR_VIEWS.STAFF, 'Virtual piano');
          }}
        />
      ) : null}

      <NotationEditorHelpModal
        show={showHelp}
        onHide={function() { setShowHelp(false); }}
        onOpenWalkthrough={function() { setShowWalkthrough(true); }}
      />

      <NotationEditorWalkthroughModal
        show={showWalkthrough}
        onHide={function() { setShowWalkthrough(false); }}
      />

      <WizardOptionsModal
        triggerOnly={true}
        show={showWizard}
        onHide={function() { setShowWizard(false); }}
        abc={props.abc}
        tune={props.tune}
        tunebook={props.tunebook}
        forceRefresh={props.forceRefresh}
      />

      <QuantizeDialog
        show={showQuantize}
        onHide={function() { setShowQuantize(false); }}
        hasRecordingGrid={hasRecordingGrid}
        onApply={function(opts) {
          const s = sessionRef.current;
          dispatch({ type: 'SET_LAST_QUANTIZE_OPTIONS', options: opts });
          const ids = s.selection.eventIds;
          const target = ids.length
            ? s.events.filter(function(ev) { return ids.indexOf(ev.id) >= 0; })
            : s.events;
          const rest = ids.length
            ? s.events.filter(function(ev) { return ids.indexOf(ev.id) < 0; })
            : [];
          const beatTimes = opts.useRecordingGrid && props.tune.timedMelody
            ? props.tune.timedMelody.beatTimes
            : null;
          const quantized = quantizeVoiceEvents(target, Object.assign({}, tuneMeta, opts, {
            beatTimes: beatTimes,
            beatsPerBar: beatsPerBarFromMeter(tuneMeta.meter),
            tempo: tuneMeta.tempo,
          }));
          const merged = rest.concat(quantized).sort(function(a, b) {
            return (a.startBeat || 0) - (b.startBeat || 0);
          });
          applyEvents(Object.assign({}, s, { events: merged }), s.view, 'Quantize');
          setShowQuantize(false);
        }}
      />
    </div>
  );
}
