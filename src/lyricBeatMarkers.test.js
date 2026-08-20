import {
  wordHasLyricBeatMarker,
  stripLyricBeatMarkerFromWord,
  stripLyricBeatMarkersFromLine,
  stripLyricBeatMarkersFromLines,
  lyricBeatAnchorWordIndices,
  wordIndexForBarFromLyricBeatAnchors,
  beatAnchorsForBar,
  expandLyricBeatDownbeats,
  wordIndicesForChordsOnBeatAnchors,
  resolveLyricBeatAnchorWordIndex,
  stripLyricBeatMarkersFromTokenLines,
} from './lyricBeatMarkers';

describe('lyricBeatMarkers', function() {
  test('detects and strips leading or mid-word / markers', function() {
    expect(wordHasLyricBeatMarker('/Amazing')).toBe(true);
    expect(wordHasLyricBeatMarker('a/mazing')).toBe(true);
    expect(wordHasLyricBeatMarker('//how')).toBe(true);
    expect(wordHasLyricBeatMarker('Amazing')).toBe(false);
    expect(wordHasLyricBeatMarker('/')).toBe(true);
    expect(stripLyricBeatMarkerFromWord('/Amazing')).toBe('Amazing');
    expect(stripLyricBeatMarkerFromWord('a/mazing')).toBe('amazing');
    expect(stripLyricBeatMarkerFromWord('//how')).toBe('how');
    expect(stripLyricBeatMarkerFromWord('grace')).toBe('grace');
  });

  test('stripLyricBeatMarkersFromLine removes markers and bare slashes', function() {
    expect(stripLyricBeatMarkersFromLine('/Amazing grace /how sweet')).toBe('Amazing grace how sweet');
    expect(stripLyricBeatMarkersFromLine('a/mazing /grace how /sweet the /sound'))
      .toBe('amazing grace how sweet the sound');
    expect(stripLyricBeatMarkersFromLine('plain line')).toBe('plain line');
    expect(stripLyricBeatMarkersFromLine('foo / bar')).toBe('foo bar');
    expect(stripLyricBeatMarkersFromLine('  /Hello there  ')).toBe('  Hello there  ');
  });

  test('stripLyricBeatMarkersFromLines maps over arrays', function() {
    expect(stripLyricBeatMarkersFromLines(['/A /B', '', 'a/mazing'])).toEqual(['A B', '', 'amazing']);
  });

  test('lyricBeatAnchorWordIndices finds marked words including mid-word', function() {
    expect(lyricBeatAnchorWordIndices(['/Amazing', 'grace', '/how', 'sweet'])).toEqual([0, 2]);
    expect(lyricBeatAnchorWordIndices(['a/mazing', '/grace', 'how', '/sweet', 'the', '/sound']))
      .toEqual([0, 1, 3, 5]);
    expect(lyricBeatAnchorWordIndices(['/', 'word'])).toEqual([0]);
    expect(lyricBeatAnchorWordIndices(['no', 'marks'])).toEqual([]);
  });

  test('wordIndexForBarFromLyricBeatAnchors maps bars onto anchors', function() {
    expect(wordIndexForBarFromLyricBeatAnchors(0, 4, [0, 2, 4, 6])).toBe(0);
    expect(wordIndexForBarFromLyricBeatAnchors(1, 4, [0, 2, 4, 6])).toBe(2);
    expect(wordIndexForBarFromLyricBeatAnchors(3, 4, [0, 2, 4, 6])).toBe(6);
    expect(wordIndexForBarFromLyricBeatAnchors(0, 4, [0, 4])).toBe(0);
    expect(wordIndexForBarFromLyricBeatAnchors(1, 4, [0, 4])).toBe(1);
    expect(wordIndexForBarFromLyricBeatAnchors(3, 4, [0, 4])).toBe(4);
  });

  test('expandLyricBeatDownbeats keeps later / markers for later bars', function() {
    expect(expandLyricBeatDownbeats([2, 10], 4)).toEqual([0, 2, 6, 10]);
    expect(beatAnchorsForBar(1, 4, [2, 10])).toEqual([2]);
    expect(beatAnchorsForBar(3, 4, [2, 10])).toEqual([10]);
  });

  test('beatAnchorsForBar keeps extra markers on a single-bar line', function() {
    expect(beatAnchorsForBar(0, 1, [1, 5])).toEqual([1, 5]);
    expect(beatAnchorsForBar(0, 2, [1, 5])).toEqual([1]);
    expect(beatAnchorsForBar(1, 2, [1, 5])).toEqual([5]);
  });

  test('wordIndicesForChordsOnBeatAnchors places mid-bar chords on markers', function() {
    expect(wordIndicesForChordsOnBeatAnchors(2, [1, 5], 1, 6)).toEqual([1, 5]);
    expect(wordIndicesForChordsOnBeatAnchors(1, [1, 5], 1, 6)).toEqual([1]);
    expect(wordIndicesForChordsOnBeatAnchors(2, [], 1, 6)).toEqual([1, 2]);
    expect(wordIndicesForChordsOnBeatAnchors(4, [1, 7], 1, 9)).toEqual([1, 2, 3, 4]);
  });

  test('resolveLyricBeatAnchorWordIndex returns null without markers', function() {
    expect(resolveLyricBeatAnchorWordIndex({
      barIndex: 0,
      barCount: 2,
      words: ['Amazing', 'grace'],
    })).toBe(null);
    expect(resolveLyricBeatAnchorWordIndex({
      barIndex: 1,
      barCount: 2,
      words: ['/Amazing', 'grace', '/how', 'sweet'],
    })).toBe(2);
    expect(resolveLyricBeatAnchorWordIndex({
      barIndex: 0,
      barCount: 4,
      words: ['a/mazing', '/grace', 'how', '/sweet', 'the', '/sound'],
    })).toBe(0);
  });

  test('stripLyricBeatMarkersFromTokenLines cleans ChordPro token text', function() {
    expect(stripLyricBeatMarkersFromTokenLines([
      [{ chord: 'C', text: 'a/mazing ' }, { chord: '', text: '/grace ' }],
    ])).toEqual([
      [{ chord: 'C', text: 'amazing ' }, { chord: '', text: 'grace ' }],
    ]);
  });
});
