import { parseVoiceEvents } from './voiceEventModel';
import { serializeVoiceEvents } from './abcVoiceSerializer';
import {
  toggleTie,
  toggleDecoration,
  applySlurToRange,
  clearSlurOnSelection,
  insertGraceBeforeSelection,
  attachTupletToNewEvent,
  advanceTupletMode,
} from './notationMarks';
import { insertPitchAtCaret, pitchFromLetter } from './notationActions';
import { createInitialSession } from './notationSession';

describe('voiceEventModel extended', function() {
  const meta = { meter: '4/4', noteLength: '1/8', key: 'C' };

  test('parses staccato decoration', function() {
    const events = parseVoiceEvents('.c d |', meta);
    const note = events.find(function(ev) { return ev.type === 'note'; });
    expect(note.decorations).toContain('staccato');
  });

  test('parses grace notes', function() {
    const events = parseVoiceEvents('{g}c |', meta);
    const note = events.find(function(ev) { return ev.graceNotes && ev.graceNotes.length; });
    expect(note).toBeTruthy();
    expect(note.graceNotes[0].pitch.step).toBe('G');
  });

  test('parses slur span', function() {
    const events = parseVoiceEvents('(cde) |', meta);
    const notes = events.filter(function(ev) { return ev.type === 'note'; });
    expect(notes[0].slurStart).toBe(true);
    expect(notes[2].slurEnd).toBe(true);
  });

  test('parses tuplet', function() {
    const events = parseVoiceEvents('(3cde |', meta);
    const notes = events.filter(function(ev) { return ev.type === 'note'; });
    expect(notes[0].tuplet).toBeTruthy();
    expect(notes[0].tuplet.num).toBe(3);
  });

  test('roundtrip staccato and dynamics', function() {
    const body = '.c !mf!d e |';
    const events = parseVoiceEvents(body, meta);
    const out = serializeVoiceEvents(events, meta);
    const events2 = parseVoiceEvents(out, meta);
    const n0 = events2.find(function(ev) { return ev.decorations && ev.decorations.indexOf('staccato') >= 0; });
    const n1 = events2.find(function(ev) { return ev.decorations && ev.decorations.indexOf('mf') >= 0; });
    expect(n0).toBeTruthy();
    expect(n1).toBeTruthy();
  });

  test('roundtrip slur', function() {
    const body = '(cde) |';
    const out = serializeVoiceEvents(parseVoiceEvents(body, meta), meta);
    expect(out.replace(/\s/g, '')).toContain('(cde)');
  });
});

describe('notationMarks', function() {
  const meta = { meter: '4/4', noteLength: '1/8', key: 'C' };

  test('toggleTie sets tieEnd and next tieStart', function() {
    let session = createInitialSession(meta, 'c d |');
    session = Object.assign({}, session, { caretIndex: 1 });
    const patch = toggleTie(session);
    expect(patch.events[0].tieEnd).toBe(true);
    expect(patch.events[1].tieStart).toBe(true);
  });

  test('toggleDecoration on selection', function() {
    let session = createInitialSession(meta, 'c d |');
    const firstId = session.events[0].id;
    session = Object.assign({}, session, {
      selection: { eventIds: [firstId], toneIndex: null, anchorId: firstId },
    });
    const patch = toggleDecoration(session, 'accent');
    expect(patch.events[0].decorations).toContain('accent');
  });

  test('toggleTie twice removes tie flags', function() {
    let session = createInitialSession(meta, 'c d |');
    session = Object.assign({}, session, { caretIndex: 1 });
    session = toggleTie(session);
    expect(session.events[0].tieEnd).toBe(true);
    session = toggleTie(session);
    expect(session.events[0].tieEnd).toBe(false);
    expect(session.events[1].tieStart).toBe(false);
  });

  test('applySlurToRange sets slurStart and slurEnd only on endpoints', function() {
    let session = createInitialSession(meta, 'c d e |');
    const notes = session.events.filter(function(ev) { return ev.type === 'note'; });
    session = applySlurToRange(session, notes[0].id, notes[2].id);
    expect(session.events[0].slurStart).toBe(true);
    expect(session.events[0].slurEnd).toBe(false);
    expect(session.events[1].slurEnd).toBe(false);
    expect(session.events[2].slurEnd).toBe(true);
  });

  test('clearSlurOnSelection removes slur flags on selected note only', function() {
    let session = createInitialSession(meta, 'c d e |');
    const notes = session.events.filter(function(ev) { return ev.type === 'note'; });
    session = applySlurToRange(session, notes[0].id, notes[2].id);
    session = Object.assign({}, session, {
      selection: { eventIds: [notes[0].id], toneIndex: null, anchorId: notes[0].id },
    });
    session = clearSlurOnSelection(session);
    expect(session.events[0].slurStart).toBe(false);
    expect(session.events[2].slurEnd).toBe(true);
  });

  test('tuplet mode attaches to three inserted notes then ends', function() {
    let session = createInitialSession(meta, '');
    session = Object.assign({}, session, {
      mode: 'noteInput',
      tupletMode: { num: 3, den: 2, groupId: 't1', notesEntered: 0, size: 3 },
    });
    session = insertPitchAtCaret(session, pitchFromLetter('C', session));
    session = insertPitchAtCaret(session, pitchFromLetter('D', session));
    session = insertPitchAtCaret(session, pitchFromLetter('E', session));
    const notes = session.events.filter(function(ev) { return ev.type === 'note'; });
    expect(notes.length).toBe(3);
    notes.forEach(function(n) {
      expect(n.tuplet.num).toBe(3);
    });
    expect(session.tupletMode).toBeNull();
  });

  test('advanceTupletMode ends after size notes', function() {
    let mode = { num: 3, den: 2, groupId: 't1', notesEntered: 0, size: 3 };
    mode = advanceTupletMode(mode);
    expect(mode.notesEntered).toBe(1);
    mode = advanceTupletMode(mode);
    mode = advanceTupletMode(mode);
    expect(mode).toBeNull();
  });

  test('insertGraceBeforeSelection adds grace group to ABC', function() {
    let session = createInitialSession(meta, 'c d |');
    const firstId = session.events[0].id;
    session = Object.assign({}, session, {
      selection: { eventIds: [firstId], toneIndex: null, anchorId: firstId },
    });
    session = insertGraceBeforeSelection(session, true);
    const abc = serializeVoiceEvents(session.events, meta);
    expect(abc).toMatch(/\{.*\}/);
  });
});
