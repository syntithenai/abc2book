import { quantizeVoiceEvents } from './quantizeVoiceEvents';

describe('quantizeVoiceEvents', function() {
  test('snaps startBeat toward grid', function() {
    const events = [{
      id: 'a',
      type: 'note',
      startBeat: 1.12,
      durationBeats: 0.5,
      duration: { num: 1, den: 1, dotted: false },
    }];
    const out = quantizeVoiceEvents(events, {
      meter: '4/4',
      noteLength: '1/8',
      strength: 1,
      slotsPerBeat: 4,
      beatsPerBar: 4,
      tempo: 120,
    });
    expect(out[0].startBeat).toBe(0);
  });
});
