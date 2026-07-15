import { createInitialSession, notationSessionReducer } from './notationSession';
import { EDITOR_MODES, EDITOR_VIEWS } from './notationConstants';

describe('notationSession', function() {
  const tuneMeta = { meter: '4/4', noteLength: '1/8', key: 'C', tempo: 120 };

  test('SET_CARET clamps to valid range', function() {
    let session = createInitialSession(tuneMeta, 'C D E F |');
    expect(session.events.length).toBeGreaterThan(0);
    const len = session.events.length;
    session = notationSessionReducer(session, { type: 'SET_CARET', index: -1 });
    expect(session.caretIndex).toBe(0);
    session = notationSessionReducer(session, { type: 'SET_CARET', index: 99 });
    expect(session.caretIndex).toBe(len);
    session = notationSessionReducer(session, { type: 'SET_CARET', index: 2 });
    expect(session.caretIndex).toBe(2);
  });

  test('SET_EVENTS preserves caret when caretIndex absent', function() {
    let session = createInitialSession(tuneMeta, 'C D |');
    session = notationSessionReducer(session, { type: 'SET_CARET', index: 1 });
    const events = session.events.slice();
    session = notationSessionReducer(session, {
      type: 'SET_EVENTS',
      events: events,
    });
    expect(session.caretIndex).toBe(1);
  });

  test('SET_EVENTS applies caretIndex when provided', function() {
    let session = createInitialSession(tuneMeta, 'C D |');
    session = notationSessionReducer(session, { type: 'SET_CARET', index: 1 });
    const events = session.events.slice();
    session = notationSessionReducer(session, {
      type: 'SET_EVENTS',
      events: events,
      caretIndex: 0,
    });
    expect(session.caretIndex).toBe(0);
  });

  test('LOAD_VOICE resets edit state but preserves chrome', function() {
    let session = createInitialSession(tuneMeta, 'C D |');
    session = notationSessionReducer(session, { type: 'SET_MODE', mode: EDITOR_MODES.NOTE_INPUT });
    session = notationSessionReducer(session, { type: 'SET_VIEW', view: EDITOR_VIEWS.SPLIT });
    session = notationSessionReducer(session, {
      type: 'SET_PIANO_ROLL_STATE',
      patch: { pianoRollZoom: { beatWidth: 80, rowHeight: 20 }, snapEnabled: false },
    });
    session = notationSessionReducer(session, {
      type: 'SET_MIDI_STATE',
      patch: { midiEnabled: true },
    });
    session = notationSessionReducer(session, { type: 'SET_CARET', index: 2 });
    session = notationSessionReducer(session, {
      type: 'SET_SELECTION',
      selection: { eventIds: ['x'], toneIndex: null, anchorId: 'x' },
    });

    const loaded = notationSessionReducer(session, {
      type: 'LOAD_VOICE',
      tuneMeta: tuneMeta,
      voiceBody: 'E F |',
    });

    // Caret slot is preserved across commit-echo reloads; selection is cleared.
    expect(loaded.caretIndex).toBe(2);
    expect(loaded.selection.eventIds).toEqual([]);
    expect(loaded.events.some(function(ev) { return ev.pitch && ev.pitch.step === 'E'; })).toBe(true);
    expect(loaded.mode).toBe(EDITOR_MODES.NOTE_INPUT);
    expect(loaded.view).toBe(EDITOR_VIEWS.SPLIT);
    expect(loaded.pianoRollZoom.beatWidth).toBe(80);
    expect(loaded.snapEnabled).toBe(false);
    expect(loaded.midiEnabled).toBe(true);
  });

  test('SET_SELECTION SET_DURATION_KEY TOGGLE_DOT store exact values', function() {
    let session = createInitialSession(tuneMeta, 'C |');
    session = notationSessionReducer(session, {
      type: 'SET_SELECTION',
      selection: { eventIds: ['a', 'b'], toneIndex: 1, anchorId: 'a' },
    });
    expect(session.selection).toEqual({ eventIds: ['a', 'b'], toneIndex: 1, anchorId: 'a' });

    session = notationSessionReducer(session, { type: 'SET_DURATION_KEY', key: 7, dotted: true });
    expect(session.durationKey).toBe(7);
    expect(session.dotted).toBe(true);

    session = notationSessionReducer(session, { type: 'TOGGLE_DOT' });
    expect(session.dotted).toBe(false);
  });
});
