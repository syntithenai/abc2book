/* eslint-disable react-hooks/rules-of-hooks -- test helpers call pure hook factories */
import useAbcTools from './useAbcTools';
import useAbcjsParser from './useAbcjsParser';
import { buildTimedLyricsFromTranscription } from './timedLyricsModel';
import { buildTimedChordsFromDetection } from './timedChordsModel';
import { buildTimedMelodyFromDetection } from './timedMelodyModel';
import {
  clearTransientTimedFields,
  finalizeChordSheetToTune,
  finalizeMediaTimedImport,
  noteLinesHaveRealMelody,
} from './timedImportFinalizer';

function mockTunebook() {
  const abcTools = useAbcTools();
  return {
    abcTools: abcTools,
  };
}

describe('timedImportFinalizer', function() {
  test('noteLinesHaveRealMelody ignores rest-only scaffold lines', function() {
    expect(noteLinesHaveRealMelody(['z z z z |'])).toBe(false);
    expect(noteLinesHaveRealMelody(['"C" C D E F |'])).toBe(true);
    expect(noteLinesHaveRealMelody(['| "D" z2 "G" z "A" z |'])).toBe(false);
  });

  test('clearTransientTimedFields removes timed JSON fields but keeps lyrics', function() {
    const tune = {
      timedLyrics: { lines: [] },
      timedChords: { segments: [] },
      timedMelody: { notes: [] },
      words: ['a'],
      wLines: ['keep me'],
    };
    clearTransientTimedFields(tune);
    expect(tune.timedLyrics).toBeUndefined();
    expect(tune.timedChords).toBeUndefined();
    expect(tune.timedMelody).toBeUndefined();
    expect(tune.words).toEqual(['a']);
    expect(tune.wLines).toEqual(['keep me']);
  });

  test('finalizeChordSheetToTune clears all timed fields after chord merge', function() {
    const abcjsParser = useAbcjsParser();
    const tunebook = mockTunebook();
    const abc = [
      'X:1',
      'T:Preserve',
      'M:4/4',
      'L:1/8',
      'K:C',
      'C D E F | G A B c |',
    ].join('\n');
    const tune = tunebook.abcTools.abc2json(abc);
    tune.id = 'preserve-timed';
    tune.timedLyrics = { lines: [{ text: 'hello' }] };
    tune.timedChords = { segments: [{ label: 'C' }] };
    tune.timedMelody = { notes: [{ midi: 60, start: 0, end: 1 }] };

    finalizeChordSheetToTune({
      tune: tune,
      tunebook: tunebook,
      abcjsParser: abcjsParser,
      abc: abc,
      chordGridText: 'C|G|',
      lyricLines: ['hello world'],
    });

    expect(tune.timedLyrics).toBeUndefined();
    expect(tune.timedMelody).toBeUndefined();
    expect(tune.timedChords).toBeUndefined();
  });

  test('finalizeMediaTimedImport clears timed fields and keeps wLines', function() {
    const abcjsParser = useAbcjsParser();
    const tunebook = mockTunebook();
    const timedLyrics = buildTimedLyricsFromTranscription({
      segments: [{ start: 0, end: 2, text: 'hello world' }],
    }, {});
    const timedMelody = buildTimedMelodyFromDetection({
      notes: [
        { start: 0, end: 0.5, midi: 60 },
        { start: 0.5, end: 1, midi: 62 },
        { start: 1, end: 1.5, midi: 64 },
        { start: 1.5, end: 2, midi: 65 },
      ],
      beatTimes: [0, 1, 2, 3],
      duration: 2,
    }, { meter: '4/4', noteLength: '1/8' }, {}, { beatTimes: [0, 1, 2, 3], beatsPerBar: 4 });
    const timedChords = buildTimedChordsFromDetection({
      segments: [{ start: 0, end: 4, label: 'C:maj' }],
      beatTimes: [0, 1, 2, 3],
    }, { meter: '4/4' }, {});

    const tune = {
      id: 'finalize-test',
      name: 'Test',
      meter: '4/4',
      noteLength: '1/8',
      key: 'C',
      voices: { 1: { meta: '', notes: ['z z z z |'] } },
    };
    const baseJson = tunebook.abcTools.abc2json(tunebook.abcTools.json2abc(tune));
    const draft = {
      metadata: { name: 'Test', meter: '4/4', key: 'C', noteLength: '1/8' },
      mergedLyricLines: ['hello world'],
      melodyAbcText: 'C D E F |',
      chordGridText: 'C |',
      timedLyrics: timedLyrics,
      timedMelody: timedMelody,
      timedChords: timedChords,
      sections: [],
    };

    finalizeMediaTimedImport({
      tune: tune,
      tunebook: tunebook,
      abcjsParser: abcjsParser,
      draft: draft,
      baseJson: baseJson,
    });

    expect(tune.timedLyrics).toBeUndefined();
    expect(tune.timedChords).toBeUndefined();
    expect(tune.timedMelody).toBeUndefined();
    expect(Array.isArray(tune.wLines)).toBe(true);
    expect(tune.wLines.length).toBeGreaterThan(0);
    expect(noteLinesHaveRealMelody(tune.voices['1'].notes)).toBe(true);
  });
});
