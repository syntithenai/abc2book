import { mergeTuneCollectionExtras, unionTuneFileMeta } from './tuneMergeExtras';

describe('tuneMergeExtras', function() {
  test('unionTuneFileMeta dedupes by file id', function() {
    const merged = unionTuneFileMeta(
      [{ id: 'f1', name: 'A.pdf', type: 'application/pdf' }],
      [
        { id: 'f1', name: 'A.pdf', type: 'application/pdf' },
        { id: 'f2', name: 'B.png', type: 'image/png' },
      ]
    );
    expect(merged).toHaveLength(2);
    expect(merged.map(function(f) { return f.id; })).toEqual(['f1', 'f2']);
  });

  test('mergeTuneCollectionExtras unions links books tags and snapshots', function() {
    const local = {
      id: 'a',
      links: [{ title: 'A', link: 'https://youtu.be/abc12345678' }],
      books: ['book1'],
      tags: ['fast'],
      artists: ['Artist A'],
      aliases: [],
      tuneFiles: [{ id: 'f1', name: 'scan.pdf', type: 'application/pdf' }],
      activeFile: '',
    };
    const incoming = {
      id: 'b',
      links: [{ title: 'B', link: 'https://youtu.be/xyz98765432' }],
      books: ['book2'],
      tags: ['irish'],
      artists: ['Artist B'],
      aliases: ['Alt'],
      tuneFiles: [{ id: 'f2', name: 'photo.png', type: 'image/png' }],
      activeFile: 'f2',
    };
    const merged = mergeTuneCollectionExtras(local, incoming);
    expect(merged.links).toHaveLength(2);
    expect(merged.books).toEqual(expect.arrayContaining(['book1', 'book2']));
    expect(merged.tags).toEqual(expect.arrayContaining(['fast', 'irish']));
    expect(merged.artists).toEqual(expect.arrayContaining(['Artist A', 'Artist B']));
    expect(merged.aliases).toEqual(['Alt']);
    expect(merged.tuneFiles).toHaveLength(2);
    expect(merged.activeFile).toBe('f2');
  });
});
