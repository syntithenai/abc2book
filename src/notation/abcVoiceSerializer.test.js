import { parseVoiceEvents } from './voiceEventModel';
import { serializeVoiceEvents } from './abcVoiceSerializer';

function normalizeAbc(body) {
  return String(body || '').replace(/\s+/g, ' ').trim();
}

function roundtrip(body, meta) {
  const events = parseVoiceEvents(body, meta);
  return normalizeAbc(serializeVoiceEvents(events, meta));
}

describe('abcVoiceSerializer roundtrip', function() {
  const meta = { meter: '4/4', noteLength: '1/8', key: 'C', tempo: 120 };

  test('simple melody', function() {
    expect(roundtrip('C D E F |', meta)).toBe('C D E F |');
  });

  test('explicit durations', function() {
    expect(roundtrip('C2 D2 |', meta)).toBe('C2 D2 |');
  });

  test('dotted durations', function() {
    const out = roundtrip('C3/2 D/2 |', meta);
    expect(out).toBe('C2 D/2 |');
  });

  test('octaves', function() {
    const out = roundtrip("c d' C, |", meta);
    expect(out).toMatch(/c/);
    expect(out).toMatch(/d'/);
    expect(out).toMatch(/C,/);
  });

  test('accidentals', function() {
    const out = roundtrip('^C _D =E |', meta);
    expect(out).toMatch(/\^C/);
    expect(out).toMatch(/_D/);
    expect(out).toMatch(/=E/);
  });

  test('chord', function() {
    expect(roundtrip('[CEG] |', meta)).toBe('[CEG] |');
  });

  test('rests', function() {
    expect(roundtrip('z z2 |', meta)).toBe('z z2 |');
  });

  test('barline tokens', function() {
    expect(roundtrip('C ||', meta)).toBe('C ||');
    expect(roundtrip('C |:', meta)).toBe('C |:');
    expect(roundtrip('C :|', meta)).toBe('C :|');
    expect(roundtrip('C |]', meta)).toBe('C |]');
  });

  test('tuplet', function() {
    const out = roundtrip('(3CDE |', meta);
    expect(out.replace(/\s/g, '')).toMatch(/\(3CDE/);
  });

  test('tie', function() {
    const out = roundtrip('C-C |', meta);
    expect(out).toMatch(/C-/);
    expect(out).toMatch(/C/);
  });

  test('decorations', function() {
    const out = roundtrip('.C !trill!D |', meta);
    expect(out).toMatch(/\.C/);
    expect(out).toMatch(/T/);
  });
});
