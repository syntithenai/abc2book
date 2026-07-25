import {
  applyMidiProfileVoiceNamesToAbc,
  voiceDescriptorsFromProfile,
} from './midiImportAbcEnhance';

describe('midiImportAbcEnhance', function() {
  const profile = {
    tracks: [
      { index: 0, name: 'Track 1', program: 40, is_drum: false, role_hint: 'melody', note_count: 100 },
      { index: 1, name: '', program: 32, is_drum: false, role_hint: 'bass', note_count: 80 },
    ],
  };

  test('voiceDescriptorsFromProfile preserves selected track order', function() {
    const voices = voiceDescriptorsFromProfile(profile, [1, 0]);
    expect(voices.map(function(v) { return v.id; })).toEqual([1, 2]);
    expect(voices[0].program).toBe(32);
    expect(voices[1].program).toBe(40);
  });

  test('applyMidiProfileVoiceNamesToAbc replaces generic track names and adds programs', function() {
    const abc = applyMidiProfileVoiceNamesToAbc(
      'X:1\nM:4/4\nL:1/8\nK:C\nV:1 nm="Track 1" clef=treble\nV:2 nm="Track 2" clef=treble\n[V:1]\nC2 |\n[V:2]\nC,2 |',
      profile,
      { trackIds: [0, 1] }
    );
    expect(abc).toContain('nm="violin"');
    expect(abc).toContain('nm="acoustic bass"');
    expect(abc).toContain('clef=bass');
    expect(abc).toContain('%%MIDI program 40');
    expect(abc).toContain('%%MIDI program 32');
    expect(abc.indexOf('[V:1]')).toBeLessThan(abc.indexOf('%%MIDI program 40'));
    expect(abc.indexOf('%%MIDI program 40')).toBeLessThan(abc.indexOf('C2'));
    expect(abc.indexOf('[V:2]')).toBeLessThan(abc.indexOf('%%MIDI program 32'));
    expect(abc).not.toContain('nm="Track 1"');
  });
});
