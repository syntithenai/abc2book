import { resolveCleanupPreviewNotes } from './midiParseClient';

describe('midiParseClient', function() {
  test('resolveCleanupPreviewNotes maps profile track ids onto parsed notes', function() {
    const parsed = {
      tracks: [
        { index: 0, name: '', isDrum: false, notes: [] },
        { index: 1, name: 'Piano', isDrum: false, notes: [{ midi: 60, start: 0, end: 0.5 }] },
      ],
    };
    const profile = {
      tracks: [{ index: 0, name: 'Piano', is_drum: false, note_count: 1 }],
      recommended_track_ids: [0],
    };

    const notes = resolveCleanupPreviewNotes(parsed, profile, [0]);

    expect(notes.length).toBe(1);
    expect(notes[0].midi).toBe(60);
  });

  test('resolveCleanupPreviewNotes combines multiple selected tracks', function() {
    const parsed = {
      tracks: [
        { index: 0, name: '', isDrum: false, notes: [] },
        { index: 1, name: 'Violin', isDrum: false, notes: [{ midi: 62, start: 0, end: 0.5 }] },
        { index: 2, name: 'Piano', isDrum: false, notes: [{ midi: 64, start: 0.5, end: 1 }] },
      ],
    };
    const profile = {
      tracks: [
        { index: 0, name: 'Violin', is_drum: false, note_count: 1 },
        { index: 1, name: 'Piano', is_drum: false, note_count: 1 },
      ],
      recommended_track_ids: [0, 1],
    };

    const notes = resolveCleanupPreviewNotes(parsed, profile, [0, 1]);

    expect(notes.length).toBe(2);
    expect(notes.map(function(n) { return n.midi; }).sort()).toEqual([62, 64]);
  });
});
