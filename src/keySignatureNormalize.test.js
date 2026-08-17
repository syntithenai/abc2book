import {
  listKeySignatureOptions,
  normalizeKeySignature,
  parseKeySignatureMode,
  suggestKeySignature,
  filterKeySignatureOption,
  keySignatureMatchKey,
  keyPrefersFlats,
  transposeKeySignature,
} from './keySignatureNormalize';

describe('keySignatureNormalize', function() {
  test('normalizes major and minor short forms', function() {
    expect(normalizeKeySignature('A')).toBe('A');
    expect(normalizeKeySignature('a')).toBe('A');
    expect(normalizeKeySignature('A major')).toBe('A');
    expect(normalizeKeySignature('Amaj')).toBe('A');
    expect(normalizeKeySignature('Aion')).toBe('A');
    expect(normalizeKeySignature('A ionian')).toBe('A');
    expect(normalizeKeySignature('Aionian')).toBe('A');
    expect(normalizeKeySignature('Amajor')).toBe('A');
    expect(normalizeKeySignature('Am')).toBe('Am');
    expect(normalizeKeySignature('a minor')).toBe('Am');
    expect(normalizeKeySignature('Amin')).toBe('Am');
    expect(normalizeKeySignature('Aaeo')).toBe('Am');
    expect(normalizeKeySignature('A aeolian')).toBe('Am');
  });

  test('collapses natural, harmonic, and melodic minor to Am', function() {
    expect(normalizeKeySignature('A natural minor')).toBe('Am');
    expect(normalizeKeySignature('Anaturalminor')).toBe('Am');
    expect(normalizeKeySignature('A harmonic minor')).toBe('Am');
    expect(normalizeKeySignature('Aharmonicminor')).toBe('Am');
    expect(normalizeKeySignature('Aharm')).toBe('Am');
    expect(normalizeKeySignature('A melodic minor')).toBe('Am');
    expect(normalizeKeySignature('Amelodicminor')).toBe('Am');
    expect(normalizeKeySignature('Amelodic')).toBe('Am');
    expect(normalizeKeySignature('Aaeolian')).toBe('Am');
    expect(suggestKeySignature('A harmonic minor')).toBe('Am');
    expect(suggestKeySignature('Amelodicminor')).toBe('Am');
  });

  test('normalizes named modes to concatenated full names', function() {
    expect(normalizeKeySignature('Amix')).toBe('Amixolydian');
    expect(normalizeKeySignature('A mix')).toBe('Amixolydian');
    expect(normalizeKeySignature('a mixolydian')).toBe('Amixolydian');
    expect(normalizeKeySignature('Amyxolidian')).toBe('Amixolydian');
    expect(normalizeKeySignature('Edor')).toBe('Edorian');
    expect(normalizeKeySignature('E dorian')).toBe('Edorian');
    expect(normalizeKeySignature('D dorian')).toBe('Ddorian');
    expect(normalizeKeySignature('D DoRIan')).toBe('Ddorian');
    expect(normalizeKeySignature('d DORIAN')).toBe('Ddorian');
    expect(normalizeKeySignature('Aphr')).toBe('Aphrygian');
    expect(normalizeKeySignature('Alyd')).toBe('Alydian');
    expect(normalizeKeySignature('Aloc')).toBe('Alocrian');
    expect(suggestKeySignature('D DoRIan')).toBe('Ddorian');
  });

  test('dropdown filter ignores spaces and mode capitalisation', function() {
    const dorian = { value: 'Ddorian', label: 'Ddorian' };
    expect(filterKeySignatureOption(dorian, 'D dorian')).toBe(true);
    expect(filterKeySignatureOption(dorian, 'D DoRIan')).toBe(true);
    expect(filterKeySignatureOption(dorian, 'ddor')).toBe(true);
    expect(filterKeySignatureOption(dorian, 'Emix')).toBe(false);
    expect(keySignatureMatchKey('D DoRIan')).toBe(keySignatureMatchKey('Ddorian'));
  });

  test('preserves accidentals on root', function() {
    expect(normalizeKeySignature('F#mix')).toBe('F#mixolydian');
    expect(normalizeKeySignature('Bb dorian')).toBe('Bbdorian');
    expect(normalizeKeySignature('F#m')).toBe('F#m');
    expect(normalizeKeySignature('Eb')).toBe('Eb');
    expect(normalizeKeySignature('Cbharmonicminor')).toBe('Cbm');
    expect(normalizeKeySignature('E#ionian')).toBe('E#');
  });

  test('normalizes highland pipe keys', function() {
    expect(normalizeKeySignature('HP')).toBe('HP');
    expect(normalizeKeySignature('hp')).toBe('HP');
    expect(normalizeKeySignature('Hp')).toBe('Hp');
    expect(suggestKeySignature('hp')).toBe('HP');
    expect(suggestKeySignature('Hp')).toBe(null);
    expect(parseKeySignatureMode('HP')).toBe(null);
  });

  test('leaves unrecognized values trimmed but unchanged', function() {
    expect(normalizeKeySignature('  custom-key  ')).toBe('custom-key');
    expect(normalizeKeySignature('none')).toBe('none');
    expect(normalizeKeySignature('')).toBe('');
    expect(normalizeKeySignature('  ')).toBe('');
  });

  test('suggests only when recognized and different from typed', function() {
    expect(suggestKeySignature('a mix')).toBe('Amixolydian');
    expect(suggestKeySignature('Amixolydian')).toBe(null);
    expect(suggestKeySignature('Aionian')).toBe('A');
    expect(suggestKeySignature('custom-key')).toBe(null);
    expect(suggestKeySignature('')).toBe(null);
  });

  test('parseKeySignatureMode returns structured result', function() {
    expect(parseKeySignatureMode('Amix')).toEqual({
      root: 'A',
      kind: 'mode',
      canonicalSuffix: 'mixolydian',
    });
    expect(parseKeySignatureMode('Bm')).toEqual({
      root: 'B',
      kind: 'minor',
      canonicalSuffix: 'm',
    });
    expect(parseKeySignatureMode('Aharmonicminor')).toEqual({
      root: 'A',
      kind: 'minor',
      canonicalSuffix: 'm',
    });
    expect(parseKeySignatureMode('weird')).toBe(null);
  });

  test('listKeySignatureOptions includes majors, minors, modes, and pipes', function() {
    const values = listKeySignatureOptions().map(function(o) { return o.value; });
    expect(values).toContain('A');
    expect(values).toContain('Am');
    expect(values).toContain('Amajor');
    expect(values).toContain('Aionian');
    expect(values).toContain('Aaeolian');
    expect(values).toContain('Anaturalminor');
    expect(values).toContain('Aharmonicminor');
    expect(values).toContain('Amelodicminor');
    expect(values).toContain('Amixolydian');
    expect(values).toContain('Adorian');
    expect(values).toContain('Edorian');
    expect(values).toContain('F#mixolydian');
    expect(values).toContain('Bbdorian');
    expect(values).toContain('Cb');
    expect(values).toContain('E#');
    expect(values).toContain('HP');
    expect(values).toContain('Hp');
    expect(normalizeKeySignature('Aharmonicminor')).toBe('Am');
    expect(normalizeKeySignature('Amelodicminor')).toBe('Am');
    expect(normalizeKeySignature('Aionian')).toBe('A');
    expect(values.length).toBeGreaterThan(200);
    expect(values.length).toBeLessThan(400);
  });

  test('keyPrefersFlats uses relative major for minors and modes', function() {
    expect(keyPrefersFlats('Dm')).toBe(true);
    expect(keyPrefersFlats('Gm')).toBe(true);
    expect(keyPrefersFlats('Cm')).toBe(true);
    expect(keyPrefersFlats('Fm')).toBe(true);
    expect(keyPrefersFlats('F')).toBe(true);
    expect(keyPrefersFlats('Bb')).toBe(true);
    expect(keyPrefersFlats('Eb')).toBe(true);

    expect(keyPrefersFlats('D')).toBe(false);
    expect(keyPrefersFlats('G')).toBe(false);
    expect(keyPrefersFlats('Em')).toBe(false);
    expect(keyPrefersFlats('Bm')).toBe(false);
    expect(keyPrefersFlats('F#m')).toBe(false);
    expect(keyPrefersFlats('Am')).toBe(false);
    expect(keyPrefersFlats('C')).toBe(false);
    expect(keyPrefersFlats('Ddorian')).toBe(false);
    expect(keyPrefersFlats('Fdorian')).toBe(true);
    expect(keyPrefersFlats('')).toBe(false);
    expect(keyPrefersFlats('HP')).toBe(false);
    expect(keyPrefersFlats('Ebm')).toBe(true);
    expect(keyPrefersFlats('Gb')).toBe(true);
    expect(keyPrefersFlats('D#m')).toBe(false);
    expect(keyPrefersFlats('F#')).toBe(false);
  });

  test('transposeKeySignature preserves mode and prefers flat roots when needed', function() {
    expect(transposeKeySignature('Dm', 0)).toBe('Dm');
    expect(transposeKeySignature('Dm', 2)).toBe('Em');
    expect(transposeKeySignature('Dm', 5)).toBe('Gm');
    expect(transposeKeySignature('D', 3)).toBe('F');
    expect(transposeKeySignature('Ddorian', 0)).toBe('Ddorian');
    expect(transposeKeySignature('Ddorian', 5)).toBe('Gdorian');
    expect(transposeKeySignature('A', -2)).toBe('G');
    expect(transposeKeySignature('Dm', 1)).toBe('Ebm');
    expect(transposeKeySignature('F', 1)).toBe('Gb');
    expect(transposeKeySignature('G', -1)).toBe('F#');
  });
});
