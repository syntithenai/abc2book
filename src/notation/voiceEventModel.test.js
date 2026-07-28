import { parseVoiceEvents } from './voiceEventModel';
import { serializeVoiceEvents } from './abcVoiceSerializer';

describe('voiceEventModel', function() {
  const meta = { meter: '4/4', noteLength: '1/8', key: 'C' };

  test('parses simple melody', function() {
    const events = parseVoiceEvents('CDEF|GABc|', meta);
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].type).toBe('note');
  });

  test('parses chord cluster', function() {
    const events = parseVoiceEvents('[CEG]2', meta);
    const chord = events.find(function(ev) { return ev.type === 'chord'; });
    expect(chord).toBeTruthy();
    expect(chord.pitches.length).toBe(3);
  });

  test('roundtrip preserves quarter note marker', function() {
    const body = 'c2 d e f |';
    const events = parseVoiceEvents(body, meta);
    const out = serializeVoiceEvents(events, meta);
    expect(out.replace(/\s/g, '')).toContain('c2');
  });

  test('parses and roundtrips embedded chord symbols', function() {
    const body = '"Am"c2 "G"d e "C"f |';
    const events = parseVoiceEvents(body, meta);
    const withChords = events.filter(function(ev) {
      return ev.chordSymbols && ev.chordSymbols.length;
    });
    expect(withChords.length).toBe(3);
    expect(withChords[0].chordSymbols).toEqual(['Am']);
    expect(withChords[1].chordSymbols).toEqual(['G']);
    expect(withChords[2].chordSymbols).toEqual(['C']);
    const out = serializeVoiceEvents(events, meta);
    expect(out).toContain('"Am"');
    expect(out).toContain('"G"');
    expect(out).toContain('"C"');
  });

  test('roundtrips chord symbols on rests', function() {
    const body = '"Am"z4 |';
    const events = parseVoiceEvents(body, meta);
    const rest = events.find(function(ev) { return ev.type === 'rest'; });
    expect(rest).toBeTruthy();
    expect(rest.chordSymbols).toEqual(['Am']);
    const out = serializeVoiceEvents(events, meta);
    expect(out).toContain('"Am"');
    expect(out.replace(/\s/g, '')).toMatch(/"Am"z/);
  });

  test('parses and roundtrips inline key and meter changes', function() {
    const body = '| C D E | [M:3/4] F G A | [K:Am] c d e |';
    const events = parseVoiceEvents(body, meta);
    const keyChange = events.find(function(ev) { return ev.type === 'keyChange'; });
    const meterChange = events.find(function(ev) { return ev.type === 'meterChange'; });
    expect(keyChange).toBeTruthy();
    expect(keyChange.key).toBe('Am');
    expect(meterChange).toBeTruthy();
    expect(meterChange.meter).toBe('3/4');
    const out = serializeVoiceEvents(events, meta);
    expect(out).toContain('[M:3/4]');
    expect(out).toContain('[K:Am]');
  });
});
