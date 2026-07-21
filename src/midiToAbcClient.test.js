import { importMidiToAbc } from './midiToAbcClient';
import { fetchViaMediaProxy } from './mediaProxyClient';
import { musicXmlToAbc } from './musicXmlToAbc';

jest.mock('./mediaProxyClient', () => ({
  fetchViaMediaProxy: jest.fn(),
}));

jest.mock('./musicXmlToAbc', () => ({
  musicXmlToAbc: jest.fn(),
  MIDI_XML2ABC_OPTIONS: { d: 8 },
}));

describe('midiToAbcClient', function() {
  beforeEach(function() {
    jest.clearAllMocks();
  });

  test('importMidiToAbc returns server ABC when present', async function() {
    fetchViaMediaProxy.mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({
        abc: 'X:1\nT:Test\nM:4/4\nL:1/8\nK:G\nG2 A2 |',
        strategy: 'note_events',
        mode: 'melody',
        confidence: 0.82,
        warnings: [],
        diagnostics: {},
        profile: { tempo_bpm: 120 },
      }),
    });

    const result = await importMidiToAbc(new Uint8Array([1, 2, 3]), 'tune.mid', null);
    expect(result.abc).toContain('K:G');
    expect(result.strategy).toBe('note_events');
    expect(result.confidence).toBe(0.82);
    expect(musicXmlToAbc).not.toHaveBeenCalled();
  });

  test('importMidiToAbc converts MusicXML fallback on client', async function() {
    fetchViaMediaProxy.mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({
        abc: '',
        musicXml: '<score-partwise></score-partwise>',
        strategy: 'musicxml',
        mode: 'melody',
        confidence: 0.7,
        warnings: ['ABC will be generated from MusicXML on the client'],
        diagnostics: {},
        profile: { tempo_bpm: 100 },
      }),
    });
    musicXmlToAbc.mockReturnValue('X:1\nT:Test\nM:4/4\nL:1/8\nK:D\nD2 E2 |');

    const result = await importMidiToAbc(new Uint8Array([77, 84, 104, 100]), 'tune.mid', 'token');
    expect(musicXmlToAbc).toHaveBeenCalled();
    expect(result.abc).toContain('K:D');
    expect(result.strategy).toBe('musicxml');
  });
});
