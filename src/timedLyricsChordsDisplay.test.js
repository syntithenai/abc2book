import {
  buildLinesFromTune,
  buildTimedAlignedLines,
  chordBlocksCompleteForLyrics,
  melodyChordsHaveNotes,
  preferInlineChords,
  tuneHasLyricEmbeddedChords,
} from './timedLyricsChordsDisplay';
import { buildTimedLyricsFromTranscription } from './timedLyricsModel';
import { buildTimedChordsFromDetection } from './timedChordsModel';

function makeTunebook() {
  return {
    abcTools: {
      emptyABC: function(name) { return 'X:1\nT:' + (name || '') + '\nK:C\n'; },
    },
  };
}

function makeParser(chordChart) {
  return {
    renderChords: function() { return chordChart; },
  };
}

describe('timedLyricsChordsDisplay', function() {
  test('uses edited wLines without attaching timed chords', function() {
    const timedLyrics = buildTimedLyricsFromTranscription({
      segments: [{ start: 0, end: 2, text: 'old lyric line' }],
    }, {});
    const timedChords = buildTimedChordsFromDetection({
      segments: [{ start: 0, end: 4, label: 'C:maj' }],
      beatTimes: [0, 1, 2, 3],
    }, { meter: '4/4' }, {});

    const tune = {
      wLines: ['new lyric line'],
      timedLyrics: timedLyrics,
      timedChords: timedChords,
    };

    const lines = buildLinesFromTune(tune);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe('new lyric line');
    expect(lines[0].chord).toBe('');
  });

  test('does not fall back to timed lyrics when no wLines exist', function() {
    const timedLyrics = buildTimedLyricsFromTranscription({
      segments: [{ start: 0, end: 2, text: 'legacy only' }],
    }, {});
    const timedChords = buildTimedChordsFromDetection({
      segments: [{ start: 0, end: 4, label: 'G:maj' }],
      beatTimes: [0, 1, 2, 3],
    }, { meter: '4/4' }, {});

    const lines = buildLinesFromTune({
      timedLyrics: timedLyrics,
      timedChords: timedChords,
    });
    expect(lines).toHaveLength(0);
  });

  test('buildTimedAlignedLines attaches timed chords to wLines', function() {
    const timedLyrics = buildTimedLyricsFromTranscription({
      segments: [{ start: 0, end: 2, text: 'old lyric line' }],
    }, {});
    const timedChords = buildTimedChordsFromDetection({
      segments: [{ start: 0, end: 4, label: 'C:maj' }],
      beatTimes: [0, 1, 2, 3],
    }, { meter: '4/4' }, {});

    const lines = buildTimedAlignedLines({
      wLines: ['new lyric line'],
      timedLyrics: timedLyrics,
      timedChords: timedChords,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe('new lyric line');
    expect(lines[0].chord).toBeTruthy();
  });

  test('melodyChordsHaveNotes is true when chords sit on real notes', function() {
    const tune = {
      name: 'With notes',
      voices: { '1': { notes: ['"C" C D E F | "G" G A B c |'] } },
      wLines: ['hello world'],
    };
    const tunebook = makeTunebook();
    expect(melodyChordsHaveNotes(tune, tunebook, makeParser('C | G |'))).toBe(true);
    expect(preferInlineChords(tune, tunebook, makeParser('C | G |'))).toBe(true);
  });

  test('melodyChordsHaveNotes is false for rest-only chord scaffolds', function() {
    const tune = {
      name: 'Scaffold',
      voices: { '1': { notes: ['"C" z z z z | "G" z z z z |'] } },
      wLines: ['hello world'],
    };
    const tunebook = makeTunebook();
    expect(melodyChordsHaveNotes(tune, tunebook, makeParser('C | G |'))).toBe(false);
  });

  test('chordBlocksCompleteForLyrics when every stanza maps to a chord block', function() {
    const tune = {
      name: 'Complete',
      voices: { '1': { notes: ['"C" z z z z |'] } },
      wLines: ['verse one line', '', 'verse two line'],
    };
    const tunebook = makeTunebook();
    // Single chord block applies to every verse (hymn pattern).
    expect(chordBlocksCompleteForLyrics(tune, tunebook, makeParser('C | F | G |'))).toBe(true);
    expect(preferInlineChords(tune, tunebook, makeParser('C | F | G |'))).toBe(true);
  });

  test('chordBlocksCompleteForLyrics is false when a stanza has no chord block', function() {
    const tune = {
      name: 'Incomplete',
      voices: { '1': { notes: ['"C" z z z z || "G" z z z z |'] } },
      wLines: ['verse one', '', 'verse two', '', 'verse three'],
    };
    const tunebook = makeTunebook();
    // Two chord blocks, three lyric stanzas, no section headers → third unmatched.
    expect(chordBlocksCompleteForLyrics(
      tune,
      tunebook,
      makeParser('C | F |\n\nG | D |')
    )).toBe(false);
    expect(preferInlineChords(
      tune,
      tunebook,
      makeParser('C | F |\n\nG | D |')
    )).toBe(false);
  });

  test('tuneHasLyricEmbeddedChords detects ChordPro inline markers', function() {
    expect(tuneHasLyricEmbeddedChords({
      words: ['[G]Amazing grace how [C]sweet'],
    })).toBe(true);
    expect(tuneHasLyricEmbeddedChords({
      words: ['Am   G', 'plain lyric'],
    })).toBe(true);
    expect(tuneHasLyricEmbeddedChords({
      words: ['plain lyric only'],
    })).toBe(false);
  });
});
