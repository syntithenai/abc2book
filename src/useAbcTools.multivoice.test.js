import useAbcTools from './useAbcTools';
import { parseMidiProgramFromNotes } from './notation/voiceMeta';

describe('useAbcTools multi-voice ABC parsing', function() {
  const abcTools = useAbcTools();

  test('abc2json routes [V:N] body sections to numeric voice keys', function() {
    const abc = [
      'X:1',
      'M:4/4',
      'L:1/8',
      'K:C',
      'V:1 nm="violin" clef=treble',
      'V:2 nm="acoustic bass" clef=bass',
      '[V:1]',
      '%%MIDI program 40',
      'G2 A2 |',
      '[V:2]',
      '%%MIDI program 32',
      'C,2 D,2 |',
    ].join('\n');

    const parsed = abcTools.abc2json(abc);
    expect(parsed.voices['1'].notes.join('\n')).toContain('G2 A2');
    expect(parsed.voices['2'].notes.join('\n')).toContain('C,2 D,2');
    expect(parsed.voices['V:1']).toBeUndefined();
    expect(parseMidiProgramFromNotes(parsed.voices['1'].notes)).toBe(40);
    expect(parseMidiProgramFromNotes(parsed.voices['2'].notes)).toBe(32);
  });

  test('abc2json assigns header %%MIDI program lines to matching V: voices', function() {
    const abc = [
      'X:1',
      'M:4/4',
      'L:1/8',
      'K:C',
      '%%MIDI program 40',
      '%%MIDI program 32',
      'V:1 nm="violin" clef=treble',
      'V:2 nm="acoustic bass" clef=bass',
      '[V:1]',
      'G2 |',
      '[V:2]',
      'C,2 |',
    ].join('\n');

    const parsed = abcTools.abc2json(abc);
    expect(parseMidiProgramFromNotes(parsed.voices['1'].notes)).toBe(40);
    expect(parseMidiProgramFromNotes(parsed.voices['2'].notes)).toBe(32);
    expect(parsed.voices['1'].notes.join('\n')).toContain('G2');
    expect(parsed.voices['2'].notes.join('\n')).toContain('C,2');
  });

  test('abc2json round-trips multi-voice bodies with programs', function() {
    const abc = [
      'X:1',
      'M:4/4',
      'L:1/8',
      'K:C',
      'V:1 nm="violin" clef=treble',
      'V:2 nm="acoustic bass" clef=bass',
      '[V:1]',
      '%%MIDI program 40',
      'G2 |',
      '[V:2]',
      '%%MIDI program 32',
      'C,2 |',
    ].join('\n');

    const exported = abcTools.json2abc(abcTools.abc2json(abc));
    const reparsed = abcTools.abc2json(exported);
    expect(parseMidiProgramFromNotes(reparsed.voices['1'].notes)).toBe(40);
    expect(parseMidiProgramFromNotes(reparsed.voices['2'].notes)).toBe(32);
    expect(reparsed.voices['1'].notes.join('\n')).toContain('G2');
    expect(reparsed.voices['2'].notes.join('\n')).toContain('C,2');
  });

  test('abc2json keeps clef meta when body uses bare V:N selectors', function() {
    const abc = [
      'X:1',
      'T:Maltese Melody #16',
      '%%score { 1 | 2 }',
      'L:1/8',
      'M:6/8',
      'K:Bb',
      'V:1 treble nm="Piano" snm="Pno."',
      '%%MIDI program 0',
      'V:2 bass',
      '%%MIDI program 0',
      'V:1',
      '(d/e/) |:"Bb" fgf bag | f3 d2 f |',
      'V:2',
      'z|: DED GFE | D3 B,2 D |',
    ].join('\n');

    const parsed = abcTools.abc2json(abc);
    expect(parsed.voices['1'].meta).toMatch(/treble/);
    expect(parsed.voices['1'].meta).toMatch(/nm="Piano"/);
    expect(parsed.voices['2'].meta.trim()).toBe('bass');
    expect(parseMidiProgramFromNotes(parsed.voices['1'].notes)).toBe(0);
    expect(parseMidiProgramFromNotes(parsed.voices['2'].notes)).toBe(0);
    expect(parsed.voices['1'].notes.join('\n')).toContain('fgf bag');
    expect(parsed.voices['2'].notes.join('\n')).toContain('DED GFE');

    const exported = abcTools.json2abc(parsed);
    expect(exported).toMatch(/V:1 .*treble/);
    expect(exported).toMatch(/V:2\s+bass/);
    const reparsed = abcTools.abc2json(exported);
    expect(reparsed.voices['2'].meta.trim()).toBe('bass');
  });
});
