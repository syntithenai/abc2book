import {
  mergeNoteLists,
  parseMidiBytesToTracks,
  tickToSeconds,
  buildTempoMapFromChanges,
} from './midiParseClient';

function u32(n) { return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]; }
function u16(n) { return [(n >>> 8) & 255, n & 255]; }

describe('midiParseClient running status and type-0 split', function() {
  test('parses running-status note events', function() {
    const header = Uint8Array.from([77, 84, 104, 100, ...u32(6), ...u16(0), ...u16(1), ...u16(480)]);
    const ev = [
      0x00, 0x90, 60, 64,
      0x00, 62, 64,
      0x83, 0x60, 0x80, 60, 0,
      0x00, 62, 0,
      0x00, 0xff, 0x2f, 0x00,
    ];
    const track = Uint8Array.from([77, 84, 114, 107, ...u32(ev.length), ...ev]);
    const midi = new Uint8Array(header.length + track.length);
    midi.set(header);
    midi.set(track, header.length);
    const parsed = parseMidiBytesToTracks(midi);
    expect(parsed.tracks.length).toBeGreaterThanOrEqual(1);
    expect(parsed.tracks[0].notes.length).toBe(2);
    expect(parsed.tracks[0].notes[0].startTick).toBe(0);
  });

  test('type-0 multi-channel file splits into channel voices', function() {
    const header = Uint8Array.from([77, 84, 104, 100, ...u32(6), ...u16(0), ...u16(1), ...u16(480)]);
    const ev = [
      0x00, 0x90, 60, 64,
      0x00, 0x91, 67, 64,
      0x83, 0x60, 0x80, 60, 0,
      0x00, 0x81, 67, 0,
      0x00, 0xff, 0x2f, 0x00,
    ];
    const track = Uint8Array.from([77, 84, 114, 107, ...u32(ev.length), ...ev]);
    const midi = new Uint8Array(header.length + track.length);
    midi.set(header);
    midi.set(track, header.length);
    const parsed = parseMidiBytesToTracks(midi);
    expect(parsed.format).toBe(0);
    expect(parsed.tracks.length).toBe(2);
    expect(parsed.tracks.map(function(t) { return t.channel; }).sort()).toEqual([0, 1]);
  });

  test('mergeNoteLists unions overlapping same pitches', function() {
    const merged = mergeNoteLists([
      [{ start: 0, end: 1, midi: 60, velocity: 40 }],
      [{ start: 0.5, end: 1.5, midi: 60, velocity: 80 }],
    ]);
    expect(merged.length).toBe(1);
    expect(merged[0].end).toBe(1.5);
    expect(merged[0].velocity).toBe(80);
  });

  test('tickToSeconds respects tempo-map segments', function() {
    const map = buildTempoMapFromChanges([
      { tick: 0, tempoUs: 500000, bpm: 120 },
      { tick: 480, tempoUs: 1000000, bpm: 60 },
    ], 500000);
    expect(tickToSeconds(480, map, 480)).toBeCloseTo(0.5, 5);
    expect(tickToSeconds(960, map, 480)).toBeCloseTo(1.5, 5);
  });

  test('parseMidiBytesToTracks applies global tempo map across tracks', function() {
    const header = Uint8Array.from([77, 84, 104, 100, ...u32(6), ...u16(1), ...u16(2), ...u16(480)]);
    const tempoEv = [
      0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20,
      0x83, 0x60, 0xff, 0x51, 0x03, 0x0f, 0x42, 0x40,
      0x00, 0xff, 0x2f, 0x00,
    ];
    const noteEv = [
      0x83, 0x60, 0x90, 60, 64,
      0x83, 0x60, 0x80, 60, 0,
      0x00, 0xff, 0x2f, 0x00,
    ];
    const track0 = Uint8Array.from([77, 84, 114, 107, ...u32(tempoEv.length), ...tempoEv]);
    const track1 = Uint8Array.from([77, 84, 114, 107, ...u32(noteEv.length), ...noteEv]);
    const midi = new Uint8Array(header.length + track0.length + track1.length);
    midi.set(header);
    midi.set(track0, header.length);
    midi.set(track1, header.length + track0.length);
    const parsed = parseMidiBytesToTracks(midi);
    const noteTrack = parsed.tracks.find(function(t) { return t.notes && t.notes.length; });
    expect(noteTrack).toBeTruthy();
    expect(noteTrack.notes[0].startTick).toBe(480);
    expect(noteTrack.notes[0].start).toBeCloseTo(0.5, 4);
    expect(noteTrack.notes[0].end).toBeCloseTo(1.5, 4);
  });
});
