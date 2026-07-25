import {
  EDITOR_MODES,
  EDITOR_VIEWS,
  MIDI_CHORD_MODES,
  NOTE_INPUT_METHODS,
  PIANO_ROLL_TOOLS,
  DEFAULT_MIDI_CHORD_WINDOW_MS,
} from './notationConstants';
import { parseVoiceEvents, createEventId, cloneVoiceEvent, eventMelodicMidiPitch } from './voiceEventModel';
import { assignTimingToEvents, parseNoteLengthDecimal, beatsToDuration, durationToBeats } from './beatGrid';
import { reassignEventTiming } from './abcVoiceSerializer';

/** Remap note selection onto re-parsed events after LOAD_VOICE assigns new ids. */
function matchRemappedNoteEvent(oldEv, newEvents, usedIds) {
  if (!oldEv || typeof oldEv.startBeat !== 'number') return null;
  const oldMidi = eventMelodicMidiPitch(oldEv);
  const oldDur = typeof oldEv.durationBeats === 'number' ? oldEv.durationBeats : null;
  const candidates = (newEvents || []).filter(function(ev) {
    return ev && ev.id && usedIds.indexOf(ev.id) < 0
      && (ev.type === 'note' || ev.type === 'chord')
      && typeof ev.startBeat === 'number'
      && Math.abs(ev.startBeat - oldEv.startBeat) < 0.001;
  });
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];
  if (oldMidi != null) {
    const midiMatch = candidates.find(function(ev) {
      return eventMelodicMidiPitch(ev) === oldMidi;
    });
    if (midiMatch) return midiMatch;
  }
  if (oldDur != null) {
    const durMatch = candidates.find(function(ev) {
      return Math.abs((ev.durationBeats || 0) - oldDur) < 0.001;
    });
    if (durMatch) return durMatch;
  }
  return candidates[0];
}

export function remapSelectionByStartBeat(oldEvents, newEvents, selection) {
  if (!selection || !selection.eventIds || !selection.eventIds.length) {
    return { eventIds: [], toneIndex: null, anchorId: null };
  }
  const oldById = {};
  (oldEvents || []).forEach(function(ev) {
    if (ev && ev.id) oldById[ev.id] = ev;
  });
  const newIds = [];
  selection.eventIds.forEach(function(id) {
    const oldEv = oldById[id];
    if (!oldEv || (oldEv.type !== 'note' && oldEv.type !== 'chord')) return;
    const match = matchRemappedNoteEvent(oldEv, newEvents, newIds);
    if (match && newIds.indexOf(match.id) < 0) newIds.push(match.id);
  });
  if (!newIds.length) {
    return { eventIds: [], toneIndex: null, anchorId: null };
  }
  let anchorId = selection.anchorId;
  const anchorEv = oldById[anchorId];
  if (anchorEv && (anchorEv.type === 'note' || anchorEv.type === 'chord')) {
    const anchorMatch = matchRemappedNoteEvent(anchorEv, newEvents, []);
    anchorId = anchorMatch ? anchorMatch.id : newIds[0];
  } else {
    anchorId = newIds[0];
  }
  const anchorNew = (newEvents || []).find(function(ev) { return ev.id === anchorId; });
  return {
    eventIds: newIds,
    toneIndex: selection.toneIndex != null ? selection.toneIndex : null,
    anchorId: anchorId,
    startBeat: anchorNew && typeof anchorNew.startBeat === 'number' ? anchorNew.startBeat : undefined,
  };
}

export function createInitialSession(tuneMeta, voiceBody) {
  const unit = parseNoteLengthDecimal(tuneMeta.noteLength, tuneMeta.meter);
  const events = assignTimingToEvents(
    parseVoiceEvents(voiceBody, tuneMeta),
    tuneMeta.meter,
    unit
  );
  return {
    mode: EDITOR_MODES.NORMAL,
    noteInputMethod: NOTE_INPUT_METHODS.NOTE_NAME,
    pitchCarry: null,
    view: EDITOR_VIEWS.STAFF,
    events: events,
    caretIndex: 0,
    selection: { eventIds: [], toneIndex: null, anchorId: null },
    durationKey: 5,
    dotted: false,
    accidentalCarry: null,
    chordBuild: false,
    lastEvent: null,
    midiEnabled: false,
    midiInputId: null,
    midiChordMode: MIDI_CHORD_MODES.SINGLE,
    midiChordWindowMs: DEFAULT_MIDI_CHORD_WINDOW_MS,
    midiPendingChord: null,
    midiRecordActive: false,
    midiRecordBuffer: [],
    lastQuantizeOptions: null,
    tupletMode: null,
    slurMode: false,
    slurPendingStartId: null,
    snapSlotsPerBeat: 4,
    snapEnabled: true,
    pianoRollTool: PIANO_ROLL_TOOLS.SELECT,
    pianoRollZoom: { beatWidth: 48, rowHeight: 14 },
    pianoRollShowWaveform: true,
    lastEditedView: EDITOR_VIEWS.STAFF,
    tuneMeta: tuneMeta,
    unitLengthDecimal: unit,
    dirty: false,
    internalSync: false,
  };
}

export function notationSessionReducer(state, action) {
  switch (action.type) {
    case 'LOAD_VOICE': {
      const next = createInitialSession(action.tuneMeta, action.voiceBody);
      // Preserve editor chrome so voice reloads do not kick piano-roll/ABC back to staff.
      // Keep caret slot when the reload is a commit echo (IDs change; index still meaningful).
      const preservedCaret = Math.max(0, Math.min(
        typeof state.caretIndex === 'number' ? state.caretIndex : 0,
        next.events.length
      ));
      const preservedSelection = remapSelectionByStartBeat(
        state.events, next.events, state.selection);
      return Object.assign({}, next, {
        view: state.view,
        mode: state.mode,
        noteInputMethod: state.noteInputMethod,
        pitchCarry: state.pitchCarry,
        caretIndex: preservedCaret,
        selection: preservedSelection,
        pianoRollZoom: state.pianoRollZoom,
        pianoRollTool: state.pianoRollTool,
        pianoRollShowWaveform: state.pianoRollShowWaveform,
        snapSlotsPerBeat: state.snapSlotsPerBeat,
        snapEnabled: state.snapEnabled,
        midiEnabled: state.midiEnabled,
        midiInputId: state.midiInputId,
        midiChordMode: state.midiChordMode,
        midiChordWindowMs: state.midiChordWindowMs,
      });
    }
    case 'SET_MODE':
      return Object.assign({}, state, { mode: action.mode });
    case 'SET_NOTE_INPUT_METHOD':
      return Object.assign({}, state, {
        noteInputMethod: action.method || NOTE_INPUT_METHODS.NOTE_NAME,
      });
    case 'SET_PITCH_CARRY':
      return Object.assign({}, state, { pitchCarry: action.pitch || null });
    case 'SET_VIEW':
      return Object.assign({}, state, { view: action.view });
    case 'SET_DIRTY':
      return Object.assign({}, state, { dirty: !!action.dirty });
    case 'SET_EVENTS':
      return Object.assign({}, state, {
        events: reassignEventTiming(action.events, state.tuneMeta),
        dirty: true,
        caretIndex: typeof action.caretIndex === 'number' ? action.caretIndex : state.caretIndex,
        lastEvent: action.lastEvent != null ? action.lastEvent : state.lastEvent,
        selection: action.selection != null ? action.selection : state.selection,
        lastEditedView: action.sourceView || state.lastEditedView,
      });
    case 'SET_CARET':
      return Object.assign({}, state, {
        caretIndex: Math.max(0, Math.min(action.index, state.events.length)),
      });
    case 'SET_SELECTION':
      return Object.assign({}, state, { selection: action.selection });
    case 'SET_DURATION_KEY':
      return Object.assign({}, state, { durationKey: action.key, dotted: action.dotted != null ? action.dotted : state.dotted });
    case 'TOGGLE_DOT':
      return Object.assign({}, state, { dotted: !state.dotted });
    case 'SET_CHORD_BUILD':
      return Object.assign({}, state, { chordBuild: !!action.value });
    case 'SET_ACCIDENTAL_CARRY':
      return Object.assign({}, state, { accidentalCarry: action.value });
    case 'SET_MIDI_STATE':
      return Object.assign({}, state, action.patch);
    case 'SET_TUPLET_MODE':
      return Object.assign({}, state, { tupletMode: action.tupletMode });
    case 'SET_SLUR_MODE':
      return Object.assign({}, state, {
        slurMode: !!action.value,
        slurPendingStartId: action.value ? state.slurPendingStartId : null,
      });
    case 'SET_SLUR_PENDING':
      return Object.assign({}, state, { slurPendingStartId: action.id });
    case 'SET_MIDI_RECORD':
      return Object.assign({}, state, {
        midiRecordActive: !!action.active,
        midiRecordBuffer: action.buffer != null ? action.buffer : state.midiRecordBuffer,
      });
    case 'SET_LAST_QUANTIZE_OPTIONS':
      return Object.assign({}, state, { lastQuantizeOptions: action.options });
    case 'SET_PIANO_ROLL_STATE':
      return Object.assign({}, state, action.patch);
    case 'SET_LAST_EVENT':
      return Object.assign({}, state, { lastEvent: action.event });
    case 'SET_INTERNAL_SYNC':
      return Object.assign({}, state, { internalSync: !!action.value });
    default:
      return state;
  }
}
