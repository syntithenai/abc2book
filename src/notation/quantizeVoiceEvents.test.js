import { quantizeVoiceEvents, buildBeatUnitGrid } from './quantizeVoiceEvents';

describe('quantizeVoiceEvents', function() {
  test('buildBeatUnitGrid emits integer beat indices', function() {
    expect(buildBeatUnitGrid(4, 1)).toEqual([0, 1, 2, 3, 4]);
  });

  test('snaps off-grid startBeat toward beat subdivision', function() {
    const events = [{
      id: 'a',
      type: 'note',
      startBeat: 1.12,
      durationBeats: 0.5,
      duration: { num: 1, den: 1, dotted: false },
      pitch: { step: 'C', octave: 4, accidental: null },
    }];
    const out = quantizeVoiceEvents(events, {
      meter: '4/4',
      noteLength: '1/8',
      strength: 1,
      slotsPerBeat: 4,
      beatsPerBar: 4,
    });
    expect(out[0].startBeat).toBeCloseTo(1, 5);
    expect(out.unchanged).toBe(false);
  });

  test('already-grid notes stay put and report unchanged', function() {
    const events = [{
      id: 'a',
      type: 'note',
      startBeat: 1,
      durationBeats: 0.5,
      duration: { num: 1, den: 2, dotted: false },
      pitch: { step: 'C', octave: 4, accidental: null },
    }];
    const out = quantizeVoiceEvents(events, {
      meter: '4/4',
      noteLength: '1/8',
      strength: 1,
      slotsPerBeat: 4,
      beatsPerBar: 4,
    });
    expect(out[0].startBeat).toBeCloseTo(1, 5);
  });
});
