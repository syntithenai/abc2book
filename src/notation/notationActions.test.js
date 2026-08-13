import { createInitialSession } from './notationSession';
import {
  insertPitchAtCaret,
  insertRestAtCaret,
  insertMidiChordAtCaret,
  insertBarlineAtCaret,
  insertSystemBreakAtCaret,
  insertKeyChangeAtCaret,
  insertMeterChangeAtCaret,
  barStartInsertIndex,
  updateKeyChangeEvent,
  layoutInsertIndex,
  pasteInsertIndex,
  pitchFromLetter,
  pitchFromMidi,
  transposeSelectionByStaffSteps,
  transposeSelection,
  nextDiatonicMidi,
  deleteSelectionToRest,
  durationFromSession,
  changeSelectedDuration,
  scaleDuration,
  moveCaret,
  removeSelection,
  addToneToEvent,
  applyAccidentalToSelection,
  replaceSelectionPitch,
  staffStepsFromPointerDelta,
  resolveDragStaffSteps,
  resolveEditTargetIds,
  selectEventRange,
  toggleSelectionEventId,
  selectMeasureContaining,
  selectAllPitchedEvents,
  insertEmptyMeasureAtCaret,
  respellEnharmonicSelection,
  toggleDotOnSelection,
} from './notationActions';
import { DURATION_KEY_MULTIPLIERS } from './notationConstants';
import { serializeVoiceEvents } from './abcVoiceSerializer';
import { pitchToMidi } from './voiceEventModel';
import { durationToBeats as beatsFromDuration } from './beatGrid';

describe('notationActions', function() {
  const tuneMeta = { meter: '4/4', noteLength: '1/8', key: 'C', tempo: 120 };

  test('insertBarlineAtCaret inserts at caret and advances', function() {
    let session = createInitialSession(tuneMeta, 'C D E F |');
    session = Object.assign({}, session, { mode: 'noteInput', caretIndex: 2 });
    session = insertBarlineAtCaret(session, '|');
    expect(session.caretIndex).toBe(3);
    const abc = serializeVoiceEvents(session.events, tuneMeta);
    expect(abc).toMatch(/CD \| EF/);
  });

  test('insertBarlineAtCaret inserts before leftmost selected note', function() {
    let session = createInitialSession(tuneMeta, 'C D E F |');
    const notes = session.events.filter(function(ev) { return ev.type === 'note'; });
    session = Object.assign({}, session, {
      caretIndex: 4,
      selection: { eventIds: [notes[2].id], toneIndex: null, anchorId: notes[2].id },
    });
    session = insertBarlineAtCaret(session, '|');
    const abc = serializeVoiceEvents(session.events, tuneMeta);
    expect(abc).toMatch(/CD \| EF/);
  });

  test('layoutInsertIndex prefers leftmost selected note over caret', function() {
    let session = createInitialSession(tuneMeta, 'C D E F |');
    const notes = session.events.filter(function(ev) { return ev.type === 'note'; });
    session = Object.assign({}, session, {
      caretIndex: 4,
      selection: { eventIds: [notes[1].id], toneIndex: null, anchorId: notes[1].id },
    });
    expect(layoutInsertIndex(session)).toBe(1);
  });

  test('layoutInsertIndex uses lastSelection when session selection is empty', function() {
    let session = createInitialSession(tuneMeta, 'C D E F |');
    const notes = session.events.filter(function(ev) { return ev.type === 'note'; });
    session = Object.assign({}, session, {
      caretIndex: 4,
      selection: { eventIds: [], toneIndex: null, anchorId: null },
    });
    const lastSelection = { eventIds: [notes[2].id], toneIndex: null, anchorId: notes[2].id };
    expect(layoutInsertIndex(session, lastSelection)).toBe(2);
  });

  test('layoutInsertIndex prefers lastSelection over stale session selection', function() {
    let session = createInitialSession(tuneMeta, 'C D E F |');
    const notes = session.events.filter(function(ev) { return ev.type === 'note'; });
    session = Object.assign({}, session, {
      caretIndex: 0,
      selection: { eventIds: [notes[0].id], toneIndex: null, anchorId: notes[0].id },
    });
    const lastSelection = { eventIds: [notes[2].id], toneIndex: null, anchorId: notes[2].id };
    expect(layoutInsertIndex(session, lastSelection)).toBe(2);
  });

  test('pasteInsertIndex inserts after rightmost selected note', function() {
    let session = createInitialSession(tuneMeta, 'C D E F |');
    const notes = session.events.filter(function(ev) { return ev.type === 'note'; });
    session = Object.assign({}, session, {
      caretIndex: 3,
      selection: { eventIds: [notes[3].id], toneIndex: null, anchorId: notes[3].id },
    });
    expect(pasteInsertIndex(session)).toBe(4);
    expect(layoutInsertIndex(session)).toBe(3);
  });

  test('pasteInsertIndex uses append caret when past end', function() {
    let session = createInitialSession(tuneMeta, 'C D |');
    session = Object.assign({}, session, {
      caretIndex: session.events.length,
      selection: { eventIds: [], toneIndex: null, anchorId: null },
    });
    expect(pasteInsertIndex(session)).toBe(session.events.length);
  });

  test('insertSystemBreakAtCaret inserts before selected note', function() {
    let session = createInitialSession(tuneMeta, 'CDEF | GABc |');
    const notes = session.events.filter(function(ev) { return ev.type === 'note'; });
    const gIdx = notes.findIndex(function(ev) { return ev.pitch && ev.pitch.step === 'G'; });
    session = Object.assign({}, session, {
      caretIndex: session.events.length,
      selection: { eventIds: [notes[gIdx].id], toneIndex: null, anchorId: notes[gIdx].id },
    });
    session = insertSystemBreakAtCaret(session);
    const abc = serializeVoiceEvents(session.events, tuneMeta);
    expect(abc).toMatch(/CDEF \|\nGABc/);
  });

  test('sequential insert at caret replaces at caret when fillMeasures', function() {
    let session = createInitialSession(tuneMeta, 'C D E F |');
    session = Object.assign({}, session, { mode: 'noteInput', caretIndex: 2 });
    session = insertPitchAtCaret(session, pitchFromLetter('G', session));
    session = insertPitchAtCaret(session, pitchFromLetter('A', session));
    const notes = session.events.filter(function(ev) { return ev.type === 'note'; });
    expect(notes.map(function(n) { return n.pitch.step; })).toEqual(['C', 'D', 'G', 'A']);
  });

  test('insertPitchAtCaret splices when spliceAtCaret after staff click', function() {
    let session = createInitialSession(tuneMeta, 'C D E F |');
    session = Object.assign({}, session, {
      mode: 'noteInput',
      caretIndex: 2,
      spliceAtCaret: true,
    });
    session = insertPitchAtCaret(session, pitchFromLetter('G', session));
    const notes = session.events.filter(function(ev) { return ev.type === 'note'; });
    expect(notes.map(function(n) { return n.pitch.step; })).toEqual(['C', 'D', 'G', 'E', 'F']);
    expect(session.spliceAtCaret).toBe(false);
  });

  test('inserts notes at caret and serializes', function() {
    let session = createInitialSession(tuneMeta, '');
    session = Object.assign({}, session, { mode: 'noteInput' });
    session = insertPitchAtCaret(session, pitchFromLetter('C', session));
    session = insertPitchAtCaret(session, pitchFromLetter('D', session));
    session = insertPitchAtCaret(session, pitchFromLetter('A', session));
    expect(session.events.length).toBe(3);
    const notes = session.events.filter(function(ev) { return ev.type === 'note'; });
    expect(notes[0].pitch.step).toBe('C');
    expect(notes[1].pitch.step).toBe('D');
    expect(notes[2].pitch.step).toBe('A');
    const abc = serializeVoiceEvents(session.events, tuneMeta);
    expect(abc).toMatch(/C.*D.*A/);
  });

  test('inserts rest', function() {
    let session = createInitialSession(tuneMeta, 'C D |');
    session = insertRestAtCaret(session);
    expect(session.events.some(function(ev) { return ev.type === 'rest'; })).toBe(true);
  });

  test('inserts midi chord cluster', function() {
    let session = createInitialSession(tuneMeta, '');
    session = insertMidiChordAtCaret(session, [60, 64, 67]);
    const chord = session.events.find(function(ev) { return ev.type === 'chord'; });
    expect(chord).toBeTruthy();
    expect(chord.pitches.length).toBe(3);
  });

  test('nextDiatonicMidi moves E up two staff steps to G in C major', function() {
    const e4 = pitchToMidi({ step: 'E', octave: 4, accidental: 0 });
    const f4 = nextDiatonicMidi(e4, 1, tuneMeta);
    const g4 = nextDiatonicMidi(f4, 1, tuneMeta);
    expect(pitchFromMidi(f4, tuneMeta).step).toBe('F');
    expect(pitchFromMidi(g4, tuneMeta).step).toBe('G');
  });

  test('transposeSelectionByStaffSteps only changes the selected note', function() {
    let session = createInitialSession(tuneMeta, 'C D E F |');
    const notes = session.events.filter(function(ev) { return ev.type === 'note'; });
    expect(notes.length).toBe(4);
    const eId = notes[2].id;
    session = Object.assign({}, session, {
      selection: { eventIds: [eId], toneIndex: null, anchorId: eId },
    });
    session = transposeSelectionByStaffSteps(session, -2, null);
    const after = session.events.filter(function(ev) { return ev.type === 'note'; });
    expect(after[0].pitch.step).toBe('C');
    expect(after[1].pitch.step).toBe('D');
    expect(after[2].pitch.step).toBe('G');
    expect(after[3].pitch.step).toBe('F');
    expect(serializeVoiceEvents(session.events, tuneMeta)).toMatch(/CD[Gg]F/);
  });

  test('deleteSelectionToRest Delete key removes event at caret, not before it', function() {
    let session = createInitialSession(tuneMeta, 'C D E F |');
    const notes = session.events.filter(function(ev) { return ev.type === 'note'; });
    session = Object.assign({}, session, {
      caretIndex: 2,
      selection: { eventIds: [], toneIndex: null, anchorId: null },
    });
    session = deleteSelectionToRest(session, { backward: false });
    const after = session.events.filter(function(ev) { return ev.type === 'note'; });
    expect(after.map(function(ev) { return ev.pitch.step; })).toEqual(['C', 'D', 'F']);
  });

  test('deleteSelectionToRest Backspace removes event before caret', function() {
    let session = createInitialSession(tuneMeta, 'C D E F |');
    session = Object.assign({}, session, {
      caretIndex: 2,
      selection: { eventIds: [], toneIndex: null, anchorId: null },
    });
    session = deleteSelectionToRest(session, { backward: true });
    const after = session.events.filter(function(ev) { return ev.type === 'note'; });
    expect(after.map(function(ev) { return ev.pitch.step; })).toEqual(['C', 'E', 'F']);
  });

  test('deleteSelectionToRest uses selection when present', function() {
    let session = createInitialSession(tuneMeta, 'C D E F |');
    const notes = session.events.filter(function(ev) { return ev.type === 'note'; });
    session = Object.assign({}, session, {
      caretIndex: 0,
      selection: { eventIds: [notes[2].id], toneIndex: null, anchorId: notes[2].id },
    });
    session = deleteSelectionToRest(session, { backward: true });
    const after = session.events.filter(function(ev) { return ev.type === 'note'; });
    expect(after.map(function(ev) { return ev.pitch.step; })).toEqual(['C', 'D', 'F']);
  });

  test('deleteSelectionToRest removes selected barline instead of converting to rest', function() {
    let session = createInitialSession(tuneMeta, 'C D E F |');
    const bar = session.events.find(function(ev) { return ev.type === 'barline'; });
    expect(bar).toBeTruthy();
    session = Object.assign({}, session, {
      caretIndex: session.events.indexOf(bar),
      selection: { eventIds: [bar.id], toneIndex: null, anchorId: bar.id },
    });
    session = deleteSelectionToRest(session, { backward: false });
    expect(session.events.some(function(ev) { return ev.type === 'barline'; })).toBe(false);
    expect(session.events.some(function(ev) { return ev.type === 'rest'; })).toBe(false);
    expect(session.events.filter(function(ev) { return ev.type === 'note'; }).length).toBe(4);
  });

  test('deleteSelectionToRest Backspace removes barline before caret', function() {
    let session = createInitialSession(tuneMeta, 'C D | E F');
    const barIdx = session.events.findIndex(function(ev) { return ev.type === 'barline'; });
    expect(barIdx).toBeGreaterThanOrEqual(0);
    session = Object.assign({}, session, {
      caretIndex: barIdx + 1,
      selection: { eventIds: [], toneIndex: null, anchorId: null },
    });
    session = deleteSelectionToRest(session, { backward: true });
    expect(session.events.some(function(ev) { return ev.type === 'barline'; })).toBe(false);
  });

  test('transposeSelection chromatic +1 on C yields C#', function() {
    let session = createInitialSession(tuneMeta, 'C D |');
    const cId = session.events[0].id;
    session = Object.assign({}, session, {
      selection: { eventIds: [cId], toneIndex: null, anchorId: cId },
    });
    session = transposeSelection(session, 1, null);
    expect(pitchToMidi(session.events[0].pitch)).toBe(61);
    expect(serializeVoiceEvents(session.events, tuneMeta)).toMatch(/\^C/);
  });

  test('transposeSelection +1 on B4 crosses to C5', function() {
    let session = createInitialSession(tuneMeta, 'B c |');
    const notes = session.events.filter(function(ev) { return ev.type === 'note'; });
    const bId = notes[0].id;
    session = Object.assign({}, session, {
      selection: { eventIds: [bId], toneIndex: null, anchorId: bId },
    });
    session = transposeSelection(session, 1, null);
    expect(pitchToMidi(session.events[0].pitch)).toBe(72);
    expect(session.events[0].pitch.step).toBe('C');
  });

  test('transposeSelection octave +12 changes serialized pitch class', function() {
    let session = createInitialSession(tuneMeta, 'C D |');
    const cId = session.events[0].id;
    session = Object.assign({}, session, {
      selection: { eventIds: [cId], toneIndex: null, anchorId: cId },
    });
    const beforeAbc = serializeVoiceEvents(session.events, tuneMeta);
    session = transposeSelection(session, 12, null);
    const afterAbc = serializeVoiceEvents(session.events, tuneMeta);
    expect(afterAbc).not.toBe(beforeAbc);
    expect(pitchToMidi(session.events[0].pitch)).toBeGreaterThanOrEqual(60);
  });

  test('transposeSelection diatonic +2 on E then F in C major', function() {
    let session = createInitialSession(tuneMeta, 'E F |');
    const notes = session.events.filter(function(ev) { return ev.type === 'note'; });
    session = Object.assign({}, session, {
      selection: { eventIds: [notes[0].id], toneIndex: null, anchorId: notes[0].id },
    });
    session = transposeSelection(session, 2, null);
    expect(session.events[0].pitch.step).toBe('F');

    session = createInitialSession(tuneMeta, 'E F |');
    const notes2 = session.events.filter(function(ev) { return ev.type === 'note'; });
    session = Object.assign({}, session, {
      selection: { eventIds: [notes2[1].id], toneIndex: null, anchorId: notes2[1].id },
    });
    session = transposeSelection(session, 2, null);
    expect(session.events[1].pitch.step).toBe('G');
  });

  test('durationFromSession for keys 1-9 and dotted', function() {
    const unit = 0.125;
    Object.keys(DURATION_KEY_MULTIPLIERS).forEach(function(key) {
      const session = Object.assign({}, createInitialSession(tuneMeta, ''), {
        durationKey: parseInt(key, 10),
        dotted: false,
        unitLengthDecimal: unit,
      });
      const dur = durationFromSession(session);
      const expectedBeats = DURATION_KEY_MULTIPLIERS[key] * unit * 4;
      expect(beatsFromDuration(dur, unit)).toBeCloseTo(expectedBeats, 4);
    });
    const dottedSession = Object.assign({}, createInitialSession(tuneMeta, ''), {
      durationKey: 5,
      dotted: true,
      unitLengthDecimal: unit,
    });
    expect(beatsFromDuration(durationFromSession(dottedSession), unit)).toBeCloseTo(0.125 * 4 * 2 * 1.5, 4);
  });

  test('pitchFromLetter with accidental carry and insert clears carry', function() {
    let session = createInitialSession(tuneMeta, '');
    session = Object.assign({}, session, { accidentalCarry: 1, mode: 'noteInput' });
    const pitch = pitchFromLetter('G', session);
    expect(pitch.accidental).toBe(1);
    session = insertPitchAtCaret(session, pitch);
    expect(session.accidentalCarry).toBeNull();
  });

  test('insertRestAtCaret at index 2 in C D E F |', function() {
    let session = createInitialSession(tuneMeta, 'C D E F |');
    session = Object.assign({}, session, { caretIndex: 2 });
    session = insertRestAtCaret(session);
    expect(session.caretIndex).toBe(3);
    const types = session.events.map(function(ev) { return ev.type; });
    expect(types).toEqual(['note', 'note', 'rest', 'note', 'note', 'barline']);
    expect(session.events[0].pitch.step).toBe('C');
    expect(session.events[1].pitch.step).toBe('D');
    expect(session.events[3].pitch.step).toBe('E');
    expect(session.events[4].pitch.step).toBe('F');
  });

  test('changeSelectedDuration on D with key 7 sets half note', function() {
    let session = createInitialSession(tuneMeta, 'C D |');
    const dId = session.events[1].id;
    session = Object.assign({}, session, {
      selection: { eventIds: [dId], toneIndex: null, anchorId: dId },
      durationKey: 5,
    });
    const unit = session.unitLengthDecimal;
    session = changeSelectedDuration(session, 7, false);
    const beats = beatsFromDuration(session.events[1].duration, unit);
    expect(beats).toBeCloseTo(DURATION_KEY_MULTIPLIERS[7] * unit * 4, 4);
  });

  test('scaleDuration halve then double restores duration', function() {
    let session = createInitialSession(tuneMeta, 'C D |');
    const cId = session.events[0].id;
    session = Object.assign({}, session, {
      selection: { eventIds: [cId], toneIndex: null, anchorId: cId },
    });
    const unit = session.unitLengthDecimal;
    const original = Object.assign({}, session.events[0].duration);
    session = scaleDuration(session, 0.5, false);
    const halved = beatsFromDuration(session.events[0].duration, unit);
    expect(halved).toBeCloseTo(beatsFromDuration(original, unit) * 0.5, 4);
    session = scaleDuration(session, 2, false);
    expect(beatsFromDuration(session.events[0].duration, unit)).toBeCloseTo(beatsFromDuration(original, unit), 4);
  });

  test('moveCaret clamps at boundaries', function() {
    let session = createInitialSession(tuneMeta, 'C D |');
    session = Object.assign({}, session, { caretIndex: 0 });
    expect(moveCaret(session, -1).caretIndex).toBe(0);
    session = Object.assign({}, session, { caretIndex: session.events.length });
    expect(moveCaret(session, 1).caretIndex).toBe(session.events.length);
  });

  test('removeSelection clamps caret when deleting events before it', function() {
    let session = createInitialSession(tuneMeta, 'C D E |');
    const cId = session.events[0].id;
    session = Object.assign({}, session, {
      caretIndex: 3,
      selection: { eventIds: [cId], toneIndex: null, anchorId: cId },
    });
    session = removeSelection(session);
    expect(session.events.filter(function(ev) { return ev.type === 'note'; }).length).toBe(2);
    expect(session.caretIndex).toBe(3);
    expect(session.events[0].pitch.step).toBe('D');
  });

  test('addToneToEvent on C with E creates chord', function() {
    let session = createInitialSession(tuneMeta, 'C D |');
    const ePitch = pitchFromLetter('E', session);
    session = addToneToEvent(session, 0, ePitch);
    expect(session.events[0].type).toBe('chord');
    expect(session.events[0].pitches.map(function(p) { return p.step; }).sort().join('')).toBe('CE');
  });

  test('applyAccidentalToSelection sharpens selected D', function() {
    let session = createInitialSession(tuneMeta, 'C D E |');
    const dId = session.events[1].id;
    session = Object.assign({}, session, {
      selection: { eventIds: [dId], toneIndex: null, anchorId: dId },
    });
    session = applyAccidentalToSelection(session, 1);
    expect(session.events[1].pitch.accidental).toBe(1);
    expect(String(session.events[1].pitch.abcName)).toMatch(/\^/);
    expect(session.events[0].pitch.accidental).toBe(0);
    expect(session.accidentalCarry).toBeNull();
  });

  test('applyAccidentalToSelection clears accidental to diatonic pitch', function() {
    let session = createInitialSession(tuneMeta, '^C D |');
    const cId = session.events[0].id;
    session = Object.assign({}, session, {
      selection: { eventIds: [cId], toneIndex: null, anchorId: cId },
    });
    const patch = applyAccidentalToSelection(session, null);
    expect(patch).not.toBeNull();
    expect(patch.events[0].pitch.accidental).toBeNull();
    expect(patch.events[0].pitch.forceNatural).toBe(false);
    expect(String(patch.events[0].pitch.abcName)).toBe('C');
  });

  test('applyAccidentalToSelection uses caret note when selection empty', function() {
    let session = createInitialSession(tuneMeta, 'C D |');
    session = Object.assign({}, session, { caretIndex: 1 });
    const patch = applyAccidentalToSelection(session, 1);
    expect(patch).not.toBeNull();
    const note = patch.events.find(function(ev) {
      return ev.type === 'note' && ev.pitch && ev.pitch.step === 'D';
    });
    expect(note && note.pitch.accidental).toBe(1);
  });

  test('replaceSelectionPitch changes selected note letter', function() {
    let session = createInitialSession(tuneMeta, 'C D E |');
    const dId = session.events[1].id;
    session = Object.assign({}, session, {
      selection: { eventIds: [dId], toneIndex: null, anchorId: dId },
    });
    const aPitch = pitchFromLetter('A', session);
    session = replaceSelectionPitch(session, aPitch);
    expect(session.events[1].pitch.step).toBe('A');
    expect(session.events[0].pitch.step).toBe('C');
    expect(session.events[2].pitch.step).toBe('E');
  });

  test('staffStepsFromPointerDelta clamps inflated steps', function() {
    expect(staffStepsFromPointerDelta(-28, 14, 8)).toBe(-2);
    expect(staffStepsFromPointerDelta(14, 14, 8)).toBe(1);
    expect(staffStepsFromPointerDelta(-500, 14, 8)).toBe(-8);
    expect(staffStepsFromPointerDelta(500, 14, 8)).toBe(8);
    expect(staffStepsFromPointerDelta(0, 14, 8)).toBe(0);
  });

  test('resolveDragStaffSteps prefers pointer over inflated abcjs step', function() {
    // Hybrid used to pick |abcStep| when same sign → -8 leap; pointer-only keeps -2.
    expect(resolveDragStaffSteps({
      pointerDeltaY: -28,
      stepPx: 14,
      clampAbs: 4,
      abcStep: -8,
    })).toBe(-2);
    expect(resolveDragStaffSteps({
      pointerDeltaY: -70,
      stepPx: 14,
      clampAbs: 4,
      abcStep: -12,
    })).toBe(-4);
    expect(resolveDragStaffSteps({
      pointerDeltaY: -2,
      stepPx: 14,
      clampAbs: 4,
      abcStep: -8,
    })).toBe(0);
  });

  test('resolveEditTargetIds drops stale ids and retargets by caret', function() {
    let session = createInitialSession(tuneMeta, 'C D E |');
    const liveD = session.events[1].id;
    const stale = Object.assign({}, session, {
      caretIndex: 1,
      selection: { eventIds: [], toneIndex: null, anchorId: null },
    });
    const resolved = resolveEditTargetIds(stale, {
      eventIds: ['dead-id-from-before-LOAD_VOICE'],
      toneIndex: null,
      anchorId: 'dead-id-from-before-LOAD_VOICE',
    });
    expect(resolved).not.toBeNull();
    expect(resolved.eventIds).toEqual([liveD]);
    expect(resolved.anchorId).toBe(liveD);
  });

  test('resolveEditTargetIds keeps live selection ids', function() {
    let session = createInitialSession(tuneMeta, 'C D E |');
    const dId = session.events[1].id;
    session = Object.assign({}, session, {
      selection: { eventIds: [dId], toneIndex: null, anchorId: dId },
    });
    const resolved = resolveEditTargetIds(session, null);
    expect(resolved.eventIds).toEqual([dId]);
  });

  test('resolveEditTargetIds prefers lastSelection over stale session selection', function() {
    let session = createInitialSession(tuneMeta, 'C D E |');
    const cId = session.events[0].id;
    const eId = session.events[2].id;
    session = Object.assign({}, session, {
      caretIndex: 0,
      selection: { eventIds: [cId], toneIndex: null, anchorId: cId },
    });
    const resolved = resolveEditTargetIds(session, {
      eventIds: [eId],
      toneIndex: null,
      anchorId: eId,
    });
    expect(resolved.eventIds).toEqual([eId]);
    expect(resolved.anchorId).toBe(eId);
  });

  test('resolveEditTargetIds sorts ids by startBeat and preserves startMs', function() {
    let session = createInitialSession(tuneMeta, 'C D E |');
    const cId = session.events.find(function(ev) {
      return ev.type === 'note' && ev.pitch && ev.pitch.step === 'C';
    }).id;
    const eId = session.events.find(function(ev) {
      return ev.type === 'note' && ev.pitch && ev.pitch.step === 'E';
    }).id;
    session = Object.assign({}, session, {
      selection: { eventIds: [eId, cId], toneIndex: null, anchorId: eId },
    });
    const resolved = resolveEditTargetIds(session, {
      eventIds: [eId, cId],
      startMs: 500,
      startBeat: session.events.find(function(ev) { return ev.id === cId; }).startBeat,
    });
    expect(resolved.eventIds[0]).toBe(cId);
    expect(resolved.eventIds[1]).toBe(eId);
    expect(resolved.startMs).toBe(500);
  });

  test('resolveEditTargetIds targets rest at caret instead of previous note', function() {
    let session = createInitialSession(tuneMeta, 'C z D |');
    const rest = session.events.find(function(ev) { return ev.type === 'rest'; });
    const restIdx = session.events.findIndex(function(ev) { return ev.id === rest.id; });
    session = Object.assign({}, session, {
      caretIndex: restIdx,
      selection: { eventIds: [], toneIndex: null, anchorId: null },
    });
    const resolved = resolveEditTargetIds(session, { eventIds: [], toneIndex: null, anchorId: null });
    expect(resolved.eventIds).toEqual([rest.id]);
  });

  test('toggleDotOnSelection toggles dotted on selected rest', function() {
    let session = createInitialSession(tuneMeta, 'C z D |');
    const rest = session.events.find(function(ev) { return ev.type === 'rest'; });
    session = Object.assign({}, session, {
      selection: { eventIds: [rest.id], toneIndex: null, anchorId: rest.id },
    });
    const patch = toggleDotOnSelection(session);
    expect(patch).not.toBeNull();
    const updated = patch.events.find(function(ev) { return ev.id === rest.id; });
    expect(updated.duration.dotted).toBe(true);
    const notes = patch.events.filter(function(ev) { return ev.type === 'note'; });
    notes.forEach(function(ev) {
      expect(ev.duration.dotted).toBeFalsy();
    });
  });

  test('deleteSelectionToRest with selected rest does not remove adjacent notes', function() {
    let session = createInitialSession(tuneMeta, 'C z D |');
    const rest = session.events.find(function(ev) { return ev.type === 'rest'; });
    const notesBefore = session.events.filter(function(ev) { return ev.type === 'note'; });
    expect(notesBefore.length).toBe(2);
    session = Object.assign({}, session, {
      selection: { eventIds: [rest.id], toneIndex: null, anchorId: rest.id },
    });
    session = deleteSelectionToRest(session, { backward: false });
    const notesAfter = session.events.filter(function(ev) { return ev.type === 'note'; });
    expect(notesAfter.length).toBe(2);
    expect(notesAfter.map(function(ev) { return ev.pitch.step; })).toEqual(['C', 'D']);
  });

  test('selectEventRange returns contiguous ids inclusive', function() {
    const session = createInitialSession(tuneMeta, 'C D E F |');
    const ids = selectEventRange(session.events, session.events[0].id, session.events[3].id);
    expect(ids).toEqual([
      session.events[0].id,
      session.events[1].id,
      session.events[2].id,
      session.events[3].id,
    ]);
  });

  test('toggleSelectionEventId adds and removes', function() {
    const session = createInitialSession(tuneMeta, 'C D E |');
    const cId = session.events[0].id;
    const dId = session.events[1].id;
    let sel = { eventIds: [cId], toneIndex: null, anchorId: cId };
    sel = toggleSelectionEventId(sel, dId);
    expect(sel.eventIds).toEqual([cId, dId]);
    expect(sel.anchorId).toBe(cId);
    sel = toggleSelectionEventId(sel, cId);
    expect(sel.eventIds).toEqual([dId]);
    expect(sel.anchorId).toBe(dId);
  });

  test('selectAllPitchedEvents selects notes chords rests not barlines', function() {
    const session = createInitialSession(tuneMeta, 'C D E F |');
    const patch = selectAllPitchedEvents(session);
    expect(patch.selection.eventIds.length).toBe(4);
    expect(patch.selection.anchorId).toBe(session.events[0].id);
    expect(patch.caretIndex).toBe(0);
    const types = patch.selection.eventIds.map(function(id) {
      return session.events.find(function(ev) { return ev.id === id; }).type;
    });
    expect(types.every(function(t) { return t === 'note'; })).toBe(true);
  });

  test('selectMeasureContaining includes notes through trailing barline', function() {
    const session = createInitialSession(tuneMeta, 'C D E F | G A |');
    const eId = session.events.find(function(ev) {
      return ev.type === 'note' && ev.pitch && ev.pitch.step === 'E';
    }).id;
    const ids = selectMeasureContaining(session.events, eId);
    const selected = ids.map(function(id) {
      return session.events.find(function(ev) { return ev.id === id; });
    });
    expect(selected.map(function(ev) {
      if (ev.type === 'barline') return 'bar';
      return ev.pitch.step;
    })).toEqual(['C', 'D', 'E', 'F', 'bar']);
  });

  test('removeSelection clears multi-note selection', function() {
    let session = createInitialSession(tuneMeta, 'C D E F |');
    const cId = session.events[0].id;
    const dId = session.events[1].id;
    session = Object.assign({}, session, {
      selection: { eventIds: [cId, dId], toneIndex: null, anchorId: cId },
    });
    session = removeSelection(session);
    const notes = session.events.filter(function(ev) { return ev.type === 'note'; });
    expect(notes.map(function(ev) { return ev.pitch.step; })).toEqual(['E', 'F']);
  });

  test('insertEmptyMeasureAtCaret inserts full-bar rest and barline', function() {
    let session = createInitialSession(tuneMeta, 'C |');
    session = Object.assign({}, session, { caretIndex: 0 });
    session = insertEmptyMeasureAtCaret(session);
    expect(session.events[0].type).toBe('rest');
    expect(session.events[0].durationBeats).toBeCloseTo(4, 5);
    expect(session.events[1].type).toBe('barline');
    expect(session.caretIndex).toBe(2);
  });

  test('respellEnharmonicSelection flips sharp to flat', function() {
    let session = createInitialSession(tuneMeta, '^C |');
    const id = session.events[0].id;
    session = Object.assign({}, session, {
      selection: { eventIds: [id], toneIndex: null, anchorId: id },
    });
    const beforeMidi = pitchToMidi(session.events[0].pitch);
    session = respellEnharmonicSelection(session);
    expect(pitchToMidi(session.events[0].pitch)).toBe(beforeMidi);
    expect(session.events[0].pitch.abcName).toMatch(/_D/);
    session = respellEnharmonicSelection(session);
    expect(session.events[0].pitch.abcName).toMatch(/\^C/);
  });

  test('insertKeyChangeAtCaret writes inline [K:…] token', function() {
    let session = createInitialSession(tuneMeta, 'C D E |');
    session = Object.assign({}, session, { caretIndex: 2 });
    session = insertKeyChangeAtCaret(session, 'Am', 2);
    const abc = serializeVoiceEvents(session.events, tuneMeta);
    expect(abc).toContain('[K:Am]');
  });

  test('insertMeterChangeAtCaret snaps to bar start', function() {
    let session = createInitialSession(tuneMeta, 'C D | E F |');
    session = Object.assign({}, session, { caretIndex: 3 });
    expect(barStartInsertIndex(session, 3)).toBe(3);
    session = insertMeterChangeAtCaret(session, '3/4', 3);
    const abc = serializeVoiceEvents(session.events, tuneMeta);
    expect(abc).toContain('[M:3/4]');
    expect(abc.indexOf('[M:3/4]')).toBeLessThan(abc.indexOf('E'));
  });

  test('updateKeyChangeEvent edits existing inline key change', function() {
    let session = createInitialSession(tuneMeta, '| [K:G] C D |');
    const keyEv = session.events.find(function(ev) { return ev.type === 'keyChange'; });
    expect(keyEv).toBeTruthy();
    session = updateKeyChangeEvent(session, keyEv.id, 'Am');
    const abc = serializeVoiceEvents(session.events, tuneMeta);
    expect(abc).toContain('[K:Am]');
  });

  test('deleteSelectionToRest removes key and meter change events', function() {
    let session = createInitialSession(tuneMeta, '| [K:Am] C | [M:3/4] D |');
    const keyEv = session.events.find(function(ev) { return ev.type === 'keyChange'; });
    expect(keyEv).toBeTruthy();
    session = Object.assign({}, session, {
      selection: { eventIds: [keyEv.id], toneIndex: null, anchorId: keyEv.id },
    });
    session = deleteSelectionToRest(session, { backward: false });
    expect(session.events.some(function(ev) { return ev.type === 'keyChange'; })).toBe(false);
  });
});
