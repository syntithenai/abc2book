import { formatKeySignatureShort, midiToAbcPitch, parseKeySignatureForTests, enharmonicAbcName } from './melodyPitchSpelling';

describe('melodyPitchSpelling', function() {
  test('uses flats in flat keys', function() {
    expect(midiToAbcPitch(70, { key: 'Bb' })).toBe('_B');
    expect(midiToAbcPitch(65, { key: 'F' })).toBe('F');
  });

  test('uses sharps in sharp keys', function() {
    expect(midiToAbcPitch(61, { key: 'G' })).toBe('^C');
    expect(midiToAbcPitch(66, { key: 'G' })).toBe('^F');
  });

  test('preferFlats option overrides key', function() {
    expect(midiToAbcPitch(61, { key: 'G', preferFlats: true })).toBe('_D');
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
