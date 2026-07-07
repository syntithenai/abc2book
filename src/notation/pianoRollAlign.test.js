import { matchToTimedMelody } from './pianoRollAlign';
import { assignTimingToEvents, parseNoteLengthDecimal, beatsToDuration } from './beatGrid';

const tuneMeta = { meter: '4/4', noteLength: '1/8', key: 'C', tempo: 120 };

describe('pianoRollAlign', function() {
  test('matchToTimedMelody snaps note start', function() {
    const unit = parseNoteLengthDecimal(tuneMeta.noteLength, tuneMeta.meter);
    const events = assignTimingToEvents([{
      id: 'a',
      type: 'note',
      pitch: { step: 'C', octave: 4, accidental: 0, abcName: 'C' },
      pitches: [{ step: 'C', octave: 4, accidental: 0, abcName: 'C' }],
      duration: beatsToDuration(0.5, unit),
      tieStart: false,
      tieEnd: false,
    }], tuneMeta.meter, unit);

    const timedMelody = {
      tempo: 120,
      beatTimes: [0, 0.5, 1, 1.5],
      notes: [{ midi: 60, start: 0.55, end: 0.9 }],
    };

    const out = matchToTimedMelody(events, ['a'], timedMelody, tuneMeta, { toleranceBeats: 2 });
    const note = out.find(function(ev) { return ev.id === 'a'; });
    expect(note.startBeat).toBeCloseTo(1.1, 4);
  });
});
