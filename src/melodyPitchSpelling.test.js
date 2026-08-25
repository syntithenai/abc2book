import {
  formatKeySignatureShort,
  keySignatureLetterAlterations,
  midiToAbcPitch,
  parseKeySignatureForTests,
  enharmonicAbcName,
  spellAbcPitchInKey,
} from './melodyPitchSpelling';

describe('melodyPitchSpelling', function() {
  test('uses flats in flat keys and omits key-signature accidentals', function() {
    expect(midiToAbcPitch(70, { key: 'Bb' })).toBe('B');
    expect(midiToAbcPitch(65, { key: 'F' })).toBe('F');
    expect(midiToAbcPitch(70, { key: 'F' })).toBe('B');
  });

  test('uses sharps in sharp keys and omits key-signature accidentals', function() {
    expect(midiToAbcPitch(61, { key: 'G' })).toBe('^C');
    expect(midiToAbcPitch(66, { key: 'G' })).toBe('F');
    expect(midiToAbcPitch(66, { key: 'D' })).toBe('F');
    expect(midiToAbcPitch(61, { key: 'D' })).toBe('C');
  });

  test('writes naturals when cancelling key-signature accidentals', function() {
    expect(midiToAbcPitch(65, { key: 'G' })).toBe('=F');
    expect(midiToAbcPitch(71, { key: 'F' })).toBe('=B');
  });

  test('spellAbcPitchInKey strips signature accidentals', function() {
    expect(spellAbcPitchInKey('^F', 'G')).toBe('F');
    expect(spellAbcPitchInKey('_B', 'Bb')).toBe('B');
    expect(spellAbcPitchInKey('F', 'G')).toBe('=F');
  });

  test('keySignatureLetterAlterations for common keys', function() {
    expect(keySignatureLetterAlterations('G')).toEqual({ F: 1 });
    expect(keySignatureLetterAlterations('F')).toEqual({ B: -1 });
    expect(keySignatureLetterAlterations('Am')).toEqual({});
    expect(keySignatureLetterAlterations('Em')).toEqual({ F: 1 });
  });

  test('preferFlats option overrides key', function() {
    expect(midiToAbcPitch(61, { key: 'G', preferFlats: true })).toBe('_D');
  });

  test('omitKeyAccidentals false keeps chromatic accidentals', function() {
    expect(midiToAbcPitch(66, { key: 'G', omitKeyAccidentals: false })).toBe('^F');
  });

  test('enharmonicAbcName returns alternate spelling', function() {
    expect(enharmonicAbcName(61, true)).toBe('_D');
    expect(enharmonicAbcName(61, false)).toBe('^C');
    expect(enharmonicAbcName(60, true)).toBeNull();
  });

  test('snaps low-confidence notes toward scale when enabled', function() {
    const snapped = midiToAbcPitch(61, {
      key: 'C',
      snapToScale: true,
      confidence: 0.2,
      snapConfidenceThreshold: 0.45,
    });
    expect(snapped).toBe('C');
  });

  test('parses minor keys', function() {
    expect(parseKeySignatureForTests('Am').mode).toBe('minor');
  });

  test('formats detected keys to short form', function() {
    expect(formatKeySignatureShort('b minor')).toBe('Bm');
    expect(formatKeySignatureShort('F major')).toBe('F');
    expect(formatKeySignatureShort('Am')).toBe('Am');
  });
});
