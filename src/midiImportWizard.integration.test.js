import { resolveImportAbcFromResponse } from './midiImportAbcResolve';

jest.mock('./musicXmlToAbc', () => ({
  musicXmlToAbc: jest.fn(),
  MIDI_XML2ABC_OPTIONS: { d: 8 },
}));

import { musicXmlToAbc } from './musicXmlToAbc';

describe('midiImportWizard integration', function() {
  test('preview import path uses orchestrator MusicXML result', function() {
    musicXmlToAbc.mockReturnValue('X:1\nM:6/8\nL:1/8\nK:D\nC2 D2 |');
    const previewResult = {
      abc: '',
      musicXml: '<score-partwise/>',
      strategy: 'musicxml',
      mode: 'melody',
      confidence: 0.8,
      warnings: [],
      diagnostics: { quant_error: 0.05, quant_divisors: '4,8,3,6' },
      profile: { tempo_bpm: 120 },
    };
    const abc = resolveImportAbcFromResponse(previewResult, 'jig.mid', { trackIds: [0] });
    expect(abc).toContain('K:D');
    expect(abc).toContain('M:6/8');
  });
});
