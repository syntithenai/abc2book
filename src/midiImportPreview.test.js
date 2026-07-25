import { buildMidiImportAbcFromDraft } from './midiImportPreview';
import { createMidiImportDraft } from './midiImportWizardState';

describe('midiImportPreview', function() {
  test('buildMidiImportAbcFromDraft returns empty without bytes', function() {
    expect(buildMidiImportAbcFromDraft(createMidiImportDraft({}))).toBe('');
  });
});
