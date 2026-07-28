import { checkTuneLyricsAlignment } from './tuneLyricsAlignmentCheck';
import { buildNotationCheckTune } from './notationCheckSnapshot';
import { runNotationChecks } from './useNotationCheck';

describe('tuneLyricsAlignmentCheck', function() {
  test('detects wline count mismatch', function() {
    const tune = {
      id: 't1',
      name: 'Test',
      meter: '4/4',
      key: 'C',
      noteLength: '1/8',
      voices: { '1': { notes: ['C D E F |', 'G A B c |'] } },
      wLines: ['one two three four'],
    };
    const result = checkTuneLyricsAlignment(tune);
    expect(result).not.toBeNull();
    expect(result.issues.some(function(item) { return item.code === 'wline_count_mismatch'; })).toBe(true);
  });

  test('detects stale wlines when melody changes slot count', function() {
    const tune = {
      id: 't2',
      name: 'Test',
      meter: '4/4',
      key: 'C',
      noteLength: '1/8',
      voices: { '1': { notes: ['C D E F G A B c |'] } },
      words: ['Amazing grace how sweet the sound'],
      wLines: ['A maz ing grace'],
    };
    const result = checkTuneLyricsAlignment(tune);
    expect(result).not.toBeNull();
    expect(result.issues.some(function(item) {
      return item.code === 'stale_wlines' || item.code === 'lyric_note_misalignment';
    })).toBe(true);
  });
});

describe('runNotationChecks', function() {
  test('merges live bodies into tune snapshot before checking', function() {
    const tune = {
      id: 't3',
      name: 'Test',
      meter: '4/4',
      key: 'C',
      noteLength: '1/8',
      voices: { '1': { notes: ['C D E F |'] } },
    };
    const snapshot = buildNotationCheckTune(tune, { '1': '|: C D |' });
    expect(snapshot.voices['1'].notes.join(' ')).toContain('|:');
    const report = runNotationChecks(snapshot, {
      skipRenderAbc: true,
      abcTools: {
        json2abc: function(t) { return 'X:1\nK:C\nM:4/4\nL:1/8\n' + t.voices['1'].notes.join('\n'); },
        getMetaValueFromAbc: function() { return ''; },
      },
    });
    expect(report.structureResult).not.toBeNull();
    expect(report.issues.length).toBeGreaterThan(0);
  });
});
