import {
  exportMinimalTimedLyrics,
  exportMinimalTimedChords,
  importMinimalTimedLyrics,
  importMinimalTimedChords,
} from './timedExportUtils';

describe('timedExportUtils', function() {
  test('exports minimal timed lyrics without word-level detail', function() {
    const minimal = exportMinimalTimedLyrics({
      version: 1,
      source: { backend: 'whisper' },
      lines: [{
        id: 'line-0',
        text: 'Hello world',
        start: 1,
        end: 2,
        words: [{ text: 'Hello', start: 1, end: 1.5 }],
      }],
      sections: [],
    });
    expect(minimal.v).toBe(1);
    expect(minimal.lines[0]).toEqual({ t: 'Hello world', s: 1, e: 2 });
    expect(minimal.lines[0].words).toBeUndefined();
  });

  test('exports minimal timed chords without backend metadata', function() {
    const minimal = exportMinimalTimedChords({
      version: 1,
      source: { backend: 'autochord' },
      meter: '4/4',
      beatTimes: [0, 0.5],
      segments: [{ start: 0, end: 1, label: 'C' }],
      backend: 'autochord',
    });
    expect(minimal.segments[0]).toEqual({ s: 0, e: 1, label: 'C' });
    expect(minimal.backend).toBeUndefined();
  });

  test('round-trips minimal timed lyrics', function() {
    const restored = importMinimalTimedLyrics({
      v: 1,
      lines: [{ t: 'Line one', s: 0, e: 1 }],
      sections: [{ id: 'section-0', startLine: 0, endLine: 0, label: 'Verse' }],
    });
    expect(restored.lines[0].text).toBe('Line one');
    expect(restored.sections[0].label).toBe('Verse');
  });

  test('round-trips minimal timed chords', function() {
    const restored = importMinimalTimedChords({
      v: 1,
      beatTimes: [0, 1],
      segments: [{ s: 0, e: 1, label: 'G' }],
      meter: '4/4',
    });
    expect(restored.segments[0].label).toBe('G');
    expect(restored.meter).toBe('4/4');
  });
});
