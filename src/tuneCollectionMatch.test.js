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
});
