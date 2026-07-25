import {
  displayNameForMidiTrack,
  isGenericMidiTrackName,
} from './midiTrackNaming';

describe('midiTrackNaming', function() {
  test('isGenericMidiTrackName matches Track N', function() {
    expect(isGenericMidiTrackName('Track 1')).toBe(true);
    expect(isGenericMidiTrackName('track 12')).toBe(true);
    expect(isGenericMidiTrackName('Violin')).toBe(false);
  });

  test('displayNameForMidiTrack prefers instrument over generic track name', function() {
    expect(displayNameForMidiTrack({
      id: 1,
      name: 'Track 2',
      program: 73,
      isDrum: false,
    })).toBe('flute');
  });
});
