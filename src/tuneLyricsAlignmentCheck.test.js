import { checkTuneLyricsAlignment } from './tuneLyricsAlignmentCheck';
import { splitMelodyIntoBlocks } from './lyricBarAlignmentUtils';
import { buildNotationCheckTune } from './notationCheckSnapshot';
import { runNotationChecks } from './useNotationCheck';
import { ANACRUSIS_THREE_STRAINS } from './testFixtures/anacrusisDoubleBarlineFixtures';

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

  test('three pickup strains align with three lyric sections', function() {
    const tune = {
      id: 'anacrusis-strains',
      name: 'Pickup Strains',
      meter: '4/4',
      key: 'D',
      noteLength: '1/8',
      voices: { '1': { notes: ANACRUSIS_THREE_STRAINS.split('\n') } },
      words: ['Part one line', '', 'Part two line', '', 'Part three line'],
    };
    const melodyBlocks = splitMelodyIntoBlocks(tune.voices['1'].notes).length;
    expect(melodyBlocks).toBe(3);
    const result = checkTuneLyricsAlignment(tune);
    const codes = result && result.issues ? result.issues.map(function(i) { return i.code }) : [];
    expect(codes).not.toContain('strain_lyric_count_mismatch');
  });

  test('song form revisits do not count as extra strains', function() {
    const tune = {
      id: 'appetite',
      name: 'Appetite',
      composer: 'Steve Ryan',
      meter: '4/4',
      key: 'Am',
      noteLength: '1/8',
      voices: {
        '1': {
          notes: [
            '"Am"zzzzzzzz | "Gm"zzzzzzzz | "F"zzzzzzzz | "Em"zzzzzzzz |',
            '"Am"zzzzzzzz | "Gm"zzzzzzzz | "Dm"zzzzzzzz | "F"zzzzzzzz ||',
            '"F"zzzzzzzz | "Am"zzzzzzzz |',
            '"Em7"zzzzzzzz | "Am"zzzzzzzz |',
            '"F"zzzzzzzz | "Am"zzzzzzzz |',
            '"Em7"zzzzzzzz | "F"zzzzzzzz | "F"zzzzzzzz ||',
            '"Gm"zzzzzzzz | "F"zzzzzzzz | "Gm"zzzzzzzz | "Gm"zzzzzzzz | "Am"zzzzzzzz | "Am"zzzzzzzz ||',
          ],
        },
      },
      words: [
        'Appetite - Steve Ryan 13/9/2025',
        '',
        '# VERSE',
        'to do right, got to tame my desire',
        '',
        '# CHORUS',
        'Visceral, orgasmic, gorging light fantastic',
        '',
        '# VERSE',
        'not devastation, to have the revelation',
        '',
        '# BRIDGE',
        'Smorgasbord of finest viddles',
        '',
        '# CHORUS',
      ],
    };
    expect(splitMelodyIntoBlocks(tune.voices['1'].notes).length).toBe(3);
    const result = checkTuneLyricsAlignment(tune);
    const codes = result && result.issues ? result.issues.map(function(i) { return i.code }) : [];
    expect(codes).not.toContain('strain_lyric_count_mismatch');
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
