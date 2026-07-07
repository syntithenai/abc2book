import { createInitialSession } from './notationSession';
import {
  insertPitchAtCaret,
  insertRestAtCaret,
  insertMidiChordAtCaret,
  insertBarlineAtCaret,
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
    expect(abc).toMatch(/C D \| E F/);
  });

  test('sequential insert at caret advances and preserves order', function() {
    let session = createInitialSession(tuneMeta, 'C D E F |');
    session = Object.assign({}, session, { mode: 'noteInput', caretIndex: 2 });
    session = insertPitchAtCaret(session, pitchFromLetter('G', session));
    expect(session.caretIndex).toBe(3);
    session = insertPitchAtCaret(session, pitchFromLetter('A', session));
    expect(session.caretIndex).toBe(4);
    const notes = session.events.filter(function(ev) { return ev.type === 'note'; });
    expect(notes[2].pitch.step).toBe('G');
    expect(notes[3].pitch.step).toBe('A');
    expect(notes[4].pitch.step).toBe('E');
    expect(notes[5].pitch.step).toBe('F');
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
    expect(serializeVoiceEvents(session.events, tuneMeta)).toMatch(/C D [Gg] F/);
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

  test('transposeSelection chromatic +1 on C yields C#', function() {
    let session = createInitialSession(tuneMeta, 'C D |');
    const cId = session.events[0].id;
    session = Object.assign({}, session, {
      selection: { eventIds: [cId], toneIndex: null, anchorId: cId },
    });
    session = transposeSelection(session, 1, null);
    expect(pitchToMidi(session.events[0].pitch)).toBe(61);
    expect(serializeVoiceEvents(session.events, tuneMeta)).toMatch(/\^c/);
  });

  test('transposeSelection +1 on B4 crosses to C5', function() {
    let session = createInitialSession(tuneMeta, 'B c |');
    const notes = session.events.filter(function(ev) { return ev.type === 'note'; });
    const bId = notes[0].id;
    session = Object.assign({}, session, {
      selection: { eventIds: [bId], toneIndex: null, anchorId: bId },
    });
    session = transposeSelection(session, 1, null);
    expect(pitchToMidi(session.events[0].pitch)).toBe(60);
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
});
