import {
  countSelectedVoices,
  defaultSelectedTrackIds,
  initDraftFromProfile,
  createMidiImportDraft,
} from './midiImportWizardState';

describe('midiImportWizardState', function() {
  const profile = {
    recommended_track_ids: [2, 5],
    recommended_mode: 'melody',
    tracks: [
      { index: 0, is_drum: false, note_count: 500 },
      { index: 1, is_drum: false, note_count: 0 },
      { index: 2, is_drum: false, note_count: 10 },
      { index: 3, is_drum: true, note_count: 200 },
      { index: 5, is_drum: false, note_count: 300 },
    ],
  };

  test('defaultSelectedTrackIds uses recommended ids without selecting every pitched track', function() {
    const ids = defaultSelectedTrackIds(profile);
    expect(ids[0]).toBe(2);
    expect(ids[1]).toBe(5);
    expect(ids).not.toContain(1);
    expect(ids).not.toContain(0);
  });

  test('initDraftFromProfile sets multi_voice when multiple pitched tracks selected', function() {
    const draft = initDraftFromProfile(createMidiImportDraft({}), profile);
    expect(draft.selectedTrackIds.length).toBeGreaterThanOrEqual(2);
    expect(draft.mode).toBe('multi_voice');
    expect(draft.drumTrackModes[3]).toBe('skip');
  });

  test('countSelectedVoices includes pitched and percussion', function() {
    const draft = {
      selectedTrackIds: [0, 2],
      drumTrackModes: { 3: 'percussion', 4: 'skip' },
    };
    expect(countSelectedVoices(draft)).toBe(3);
  });
});
