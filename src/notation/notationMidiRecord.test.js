import { appendMidiRecordNote, midiRecordBufferToEvents } from './notationMidiRecord';
import { createInitialSession } from './notationSession';

describe('notationMidiRecord', function() {
  const meta = { meter: '4/4', noteLength: '1/8', key: 'C', tempo: 120 };

  test('appendMidiRecordNote tracks note on/off', function() {
    let buf = [];
    buf = appendMidiRecordNote(buf, { midi: 60, velocity: 80, timeMs: 0 }, true);
    buf = appendMidiRecordNote(buf, { midi: 60, timeMs: 500 }, false);
    expect(buf.length).toBe(1);
    expect(buf[0].endMs).toBe(500);
  });

  test('midiRecordBufferToEvents produces notes', function() {
    let session = createInitialSession(meta, '');
    session = Object.assign({}, session, { caretIndex: 0, unitLengthDecimal: 0.125 });
    const buffer = [
      { midi: 60, velocity: 80, startMs: 1000, endMs: 1500 },
      { midi: 62, velocity: 80, startMs: 1500, endMs: 2000 },
    ];
    const result = midiRecordBufferToEvents(buffer, session, { slotsPerBeat: 4 });
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.caretIndex).toBeGreaterThan(0);
  });

  test('midiRecordBufferToEvents passes beatTimes to quantize', function() {
    let session = createInitialSession(meta, '');
    session = Object.assign({}, session, { caretIndex: 0, unitLengthDecimal: 0.125 });
    const buffer = [{ midi: 60, velocity: 80, startMs: 0, endMs: 500 }];
    const beatTimes = [0, 0.5, 1, 1.5, 2];
    const result = midiRecordBufferToEvents(buffer, session, {
      slotsPerBeat: 4,
      beatTimes: beatTimes,
    });
    expect(result.events.length).toBeGreaterThan(0);
  });
});
