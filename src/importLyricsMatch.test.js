import {
  importLyricsMatchForDeduping,
  normalizeLyricLineForMatch,
  significantLyricTokensFromTune,
} from './importLyricsMatch';

describe('importLyricsMatch', function() {
  test('normalizeLyricLineForMatch strips chords', function() {
    expect(normalizeLyricLineForMatch('[G]Amazing grace how [C]sweet')).toBe(
      'amazing grace how sweet'
    );
  });

  test('allows match when either side has no lyrics', function() {
    expect(importLyricsMatchForDeduping(
      { words: ['As I was going over the far famed kerry mountains'] },
      { name: 'Song' }
    )).toBe(true);
    expect(importLyricsMatchForDeduping(
      { name: 'Song' },
      { words: ['As I was going over the far famed kerry mountains'] }
    )).toBe(true);
  });

  test('allows match when lyrics share commonality', function() {
    const a = {
      words: [
        'As I was going over the far famed Kerry mountains',
        'I met with Captain Farrell and his money he was counting',
        'I first produced my pistol and I then produced my rapier',
      ],
    };
    const b = {
      words: [
        '[Am]As I was going over the far famed Kerry mountains',
        'I met with Captain Farrell and his money he was counting',
        'Saying stand and deliver for you are a bold deceiver',
      ],
    };
    expect(importLyricsMatchForDeduping(a, b)).toBe(true);
    expect(significantLyricTokensFromTune(a).length).toBeGreaterThan(6);
  });

  test('rejects match when lyrics are significantly different', function() {
    const whiskey = {
      name: 'Whiskey in the Jar',
      words: [
        'As I was going over the far famed Kerry mountains',
        'I met with Captain Farrell and his money he was counting',
        'I first produced my pistol and I then produced my rapier',
        'I said stand and deliver or the devil he may take ya',
      ],
    };
    const rover = {
      name: 'Whiskey in the Jar',
      words: [
        "I've been a wild rover for many a year",
        "And I've spent all my money on whiskey and beer",
        'And now I am returning with gold in great store',
        "And I never will play the wild rover no more",
      ],
    };
    expect(importLyricsMatchForDeduping(whiskey, rover)).toBe(false);
  });
});
