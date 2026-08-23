import {
  defaultVoiceFilters,
  duplicateVoice,
  mergeVoices,
} from './midiImportSession';
import { applyVoiceFilters } from './midiImportVoicePipeline';

describe('midiImportSession', function() {
  test('duplicateVoice adds copy', function() {
    const session = {
      voices: [{
        id: 'v1',
        displayName: 'Piano',
        sourceTrackIds: [0],
        isDrum: false,
        filters: defaultVoiceFilters(),
        grid: { tempoBpm: 120, timeSignature: '4/4', estimatedKey: 'C' },
      }],
    };
    const next = duplicateVoice(session, 'v1');
    expect(next.voices.length).toBe(2);
    expect(next.voices[1].displayName).toContain('copy');
  });

  test('mergeVoices rejects drum vs pitched', function() {
    const session = {
      midiBytes: new Uint8Array(0),
      profile: { tracks: [] },
      voices: [
        { id: 'v1', displayName: 'A', sourceTrackIds: [0], isDrum: false, filters: defaultVoiceFilters(), grid: {} },
        { id: 'v2', displayName: 'B', sourceTrackIds: [1], isDrum: true, filters: defaultVoiceFilters(), grid: {} },
      ],
    };
    const next = mergeVoices(session, 'v1', 'v2');
    expect(next.voices.length).toBe(2);
  });
});

describe('midiImportVoicePipeline', function() {
  test('applyVoiceFilters velocity range', function() {
    const notes = [
      { start: 0, end: 0.5, midi: 60, velocity: 10 },
      { start: 0.5, end: 1, midi: 62, velocity: 100 },
    ];
    const filters = defaultVoiceFilters();
    filters.velocityEnabled = true;
    filters.velocityMin = 50;
    filters.velocityMax = 127;
    const result = applyVoiceFilters(notes, filters, { tempoBpm: 120, timeSignature: '4/4' });
    expect(result.passing.length).toBe(1);
    expect(result.excluded.length).toBe(1);
  });

  test('filterInvert excludes matching', function() {
    const notes = [
      { start: 0, end: 0.5, midi: 60, velocity: 10 },
      { start: 0.5, end: 1, midi: 62, velocity: 100 },
    ];
    const filters = defaultVoiceFilters();
    filters.velocityEnabled = true;
    filters.velocityMin = 50;
    filters.filterInvert = true;
    const result = applyVoiceFilters(notes, filters, { tempoBpm: 120, timeSignature: '4/4' });
    expect(result.passing.length).toBe(1);
    expect(result.passing[0].velocity).toBe(10);
  });
});
