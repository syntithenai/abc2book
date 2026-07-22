import {
  pickDefaultSurvivorId,
  mergeTunesIntoSurvivor,
  quickMergeExactDuplicates,
} from './tuneDuplicateMerge';

describe('tuneDuplicateMerge', function() {
  test('pickDefaultSurvivorId prefers tune with more books', function() {
    const tunes = {
      a: { id: 'a', books: ['one'], lastUpdated: 100 },
      b: { id: 'b', books: ['one', 'two'], lastUpdated: 200 },
    };
    expect(pickDefaultSurvivorId(['a', 'b'], tunes)).toBe('b');
  });

  test('quickMergeExactDuplicates unions books and links', function() {
    const survivor = {
      id: 'a',
      name: 'Tune',
      books: ['book1'],
      links: [{ title: 'A', link: 'https://youtu.be/abc12345678' }],
      voices: { 1: { notes: ['C'] } },
    };
    const incoming = {
      id: 'b',
      name: 'Tune',
      books: ['book2'],
      links: [{ title: 'B', link: 'https://youtu.be/xyz98765432' }],
      voices: { 1: { notes: ['D'] } },
    };
    const merged = quickMergeExactDuplicates(survivor, [incoming]);
    expect(merged.books).toEqual(expect.arrayContaining(['book1', 'book2']));
    expect(merged.links).toHaveLength(2);
    expect(merged.voices['1'].notes).toEqual(['C']);
  });

  test('mergeTunesIntoSurvivor applies field selections', function() {
    const survivor = {
      id: 'a',
      name: 'Old Title',
      composer: 'A',
      books: [],
      links: [],
    };
    const incoming = {
      id: 'b',
      name: 'New Title',
      composer: 'B',
      books: ['irish'],
      links: [],
    };
    const merged = mergeTunesIntoSurvivor(survivor, incoming, { name: true });
    expect(merged.name).toBe('New Title');
    expect(merged.composer).toBe('A');
    expect(merged.books).toEqual(['irish']);
  });

  test('mergeTunesIntoSurvivor unions snapshots from both tunes', function() {
    const survivor = {
      id: 'a',
      name: 'Tune',
      books: [],
      links: [],
      tuneFiles: [{ id: 'f1', name: 'a.pdf', type: 'application/pdf' }],
    };
    const incoming = {
      id: 'b',
      name: 'Tune',
      books: [],
      links: [],
      tuneFiles: [{ id: 'f2', name: 'b.png', type: 'image/png' }],
    };
    const merged = mergeTunesIntoSurvivor(survivor, incoming, {});
    expect(merged.tuneFiles).toHaveLength(2);
  });
});
