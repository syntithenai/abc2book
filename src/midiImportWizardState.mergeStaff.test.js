import {
  assignTracksToMergeGroup,
  buildImportOptionsFromDraft,
  buildScoreDirective,
  createMidiImportDraft,
  defaultSelectedTrackIds,
  initDraftFromProfile,
  resolveImportVoices,
  ungroupTracks,
} from './midiImportWizardState';

describe('midi import merge groups and staff', function() {
  const profile = {
    recommended_track_ids: [0],
    recommended_mode: 'melody',
    tracks: [
      { index: 0, name: 'Violin 1', is_drum: false, note_count: 100, role_hint: 'melody', program: 40, channel: 0 },
      { index: 1, name: 'Violin 2', is_drum: false, note_count: 90, role_hint: 'melody', program: 40, channel: 1 },
      { index: 2, name: 'Bass', is_drum: false, note_count: 80, role_hint: 'bass', program: 32, channel: 2 },
      { index: 3, name: 'Pad', is_drum: false, note_count: 5, role_hint: 'harmony', program: 88, channel: 3 },
      { index: 4, name: 'Drums', is_drum: true, note_count: 200, role_hint: 'drum', program: 0, channel: 9 },
    ],
  };

  test('defaultSelectedTrackIds prefers recommended / roles over selecting everything', function() {
    const ids = defaultSelectedTrackIds(profile);
    expect(ids).toContain(0);
    expect(ids.indexOf(3)).toBeLessThan(0);
  });

  test('merge group collapses sources into one import voice', function() {
    let draft = initDraftFromProfile(createMidiImportDraft({}), profile);
    draft.selectedTrackIds = [0, 1, 2];
    draft = assignTracksToMergeGroup(draft, [0, 1], null);
    const voices = resolveImportVoices(draft);
    expect(voices.length).toBe(2);
    const merged = voices.find(function(v) { return (v.sourceIds || []).length === 2; });
    expect(merged).toBeTruthy();
    expect(merged.sourceIds.slice().sort()).toEqual([0, 1]);
  });

  test('staff and system map flow into import options and score directive', function() {
    let draft = initDraftFromProfile(createMidiImportDraft({}), profile);
    draft.selectedTrackIds = [0, 2];
    draft.trackStaff = Object.assign({}, draft.trackStaff || {}, { 0: 'treble', 2: 'bass' });
    draft.trackSystem = Object.assign({}, draft.trackSystem || {}, { 0: '1', 2: '1' });
    const opts = buildImportOptionsFromDraft(draft);
    expect(opts.staffByVoice).toEqual(['treble', 'bass']);
    const directive = buildScoreDirective(opts.importVoices);
    expect(directive).toContain('%%score');
  });

  test('ungroup restores separate voices', function() {
    let draft = initDraftFromProfile(createMidiImportDraft({}), profile);
    draft.selectedTrackIds = [0, 1];
    draft = assignTracksToMergeGroup(draft, [0, 1], null);
    expect(resolveImportVoices(draft).length).toBe(1);
    draft = ungroupTracks(draft, [0, 1]);
    expect(resolveImportVoices(draft).length).toBe(2);
  });

  test('drums default to skip', function() {
    const draft = initDraftFromProfile(createMidiImportDraft({}), profile);
    expect(draft.drumTrackModes[4]).toBe('skip');
  });
});
