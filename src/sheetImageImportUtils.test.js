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

  test('buildDraftFromSheetImageResult accepts lyrics_only sheetFormat', function() {
    const draft = buildDraftFromSheetImageResult({
      title: 'Amazing Grace',
      artist: 'Traditional',
      sheetFormat: 'lyrics_only',
      pageType: 'lyrics_only',
      meta: { title: 'Amazing Grace', artist: 'Traditional', sourceFormat: 'lyrics_only' },
      chordSheet: {
        format: 'lyrics-only',
        text: '{title: Amazing Grace}\n\nAmazing grace how sweet the sound',
        confidence: 0.7,
      },
      melody: { abc: 'C D E', key: 'C' },
      warnings: [],
    });
    expect(draft.chordDraft.title).toBe('Amazing Grace');
    expect(draft.melodyAbc).toBe('');
    expect(draft.sheetFormat).toBe('lyrics_only');
  });
});
