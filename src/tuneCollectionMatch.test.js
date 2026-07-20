import { findCollectionMatches, matchConfidenceLabel } from './tuneCollectionMatch';

describe('tuneCollectionMatch', function() {
  const tunes = {
    a1: { id: 'a1', name: 'Whiskey in the Jar', composer: 'Traditional', links: [] },
    a2: {
      id: 'a2',
      name: 'Wild Rover',
      composer: 'The Dubliners',
      links: [{ link: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: '' }],
    },
  };

  test('matchConfidenceLabel maps scores', function() {
    expect(matchConfidenceLabel(100, true)).toBe('Exact');
    expect(matchConfidenceLabel(14, false)).toBe('Exact');
    expect(matchConfidenceLabel(8, false)).toBe('Likely');
    expect(matchConfidenceLabel(4, false)).toBe('Approximate');
  });

  test('findCollectionMatches finds title matches', function() {
    const results = findCollectionMatches({
      title: 'Whiskey',
      artist: '',
      tunes: tunes,
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].tune.id).toBe('a1');
  });

  test('findCollectionMatches prefers YouTube id match', function() {
    const results = findCollectionMatches({
      title: 'Unknown title',
      artist: '',
      tunes: tunes,
      youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
    });
    expect(results[0].tune.id).toBe('a2');
    expect(results[0].youtubeMatch).toBe(true);
  });

  test('findCollectionMatches drops title hits when lyrics are unrelated', function() {
    const library = {
      a1: {
        id: 'a1',
        name: 'Whiskey in the Jar',
        composer: 'Traditional',
        words: [
          'As I was going over the far famed Kerry mountains',
          'I met with Captain Farrell and his money he was counting',
          'I first produced my pistol and I then produced my rapier',
          'I said stand and deliver or the devil he may take ya',
        ],
      },
    };
    const results = findCollectionMatches({
      title: 'Whiskey in the Jar',
      artist: 'Traditional',
      tunes: library,
      importTune: {
        name: 'Whiskey in the Jar',
        words: [
          "I've been a wild rover for many a year",
          "And I've spent all my money on whiskey and beer",
          'And now I am returning with gold in great store',
          "And I never will play the wild rover no more",
        ],
      },
    });
    expect(results.some(function(entry) { return entry.tune.id === 'a1'; })).toBe(false);
  });
});
