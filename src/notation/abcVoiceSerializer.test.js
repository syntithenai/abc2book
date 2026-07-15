import { parseVoiceEvents } from './voiceEventModel';
import { serializeVoiceEvents, serializeTupletPrefix } from './abcVoiceSerializer';
import { assignTimingToEvents, parseNoteLengthDecimal, tupletBeatScale } from './beatGrid';

function normalizeAbc(body) {
  return String(body || '').replace(/\s+/g, ' ').trim();
}

function roundtrip(body, meta) {
  const events = parseVoiceEvents(body, meta);
  return normalizeAbc(serializeVoiceEvents(events, meta));
}

describe('abcVoiceSerializer roundtrip', function() {
  const meta = { meter: '4/4', noteLength: '1/8', key: 'C', tempo: 120 };

  test('simple melody beams by default (no mid-note spaces)', function() {
    expect(serializeVoiceEvents(parseVoiceEvents('C D E F |', meta), meta)).toBe('CDEF |');
  });

  test('explicit durations', function() {
    expect(serializeVoiceEvents(parseVoiceEvents('C2 D2 |', meta), meta)).toBe('C2D2 |');
  });

  test('dotted durations', function() {
    const out = serializeVoiceEvents(parseVoiceEvents('C3/2 D/2 |', meta), meta);
    expect(out).toBe('C2D/2 |');
  });

  test('octaves', function() {
    const out = serializeVoiceEvents(parseVoiceEvents("c d' C, |", meta), meta);
    expect(out).toMatch(/c/);
    expect(out).toMatch(/d'/);
    expect(out).toMatch(/C,/);
  });

  test('accidentals', function() {
    const out = serializeVoiceEvents(parseVoiceEvents('^C _D =E |', meta), meta);
    expect(out).toMatch(/\^C/);
    expect(out).toMatch(/_D/);
    expect(out).toMatch(/=E/);
  });

  test('chord', function() {
    expect(serializeVoiceEvents(parseVoiceEvents('[CEG] |', meta), meta)).toBe('[CEG] |');
  });

  test('rests', function() {
    expect(serializeVoiceEvents(parseVoiceEvents('z z2 |', meta), meta)).toBe('zz2 |');
  });

  test('barline tokens', function() {
    expect(serializeVoiceEvents(parseVoiceEvents('C ||', meta), meta)).toBe('C ||');
    expect(serializeVoiceEvents(parseVoiceEvents('C |:', meta), meta)).toBe('C |:');
    expect(serializeVoiceEvents(parseVoiceEvents('C :|', meta), meta)).toBe('C :|');
    expect(serializeVoiceEvents(parseVoiceEvents('C |]', meta), meta)).toBe('C |]');
  });

  test('tuplet short form', function() {
    const out = serializeVoiceEvents(parseVoiceEvents('(3CDE |', meta), meta);
    expect(out.replace(/\s/g, '')).toMatch(/\(3CDE/);
  });

  test('tuplet p:q:r for quintuplet', function() {
    const events = parseVoiceEvents('C D E F G |', meta).filter(function(ev) {
      return ev.type === 'note';
    });
    events.forEach(function(ev, i) {
      ev.tuplet = { num: 5, den: 4, groupId: 'g', indexInGroup: i, size: 5 };
    });
    const prefix = serializeTupletPrefix(events[0]);
    expect(prefix).toBe('(5:4:5');
  });

  test('beamBreakBefore inserts space', function() {
    const events = parseVoiceEvents('C D E F |', meta);
    const notes = events.filter(function(ev) { return ev.type === 'note'; });
    notes[2].beamBreakBefore = true;
    const out = serializeVoiceEvents(events, meta);
    expect(out).toBe('CD EF |');
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

describe('tuplet beat scaling', function() {
  test('triplet eighths span one quarter', function() {
    const meta = { meter: '4/4', noteLength: '1/8', key: 'C' };
    const unit = parseNoteLengthDecimal(meta.noteLength, meta.meter);
    expect(tupletBeatScale({ num: 3, den: 2 })).toBeCloseTo(2 / 3);
    const events = [
      { id: 'a', type: 'note', duration: { num: 1, den: 1, dotted: false },
        tuplet: { num: 3, den: 2, indexInGroup: 0, size: 3 } },
      { id: 'b', type: 'note', duration: { num: 1, den: 1, dotted: false },
        tuplet: { num: 3, den: 2, indexInGroup: 1, size: 3 } },
      { id: 'c', type: 'note', duration: { num: 1, den: 1, dotted: false },
        tuplet: { num: 3, den: 2, indexInGroup: 2, size: 3 } },
    ];
    const timed = assignTimingToEvents(events, meta.meter, unit);
    const span = (timed[2].startBeat + timed[2].durationBeats) - timed[0].startBeat;
    expect(span).toBeCloseTo(1, 5);
  });
});
