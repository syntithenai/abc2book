import {
  applyTuneImportSelections,
  buildDefaultTuneImportSelections,
  buildTuneImportFieldRows,
  formatTuneFieldValue,
  importedFieldIsPresent,
  metaDiffAutoAccept,
  setAllTuneImportSelections,
  tuneLinksEqual,
} from './tuneImportMergeUtils';

describe('tuneImportMergeUtils', function() {
  const original = {
    id: 'orig-id',
    name: 'My Tune',
    composer: 'Me',
    key: 'G',
    books: ['my-book'],
    tags: ['favorite'],
    links: [{ title: 'YouTube', link: 'https://example.com' }],
    voices: { '1': { meta: '', notes: ['G2'] } },
    words: ['old lyric'],
  };

  const imported = {
    id: 'import-id',
    name: 'Imported Tune',
    composer: 'Traditional',
    key: 'D',
    rhythm: 'reel',
    voices: { '1': { meta: '', notes: ['D2'] } },
    words: ['new lyric'],
    boost: 2,
    tempo: 100,
    capo: 0,
  };

  test('buildTuneImportFieldRows only includes incoming imported fields', function() {
    const rows = buildTuneImportFieldRows(original, imported);
    const keys = rows.map(function(row) { return row.key; });
    expect(keys).toContain('name');
    expect(keys).toContain('composer');
    expect(keys).toContain('key');
    expect(keys).toContain('rhythm');
    expect(keys).toContain('voices');
    expect(keys).toContain('words');
    expect(keys).toContain('boost');
    expect(keys).not.toContain('books');
    expect(keys).not.toContain('tags');
    expect(keys).not.toContain('links');
    expect(keys).not.toContain('tempo');
    expect(keys).not.toContain('capo');
  });

  test('importedFieldIsPresent ignores abc parser defaults', function() {
    expect(importedFieldIsPresent('tempo', 100)).toBe(false);
    expect(importedFieldIsPresent('boost', 0)).toBe(false);
    expect(importedFieldIsPresent('boost', 2)).toBe(true);
    expect(importedFieldIsPresent('voices', { '1': { notes: [] } })).toBe(false);
  });

  test('default selections prefer ABC metadata, music, and lyrics', function() {
    const rows = buildTuneImportFieldRows(original, imported);
    const selections = buildDefaultTuneImportSelections(rows);
    expect(selections.name).toBe(true);
    expect(selections.voices).toBe(true);
    expect(selections.words).toBe(true);
    expect(selections.boost).toBe(false);
  });

  test('applyTuneImportSelections only updates ticked fields', function() {
    const rows = buildTuneImportFieldRows(original, imported);
    const merged = applyTuneImportSelections(original, imported, buildDefaultTuneImportSelections(rows));
    expect(merged.id).toBe('orig-id');
    expect(merged.name).toBe('Imported Tune');
    expect(merged.key).toBe('D');
    expect(merged.voices['1'].notes[0]).toBe('D2');
    expect(merged.words[0]).toBe('new lyric');
    expect(merged.books).toEqual(['my-book']);
    expect(merged.tags).toEqual(['favorite']);
    expect(merged.links[0].link).toBe('https://example.com');
    expect(merged.boost).toBeUndefined();
  });

  test('setAllTuneImportSelections with false leaves tune unchanged', function() {
    const rows = buildTuneImportFieldRows(original, imported);
    const merged = applyTuneImportSelections(
      original,
      imported,
      setAllTuneImportSelections(rows, false)
    );
    expect(merged.name).toBe('My Tune');
    expect(merged.voices['1'].notes[0]).toBe('G2');
  });

  test('formatTuneFieldValue summarizes voices', function() {
    expect(formatTuneFieldValue('voices', { '1': { notes: ['a', 'b'] } })).toContain('1 voice');
    expect(formatTuneFieldValue('voices', { '1': { notes: ['a', 'b'] } })).toContain('2 lines');
  });

  test('formatTuneFieldValue lists links for comparison', function() {
    const display = formatTuneFieldValue('links', [
      { title: 'YouTube', link: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
      { name: 'Sheet', link: 'https://example.com/sheet.pdf' },
    ]);
    expect(display).toContain('YouTube: https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(display).toContain('Sheet: https://example.com/sheet.pdf');
  });

  test('tuneLinksEqual ignores youtube URL shape and link order', function() {
    const localLinks = [{ title: 'Clip', link: 'https://youtu.be/dQw4w9WgXcQ' }];
    const importedLinks = [{ title: 'Clip', link: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }];
    expect(tuneLinksEqual(localLinks, importedLinks)).toBe(true);
  });

  test('buildTuneImportFieldRows hides equivalent links from differing fields', function() {
    const rows = buildTuneImportFieldRows(
      { links: [{ title: 'YouTube', link: 'https://youtu.be/abc12345678' }] },
      { links: [{ title: 'YouTube', link: 'https://www.youtube.com/watch?v=abc12345678' }] }
    );
    const linksRow = rows.find(function(row) { return row.key === 'links'; });
    expect(linksRow).toBeTruthy();
    expect(linksRow.differs).toBe(false);
  });

  test('metaDiffAutoAccept treats ABC tune index as non-differing metadata', function() {
    expect(metaDiffAutoAccept({ X: 15 }, { X: 16 })).toBe(true);
    expect(metaDiffAutoAccept(undefined, { X: 16 })).toBe(true);
    expect(metaDiffAutoAccept({ X: 15, S: 'abc' }, { X: 16, S: 'abc' })).toBe(true);
    expect(metaDiffAutoAccept({ S: 'abc' }, { S: 'def' })).toBe(false);
  });

  test('applyTuneImportSelections auto-applies incoming ABC tune index metadata', function() {
    const merged = applyTuneImportSelections(
      { id: 'orig-id', meta: { X: 15, S: 'abc' } },
      { id: 'import-id', meta: { X: 16, S: 'abc' } },
      {}
    );
    expect(merged.meta).toEqual({ X: 16, S: 'abc' });
  });
});
