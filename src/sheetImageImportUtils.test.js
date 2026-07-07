import { buildDraftFromSheetImageResult } from './sheetImageImportUtils';

describe('sheetImageImportUtils', function() {
  test('buildDraftFromSheetImageResult merges chord and melody metadata', function() {
    const draft = buildDraftFromSheetImageResult({
      title: 'Test Song',
      artist: 'Demo Artist',
      pageType: 'mixed',
      chordSheet: {
        text: 'Verse\nC G\nHello world',
        lineDetails: [
          { text: 'C', tokens: [{ text: 'C', start: 0, end: 1 }] },
          { text: 'Hello world', tokens: [{ text: 'Hello', start: 0, end: 5 }, { text: 'world', start: 6, end: 11 }] },
        ],
        confidence: 0.8,
      },
      melody: {
        abc: 'CDEF',
        key: 'C',
        meter: '4/4',
        confidence: 0.7,
      },
      warnings: [],
    });
    expect(draft.chordDraft.title).toBe('Test Song');
    expect(draft.melodyAbc).toBe('CDEF');
    expect(Array.isArray(draft.chordDraft.chordSheetAlignment)).toBe(true);
    expect(draft.chordDraft.chordSheetAlignment.length).toBe(2);
  });
});
