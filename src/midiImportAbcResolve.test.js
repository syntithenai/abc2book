import { resolveImportAbcFromResponse } from './midiImportAbcResolve';
import { musicXmlToAbc } from './musicXmlToAbc';

jest.mock('./musicXmlToAbc', () => ({
  musicXmlToAbc: jest.fn(),
  MIDI_XML2ABC_OPTIONS: { d: 8 },
}));

describe('midiImportAbcResolve', function() {
  beforeEach(function() {
    jest.clearAllMocks();
  });

  test('prefers MusicXML for multi_voice when strategy is musicxml', function() {
    musicXmlToAbc.mockReturnValue('X:1\nM:4/4\nL:1/8\nK:C\nV:1\n[V:1]\nC2 D2 |');
    const abc = resolveImportAbcFromResponse({
      abc: 'X:1\nK:C\nold',
      musicXml: '<score-partwise/>',
      strategy: 'musicxml',
      mode: 'multi_voice',
      profile: { tempo_bpm: 120, tracks: [{ index: 0, name: 'Track 1', program: 40, is_drum: false }] },
    }, 'tune.mid', { trackIds: [0, 1] });
    expect(musicXmlToAbc).toHaveBeenCalled();
    expect(abc).toContain('V:1');
  });

  test('keeps note_events ABC for multi_voice when strategy is note_events', function() {
    const serverAbc = 'X:1\nM:4/4\nL:1/8\nK:C\n%%MIDI program 40\nV:1 nm="violin" clef=treble\nV:2 nm="acoustic bass" clef=bass\n[V:1]\nG2 |\n[V:2]\nC,2 |';
    const abc = resolveImportAbcFromResponse({
      abc: serverAbc,
      musicXml: '<score-partwise/>',
      strategy: 'note_events',
      mode: 'multi_voice',
      profile: {
        tempo_bpm: 120,
        tracks: [
          { index: 0, name: 'Track 1', program: 40, is_drum: false, role_hint: 'melody' },
          { index: 1, name: 'Track 2', program: 32, is_drum: false, role_hint: 'bass' },
        ],
      },
    }, 'tune.mid', { trackIds: [0, 1] });
    expect(musicXmlToAbc).not.toHaveBeenCalled();
    expect(abc).toContain('nm="violin"');
    expect(abc).toContain('nm="acoustic bass"');
    expect(abc).toContain('[V:2]');
  });

  test('keeps server ABC for note_events melody when no MusicXML preference', function() {
    const serverAbc = 'X:1\nM:4/4\nL:1/8\nK:G\nG2 A2 |';
    const abc = resolveImportAbcFromResponse({
      abc: serverAbc,
      strategy: 'note_events',
      mode: 'melody',
      profile: { tempo_bpm: 120 },
    }, 'tune.mid');
    expect(musicXmlToAbc).not.toHaveBeenCalled();
    expect(abc).toBe(serverAbc);
  });
});
