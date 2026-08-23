import { buildFileMetaFromBytes, formatMetaLine } from './midiImportMetaTimeline';

describe('midiImportMetaTimeline', function() {
  test('formatMetaLine formats tempo changes', function() {
    const line = formatMetaLine([
      { bpm: 120, bar: 0 },
      { bpm: 140, bar: 4 },
    ], 'bpm');
    expect(line).toContain('120');
    expect(line).toContain('bar 0');
    expect(line).toContain('140');
  });

  test('buildFileMetaFromBytes returns structure for minimal midi', function() {
    // Minimal valid SMF: header + empty track
    const bytes = new Uint8Array([
      0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01, 0x01, 0x80,
      0x4d, 0x54, 0x72, 0x6b, 0x00, 0x00, 0x00, 0x04, 0x00, 0xff, 0x2f, 0x00,
    ]);
    const meta = buildFileMetaFromBytes(bytes);
    expect(meta.ticksPerBeat).toBe(384);
    expect(Array.isArray(meta.tempoChanges)).toBe(true);
  });
});
