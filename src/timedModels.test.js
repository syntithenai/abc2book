import {
  applyAbcbookJsonChunks,
  collectAbcbookJsonChunk,
  parseAbcbookJsonLine,
  renderAbcbookJsonField,
} from './abcbookJsonFields';
import { buildTimedLyricsFromTranscription, timedLyricsToPlainText } from './timedLyricsModel';
import { buildTimedChordsFromDetection, chordAtTime, timedChordsToGrid } from './timedChordsModel';
import { buildTimedMelodyFromDetection } from './timedMelodyModel';
import { deriveWLines, deriveRhythmicScaffold, applyWLinesToTune } from './timedAbcDeriver';
import useAbcTools from './useAbcTools';
import useAbcjsParser from './useAbcjsParser';

describe('abcbookJsonFields', function() {
  test('round-trips chunked timed lyrics JSON', function() {
    const payload = { version: 1, lines: [{ id: 'a', text: 'hello world', start: 0, end: 1, words: [] }] };
    const lines = renderAbcbookJsonField('timedLyrics', payload);
    const chunks = {};
    lines.forEach(function(line) {
      collectAbcbookJsonChunk(parseAbcbookJsonLine(line), chunks);
    });
    const parsed = applyAbcbookJsonChunks(chunks);
    expect(parsed.timedLyrics).toEqual(payload);
  });

  test('round-trips chunked backgroundInfo text', function() {
    const payload = 'First recorded in 1920.\nhttps://www.youtube.com/watch?v=abc123';
    const lines = renderAbcbookJsonField('backgroundInfo', payload);
    const chunks = {};
    lines.forEach(function(line) {
      collectAbcbookJsonChunk(parseAbcbookJsonLine(line), chunks);
    });
    const parsed = applyAbcbookJsonChunks(chunks);
    expect(parsed.backgroundInfo).toBe(payload);
  });
});

describe('timed models', function() {
  test('builds timed lyrics from whisper segments', function() {
    const model = buildTimedLyricsFromTranscription({
      segments: [{ start: 0, end: 2, text: 'hello there' }],
    }, { id: 'src-1' });
    expect(model.lines).toHaveLength(1);
    expect(model.lines[0].words).toHaveLength(2);
    expect(timedLyricsToPlainText(model)).toBe('hello there');
  });

  test('preserves stanza breaks from formatted lyrics text', function() {
    const model = buildTimedLyricsFromTranscription({
      text: 'line one\nline two\n\nstanza two',
      segments: [
        { start: 0, end: 1, text: 'line one' },
        { start: 1, end: 2, text: 'line two' },
        { start: 5, end: 6, text: 'stanza two' },
      ],
    }, { id: 'src-1' });
    expect(model.lines).toHaveLength(4);
    expect(model.lines[1].text).toBe('line two');
    expect(model.lines[2].stanzaBreak).toBe(true);
    expect(model.lines[2].text).toBe('');
    expect(timedLyricsToPlainText(model)).toBe('line one\nline two\n\nstanza two');
  });

  test('builds timed chords and resolves chord at time', function() {
    const model = buildTimedChordsFromDetection({
      segments: [{ start: 0, end: 4, label: 'C:maj' }],
      beatTimes: [0, 1, 2, 3],
      tempo: 120,
    }, { meter: '4/4' }, { id: 'src-1' });
    expect(model.segments[0].label).toBe('C:maj');
    expect(chordAtTime(model, 1)).toBe('C:maj');
  });

  test('builds variable-meter chord bars', function() {
    const model = buildTimedChordsFromDetection({
      segments: [{ start: 0, end: 7, label: 'C:maj' }],
      beatTimes: [0, 1, 2, 3, 4, 5, 6],
      meterChanges: [
        { start: 0, meter: '4/4', beatsPerBar: 4 },
        { start: 4, meter: '3/4', beatsPerBar: 3 },
      ],
    }, { meter: '4/4' }, {});
    expect(model.bars).toHaveLength(2);
    expect(model.bars[0].beats).toHaveLength(4);
    expect(model.bars[1].meter).toBe('3/4');
    expect(model.bars[1].beats).toHaveLength(3);
  });

  test('builds timed melody with shared timing', function() {
    const model = buildTimedMelodyFromDetection({
      notes: [{ start: 0, end: 0.5, midi: 60, name: 'C4' }],
      duration: 10,
      backend: 'librosa-pyin',
    }, { meter: '4/4', key: 'C' }, { id: 'src-1' }, {
      beatTimes: [0, 1, 2, 3],
      downbeatTimes: [0],
      tempo: 120,
      beatsPerBar: 4,
    });
    expect(model.notes).toHaveLength(1);
    expect(model.beatTimes).toHaveLength(4);
  });
});

describe('useAbcTools timed persistence', function() {
  test('does not emit timedLyrics JSON on new saves', function() {
    const abcTools = useAbcTools();
    const tune = {
      id: 'test-tune-1',
      name: 'Test',
      meter: '4/4',
      key: 'C',
      voices: { 1: { meta: '', notes: ['C D E F |'] } },
      wLines: ['row your boat'],
      timedLyrics: buildTimedLyricsFromTranscription({
        segments: [{ start: 0, end: 2, text: 'row your boat' }],
      }, { id: 'src' }),
    };
    const abc = abcTools.json2abc(tune);
    expect(abc).not.toContain('% abcbook-json timedLyrics');
    expect(abc).not.toContain('% abcbook-json timedChords');
    expect(abc).toContain('w: row your boat');
  });

  test('still imports legacy timedLyrics JSON from ABC comments', function() {
    const abcTools = useAbcTools();
    const abc = '\nX:1\nT:Test\nM:4/4\nL:1/8\nK:C\nC D E F |\n% abcbook-json timedLyrics 1/1 {"v":1,"lines":[{"t":"row your boat","s":0,"e":2}],"sections":[]}\n';
    const parsed = abcTools.abc2json(abc);
    expect(parsed.timedLyrics.lines[0].text).toBe('row your boat');
  });

  test('round-trips wLines interleaved with music lines', function() {
    const abcTools = useAbcTools();
    const tune = {
      id: 'test-tune-2',
      name: 'Scaffold',
      meter: '4/4',
      key: 'C',
      voices: { 1: { meta: '', notes: ['z z z z |'] } },
      wLines: ['hel- lo world'],
      timingScaffold: true,
    };
    const abc = abcTools.json2abc(tune);
    expect(abc).toContain('z z z z |\nw: hel- lo world');
    expect(abc).not.toContain('W:');
    expect(abc).toContain('% abcbook-timing-scaffold true');
    const parsed = abcTools.abc2json(abc);
    expect(parsed.wLines).toEqual(['hel- lo world']);
    expect(parsed.timingScaffold).toBe(true);
  });

  test('keeps legacy W: headers in words on import', function() {
    const abcTools = useAbcTools();
    const abc = '\nX:1\nT:Test\nM:4/4\nL:1/8\nK:C\nC D E F |\nW: legacy line\n';
    const parsed = abcTools.abc2json(abc);
    expect(parsed.words).toEqual(['legacy line']);
    expect(parsed.wLines).toEqual([]);
  });

  test('round-trips block W: lyrics through export', function() {
    const abcTools = useAbcTools();
    const abc = '\nX:1\nT:Bog\nM:2/4\nL:1/8\nK:G\n|:"G"B2|\nW: Rare bog\nW: A rattlin bog\n';
    const parsed = abcTools.abc2json(abc);
    const exported = abcTools.json2abc(parsed);
    expect(exported).toContain('W: Rare bog');
    expect(exported).toContain('W: A rattlin bog');
    expect(exported).not.toMatch(/\nw: /);
    const roundTrip = abcTools.abc2json(exported);
    expect(roundTrip.words).toEqual(['Rare bog', 'A rattlin bog']);
  });
});

describe('timedAbcDeriver', function() {
  test('derives w: lines from timed lyrics and melody', function() {
    const lyrics = buildTimedLyricsFromTranscription({
      segments: [{ start: 0, end: 2, text: 'hello world' }],
    }, {});
    const melody = buildTimedMelodyFromDetection({
      notes: [
        { start: 0, end: 0.5, midi: 60 },
        { start: 0.5, end: 1, midi: 62 },
        { start: 1, end: 1.5, midi: 64 },
        { start: 1.5, end: 2, midi: 65 },
      ],
      beatTimes: [0, 1, 2],
      duration: 2,
    }, { meter: '4/4' }, {}, { beatTimes: [0, 1, 2], beatsPerBar: 4 });
    const lines = deriveWLines(lyrics, melody);
    expect(lines.length).toBe(1);
    expect(lines[0]).toMatch(/^w: /);
  });

  test('builds rhythmic scaffold from beat times', function() {
    const scaffold = deriveRhythmicScaffold(
      buildTimedChordsFromDetection({ segments: [], beatTimes: [0, 1, 2, 3, 4] }, { meter: '4/4' }, {}),
      null,
      { beatsPerBar: 4, slotsPerBeat: 2 }
    );
    expect(scaffold).toContain('z');
    expect(scaffold).toContain('|');
  });

  test('emits inline ABC meter changes in derived grids', function() {
    const timedChords = buildTimedChordsFromDetection({
      segments: [
        { start: 0, end: 4, label: 'C:maj' },
        { start: 4, end: 7, label: 'G:maj' },
      ],
      beatTimes: [0, 1, 2, 3, 4, 5, 6],
      meterChanges: [
        { start: 0, meter: '4/4', beatsPerBar: 4 },
        { start: 4, meter: '3/4', beatsPerBar: 3 },
      ],
    }, { meter: '4/4' }, {});
    const grid = timedChordsToGrid(timedChords, { beatsPerBar: 4, slotsPerBeat: 1 });
    const scaffold = deriveRhythmicScaffold(timedChords, null, { beatsPerBar: 4, slotsPerBeat: 1 });
    expect(grid).toContain('[M:3/4]');
    expect(scaffold).toContain('[M:3/4]');
  });

  test('applyWLinesToTune stores derived w lines on tune', function() {
    const tune = { wLines: [] };
    const lyrics = buildTimedLyricsFromTranscription({
      segments: [{ start: 0, end: 2, text: 'hi there' }],
    }, {});
    const melody = buildTimedMelodyFromDetection({
      notes: [
        { start: 0, end: 0.5, midi: 60 },
        { start: 0.5, end: 1, midi: 62 },
        { start: 1, end: 1.5, midi: 64 },
        { start: 1.5, end: 2, midi: 65 },
      ],
      duration: 2,
    }, { meter: '4/4' }, {}, { beatTimes: [0, 1, 2], beatsPerBar: 4 });
    const lines = applyWLinesToTune(tune, lyrics, melody);
    expect(lines.length).toBe(1);
    expect(tune.wLines[0]).toContain('hi');
  });
});

describe('mergeMelody', function() {
  test('preserves chord symbols when merging melody', function() {
    const abcjsParser = useAbcjsParser();
    const abc = '\nX:1\nT:Test\nM:4/4\nL:1/8\nK:C\n"C" z z z z |';
    const melody = 'C D E F |';
    const merged = abcjsParser.mergeMelody(melody, abc);
    expect(merged).toContain('"C"');
    expect(merged).toMatch(/C/);
  });

  test('preserves inline meter changes from melody draft', function() {
    const abcjsParser = useAbcjsParser();
    const abc = '\nX:1\nT:Test\nM:4/4\nL:1/8\nK:C\n"C" z z z z | z z z |';
    const melody = 'C D E F | [M:3/4] F E D |';
    const merged = abcjsParser.mergeMelody(melody, abc);
    expect(merged).toContain('[M:3/4]');
    expect(merged).toContain('"C"');
    expect(merged).toMatch(/F/);
  });
});
